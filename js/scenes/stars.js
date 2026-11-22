/* scenes/stars.js - the star game: fly and collect stars, mud cloud, wash, +5 bonus.
 * Modes: toFly -> fly -> toWash -> wash -> clean -> toFly ('off' while another scene runs).
 * Registers the 'stars' scene with window.Core (home: 'title', day/night cycle on).
 * enter({hero: {x, y, h}}) starts a new game, flying in from that spot.
 * Uses window.Art, window.Characters, window.Backdrop; audio only through Core.snd.
 * Adds window.__bella.stars = {st, pose, addPoints, cleanAll, getDirty} for the tests.
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core, Backdrop = window.Backdrop;
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------ small utils
  var snd = Core.snd, after = Core.after;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function backOut(p) { p = clamp(p, 0, 1) - 1; return 1 + p * p * (2.6 * p + 1.6); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // ------------------------------------------------------------------ state
  var W = 0, H = 0, DPR = 1, M = 0, reduced = false;      // M = min(W,H)
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }
  // held: a finger is down now; hasHeld: held at least once this game (hides the tap hint)
  var st = {
    mode: 'off', t: 0, mt: 0,               // mt = time in current mode
    score: 0, best: 0, sinceWash: 0, held: false, hasHeld: false,
    sf: 0.3, scroll: 0,
    stars: [], clouds: [], mud: null, parts: [], bubbles: [], bonus: [],
    splotches: null, dirtyNeed: false, idle: 0, popT: 0,
    hero: { x: 0, y: 0, h: 100, vy: 0, rot: 0 },
    from: null, toDur: 0.9,
    starT: 0.6, cloudT: 2.0, trailT: 0, noCtl: 0,
    fx: { glow: 0, wave: 0, hap: 0, hapDur: 1, hapAmp: 0 }, runV: 0, faceV: 0, rainbow: null, bigPop: 9, slotPop: [], nBonusDone: 0, fade: 1, sparkT: 0
  };
  var i0;
  for (i0 = 0; i0 < 10; i0++) st.slotPop.push(9);

  // 'stella.*' keys are from before the unicorn's name was fixed to Bella: keep reading them.
  st.best = parseInt(Core.load('bella.best', ['stella.best']), 10) || 0;
  function saveBest() { Core.store('bella.best', String(st.best)); }

  // ---------------------------------------------------------------- sprites
  var S = {};            // size-dependent sprites
  var CHR = window.Characters;
  var HW = CHR.W, HC = CHR.H;                 // rig frame (rig units)
  var dirtyC = document.createElement('canvas'), dirtyG = dirtyC.getContext('2d');
  var SPLOT_DEF = (function () {
    var A = CHR.anchors, u = 0.075 * 657 * 1.28;   // 0.075 x Bella width in rig units
    function d(a, rf) { return { x: a[0], y: a[1], rf: rf }; }
    return [d(A.bellaHind, 1.0), d(A.bellaBelly, 1.0), d(A.bellaChest, 0.95), d(A.bellaNeck, 0.85),
      d(A.bellaCheek, 0.8), d(A.bellaLegBack, 0.7), d(A.bellaLegFront, 0.7),
      d(A.bongoCheek, 0.6), d(A.bongoTummy, 0.75), d(A.bongoArm, 0.55)].map(function (o) { o.rf *= 1; o.u = u; return o; });
  })();
  var pose = { t: 0, run: 0, wave: 0, happy: 0, look: 0, glow: 0.5, face: undefined };

  // ---------------------------------------------------------------- geometry
  function heroFlyH() { return Math.min(H * 0.42, W * 0.52); }
  function heroAspect() { return HW / HC; }
  function flyX() { return W * (W < H ? 0.3 : 0.26); }
  function baseSpeed() { return Math.max(0.26 * W, 0.18 * H); }
  function hillH() { return Backdrop.hillH(); }

  var bar = null, barKey = '';
  function barMetrics() {
    var m = M;
    S.bigR = clamp(m * 0.05, 16, 28);
    S.pad = clamp(m * 0.022, 8, 13);
    S.availL = 12;
    S.availR = W - 12 - 68 - 10 - 56 - 12;    // leave room for the mute and home buttons
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

  // ------------------------------------------------------------- resize/build
  function build() {
    var hf = heroFlyH();
    S.starR = clamp(M * 0.062, 20, 46);
    S.star = Art.starSprite(S.starR, DPR, { face: true });
    S.cloudW = hf * 0.78;
    S.clouds = [1, 2, 3].map(function (s) { return Art.cloudSprite(S.cloudW, DPR, { seed: s * 3 + 1, face: true }); });
    S.mudCloud = Art.cloudSprite(hf * 1.15, DPR, { seed: 5, mud: true, face: true });
    S.bubbles = [M * 0.016, M * 0.026, M * 0.04].map(function (r) { return Art.bubbleSprite(r, DPR); });
    S.spark = [makeSparkle('#fffbe0', '#ffe581'), makeSparkle('#ffffff', '#ffb8d6'), makeSparkle('#fffbff', '#d3bdf2')];
    barMetrics();
    S.ppuFly = heroFlyH() / HC * DPR;
    S.ppuWash = washTarget().h / HC * DPR;
    CHR.prerender(S.ppuFly);
    CHR.prerender(S.ppuWash);
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

  // re-place the hero after resize according to the mode
  function refit() {
    var h = st.hero, t;
    if (st.mode === 'wash' || st.mode === 'clean') t = washTarget();
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
  function happyBlip(amp, dur) {
    var f = st.fx;
    if (amp >= f.hap * (f.hapAmp || 0) || f.hap <= 0) { f.hap = dur; f.hapDur = dur; f.hapAmp = amp; }
  }
  function starEvent() {
    st.fx.glow = 0.8; st.fx.wave = Math.max(st.fx.wave, 1.2);
    happyBlip(0.7, 0.7);
  }
  function milestone() {
    st.fx.wave = Math.max(st.fx.wave, 2); happyBlip(1, 2);
    confetti();
    st.rainbow = { t: 0 };
    snd('fanfare');
    after(0.45, function () { snd('say', 'bravissima'); });
  }

  // -------------------------------------------------------------- mode changes
  function setMode(m) {
    st.mode = m; st.mt = 0;
  }

  // Leaving the game (home, full screen closed). The core has already cleared
  // the timers. The best score is already saved on every point.
  function stopGame() {
    st.stars.length = 0; st.clouds.length = 0; st.bonus.length = 0; st.bubbles.length = 0;
    st.mud = null; st.splotches = null; st.dirtyNeed = false; st.rainbow = null;
    st.held = false; st.fade = 1; st.popT = 0;
    st.hero.vy = 0; st.hero.rot = 0;
    pointers.clear();
    setMode('off');
  }

  // from: where the hero is on the page we come from ({x, y, h})
  function startGame(from) {
    var h = st.hero;
    if (from) { h.x = from.x; h.y = from.y; h.h = from.h; }
    st.sf = sfTarget.title;
    st.score = 0; st.sinceWash = 0; st.held = false; st.hasHeld = false;
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
      return { x: d.x, y: d.y, r: d.rf * d.u, amount: 1, shape: Art.makeSplotch(Art.rng(i * 17 + 3)) };
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

  function nearPpu(h) {
    var k = h.h / HC * DPR;
    return Math.abs(Math.log(k / S.ppuFly)) <= Math.abs(Math.log(k / S.ppuWash)) ? S.ppuFly : S.ppuWash;
  }
  // rig drawn into the offscreen canvas, then mud 'source-atop' at the anchors
  function renderDirty(pu) {
    var g = dirtyG, sp = st.splotches, w = Math.ceil(HW * pu), hh = Math.ceil(HC * pu);
    if (dirtyC.width !== w || dirtyC.height !== hh) { dirtyC.width = w; dirtyC.height = hh; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, hh);
    g.setTransform(pu, 0, 0, pu, 0, 0);
    CHR.draw(g, pose, pu);
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
  // title: the start page's drift speed, where a new game starts from
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
    var k = h.h / HC, b = CHR.anchors.body;
    return { x: h.x + (b.x - HW / 2) * k, y: h.y + (b.y - HC / 2) * k, r: b.r * k };
  }

  function holding() {
    if (st.noCtl > 0) return false;
    return pointers.size > 0;
  }

  function updatePose(dt) {
    var f = st.fx, mode = st.mode;
    f.glow = Math.max(0, f.glow - dt); f.wave = Math.max(0, f.wave - dt); f.hap = Math.max(0, f.hap - dt);
    var runT = 0;
    if (mode === 'fly') runT = holding() ? 1 : 0.7;
    else if (mode === 'toFly') runT = 1;
    else if (mode === 'toWash') runT = 0.7 * (1 - smooth(st.mt / st.toDur));
    if (reduced) runT = Math.min(runT, 0.4);
    st.runV += (runT - st.runV) * Math.min(1, dt * 4);
    var happy = 0;
    if (f.hap > 0) {
      var e = f.hapDur - f.hap;
      happy = f.hapAmp * Math.min(1, e / 0.15, f.hap / 0.3);
    }
    var wave = Math.min(1, f.wave / 0.3);
    var faceT = -1;                               // -1 = auto
    if (mode === 'toWash' || mode === 'wash') { faceT = 0; happy = 0; wave = 0; }
    else if (mode === 'clean') { faceT = 1; happy = 1; wave = 1; }
    else if (mode === 'toFly' && st.mt < st.toDur) faceT = 0;
    else if (reduced && wave <= 0 && happy <= 0) faceT = 0;
    if (faceT >= 0) {
      st.faceV += (faceT - st.faceV) * Math.min(1, dt * 6);
      pose.face = st.faceV;
    } else { pose.face = undefined; st.faceV = 0; }
    pose.t = st.t; pose.run = st.runV; pose.wave = wave; pose.happy = happy;
    pose.glow = 0.5 + 0.5 * Math.min(1, f.glow / 0.8);
  }

  function updateFly(dt) {
    var h = st.hero, l = heroLimits(), spd = baseSpeed();
    var hold = st.held;
    if (hold) st.hasHeld = true;
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
        starEvent();
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
        happyBlip(0.5, 0.4);
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
    st.held = holding();

    var i;
    if (st.rainbow) { st.rainbow.t += dt; if (st.rainbow.t > 5.2) st.rainbow = null; }
    for (i = 0; i < 10; i++) if (st.slotPop[i] < 9) st.slotPop[i] += dt;
    if (st.bigPop < 9) st.bigPop += dt;

    updatePose(dt);
    if (mode === 'fly') {
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

    updateParts(dt);
  }

  // ----------------------------------------------------------------------- draw
  function drawHero(g) {
    var h = st.hero, w = h.h * heroAspect();
    var bob = 0;
    if (!reduced && (st.mode === 'fly' || st.mode === 'toFly')) bob = Math.sin(st.t * 2.4) * M * 0.006;
    var pu = nearPpu(h);
    var dirty = st.splotches && (st.mode === 'toWash' || st.mode === 'wash' || st.mode === 'clean');
    if (dirty) renderDirty(pu);
    g.save();
    g.translate(h.x, h.y + bob);
    if (h.rot) g.rotate(h.rot);
    var sc = 1;
    if (st.mode === 'clean') sc = 1 + 0.025 * Math.sin(st.mt * 6) * Math.max(0, 1 - st.mt);
    g.scale(sc, sc);
    if (dirty) {
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(dirtyC, -w / 2, -h.h / 2, w, h.h);
    } else {
      var k = h.h / HC;
      g.scale(k, k);
      g.translate(-HW / 2, -HC / 2);
      CHR.draw(g, pose, pu);
    }
    g.restore();
  }

  // drawn by the backdrop between its far clouds and the hills
  function drawRainbow(g) {
    if (st.rainbow) {
      var rb = st.rainbow, a, sweep;
      sweep = reduced ? 1 : smooth(rb.t / 1.1);
      a = rb.t < 1.1 ? (reduced ? rb.t / 1.1 : 1) : rb.t < 4.6 ? 1 : Math.max(0, 1 - (rb.t - 4.6) / 0.6);
      var rad = Math.min(W * 0.46, H * 0.55);
      Art.drawRainbow(g, W / 2, H * 0.82, rad, rad * 0.1, a, sweep);
    }
  }
  var backdropOpts = { top: 0, behind: drawRainbow };

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

  function dirtiest() {
    var best = null;
    for (var i = 0; i < st.splotches.length; i++) {
      var s = st.splotches[i];
      if (s.amount > 0.06 && (!best || s.amount > best.amount)) best = s;
    }
    return best;
  }

  function render(g) {
    backdropOpts.top = layoutBar().bottom;   // the moon rises to just below the score bar
    Backdrop.draw(g, st.scroll, backdropOpts);
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

    if (mode === 'fly' && !st.hasHeld) {
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
    drawBar(g);
    // confetti drawn above everything already via parts
  }

  // ------------------------------------------------------------------- input
  // The core captures and tracks pointers; this map keeps the ones that went
  // down in this scene (a finger still down from the start page never counts).
  var pointers = new Map();

  function pointer(type, e) {
    var p;
    if (type === 'down') {
      p = { x: e.x, y: e.y, acc: 0 };
      pointers.set(e.id, p);
      if (st.mode === 'wash') {
        rubAt(p.x, p.y, 0.6 * 0.075 * M);
        addBubble(p.x, p.y); snd('bubble');
      }
    } else if (type === 'move') {
      p = pointers.get(e.id);
      if (!p) return;
      var dx = e.x - p.x, dy = e.y - p.y, dist = Math.hypot(dx, dy), ox = p.x, oy = p.y;
      p.x = e.x; p.y = e.y;
      if (st.mode === 'wash' && dist > 0) {
        rubAt(p.x, p.y, dist, ox, oy);
        p.acc += dist;
        var n = 0;
        while (p.acc > 12 && n < 3) { p.acc -= 12; n++; addBubble(p.x, p.y); }
        if (n) snd('bubble');
      }
    } else if (type === 'up') {
      pointers.delete(e.id);
    }
  }

  // ------------------------------------------------------------------ scene
  Core.register('stars', {
    home: 'title',
    clock: true,
    enter: function (args) { sync(); startGame(args && args.hero); },
    exit: function () { stopGame(); },
    update: function (dt) { sync(); update(dt); },
    render: function (g) { sync(); render(g); },
    pointer: function (type, p) { sync(); pointer(type, p); },
    resize: function () { sync(); build(); refit(); }
  });

  if (window.__bella === undefined) window.__bella = {};
  window.__bella.stars = {
    st: st, pose: pose,
    addPoints: function (n) { addPoints(n); },
    getDirty: function () { return st.splotches ? st.splotches.map(function (s) { return s.amount; }) : []; },
    cleanAll: function () {
      if (!st.splotches) return;
      st.splotches.forEach(function (s) { s.amount = 0; });
      st.dirtyNeed = true;
    }
  };
})();
