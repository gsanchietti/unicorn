/* backdrop.js - the sky and hills behind every place, and the day/night cycle.
 * Classic script: window.Backdrop. Uses window.Art (painting) and window.Core (size, audio).
 *
 *   Backdrop.build()             repaint the size-dependent layers (the core calls it on resize)
 *   Backdrop.update(dt, clock)   advance time; the cycle advances only when `clock` is true
 *                                (the core passes the current scene's `clock`)
 *   Backdrop.draw(g, scrollX, opts)
 *                                sky, night sky, far clouds, hills, fireflies. opts (optional):
 *                                  top: y below the scene's HUD, where the moon rises to (kept)
 *                                  behind(g): drawn after the far clouds, before the hills
 *   Backdrop.setTime(phase)      'day' | 'sunset' | 'night' | 'sunrise'
 *   Backdrop.mood() -> 'day'|'night'   also sent to Sound.setMood when it changes
 *   Backdrop.hillH()             height of the hills band in CSS px
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core;
  var TAU = Math.PI * 2;
  var W = 0, H = 0, M = 0, DPR = 1, reduced = false;
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; return p * p * (3 - 2 * p); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var S = {};
  var deco = [], twinkles = [], flies = [];
  var t = 0, cyc = 0, mood = 'day', top = 0;

  function hillH() { return H * 0.26; }

  // ------------------------------------------------------------------ build
  function build() {
    sync();
    S.sky = Art.paintSky(W, H, DPR);
    var hh = hillH();
    S.hillBack = Art.paintHills(W, hh, DPR, { seed: 1, layer: 'back' });
    S.hillFront = Art.paintHills(W, hh, DPR, { seed: 2, layer: 'front' });
    S.skyS = Art.paintSunsetSky ? Art.paintSunsetSky(W, H, DPR) : null;
    S.skyN = Art.paintNightSky ? Art.paintNightSky(W, H, DPR) : null;
    var P = Art.PAL || {};
    S.hills = [
      [S.hillBack, tintTile(S.hillBack, P.sunsetTint, 0.2), tintTile(S.hillBack, P.nightTint, 0.55)],
      [S.hillFront, tintTile(S.hillFront, P.sunsetTint, 0.2), tintTile(S.hillFront, P.nightTint, 0.55)]
    ];
    S.deco = [1, 2, 3, 4].map(function (s) { return Art.cloudSprite(M * (0.18 + s * 0.04), DPR, { seed: s * 11, face: false }); });
    if (!deco.length) {
      for (var i = 0; i < 40; i++) twinkles.push({ x: Math.random(), y: 0.02 + Math.random() * 0.5, r: 0.008 + Math.random() * 0.012, sp: rnd(0.4, 1.4), ph: rnd(0, TAU) });
      for (i = 0; i < 6; i++) flies.push({ x: Math.random(), y: 0.6 + Math.random() * 0.2, sp: rnd(0.2, 0.4), ph: rnd(0, TAU), ph2: rnd(0, TAU) });
      for (i = 0; i < 5; i++) deco.push({ x: Math.random(), y: 0.08 + Math.random() * 0.45, k: i % 4, sp: 0.01 + Math.random() * 0.02, a: 0.8 + Math.random() * 0.15 });
    }
  }

  // A copy of a painted tile with a wash of the color over it (ink lines included).
  function tintTile(src, color, alpha) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color || '#1f2c63';
    g.globalAlpha = alpha;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ------------------------------------------------------------ day / night
  // day 75 s, sunset 12, night 50, sunrise 12
  var CYC = { day: 75, sun: 12, night: 50, rise: 12 };
  var CYC_LEN = CYC.day + CYC.sun + CYC.night + CYC.rise;
  var sky = { s: 0, n: 0, d: 1 };   // weights: sunset, night, day
  function sunsetAmts(p) {          // p 0..1 through the sunset: day -> sunset -> night
    if (p < 0.5) { sky.s = smooth(p * 2); sky.n = 0; }
    else { sky.n = smooth(p * 2 - 1); sky.s = 1 - sky.n; }
    sky.d = 1 - sky.s - sky.n;
  }
  function skyWeights() {
    var tc = cyc % CYC_LEN;
    if (tc < CYC.day) { sky.s = 0; sky.n = 0; sky.d = 1; }
    else if (tc < CYC.day + CYC.sun) sunsetAmts((tc - CYC.day) / CYC.sun);
    else if (tc < CYC.day + CYC.sun + CYC.night) { sky.s = 0; sky.n = 1; sky.d = 0; }
    else sunsetAmts(1 - (tc - CYC.day - CYC.sun - CYC.night) / CYC.rise);
    if (!S.skyS) { sky.d += sky.s; sky.s = 0; }
    if (!S.skyN) { sky.d += sky.n; sky.n = 0; }
  }
  function updateMood() {
    var tc = cyc % CYC_LEN, night = tc >= CYC.day + CYC.sun * 0.5 && tc < CYC.day + CYC.sun + CYC.night;
    var m = night ? 'night' : 'day';
    if (m !== mood) { mood = m; Core.snd('setMood', m); }
  }

  function update(dt, clock) {
    t += dt;
    if (clock) cyc += dt;
    updateMood();
  }

  function setTime(ph) {
    var o = { day: 10, sunset: CYC.day + CYC.sun / 2, night: CYC.day + CYC.sun + CYC.night / 2, sunrise: CYC.day + CYC.sun + CYC.night + CYC.rise / 2 };
    if (o[ph] !== undefined) cyc = o[ph];
  }

  // ------------------------------------------------------------------- draw
  // draw variants (day, sunset, night) crossfaded using at most two draws
  function crossDraw(g, v, x, y, w, h) {
    var ws = [sky.d, sky.s, sky.n], first = -1, i;
    for (i = 0; i < 3; i++) {
      if (ws[i] <= 0.001 || !v[i]) continue;
      if (first < 0) { first = i; g.drawImage(v[i], x, y, w, h); }
      else {
        g.globalAlpha = ws[i] / (ws[first] + ws[i]);
        g.drawImage(v[i], x, y, w, h);
        g.globalAlpha = 1;
      }
    }
  }

  function drawNightSky(g, nn) {
    var i;
    if (Art.drawTwinkle) {
      for (i = 0; i < twinkles.length; i++) {
        var q = twinkles[i];
        Art.drawTwinkle(g, q.x * W, q.y * H, q.r * M, nn * (reduced ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * q.sp + q.ph))));
      }
    }
    if (Art.drawMoon) {
      var r = M * 0.09, mx = Math.min(W * 0.55, W - 68 - 24 - r * 1.5);
      var topY = top + r * 1.5 + M * 0.03;
      var my = lerp(H * 0.55, topY, smooth(nn));
      g.globalAlpha = nn;
      Art.drawMoon(g, mx, my, r, t);
      g.globalAlpha = 1;
    }
  }

  function draw(g, scrollX, opts) {
    sync();
    if (opts && opts.top !== undefined) top = opts.top;
    skyWeights();
    crossDraw(g, [S.sky, S.skyS, S.skyN], 0, 0, W, H);
    var i, d, nn = sky.n;
    if (nn > 0.01) drawNightSky(g, nn);
    var dim = 1 - 0.6 * nn - 0.2 * sky.s;
    for (i = 0; i < deco.length; i++) {
      d = deco[i];
      var spr = S.deco[d.k], span = W + spr.lw;
      var x = ((d.x * span - t * d.sp * W - scrollX * 0.06) % span + span) % span - spr.lw / 2;
      Art.drawSprite(g, spr, x, d.y * H, 1, d.a * dim, 0);
    }
    if (opts && opts.behind) opts.behind(g);
    var hh = hillH(), y = H - hh;
    var x1 = -((scrollX * 0.25) % W), x2 = -((scrollX * 0.5) % W);
    x1 = Math.round(x1 * DPR) / DPR; x2 = Math.round(x2 * DPR) / DPR;
    crossDraw(g, S.hills[0], x1, y, W, hh); crossDraw(g, S.hills[0], x1 + W, y, W, hh);
    crossDraw(g, S.hills[1], x2, y, W, hh); crossDraw(g, S.hills[1], x2 + W, y, W, hh);
    if (nn > 0.01 && Art.drawFirefly) {
      for (i = 0; i < flies.length; i++) {
        var f = flies[i], fx = f.x * W, fy = f.y * H;
        if (!reduced) { fx += Math.sin(t * f.sp + f.ph) * M * 0.06; fy += Math.sin(t * f.sp * 1.3 + f.ph2) * M * 0.03; }
        Art.drawFirefly(g, fx, fy, M * 0.012, nn * (reduced ? 0.8 : 0.6 + 0.4 * Math.sin(t * 2 + f.ph)));
      }
    }
  }

  window.Backdrop = {
    build: build, update: update, draw: draw, setTime: setTime,
    mood: function () { return mood; },
    hillH: function () { sync(); return hillH(); }
  };
  if (window.__bella === undefined) window.__bella = {};
  window.__bella.setTime = setTime;
})();
