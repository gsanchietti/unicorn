'use strict';
// Render review: saves screenshots of every look to tests/out/ (git-ignored) and
// checks the render budget (average canvas render cost per frame on a phone).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer, launch, openGame, scene, tapPlay, playStars, playBakery, playPond, hold } = require('./helpers');

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
  finally {
    // Let the service worker finish installing first: closing the context while it
    // still caches the game files made the next createBrowserContext fail
    // ("Session with given id not found").
    await g.page.evaluate(() => Promise.race([
      navigator.serviceWorker ? navigator.serviceWorker.ready : null,
      new Promise((r) => setTimeout(r, 3000))
    ])).catch(() => {});
    await g.ctx.close();
  }
}

async function startFlying(page) {
  await playStars(page);
}

async function toStreet(page) {
  await tapPlay(page);
  await page.waitForFunction(() => window.__bella.scene() === 'street', { timeout: 8000, polling: 50 });
  await hold(page, 600);                    // past the fade in
}

test('street in day and night, within the render budget', () => open(390, 844, async (page) => {
  await ev(page, () => { try { localStorage.setItem('bella.stars', '23'); } catch (e) { /* ignore */ } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene);
  await toStreet(page);
  await ev(page, () => window.__bella.setTime('day'));
  await frames(page, 3);
  await shot(page, 'street-day');
  // walk right (away from every place) for the render cost
  await page.mouse.move(390 * 0.85, 844 * 0.5);
  await page.mouse.down();
  await frames(page, 125);
  const cost = await ev(page, () => window.__bella.frameMs());
  await page.mouse.up();
  console.log('street render ms/frame @390x844 DPR2 (walking):', cost.toFixed(3));
  fs.writeFileSync(path.join(OUT, 'street-cost.json'), JSON.stringify({ walking: cost }, null, 2) + '\n');
  await ev(page, () => window.__bella.setTime('night'));
  await hold(page, 2500);                   // the street's night wash eases in
  await shot(page, 'street-night');
  assert.ok(cost > 0, 'street: frameMs() measured nothing');
  assert.ok(cost < BUDGET_MS, 'street render ' + cost.toFixed(2) + ' ms >= ' + BUDGET_MS + ' ms');
}));

// Town sheet: every Town sprite by day and by night, both life sprites, the jar
// at several totals and the three signs, on the wall color.
test('town sheet', () => open(390, 844, async (page) => {
  // how long the street waits for its sprites on this phone (once per resize)
  const buildMs = await ev(page, () => {
    const t0 = performance.now();
    window.Town.build(390, 2);
    return performance.now() - t0;
  });
  console.log('Town.build(390, 2) ms:', buildMs.toFixed(0));
  const url = await ev(page, () => {
    const T = window.Town, U = 300, dpr = 2;
    T.build(U, dpr);
    const c = document.createElement('canvas');
    c.width = 2400 * dpr; c.height = 2000 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#f7f1e6'; g.fillRect(0, 0, 2400, 1000);
    g.fillStyle = '#2f427f'; g.fillRect(0, 1000, 2400, 1000);
    for (const night of [false, true]) {
      const y0 = night ? 1000 : 0;
      let x = 20, base = y0 + 440;
      T.KINDS.forEach((k, i) => {
        const s = T.sprite(k, night);
        if (i === 5) { x = 20; base = y0 + 900; }
        g.drawImage(s.c, x, base - s.h, s.w, s.h);
        x += s.w + 30;
      });
      for (const k of ['mouseBalloon', 'butterfly']) {
        const s = T.lifeSprite(k);
        g.drawImage(s.c, x, base - s.h, s.w, s.h);
        x += s.w + 30;
      }
      const tile = T.groundTile();
      g.drawImage(tile.c, x, base - tile.h, tile.w, tile.h);
      // the jar at a few totals, and the signs
      [0, 7, 23, 60, 130].forEach((n, i) => T.drawJar(g, 1700 + i * 150, y0 + 900, U * 0.6, n, 0));
      ['star', 'cake', 'octopus'].forEach((k, i) => T.drawSign(g, 1760 + i * 240, y0 + 110, 80, k, 0.7));
      ['star', 'cake', 'octopus'].forEach((k, i) => T.drawSign(g, 1760 + i * 240, y0 + 260, 30, k, 0.7));
    }
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'town.png'), Buffer.from(url.split(',')[1], 'base64'));
}));

test('street, phone landscape', () => open(844, 390, async (page) => {
  await toStreet(page);
  await ev(page, () => window.__bella.setTime('day'));
  await frames(page, 3);
  await shot(page, 'street-landscape-day');
}));

test('street, the jar shows the total', () => open(390, 844, async (page) => {
  await ev(page, () => { try { localStorage.setItem('bella.stars', '47'); } catch (e) { /* ignore */ } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene);
  await toStreet(page);
  await ev(page, () => { window.__bella.setTime('day'); window.__bella.street.enter('square'); });
  await page.waitForFunction(() => window.__bella.street.st.jarShow > 0, { timeout: 10000, polling: 30 });
  await hold(page, 700);                    // the row of stars has risen
  await shot(page, 'street-jar');
}));

// ---------------------------------------------------------------- the bakery
async function tapButton(page, id) {
  const b = await ev(page, (id) => window.__bella.bakery.buttons().find((q) => q.id === id), id);
  assert.ok(b, 'button ' + id);
  await page.mouse.click(b.x, b.y);
}
// Pick a cake, spread two creams and drop 10 toppings.
async function decorate(page, shape) {
  await tapButton(page, 'shape:' + shape);
  await page.waitForFunction(() => window.__bella.bakery.st.mode === 'decorate', { timeout: 8000, polling: 50 });
  const r = await ev(page, () => window.__bella.bakery.cakeRect());
  const rub = async (cream, fy) => {
    await tapButton(page, 'cream:' + cream);
    await page.mouse.move(r.x + r.w * 0.1, r.y + r.h * fy);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) await page.mouse.move(r.x + r.w * (0.1 + 0.8 * i / 16), r.y + r.h * (fy + 0.05 * Math.sin(i)));
    await page.mouse.up();
  };
  await rub('pink', 0.3);
  await rub('mint', 0.42);
  const kinds = ['strawberry', 'chocdrop', 'sprinkles', 'flower', 'star', 'candle'];
  for (let i = 0; i < 10; i++) {
    await tapButton(page, 'top:' + kinds[i % 6]);
    await page.mouse.click(r.x + r.w * (0.25 + 0.5 * ((i * 0.37) % 1)), r.y + r.h * (0.3 + 0.3 * ((i * 0.61) % 1)));
  }
  await hold(page, 400);                    // the toppings have bounced in
}

test('bakery: pick, decorate and eat, within the render budget', () => open(390, 844, async (page) => {
  await playBakery(page);
  await hold(page, 400);
  await shot(page, 'bakery-pick');
  await decorate(page, 'round');
  await frames(page, 125);
  const cost = await ev(page, () => window.__bella.frameMs());
  await shot(page, 'bakery-decorate');
  console.log('bakery render ms/frame @390x844 DPR2 (decorating):', cost.toFixed(3));
  fs.writeFileSync(path.join(OUT, 'bakery-cost.json'), JSON.stringify({ decorating: cost }, null, 2) + '\n');
  await hold(page, 4500);                   // idle: the tap hint shows
  await shot(page, 'bakery-serve-hint');
  await tapButton(page, 'serve');
  await page.waitForFunction(() => window.__bella.bakery.st.mode === 'eat', { timeout: 8000, polling: 30 });
  await hold(page, 1300);                   // half eaten, crumbs flying
  await shot(page, 'bakery-eat');
  assert.ok(cost > 0, 'bakery: frameMs() measured nothing');
  assert.ok(cost < BUDGET_MS, 'bakery render ' + cost.toFixed(2) + ' ms >= ' + BUDGET_MS + ' ms');
}));

test('bakery, phone landscape, with saved cakes in the window', () => open(844, 390, async (page) => {
  await ev(page, () => {
    const tops = ['strawberry', 'chocdrop', 'sprinkles', 'flower', 'star', 'candle'], creams = ['pink', 'choc', 'lemon', 'mint', ''];
    localStorage.setItem('bella.cakes', JSON.stringify([0, 1, 2, 3, 4, 5].map((i) => ({
      s: ['round', 'heart', 'tall'][i % 3], c: creams[i % 5],
      t: [0, 1, 2].map((j) => [tops[(i + j) % 6], 0.3 + 0.2 * j, 0.3 + 0.1 * ((i + j) % 3)])
    }))));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bella && window.__bella.scene);
  await playBakery(page);
  await decorate(page, 'heart');
  await shot(page, 'bakery-landscape');
}));

// Bakery sheet: every Bakery sprite, the three cake bases with some cream, every
// topping (as on the cake, and enlarged), every button face and the cream stamps,
// on the wall color; then the room at a phone's two sizes.
test('bakery sheet', () => open(390, 844, async (page) => {
  const buildMs = await ev(page, () => {
    const t0 = performance.now();
    window.Bakery.build(390, 2);
    window.Bakery.room(390, 844, false);
    return performance.now() - t0;
  });
  console.log('Bakery.build(390, 2) + room ms:', buildMs.toFixed(0));
  const url = await ev(page, () => {
    const B = window.Bakery, U = 300, dpr = 2;
    B.build(U, dpr);
    const c = document.createElement('canvas');
    c.width = 1700 * dpr; c.height = 1500 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#f7f1e6'; g.fillRect(0, 0, 1700, 1500);
    const put = (s, x, y, k) => g.drawImage(s.c, x - s.w * (k || 1) / 2, y - s.h * (k || 1), s.w * (k || 1), s.h * (k || 1));
    // the sprites, twice their size
    let x = 110;
    for (const k of ['oven', 'stool', 'bell', 'wishBubble']) { const s = B.sprite(k); put(s, x + s.w, 240, 2); x += s.w * 2 + 30; }
    B.TOPPINGS.forEach((k, i) => { const t = B.topping(k); g.drawImage(t.c, 900 + i * 120, 40, t.w * 4, t.h * 4); });
    B.TOPPINGS.forEach((k, i) => { const t = B.topping(k); g.drawImage(t.c, 900 + i * 40, 200, t.w, t.h); });
    B.CREAMS.forEach((k, i) => { const s = B.creamStamp(k); g.drawImage(s.c, 1200 + i * 80, 190, s.r * 6, s.r * 6); });
    // the cakes: plain, and with cream stroked across and toppings
    B.SHAPES.forEach((shape, i) => {
      const b = B.cakeBase(shape);
      g.drawImage(b.c, 30 + i * 260, 520 - b.h * 2, b.w * 2, b.h * 2);
      const cc = document.createElement('canvas');
      cc.width = b.c.width; cc.height = b.c.height;
      const cg = cc.getContext('2d');
      cg.drawImage(b.c, 0, 0);
      cg.save(); b.clip(cg);
      B.CREAMS.forEach((cr, j) => {
        const st = B.creamStamp(cr), d = st.c.width;
        for (let q = 0; q < 60; q++) {
          const px = cc.width * (0.05 + 0.9 * q / 60), py = cc.height * (0.12 + j * 0.17 + 0.03 * Math.sin(q * 0.4));
          cg.drawImage(st.c, px - d / 2, py - d / 2);
        }
      });
      cg.restore();
      const x0 = 830 + i * 280, y0 = 520 - b.h * 2;
      g.drawImage(cc, x0, y0, b.w * 2, b.h * 2);
      B.TOPPINGS.forEach((k, j) => { const t = B.topping(k); g.drawImage(t.c, x0 + b.w * 2 * (0.2 + 0.12 * j) - t.w, y0 + b.h * 2 * (0.25 + 0.08 * (j % 3)) - t.h, t.w * 2, t.h * 2); });
    });
    // the button faces, big and at the size of a phone's buttons
    const ids = [].concat(B.SHAPES.map((k) => 'shape:' + k), B.CREAMS.map((k) => 'cream:' + k), B.TOPPINGS.map((k) => 'top:' + k), ['bell']);
    ids.forEach((id, i) => { const ic = B.icon(id); g.drawImage(ic.c, 20 + i * 118, 560, 110, 110); });
    ids.forEach((id, i) => { const ic = B.icon(id); g.drawImage(ic.c, 20 + i * 72, 690, 66, 66); });
    // the counter (its top-left part) and the room in portrait and landscape
    const ct = B.sprite('counter');
    g.drawImage(ct.c, 0, 0, 700 * dpr, 300 * dpr, 20, 790, 700, 300);
    B.build(390, dpr);
    g.drawImage(B.room(390, 844, false), 760, 790, 320, 692);
    B.build(351, dpr);
    g.drawImage(B.room(844, 390, false), 1100, 790, 580, 268);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'bakery-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
}));

// ---------------------------------------------------------------- the bubble pond
// Keep the pond full: 24 bubbles and 6 octopuses (new ones replace the caught).
const fillPond = (page) => ev(page, () => {
  const p = window.__bella.pond;
  window.__fill = setInterval(() => {
    while (p.st.bubbles.length < 24) p.shoot();
    if (p.st.octos.length < 6) p.spawnOcto(innerWidth * (0.55 + 0.4 * Math.random()));
  }, 30);
});
const stopFill = (page) => ev(page, () => clearInterval(window.__fill));

test('pond in day and night, within the render budget', () => open(390, 844, async (page) => {
  await playPond(page);
  await ev(page, () => window.__bella.setTime('day'));
  await hold(page, 2500);                   // bubbles out, octopuses swimming in
  await shot(page, 'pond-day');
  await fillPond(page);
  await hold(page, 300);
  await frames(page, 125);
  const cost = await ev(page, () => window.__bella.frameMs());
  const n = await ev(page, () => [window.__bella.pond.st.bubbles.length, window.__bella.pond.st.octos.length]);
  await stopFill(page);
  console.log('pond render ms/frame @390x844 DPR2 (' + n[0] + ' bubbles, ' + n[1] + ' octopuses):', cost.toFixed(3));
  fs.writeFileSync(path.join(OUT, 'pond-cost.json'), JSON.stringify({ full: cost, bubbles: n[0], octos: n[1] }, null, 2) + '\n');
  await ev(page, () => window.__bella.setTime('night'));
  await hold(page, 2500);                   // the night eases in
  await shot(page, 'pond-night');
  assert.ok(n[0] >= 20 && n[1] >= 5, 'a full pond: ' + n);
  assert.ok(cost > 0, 'pond: frameMs() measured nothing');
  assert.ok(cost < BUDGET_MS, 'pond render ' + cost.toFixed(2) + ' ms >= ' + BUDGET_MS + ' ms');
}));

test('pond: an octopus flips', () => open(390, 844, async (page) => {
  await playPond(page);
  await ev(page, () => { window.__bella.setTime('day'); const s = window.__bella.pond.st; s.spawnT = 1e9; s.octos.length = 0; });
  await ev(page, () => { const p = window.__bella.pond, h = p.horn(); p.spawnOcto(h.x + innerWidth * 0.25, h.y); p.shoot(); });
  await page.waitForFunction(() => window.__bella.pond.st.octos.some((o) => o.state === 'caught' && o.flip > 0.25), { timeout: 4000, polling: 'raf' });
  await shot(page, 'pond-catch');
}));

test('pond, phone landscape', () => open(844, 390, async (page) => {
  await playPond(page);
  await ev(page, () => window.__bella.setTime('day'));
  await hold(page, 3000);
  await shot(page, 'pond-landscape');
}));

// Pond sheet: every Pond sprite in day and night (twice its size, and as on a
// phone), the water tile three times side by side (the joins), the nursery and
// bubbles at 4 sizes, on the wall color and on the night color.
test('pond sheet', () => open(390, 844, async (page) => {
  const buildMs = await ev(page, () => {
    const t0 = performance.now();
    window.Pond.build(390, 2);
    window.Pond.bubble(20); window.Pond.bubble(41);
    return performance.now() - t0;
  });
  console.log('Pond.build(390, 2) + 2 bubbles ms:', buildMs.toFixed(0));
  const url = await ev(page, () => {
    const P = window.Pond, U = 300, dpr = 2, CW = 1700, CH = 1420;
    P.build(U, dpr);
    const c = document.createElement('canvas');
    c.width = CW * dpr; c.height = CH * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#f7f1e6'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = '#2f427f'; g.fillRect(0, 440, CW, 360);
    const put = (s, x, y, k) => g.drawImage(s.c, x - s.w * (k || 1) / 2, y - s.h * (k || 1), s.w * (k || 1), s.h * (k || 1));
    const kinds = ['lily', 'lilyFlower', 'reeds', 'rock'];
    // the pieces, twice their size: day, then night
    [false, true].forEach((night, r) => {
      let x = 30;
      kinds.forEach((k) => { const s = P.sprite(k, night); put(s, x + s.w, 300 + r * 400, 2); x += s.w * 2 + 40; });
      // the nursery, as built
      const n = P.nursery();
      g.drawImage(n.c, 960, 40 + r * 420, n.w * 1.4, n.h * 1.4);
      // bubbles at 4 sizes (the scene uses 0.05 u and 0.75 x the octopus)
      let bx = 1300;
      [8, 15, 32, 60].forEach((rad) => { const b = P.bubble(rad); g.drawImage(b.c, bx, 320 + r * 400 - b.c.lw, b.c.lw, b.c.lw); bx += b.c.lw + 12; });
    });
    // the water: three tiles side by side, with the pieces on it as the scene puts them
    const t = P.waterTile();
    [false, true].forEach((night, r) => {
      const y = 960 + r * 250, x0 = 30;
      if (night) { g.fillStyle = '#2f427f'; g.fillRect(0, y - 150, 1000, 150 + t.h); }
      put(P.sprite('reeds', night), x0 + 220, y + U * 0.06);
      put(P.sprite('reeds', night), x0 + 700, y + U * 0.06);
      for (let i = 0; i < 3; i++) g.drawImage(t.c, x0 + i * t.w, y, t.w, t.h);
      if (night) { g.globalAlpha = 0.45; g.fillStyle = '#1f2c63'; g.fillRect(x0, y, 3 * t.w, t.h); g.globalAlpha = 1; }
      put(P.sprite('lily', night), x0 + 90, y + U * 0.07);
      put(P.sprite('lilyFlower', night), x0 + 400, y + U * 0.1);
      put(P.sprite('rock', night), x0 + 560, y + U * 0.04);
      put(P.sprite('lily', night), x0 + 800, y + U * 0.12);
    });
    // as small as on a phone (u = 390), day and night
    P.build(390, dpr);
    [false, true].forEach((night, r) => {
      const y = 1100 + r * 240, x0 = 1010;
      const w = P.waterTile();
      if (night) { g.fillStyle = '#2f427f'; g.fillRect(x0, y - 150, 680, 150); }
      const n = P.nursery();
      g.drawImage(n.c, x0 + 20, y - 135, n.w * 0.875, n.h * 0.875);
      put(P.sprite('reeds', night), x0 + 420, y + 390 * 0.06);
      g.drawImage(w.c, 0, 0, w.c.width, 80 * dpr, x0, y, w.w, 80);
      g.drawImage(w.c, 0, 0, 290 * dpr, 80 * dpr, x0 + w.w, y, 290, 80);
      put(P.sprite('lily', night), x0 + 80, y + 390 * 0.07);
      put(P.sprite('lilyFlower', night), x0 + 250, y + 390 * 0.1);
      put(P.sprite('rock', night), x0 + 560, y + 390 * 0.04);
      [20, 41].forEach((rad, i) => { const b = P.bubble(rad); g.drawImage(b.c, x0 + 290 + i * 50, y - 100 + i * 10, b.c.lw, b.c.lw); });
    });
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'pond-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
}));

// Octopus sheet: blue idle, the flip at 0, 0.25, 0.5, 0.75 and 1, red idle, red
// giggling and red inside a bubble, big; then the same at a phone's size (twice
// enlarged) and as the scene draws them (in the nursery they are half size).
// Also checks the cost of Friends.octopus.
test('octopus sheet, and Friends.octopus under 0.3 ms', () => open(390, 844, async (page) => {
  const cost = await ev(page, () => new Promise((done) => {
    const F = window.Friends, dpr = 2;
    F.buildOctopus(0.14 * 390, dpr);
    const c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    const g = c.getContext('2d');
    const pose = { t: 0, side: 'blue', flip: 0, giggle: 0 };
    const N = 1000, PER = 10, WARM = 40;
    let i = -WARM, sum = 0;
    (function tick() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 400, 400);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t0 = performance.now();
      for (let k = 0; k < PER; k++, i++) {
        const m = Math.floor((i + 100) / 20) % 4;      // idle blue, flipping, giggling red, idle red
        pose.t = 1 + i / 60;
        pose.side = m === 3 ? 'red' : 'blue';
        pose.flip = m === 1 ? ((i + 100) % 20) / 20 : m === 2 ? 1 : 0;
        pose.giggle = m === 1 || m === 2 ? 1 : 0;
        F.octopus(g, 100, 100, pose);
      }
      if (i > 0) sum += performance.now() - t0;
      if (i >= N) done(sum / N); else requestAnimationFrame(tick);
    })();
  }));
  console.log('Friends.octopus ms/call:', cost.toFixed(4));
  const url = await ev(page, () => {
    const F = window.Friends, P = window.Pond, dpr = 2, CW = 2360, CH = 830;
    const c = document.createElement('canvas');
    c.width = CW * dpr; c.height = CH * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#f7f1e6'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = '#45c3c1'; g.fillRect(0, 630, CW / 2, 200);
    g.fillStyle = '#2f427f'; g.fillRect(CW / 2, 630, CW / 2, 200);
    const poses = [
      { t: 0.3, side: 'blue', flip: 0, giggle: 0 },
      { t: 1.1, side: 'blue', flip: 0, giggle: 1 },
      { t: 1.1, side: 'blue', flip: 0.25, giggle: 1 },
      { t: 1.1, side: 'blue', flip: 0.5, giggle: 1 },
      { t: 1.1, side: 'blue', flip: 0.75, giggle: 1 },
      { t: 1.1, side: 'blue', flip: 1, giggle: 1 },
      { t: 0.3, side: 'red', flip: 0, giggle: 0 },
      { t: 2.03, side: 'red', flip: 0, giggle: 1 },
      { t: 0.3, side: 'red', flip: 0, giggle: 0, bubble: true }
    ];
    const row = (h, y, step, x0, zoom, list) => {
      F.buildOctopus(h, dpr);
      P.build(h / 0.14, dpr);
      (list || poses).forEach((p, i) => {
        g.save();
        g.translate(x0 + i * step, y); g.scale(zoom, zoom);
        F.octopus(g, 0, 0, p);
        if (p.bubble) { const r = Math.round(0.75 * h), b = P.bubble(r); g.drawImage(b.c, -b.c.lw / 2, -b.c.lw / 2, b.c.lw, b.c.lw); }
        g.restore();
      });
    };
    row(200, 160, 260, 140, 1);
    // more steps of the flip, to see the motion
    row(120, 390, 150, 110, 1, [0.1, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 0.95, 1].map((f) => ({ t: 1.1, side: 'blue', flip: f, giggle: 1 })));
    row(0.14 * 390, 540, 150, 110, 2);                        // a phone's octopus, enlarged twice
    row(0.14 * 390, 690, 110, 80, 1);                         // as on a phone, on the water
    row(0.14 * 390, 780, 110, 80, 0.5);                       // as in the nursery
    row(0.14 * 390, 690, 110, CW / 2 + 80, 1);                // and at night
    row(0.14 * 390, 780, 110, CW / 2 + 80, 0.5);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'octopus.png'), Buffer.from(url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'octopus-cost.json'), JSON.stringify({ octopus: cost }, null, 2) + '\n');
  assert.ok(cost > 0, 'the draw cost measured nothing');
  assert.ok(cost < 0.3, 'Friends.octopus ' + cost.toFixed(3) + ' ms >= 0.3 ms');
}));

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
  { name: 'happy', pose: { t: 0.5, run: 0, happy: 1, wave: 1, glow: 1 } },
  // the street's walk: 8 phases of one walk cycle (see pose.stride in js/characters.js)
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ name: 'walk ' + i, pose: { t: 31 + i / 16, run: 0, walk: 1, stride: i / 16, face: 0 } }))
];

test('character sheet, and Characters.draw and drawBongo under 1 ms', () => open(390, 844, async (page) => {
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

  // Bongo on his own: the cost of Characters.drawBongo at the bakery's size on
  // this phone, then a sheet with his walk, carry and face frames.
  const bcost = await ev(page, () => new Promise((done) => {
    const C = window.Characters, dpr = Math.min(2, window.devicePixelRatio || 1);
    const ppu = Math.min(innerHeight * 0.42, innerWidth * 0.52) / C.H * dpr;
    const k = 0.34 * Math.min(innerWidth, 0.9 * innerHeight) / C.BONGO_H * dpr;
    const c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    const g = c.getContext('2d');
    const pose = { t: 0, walk: 1, stride: 0, carry: 0, face: undefined };
    const N = 500, PER = 5, WARM = 20;
    let i = -WARM, sum = 0;
    (function tick() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 400, 400);
      g.setTransform(k, 0, 0, k, 200, 380);
      const t0 = performance.now();
      for (let q = 0; q < PER; q++, i++) {
        pose.t = 1 + i / 60; pose.stride = (i + 100) / 90; pose.carry = (i + 100) % 200 < 100 ? 1 : 0;
        C.drawBongo(g, pose, ppu);
      }
      if (i > 0) sum += performance.now() - t0;
      if (i >= N) done(sum / N); else requestAnimationFrame(tick);
    })();
  }));
  console.log('Characters.drawBongo ms/call:', bcost.toFixed(3));
  const burl = await ev(page, () => {
    const C = window.Characters, dpr = 2;
    const frames = [
      { name: 'stand', pose: { t: 0.5, walk: 0, stride: 0, carry: 0, face: 0 } },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ pose: { t: 3 + i / 10, walk: 1, stride: i / 12, carry: 0, face: 0 } })),
      { pose: { t: 0.5, walk: 0, stride: 0, carry: 1, face: 0 } },
      { pose: { t: 0.8, walk: 1, stride: 0.12, carry: 1, face: 0 } },
      { pose: { t: 1.1, walk: 1, stride: 0.37, carry: 1, face: 0 } },
      { pose: { t: 0.5, walk: 0, stride: 0, carry: 0, face: 0.5 } },
      { pose: { t: 0.5, walk: 0, stride: 0, carry: 0, face: 1 } },
      { pose: { t: 0.5, walk: 0, stride: 0, carry: 1, face: 1 } }
    ];
    const big = 420, small = 0.34 * 390, cw = 330;
    const c = document.createElement('canvas');
    c.width = cw * frames.length * dpr; c.height = (big + small + 120) * dpr;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f1e6'; g.fillRect(0, 0, c.width, c.height);
    // big: a scale of its own, to judge the drawing; the ground line is where his feet stand
    g.strokeStyle = '#c9b9a0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, (big + 40) * dpr); g.lineTo(c.width, (big + 40) * dpr); g.stroke();
    frames.forEach((f, i) => {
      const k = big / C.BONGO_H * dpr;
      g.save(); g.translate((i + 0.5) * cw * dpr, (big + 40) * dpr); g.scale(k, k); C.drawBongo(g, f.pose, k); g.restore();
    });
    // small: as in the bakery on a phone, from the flying scale only (walking left: mirrored)
    C.prerender(1); C.prerender(Math.min(844 * 0.42, 390 * 0.52) / C.H * dpr); C.prerender(0.2);
    frames.forEach((f, i) => {
      const k = small / C.BONGO_H * dpr;
      g.save(); g.translate((i + 0.5) * cw * dpr, (big + small + 90) * dpr); g.scale(i % 5 === 4 ? -k : k, k); C.drawBongo(g, f.pose, 0.369); g.restore();
    });
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'bongo.png'), Buffer.from(burl.split(',')[1], 'base64'));
  cost.bongoMs = bcost;
  fs.writeFileSync(path.join(OUT, 'characters-cost.json'), JSON.stringify(cost, null, 2) + '\n');
  assert.ok(bcost > 0, 'the drawBongo cost measured nothing');
  assert.ok(bcost < 1, 'Characters.drawBongo ' + bcost.toFixed(3) + ' ms >= 1 ms');

  assert.ok(cost.ms > 0, 'the draw cost measured nothing');
  assert.ok(cost.ms < 1, 'Characters.draw ' + cost.ms.toFixed(3) + ' ms >= 1 ms');
}));

// Friends sheet: each friend in each state at 3 phases, big, and the husky again
// at the size it has on a phone. Also checks the cost of Friends.draw.
test('friends sheet, and Friends.draw under 1 ms', () => open(390, 844, async (page) => {
  const cost = await ev(page, () => new Promise((done) => {
    const F = window.Friends, dpr = 2, h = 0.34 * 390;
    F.build(h, dpr);
    const c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    const g = c.getContext('2d');
    const states = ['walk', 'sit', 'eat', 'happy'], pose = { t: 0, state: 'sit', p: 0 };
    const N = 500, PER = 5, WARM = 20;
    let i = -WARM, sum = 0;
    (function tick() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 400, 400);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t0 = performance.now();
      for (let k = 0; k < PER; k++, i++) {
        pose.t = 1 + i / 60; pose.p = ((i + 100) % 60) / 60; pose.state = states[Math.floor((i + 100) / 25) % 4];
        F.draw(g, 'husky', 100, 190, pose);
      }
      if (i > 0) sum += performance.now() - t0;
      if (i >= N) done(sum / N); else requestAnimationFrame(tick);
    })();
  }));
  console.log('Friends.draw (husky) ms/call:', cost.toFixed(3));
  const url = await ev(page, () => {
    // (one canvas pixel per unit: a sheet twice this size made Chrome drop the session)
    const F = window.Friends, h = 270;
    const c = document.createElement('canvas');
    c.width = 3100; c.height = F.KINDS.length * 300 + 200;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f1e6'; g.fillRect(0, 0, c.width, c.height);
    F.build(h, 1);
    const states = ['walk', 'sit', 'eat', 'happy'];
    F.KINDS.forEach((kind, r) => {
      states.forEach((state, si) => {
        [0, 1, 2].forEach((ph) => {
          const pose = { t: 2 + ph * 0.11 + (state === 'sit' && ph === 2 ? 1.15 : 0), state, p: state === 'walk' ? [0.1, 0.25, 0.6][ph] : ph / 3 };
          F.draw(g, kind, 140 + (si * 3 + ph) * 250, 296 + r * 300, pose);
        });
      });
    });
    // the husky as small as on a phone, leaving to the right (mirrored) too
    F.build(0.34 * 390, 1);
    const y = F.KINDS.length * 300 + 170;
    states.forEach((state, si) => [0, 1, 2].forEach((ph) => F.draw(g, 'husky', 100 + (si * 3 + ph) * 140, y, { t: 2 + ph * 0.11, state, p: state === 'walk' ? [0.1, 0.25, 0.6][ph] : ph / 3 })));
    g.save(); g.translate(1900, y); g.scale(-1, 1); F.draw(g, 'husky', 0, 0, { t: 1, state: 'walk', p: 0.25 }); g.restore();
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'friends.png'), Buffer.from(url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'friends-cost.json'), JSON.stringify({ husky: cost }, null, 2) + '\n');
  assert.ok(cost > 0, 'the draw cost measured nothing');
  assert.ok(cost < 1, 'Friends.draw ' + cost.toFixed(3) + ' ms >= 1 ms');
}));
