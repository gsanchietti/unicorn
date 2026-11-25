/* scenes/street.js - the street of the fairy town: the hub between the games.
 * Seen from the side, about 4 screens wide; the camera follows Bella.
 *
 * Moving: hold the left or right half of the screen and Bella trots that way
 * (clip-clop); let go and she stops. Tapping a place makes her walk there:
 *   gate    (sky gate, star sign)  -> "Andiamo!" and the star game
 *   bakery  (cake sign)            -> a door chime and the bakery
 *   square  (the star jar)         -> the jar jiggles, the total rises over it as stars
 *   pond    (octopus sign)         -> a bubble and the bubble pond
 *   house                          -> closed for now: a wiggle, sparkles and a door chime
 * A tap on a place cancels any hold walk; a new hold cancels the walk to a place.
 *
 * Registers the 'street' scene with window.Core (home: 'title', day/night cycle
 * on, music: 'street'). enter({from}): from 'stars' Bella lands by the sky gate,
 * from 'bakery' at the bakery door, from 'pond' by the pond, otherwise she starts
 * at 0.22 of the street.
 * Draws Bella at the star game's flying scale (Characters keeps 2 cached scales).
 * Pose: run 0, walk 0..1 (eased with movement), stride (walk phase in cycles,
 * grows with distance walked so the hooves don't slide).
 * Uses window.Art, window.Town (js/art-town.js), window.Characters, window.Backdrop;
 * audio only through Core.snd ('clipClop', 'say' 'andiamo', 'star', 'door', 'bubble').
 *
 * Debug hook window.__bella.street:
 *   st          {x, camX, target, walking, dir, jarShow, jiggle} (world x of Bella,
 *               camera left edge, target place kind or null, ...)
 *   places()    [{kind, x, sx, sy, r}]: world x, screen center and radius of each
 *               place's tap target
 *   worldW()    the street's width in CSS px
 *   enter(kind) same as a tap on that place
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core, CHR = window.Characters, Town = window.Town, Backdrop = window.Backdrop;
  var TAU = Math.PI * 2;
  var snd = Core.snd;

  var W = 0, H = 0, M = 0, DPR = 1, reduced = false;
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function ease(v, to, k) { return v + (to - v) * Math.min(1, k); }

  // ------------------------------------------------------------------ layout
  // Places, left to right, as fractions of the street's width. tap: center of the
  // tap target above the ground (fraction of the sprite's height) and radius
  // (fraction of U). sign: the picture sign, on a post beside the place (side -1/1).
  var PLACES = [
    { kind: 'square', f: 0.12, tap: [0, 0.22] },                 // the jar is the target
    { kind: 'gate', f: 0.32, tap: [0.2, 0.22], sign: 'star', side: 1 },
    { kind: 'house', f: 0.50, tap: [0.3, 0.28] },
    { kind: 'bakery', f: 0.68, tap: [0.3, 0.28], sign: 'cake', side: 1 },
    { kind: 'pond', f: 0.88, tap: [0.5, 0.26], sign: 'octopus', side: -1 }
  ];
  // Decorations: layer 0 behind the places, 2 in front of them (Bella is in front of all).
  var DECOR = [
    { kind: 'bush', f: 0.02, layer: 2 }, { kind: 'tree', f: 0.055, layer: 0 },
    { kind: 'flowers', f: 0.045, layer: 2 }, { kind: 'fox', f: 0.16, layer: 2, life: 'fox' },
    { kind: 'tree', f: 0.25, layer: 0 }, { kind: 'flowers', f: 0.39, layer: 2 },
    { kind: 'tree', f: 0.42, layer: 0 }, { kind: 'clothesline', f: 0.59, layer: 0, life: 'flap' },
    { kind: 'bush', f: 0.765, layer: 2 }, { kind: 'tree', f: 0.79, layer: 0 },
    { kind: 'flowers', f: 0.8, layer: 2 }, { kind: 'bush', f: 0.98, layer: 2 }
  ];
  var FRONT = [0.03, 0.17, 0.3, 0.44, 0.58, 0.71, 0.85, 0.97];   // front flowers (parallax 1.25)
  var BUTTERFLIES = [{ f: 0.045, ph: 0 }, { f: 0.39, ph: 2.1 }, { f: 0.8, ph: 4.2 }];
  var START_F = 0.22, END_F = [0.04, 0.96];
  var JAR_H = 0.35, SIGN_R = 0.09, SIGN_H = 0.42;   // in U
  var FOOT = 1050;          // rig y of Bella's hooves at rest (Characters.H = 1100)

  // L: size-dependent layout, set by resize()
  var L = { ww: 1, gy: 0, u: 1, heroH: 1, speed: 1, ppu: 1 };
  function worldW() { return Math.max(4 * W, 5.5 * M); }
  function groundY() { return H - Math.max(H * 0.14, M * 0.16); }

  // ------------------------------------------------------------------- state
  var st = { x: 0, camX: 0, target: null, walking: false, dir: 1, jarShow: 0, jiggle: 0 };
  var pose = { t: 0, run: 0, walk: 0, stride: 0, wave: 0, happy: 0, look: 0, glow: 0.5, face: undefined };
  var t = 0, nightK = 0, total = 0, entering = false, lastHalf = 0;
  var holds = new Map();    // pointer id -> {x, cancelled}
  var sparks = [];          // {x, y, vy, life, max} in world coords
  var placeFx = PLACES.map(function () { return { near: 0, wig: 0 }; });
  var S = {};

  function place(kind) {
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i].kind === kind) return i;
    return -1;
  }
  function placeX(i) { return PLACES[i].f * L.ww; }
  function standX(i) {    // where Bella stops for a place: left of the jar, else at the door
    var x = placeX(i);
    if (PLACES[i].kind === 'square') x -= L.u * 0.32;
    return clamp(x, END_F[0] * L.ww, END_F[1] * L.ww);
  }
  function target(i) {    // the tap target on screen
    var p = PLACES[i], spr = Town.sprite(p.kind, false), x = placeX(i) - st.camX;
    var cy = p.kind === 'square' ? L.gy - L.u * JAR_H / 2 : L.gy - spr.h * p.tap[0];
    return { x: x, y: cy, r: Math.max(L.u * p.tap[1], M * 0.06) };
  }
  function signPos(i) {
    var p = PLACES[i], spr = Town.sprite(p.kind, false);
    var bob = placeFx[i].near * (0.5 + 0.5 * Math.sin(t * 3)) * L.u * (reduced ? 0.015 : 0.035);
    return {
      x: placeX(i) + p.side * (spr.w * 0.5 + L.u * SIGN_R * 0.6) - st.camX,
      y: L.gy - L.u * SIGN_H - bob, r: L.u * SIGN_R
    };
  }
  // the place under a screen point, or -1
  function placeAt(x, y) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < PLACES.length; i++) {
      var tg = target(i), d = Math.hypot(x - tg.x, y - tg.y) / tg.r;
      if (PLACES[i].sign) {
        var sp = signPos(i), ds = Math.hypot(x - sp.x, y - sp.y) / (sp.r * 1.3);
        if (ds < d) d = ds;
      }
      if (d <= 1 && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function heroScale() { return L.heroH / CHR.H; }
  // Bella's box on screen as drawn here ({x, y, h}: center and height), the
  // shape the start page passes to the next scene
  function heroBox() {
    var k = heroScale();
    return { x: st.x - st.camX, y: L.gy - (FOOT - CHR.H / 2) * k, h: L.heroH };
  }
  function camGoal() { return clamp(st.x - W / 2, 0, L.ww - W); }

  // ------------------------------------------------------------------- input
  function walkTo(i) {
    if (i < 0) return;
    st.target = PLACES[i].kind;
    holds.forEach(function (h) { h.cancelled = true; });
  }
  function holdDir() {
    var d = 0;
    holds.forEach(function (h) { if (!h.cancelled) d = h.x < W / 2 ? -1 : 1; });   // the latest finger wins
    return d;
  }
  function pointer(type, p) {
    if (type === 'down') {
      var i = placeAt(p.x, p.y);
      if (i >= 0) { walkTo(i); holds.set(p.id, { x: p.x, cancelled: true }); }
      else { st.target = null; holds.set(p.id, { x: p.x, cancelled: false }); }
    } else if (type === 'move') {
      var h = holds.get(p.id);
      if (h) h.x = p.x;
    } else if (type === 'up') {
      holds.delete(p.id);
    }
  }

  // ---------------------------------------------------------------- arriving
  function arrive(i) {
    var p = PLACES[i];
    st.target = null;
    if (p.kind === 'gate' || p.kind === 'bakery' || p.kind === 'pond') {
      if (entering) return;
      entering = true;
      if (p.kind === 'gate') {
        st.dir = 1;
        snd('say', 'andiamo');
        Core.go('stars', { hero: heroBox() });
      } else if (p.kind === 'pond') {
        st.dir = 1;
        snd('bubble');
        Core.go('pond', { hero: heroBox() });
      } else {
        snd('door');
        Core.go('bakery');
      }
      Core.after(1.2, function () { entering = false; });   // only if the go was dropped
    } else if (p.kind === 'square') {
      total = Core.stars();
      st.jiggle = 1; st.jarShow = 3;
      for (var k = 0; k < 5; k++) (function (k) { Core.after(0.15 + k * 0.12, function () { snd('star', 4 + k); }); })(k);
      sparkle(placeX(i), L.gy - L.u * JAR_H * 0.8, 10);
    } else {
      placeFx[i].wig = 1;
      snd('door');
      sparkle(placeX(i), L.gy - Town.sprite(p.kind, false).h * 0.4, 8);
    }
  }
  function sparkle(x, y, n) {
    for (var k = 0; k < n; k++) {
      var a = Math.random() * TAU, r = L.u * (0.05 + Math.random() * 0.2);
      sparks.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6, vy: -L.u * (0.1 + Math.random() * 0.15), life: 0, max: 0.7 + Math.random() * 0.5 });
    }
    if (sparks.length > 60) sparks.splice(0, sparks.length - 60);
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    t += dt;
    pose.t = t;
    pose.face = reduced ? 0 : undefined;     // Bongo turns to the player now and then
    var x0 = st.x, lo = END_F[0] * L.ww, hi = END_F[1] * L.ww, vx = 0;
    if (st.target) {
      var i = place(st.target), tx = standX(i), dx = tx - st.x;
      if (Math.abs(dx) <= L.speed * dt) { st.x = tx; if (dx) st.dir = dx > 0 ? 1 : -1; arrive(i); }
      else vx = dx > 0 ? L.speed : -L.speed;
    } else vx = holdDir() * L.speed;
    if (vx) {
      st.dir = vx > 0 ? 1 : -1;
      st.x = clamp(st.x + vx * dt, lo, hi);
    }
    st.x = clamp(st.x, lo, hi);
    var moved = Math.abs(st.x - x0);
    st.walking = moved > 0.01;
    pose.walk = ease(pose.walk, st.walking ? 1 : 0, dt * 6);
    if (pose.walk < 0.005) pose.walk = 0;
    pose.stride += moved / (L.heroH * 0.9);
    var half = Math.floor(pose.stride * 2);
    if (half !== lastHalf) { lastHalf = half; snd('clipClop'); }

    st.camX = clamp(ease(st.camX, camGoal(), dt * 4), 0, L.ww - W);
    st.jiggle = Math.max(0, st.jiggle - dt / 0.8);
    st.jarShow = Math.max(0, st.jarShow - dt);
    for (var j = 0; j < PLACES.length; j++) {
      var fx = placeFx[j];
      fx.near = ease(fx.near, Math.abs(st.x - placeX(j)) < 0.6 * M ? 1 : 0, dt * 3);
      fx.wig = Math.max(0, fx.wig - dt / 0.8);
    }
    nightK = ease(nightK, Backdrop.mood() === 'night' ? 1 : 0, dt * 1.5);
    for (var s = sparks.length - 1; s >= 0; s--) {
      var sp = sparks[s];
      sp.life += dt; sp.y += sp.vy * dt;
      if (sp.life >= sp.max) sparks.splice(s, 1);
    }
  }

  // ------------------------------------------------------------------ render
  // a town sprite, bottom center at (x, y), crossfaded day -> night
  function drawTown(g, kind, x, y) {
    var d = Town.sprite(kind, false);
    if (x + d.w / 2 < 0 || x - d.w / 2 > W) return;
    if (nightK < 0.99) g.drawImage(d.c, x - d.w / 2, y - d.h, d.w, d.h);
    if (nightK > 0.01) {
      var n = Town.sprite(kind, true);
      g.globalAlpha = nightK < 0.99 ? nightK : 1;
      g.drawImage(n.c, x - n.w / 2, y - n.h, n.w, n.h);
      g.globalAlpha = 1;
    }
  }
  function drawGround(g) {
    var tile = Town.groundTile(), x = -(st.camX % tile.w);
    x = Math.round(x * DPR) / DPR;
    for (; x < W; x += tile.w) g.drawImage(tile.c, x, L.gy, tile.w, tile.h);
    var below = L.gy + tile.h;
    if (below < H) { g.fillStyle = Art.PAL.leaf; g.fillRect(0, below, W, H - below); }
    if (nightK > 0.01) {
      g.globalAlpha = 0.45 * nightK;
      g.fillStyle = Art.PAL.nightTint;
      g.fillRect(0, L.gy, W, H - L.gy);
      g.globalAlpha = 1;
    }
  }
  function drawDecor(g, layer) {
    var sway = reduced ? 0.5 : 1;
    for (var i = 0; i < DECOR.length; i++) {
      var d = DECOR[i];
      if (d.layer !== layer) continue;
      var x = d.f * L.ww - st.camX;
      if (!d.life) { drawTown(g, d.kind, x, L.gy); continue; }
      var spr = Town.sprite(d.kind, false);
      if (x + spr.w < 0 || x - spr.w > W) continue;
      g.save();
      g.translate(x, L.gy);
      if (d.life === 'fox') g.rotate(Math.sin(t * 1.3) * 0.06 * sway);
      else g.transform(1, 0, Math.sin(t * 2.1) * 0.05 * sway, 1, 0, 0);
      drawTown(g, d.kind, 0, 0);
      g.restore();
    }
  }
  function drawPlaces(g) {
    for (var i = 0; i < PLACES.length; i++) {
      var p = PLACES[i], x = placeX(i) - st.camX, wig = placeFx[i].wig;
      if (p.kind !== 'square' && wig > 0) {
        var k = wig * Math.sin(wig * Math.PI * 6) * (reduced ? 0.5 : 1);
        g.save();
        g.translate(x, L.gy);
        g.scale(1 + 0.04 * k, 1 - 0.04 * k);
        drawTown(g, p.kind, 0, 0);
        g.restore();
      } else drawTown(g, p.kind, x, L.gy);
      if (p.sign) {
        var sp = signPos(i);
        if (sp.x + sp.r < 0 || sp.x - sp.r > W) continue;
        Art.ink(g, Math.max(2, L.u * 0.012));
        g.beginPath(); g.moveTo(sp.x, sp.y); g.lineTo(sp.x, L.gy); g.stroke();
        Town.drawSign(g, sp.x, sp.y, sp.r, p.sign, t);
      }
      if (p.kind === 'square' && x > -L.u && x < W + L.u) Town.drawJar(g, x, L.gy, L.u * JAR_H, total, st.jiggle);
    }
  }
  function drawHero(g) {
    var k = heroScale(), x = st.x - st.camX;
    g.save();
    g.translate(x, L.gy);
    g.scale(st.dir * k, k);
    g.translate(-CHR.W / 2, -FOOT);
    CHR.draw(g, pose, L.ppu);
    g.restore();
  }
  function drawLife(g) {
    var mb = Town.lifeSprite('mouseBalloon'), span = W + mb.w * 2;
    var bx = ((t * W * 0.025 + span * 0.35 - st.camX * 0.5) % span + span) % span - mb.w;
    var by = H * 0.2 + Math.sin(t * 0.5) * H * 0.02;
    g.drawImage(mb.c, bx - mb.w / 2, by - mb.h / 2, mb.w, mb.h);
  }
  function drawButterflies(g) {
    if (nightK > 0.99) return;
    var bf = Town.lifeSprite('butterfly');
    g.globalAlpha = 1 - nightK;
    for (var i = 0; i < BUTTERFLIES.length; i++) {
      var b = BUTTERFLIES[i];
      var x = b.f * L.ww - st.camX + Math.sin(t * 0.45 + b.ph) * L.u * 0.14;
      if (x < -bf.w || x > W + bf.w) continue;
      var y = L.gy - L.u * 0.32 + Math.sin(t * 1.1 + b.ph) * L.u * 0.07;
      var flap = 0.35 + 0.65 * Math.abs(Math.cos(t * (reduced ? 4 : 9) + b.ph));
      g.save();
      g.translate(x, y);
      g.scale(flap, 1);
      g.drawImage(bf.c, -bf.w / 2, -bf.h / 2, bf.w, bf.h);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  function drawFront(g) {
    var f = Town.sprite('flowers', nightK > 0.5), k = 1.3, w = f.w * k, h = f.h * k;
    var extent = (L.ww - W) * 1.25 + W;
    for (var i = 0; i < FRONT.length; i++) {
      var x = FRONT[i] * extent - st.camX * 1.25;
      if (x + w / 2 < 0 || x - w / 2 > W) continue;
      g.drawImage(f.c, x - w / 2, H + L.u * 0.03 - h, w, h);
    }
  }
  function drawSparks(g) {
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i], a = 1 - s.life / s.max;
      Art.drawSprite(g, S.spark, s.x - st.camX, s.y, 0.6 + 0.6 * a, a, s.life * 3);
    }
  }
  // The total over the jar, as on the start page: big stars for tens, then small ones.
  function drawJarRow(g) {
    if (st.jarShow <= 0 || !total) return;
    var age = 3 - st.jarShow, rise = smooth(age / 0.5), alpha = Math.min(1, st.jarShow / 0.5) * rise;
    var big = Math.floor(total / 10), small = total % 10;
    var bigR = M * 0.032, smR = M * 0.019, items = big + small;
    var step = Math.min(bigR * 2.3, W * 0.8 / Math.max(items, 1)), ss = Math.min(step, smR * 2.4);
    var rowW = big * step + small * ss;
    var cx = clamp(placeX(place('square')) - st.camX, W * 0.1 + rowW / 2, W * 0.9 - rowW / 2);
    if (rowW > W * 0.8) cx = W / 2;
    var y = L.gy - L.u * JAR_H - L.u * 0.06 - rise * L.u * 0.14, x = cx - rowW / 2, i;
    g.globalAlpha = alpha;
    for (i = 0; i < big; i++) { Art.drawSprite(g, S.star, x + step / 2, y, bigR / S.starR, 1, 0); x += step; }
    for (i = 0; i < small; i++) { Art.drawSprite(g, S.star, x + ss / 2, y, smR / S.starR, 1, 0); x += ss; }
    g.globalAlpha = 1;
  }

  function render(g) {
    Backdrop.draw(g, st.camX * 0.25);
    drawLife(g);
    drawGround(g);
    drawDecor(g, 0);
    drawPlaces(g);
    drawDecor(g, 2);
    drawHero(g);
    drawButterflies(g);
    drawFront(g);
    drawSparks(g);
    drawJarRow(g);
  }

  // ------------------------------------------------------------------ resize
  function resize() {
    var frac = L.ww > 1 ? st.x / L.ww : START_F;
    L.ww = worldW();
    L.gy = groundY();
    // Bella's height on the street: a little taller than on the start page in
    // landscape. She is still drawn from the flying-scale cache (L.ppu below).
    L.heroH = Math.min(H * 0.34, W * 0.55);
    // The town's size unit: at most M, the houses at most about twice Bella's
    // height, and the tallest piece (1.36 u, see js/art-town.js) ends 0.18 H
    // below the top, so nothing passes under the #home / #mute buttons.
    L.u = Math.min(M, 0.8 * H, 2.0 * L.heroH, (L.gy - 0.18 * H) / 1.36);
    // The trot follows the screen, but never faster than 1.2 x Bella's height
    // per second, so the legs keep a calm cadence on wide phones.
    L.speed = Math.min(Math.max(0.35 * W, 0.5 * M), 1.2 * L.heroH);
    // the star game's flying scale, as js/scenes/title.js: no third Characters scale
    L.ppu = Math.min(H * 0.42, W * 0.52) / CHR.H * DPR;
    CHR.prerender(L.ppu);
    Town.build(L.u, DPR);
    S.starR = clamp(M * 0.062, 20, 46);
    S.star = Art.starSprite(S.starR, DPR, { face: true });
    S.spark = Art.starSprite(Math.max(5, L.u * 0.022), DPR, { glow: false });
    st.x = clamp(frac * L.ww, END_F[0] * L.ww, END_F[1] * L.ww);
    st.camX = camGoal();
  }

  Core.register('street', {
    home: 'title',
    clock: true,
    music: 'street',
    enter: function (args) {
      sync();
      var from = args && args.from;
      st.x = from === 'stars' ? placeX(place('gate')) : from === 'bakery' ? standX(place('bakery'))
        : from === 'pond' ? standX(place('pond')) : START_F * L.ww;
      st.dir = 1; st.target = null; st.walking = false; st.jarShow = 0; st.jiggle = 0;
      st.camX = camGoal();
      pose.walk = 0;
      entering = false;
      holds.clear();
      sparks.length = 0;
      placeFx.forEach(function (f) { f.near = 0; f.wig = 0; });
      nightK = Backdrop.mood() === 'night' ? 1 : 0;
      total = Core.stars();
    },
    exit: function () {
      holds.clear();
      st.target = null; st.walking = false; pose.walk = 0;
    },
    update: function (dt) { sync(); update(dt); },
    render: function (g) { sync(); render(g); },
    pointer: function (type, p) { sync(); pointer(type, p); },
    resize: function () { sync(); resize(); }
  });

  if (window.__bella === undefined) window.__bella = {};
  window.__bella.street = {
    st: st,
    places: function () {
      sync();
      return PLACES.map(function (p, i) {
        var tg = target(i);
        return { kind: p.kind, x: placeX(i), sx: tg.x, sy: tg.y, r: tg.r };
      });
    },
    worldW: function () { return L.ww; },
    enter: function (kind) { walkTo(place(kind)); }
  };
})();
