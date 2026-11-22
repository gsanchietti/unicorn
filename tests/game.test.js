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
  await hold(page, 1000);   // the scene fade (0.4 s out + 0.4 s in) ignores taps
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

// ---------------------------------------------------------------- scene split
// Review focus 1-4 of the fairy town plan: resize, multi-touch, fades.

const PORTRAIT = { width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function single(fn) {
  const g = await openGame(browser, { w: 390, h: 844, url: server.url });
  try { await fn(g); assert.deepStrictEqual(g.errors, []); }
  finally { await g.ctx.close(); }
}

const heroY = (page) => ev(page, () => ({ y: window.__bella.stars.st.hero.y, h: innerHeight }));

test('resize mid-game and mid-fade keeps hero on screen', () => single(async (g) => {
  const { page } = g;
  await play(g);
  await waitFor(page, () => window.__bella.stars.st.mode === 'fly');
  await page.setViewport(LANDSCAPE);
  await hold(page, 400);
  let r = await heroY(page);
  assert.ok(r.y >= 0 && r.y <= r.h, 'after turning: y ' + r.y + ' in [0, ' + r.h + ']');
  await page.click('#home');
  await page.setViewport(PORTRAIT);
  await hold(page, 1000);
  r = await heroY(page);
  assert.ok(r.y >= 0 && r.y <= r.h, 'after home: y ' + r.y + ' in [0, ' + r.h + ']');
  assert.strictEqual(await scene(page), 'title');
}));

test('two pointers released in any order clear hold', () => single(async (g) => {
  const { page } = g;
  const cdp = await page.createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await play(g);
  await waitFor(page, () => window.__bella.stars.st.mode === 'fly');
  const a = { x: 150, y: 500, id: 1 }, b = { x: 250, y: 600, id: 2 };
  for (const [first, second] of [[a, b], [b, a]]) {
    await touch('touchStart', [a, b]);
    await hold(page, 500);
    assert.strictEqual(await ev(page, () => window.__bella.stars.st.held), true, 'held with two fingers');
    await touch('touchMove', [second]);          // lifts `first`, `second` stays down
    await hold(page, 150);
    assert.strictEqual(await ev(page, () => window.__bella.stars.st.held), true, 'still held by finger ' + second.id);
    await touch('touchEnd', []);                 // lifts `second`
    await hold(page, 50);
    assert.strictEqual(await ev(page, () => window.__bella.stars.st.held), false, 'released ' + first.id + ' then ' + second.id);
    // Momentum keeps the hero rising briefly, so compare with the apex.
    let apex = (await heroY(page)).y;
    for (let i = 0; i < 9; i++) { await hold(page, 100); apex = Math.min(apex, (await heroY(page)).y); }
    const end = (await heroY(page)).y;
    assert.ok(end > apex, 'floats down from apex ' + apex + ' -> ' + end);
  }
}));

test('double tap during fade enters scene once', async () => {
  const g = await openGame(browser, { w: 390, h: 844, url: server.url });
  try {
    const { page } = g;
    // Count stars.enter() calls by wrapping Core.register before the scenes load.
    await page.evaluateOnNewDocument(() => {
      window.__enters = 0;
      let core;
      Object.defineProperty(window, 'Core', {
        configurable: true,
        get() { return core; },
        set(v) {
          const reg = v.register;
          v.register = function (name, sc) {
            if (name === 'stars') {
              const en = sc.enter;
              sc.enter = function () { window.__enters++; return en.apply(this, arguments); };
            }
            return reg.apply(this, arguments);
          };
          core = v;
        }
      });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
    await tapPlay(page);
    await hold(page, 100);
    await tapPlay(page);
    await hold(page, 1500);
    assert.strictEqual(await ev(page, () => window.__enters), 1);
    assert.strictEqual(await scene(page), 'stars');
    await page.click('#home');
    await hold(page, 100);
    await page.click('#home');
    await hold(page, 1500);
    assert.strictEqual(await scene(page), 'title');
    assert.strictEqual(await ev(page, () => window.__enters), 1);
    assert.deepStrictEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('hidden during fade resumes cleanly', () => single(async (g) => {
  const { page } = g;
  await play(g);
  await ev(page, () => {
    window.__resumes = 0;
    const r = window.Sound.resume;
    window.Sound.resume = function () { window.__resumes++; return r.apply(this, arguments); };
  });
  const setHidden = (h) => ev(page, (hh) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hh });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  await page.click('#home');
  await setHidden(true);
  await hold(page, 300);
  await setHidden(false);
  await waitFor(page, () => window.__bella.scene() === 'title', 2000);
  assert.strictEqual(await ev(page, () => window.__resumes), 1, 'audio resumed');
}));
