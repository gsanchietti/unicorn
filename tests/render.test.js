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
  await ev(page, () => {                    // it no longer homes in: keep it level with Bella
    const st = window.__bella.stars.st;
    const id = setInterval(() => { if (st.mud) st.mud.y = st.hero.y; else clearInterval(id); }, 16);
  });
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

// Character sheet: every pose of Bella and Bongo side by side, at 300 px and at
// 900 px tall, on the wall color. Also checks the cost of Characters.draw.
const POSES = [
  { name: 'standing', pose: { t: 0.5, run: 0, face: 0 } },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ name: 'gallop ' + i, pose: { t: 20 + i / 12, run: 1, face: 0 } })),
  { name: 'Bongo front', pose: { t: 0.5, run: 0, face: 1 } },
  { name: 'Bongo profile', pose: { t: 3.1, run: 0.4, face: 0, look: 1 } },
  { name: 'happy', pose: { t: 0.5, run: 0, happy: 1, wave: 1, glow: 1 } }
];

test('character sheet, and Characters.draw under 1 ms', () => open(390, 844, async (page) => {
  // Cost first: 500 draws at the flying scale of this phone, legs galloping.
  // 5 draws per animation frame: in one tight loop Chrome stops to paint its
  // growing backlog inside the timed calls, which a game frame never does.
  const cost = await ev(page, () => new Promise((done) => {
    const C = window.Characters, dpr = Math.min(2, window.devicePixelRatio || 1);
    const ppu = Math.min(innerHeight * 0.42, innerWidth * 0.52) / C.H * dpr;   // S.ppuFly in js/scenes/stars.js
    const c = document.createElement('canvas');
    c.width = Math.ceil(C.W * ppu); c.height = Math.ceil(C.H * ppu);
    const g = c.getContext('2d');
    const pose = { t: 0, run: 1, wave: 0, happy: 0, look: 0, glow: 0.5 };
    const N = 500, PER = 5, WARM = 20;
    let i = -WARM, sum = 0;
    (function tick() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.setTransform(ppu, 0, 0, ppu, 0, 0);
      const t0 = performance.now();
      for (let k = 0; k < PER; k++, i++) {
        pose.t = 1 + i / 60; pose.glow = ((i + 40) % 40) / 40; pose.happy = (i + 100) % 100 < 10 ? 1 : 0;
        C.draw(g, pose, ppu);
      }
      if (i > 0) sum += performance.now() - t0;
      if (i >= N) done({ ppu, ms: sum / N }); else requestAnimationFrame(tick);
    })();
  }));
  console.log('Characters.draw ms/call @ppu ' + cost.ppu.toFixed(3) + ':', cost.ms.toFixed(3));
  fs.writeFileSync(path.join(OUT, 'characters-cost.json'), JSON.stringify(cost, null, 2) + '\n');

  const url = await ev(page, (poses) => {
    const C = window.Characters, small = 300, big = 900, perRow = 5;
    const cw = (h) => Math.ceil(h * C.W / C.H);
    const c = document.createElement('canvas');
    c.width = Math.max(cw(small) * poses.length, cw(big) * perRow);
    c.height = small + big * Math.ceil(poses.length / perRow);
    const g = c.getContext('2d');
    g.fillStyle = '#f7f1e6';
    g.fillRect(0, 0, c.width, c.height);
    const put = (pose, x, y, h) => {
      const ppu = h / C.H;
      g.save(); g.translate(x, y); g.scale(ppu, ppu); C.draw(g, pose, ppu); g.restore();
    };
    poses.forEach((p, i) => put(p.pose, i * cw(small), 0, small));
    poses.forEach((p, i) => put(p.pose, (i % perRow) * cw(big), small + Math.floor(i / perRow) * big, big));
    return c.toDataURL('image/png');
  }, POSES);
  fs.writeFileSync(path.join(OUT, 'characters.png'), Buffer.from(url.split(',')[1], 'base64'));

  assert.ok(cost.ms > 0, 'the draw cost measured nothing');
  assert.ok(cost.ms < 1, 'Characters.draw ' + cost.ms.toFixed(3) + ' ms >= 1 ms');
}));
