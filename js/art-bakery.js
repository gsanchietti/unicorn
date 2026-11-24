/* art-bakery.js - the painted pieces of the bakery (inside the big pink mushroom
 * house), in the style of the bedroom-wall mural. Classic script: window.Bakery.
 * Needs window.Art (js/art.js) loaded first.
 *
 * THESE ARE PLACEHOLDER DRAWINGS. The designer replaces the bodies of the
 * painting functions; the API below, the sizes and the anchors stay as they are,
 * because js/scenes/bakery.js lays the room out with them.
 *
 * Sizes: `u` is the scene's size unit in CSS px, u = min(M, 0.9 H). Everything is
 * pre-rendered into canvases at DPR in build() (the room when first asked for a
 * size); the scene only blits them per frame: no shadowBlur, no filters, no grain
 * per frame. Every {c, w, h} below is a canvas c of (w x h CSS px) x DPR.
 *
 *   Bakery.COUNTER = 0.62       the counter top, as a fraction of the screen height
 *                               (the scene puts it at 0.62 H; room() uses it for the shelf)
 *   Bakery.build(u, DPR)        (re)builds every sprite for this size. The scene calls
 *                               it from its resize().
 *   Bakery.room(W, H, night) -> canvas
 *                               the full-screen back wall (W x H CSS px at DPR), with
 *                               the window (at windowRect(W, H)) and the shelf (on the
 *                               left, above the oven). Cached per size. `night` is
 *                               unused in this step: pass false.
 *   Bakery.windowRect(W, H) -> {x, y, w, h}
 *                               where room() paints the window's glass, in CSS px. The
 *                               scene lines the saved cakes' thumbnails up along its
 *                               inside bottom edge (the sill).
 *   Bakery.sprite(kind) -> {c, w, h}
 *                               ANCHORED AT BOTTOM CENTER: draw it with
 *                               g.drawImage(c, x - w / 2, y - h, w, h). kind:
 *       'counter'     3 u x 1 u. The one exception to the anchor: its TOP edge is the
 *                     counter top. The scene draws its top-center part from the counter
 *                     top down to the bottom of the screen, cropped to the screen
 *                     (stretched only on screens wider than 3 u or taller than 1 u
 *                     below the counter), so it must tile nothing and may be cut anywhere.
 *       'oven'        0.3 u x 0.34 u, stands on the counter top on the left. Its door
 *                     (where the cake comes out) is centered 0.38 h above the anchor;
 *                     the scene lays a warm glow there while it is open.
 *       'stool'       0.22 u x 0.16 u, the friend's stool, behind the counter on the
 *                     right; the scene puts its anchor 0.04 u below the counter top and
 *                     sits the friend on it.
 *       'bell'        0.11 u x 0.11 u, the counter bell, on the counter left of the cake.
 *       'wishBubble'  0.28 u x 0.28 u, a thought bubble with its tail at the anchor
 *                     (pointing down to the friend's head). The scene draws the wished
 *                     topping centered 0.6 h above the anchor, 0.5 h across.
 *   Bakery.cakeBase(shape) -> {c, w, h, clip(g)}
 *                               shape 'round' (0.36 u x 0.3 u), 'heart' (0.36 u x 0.32 u),
 *                               'tall' (0.3 u x 0.4 u): the plain sponge cake on its
 *                               plate, as seen from the front, plate at the bottom.
 *                               clip(g) begins a path, adds the cake's top and sides
 *                               (not the plate) in the base's own PIXEL space
 *                               (0..c.width, 0..c.height) under g's current transform,
 *                               and calls g.clip(). The caller wraps it in
 *                               save()/restore(). The scene copies c into the cake's
 *                               own canvas and stamps the cream there, clipped by it;
 *                               it also hit-tests taps with it (isPointInPath).
 *   Bakery.creamStamp(color) -> {c, r}
 *                               a soft round blob of cream, radius r CSS px (c is
 *                               2r x 2r at DPR). color 'pink'|'choc'|'lemon'|'mint'.
 *                               The scene stamps it along the finger's path, about
 *                               every 0.35 r, so it must look good piled up.
 *   Bakery.topping(kind) -> {c, w, h}
 *                               ANCHORED AT THE CENTER, about 0.07 u across. kind
 *                               'strawberry'|'chocdrop'|'sprinkles'|'flower'|'star'|'candle'.
 *   Bakery.icon(id) -> {c, r}
 *                               a round button face of radius r = 0.1 u (c is 2r x 2r at
 *                               DPR, the disc filling it), drawn scaled to the button's
 *                               radius (about 0.06..0.09 min(W, H)). id: 'shape:<shape>',
 *                               'cream:<color>', 'top:<kind>', 'bell'.
 *   Bakery.SHAPES, Bakery.CREAMS, Bakery.TOPPINGS   the lists above, in button order
 */
(function () {
  'use strict';

  var Art = window.Art, PAL = Art.PAL;
  var TAU = Math.PI * 2;

  var SHAPES = ['round', 'heart', 'tall'];
  var CREAMS = ['pink', 'choc', 'lemon', 'mint'];
  var TOPPINGS = ['strawberry', 'chocdrop', 'sprinkles', 'flower', 'star', 'candle'];
  var COUNTER = 0.62;
  var C = {
    wall: '#fbe4e4', wallDeep: '#f3cbd1', dot: '#f6d3da',
    wood: '#d99a6c', woodDeep: '#a9693f', woodTop: '#f1c39a',
    sponge: '#f6d79e', spongeDeep: '#d9a865', jam: '#ef8fa8',
    plate: '#fbfaf6', plateDeep: '#cfd6e2',
    oven: '#e58a6a', ovenDeep: '#b85c47', ovenDoor: '#6b3a33',
    gold: '#f6dc6e', goldDeep: '#d9a92c',
    glass: '#bfe3f2', button: '#fffaf0'
  };
  var CREAM = {
    pink: ['#f9b3cc', '#f08fb2'], choc: ['#9a6446', '#7a4a33'],
    lemon: ['#fbe98c', '#f2d35a'], mint: ['#b5e8cf', '#86d3ae']
  };

  var u = 100, dpr = 1, S = null;
  var roomKey = '', roomC = null;

  // ---------------------------------------------------------------- helpers
  // a canvas of w x h CSS px at dpr, with its context scaled to CSS px
  function paint(w, h) {
    var c = Art.makeCanvas(w * dpr, h * dpr);
    c.lw = w; c.lh = h;
    var g = c.getContext('2d');
    g.scale(c.width / w, c.height / h);
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { c: c, g: g, w: w, h: h };
  }
  function lw(k) { return Math.max(1, u * 0.008 * (k || 1)); }
  function fillInk(g, fill, k) {
    g.fillStyle = fill; g.fill();
    Art.ink(g, lw(k)); g.stroke();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function rrect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function starPath(g, x, y, R, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.5 : R;
      if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
  }
  function heartPath(g, cx, top, w, h) {
    g.beginPath();
    g.moveTo(cx, top + h * 0.28);
    g.bezierCurveTo(cx - w * 0.05, top - h * 0.04, cx - w * 0.5, top - h * 0.02, cx - w * 0.5, top + h * 0.3);
    g.bezierCurveTo(cx - w * 0.5, top + h * 0.6, cx - w * 0.15, top + h * 0.8, cx, top + h);
    g.bezierCurveTo(cx + w * 0.15, top + h * 0.8, cx + w * 0.5, top + h * 0.6, cx + w * 0.5, top + h * 0.3);
    g.bezierCurveTo(cx + w * 0.5, top - h * 0.02, cx + w * 0.05, top - h * 0.04, cx, top + h * 0.28);
    g.closePath();
  }

  // ------------------------------------------------------------------- room
  function windowRect(W, H) {
    var top = Math.max(0.07 * H, 60), ct = COUNTER * H;
    var w = Math.min(0.56 * W, 0.9 * u);
    var h = Math.max(u * 0.12, Math.min(0.22 * H, 0.4 * u, ct - 0.36 * u - top));
    return { x: W / 2 - w / 2, y: top, w: w, h: h };
  }
  function room(W, H) {
    var key = W + 'x' + H + 'x' + u + 'x' + dpr;
    if (roomC && roomKey === key) return roomC;
    var s = paint(W, H), g = s.g, i;
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, C.wall); gr.addColorStop(1, C.wallDeep);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var rnd = Art.rng(11);
    g.fillStyle = C.dot;
    for (i = 0; i < 40; i++) { circle(g, rnd() * W, rnd() * H * 0.7, u * (0.012 + rnd() * 0.02)); g.fill(); }
    // the window: a wooden frame, the sky, a scalloped awning
    var r = windowRect(W, H), f = u * 0.025;
    rrect(g, r.x - f, r.y - f, r.w + 2 * f, r.h + 2 * f, u * 0.05);
    g.fillStyle = C.wood; g.fill();
    rrect(g, r.x, r.y, r.w, r.h, u * 0.03);
    var sky = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    sky.addColorStop(0, PAL.sky); sky.addColorStop(1, '#e3f3fb');
    g.fillStyle = sky; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    circle(g, r.x + r.w * 0.2, r.y + r.h * 0.3, r.h * 0.12); g.fill();
    circle(g, r.x + r.w * 0.27, r.y + r.h * 0.26, r.h * 0.15); g.fill();
    // shelf on the left, with jars
    var sy = Math.min(0.4 * H, COUNTER * H - 0.38 * u), sx = Math.max(0.02 * W, 4), sw = Math.min(0.22 * W, 0.4 * u);
    g.fillStyle = C.wood; g.fillRect(sx, sy, sw, u * 0.025);
    var jars = ['#f9b3cc', '#fbe98c', '#b5e8cf'];
    for (i = 0; i < 3; i++) {
      var jx = sx + sw * (0.2 + i * 0.3), jh = u * 0.07;
      rrect(g, jx - u * 0.025, sy - jh, u * 0.05, jh, u * 0.015);
      g.fillStyle = jars[i]; g.fill();
    }
    Art.pencil(s.c, '#e7aab6', 7, 0.5);
    // ink lines on top of the grain
    Art.ink(g, lw());
    rrect(g, r.x - f, r.y - f, r.w + 2 * f, r.h + 2 * f, u * 0.05); g.stroke();
    rrect(g, r.x, r.y, r.w, r.h, u * 0.03); g.stroke();
    g.strokeRect(sx, sy, sw, u * 0.025);
    for (i = 0; i < 3; i++) {
      rrect(g, sx + sw * (0.2 + i * 0.3) - u * 0.025, sy - u * 0.07, u * 0.05, u * 0.07, u * 0.015); g.stroke();
    }
    roomKey = key; roomC = s.c;
    return roomC;
  }

  // ---------------------------------------------------------------- sprites
  function counter() {
    var s = paint(3 * u, u), g = s.g, w = s.w, h = s.h, i;
    g.fillStyle = C.wood; g.fillRect(0, 0, w, h);
    g.fillStyle = C.woodTop; g.fillRect(0, 0, w, u * 0.05);
    g.fillStyle = C.woodDeep;
    for (i = 0; i < 40; i++) g.fillRect(i * u * 0.18, u * 0.08, Math.max(1, u * 0.006), h);
    Art.pencil(s.c, C.woodDeep, 3, 0.7);
    Art.ink(g, lw(1.2));
    g.beginPath(); g.moveTo(0, u * 0.05); g.lineTo(w, u * 0.05); g.stroke();
    g.beginPath(); g.moveTo(0, lw()); g.lineTo(w, lw()); g.stroke();
    return s;
  }
  function oven() {
    var s = paint(0.3 * u, 0.34 * u), g = s.g, w = s.w, h = s.h;
    g.beginPath();
    g.moveTo(w * 0.06, h * 0.98);
    g.lineTo(w * 0.06, h * 0.45);
    g.bezierCurveTo(w * 0.06, -h * 0.02, w * 0.94, -h * 0.02, w * 0.94, h * 0.45);
    g.lineTo(w * 0.94, h * 0.98);
    g.closePath();
    fillInk(g, C.oven, 1.2);
    rrect(g, w * 0.22, h * 0.44, w * 0.56, h * 0.36, w * 0.2);
    fillInk(g, C.ovenDoor);
    circle(g, w * 0.5, h * 0.5, w * 0.03); fillInk(g, C.gold, 0.6);
    return s;
  }
  function stool() {
    var s = paint(0.22 * u, 0.16 * u), g = s.g, w = s.w, h = s.h;
    g.beginPath(); g.moveTo(w * 0.25, h * 0.2); g.lineTo(w * 0.18, h); g.moveTo(w * 0.75, h * 0.2); g.lineTo(w * 0.82, h);
    Art.ink(g, lw(2.2)); g.stroke();
    g.beginPath(); g.ellipse(w / 2, h * 0.16, w * 0.46, h * 0.13, 0, 0, TAU);
    fillInk(g, PAL.mushroom);
    return s;
  }
  function bell() {
    var s = paint(0.11 * u, 0.11 * u), g = s.g, w = s.w, h = s.h;
    g.beginPath(); g.ellipse(w / 2, h * 0.9, w * 0.46, h * 0.07, 0, 0, TAU); fillInk(g, C.goldDeep, 0.8);
    g.beginPath(); g.moveTo(w * 0.12, h * 0.86); g.bezierCurveTo(w * 0.12, h * 0.25, w * 0.88, h * 0.25, w * 0.88, h * 0.86); g.closePath();
    fillInk(g, C.gold, 0.8);
    circle(g, w / 2, h * 0.24, w * 0.08); fillInk(g, C.gold, 0.6);
    return s;
  }
  function wishBubble() {
    var s = paint(0.28 * u, 0.28 * u), g = s.g, w = s.w, h = s.h;
    circle(g, w * 0.5, h * 0.4, h * 0.36); fillInk(g, '#ffffff');
    circle(g, w * 0.72, h * 0.83, h * 0.06); fillInk(g, '#ffffff', 0.7);
    circle(g, w * 0.84, h * 0.95, h * 0.035); fillInk(g, '#ffffff', 0.6);
    return s;
  }

  // ------------------------------------------------------------------ cakes
  var CAKE = { round: [0.36, 0.3], heart: [0.36, 0.32], tall: [0.3, 0.4] };
  // the cake's outline (not the plate), in CSS px of a base w x h, scaled by k
  function cakePath(g, shape, w, h, k) {
    var pl = u * 0.04;                        // the plate's height
    g.save(); g.scale(k, k);
    if (shape === 'round') {
      var rx = w * 0.44, ry = h * 0.11, top = h * 0.2, bot = h - pl;
      g.moveTo(w / 2 - rx, top);
      g.ellipse(w / 2, top, rx, ry, 0, Math.PI, TAU);
      g.lineTo(w / 2 + rx, bot);
      g.ellipse(w / 2, bot, rx, ry, 0, 0, Math.PI);
      g.closePath();
    } else if (shape === 'heart') {
      heartPath(g, w / 2, h * 0.04, w * 0.94, h - pl - h * 0.02);
    } else {
      var r1 = w * 0.46, r2 = w * 0.32, e = h * 0.06, b = h - pl, mid = h * 0.52, t2 = h * 0.14;
      g.moveTo(w / 2 - r1, mid);
      g.lineTo(w / 2 - r2, mid);
      g.lineTo(w / 2 - r2, t2);
      g.ellipse(w / 2, t2, r2, e, 0, Math.PI, TAU);
      g.lineTo(w / 2 + r2, mid);
      g.lineTo(w / 2 + r1, mid);
      g.lineTo(w / 2 + r1, b);
      g.ellipse(w / 2, b, r1, e, 0, 0, Math.PI);
      g.closePath();
    }
    g.restore();
  }
  function cakeBase(shape) {
    var sz = CAKE[shape], s = paint(sz[0] * u, sz[1] * u), g = s.g, w = s.w, h = s.h;
    var pl = u * 0.04;
    g.beginPath(); g.ellipse(w / 2, h - pl * 0.55, w * 0.49, pl * 0.5, 0, 0, TAU);
    fillInk(g, C.plate, 0.8);
    g.beginPath(); cakePath(g, shape, w, h, 1);
    g.fillStyle = C.sponge; g.fill();
    g.save(); g.clip();
    g.fillStyle = C.jam;
    g.fillRect(0, h * (shape === 'tall' ? 0.72 : 0.58), w, u * 0.018);
    if (shape === 'tall') g.fillRect(0, h * 0.34, w, u * 0.014);
    g.restore();
    g.beginPath(); cakePath(g, shape, w, h, 1);
    Art.ink(g, lw()); g.stroke();
    var out = { c: s.c, w: w, h: h };
    out.clip = function (cg) { cg.beginPath(); cakePath(cg, shape, w, h, s.c.width / w); cg.clip(); };
    return out;
  }
  function creamStamp(color) {
    var r = u * 0.032, s = paint(2 * r, 2 * r), g = s.g, col = CREAM[color];
    var gr = g.createRadialGradient(r * 0.8, r * 0.8, 0, r, r, r);
    gr.addColorStop(0, col[0]); gr.addColorStop(0.6, col[0]); gr.addColorStop(0.85, col[1]);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; circle(g, r, r, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    circle(g, r * 0.75, r * 0.7, r * 0.22); g.fill();
    return { c: s.c, r: r };
  }

  // --------------------------------------------------------------- toppings
  function drawTopping(g, kind, x, y, d) {
    var i;
    if (kind === 'strawberry') {
      g.beginPath();
      g.moveTo(x, y + d * 0.45);
      g.bezierCurveTo(x - d * 0.5, y + d * 0.1, x - d * 0.45, y - d * 0.35, x, y - d * 0.28);
      g.bezierCurveTo(x + d * 0.45, y - d * 0.35, x + d * 0.5, y + d * 0.1, x, y + d * 0.45);
      fillInk(g, '#e94b5f', 0.7);
      g.fillStyle = '#fff3a8';
      for (i = 0; i < 5; i++) { circle(g, x + Math.cos(i * 1.3) * d * 0.17, y + Math.sin(i * 1.9) * d * 0.12 + d * 0.04, d * 0.035); g.fill(); }
      g.beginPath(); g.ellipse(x, y - d * 0.3, d * 0.22, d * 0.08, 0, 0, TAU); fillInk(g, PAL.leaf, 0.5);
    } else if (kind === 'chocdrop') {
      g.beginPath();
      g.moveTo(x, y - d * 0.42);
      g.bezierCurveTo(x + d * 0.1, y - d * 0.1, x + d * 0.38, y + d * 0.05, x + d * 0.3, y + d * 0.28);
      g.bezierCurveTo(x + d * 0.2, y + d * 0.45, x - d * 0.2, y + d * 0.45, x - d * 0.3, y + d * 0.28);
      g.bezierCurveTo(x - d * 0.38, y + d * 0.05, x - d * 0.1, y - d * 0.1, x, y - d * 0.42);
      fillInk(g, '#6e4330', 0.7);
    } else if (kind === 'sprinkles') {
      var cols = PAL.confetti;
      g.lineWidth = d * 0.11; g.lineCap = 'round';
      for (i = 0; i < 7; i++) {
        var a = i * 2.4, px = x + Math.cos(i * 1.7) * d * 0.28, py = y + Math.sin(i * 2.3) * d * 0.25;
        g.strokeStyle = cols[i % cols.length];
        g.beginPath(); g.moveTo(px - Math.cos(a) * d * 0.1, py - Math.sin(a) * d * 0.1); g.lineTo(px + Math.cos(a) * d * 0.1, py + Math.sin(a) * d * 0.1); g.stroke();
      }
    } else if (kind === 'flower') {
      for (i = 0; i < 5; i++) {
        var b = i * TAU / 5;
        circle(g, x + Math.cos(b) * d * 0.24, y + Math.sin(b) * d * 0.24, d * 0.2); fillInk(g, '#ffffff', 0.5);
      }
      circle(g, x, y, d * 0.16); fillInk(g, PAL.yellow, 0.5);
    } else if (kind === 'star') {
      starPath(g, x, y, d * 0.48, 0); fillInk(g, PAL.star, 0.6);
    } else if (kind === 'candle') {
      rrect(g, x - d * 0.12, y - d * 0.3, d * 0.24, d * 0.78, d * 0.05);
      fillInk(g, '#a6d6ee', 0.6);
      g.beginPath();
      g.moveTo(x, y - d * 0.62);
      g.bezierCurveTo(x + d * 0.16, y - d * 0.45, x + d * 0.1, y - d * 0.32, x, y - d * 0.33);
      g.bezierCurveTo(x - d * 0.1, y - d * 0.32, x - d * 0.16, y - d * 0.45, x, y - d * 0.62);
      fillInk(g, '#f9a646', 0.5);
    }
  }
  function topping(kind) {
    var d = u * 0.07, s = paint(d * 1.3, d * 1.4);
    drawTopping(s.g, kind, s.w / 2, s.h / 2, d);
    return s;
  }

  // ------------------------------------------------------------------ icons
  function icon(id) {
    var r = u * 0.1, s = paint(2 * r, 2 * r), g = s.g, p = id.split(':');
    circle(g, r, r, r * 0.94); fillInk(g, C.button, 1.1);
    if (p[0] === 'shape') {
      var b = S.cake[p[1]], k = (r * 1.25) / Math.max(b.w, b.h);
      g.drawImage(b.c, r - b.w * k / 2, r - b.h * k / 2, b.w * k, b.h * k);
    } else if (p[0] === 'cream') {
      var col = CREAM[p[1]];
      g.beginPath();
      g.moveTo(r * 0.45, r * 1.35);
      g.bezierCurveTo(r * 0.35, r * 0.95, r * 0.7, r * 0.85, r * 0.8, r * 0.7);
      g.bezierCurveTo(r * 0.85, r * 0.45, r * 1.05, r * 0.35, r, r * 0.25);
      g.bezierCurveTo(r * 1.35, r * 0.45, r * 1.35, r * 0.7, r * 1.25, r * 0.8);
      g.bezierCurveTo(r * 1.6, r * 0.95, r * 1.65, r * 1.2, r * 1.55, r * 1.35);
      g.closePath();
      fillInk(g, col[0], 0.9);
      rrect(g, r * 0.4, r * 1.3, r * 1.2, r * 0.32, r * 0.12); fillInk(g, col[1], 0.9);
    } else if (p[0] === 'top') {
      drawTopping(g, p[1], r, r, r * 1.05);
    } else if (id === 'bell') {
      var bs = S.sprite.bell, kb = (r * 1.3) / bs.h;
      g.drawImage(bs.c, r - bs.w * kb / 2, r - bs.h * kb / 2, bs.w * kb, bs.h * kb);
    }
    return { c: s.c, r: r };
  }

  // ------------------------------------------------------------------ build
  function build(size, ratio) {
    u = size; dpr = ratio;
    S = { sprite: {}, cake: {}, cream: {}, top: {}, icon: {} };
    S.sprite.counter = counter();
    S.sprite.oven = oven();
    S.sprite.stool = stool();
    S.sprite.bell = bell();
    S.sprite.wishBubble = wishBubble();
    SHAPES.forEach(function (k) { S.cake[k] = cakeBase(k); });
    CREAMS.forEach(function (k) { S.cream[k] = creamStamp(k); });
    TOPPINGS.forEach(function (k) { S.top[k] = topping(k); });
    SHAPES.forEach(function (k) { S.icon['shape:' + k] = icon('shape:' + k); });
    CREAMS.forEach(function (k) { S.icon['cream:' + k] = icon('cream:' + k); });
    TOPPINGS.forEach(function (k) { S.icon['top:' + k] = icon('top:' + k); });
    S.icon.bell = icon('bell');
    roomKey = '';
  }
  function need() { if (!S) build(u, Math.min(2, window.devicePixelRatio || 1)); return S; }

  window.Bakery = {
    COUNTER: COUNTER, SHAPES: SHAPES, CREAMS: CREAMS, TOPPINGS: TOPPINGS,
    build: build,
    room: function (W, H) { need(); return room(W, H); },
    windowRect: windowRect,
    sprite: function (kind) { return need().sprite[kind]; },
    cakeBase: function (shape) { return need().cake[shape]; },
    creamStamp: function (color) { return need().cream[color]; },
    topping: function (kind) { return need().top[kind]; },
    icon: function (id) { return need().icon[id]; }
  };
})();
