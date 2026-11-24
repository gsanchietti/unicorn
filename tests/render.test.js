'use strict';
// Render review: saves screenshots of every look to tests/out/ (git-ignored) and
// checks the render budget (average canvas render cost per frame on a phone).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer, launch, openGame, scene, tapPlay, playStars, playBakery, hold } = require('./helpers');

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
  await tapButton(page, 'bell');
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
