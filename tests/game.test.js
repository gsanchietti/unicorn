'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { startServer, launch, openGame, scene, tapPlay, hold } = require('./helpers');

const SIZES = [{ name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 844, h: 390 }];
let server, browser;
before(async () => { server = await startServer(path.resolve(__dirname, '..')); browser = await launch(); });
after(async () => { if (browser) await browser.close(); if (server) await server.close(); });

const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const waitFor = (page, fn, timeout, ...a) => page.waitForFunction(fn, { timeout: timeout || 8000, polling: 50 }, ...a);

function each(name, fn) {
  for (const s of SIZES) {
    test(name + ' [' + s.name + ']', async () => {
      const g = await openGame(browser, { w: s.w, h: s.h, url: server.url });
      try { await fn(g, s); assert.deepStrictEqual(g.errors, []); }
      finally { await g.ctx.close(); }
    });
  }
}

async function play(g) {
  await tapPlay(g.page);
  await hold(g.page, 1500);
}

each('start page ignores taps away from play', async ({ page }, s) => {
  await page.mouse.click(0.15 * s.w, 0.9 * s.h);
  await hold(page, 500);
  assert.strictEqual(await scene(page), 'title');
});

each('play starts the star game', async (g) => {
  await play(g);
  assert.strictEqual(await scene(g.page), 'stars');
  const mode = await ev(g.page, () => window.__bella.stars.st.mode);
  assert.ok(mode === 'toFly' || mode === 'fly', mode);
});

each('hold rises, release floats down', async ({ page }, s) => {
  await play({ page });
  const y = () => ev(page, () => window.__bella.stars.st.hero.y);
  const y0 = await y();
  await page.mouse.move(s.w / 2, s.h / 2);
  await page.mouse.down();
  await hold(page, 700);
  const y1 = await y();
  assert.ok(y1 < y0, 'rises ' + y0 + ' -> ' + y1);
  await page.mouse.up();
  // Momentum keeps the hero rising for a moment after release, so track the apex.
  let apex = y1;
  for (let i = 0; i < 15; i++) { await hold(page, 100); apex = Math.min(apex, await y()); }
  const y2 = await y();
  assert.ok(y2 > apex, 'floats down from apex ' + apex + ' -> ' + y2);
});

each('mud, wash, clean gives +5', async ({ page }) => {
  await play({ page });
  await ev(page, () => { window.__bella.stars.st.sinceWash = 15; });
  await waitFor(page, () => window.__bella.stars.st.mode === 'wash', 8000);
  const before = await ev(page, () => window.__bella.stars.st.score);
  await ev(page, () => window.__bella.stars.cleanAll());
  await waitFor(page, () => window.__bella.stars.st.mode === 'fly', 8000);
  const after = await ev(page, () => window.__bella.stars.st.score);
  assert.strictEqual(after - before, 5);
});

each('milestone at 10 shows rainbow', async ({ page }) => {
  await play({ page });
  await ev(page, () => window.__bella.stars.addPoints(10));
  assert.ok(await ev(page, () => window.__bella.stars.st.rainbow) != null);
});

each('home returns to start, play again works', async ({ page }) => {
  await play({ page });
  await page.click('#home');
  await hold(page, 500);
  assert.strictEqual(await scene(page), 'title');
  const vis = await ev(page, () => { const s = getComputedStyle(document.getElementById('home')); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; });
  assert.strictEqual(vis, false, '#home hidden');
  await tapPlay(page);
  await hold(page, 1500);
  assert.strictEqual(await scene(page), 'stars');
});

each('best score saved, old key read', async (g) => {
  const { page } = g;
  await ev(page, () => { localStorage.removeItem('bella.best'); localStorage.setItem('stella.best', '42'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
  assert.strictEqual(await ev(page, () => window.__bella.stars.st.best), 42);
  await play(g);
  await ev(page, () => window.__bella.stars.addPoints(45));
  assert.strictEqual(await ev(page, () => localStorage.getItem('bella.best')), '45');
});

each('mute persists', async ({ page }) => {
  await page.click('#mute');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
  assert.strictEqual(await ev(page, () => document.getElementById('mute').getAttribute('aria-pressed')), 'true');
});

test('offline reload works', async () => {
  const g = await openGame(browser, { w: 390, h: 844, url: server.url });
  try {
    await ev(g.page, () => navigator.serviceWorker.ready.then(() => true));
    await g.page.reload({ waitUntil: 'load' });
    await g.page.setOfflineMode(true);
    await g.page.reload({ waitUntil: 'load' });
    assert.strictEqual(await ev(g.page, () => typeof window.Characters), 'object');
    assert.deepStrictEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});
