'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { startServer, launch, openGame, scene, tapPlay, playStars, hold } = require('./helpers');

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

// Tap play and wait out the fade (the start page leads to the street).
async function play(g) {
  await tapPlay(g.page);
  await hold(g.page, 1500);
}

each('start page ignores taps away from play', async ({ page }, s) => {
  await page.mouse.click(0.15 * s.w, 0.9 * s.h);
  await hold(page, 500);
  assert.strictEqual(await scene(page), 'title');
});

each('play goes to the street', async ({ page }) => {
  await tapPlay(page);
  await waitFor(page, () => window.__bella.scene() === 'street');
  const vis = await ev(page, () => { const s = getComputedStyle(document.getElementById('home')); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; });
  assert.strictEqual(vis, true, '#home visible');
  await hold(page, 500);                    // the fade in ignores the home button
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'title');
});

each('hold rises, release floats down', async ({ page }, s) => {
  await playStars(page);
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
  await playStars(page);
  await ev(page, () => { window.__bella.stars.st.sinceWash = 15; });
  await waitFor(page, () => !!window.__bella.stars.st.mud);
  // the cloud no longer homes in: keep it level with Bella until it touches her
  await ev(page, () => {
    const st = window.__bella.stars.st;
    const id = setInterval(() => { if (st.mud) st.mud.y = st.hero.y; else clearInterval(id); }, 16);
  });
  await waitFor(page, () => window.__bella.stars.st.mode === 'wash', 8000);
  const before = await ev(page, () => window.__bella.stars.st.score);
  await ev(page, () => window.__bella.stars.cleanAll());
  await waitFor(page, () => window.__bella.stars.st.mode === 'fly', 8000);
  const after = await ev(page, () => window.__bella.stars.st.score);
  assert.strictEqual(after - before, 5);
});

each('level rises every 10 stars and speed is capped', async ({ page }) => {
  await playStars(page);
  const L = () => ev(page, () => [window.__bella.stars.st.level, window.__bella.stars.speedK()]);
  assert.deepStrictEqual(await L(), [1, 1]);
  await ev(page, () => window.__bella.stars.addPoints(9));
  assert.deepStrictEqual(await L(), [1, 1]);
  await ev(page, () => window.__bella.stars.addPoints(5));       // 14: crosses 10 like the wash bonus
  const [l2, k2] = await L();
  assert.strictEqual(l2, 2); assert.ok(Math.abs(k2 - 1.1) < 1e-9, String(k2));
  await ev(page, () => window.__bella.stars.addPoints(200));
  const [l3, k3] = await L();
  assert.strictEqual(l3, 22); assert.strictEqual(k3, 1.8);
});

const innerHeightTol = (s) => s.h * 0.03;   // the gentle bob only
each('mud cloud can be avoided', async ({ page }, s) => {
  await playStars(page);
  await page.mouse.move(s.w / 2, s.h / 2); await page.mouse.down();     // hold: Bella goes to the top
  await hold(page, 1200);
  await ev(page, () => { window.__bella.stars.st.sinceWash = 15; });
  await waitFor(page, () => !!window.__bella.stars.st.mud);
  await ev(page, () => { const st = window.__bella.stars.st; st.mud.y = innerHeight * 0.75; st.stars.length = 0; });   // far below her
  const y0 = await ev(page, () => window.__bella.stars.st.mud.y);
  await hold(page, 300);
  assert.ok(Math.abs(await ev(page, () => window.__bella.stars.st.mud.y) - y0) < innerHeightTol(s), 'no homing');
  await waitFor(page, () => !window.__bella.stars.st.mud, 15000);
  await page.mouse.up();
  const r = await ev(page, () => { const st = window.__bella.stars.st; return { mode: st.mode, since: st.sinceWash, dirty: !!st.splotches }; });
  assert.strictEqual(r.mode, 'fly'); assert.strictEqual(r.dirty, false); assert.strictEqual(r.since, 10);
});

each('new game starts at level 1 without mud', async ({ page }) => {
  await playStars(page);
  await ev(page, () => { window.__bella.stars.addPoints(30); window.__bella.stars.st.sinceWash = 15; });
  await waitFor(page, () => !!window.__bella.stars.st.mud);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  await hold(page, 500);
  await ev(page, () => window.__bella.street.enter('gate'));
  await waitFor(page, () => window.__bella.scene() === 'stars');
  const r = await ev(page, () => ({ level: window.__bella.stars.st.level, mud: window.__bella.stars.st.mud }));
  assert.deepStrictEqual(r, { level: 1, mud: null });
});

each('milestone at 10 shows rainbow', async ({ page }) => {
  await playStars(page);
  await ev(page, () => window.__bella.stars.addPoints(10));
  assert.ok(await ev(page, () => window.__bella.stars.st.rainbow) != null);
});

each('home returns to start, play again works', async ({ page }) => {
  await playStars(page);
  await page.click('#home');
  await hold(page, 1000);   // the scene fade (0.4 s out + 0.4 s in) ignores taps
  assert.strictEqual(await scene(page), 'street');
  await page.click('#home');
  await hold(page, 1000);
  assert.strictEqual(await scene(page), 'title');
  const vis = await ev(page, () => { const s = getComputedStyle(document.getElementById('home')); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; });
  assert.strictEqual(vis, false, '#home hidden');
  await tapPlay(page);
  await hold(page, 1500);
  assert.strictEqual(await scene(page), 'street');
});

each('best score saved, old key read', async (g) => {
  const { page } = g;
  await ev(page, () => { localStorage.removeItem('bella.best'); localStorage.setItem('stella.best', '42'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
  assert.strictEqual(await ev(page, () => window.__bella.stars.st.best), 42);
  await playStars(page);
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
  await playStars(page);
  await page.setViewport(LANDSCAPE);
  await hold(page, 400);
  let r = await heroY(page);
  assert.ok(r.y >= 0 && r.y <= r.h, 'after turning: y ' + r.y + ' in [0, ' + r.h + ']');
  await page.click('#home');
  await page.setViewport(PORTRAIT);
  await hold(page, 1000);
  r = await heroY(page);
  assert.ok(r.y >= 0 && r.y <= r.h, 'after home: y ' + r.y + ' in [0, ' + r.h + ']');
  assert.strictEqual(await scene(page), 'street');
}));

test('two pointers released in any order clear hold', () => single(async (g) => {
  const { page } = g;
  const cdp = await page.createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await playStars(page);
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
    // Count enter() calls per scene by wrapping Core.register before the scenes load.
    await page.evaluateOnNewDocument(() => {
      window.__enters = {};
      let core;
      Object.defineProperty(window, 'Core', {
        configurable: true,
        get() { return core; },
        set(v) {
          const reg = v.register;
          v.register = function (name, sc) {
            const en = sc.enter;
            window.__enters[name] = 0;
            sc.enter = function () { window.__enters[name]++; return en.apply(this, arguments); };
            return reg.apply(this, arguments);
          };
          core = v;
        }
      });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
    const enters = () => ev(page, () => window.__enters);
    await tapPlay(page);
    await hold(page, 100);
    await tapPlay(page);
    await hold(page, 1500);
    assert.strictEqual(await scene(page), 'street');
    assert.strictEqual((await enters()).street, 1);
    await ev(page, () => window.__bella.street.enter('gate'));
    await waitFor(page, () => window.__bella.scene() === 'stars');
    await hold(page, 500);
    await page.click('#home');
    await hold(page, 100);
    await page.click('#home');
    await hold(page, 1500);
    assert.strictEqual(await scene(page), 'street');
    const n = await enters();
    assert.strictEqual(n.stars, 1);
    assert.strictEqual(n.street, 2);
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

// ---------------------------------------------------------------- the street
// Review focus of the fairy town step 2 plan: two fingers, resize mid-walk,
// double taps, private mode, the ends of the world.

async function toStreet(page) {
  await tapPlay(page);
  await waitFor(page, () => window.__bella.scene() === 'street');
  await hold(page, 500);                    // the fade in ignores taps
}
const streetSt = (page) => ev(page, () => {
  const b = window.__bella.street;
  return { x: b.st.x, camX: b.st.camX, walking: b.st.walking, dir: b.st.dir, ww: b.worldW(), W: innerWidth };
});
const gateOf = (page) => ev(page, () => window.__bella.street.places().find((p) => p.kind === 'gate'));
// The camera has caught up with Bella.
const camSettled = (page) => waitFor(page, () => {
  const b = window.__bella.street, s = b.st, ww = b.worldW();
  const goal = Math.min(Math.max(s.x - innerWidth / 2, 0), ww - innerWidth);
  return Math.abs(s.camX - goal) < 1;
});
// Pan: if the gate is off screen, put Bella next to it and let the camera follow.
async function gateOnScreen(page) {
  await ev(page, () => {
    const b = window.__bella.street, g = b.places().find((p) => p.kind === 'gate');
    if (g.sx - g.r < 0 || g.sx + g.r > innerWidth) b.st.x = g.x - innerWidth * 0.2;
  });
  await camSettled(page);
  const g = await gateOf(page);
  assert.ok(g.sx > 0 && g.sx < (await streetSt(page)).W, 'gate on screen: ' + JSON.stringify(g));
  return g;
}

each('hold right trots right, hold left trots left, release stops', async ({ page }, s) => {
  await toStreet(page);
  for (const [fx, sign] of [[0.85, 1], [0.15, -1]]) {
    const x0 = (await streetSt(page)).x;
    await page.mouse.move(fx * s.w, 0.5 * s.h);
    await page.mouse.down();
    await hold(page, 800);
    const r = await streetSt(page);
    assert.ok(sign * (r.x - x0) > 0, 'side ' + fx + ': x ' + x0 + ' -> ' + r.x);
    assert.strictEqual(r.walking, true, 'walking while held');
    await page.mouse.up();
    await hold(page, 400);
    const a = await streetSt(page);
    assert.strictEqual(a.walking, false, 'stopped after release');
    await hold(page, 300);
    const b = await streetSt(page);
    assert.ok(Math.abs(b.x - a.x) <= 1, 'stays put: ' + a.x + ' -> ' + b.x);
  }
});

each('tap the sky gate: walks there and enters the star game', async ({ page }) => {
  await toStreet(page);
  const g = await gateOnScreen(page);
  await page.mouse.click(g.sx, g.sy);
  await waitFor(page, () => window.__bella.scene() === 'stars', 10000);
  await waitFor(page, () => window.__bella.stars.st.mode === 'fly', 10000);
});

each('home from the star game lands by the sky gate', async ({ page }) => {
  await playStars(page);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  const s = await streetSt(page), g = await gateOf(page);
  assert.ok(Math.abs(s.x - g.x) < 0.05 * s.ww, 'x ' + s.x + ' gate ' + g.x);
});

each('home goes back one level', async ({ page }) => {
  await playStars(page);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  await hold(page, 500);                    // a home press during the fade is dropped
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'title');
});

test('stars add to the jar total, seeded from best', () => single(async ({ page }) => {
  await ev(page, () => { localStorage.setItem('bella.best', '23'); localStorage.removeItem('bella.stars'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
  assert.strictEqual(await ev(page, () => window.Core.stars()), 23);
  await playStars(page);
  await ev(page, () => window.__bella.stars.addPoints(5));
  assert.strictEqual(await ev(page, () => localStorage.getItem('bella.stars')), '28');
}));

each('tap the jar: it jiggles and shows the total', async ({ page }) => {
  await toStreet(page);
  await ev(page, () => window.__bella.street.enter('square'));
  await waitFor(page, () => window.__bella.street.st.jarShow > 0 && window.__bella.street.st.jiggle > 0, 10000);
});

each('tap a place while holding cancels the hold walk', async ({ page }, s) => {
  await toStreet(page);
  await gateOnScreen(page);
  const cdp = await page.createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const a = { x: 0.1 * s.w, y: 0.3 * s.h, id: 1 };
  await touch('touchStart', [a]);           // finger 1 holds the left half
  await hold(page, 300);
  let r = await streetSt(page);
  assert.deepStrictEqual([r.walking, r.dir], [true, -1], 'trots left');
  const g = await gateOf(page);
  const b = { x: g.sx, y: g.sy, id: 2 };
  await touch('touchStart', [a, b]);        // finger 2 taps the gate
  await hold(page, 80);
  await touch('touchMove', [a]);            // finger 2 lifts, finger 1 stays down
  await hold(page, 250);
  r = await streetSt(page);
  assert.strictEqual(r.dir, 1, 'turned toward the gate');
  await waitFor(page, () => window.__bella.scene() === 'stars', 10000);
  await touch('touchEnd', []);
  await hold(page, 100);
  assert.strictEqual((await streetSt(page)).walking, false, 'nothing keeps walking');
});

test('resize mid-walk keeps Bella in the world and on screen', () => single(async ({ page }) => {
  const inside = async (what) => {
    const r = await streetSt(page);
    assert.ok(r.x >= 0 && r.x <= r.ww, what + ': x ' + r.x + ' in [0, ' + r.ww + ']');
    assert.ok(r.x - r.camX >= 0 && r.x - r.camX <= r.W, what + ': screen x ' + (r.x - r.camX) + ' in [0, ' + r.W + ']');
  };
  await toStreet(page);
  await page.mouse.move(0.85 * 390, 0.5 * 844);
  await page.mouse.down();
  await hold(page, 500);
  await page.setViewport(LANDSCAPE);
  await hold(page, 600);
  await inside('turned while held');
  await page.mouse.up();
  await hold(page, 400);
  await inside('released');
  // The target place is still reached after a resize on the way.
  await ev(page, () => window.__bella.street.enter('square'));
  await hold(page, 300);
  await page.setViewport(PORTRAIT);
  await waitFor(page, () => window.__bella.street.st.jarShow > 0, 10000);
  await inside('at the jar');
}));

each('double tap on the gate enters the star game once', async ({ page }) => {
  await toStreet(page);
  const g = await gateOnScreen(page);
  await page.mouse.click(g.sx, g.sy);
  await hold(page, 80);
  await page.mouse.click(g.sx, g.sy);
  await waitFor(page, () => window.__bella.scene() === 'stars' && window.__bella.stars.st.mode === 'fly', 10000);
  await hold(page, 500);
  assert.strictEqual(await ev(page, () => window.__bella.stars.enters), 1);
});

for (const s of SIZES) {
  test('star total works when localStorage throws [' + s.name + ']', async () => {
    const g = await openGame(browser, { w: s.w, h: s.h, url: server.url });
    try {
      const { page } = g;
      await page.evaluateOnNewDocument(() => {
        Storage.prototype.getItem = function () { throw new Error('private mode'); };
        Storage.prototype.setItem = function () { throw new Error('private mode'); };
      });
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
      const n0 = await ev(page, () => window.Core.stars());
      await playStars(page);
      await ev(page, () => window.__bella.stars.addPoints(3));
      assert.strictEqual(await ev(page, () => window.Core.stars()), n0 + 3);
      await ev(page, () => window.__bella.goHome());
      await waitFor(page, () => window.__bella.scene() === 'street');
      await ev(page, () => window.__bella.street.enter('square'));
      await waitFor(page, () => window.__bella.street.st.jarShow > 0, 10000);
      assert.deepStrictEqual(g.errors, []);
    } finally { await g.ctx.close(); }
  });
}

each('world ends stop Bella and the camera', async ({ page }, s) => {
  await toStreet(page);
  for (const [frac, fx] of [[0.93, 0.85], [0.07, 0.15]]) {
    await ev(page, (f) => { const b = window.__bella.street; b.st.x = b.worldW() * f; }, frac);
    await camSettled(page);
    await page.mouse.move(fx * s.w, 0.5 * s.h);
    await page.mouse.down();
    await hold(page, 1000);
    const r = await streetSt(page);
    await page.mouse.up();
    if (fx > 0.5) {
      assert.ok(r.x <= 0.96 * r.ww + 1, 'right end: x ' + r.x + ' / ' + r.ww);
      assert.ok(r.x >= 0.96 * r.ww - 1, 'reached the right end: x ' + r.x + ' / ' + r.ww);
      assert.ok(r.camX <= r.ww - r.W + 1, 'right camera ' + r.camX);
    } else {
      assert.ok(r.x >= 0.04 * r.ww - 1, 'left end: x ' + r.x + ' / ' + r.ww);
      assert.ok(r.x <= 0.04 * r.ww + 1, 'reached the left end: x ' + r.x + ' / ' + r.ww);
      assert.ok(r.camX >= -1, 'left camera ' + r.camX);
    }
    await hold(page, 300);
  }
});

// ---------------------------------------------------------------- preview next to the live game
// The live game (main) and the preview (main's next/) share one origin. Each must keep
// its own service worker and cache, and the preview must not touch the live save data.
// The folder is the `main` worktree (override with MAIN_WORKTREE) with next/ inside.

const MAIN_DIR = process.env.MAIN_WORKTREE || path.resolve(__dirname, '..', '.worktrees', 'main');

test('live game and preview stay separate', async (t) => {
  if (!require('fs').existsSync(path.join(MAIN_DIR, 'index.html'))) {
    t.skip('main worktree not found at ' + MAIN_DIR + ' (git worktree add .worktrees/main main, or set MAIN_WORKTREE)');
    return;
  }
  const srv = await startServer(MAIN_DIR);
  // openGame() waits for the new __bella.scene, which the live game lacks, so open the page by hand.
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const g = { page, ctx, errors: [] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') g.errors.push('console.' + m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => g.errors.push('pageerror: ' + e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const ready = async () => {
    await ev(page, () => navigator.serviceWorker.ready.then(() => true));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella, { timeout: 3000 });
  };
  const swUrl = () => ev(page, () => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
  try {
    // Live game at /.
    await page.goto(srv.url, { waitUntil: 'load' });
    await ready();
    assert.ok((await swUrl() || '').endsWith('/sw.js') && !(await swUrl()).includes('/next/'), 'live sw: ' + await swUrl());
    assert.strictEqual(await ev(page, () => typeof window.Core), 'undefined', 'live game has no Core');
    assert.ok(await ev(page, () => !!window.__bella.st), 'live game has __bella.st');
    await ev(page, () => localStorage.setItem('bella.best', '77'));

    // Preview at /next/.
    await page.goto(srv.url + 'next/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
    await ready();
    await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
    assert.ok((await swUrl() || '').endsWith('/next/sw.js'), 'preview sw: ' + await swUrl());
    assert.strictEqual(await ev(page, () => typeof window.Core), 'object', 'preview has Core');
    await play(g);
    await ev(page, () => window.__bella.stars.addPoints(5));

    // Both caches exist (their names are read from the two sw.js files).
    const swVersion = (f) => /VERSION = '([^']+)'/.exec(require('fs').readFileSync(path.join(MAIN_DIR, f), 'utf8'))[1];
    const keys = await ev(page, () => caches.keys());
    assert.ok(keys.includes(swVersion('sw.js')) && keys.includes(swVersion('next/sw.js')), 'caches: ' + keys);

    // Shared localStorage: the preview must not reset the live best score.
    assert.strictEqual(await ev(page, () => localStorage.getItem('bella.best')), '77');

    // Offline: both still reload.
    await page.setOfflineMode(true);
    await page.goto(srv.url + 'next/', { waitUntil: 'load' });
    assert.strictEqual(await ev(page, () => typeof window.Characters), 'object', 'preview offline');
    assert.strictEqual(await ev(page, () => typeof window.Core), 'object');
    await page.goto(srv.url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella, { timeout: 3000 });
    assert.strictEqual(await ev(page, () => typeof window.Core), 'undefined', 'live offline still old game');
    assert.ok(await ev(page, () => !!window.__bella.st));
    assert.strictEqual(await ev(page, () => localStorage.getItem('bella.best')), '77');
    assert.deepStrictEqual(g.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)), []);
  } finally { await g.ctx.close(); await srv.close(); }
});
