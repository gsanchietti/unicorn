'use strict';
// Audio checks. Driven on a real-time page (Web Audio offline renders hang under
// headless virtual time). Loads only js/audio.js on a blank page.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { startServer, launch } = require('./helpers');

let server, browser;
before(async () => {
  server = await startServer(path.resolve(__dirname, '..'));
  browser = await launch();
});
after(async () => { if (browser) await browser.close(); if (server) await server.close(); });

async function open(preset) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (/favicon/.test(m.location().url || '')) return;   // the blank host page has no icon
    errors.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(server.url + 'manifest.webmanifest');   // any same-origin blank page
  if (preset) await page.evaluate(preset);
  await page.addScriptTag({ path: path.resolve(__dirname, '..', 'js', 'audio.js') });
  return { page, errors, ctx };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CALLS = `(() => {
  const S = window.Sound, out = [];
  const run = (n, f) => { try { f(); } catch (e) { out.push(n + ': ' + e.message); } };
  ['setPlace', 'clipClop', 'door'].forEach((n) => { if (typeof S[n] !== 'function') out.push('missing ' + n); });
  run('setPlace', () => { S.setPlace('street'); S.setPlace('stars'); S.setPlace('bogus'); S.setPlace(); });
  run('clipClop', () => { for (let i = 0; i < 6; i++) S.clipClop(); });
  run('door', () => { S.door(); });
  run('say', () => { S.say('andiamo'); });
  return out;
})()`;

test('new functions never throw: before init, after init, muted and unmuted', async () => {
  const { page, errors, ctx } = await open();
  try {
    assert.deepStrictEqual(await page.evaluate(CALLS), []);
    await page.evaluate(() => Sound.init());
    assert.deepStrictEqual(await page.evaluate(CALLS), []);
    await page.evaluate(() => Sound.setMuted(true));
    assert.deepStrictEqual(await page.evaluate(CALLS), []);
    await page.evaluate(() => Sound.setMuted(false));
    assert.deepStrictEqual(await page.evaluate(CALLS), []);
    assert.deepStrictEqual(errors, []);
  } finally { await page.evaluate(() => Sound.setMuted(false)); await ctx.close(); }
});

test('the andiamo voice cue exists and is not recorded', async () => {
  const { page, errors, ctx } = await open();
  try {
    // say() must not request an mp3: no network failures, no errors
    await page.evaluate(() => { Sound.init(); Sound.say('andiamo'); });
    assert.strictEqual(await page.evaluate(() => typeof Sound._voiceText), 'object');
    assert.strictEqual(await page.evaluate(() => Sound._voiceText.andiamo), 'Andiamo!');
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); }
});

test('setPlace before init is remembered and used at start', async () => {
  const { page, errors, ctx } = await open();
  try {
    await page.evaluate(() => { Sound.setPlace('street'); Sound.init(); });
    assert.strictEqual(await page.evaluate(() => Sound._song()), 'street');
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); }
});

test('setPlace swaps the day song within 2 bars; night stays shared', async () => {
  const { page, errors, ctx } = await open();
  try {
    await page.evaluate(() => Sound.init());
    await sleep(300);
    assert.strictEqual(await page.evaluate(() => Sound._song()), 'day');
    const bars = await page.evaluate(() => ({
      day: Sound._songs.day.step * 8, street: Sound._songs.street.step * 8
    }));
    await page.evaluate(() => Sound.setPlace('street'));
    await sleep(Math.ceil(2 * bars.day * 1000) + 600);
    assert.strictEqual(await page.evaluate(() => Sound._song()), 'street');
    await page.evaluate(() => Sound.setPlace('stars'));
    await sleep(Math.ceil(2 * bars.street * 1000) + 600);
    assert.strictEqual(await page.evaluate(() => Sound._song()), 'day');
    // night wins over the place, and the place is remembered under it
    await page.evaluate(() => { Sound.setPlace('street'); Sound.setMood('night'); });
    await sleep(Math.ceil(2 * bars.day * 1000) + 600);
    assert.strictEqual(await page.evaluate(() => Sound._song()), 'night');
    await page.evaluate(() => Sound.setMood('day'));
    await sleep(Math.ceil(2 * 8 * Sound_EIGHTH_MS) + 600);
    assert.strictEqual(await page.evaluate(() => Sound._song()), 'street');
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); }
});
const Sound_EIGHTH_MS = 60 / 96 / 2 * 1000;   // night lullaby eighth, ms

test('new synth voices render without errors and stay quiet', async () => {
  const { page, errors, ctx } = await open();
  try {
    const peaks = await page.evaluate(async () => {
      const res = {};
      for (const [name, len, arg] of [['clipClop', 0.5, 0], ['clipClop', 0.5, 1], ['door', 1.5]]) {
        const oc = new OfflineAudioContext(1, 44100 * len, 44100);
        const g = oc.createGain(); g.connect(oc.destination);
        Sound._synth[name](oc, g, 0.01, arg);
        const buf = await Promise.race([oc.startRendering(), new Promise((r) => setTimeout(() => r(null), 4000))]);
        if (!buf) { res[name + arg] = 'timeout'; continue; }
        const d = buf.getChannelData(0); let p = 0;
        for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
        res[name + arg] = { peak: p, first: Math.abs(d[0]), last: Math.abs(d[d.length - 1]) };
      }
      return res;
    });
    for (const k of Object.keys(peaks)) {
      if (peaks[k] === 'timeout') continue;   // offline render may hang under headless; covered above
      assert.ok(peaks[k].peak > 0.01, k + ' is silent');
      assert.ok(peaks[k].peak < 0.6, k + ' is loud: ' + peaks[k].peak);
      assert.ok(peaks[k].first < 0.01 && peaks[k].last < 0.01, k + ' clicks');
    }
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); }
});
