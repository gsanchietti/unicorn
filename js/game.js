/* game.js - gameplay for "Stella e Bongo". Classic script, no modules.
 * Uses window.Art (sprites/painting) and window.Sound (audio, never allowed to break the game). */
(function () {
  'use strict';

  var Art = window.Art, Sound = window.Sound;
  var TAU = Math.PI * 2;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var muteBtn = document.getElementById('mute');

  // ------------------------------------------------------------ small utils
  function snd(name) {
    try {
      if (Sound && Sound[name]) return Sound[name].apply(Sound, Array.prototype.slice.call(arguments, 1));
    } catch (e) { /* audio must never break the game */ }
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function backOut(p) { p = clamp(p, 0, 1) - 1; return 1 + p * p * (2.6 * p + 1.6); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  var reduced = false;
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = mq.matches;
    var onMq = function (e) { reduced = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  } catch (e) { /* ignore */ }

  // ------------------------------------------------------------------ state
  var W = 0, H = 0, DPR = 1, M = 0;       // M = min(W,H)
  var st = {
    mode: 'title', t: 0, mt: 0,             // mt = time in current mode
    score: 0, best: 0, sinceWash: 0, held: false,
    sf: 0.3, scroll: 0,
    stars: [], clouds: [], mud: null, parts: [], bubbles: [], bonus: [], timers: [],
    splotches: null, dirtyNeed: false, idle: 0, popT: 0,
    hero: { x: 0, y: 0, h: 100, vy: 0, rot: 0 },
    from: null, toDur: 0.9,
    starT: 0.6, cloudT: 2.0, trailT: 0, noCtl: 0,
    cyc: 0, mood: 'day', rainbow: null, bigPop: 9, slotPop: [], nBonusDone: 0, fade: 1, sparkT: 0
  };
  var i0;
  for (i0 = 0; i0 < 10; i0++) st.slotPop.push(9);

  try { st.best = parseInt(localStorage.getItem('stella.best'), 10) || 0; } catch (e) { st.best = 0; }
  function saveBest() {
    try { localStorage.setItem('stella.best', String(st.best)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- sprites
  var S = {};            // size-dependent sprites
  var heroImg = null, dirtyC = null, dirtyG = null, HW = 657, HC = 730;
  var BONGO_X = 0.45, BONGO_BOTTOM = 0.53, BONGO_H = 0.48, MT = 30;
  var SPLOT_DEF = null;

  function placeholder(w, h, color, shape) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    g.arc(w / 2, h * 0.55, Math.min(w, h) * 0.42, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(w * 0.62, h * 0.45, w * 0.05, 0, TAU); g.arc(w * 0.38, h * 0.45, w * 0.05, 0, TAU); g.fill();
    return c;
  }

  function composeHero(stella, bongo) {
    var sw = stella.width, sh = stella.height;
    var bh = sh * BONGO_H, bw = bh * bongo.width / bongo.height;
    HW = sw; HC = sh + MT;
    var c = document.createElement('canvas');
    c.width = HW; c.height = HC;
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(stella, 0, MT, sw, sh);
    var bx = BONGO_X * sw - bw / 2, by = MT + BONGO_BOTTOM * sh - bh;
    g.drawImage(bongo, bx, by, bw, bh);
    heroImg = c;
    dirtyC = document.createElement('canvas');
    dirtyC.width = HW; dirtyC.height = HC;
    dirtyG = dirtyC.getContext('2d');
    // splotch positions: stella-image fractions or bongo-image fractions
    function sp(fx, fy, rf) { return { x: fx * sw, y: MT + fy * sh, rf: rf }; }
    function bp(fx, fy, rf) { return { x: bx + fx * bw, y: by + fy * bh, rf: rf }; }
    SPLOT_DEF = [
      sp(0.24, 0.42, 1.0), sp(0.5, 0.58, 1.0), sp(0.68, 0.5, 0.95), sp(0.77, 0.33, 0.85),
      sp(0.87, 0.24, 0.8), sp(0.27, 0.76, 0.7), sp(0.68, 0.76, 0.7),
      bp(0.34, 0.27, 0.75), bp(0.5, 0.6, 0.95), bp(0.15, 0.45, 0.65)
    ];
  }

  function loadHero(done) {
    var imgs = {}, left = 2;
    function fin() {
      if (--left) return;
      composeHero(imgs.s || placeholder(657, 700, '#ffb8d6'), imgs.b || placeholder(519, 700, '#8a6a4a'));
      done();
    }
    ['s', 'b'].forEach(function (k) {
      var im = new Image();
      im.onload = function () { imgs[k] = im; fin(); };
      im.onerror = function () { fin(); };
      im.src = k === 's' ? 'assets/stella.png' : 'assets/bongo.png';
    });
  }

  // ---------------------------------------------------------------- geometry
  function heroFlyH() { return Math.min(H * 0.34, W * 0.42); }
  function heroAspect() { return HW / HC; }
  function flyX() { return W * (W < H ? 0.3 : 0.26); }
  function baseSpeed() { return Math.max(0.26 * W, 0.18 * H); }
  function hillH() { return H * 0.26; }

  var bar = null, barKey = '';
  function barMetrics() {
    var m = M;
    S.bigR = clamp(m * 0.05, 16, 28);
    S.pad = clamp(m * 0.022, 8, 13);
    S.availL = 12;
    S.availR = W - 12 - 68 - 12;
    S.availW = Math.max(120, S.availR - S.availL);
    var sr = clamp(m * 0.03, 10, 17);
    var step = Math.min(sr * 2.6, (S.availW - 2 * S.pad) / 10);
    sr = Math.min(sr, step / 2.1);
    S.slotR = sr; S.slotStep = step;
    S.bigSpr = Art.starSprite(S.bigR, DPR, {});
    S.slotFull = Art.starSprite(sr, DPR, { glow: false });
    S.slotEmpty = Art.starSprite(sr, DPR, { empty: true, glow: false });
    barKey = '';
  }

  function layoutBar() {
    var nBig = Math.floor(st.score / 10);
    var key = W + 'x' + H + 'x' + nBig;
    if (key === barKey && bar) return bar;
    barKey = key;
    var b = bar || (bar = {});
    var pad = S.pad, bigR = S.bigR, top = 12, left = S.availL;
    var slotsW = 10 * S.slotStep, bigFull = bigR * 2.3, gap = nBig ? pad : 0;
    var need = 2 * pad + nBig * bigFull + gap + slotsW;
    b.x = left; b.y = top; b.n = nBig;
    if (need <= S.availW && W >= 560) {
      b.rows = 1; b.w = need; b.h = 2 * bigR + 2 * pad;
      b.bigStep = bigFull;
      b.bigY = b.slotY = top + b.h / 2;
      b.bigX0 = left + pad + bigR - (bigFull - 2 * bigR) / 2 + bigFull / 2 - bigR + (bigR - bigFull / 2) * 0;
      b.bigX0 = left + pad + bigFull / 2;
      b.slotX0 = left + pad + nBig * bigFull + gap + S.slotStep / 2;
    } else {
      b.rows = 2;
      var bigStep = bigFull, rowBig = 0;
      if (nBig) {
        bigStep = Math.min(bigFull, (S.availW - 2 * pad - 2 * bigR) / Math.max(nBig - 1, 1));
        rowBig = 2 * bigR + (nBig - 1) * bigStep;
      }
      b.bigStep = bigStep;
      b.w = Math.max(slotsW, rowBig) + 2 * pad;
      b.bigY = top + pad + bigR;
      b.bigX0 = left + pad + bigR;
      b.slotY = top + pad + (nBig ? 2 * bigR + pad * 0.7 : 0) + S.slotR;
      b.slotX0 = left + pad + S.slotStep / 2;
      b.h = (b.slotY + S.slotR + pad) - top;
    }
    b.bottom = top + b.h;
    return b;
  }
  function slotPos(i) { var b = layoutBar(); return { x: b.slotX0 + i * S.slotStep, y: b.slotY }; }

  function heroLimits(hh) {
    var b = layoutBar(), h = hh || st.hero.h;
    return { top: b.bottom + h * 0.42, bottom: H - hillH() * 0.4 - h * 0.4 };
  }
  function flyTarget() {
    var l = heroLimits(heroFlyH());
    return { x: flyX(), y: (l.top + l.bottom) / 2, h: heroFlyH() };
  }
  function washTarget() {
    var bb = layoutBar().bottom, space = H - bb;
    var h = Math.min(0.78 * space, 0.86 * W / heroAspect());
    return { x: W / 2, y: bb + space / 2, h: h };
  }
  function titleTarget() {
    return { x: W / 2, y: H * 0.3, h: Math.min(H * 0.3, W * 0.55) };
  }

  // ------------------------------------------------------------- resize/build
  var deco = [], twinkles = [], flies = [];
  function build() {
    S.sky = Art.paintSky(W, H, DPR);
    var hh = hillH();
    S.hillBack = Art.paintHills(W, hh, DPR, { seed: 1, layer: 'back' });
    S.hillFront = Art.paintHills(W, hh, DPR, { seed: 2, layer: 'front' });
    S.skyS = Art.paintSunsetSky ? Art.paintSunsetSky(W, H, DPR) : null;
    S.skyN = Art.paintNightSky ? Art.paintNightSky(W, H, DPR) : null;
    var P = Art.PAL || {};
    S.hills = [
      [S.hillBack, tintTile(S.hillBack, P.sunsetTint, '#ff9a6a'), tintTile(S.hillBack, P.nightTint, '#3b3a7a')],
      [S.hillFront, tintTile(S.hillFront, P.sunsetTint, '#ff9a6a'), tintTile(S.hillFront, P.nightTint, '#3b3a7a')]
    ];
    var hf = heroFlyH();
    S.starR = clamp(M * 0.062, 20, 46);
    S.star = Art.starSprite(S.starR, DPR, { face: true });
    S.cloudW = hf * 0.78;
    S.clouds = [1, 2, 3].map(function (s) { return Art.cloudSprite(S.cloudW, DPR, { seed: s * 3 + 1, face: true }); });
    S.mudCloud = Art.cloudSprite(hf * 1.15, DPR, { seed: 5, mud: true, face: true });
    S.bubbles = [M * 0.016, M * 0.026, M * 0.04].map(function (r) { return Art.bubbleSprite(r, DPR); });
    S.deco = [1, 2, 3, 4].map(function (s) { return Art.cloudSprite(M * (0.34 + s * 0.07), DPR, { seed: s * 11, face: false }); });
    S.spark = [makeSparkle('#fffbe0', '#ffe581'), makeSparkle('#ffffff', '#ffb8d6'), makeSparkle('#fffbff', '#d3bdf2')];
    barMetrics();
    if (!deco.length) {
      for (var i = 0; i < 40; i++) twinkles.push({ x: Math.random(), y: 0.02 + Math.random() * 0.5, r: 0.008 + Math.random() * 0.012, sp: rnd(0.4, 1.4), ph: rnd(0, TAU) });
      for (i = 0; i < 6; i++) flies.push({ x: Math.random(), y: 0.6 + Math.random() * 0.2, sp: rnd(0.2, 0.4), ph: rnd(0, TAU), ph2: rnd(0, TAU) });
      for (i = 0; i < 5; i++) deco.push({ x: Math.random(), y: 0.08 + Math.random() * 0.45, k: i % 4, sp: 0.01 + Math.random() * 0.02, a: 0.18 + Math.random() * 0.14 });
    }
  }

  function tintTile(src, color, fallback) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color || fallback;
    if (!color || /^#/.test(color)) g.globalAlpha = 0.55;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // day/night cycle: day 75 s, sunset 12, night 50, sunrise 12
  var CYC = { day: 75, sun: 12, night: 50, rise: 12 };
  var CYC_LEN = CYC.day + CYC.sun + CYC.night + CYC.rise;
  var sky = { s: 0, n: 0, d: 1 };   // weights: sunset, night, day
  function sunsetAmts(p) {          // p 0..1 through the sunset: day -> sunset -> night
    if (p < 0.5) { sky.s = smooth(p * 2); sky.n = 0; }
    else { sky.n = smooth(p * 2 - 1); sky.s = 1 - sky.n; }
    sky.d = 1 - sky.s - sky.n;
  }
  function skyWeights() {
    var t = st.cyc % CYC_LEN;
    if (t < CYC.day) { sky.s = 0; sky.n = 0; sky.d = 1; }
    else if (t < CYC.day + CYC.sun) sunsetAmts((t - CYC.day) / CYC.sun);
    else if (t < CYC.day + CYC.sun + CYC.night) { sky.s = 0; sky.n = 1; sky.d = 0; }
    else sunsetAmts(1 - (t - CYC.day - CYC.sun - CYC.night) / CYC.rise);
    if (!S.skyS) { sky.d += sky.s; sky.s = 0; }
    if (!S.skyN) { sky.d += sky.n; sky.n = 0; }
  }
  function updateMood() {
    var t = st.cyc % CYC_LEN, night = t >= CYC.day + CYC.sun * 0.5 && t < CYC.day + CYC.sun + CYC.night;
    var m = night ? 'night' : 'day';
    if (m !== st.mood) { st.mood = m; snd('setMood', m); }
  }
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

  function makeSparkle(core, glow) {
    var s = Math.round(M * 0.07), spr = Art.makeCanvas(s * 2 * DPR, s * 2 * DPR);
    spr.lw = s * 2; spr.lh = s * 2;
    var g = spr.getContext('2d');
    g.scale(DPR, DPR);
    var c = s;
    var gr = g.createRadialGradient(c, c, 0, c, c, s);
    gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 0.45; g.fillStyle = gr; g.beginPath(); g.arc(c, c, s, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = core;
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? s * 0.16 : s * 0.78;
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.strokeStyle = glow; g.lineWidth = 1.2; g.stroke();
    return spr;
  }

  var resizeTimer = 0;
  function applySize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight; M = Math.min(W, H);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  function onResize() {
    applySize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      build();
      refit();
    }, 150);
  }
  // re-place the hero after resize according to the mode
  function refit() {
    var h = st.hero, t;
    if (st.mode === 'title') t = titleTarget();
    else if (st.mode === 'wash' || st.mode === 'clean') t = washTarget();
    else if (st.mode === 'fly') {
      h.h = heroFlyH(); h.x = flyX();
      var l = heroLimits(); h.y = clamp(h.y, l.top, l.bottom);
      return;
    } else return;
    h.x = t.x; h.y = t.y; h.h = t.h;
  }

  // ------------------------------------------------------------------ drawing
  function drawSpr(g, spr, x, y, sx, sy, alpha, rot) {
    var w = (spr.lw || spr.width / DPR) * sx, h = (spr.lh || spr.height / DPR) * sy;
    var pa = g.globalAlpha;
    g.globalAlpha = pa * alpha;
    if (rot) {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.drawImage(spr, -w / 2, -h / 2, w, h);
      g.restore();
    } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
    g.globalAlpha = pa;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function popScale(t, big) {
    if (t > 0.5) return 1;
    return 1 + (big ? 0.7 : 0.55) * Math.sin(Math.PI * t / 0.5);
  }

  // ------------------------------------------------------------------ timers
  function after(delay, fn) { st.timers.push({ t: delay, fn: fn }); }

  // -------------------------------------------------------------- particles
  function addPart(p) {
    if (st.parts.length > 220) st.parts.shift();
    st.parts.push(p);
  }
  function burst(x, y, n, spread) {
    if (reduced) n = Math.ceil(n * 0.4);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = rnd(0.2, 1) * spread * (reduced ? 0.6 : 1);
      addPart({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.5, 0.9), s: rnd(0.35, 0.8), spr: (Math.random() * 3) | 0, rot: rnd(0, 3), g: 0 });
    }
  }
  function sparkAround(cx, cy, rx, ry) {
    var a = Math.random() * TAU, d = Math.sqrt(Math.random());
    addPart({ k: 's', x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, vx: 0, vy: -M * 0.03, life: 0, max: rnd(0.7, 1.2), s: rnd(0.4, 1), spr: (Math.random() * 3) | 0, rot: rnd(0, 3), g: 0 });
  }
  function droplets(x, y, n) {
    if (reduced) n = Math.ceil(n * 0.5);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = rnd(0.2, 1) * M * 0.9;
      addPart({ k: 'd', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - M * 0.3, life: 0, max: rnd(0.7, 1.2), r: rnd(0.012, 0.03) * M, c: Math.random() < 0.4 ? Art.PAL.mudDark : Art.PAL.mud, g: M * 2.2 });
    }
  }
  function confetti() {
    var n = reduced ? 8 : 70;
    for (var i = 0; i < n; i++) {
      addPart({ k: 'c', x: rnd(0, W), y: rnd(-0.25 * H, -10), vx: 0, vy: rnd(0.12, 0.26) * H, life: 0, max: 9, w: rnd(4, 8) * (M / 400 + 0.5), h: rnd(2.5, 5) * (M / 400 + 0.5), rot: rnd(0, TAU), vr: rnd(-3, 3), ph: rnd(0, TAU), c: pick(Art.PAL.confetti), sw: rnd(0.02, 0.06) * W });
    }
  }
  function updateParts(dt) {
    var a = st.parts, n = 0;
    for (var i = 0; i < a.length; i++) {
      var p = a[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.k === 'c') {
        p.y += p.vy * dt; p.rot += p.vr * dt; p.ph += dt * 3;
        p.x += Math.sin(p.ph) * p.sw * dt * 3;
        if (p.y > H + 20) continue;
      } else {
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= (1 - dt * 0.8); if (p.k === 's') p.vy *= (1 - dt * 0.8);
      }
      a[n++] = p;
    }
    a.length = n;
    var b = st.bubbles, m2 = 0;
    for (i = 0; i < b.length; i++) {
      var q = b[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      q.y -= q.vy * dt;
      q.ph += dt * 4;
      q.x += Math.sin(q.ph) * M * 0.03 * dt;
      b[m2++] = q;
    }
    b.length = m2;
  }
  function drawParts(g) {
    var a = st.parts, i, p, f;
    for (i = 0; i < a.length; i++) {
      p = a[i]; f = p.life / p.max;
      if (p.k === 's') {
        var sc = p.s * Math.sin(Math.PI * Math.min(1, f * 1.1));
        if (sc > 0.02) drawSpr(g, S.spark[p.spr], p.x, p.y, sc, sc, 1, p.rot + p.life * 2);
      } else if (p.k === 'd') {
        g.globalAlpha = f > 0.7 ? (1 - f) / 0.3 : 1;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - f * 0.3), 0, TAU); g.fill();
        g.globalAlpha = 1;
      } else if (p.k === 'c') {
        g.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : 1;
        g.fillStyle = p.c;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(p.ph * 0.8)) * 0.8 + 0.2);
        g.beginPath(); g.ellipse(0, 0, p.w, p.h, 0, 0, TAU); g.fill();
        g.restore(); g.globalAlpha = 1;
      }
    }
    var b = st.bubbles;
    for (i = 0; i < b.length; i++) {
      p = b[i]; f = p.life / p.max;
      var s = f > 0.85 ? 1 + (f - 0.85) * 2 : 0.6 + f * 0.5;
      drawSpr(g, S.bubbles[p.k], p.x, p.y, s, s, f > 0.85 ? (1 - f) / 0.15 : 0.9, 0);
    }
  }

  // ------------------------------------------------------------------ scoring
  function milestoneIn(a, b) {
    for (var v = a + 1; v <= b; v++) if (v === 10 || v === 25 || (v >= 50 && v % 50 === 0)) return true;
    return false;
  }
  function addPoints(n) {
    var old = st.score;
    for (var k = 0; k < n; k++) st.slotPop[(old + k) % 10] = 0;
    st.score += n;
    if (Math.floor(st.score / 10) > Math.floor(old / 10)) st.bigPop = 0;
    if (st.score > st.best) { st.best = st.score; saveBest(); }
    if (milestoneIn(old, st.score)) milestone();
  }
  function milestone() {
    confetti();
    st.rainbow = { t: 0 };
    snd('fanfare');
    after(0.45, function () { snd('say', 'bravissima'); });
  }

  // -------------------------------------------------------------- mode changes
  function setMode(m) { st.mode = m; st.mt = 0; }

  function startGame() {
    st.score = 0; st.sinceWash = 0; st.held = false;
    st.stars.length = 0; st.clouds.length = 0; st.mud = null;
    for (var i = 0; i < 10; i++) st.slotPop[i] = 9;
    st.bigPop = 9;
    beginToFly(0.6);
    snd('say', 'via');
  }
  function beginToFly(dur) {
    var h = st.hero;
    st.from = { x: h.x, y: h.y, h: h.h };
    st.toDur = dur || 0.9;
    h.vy = 0; h.rot = 0;
    setMode('toFly');
  }
  function mudHit() {
    var h = st.hero;
    snd('splat');
    droplets(h.x, h.y, 26);
    st.mud = null;
    var shapes = SPLOT_DEF.map(function (d, i) {
      return { x: d.x, y: d.y, r: d.rf * 0.075 * HW, amount: 1, shape: Art.makeSplotch(Art.rng(i * 17 + 3)) };
    });
    st.splotches = shapes;
    st.popT = 0; st.dirtyNeed = true;
    st.from = { x: h.x, y: h.y, h: h.h };
    st.toDur = 0.9;
    h.vy = 0; h.rot = 0;
    setMode('toWash');
    after(0.7, function () { snd('say', 'laviamo'); });
  }
  function startClean() {
    setMode('clean');
    st.nBonusDone = 0;
    snd('sparkle');
    after(0.25, function () { snd('say', 'puliti'); });
    var launched = 0;
    for (var i = 0; i < 5; i++) {
      after(1.6 + i * 0.3, function () { launchBonus(launched++); });
    }
    after(1.6 + 4 * 0.3 + 0.9 + 0.8, function () { beginToFly(0.9); });
  }
  function launchBonus(k) {
    var h = st.hero, target = slotPos((st.score + st.bonus.length) % 10);
    var x0 = h.x + rnd(-0.15, 0.15) * h.h, y0 = h.y + rnd(-0.15, 0.1) * h.h;
    st.bonus.push({ x0: x0, y0: y0, x1: target.x, y1: target.y, t: 0, dur: 0.9, arc: rnd(0.25, 0.45) * (k % 2 ? 1 : -1) * M, k: k, s0: 1.3 });
    snd('sparkle');
  }

  // -------------------------------------------------------------------- rubbing
  function heroRect() {
    var h = st.hero, w = h.h * heroAspect();
    return { x: h.x - w / 2, y: h.y - h.h / 2, w: w, h: h.h, k: h.h / HC };
  }
  function rubAt(px, py, dist, qx, qy) {
    if (qx === undefined) { qx = px; qy = py; }
    var sp = st.splotches;
    if (!sp) return;
    var r = heroRect(), brush = 0.07 * M, hit = false;
    for (var i = 0; i < sp.length; i++) {
      var s = sp[i];
      if (s.amount <= 0) continue;
      var sx = r.x + s.x * r.k, sy = r.y + s.y * r.k, sr = s.r * r.k;
      var d = segDist(sx, sy, qx, qy, px, py);
      if (d < sr + brush) {
        s.amount = Math.max(0, s.amount - dist / (4 * sr));
        hit = true;
      }
    }
    if (hit) { st.dirtyNeed = true; }
    st.idle = 0;
  }
  function segDist(x, y, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
  }
  function addBubble(x, y) {
    if (st.bubbles.length > 60) st.bubbles.shift();
    st.bubbles.push({ x: x + rnd(-1, 1) * M * 0.02, y: y + rnd(-1, 1) * M * 0.02, vy: rnd(0.05, 0.12) * M, ph: rnd(0, TAU), life: 0, max: rnd(1.0, 1.8) * (reduced ? 0.6 : 1), k: (Math.random() * 3) | 0 });
  }

  function renderDirty() {
    var g = dirtyG, sp = st.splotches;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, HW, HC);
    g.drawImage(heroImg, 0, 0);
    if (sp) {
      g.globalCompositeOperation = 'source-atop';
      for (var i = 0; i < sp.length; i++) {
        var s = sp[i];
        if (s.amount <= 0.01) continue;
        var pop = st.popT >= 1 ? 1 : backOut((st.popT * 1.6 - i * 0.05) / 0.5);
        if (pop <= 0) continue;
        Art.drawSplotch(g, s.shape, s.x, s.y, s.r * pop, Math.min(1, s.amount));
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  // --------------------------------------------------------------------- update
  var sfTarget = { title: 0.3, fly: 1, toWash: 0, wash: 0, clean: 0, toFly: 1 };

  function spawnStar() {
    var l = heroLimits();
    st.stars.push({ x: W + S.starR * 2, y: rnd(l.top, l.bottom), ph: rnd(0, TAU), got: false });
  }
  function spawnCloud() {
    var l = heroLimits(), spr = pick(S.clouds);
    st.clouds.push({ x: W + S.cloudW, y: rnd(l.top, l.bottom), spr: spr, sc: rnd(0.85, 1.1), cd: 0, sq: 0, drift: rnd(-0.02, 0.02) * M, ph: rnd(0, TAU) });
  }
  function spawnMud() {
    var h = st.hero;
    st.mud = { x: W + S.mudCloud.lw, y: h.y, ph: 0, passed: false };
  }

  function heroBody() {
    var h = st.hero;
    return { x: h.x - h.h * 0.02, y: h.y + h.h * 0.04, r: h.h * 0.34 };
  }

  function holding() {
    if (st.noCtl > 0) return false;
    var any = false;
    pointers.forEach(function (p) { if (!p.sup) any = true; });
    return any;
  }

  function updateFly(dt) {
    var h = st.hero, l = heroLimits(), spd = baseSpeed();
    var hold = holding();
    if (hold) st.held = true;
    st.noCtl = Math.max(0, st.noCtl - dt);
    if (hold) h.vy -= 2.9 * H * dt; else h.vy += 0.85 * H * dt;
    h.vy = clamp(h.vy, -0.5 * H, 0.3 * H);
    h.y += h.vy * dt;
    if (h.y < l.top) { h.y = l.top; h.vy = Math.abs(h.vy) * 0.35 + 0.03 * H; }
    if (h.y > l.bottom) { h.y = l.bottom; h.vy = -(Math.abs(h.vy) * 0.35 + 0.05 * H); }
    h.rot = lerp(h.rot, clamp(h.vy / H, -0.5, 0.3) * 0.5, Math.min(1, dt * 8));

    // sparkle trail
    if (!reduced) {
      st.trailT -= dt;
      if (st.trailT <= 0) {
        st.trailT = 0.07;
        addPart({ k: 's', x: h.x - h.h * 0.4 + rnd(-1, 1) * 4, y: h.y + h.h * 0.08 + rnd(-1, 1) * h.h * 0.05, vx: -spd * 0.3, vy: rnd(-1, 1) * M * 0.02, life: 0, max: 0.7, s: rnd(0.25, 0.5), spr: (Math.random() * 3) | 0, rot: rnd(0, 3), g: 0 });
      }
    }

    // spawns
    if (!st.mud) {
      st.starT -= dt;
      if (st.starT <= 0) { spawnStar(); st.starT = 1.2; }
      st.cloudT -= dt;
      if (st.cloudT <= 0) { spawnCloud(); st.cloudT = rnd(3, 4); }
    }

    var body = heroBody(), i, s;
    for (i = st.stars.length - 1; i >= 0; i--) {
      s = st.stars[i];
      s.x -= spd * dt;
      if (Math.hypot(s.x - body.x, s.y - body.y) < body.r + S.starR * 0.9) {
        burst(s.x, s.y, 12, M * 0.35);
        st.sinceWash++;
        snd('star', st.sinceWash);
        addPoints(1);
        st.stars.splice(i, 1);
        continue;
      }
      if (s.x < -S.starR * 3) st.stars.splice(i, 1);
    }
    for (i = st.clouds.length - 1; i >= 0; i--) {
      s = st.clouds[i];
      s.x -= spd * 0.85 * dt;
      s.y += Math.sin(st.t * 0.8 + s.ph) * 0.0 + s.drift * dt * 0.2;
      s.cd = Math.max(0, s.cd - dt);
      s.sq = Math.max(0, s.sq - dt);
      if (s.cd <= 0 && Math.hypot(s.x - body.x, s.y - body.y) < body.r + s.spr.hitR * s.sc * 0.85) {
        s.cd = 1.5; s.sq = 0.45;
        var dir = h.y < s.y ? -1 : 1;
        h.vy = dir * 0.55 * H;
        st.noCtl = 0.3;
        snd('boing');
      }
      if (s.x < -S.cloudW * 1.5) st.clouds.splice(i, 1);
    }

    // sinceWash threshold -> mud
    if (st.sinceWash >= 15 && !st.mud) spawnMud();
    var m = st.mud;
    if (m) {
      m.x -= spd * 1.0 * dt;
      m.ph += dt;
      m.y += (h.y - m.y) * Math.min(1, 3.2 * dt);
      var hitR = S.mudCloud.hitR || S.mudCloud.lw * 0.4;
      if (Math.hypot(m.x - body.x, m.y - body.y) < body.r + hitR * 0.8 || m.x < h.x - h.h) mudHit();
    }
  }

  function updateTransition(dt, from, to, onDone) {
    var p = clamp(st.mt / st.toDur, 0, 1), e = smooth(p), h = st.hero;
    h.x = lerp(from.x, to.x, e); h.y = lerp(from.y, to.y, e); h.h = lerp(from.h, to.h, e);
    h.rot *= (1 - Math.min(1, dt * 6));
    if (p >= 1) onDone();
  }

  function update(dt) {
    st.t += dt; st.mt += dt;
    st.fade = 1;
    var mode = st.mode, h = st.hero, spd = baseSpeed();
    st.sf += (sfTarget[mode] - st.sf) * Math.min(1, dt * 3);
    if (Math.abs(sfTarget[mode] - st.sf) < 0.003) st.sf = sfTarget[mode];
    st.scroll += spd * st.sf * dt;
    if (mode !== 'title') st.cyc += dt;
    updateMood();

    for (var i = st.timers.length - 1; i >= 0; i--) {
      var tm = st.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { st.timers.splice(i, 1); tm.fn(); }
    }
    if (st.rainbow) { st.rainbow.t += dt; if (st.rainbow.t > 5.2) st.rainbow = null; }
    for (i = 0; i < 10; i++) if (st.slotPop[i] < 9) st.slotPop[i] += dt;
    if (st.bigPop < 9) st.bigPop += dt;

    if (mode === 'title') {
      var t = titleTarget();
      h.x = t.x; h.y = t.y; h.h = t.h; h.rot = 0;
    } else if (mode === 'fly') {
      updateFly(dt);
    } else if (mode === 'toWash') {
      st.popT = Math.min(1, st.popT + dt / 0.6);
      st.fade = 1 - smooth(st.mt / st.toDur);
      updateTransition(dt, st.from, washTarget(), function () {
        setMode('wash'); st.idle = 1.2;
        st.stars.length = 0; st.clouds.length = 0;
      });
      if (st.popT < 1) st.dirtyNeed = true;
    } else if (mode === 'wash') {
      var w = washTarget(); h.x = w.x; h.y = w.y; h.h = w.h; h.rot = 0;
      st.idle += dt;
      st.popT = 1;
      var done = true;
      for (i = 0; i < st.splotches.length; i++) if (st.splotches[i].amount > 0.06) { done = false; break; }
      if (done) startClean();
    } else if (mode === 'clean') {
      var w2 = washTarget(); h.x = w2.x; h.y = w2.y; h.h = w2.h; h.rot = 0;
      if (st.splotches) {
        var any = false;
        for (i = 0; i < st.splotches.length; i++) {
          var sp = st.splotches[i];
          if (sp.amount > 0) { sp.amount = Math.max(0, sp.amount - dt * 5); any = true; }
        }
        if (any) st.dirtyNeed = true; else st.splotches = null, st.dirtyNeed = true;
      }
      st.sparkT -= dt;
      if (st.sparkT <= 0) { st.sparkT = reduced ? 0.15 : 0.045; sparkAround(h.x, h.y, h.h * 0.48, h.h * 0.5); }
    } else if (mode === 'toFly') {
      st.fade = 1;
      updateTransition(dt, st.from, flyTarget(), function () {
        setMode('fly');
        st.sinceWash = 0; st.mud = null; st.starT = 0.8; st.cloudT = 2.2; h.vy = 0;
        st.splotches = null;
      });
    }

    // entities outside fly mode drift away
    if (mode !== 'fly') {
      var drift = spd * 1.4 * dt;
      for (i = 0; i < st.stars.length; i++) { st.stars[i].x -= drift; st.stars[i].y -= M * 0.05 * dt; }
      for (i = 0; i < st.clouds.length; i++) { st.clouds[i].x -= drift; }
    }

    // bonus stars
    for (i = st.bonus.length - 1; i >= 0; i--) {
      var b = st.bonus[i];
      b.t += dt;
      if (b.t >= b.dur) {
        st.bonus.splice(i, 1);
        var sp2 = { x: b.x1, y: b.y1 };
        burst(sp2.x, sp2.y, 6, M * 0.15);
        st.sinceWash++;
        snd('star', 15 + b.k + 1);
        addPoints(1);
      }
    }

    if (st.dirtyNeed && st.splotches !== undefined) {
      renderDirty(); st.dirtyNeed = false;
    }
    updateParts(dt);
  }

  // ----------------------------------------------------------------------- draw
  function drawHero(g) {
    var h = st.hero, w = h.h * heroAspect();
    var bob = 0;
    if (!reduced && (st.mode === 'fly' || st.mode === 'title' || st.mode === 'toFly')) bob = Math.sin(st.t * 2.4) * M * 0.011;
    var img = (st.splotches && (st.mode === 'toWash' || st.mode === 'wash' || st.mode === 'clean')) ? dirtyC : heroImg;
    if (st.mode === 'clean' && !st.splotches) img = heroImg;
    if (st.mode === 'toWash' && st.mt === 0) img = dirtyC;
    if (!img) return;
    g.save();
    g.translate(h.x, h.y + bob);
    if (h.rot) g.rotate(h.rot);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    var sc = 1;
    if (st.mode === 'clean') sc = 1 + 0.025 * Math.sin(st.mt * 6) * Math.max(0, 1 - st.mt);
    g.scale(sc, sc);
    g.drawImage(img, -w / 2, -h.h / 2, w, h.h);
    g.restore();
  }

  function drawNightSky(g, nn) {
    var i, b = layoutBar();
    if (Art.drawTwinkle) {
      for (i = 0; i < twinkles.length; i++) {
        var q = twinkles[i];
        Art.drawTwinkle(g, q.x * W, q.y * H, q.r * M, nn * (reduced ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.t * q.sp + q.ph))));
      }
    }
    if (Art.drawMoon) {
      var r = M * 0.09, mx = Math.min(W * 0.55, W - 68 - 24 - r * 1.5);
      var topY = b.bottom + r * 1.5 + M * 0.03;
      var my = lerp(H * 0.55, topY, smooth(nn));
      g.globalAlpha = nn;
      Art.drawMoon(g, mx, my, r, st.t);
      g.globalAlpha = 1;
    }
  }

  function drawBackground(g) {
    skyWeights();
    crossDraw(g, [S.sky, S.skyS, S.skyN], 0, 0, W, H);
    var i, d, nn = sky.n;
    if (nn > 0.01) drawNightSky(g, nn);
    var dim = 1 - 0.6 * nn - 0.2 * sky.s;
    for (i = 0; i < deco.length; i++) {
      d = deco[i];
      var spr = S.deco[d.k], span = W + spr.lw;
      var x = ((d.x * span - st.t * d.sp * W - st.scroll * 0.06) % span + span) % span - spr.lw / 2;
      drawSpr(g, spr, x, d.y * H, 1, 1, d.a * dim, 0);
    }
    if (st.rainbow) {
      var rb = st.rainbow, a, sweep;
      sweep = reduced ? 1 : smooth(rb.t / 1.1);
      a = rb.t < 1.1 ? (reduced ? rb.t / 1.1 : 1) : rb.t < 4.6 ? 1 : Math.max(0, 1 - (rb.t - 4.6) / 0.6);
      var rad = Math.min(W * 0.46, H * 0.55);
      Art.drawRainbow(g, W / 2, H * 0.82, rad, rad * 0.1, a, sweep);
    }
    var hh = hillH(), y = H - hh;
    var x1 = -((st.scroll * 0.25) % W), x2 = -((st.scroll * 0.5) % W);
    x1 = Math.round(x1 * DPR) / DPR; x2 = Math.round(x2 * DPR) / DPR;
    crossDraw(g, S.hills[0], x1, y, W, hh); crossDraw(g, S.hills[0], x1 + W, y, W, hh);
    crossDraw(g, S.hills[1], x2, y, W, hh); crossDraw(g, S.hills[1], x2 + W, y, W, hh);
    if (nn > 0.01 && Art.drawFirefly) {
      for (i = 0; i < flies.length; i++) {
        var f = flies[i], fx = f.x * W, fy = f.y * H;
        if (!reduced) { fx += Math.sin(st.t * f.sp + f.ph) * M * 0.06; fy += Math.sin(st.t * f.sp * 1.3 + f.ph2) * M * 0.03; }
        Art.drawFirefly(g, fx, fy, M * 0.012, nn * (reduced ? 0.8 : 0.6 + 0.4 * Math.sin(st.t * 2 + f.ph)));
      }
    }
  }

  function drawBar(g) {
    var b = layoutBar(), i;
    g.fillStyle = 'rgba(255,255,255,0.42)';
    roundRect(g, b.x, b.y, b.w, b.h, Math.min(b.h / 2, 28));
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke();
    for (i = 0; i < b.n; i++) {
      var sc = (i === b.n - 1) ? popScale(st.bigPop, true) : 1;
      drawSpr(g, S.bigSpr, b.bigX0 + i * b.bigStep, b.bigY, sc, sc, 1, 0);
    }
    var cur = st.score % 10;
    for (i = 0; i < 10; i++) {
      var x = b.slotX0 + i * S.slotStep;
      if (i < cur) {
        var s2 = popScale(st.slotPop[i], false);
        drawSpr(g, S.slotFull, x, b.slotY, s2, s2, 1, 0);
      } else drawSpr(g, S.slotEmpty, x, b.slotY, 1, 1, 1, 0);
    }
  }

  function drawTitleUI(g) {
    var r = M * 0.14, cx = W / 2, cy = H * 0.6;
    Art.drawPlayButton(g, cx, cy, r, st.t);
    if (st.best > 0) {
      var big = Math.floor(st.best / 10), small = st.best % 10;
      var medR = M * 0.05, y = cy + r + M * 0.1 + medR;
      var bigR = M * 0.032, smR = M * 0.019;
      var items = big + small;
      var step = Math.min(bigR * 2.3, (W * 0.8 - medR * 3) / Math.max(items, 1));
      var total = medR * 2 + M * 0.025 + (big ? big * step : 0) + small * Math.min(step, smR * 2.4);
      var x = cx - total / 2;
      Art.drawMedal(g, x + medR, y, medR);
      x += medR * 2 + M * 0.025;
      var i;
      for (i = 0; i < big; i++) {
        var scb = bigR / S.starR;
        drawSpr(g, S.star, x + step / 2, y, scb, scb, 1, 0);
        x += step;
      }
      for (i = 0; i < small; i++) {
        var scs = smR / S.starR, ss = Math.min(step, smR * 2.4);
        drawSpr(g, S.star, x + ss / 2, y, scs, scs, 1, 0);
        x += ss;
      }
    }
  }

  function dirtiest() {
    var best = null;
    for (var i = 0; i < st.splotches.length; i++) {
      var s = st.splotches[i];
      if (s.amount > 0.06 && (!best || s.amount > best.amount)) best = s;
    }
    return best;
  }

  function render(g) {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(g);
    var i, s, mode = st.mode, fade = st.fade;
    var pulse = reduced ? 0 : 1;
    for (i = 0; i < st.stars.length; i++) {
      s = st.stars[i];
      var sc = 1 + pulse * 0.07 * Math.sin(st.t * 3 + s.ph);
      var by = s.y + pulse * Math.sin(st.t * 2 + s.ph) * M * 0.012;
      drawSpr(g, S.star, s.x, by, sc, sc, fade, 0);
    }
    for (i = 0; i < st.clouds.length; i++) {
      s = st.clouds[i];
      var q = s.sq > 0 ? Math.sin(Math.PI * (1 - s.sq / 0.45)) * 0.28 : 0;
      var bob = reduced ? 0 : Math.sin(st.t * 1.2 + s.ph) * M * 0.008;
      drawSpr(g, s.spr, s.x, s.y + bob, s.sc * (1 + q), s.sc * (1 - q), fade, 0);
    }
    if (st.mud) drawSpr(g, S.mudCloud, st.mud.x, st.mud.y + (reduced ? 0 : Math.sin(st.mud.ph * 4) * M * 0.008), 1, 1, 1, 0);

    drawHero(g);

    if (mode === 'fly' && !st.held) {
      var h = st.hero;
      Art.drawTapHint(g, h.x + h.h * 1.0, h.y - h.h * 0.05, M * 0.09, st.t);
    }
    if (mode === 'wash' && st.splotches && st.idle > 1.2) {
      var d = dirtiest();
      if (d) {
        var rc = heroRect();
        var sx = rc.x + d.x * rc.k, sy = rc.y + d.y * rc.k, sr = d.r * rc.k;
        var a = clamp((st.idle - 1.2) / 0.4, 0, 1);
        Art.drawSponge(g, sx + Math.sin(st.t * 3.2) * sr * 0.8, sy + Math.sin(st.t * 6.4) * sr * 0.15, M * 0.08, a);
      }
    }
    for (i = 0; i < st.bonus.length; i++) {
      var b = st.bonus[i], p = smooth(b.t / b.dur), u = 1 - p;
      var cx = (b.x0 + b.x1) / 2 + 0, cy = Math.min(b.y0, b.y1) - Math.abs(b.arc) * 0.6;
      var ox = (b.arc > 0 ? 1 : -1) * M * 0.12;
      var bx = u * u * b.x0 + 2 * u * p * (cx + ox) + p * p * b.x1;
      var by2 = u * u * b.y0 + 2 * u * p * cy + p * p * b.y1;
      var bs = lerp(b.s0, S.slotR / S.starR * 1.1, p);
      drawSpr(g, S.star, bx, by2, bs, bs, 1, p * 6);
      if (!reduced && Math.random() < 0.5) addPart({ k: 's', x: bx, y: by2, vx: 0, vy: 0, life: 0, max: 0.5, s: 0.3, spr: 0, rot: 0, g: 0 });
    }
    drawParts(g);
    if (mode !== 'title') drawBar(g);
    else drawTitleUI(g);
    // confetti drawn above everything already via parts
  }

  // ------------------------------------------------------------------- input
  var pointers = new Map();

  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    snd('init');
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    var p = { x: e.clientX, y: e.clientY, acc: 0, sup: false };
    if (st.mode === 'title') { p.sup = true; startGame(); }
    pointers.set(e.pointerId, p);
    if (st.mode === 'wash') {
      rubAt(p.x, p.y, 0.6 * 0.075 * M);
      addBubble(p.x, p.y); snd('bubble');
    }
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y, dist = Math.hypot(dx, dy), ox = p.x, oy = p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (st.mode === 'wash' && dist > 0) {
      rubAt(p.x, p.y, dist, ox, oy);
      p.acc += dist;
      var n = 0;
      while (p.acc > 12 && n < 3) { p.acc -= 12; n++; addBubble(p.x, p.y); }
      if (n) snd('bubble');
    }
  });
  function up(e) {
    pointers.delete(e.pointerId);
    snd('init');
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('lostpointercapture', function (e) { pointers.delete(e.pointerId); });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () { pointers.clear(); });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  muteBtn.setAttribute('aria-pressed', String(!!safeMuted()));
  function safeMuted() { try { return Sound.isMuted(); } catch (e) { return false; } }
  muteBtn.addEventListener('click', function () {
    snd('init');
    var m = snd('toggleMute');
    muteBtn.setAttribute('aria-pressed', String(m === undefined ? safeMuted() : !!m));
  });

  var paused = false, last = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { snd('suspend'); paused = true; pointers.clear(); }
    else { snd('resume'); paused = false; last = 0; }
  });

  // ---------------------------------------------------------------------- loop
  function frame(ts) {
    requestAnimationFrame(frame);
    if (paused) return;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    try {
      update(dt);
      render(ctx);
    } catch (err) {
      if (window.console) console.error(err);
    }
  }

  // ------------------------------------------------------------------- boot
  applySize();
  build();
  loadHero(function () {
    refit();
    var t = titleTarget(); st.hero.x = t.x; st.hero.y = t.y; st.hero.h = t.h;
    requestAnimationFrame(frame);
  });

  window.__stella = {
    st: st,
    addPoints: function (n) { addPoints(n); },
    getDirty: function () { return st.splotches ? st.splotches.map(function (s) { return s.amount; }) : []; },
    setTime: function (ph) {
      var o = { day: 10, sunset: CYC.day + CYC.sun / 2, night: CYC.day + CYC.sun + CYC.night / 2, sunrise: CYC.day + CYC.sun + CYC.night + CYC.rise / 2 };
      if (o[ph] !== undefined) st.cyc = o[ph];
    },
    cleanAll: function () {
      if (!st.splotches) return;
      st.splotches.forEach(function (s) { s.amount = 0; });
      st.dirtyNeed = true;
    }
  };
})();
