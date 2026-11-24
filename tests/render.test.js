'use strict';
// Render review: saves screenshots of every look to tests/out/ (git-ignored) and
// checks the render budget (average canvas render cost per frame on a phone).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer, launch, openGame, scene, tapPlay, hold } = require('./helpers');

const OUT = process.env.RENDER_OUT || path.join(__dirname, 'out');
const BUDGET_MS = 8;
let server, browser;
before(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  server = await startServer(path.resolve(__dirname, '..'));
  browser = await launch();
});
after(async () => { if (browser) await browser.close(); if (server) await server.close(); });

const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
// Wait for n animation frames, so frameMs() averages only frames of the current look.
const frames = (page, n) => page.evaluate((n) => new Promise((done) => {
  let i = 0;
  (function tick() { if (++i >= n) done(); else requestAnimationFrame(tick); })();
}), n);

async function open(w, h, fn) {
  const g = await openGame(browser, { w, h, url: server.url });
  try { await fn(g.page); assert.deepStrictEqual(g.errors, []); }
  finally { await g.ctx.close(); }
}

async function startFlying(page) {
  await tapPlay(page);
  await page.waitForFunction(() => window.__bella.stars.st.mode === 'fly', { timeout: 8000, polling: 50 });
}

for (const s of [
  { name: 'start-phone-portrait', w: 390, h: 844 },
  { name: 'start-phone-landscape', w: 844, h: 390 },
  { name: 'start-tablet', w: 1024, h: 768 }
]) {
  test('start page ' + s.name, () => open(s.w, s.h, async (page) => {
    await ev(page, () => { try { localStorage.setItem('bella.best', '23'); } catch (e) { /* ignore */ } });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella && window.__bella.scene);
    await hold(page, 900);
    assert.strictEqual(await scene(page), 'title');
    await shot(page, s.name);
  }));
}

test('flying in day, sunset and night, within the render budget', () => open(390, 844, async (page) => {
  await startFlying(page);
  const cost = {};
  for (const phase of ['day', 'sunset', 'night']) {
    await ev(page, (p) => window.__bella.setTime(p), phase);
    await hold(page, 2600);                 // stars and clouds on screen
    await frames(page, 125);
    cost[phase] = await ev(page, () => window.__bella.frameMs());
    await ev(page, (p) => window.__bella.setTime(p), phase);   // the clock ran on: back to mid-phase
    await frames(page, 3);
    await shot(page, 'fly-' + phase);
  }
  console.log('render ms/frame @390x844 DPR2:', JSON.stringify(cost));
  fs.writeFileSync(path.join(OUT, 'render-cost.json'), JSON.stringify(cost, null, 2) + '\n');
  for (const phase in cost) {
    assert.ok(cost[phase] > 0, phase + ': frameMs() measured nothing');
    assert.ok(cost[phase] < BUDGET_MS, phase + ' render ' + cost[phase].toFixed(2) + ' ms >= ' + BUDGET_MS + ' ms');
  }
}));

test('flying, phone landscape', () => open(844, 390, async (page) => {
  await startFlying(page);
  await hold(page, 3000);
  await shot(page, 'fly-landscape-day');
  await ev(page, () => window.__bella.setTime('night'));
  await hold(page, 800);
  await shot(page, 'fly-landscape-night');
}));

test('wash', () => open(390, 844, async (page) => {
  await startFlying(page);
  await ev(page, () => { window.__bella.stars.st.sinceWash = 15; });
  await page.waitForFunction(() => {
    const m = window.__bella.stars.st.mud;
    return !!m && m.x < innerWidth * 0.8;         // the mud cloud has flown into view
  }, { timeout: 8000, polling: 30 });
  await shot(page, 'mud-cloud');
  await page.waitForFunction(() => window.__bella.stars.st.mode === 'wash', { timeout: 12000, polling: 50 });
  await hold(page, 2200);                   // the sponge hint is up
  await shot(page, 'wash');
  // rub a little so soap bubbles show
  await page.mouse.move(150, 420); await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(150 + i * 9, 420 + (i % 2) * 30);
  await shot(page, 'wash-bubbles');
  await page.mouse.up();
}));

test('milestone', () => open(390, 844, async (page) => {
  await startFlying(page);
  await ev(page, () => window.__bella.stars.addPoints(24));
  await hold(page, 400);
  await ev(page, () => window.__bella.stars.addPoints(1));
  await hold(page, 1900);                   // rainbow swept in, confetti falling
  await shot(page, 'milestone');
}));
