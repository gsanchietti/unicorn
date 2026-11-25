/* scenes/pond.js - the bubble pond: Bella flies over the river and soap bubbles
 * leave her horn by themselves; a bubble that touches a grumpy blue octopus wraps
 * it, the octopus flips to its happy red side, giggles and floats up to the
 * nursery cloud at the top. Every octopus gives 1 star. No misses count, nothing
 * is lost, and any octopus still blue after 20 s flips by itself.
 *
 * Registers the 'pond' scene with window.Core (home: 'street', day/night cycle
 * on, music: 'pond'). enter({hero: {x, y, h}}) starts a fresh visit, flying in
 * from that spot (the street passes Bella's box).
 * Uses window.Art, window.Pond (js/art-pond.js), window.Friends (the octopus and
 * the lizard), window.Characters and window.Backdrop; audio only through Core.snd
 * ('bubble' for a shot, 'pop' at most every 0.1 s, 'flip', 'giggle', 'boing',
 * 'star', 'fanfare', 'say' 'preso' at most every 3 s / 'bravissima').
 *
 * Modes (st.mode): toFly (0.9 s, from the street's spot to her place) -> fly;
 * 'off' while another scene runs.
 *   Bella     at flyX (0.3 W in portrait, 0.26 W in landscape, as the star game),
 *             with the star game's hold / float feel (the same values, copied):
 *             hold to rise, release to float down. She stays between L.top and
 *             L.bottom (see Layout).
 *   world     scrolls left at max(0.2 W, 0.15 H) px/s; lily pads, reeds and now
 *             and then a rock (the lizard sits on half of them) pass on the water.
 *   bubbles   one leaves the horn tip every 0.8 s; each pointer down shoots one
 *             more if 0.25 s have passed since the last tap shot. They start at
 *             0.45 W px/s to the right and slow down (drag 0.7 /s), rise 0.02..0.04
 *             H px/s and wobble. Each pops (a sparkle, 'pop') after 3.5 s, at the
 *             nursery's bottom or at the right edge. At most 24: a new one pops
 *             the oldest. They push each other apart softly (Phys.separate), never
 *             an octopus or Bella.
 *   octopuses one swims in from the right edge about every 2.2 s while fewer than 6
 *             are in the pond (caught ones count until they reach the nursery), to
 *             a spot right of Bella, and stays there: it bobs, and every 2..4 s
 *             pops up in a gentle arc (1.2..1.6 s) up to 0.45 H above the water
 *             (never above the nursery's bottom). They never come near Bella.
 *   catch     a bubble touching a swimming octopus (circle test): the bubble wraps
 *             it; flip 0 -> 1 in 0.5 s ('flip', a giggle, "Preso!"), a big red and
 *             pink sparkle burst; Core.addStars(1) and st.caught + 1 at once (once
 *             per octopus); then it floats up to the nursery (1.6 s), the nursery
 *             jiggles, it sits there (the last 6 stay) and its star flies to the
 *             star row at the top left.
 *   auto-flip an octopus still blue after 20 s flips by itself (giggle, +1 star)
 *             and floats up the same way.
 *   party     every 10 caught: confetti, 'fanfare', "Bravissima!", and the nursery
 *             rains stars for 2 s (st.party counts down).
 *
 * Layout (CSS px; resize()):
 *   u = min(M, 0.9 H), the size unit: Pond.build(u, DPR)
 *   waterline waterY = 0.78 H
 *   nursery   Pond.nursery() scaled by min(1, 0.7 W / w, 0.16 H / h) (0.8 W / w in
 *             portrait); at the top between the star row and #home / #mute when it
 *             fits there (y 10, landscape), else centered under the buttons, its
 *             center at max(0.2 H, 90 + h / 2) in portrait (close to Bella, no tall
 *             empty sky) and 90 + h / 2 otherwise. Its octopuses sit at 0.65 size.
 *   Bella     drawn heroH = min(0.3 H, 0.48 W) tall from the star game's flying ppu
 *             (min(0.42 H, 0.52 W) / Characters.H * DPR: Characters keeps 2 scales).
 *             Her center stays between L.top = max(nursery bottom + 0.42 heroH,
 *             the height where her horn is 0.75 x the highest arc above the water)
 *             and L.bottom = waterY - 0.42 heroH (her hooves on the water), so her
 *             bubbles meet the octopuses' arcs, even when she is held at the top.
 *   octopus   0.14 u tall (Friends.buildOctopus), hit radius 0.45 of that; it rests
 *             0.2 r above the waterline, between Bella's front + r and W - 1.5 r
 *   bubbles   radius 0.05 u; around a caught octopus 0.75 x its height
 *   lizard    Friends.draw('lizard', 'sit'), built 0.34 u tall (as the bakery does)
 *             and drawn at 0.55 of that on its rock
 *   star row  10 slots at the top left (the stars of this visit), a big star per 10
 *
 * Debug hook window.__bella.pond:
 *   st          {mode, caught, bubbles: [{x, y, r}], octos: [{x, y, r, side, flip,
 *               age, state: 'swim'|'caught'|'up'}], held, enters, party, hero,
 *               spawnT (seconds to the next octopus; tests set it huge), ...}
 *   spawnOcto(x, y) -> octo   an octopus at (x, y), swimming, resting there; without
 *               x it swims in from the right edge, without y it rests on the water
 *   shoot()     one bubble from the horn now (no 0.25 s wait)
 *   horn()      {x, y}: the horn tip on screen
 *   nursery()   {x, y, w, h}: the nursery's box on screen (top left, size)
 *   overlap()   the bubbles' summed overlap in px (they push apart with
 *               Phys.separate(bubbles, 2) every frame after moving)
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core, CHR = window.Characters, Pond = window.Pond;
  var Friends = window.Friends, Backdrop = window.Backdrop, Phys = window.Phys;
  var TAU = Math.PI * 2;
  var snd = Core.snd;

  var W = 0, H = 0, M = 0, DPR = 1, reduced = false;
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function ease(v, to, k) { return v + (to - v) * Math.min(1, k); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ------------------------------------------------------------- constants
  var WATER = 0.78;                     // waterline, fraction of H
  var BUBBLE_EVERY = 0.8, TAP_GAP = 0.25, BUBBLE_LIFE = 3.5, MAX_BUBBLES = 24;
  var BUBBLE_V = 0.45, BUBBLE_DRAG = 0.7;
  var OCTO_EVERY = 2.2, MAX_OCTOS = 6, GRUMPY = 20, FLIP_T = 0.5, HOLD_T = 0.15, UP_T = 1.6;
  var PARTY_T = 2, POP_GAP = 0.1, PRESO_GAP = 3, RESIDENTS = 6;
  var HW = CHR.W, HC = CHR.H;
  // The horn tip in rig units: js/characters.js HORN_PNG + HORN_LEN along HORN_ANG,
  // mapped into the rig with R() (it is not in Characters.anchors).
  var HORN_TIP = [850, 235];
  var HORN_DX = (HORN_TIP[0] - HW / 2) / HC, HORN_DY = (HORN_TIP[1] - HC / 2) / HC;   // per unit of height

  // ------------------------------------------------------------------ state
  var st = {
    mode: 'off', t: 0, mt: 0, caught: 0, bubbles: [], octos: [], held: false, hasHeld: false,
    enters: 0, party: 0, hero: { x: 0, y: 0, h: 100, vy: 0, rot: 0 }, from: null, toDur: 0.9,
    scroll: 0, spawnT: 0, bubbleT: 0, lastShot: -9, jiggle: 0
  };
  var pose = { t: 0, run: 0, wave: 0, happy: 0, look: 0, glow: 0.5, face: undefined };
  var fx = { glow: 0, wave: 0, hap: 0 };
  var parts = [], flying = [], decor = [], residents = [];
  var pointers = new Map();
  var lastPop = -9, lastPreso = -9, nightK = 0, visit = 0, shown = 0, rainT = 0, runV = 0;
  var slotPop = [];
  for (var i0 = 0; i0 < 10; i0++) slotPop.push(9);
  var L = { u: 1, waterY: 0, W0: 0, H0: 0 };
  var S = {};

  // ----------------------------------------------------------------- layout
  function flyX() { return W * (W < H ? 0.3 : 0.26); }
  function layout() {
    L.u = Math.min(M, 0.9 * H);
    L.waterY = WATER * H;
    L.heroH = Math.min(0.3 * H, 0.48 * W);
    L.ppu = Math.min(H * 0.42, W * 0.52) / HC * DPR;   // the star game's flying scale
    L.flyX = flyX();
    L.speed = Math.max(0.2 * W, 0.15 * H);
    L.octoH = 0.14 * L.u; L.octoR = 0.45 * L.octoH;
    L.bubR = Math.max(4, Math.round(0.05 * L.u));
    L.wrapR = Math.max(L.bubR + 2, Math.round(0.75 * L.octoH));
    // the star row (as the bakery's)
    var rowW = Math.max(100, W - 12 - 170);
    S.slotStep = Math.min(clamp(M * 0.03, 10, 17) * 2.5, rowW / 10);
    S.slotR = S.slotStep / 2.5;
    S.bigR = clamp(M * 0.035, 12, 22);
    S.bigMax = Math.max(1, Math.floor(rowW / (2.2 * S.bigR)));
    // the nursery: between the star row and the buttons when it fits, else under them
    var tall = H > W, n = Pond.nursery(), k = Math.min(1, (tall ? 0.8 : 0.7) * W / n.w, 0.16 * H / n.h);
    L.nw = n.w * k; L.nh = n.h * k;
    var rowRight = 12 + 10 * S.slotStep + 8, free = W - 170 - rowRight;
    if (free >= L.nw + 16) { L.nx = rowRight + free / 2; L.ny = 10 + L.nh / 2; }
    else { L.nx = W / 2; L.ny = tall ? Math.max(0.2 * H, 90 + L.nh / 2) : 90 + L.nh / 2; }
    L.nBottom = L.ny + L.nh / 2;
    L.maxArc = Math.max(L.u * 0.1, Math.min(0.45 * H, L.waterY - L.nBottom - L.octoR));
    L.restY = L.waterY - 0.2 * L.octoR;
    L.bottom = L.waterY - 0.42 * L.heroH;      // her hooves just touch the water
    L.top = Math.min(L.bottom, Math.max(L.nBottom + 0.42 * L.heroH, L.restY - 0.75 * L.maxArc - HORN_DY * L.heroH));
    L.octoX0 = L.flyX + 0.6 * L.heroH + L.octoR;
    L.octoX1 = Math.max(L.octoX0, W - 1.5 * L.octoR);
  }

  function heroTarget() { return { x: L.flyX, y: (L.top + L.bottom) / 2, h: L.heroH }; }
  function horn() {
    var h = st.hero, dx = HORN_DX * h.h, dy = HORN_DY * h.h, c = Math.cos(h.rot), s = Math.sin(h.rot);
    return { x: h.x + dx * c - dy * s, y: h.y + dx * s + dy * c };
  }

  // ---------------------------------------------------------------- bubbles
  function popBubble(b, quiet) {
    sparkle(b.x, b.y, reduced ? 1 : 3, 0.08, 0);
    if (!quiet && st.t - lastPop >= POP_GAP) { lastPop = st.t; snd('pop'); }
  }
  function addBubble() {
    if (st.bubbles.length >= MAX_BUBBLES) popBubble(st.bubbles.shift(), true);
    var p = horn();
    st.bubbles.push({
      x: p.x, y: p.y, by: p.y, r: L.bubR * 0.4, vx: BUBBLE_V * W, vy: rnd(0.02, 0.04) * H,
      ph: rnd(0, TAU), life: 0
    });
    snd('bubble');
  }
  function updateBubbles(dt) {
    var b = st.bubbles, n = 0, wob = reduced ? 0.004 : 0.012;
    for (var i = 0; i < b.length; i++) {
      var q = b[i];
      q.life += dt;
      q.vx *= Math.exp(-BUBBLE_DRAG * dt);
      q.x += q.vx * dt;
      q.by -= q.vy * dt;
      q.ph += dt * 3;
      q.y = q.by + Math.sin(q.ph) * L.u * wob;
      q.r = L.bubR * (q.life < 0.2 ? 0.4 + 3 * q.life : 1);
      if (q.life >= BUBBLE_LIFE || q.y - q.r <= L.nBottom || q.x > W - 0.3 * q.r) { popBubble(q); continue; }
      b[n++] = q;
    }
    b.length = n;
    // bubbles bump each other softly (never an octopus or Bella): the push moves
    // the wobble's base line too, so the bubble keeps the new spot
    if (n > 1) {
      for (i = 0; i < n; i++) b[i].wy = b[i].y - b[i].by;
      Phys.separate(b, 2);
      for (i = 0; i < n; i++) b[i].by = b[i].y - b[i].wy;
    }
  }
  function overlap() {
    var b = st.bubbles, sum = 0;
    for (var i = 0; i < b.length; i++) {
      for (var j = i + 1; j < b.length; j++) {
        var o = b[i].r + b[j].r - Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y);
        if (o > 0) sum += o;
      }
    }
    return sum;
  }

  // -------------------------------------------------------------- octopuses
  function homeX() {   // a spot right of Bella, away from the others
    var best = rnd(L.octoX0, L.octoX1), bd = -1;
    for (var k = 0; k < 6; k++) {
      var x = rnd(L.octoX0, L.octoX1), d = Infinity;
      for (var j = 0; j < st.octos.length; j++) if (st.octos[j].state === 'swim') d = Math.min(d, Math.abs(st.octos[j].homeX - x));
      if (d > bd) { bd = d; best = x; }
    }
    return best;
  }
  function spawnOcto(x, y) {
    if (st.octos.length >= MAX_OCTOS) {
      for (var j = 0; j < st.octos.length; j++) if (st.octos[j].state === 'swim') { st.octos.splice(j, 1); break; }
      if (st.octos.length >= MAX_OCTOS) return null;
    }
    var o = {
      x: x === undefined ? W : x, y: 0, r: L.octoR, side: 'blue', flip: 0, giggle: 0, age: 0, state: 'swim',
      homeX: x === undefined ? homeX() : x, baseY: y === undefined ? L.restY : y, water: y === undefined,
      ph: rnd(0, TAU), popT: rnd(1, 2.5), arc: null, ct: 0, ut: 0, paid: false, wrap: false
    };
    o.y = o.baseY;
    st.octos.push(o);
    return o;
  }
  function catchOcto(o, b) {
    if (o.paid) return;
    o.paid = true;
    o.state = 'caught'; o.ct = 0; o.giggle = 1; o.wrap = !!b; o.arc = null;
    if (b) { var k = st.bubbles.indexOf(b); if (k >= 0) st.bubbles.splice(k, 1); }
    st.caught++;
    Core.addStars(1);
    o.slot = visit++;
    snd('flip');
    Core.after(0.3, function () { snd('giggle'); });
    if (b && st.t - lastPreso >= PRESO_GAP) { lastPreso = st.t; Core.after(0.7, function () { snd('say', 'preso'); }); }
    burst(o.x, o.y, reduced ? 8 : 22);
    fx.glow = 0.8; fx.wave = Math.max(fx.wave, 1); fx.hap = 0.7;
    if (st.caught % 10 === 0) party();
  }
  function party() {
    st.party = PARTY_T; rainT = 0;
    confetti();
    snd('fanfare');
    Core.after(0.45, function () { snd('say', 'bravissima'); });
    fx.wave = 2; fx.hap = 2;
  }
  function reachNursery(o) {
    st.jiggle = 1;
    residents.push({ f: o.tx, ph: rnd(0, TAU) });
    if (residents.length > RESIDENTS) residents.shift();
    flying.push({ x0: o.x, y0: o.y, t: 0, dur: 0.8, slot: o.slot });
    sparkle(o.x, o.y, reduced ? 3 : 8, 0.2, 1);
    snd('boing');
  }
  function updateOctos(dt) {
    var a = st.octos, n = 0;
    for (var i = 0; i < a.length; i++) {
      var o = a[i];
      o.r = L.octoR;
      if (o.state === 'swim') {
        o.age += dt;
        if (o.age >= GRUMPY) catchOcto(o, null);
      }
      if (o.state === 'swim') {
        var dx = o.homeX - o.x, step = L.speed * dt;
        o.x = Math.abs(dx) <= step ? o.homeX : o.x + (dx > 0 ? step : -step);
        var lift = 0;
        if (o.arc) {
          o.arc.t += dt;
          var p = o.arc.t / o.arc.dur;
          if (p >= 1) { o.arc = null; o.popT = rnd(2, 4); }
          else lift = Math.sin(Math.PI * p) * o.arc.h;
        } else if (Math.abs(dx) < L.octoR) {
          o.popT -= dt;
          if (o.popT <= 0) o.arc = { t: 0, dur: rnd(1.2, 1.6), h: rnd(0.6, 1) * L.maxArc };
        }
        var bob = Math.sin(st.t * 2 + o.ph) * L.u * (reduced ? 0.004 : 0.012);
        lift = Math.min(lift, o.baseY - L.nBottom - o.r);
        o.y = Math.max(L.nBottom, o.baseY + bob - Math.max(0, lift));
      } else if (o.state === 'caught') {
        o.ct += dt;
        o.flip = Math.min(1, o.ct / FLIP_T);
        if (o.flip >= 0.5) o.side = 'red';
        o.y = Math.max(L.nBottom, o.y - L.u * 0.05 * dt);
        if (o.ct >= FLIP_T + HOLD_T) {
          o.state = 'up'; o.ut = 0; o.ux0 = o.x; o.uy0 = o.y; o.tx = rnd(-0.32, 0.32);
        }
      } else if (o.state === 'up') {
        o.ut += dt;
        var q = smooth(o.ut / UP_T);
        o.giggle = Math.max(0, 1 - o.ut / 1.2);
        o.x = lerp(o.ux0, L.nx + o.tx * L.nw, q) + Math.sin(o.ut * 5) * L.u * 0.02 * (1 - q);
        o.y = lerp(o.uy0, L.ny, q);
        if (o.ut >= UP_T) { reachNursery(o); continue; }
      }
      a[n++] = o;
    }
    a.length = n;
  }
  function catches() {
    var b = st.bubbles, a = st.octos;
    for (var i = 0; i < a.length; i++) {
      var o = a[i];
      if (o.state !== 'swim') continue;
      for (var j = 0; j < b.length; j++) {
        var q = b[j], rr = q.r + o.r;
        if ((q.x - o.x) * (q.x - o.x) + (q.y - o.y) * (q.y - o.y) < rr * rr) { catchOcto(o, q); break; }
      }
    }
  }

  // ------------------------------------------------------------- decoration
  // Things on the water, in screen x, scrolling left with the world.
  var DECOR_KINDS = ['lily', 'lily', 'lilyFlower', 'reeds', 'lily', 'reeds', 'rock'];
  function addDecor(x) {
    var k = DECOR_KINDS[(Math.random() * DECOR_KINDS.length) | 0];
    var d = { kind: k, x: x, dy: 0, lizard: false };
    if (k === 'lily' || k === 'lilyFlower') d.dy = L.u * rnd(0.03, 0.12);
    else if (k === 'reeds') d.dy = L.u * 0.06;
    else { d.dy = L.u * 0.04; d.lizard = Math.random() < 0.5; }
    decor.push(d);
    return d;
  }
  function fillDecor() {
    decor.length = 0;
    for (var x = rnd(0, 0.2) * W; x < W * 1.3; x += L.u * rnd(0.3, 0.6)) addDecor(x);
  }
  function updateDecor(dt) {
    var n = 0, last = -Infinity;
    for (var i = 0; i < decor.length; i++) {
      var d = decor[i];
      d.x -= L.speed * dt;
      if (d.x < -L.u * 0.4) continue;
      last = Math.max(last, d.x);
      decor[n++] = d;
    }
    decor.length = n;
    if (last < W + L.u * 0.1) addDecor(Math.max(last, W) + L.u * rnd(0.3, 0.6));
  }

  // -------------------------------------------------------------- particles
  function addPart(q) {
    if (parts.length > 200) parts.shift();
    parts.push(q);
  }
  // star sparkles (spr 0) or colored ones (1 red, 2 pink)
  function sparkle(x, y, n, sp, spr) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = L.u * rnd(0.3, 1) * sp * (reduced ? 0.5 : 1);
      addPart({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.35, 0.6), g: 0, spr: spr, s: rnd(0.5, 1) });
    }
  }
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = L.u * rnd(0.25, 0.9) * (reduced ? 0.5 : 1);
      addPart({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.5, 0.9), g: L.u * 0.4, spr: 1 + (i % 2), s: rnd(0.8, 1.5) });
    }
  }
  function confetti() {
    var n = reduced ? 8 : 60, cols = Art.PAL.confetti;
    for (var i = 0; i < n; i++) {
      addPart({ k: 'c', x: rnd(0, W), y: rnd(-0.25 * H, -10), vx: 0, vy: rnd(0.12, 0.26) * H, life: 0, max: 7, w: rnd(4, 8) * (M / 400 + 0.5), h: rnd(2.5, 5) * (M / 400 + 0.5), rot: rnd(0, TAU), vr: rnd(-3, 3), ph: rnd(0, TAU), c: cols[(Math.random() * cols.length) | 0], sw: rnd(0.02, 0.06) * W });
    }
  }
  function updateParts(dt) {
    var n = 0, i;
    for (i = 0; i < parts.length; i++) {
      var q = parts[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      if (q.k === 'c') {
        q.y += q.vy * dt; q.rot += q.vr * dt; q.ph += dt * 3;
        q.x += Math.sin(q.ph) * q.sw * dt * 3;
        if (q.y > H + 20) continue;
      } else {
        q.vy += q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= 1 - Math.min(1, dt * 2);
      }
      parts[n++] = q;
    }
    parts.length = n;
    // the nursery's star rain
    if (st.party > 0) {
      rainT -= dt;
      while (rainT <= 0) {
        rainT += reduced ? 0.2 : 0.06;
        addPart({ k: 'r', x: L.nx + rnd(-0.45, 0.45) * L.nw, y: L.nBottom - L.nh * 0.1, vx: 0, vy: H * rnd(0.15, 0.3), life: 0, max: rnd(1.4, 2.2), g: H * 0.1, rot: rnd(0, TAU) });
      }
    }
    for (i = flying.length - 1; i >= 0; i--) {
      var f = flying[i];
      f.t += dt;
      if (f.t >= f.dur) {
        flying.splice(i, 1);
        shown = Math.max(shown, f.slot + 1);
        slotPop[f.slot % 10] = 0;
        snd('star', f.slot % 10);
      }
    }
    for (i = 0; i < 10; i++) if (slotPop[i] < 9) slotPop[i] += dt;
  }

  // ------------------------------------------------------------------ hero
  function updatePose(dt) {
    fx.glow = Math.max(0, fx.glow - dt); fx.wave = Math.max(0, fx.wave - dt); fx.hap = Math.max(0, fx.hap - dt);
    var runT = st.mode === 'fly' ? (st.held ? 1 : 0.7) : 1;
    if (reduced) runT = Math.min(runT, 0.4);
    runV += (runT - runV) * Math.min(1, dt * 4);
    pose.t = st.t; pose.run = runV;
    pose.wave = Math.min(1, fx.wave / 0.3);
    pose.happy = Math.min(1, fx.hap / 0.3);
    pose.glow = 0.5 + 0.5 * Math.min(1, fx.glow / 0.8);
    pose.face = st.mode === 'toFly' ? 0 : reduced ? 0 : undefined;
  }
  // the star game's hold / float feel (js/scenes/stars.js updateFly), copied
  function updateHero(dt) {
    var h = st.hero;
    h.h = L.heroH; h.x = L.flyX;
    if (st.held) h.vy -= 2.9 * H * dt; else h.vy += 0.85 * H * dt;
    h.vy = clamp(h.vy, -0.5 * H, 0.3 * H);
    h.y += h.vy * dt;
    if (h.y < L.top) { h.y = L.top; h.vy = Math.abs(h.vy) * 0.35 + 0.03 * H; }
    if (h.y > L.bottom) { h.y = L.bottom; h.vy = -(Math.abs(h.vy) * 0.35 + 0.05 * H); }
    h.rot = lerp(h.rot, clamp(h.vy / H, -0.5, 0.3) * 0.5, Math.min(1, dt * 8));
  }

  // ----------------------------------------------------------------- update
  function setMode(m) { st.mode = m; st.mt = 0; }
  function update(dt) {
    st.t += dt; st.mt += dt;
    st.held = pointers.size > 0;
    st.party = Math.max(0, st.party - dt);
    st.jiggle = Math.max(0, st.jiggle - dt / 0.8);
    nightK = ease(nightK, Backdrop.mood() === 'night' ? 1 : 0, dt * 1.5);
    st.scroll += L.speed * dt;
    updatePose(dt);
    if (st.mode === 'toFly') {
      var p = smooth(st.mt / st.toDur), to = heroTarget(), h = st.hero, f = st.from;
      h.x = lerp(f.x, to.x, p); h.y = lerp(f.y, to.y, p); h.h = lerp(f.h, to.h, p);
      h.rot *= 1 - Math.min(1, dt * 6);
      if (st.mt >= st.toDur) { setMode('fly'); h.vy = 0; st.bubbleT = 0.05; st.spawnT = Math.min(st.spawnT, 0.6); }
    } else if (st.mode === 'fly') {
      updateHero(dt);
      st.bubbleT -= dt;
      if (st.bubbleT <= 0) { st.bubbleT += BUBBLE_EVERY; addBubble(); }
      st.spawnT -= dt;
      if (st.spawnT <= 0) {
        st.spawnT = OCTO_EVERY * rnd(0.85, 1.15);
        if (st.octos.length < MAX_OCTOS) spawnOcto();
      }
    }
    updateDecor(dt);
    updateBubbles(dt);
    updateOctos(dt);
    catches();
    updateParts(dt);
  }

  // ----------------------------------------------------------------- render
  function drawPiece(g, kind, x, y) {
    var d = Pond.sprite(kind, false);
    if (x + d.w / 2 < 0 || x - d.w / 2 > W) return;
    if (nightK < 0.99) g.drawImage(d.c, x - d.w / 2, y - d.h, d.w, d.h);
    if (nightK > 0.01) {
      var n = Pond.sprite(kind, true);
      g.globalAlpha = nightK < 0.99 ? nightK : 1;
      g.drawImage(n.c, x - n.w / 2, y - n.h, n.w, n.h);
      g.globalAlpha = 1;
    }
  }
  var LIZ = { t: 0, state: 'sit', p: 0 };
  function drawDecor(g, back) {
    for (var i = 0; i < decor.length; i++) {
      var d = decor[i];
      if ((d.kind === 'reeds') !== back) continue;
      var y = L.waterY + d.dy;
      if (d.kind === 'lily' || d.kind === 'lilyFlower') y += Math.sin(st.t * 1.5 + d.x * 0.01) * L.u * 0.004;
      drawPiece(g, d.kind, d.x, y);
      if (d.lizard) {
        var rh = Pond.sprite('rock', false).h, k = 0.55;
        if (d.x < -L.u * 0.3 || d.x > W + L.u * 0.3) continue;
        LIZ.t = st.t;
        g.save();
        g.translate(d.x, y - rh * 0.92);
        g.scale(k, k);
        Friends.draw(g, 'lizard', 0, 0, LIZ);
        g.restore();
      }
    }
  }
  function drawWater(g) {
    var tile = Pond.waterTile(), x = -(st.scroll % tile.w);
    x = Math.round(x * DPR) / DPR;
    for (; x < W; x += tile.w) g.drawImage(tile.c, x, L.waterY, tile.w, tile.h);
    var below = L.waterY + tile.h;
    if (below < H) { g.fillStyle = Art.PAL.riverDeep; g.fillRect(0, below, W, H - below); }
    if (nightK > 0.01) {
      g.globalAlpha = 0.45 * nightK;
      g.fillStyle = Art.PAL.nightTint;
      g.fillRect(0, L.waterY, W, H - L.waterY);
      g.globalAlpha = 1;
    }
  }
  var OPOSE = { t: 0, side: 'blue', flip: 0, giggle: 0 };
  function drawOcto(g, o) {
    OPOSE.t = st.t + o.ph; OPOSE.side = 'blue'; OPOSE.flip = o.flip; OPOSE.giggle = o.giggle * (reduced ? 0.4 : 1);
    var k = o.state === 'up' ? lerp(1, RES_K, smooth(o.ut / UP_T)) : 1;
    if (k !== 1) {
      g.save(); g.translate(o.x, o.y); g.scale(k, k);
      Friends.octopus(g, 0, 0, OPOSE);
      g.restore();
    } else Friends.octopus(g, o.x, o.y, OPOSE);
    if (o.wrap) {
      var gr = o.state === 'caught' ? Math.min(1, o.ct / 0.2) : 1;
      var r = lerp(L.bubR, L.wrapR, gr) * k * (1 + 0.04 * Math.sin(st.t * 6 + o.ph));
      var b = Pond.bubble(L.wrapR), s = b.c.lw * r / b.r;
      var a = o.state === 'up' ? 1 - smooth((o.ut - UP_T + 0.4) / 0.4) : 1;
      if (a > 0) {
        g.globalAlpha = a;
        g.drawImage(b.c, o.x - s / 2, o.y - s / 2, s, s);
        g.globalAlpha = 1;
      }
    }
  }
  function drawSwimmers(g) {
    for (var i = 0; i < st.octos.length; i++) {
      var o = st.octos[i];
      if (o.state !== 'swim') continue;
      // a ripple ring on the water under it
      var lift = clamp((L.restY - o.y) / (L.u * 0.2), 0, 1);
      g.globalAlpha = 0.6 * (1 - lift);
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1.5, L.u * 0.006);
      g.beginPath(); g.ellipse(o.x, L.waterY + L.u * 0.01, o.r * 1.1, o.r * 0.22, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      drawOcto(g, o);
    }
  }
  function drawHero(g) {
    var h = st.hero, k = h.h / HC;
    var bob = reduced ? 0 : Math.sin(st.t * 2.4) * M * 0.006;
    g.save();
    g.translate(h.x, h.y + bob);
    if (h.rot) g.rotate(h.rot);
    g.scale(k, k);
    g.translate(-HW / 2, -HC / 2);
    CHR.draw(g, pose, L.ppu);
    g.restore();
  }
  function drawBubbles(g) {
    var b = Pond.bubble(L.bubR);
    for (var i = 0; i < st.bubbles.length; i++) {
      var q = st.bubbles[i], s = b.c.lw * q.r / b.r;
      g.drawImage(b.c, q.x - s / 2, q.y - s / 2, s, s);
    }
  }
  var RES = { t: 0, side: 'red', flip: 0, giggle: 0 }, RES_K = 0.65;
  function drawNursery(g) {
    var n = Pond.nursery(), j = st.jiggle, q = j * Math.sin(j * Math.PI * 5) * (reduced ? 0.03 : 0.08);
    var w = L.nw * (1 + q), h = L.nh * (1 - q);
    g.globalAlpha = 1 - 0.2 * nightK;
    g.drawImage(n.c, L.nx - w / 2, L.ny - h / 2, w, h);
    g.globalAlpha = 1;
    // the octopuses already in the nursery, at 0.65 size (their faces show), bobbing
    for (var i = 0; i < residents.length; i++) {
      var r = residents[i];
      RES.t = st.t + r.ph;
      RES.giggle = st.party > 0 ? 1 : 0;
      g.save();
      g.translate(L.nx + r.f * L.nw * (1 + q), L.ny - L.nh * 0.1 + Math.sin(st.t * 1.6 + r.ph) * L.nh * 0.04);
      g.scale(RES_K, RES_K);
      Friends.octopus(g, 0, 0, RES);
      g.restore();
    }
  }
  function slotPos(i) { return { x: 12 + S.slotStep * (i + 0.5), y: 14 + S.slotR }; }
  function drawStarRow(g) {
    var big = Math.min(Math.floor(shown / 10), S.bigMax), filled = shown % 10, i;
    var by = 14 + 2 * S.slotR + 6 + S.bigR;
    for (i = 0; i < big; i++) Art.drawSprite(g, S.bigStar, 12 + S.bigR * (1.1 + 2.2 * i), by, 1, 1, 0);
    for (i = 0; i < 10; i++) {
      var p = slotPos(i), pop = slotPop[i] < 0.4 ? 1 + 0.5 * Math.sin(Math.PI * slotPop[i] / 0.4) : 1;
      Art.drawSprite(g, i < filled ? S.slotFull : S.slotEmpty, p.x, p.y, pop, 1, 0);
    }
  }
  function drawParts(g) {
    for (var i = 0; i < parts.length; i++) {
      var q = parts[i], f = q.life / q.max;
      if (q.k === 's') {
        Art.drawSprite(g, S.spark[q.spr], q.x, q.y, q.s * (0.5 + 0.7 * (1 - f)), 1 - f, q.life * 4);
      } else if (q.k === 'r') {
        Art.drawSprite(g, S.rain, q.x, q.y, 1, f > 0.8 ? (1 - f) / 0.2 : 1, q.rot + q.life * 2);
      } else {
        g.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : 1;
        g.fillStyle = q.c;
        g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
        g.scale(1, Math.abs(Math.cos(q.ph * 0.8)) * 0.8 + 0.2);
        g.beginPath(); g.ellipse(0, 0, q.w, q.h, 0, 0, TAU); g.fill();
        g.restore(); g.globalAlpha = 1;
      }
    }
    for (i = 0; i < flying.length; i++) {
      var fl = flying[i], p = smooth(fl.t / fl.dur), to = slotPos(fl.slot % 10);
      var x = lerp(fl.x0, to.x, p), y = lerp(fl.y0, to.y, p) - Math.sin(Math.PI * p) * L.u * 0.12;
      Art.drawSprite(g, S.star, x, y, lerp(1, S.slotR / S.starR, p), 1, 0);
    }
  }
  var backdropOpts = { top: 0 };
  function render(g) {
    backdropOpts.top = L.nBottom;           // the moon rises to just below the nursery
    Backdrop.draw(g, st.scroll, backdropOpts);
    drawDecor(g, true);
    drawWater(g);
    drawDecor(g, false);
    drawSwimmers(g);
    drawHero(g);
    drawBubbles(g);
    drawNursery(g);
    for (var i = 0; i < st.octos.length; i++) if (st.octos[i].state !== 'swim') drawOcto(g, st.octos[i]);
    drawParts(g);
    drawStarRow(g);
    if (st.mode === 'fly' && !st.hasHeld) {
      var h = st.hero;
      Art.drawTapHint(g, h.x + h.h * 0.9, h.y + h.h * 0.15, M * 0.09, st.t);
    }
  }

  // ------------------------------------------------------------------ input
  // The core captures and tracks pointers; this map keeps the ones that went
  // down in this scene (a finger still down from the street never counts).
  function pointer(type, p) {
    if (type === 'down') {
      pointers.set(p.id, true);
      st.hasHeld = true;
      if (st.mode === 'fly' && st.t - st.lastShot >= TAP_GAP) { st.lastShot = st.t; addBubble(); }
    } else if (type === 'up') pointers.delete(p.id);
  }

  // ----------------------------------------------------------------- resize
  function sparkSprite(core, glow, s) {
    var c = Art.makeCanvas(s * 2 * DPR, s * 2 * DPR), g = c.getContext('2d');
    c.lw = s * 2; c.lh = s * 2;
    g.scale(DPR, DPR);
    var gr = g.createRadialGradient(s, s, 0, s, s, s);
    gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 0.5; g.fillStyle = gr; g.beginPath(); g.arc(s, s, s, 0, TAU); g.fill();
    g.globalAlpha = 1; g.fillStyle = core;
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? s * 0.18 : s * 0.8;
      g.lineTo(s + Math.cos(a) * r, s + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    return c;
  }
  function resize() {
    var oldW = L.W0 || W, oldH = L.H0 || H;
    var oldWater = L.waterY;
    sync();
    Pond.build(Math.min(M, 0.9 * H), DPR);
    layout();
    CHR.prerender(L.ppu);
    Friends.buildOctopus(L.octoH, DPR);
    Friends.build(0.34 * L.u, DPR);          // the bakery's size: its cache stays right
    S.starR = clamp(M * 0.05, 16, 34);
    S.star = Art.starSprite(S.starR, DPR, { face: true });
    S.rain = Art.starSprite(clamp(M * 0.02, 7, 14), DPR, { glow: false });
    S.bigStar = Art.starSprite(S.bigR, DPR, { glow: false });
    S.slotFull = Art.starSprite(S.slotR, DPR, { glow: false });
    S.slotEmpty = Art.starSprite(S.slotR, DPR, { empty: true, glow: false });
    var sr = Math.max(5, L.u * 0.03);
    S.spark = [Art.starSprite(sr, DPR, { glow: false }), sparkSprite('#ea5f6f', '#ffb8d6', sr * 1.4), sparkSprite('#ffb8d6', '#ffe0ec', sr * 1.4)];
    Pond.bubble(L.bubR); Pond.bubble(L.wrapR);
    L.W0 = W; L.H0 = H;
    if (!oldWater || st.mode === 'off') return;
    // keep everything where it was, in proportion
    var kx = W / oldW, ky = H / oldH, i;
    var h = st.hero;
    if (st.mode === 'fly') { h.h = L.heroH; h.x = L.flyX; h.y = clamp(h.y * ky, L.top, L.bottom); h.vy = 0; }
    else if (st.from) { st.from.x *= kx; st.from.y *= ky; }
    for (i = 0; i < st.bubbles.length; i++) {
      var b = st.bubbles[i];
      b.x = clamp(b.x * kx, 0, W - 0.3 * L.bubR); b.by *= ky; b.y *= ky; b.vx *= kx;
    }
    for (i = 0; i < st.octos.length; i++) {
      var o = st.octos[i];
      o.x = clamp(o.x * kx, 0, W);
      o.homeX = o.water ? clamp(o.homeX * kx, L.octoX0, L.octoX1) : o.homeX * kx;
      o.baseY = o.water ? L.restY : clamp(o.baseY * ky, L.nBottom + L.octoR, L.restY);
      o.y = clamp(o.y * ky, L.nBottom, H);
      if (o.state === 'swim') o.y = Math.max(o.y, L.nBottom + o.r);
      if (o.state === 'up') { o.ux0 *= kx; o.uy0 *= ky; }
    }
    for (i = 0; i < decor.length; i++) decor[i].x *= kx;
  }

  // ------------------------------------------------------------------ scene
  function startVisit(from) {
    var h = st.hero, to = heroTarget();
    st.from = from ? { x: from.x, y: from.y, h: from.h } : { x: -to.h, y: to.y, h: to.h };
    h.x = st.from.x; h.y = st.from.y; h.h = st.from.h; h.vy = 0; h.rot = 0;
    st.toDur = 0.9;
    st.caught = 0; st.party = 0; st.jiggle = 0; st.held = false; st.hasHeld = false;
    st.bubbles.length = 0; st.octos.length = 0;
    st.spawnT = 0.6; st.bubbleT = 0.05; st.lastShot = -9; st.scroll = 0;
    parts.length = 0; flying.length = 0; residents.length = 0;
    visit = 0; shown = 0;
    for (var i = 0; i < 10; i++) slotPop[i] = 9;
    lastPop = -9; lastPreso = -9;
    nightK = Backdrop.mood() === 'night' ? 1 : 0;
    fillDecor();
    setMode('toFly');
  }

  Core.register('pond', {
    home: 'street',
    clock: true,
    music: 'pond',
    enter: function (args) { sync(); st.enters++; startVisit(args && args.hero); },
    exit: function () {
      pointers.clear();
      st.bubbles.length = 0; st.octos.length = 0;
      parts.length = 0; flying.length = 0; residents.length = 0;
      st.held = false; st.party = 0;
      setMode('off');
    },
    update: function (dt) { sync(); update(dt); },
    render: function (g) { sync(); render(g); },
    pointer: function (type, p) { sync(); pointer(type, p); },
    resize: resize
  });

  if (window.__bella === undefined) window.__bella = {};
  window.__bella.pond = {
    st: st,
    spawnOcto: function (x, y) { return spawnOcto(x, y); },
    shoot: function () { if (st.mode === 'fly') addBubble(); },
    horn: function () { return horn(); },
    nursery: function () { return { x: L.nx - L.nw / 2, y: L.ny - L.nh / 2, w: L.nw, h: L.nh }; },
    overlap: overlap
  };
})();
