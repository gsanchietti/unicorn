'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { startServer, launch, openGame, scene, tapPlay, playStars, playBakery, playPond, hold } = require('./helpers');

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

// ---------------------------------------------------------------- the star jar
// Step 5 of the fairy town plan: a Matter.js jar where every earned star drops in.
const jarOf = (page) => ev(page, () => window.__bella.street.jar());
const bigOf = (j) => j.bodies.filter((b) => b.big).length;
const insideJar = (j) => j.bodies.every((b) => b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1);
async function streetWithTotal(page, n) {
  await ev(page, (n) => localStorage.setItem('bella.stars', String(n)), n);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
  await toStreet(page);
}
// Back from the star game with n new stars.
async function homeWithStars(page, n) {
  await ev(page, (n) => window.__bella.stars.addPoints(n), n);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
}

test('the jar fills from the total', () => single(async ({ page }) => {
  await streetWithTotal(page, 37);
  const j = await jarOf(page);
  assert.ok(j.count >= 4 && j.count <= 60, 'count ' + j.count);
  assert.strictEqual(bigOf(j), 3);
  assert.ok(insideJar(j), 'inside: ' + JSON.stringify(j.bodies));
}));

test('stars from a game drop into the jar', () => single(async ({ page }) => {
  await playStars(page);                    // the street was shown on the way
  const n0 = (await jarOf(page)).count;
  await homeWithStars(page, 4);
  assert.ok(await ev(page, () => window.__bella.street.st.jarPop > 0), 'the jar pops up');
  await waitFor(page, (n) => window.__bella.street.jar().count === n + 4, 3000, n0);
}));

each('the after-game jar is big and central, then leaves', async ({ page }, s) => {
  await playStars(page);
  await homeWithStars(page, 4);
  const t0 = Date.now();
  await hold(page, 700);                    // popped in
  const b = await ev(page, () => window.__bella.street.pop());
  assert.ok(b, 'shown');
  const want = Math.min(0.42 * s.h, 0.6 * s.w);
  assert.ok(b.h >= 0.8 * want - 1 && b.h <= want + 1, 'height ' + b.h + ' ~ ' + want);
  assert.ok(Math.abs(b.x - s.w / 2) < 1 && Math.abs(b.s - 1) < 0.05, 'centered, full size: ' + JSON.stringify(b));
  assert.ok(b.y - b.h / 2 >= 0 && b.y <= 0.38 * s.h + 1, 'on screen, its middle at 0.38 H or higher');
  // clear of the top-right buttons (the jar is 0.66 h wide)
  const btn = await ev(page, () => ['home', 'mute'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, b: r.bottom }; }));
  for (const r of btn) assert.ok(b.x + 0.33 * b.h < r.l || b.y - b.h / 2 > r.b, 'clear of a button: ' + JSON.stringify(r));
  await waitFor(page, () => !window.__bella.street.pop(), 7000);
  const shown = (Date.now() - t0) / 1000;
  assert.ok(shown >= 2.9 && shown <= 6, 'shown ' + shown + ' s');
});

test('many new stars drop in without overflowing', () => single(async ({ page }) => {
  await playStars(page);
  const b0 = bigOf(await jarOf(page));
  await homeWithStars(page, 75);
  let most = 0;
  for (let i = 0; i < 40; i++) {
    await hold(page, 200);
    most = Math.max(most, (await jarOf(page)).count);
  }
  const j = await jarOf(page);
  assert.ok(most <= 60, 'at most 60 bodies, saw ' + most);
  assert.ok(bigOf(j) > b0, 'big stars ' + b0 + ' -> ' + bigOf(j));
  assert.ok(insideJar(j), 'inside the jar');
}));

test('a huge total keeps the jar small', () => single(async ({ page }) => {
  for (const v of ['5000', '9'.repeat(400), 'abc']) {
    await streetWithTotal(page, v);
    const j = await jarOf(page);
    assert.ok(j.count <= 60, v.slice(0, 8) + ': count ' + j.count);
    assert.ok(insideJar(j), v.slice(0, 8) + ': inside the jar');
  }
  await streetWithTotal(page, 5000);
  assert.ok(bigOf(await jarOf(page)) === 50, 'past 500 the jar is full of big stars');
  await ev(page, () => window.__bella.street.enter('square'));
  await waitFor(page, () => window.__bella.street.st.jarShow > 0, 10000);
  await hold(page, 2500);
  const ms = await ev(page, () => window.__bella.frameMs());
  assert.ok(ms > 0 && ms < 8, 'render ' + ms.toFixed(2) + ' ms');
}));

test('jar physics sleeps off screen', () => single(async ({ page }) => {
  await streetWithTotal(page, 37);
  await ev(page, () => { const b = window.__bella.street; b.st.x = b.places().find((p) => p.kind === 'square').x; });
  await camSettled(page);
  const a0 = (await jarOf(page)).steps;
  await hold(page, 500);
  assert.ok((await jarOf(page)).steps > a0, 'steps while the jar is on screen');
  await ev(page, () => { const b = window.__bella.street; b.st.x = b.places().find((p) => p.kind === 'pond').x; });
  await camSettled(page);
  const s0 = (await jarOf(page)).steps;
  await hold(page, 1000);
  assert.strictEqual((await jarOf(page)).steps, s0, 'no steps far from the jar');
}));

test('resize keeps the stars inside the jar', () => single(async ({ page }) => {
  await playStars(page);
  await homeWithStars(page, 40);
  for (const vp of [LANDSCAPE, PORTRAIT, LANDSCAPE]) {
    await page.setViewport(vp);
    for (let i = 0; i < 4; i++) {
      await hold(page, 150);
      const j = await jarOf(page);
      assert.ok(insideJar(j), 'inside: ' + JSON.stringify(j.bodies.filter((b) => !(b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1))));
    }
  }
  await waitFor(page, () => window.__bella.street.jar().count >= 4, 5000);
}));

test('Matter is loaded from file://', async () => {
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const g = await openGame(browser, { w: 390, h: 844, url });
  try {
    const { page } = g;
    assert.strictEqual(await ev(page, () => typeof Matter), 'object');
    assert.strictEqual(await ev(page, () => typeof window.Phys), 'object');
    await toStreet(page);
    await ev(page, () => window.__bella.street.enter('square'));
    await waitFor(page, () => window.__bella.street.st.jarShow > 0, 10000);
    assert.ok((await jarOf(page)).steps > 0, 'the jar steps');
    // Chrome blocks the font preload and the manifest under file:// (CORS, origin
    // 'null'): those were there before Matter and don't affect play.
    const known = /title\.woff2|manifest\.webmanifest|^console\.error: Failed to load resource: net::ERR_FAILED$/;
    assert.deepStrictEqual(g.errors.filter((e) => !known.test(e)), []);
  } finally { await g.ctx.close(); }
});

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

// ---------------------------------------------------------------- the bakery
// Review focus of the fairy town step 3 plan: rapid taps while serving, long
// decorating, home mid-cake, resize while decorating, corrupt saved cakes.

const TOPS = ['strawberry', 'chocdrop', 'sprinkles', 'flower', 'star', 'candle'];
const bk = (page) => ev(page, () => {
  const s = window.__bella.bakery.st;
  return {
    mode: s.mode, friend: s.friend, wish: s.wish, shape: s.shape, tool: s.tool,
    toppings: s.toppings.map((q) => [q.k, q.x, q.y]), creamDabs: s.creamDabs,
    served: s.served, enters: s.enters, saved: s.saved
  };
});
const starTotal = (page) => ev(page, () => window.Core.stars());
const cakeRect = (page) => ev(page, () => window.__bella.bakery.cakeRect());
const friendRect = (page) => ev(page, () => window.__bella.bakery.friendRect());
const clickRect = async (page, r) => page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
const frames = (page, n) => page.evaluate((n) => new Promise((done) => {
  let i = 0;
  (function tick() { if (++i >= n) done(); else requestAnimationFrame(tick); })();
}), n);
async function tapButton(page, id) {
  const b = await ev(page, (id) => window.__bella.bakery.buttons().find((q) => q.id === id), id);
  assert.ok(b, 'button ' + id + ' is shown');
  await page.mouse.click(b.x, b.y);
}
async function toDecorate(page, shape) {
  await playBakery(page);
  await tapButton(page, 'shape:' + shape);
  await waitFor(page, () => window.__bella.bakery.st.mode === 'decorate', 8000);
}
// a finger drag in n steps, from (x0, y0) to (x1, y1)
async function drag(page, x0, y0, x1, y1, n) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) await page.mouse.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
  await page.mouse.up();
}
// the served cake has been eaten, and the next friend walks in
const nextFriend = (page, served) => waitFor(page, (n) => {
  const s = window.__bella.bakery.st;
  return s.mode === 'arrive' && s.served === n;
}, 15000, served);
const bakeryDoor = (page) => ev(page, () => window.__bella.street.places().find((p) => p.kind === 'bakery'));

each('the bakery door opens the bakery', async ({ page }) => {
  await playBakery(page);
  assert.strictEqual(await scene(page), 'bakery');
  const s = await bk(page);
  assert.strictEqual(s.friend, 'husky');
  assert.ok(TOPS.includes(s.wish), 'wish ' + s.wish);
});

test('pick a cake, decorate it, give it, get stars', () => single(async ({ page }) => {
  await toDecorate(page, 'round');
  const r = await cakeRect(page);
  const d0 = (await bk(page)).creamDabs;
  await drag(page, r.x + r.w * 0.1, r.y + r.h * 0.35, r.x + r.w * 0.9, r.y + r.h * 0.4, 12);
  assert.ok((await bk(page)).creamDabs > d0, 'cream spread');
  const wish = (await bk(page)).wish;
  await tapButton(page, 'top:' + wish);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  assert.strictEqual((await bk(page)).toppings.length, 1);
  const s0 = await starTotal(page);
  await tapButton(page, 'serve');
  await nextFriend(page, 1);
  assert.strictEqual(await starTotal(page) - s0, 5);
  assert.strictEqual((await bk(page)).friend, 'pagi');
  const cakes = JSON.parse(await ev(page, () => localStorage.getItem('bella.cakes')));
  assert.strictEqual(cakes.length, 1);
  assert.strictEqual(cakes[0].s, 'round');
}));

each('tap the friend serves the cake', async ({ page }) => {
  await toDecorate(page, 'round');
  const s0 = await starTotal(page), n0 = (await bk(page)).served;
  await clickRect(page, await friendRect(page));
  await nextFriend(page, n0 + 1);
  const d = await starTotal(page) - s0;
  assert.ok(d === 3 || d === 5, 'stars +' + d);
  assert.strictEqual((await bk(page)).served, n0 + 1);
});

each('the give button sits by the friend and is big', async ({ page }, s) => {
  await toDecorate(page, 'round');
  const o = await ev(page, () => ({ b: window.__bella.bakery.buttons(), f: window.__bella.bakery.friendRect(), c: window.__bella.bakery.cakeRect(), M: Math.min(innerWidth, innerHeight) }));
  const g = o.b.find((q) => q.id === 'serve');
  assert.ok(g, 'serve is shown');
  assert.ok(!o.b.find((q) => q.id === 'bell'), 'no bell button');
  assert.ok(g.r >= 0.08 * o.M, 'big: ' + g.r);
  o.b.filter((q) => /^(cream|top):/.test(q.id)).forEach((q) => assert.ok(g.r > q.r, q.id + ' is smaller'));
  const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  assert.ok(g.x >= o.f.x - g.r && g.x <= o.f.x + o.f.w + g.r, 'under the friend: x ' + g.x);
  assert.ok(g.x > mid(o.c)[0], 'right of the cake center');
  assert.ok(g.x - g.r >= 0 && g.y - g.r >= 0 && g.x + g.r <= s.w && g.y + g.r <= s.h, 'inside the viewport');
  const nx = Math.max(o.c.x, Math.min(g.x, o.c.x + o.c.w)), ny = Math.max(o.c.y, Math.min(g.y, o.c.y + o.c.h));
  assert.ok(Math.hypot(g.x - nx, g.y - ny) >= g.r, 'clear of the cake');
  o.b.filter((q) => q.id !== 'serve').forEach((q) => assert.ok(Math.hypot(g.x - q.x, g.y - q.y) >= g.r + q.r, 'clear of ' + q.id));
});

each('tapping the friend only serves while decorating', async ({ page }) => {
  await playBakery(page);                   // in pick
  const n0 = (await bk(page)).served;
  const fz = await friendRect(page);
  assert.ok(fz, 'friendRect shown');
  await clickRect(page, fz);
  await hold(page, 300);
  assert.strictEqual((await bk(page)).mode, 'pick');
  assert.strictEqual((await bk(page)).served, n0);
});

test('tapping the friend while it arrives does nothing', () => single(async ({ page }) => {
  await tapPlay(page);
  await waitFor(page, () => window.__bella.scene() === 'street');
  await ev(page, () => window.__bella.street.enter('bakery'));
  await waitFor(page, () => window.__bella.scene() === 'bakery' && window.__bella.bakery.st.mode === 'arrive', 10000);
  const fz = await friendRect(page);
  assert.ok(fz, 'friendRect shown');
  await page.mouse.click(Math.min(fz.x + fz.w / 2, 380), fz.y + fz.h / 2);
  await hold(page, 200);
  const b = await bk(page);
  assert.ok(b.mode === 'arrive' || b.mode === 'pick', 'mode ' + b.mode);
  assert.strictEqual(b.served, 0);
}));

test('a cream drag onto the friend does not serve', () => single(async ({ page }) => {
  await toDecorate(page, 'round');
  const r = await cakeRect(page), f = await friendRect(page);
  await drag(page, r.x + r.w / 2, r.y + r.h / 2, f.x + f.w / 2, f.y + f.h / 2, 10);
  await hold(page, 300);
  assert.strictEqual((await bk(page)).mode, 'decorate');
}));

each('the hint shows after a pause', async ({ page }) => {
  await toDecorate(page, 'round');
  const r = await cakeRect(page);
  await tapButton(page, 'top:star');
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  assert.strictEqual(await ev(page, () => window.__bella.bakery.st.hint), false);
  await hold(page, 4500);
  assert.strictEqual(await ev(page, () => window.__bella.bakery.st.hint), true);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  assert.strictEqual(await ev(page, () => window.__bella.bakery.st.hint), false);
});

each('a plain cake is loved too', async ({ page }) => {
  await toDecorate(page, 'tall');
  const s0 = await starTotal(page);
  await tapButton(page, 'serve');
  await nextFriend(page, 1);
  assert.strictEqual(await starTotal(page) - s0, 3);
});

each('taps during serving give stars once', async ({ page }, s) => {
  await toDecorate(page, 'heart');
  const s0 = await starTotal(page), n0 = (await bk(page)).served;
  await tapButton(page, 'serve');
  // through serve (1.5 s) and eat (3.5 s); below the #home and #mute buttons
  const fz = await friendRect(page);
  for (let i = 0; i < 30; i++) {
    if (i % 3 === 0) await clickRect(page, fz);
    else await page.mouse.click(5 + Math.random() * (s.w - 10), 100 + Math.random() * (s.h - 105));
    await hold(page, 120);
  }
  await nextFriend(page, n0 + 1);
  await hold(page, 500);
  const d = await starTotal(page) - s0;
  assert.ok(d === 3 || d === 5, 'stars +' + d);
  assert.strictEqual((await bk(page)).served, n0 + 1);
});

test('long decorating stays within budget', () => single(async ({ page }) => {
  await toDecorate(page, 'round');
  const r = await cakeRect(page);
  await tapButton(page, 'top:sprinkles');
  for (let i = 0; i < 200; i++) {
    await page.mouse.click(r.x + r.w * (0.3 + 0.4 * Math.random()), r.y + r.h * (0.35 + 0.3 * Math.random()));
  }
  assert.strictEqual((await bk(page)).toppings.length, 80);
  await tapButton(page, 'cream:choc');
  await page.mouse.move(r.x + r.w * 0.2, r.y + r.h * 0.4);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < 5000; i++) {
    await page.mouse.move(r.x + r.w * (0.5 + 0.4 * Math.sin(i * 0.3)), r.y + r.h * (0.45 + 0.2 * Math.cos(i * 0.21)));
  }
  await page.mouse.up();
  const dabs = (await bk(page)).creamDabs;
  assert.ok(dabs > 100, 'rubbed: ' + dabs + ' dabs');
  await frames(page, 125);
  const cost = await ev(page, () => window.__bella.frameMs());
  console.log('bakery render ms/frame after long decorating:', cost.toFixed(3));
  assert.ok(cost > 0 && cost < 8, 'render ' + cost.toFixed(2) + ' ms');
}));

each('home mid-cake goes to the street door and back starts fresh', async ({ page }) => {
  await toDecorate(page, 'round');
  const r = await cakeRect(page);
  await tapButton(page, 'top:star');
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  assert.strictEqual((await bk(page)).toppings.length, 1);
  const s0 = await starTotal(page);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  const s = await streetSt(page), door = await bakeryDoor(page);
  assert.ok(Math.abs(s.x - door.x) < 0.05 * s.ww, 'x ' + s.x + ' door ' + door.x);
  assert.strictEqual(await starTotal(page), s0);
  await hold(page, 600);                    // the fade in drops a go()
  await ev(page, () => window.__bella.street.enter('bakery'));
  await waitFor(page, () => window.__bella.scene() === 'bakery', 10000);
  const b = await bk(page);
  assert.ok(b.mode === 'arrive' || b.mode === 'pick', 'mode ' + b.mode);
  assert.strictEqual(b.toppings.length, 0);
  assert.strictEqual(b.enters, 2);
  assert.strictEqual(await starTotal(page), s0);
});

test('resize while decorating keeps the cake', () => single(async ({ page }) => {
  await toDecorate(page, 'heart');
  const r = await cakeRect(page);
  await tapButton(page, 'top:strawberry');
  for (const [fx, fy] of [[0.5, 0.45], [0.38, 0.4], [0.62, 0.5]]) await page.mouse.click(r.x + r.w * fx, r.y + r.h * fy);
  const before = (await bk(page)).toppings;
  assert.strictEqual(before.length, 3);
  for (const vp of [LANDSCAPE, PORTRAIT]) {
    await page.setViewport(vp);
    await hold(page, 600);
    const b = await bk(page);
    assert.strictEqual(b.mode, 'decorate');
    assert.deepStrictEqual(b.toppings, before, 'toppings keep their cake-space places at ' + vp.width + 'x' + vp.height);
    const out = await ev(page, () => window.__bella.bakery.buttons().filter((q) =>
      q.x - q.r < 0 || q.y - q.r < 0 || q.x + q.r > innerWidth || q.y + q.r > innerHeight));
    assert.deepStrictEqual(out, [], 'buttons on screen at ' + vp.width + 'x' + vp.height);
    const c = await cakeRect(page);
    assert.ok(c.x >= 0 && c.x + c.w <= vp.width && c.y >= 0 && c.y + c.h <= vp.height, 'cake on screen: ' + JSON.stringify(c));
  }
}));

each('corrupt cakes in storage are ignored', async ({ page }) => {
  const reload = async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__bella && window.__bella.scene, { timeout: 3000 });
  };
  await ev(page, () => localStorage.setItem('bella.cakes', '{oops'));
  await reload();
  await playBakery(page);
  assert.strictEqual((await bk(page)).saved, 0);
  await ev(page, () => localStorage.setItem('bella.cakes', JSON.stringify(Array.from({ length: 50 }, (_, i) =>
    ({ s: ['round', 'heart', 'tall'][i % 3], c: 'pink', t: [['star', 0.5, 0.4], ['candle', 0.3, 0.3]] })))));
  await reload();
  await playBakery(page);
  assert.strictEqual((await bk(page)).saved, 6);
  await tapButton(page, 'shape:round');
  await waitFor(page, () => window.__bella.bakery.st.mode === 'decorate', 8000);
  await tapButton(page, 'serve');
  await nextFriend(page, 1);
  assert.strictEqual(await ev(page, () => JSON.parse(localStorage.getItem('bella.cakes')).length), 6);
});

each('home from the bakery lands at its door', async ({ page }) => {
  await playBakery(page);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  const s = await streetSt(page), door = await bakeryDoor(page);
  assert.ok(Math.abs(s.x - door.x) < 0.05 * s.ww, 'x ' + s.x + ' door ' + door.x);
});

// The house is the only place still closed: Bella walks there, it wiggles, and she stays on the street.
each('the house is still closed', async ({ page }) => {
  await toStreet(page);
  await ev(page, () => {
    const b = window.__bella.street, p = b.places().find((q) => q.kind === 'house');
    b.st.x = p.x - innerWidth * 0.1;
    b.enter('house');
  });
  await waitFor(page, () => window.__bella.street.st.target === null, 10000);
  await hold(page, 900);
  assert.strictEqual(await scene(page), 'street');
});

// ---------------------------------------------------------------- the bubble pond
const pd = (page) => ev(page, () => {
  const s = window.__bella.pond.st;
  return {
    mode: s.mode, caught: s.caught, party: s.party, enters: s.enters, held: s.held,
    bubbles: s.bubbles.map((b) => ({ x: b.x, y: b.y, r: b.r })),
    octos: s.octos.map((o) => ({ x: o.x, y: o.y, r: o.r, side: o.side, flip: o.flip, age: o.age, state: o.state }))
  };
});
// No new octopus comes by itself and the ones there go: the test places its own.
const quietPond = (page) => ev(page, () => { const s = window.__bella.pond.st; s.spawnT = 1e9; s.octos.length = 0; });
// An octopus right in front of the horn, and a bubble shot at it.
const catchOne = (page) => ev(page, () => {
  const p = window.__bella.pond, h = p.horn();
  p.spawnOcto(h.x + innerWidth * 0.2, h.y);
  p.shoot();
});
const pondPlace = (page) => ev(page, () => window.__bella.street.places().find((p) => p.kind === 'pond'));

each('the pond opens from the street', async ({ page }) => {
  await playPond(page);
  assert.strictEqual(await scene(page), 'pond');
  const vis = await ev(page, () => { const s = getComputedStyle(document.getElementById('home')); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; });
  assert.strictEqual(vis, true, '#home visible');
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  const s = await streetSt(page), p = await pondPlace(page);
  assert.ok(Math.abs(s.x - p.x) < 0.05 * s.ww, 'x ' + s.x + ' pond ' + p.x);
});

each('bubbles leave the horn by themselves', async ({ page }) => {
  await playPond(page);
  await hold(page, 2000);
  const n = (await pd(page)).bubbles.length;
  assert.ok(n >= 2, n + ' bubbles');
});

each('a bubble flips an octopus and gives a star', async ({ page }) => {
  await playPond(page);
  await quietPond(page);
  const s0 = await starTotal(page), c0 = (await pd(page)).caught;
  await catchOne(page);
  await waitFor(page, (c) => window.__bella.pond.st.caught === c + 1, 3000, c0);
  assert.strictEqual(await starTotal(page), s0 + 1);
  await waitFor(page, () => window.__bella.pond.st.octos.some((o) => o.side === 'red'), 1500);
});

each('each octopus gives one star', async ({ page }) => {
  await playPond(page);
  await quietPond(page);
  const s0 = await starTotal(page), c0 = (await pd(page)).caught;
  await ev(page, () => { const p = window.__bella.pond, h = p.horn(); p.spawnOcto(h.x + innerWidth * 0.2, h.y); });
  for (let i = 0; i < 10; i++) { await ev(page, () => window.__bella.pond.shoot()); await hold(page, 30); }
  await hold(page, 2500);
  assert.strictEqual((await pd(page)).caught, c0 + 1);
  assert.strictEqual(await starTotal(page), s0 + 1);
});

test('a grumpy octopus flips by itself after 20 s', () => single(async ({ page }) => {
  await playPond(page);
  await quietPond(page);
  const s0 = await starTotal(page);
  await ev(page, () => { const o = window.__bella.pond.spawnOcto(); o.age = 19.5; });
  await waitFor(page, () => window.__bella.pond.st.octos.some((o) => o.side === 'red'), 1000);
  assert.strictEqual(await starTotal(page), s0 + 1);
}));

each('every 10 caught gives confetti and bravissima', async ({ page }) => {
  await playPond(page);
  await quietPond(page);
  await ev(page, () => { window.__bella.pond.st.caught = 9; });
  assert.strictEqual((await pd(page)).party, 0);
  await catchOne(page);
  await waitFor(page, () => window.__bella.pond.st.caught === 10, 3000);
  assert.ok((await pd(page)).party > 0, 'party');
});

each('holding all the time still catches octopuses', async ({ page }, s) => {
  await playPond(page);
  await page.mouse.move(s.w / 2, s.h / 2);
  await page.mouse.down();
  await hold(page, 8000);
  const r = await pd(page);
  await page.mouse.up();
  assert.strictEqual(r.held, true);
  assert.ok(r.caught >= 1, 'caught ' + r.caught);
});

test('rapid taps stay within budget', () => single(async ({ page }) => {
  await playPond(page);
  let maxB = 0, maxO = 0;
  for (let i = 0; i < 60; i++) {
    await page.mouse.click(390 * (0.2 + 0.6 * Math.random()), 844 * (0.3 + 0.5 * Math.random()));
    await hold(page, 100);
    const r = await pd(page);
    maxB = Math.max(maxB, r.bubbles.length); maxO = Math.max(maxO, r.octos.length);
  }
  assert.ok(maxB <= 24, 'bubbles ' + maxB);
  assert.ok(maxO <= 6, 'octopuses ' + maxO);
  assert.ok(maxB > 6, 'the taps shot bubbles: ' + maxB);
  await frames(page, 125);
  const cost = await ev(page, () => window.__bella.frameMs());
  console.log('pond render ms/frame after rapid taps:', cost.toFixed(3));
  assert.ok(cost > 0 && cost < 8, 'render ' + cost.toFixed(2) + ' ms');
}));

each('home goes to the pond on the street and back starts fresh', async ({ page }) => {
  await playPond(page);
  await quietPond(page);
  await catchOne(page);
  await waitFor(page, () => window.__bella.pond.st.caught === 1, 3000);
  const s1 = await starTotal(page);
  await ev(page, () => window.__bella.goHome());
  await waitFor(page, () => window.__bella.scene() === 'street');
  const s = await streetSt(page), p = await pondPlace(page);
  assert.ok(Math.abs(s.x - p.x) < 0.05 * s.ww, 'x ' + s.x + ' pond ' + p.x);
  await hold(page, 600);                    // the fade in drops a go()
  await ev(page, () => window.__bella.street.enter('pond'));
  await waitFor(page, () => window.__bella.scene() === 'pond' && window.__bella.pond.st.mode === 'fly', 10000);
  const r = await pd(page);
  assert.strictEqual(r.caught, 0);
  assert.strictEqual(r.enters, 2);
  assert.strictEqual(await starTotal(page), s1);
});

test('resize mid-game keeps everything on screen', () => single(async ({ page }) => {
  await playPond(page);
  await hold(page, 3000);                   // bubbles out, octopuses swimming
  for (const vp of [LANDSCAPE, PORTRAIT, LANDSCAPE]) {
    await page.setViewport(vp);
    await hold(page, 700);
    const r = await ev(page, () => {
      const p = window.__bella.pond, s = p.st, n = p.nursery();
      return {
        W: innerWidth, H: innerHeight, nb: n.y + n.h, hero: { x: s.hero.x, y: s.hero.y },
        bubbles: s.bubbles.map((b) => [b.x, b.y]),
        octos: s.octos.map((o) => [o.x, o.y, o.state])
      };
    });
    const at = vp.width + 'x' + vp.height;
    const inside = (x, y) => x >= 0 && x <= r.W && y >= 0 && y <= r.H;
    assert.ok(inside(r.hero.x, r.hero.y), 'Bella on screen at ' + at + ': ' + JSON.stringify(r.hero));
    assert.deepStrictEqual(r.bubbles.filter(([x, y]) => !inside(x, y)), [], 'bubbles on screen at ' + at);
    assert.deepStrictEqual(r.octos.filter(([x, y]) => !inside(x, y)), [], 'octopuses on screen at ' + at);
    assert.deepStrictEqual(r.octos.filter(([, y, state]) => state === 'swim' && y < r.nb), [], 'swimming octopuses below the nursery at ' + at);
    assert.ok(r.octos.length > 0 && r.bubbles.length > 0, 'something to check at ' + at + ': ' + JSON.stringify(r));
  }
}));

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
