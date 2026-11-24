/* art-bakery.js - the painted pieces of the bakery (inside the big pink mushroom
 * house), in the style of the bedroom-wall mural. Classic script: window.Bakery.
 * Needs window.Art (js/art.js) loaded first.
 *
 * Every piece is painted like the mural: pencil fills with a grain (Art.pencil),
 * a lighter spot, the white dotted trim of the mushroom houses and an uneven ink
 * line (Art.ink). The API below, the sizes and the anchors are what
 * js/scenes/bakery.js lays the room out with.
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
    wall: '#fdeee6', wallDeep: '#f6cfd3', rib: '#eea9b7',
    wood: '#dba06f', woodDeep: '#a9693f', woodTop: '#f3cfa6',
    cloth: PAL.mushroom, clothDeep: PAL.mushroomDeep,
    sponge: '#f7dba3', spongeTop: '#fcebc6', spongeDeep: '#d9a865', jam: '#ef8fa8', filling: '#fff6e4',
    plate: '#fdfcf8', plateDeep: '#b9c4d6',
    oven: '#f39a58', ovenDeep: '#c9642c', ovenDark: '#5a2f2a', ovenGlow: '#ffc76a',
    gold: '#f8dd6c', goldDeep: '#d9a326',
    sky: '#bfe4f4', button: '#fffaf0'
  };
  // [fill, deep, light]
  var CREAM = {
    pink: ['#fbb4cf', '#ee7fa9', '#ffe1ec'], choc: ['#b07850', '#7f4d30', '#d8a67e'],
    lemon: ['#fbe98c', '#eac544', '#fff7c8'], mint: ['#b5e8cf', '#74c79e', '#e2f8ec']
  };

  var u = 100, dpr = 1, S = null;
  var roomKey = '', roomC = null;
  var seed = 1;

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
  // Paints on a transparent layer the size of s, then lays it on s: a piece can
  // grain its own fill and ink its own outline without touching the others.
  function layer(s, fn) {
    var c = Art.makeCanvas(s.c.width, s.c.height);
    c.lw = s.w; c.lh = s.h;
    var g = c.getContext('2d');
    g.setTransform(s.g.getTransform());
    g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g, c);
    s.g.save(); s.g.setTransform(1, 0, 0, 1, 0, 0); s.g.drawImage(c, 0, 0); s.g.restore();
  }
  // the hand-drawn ink line: stroked twice, the second pass thinner and a hair off
  function inkPath(g, path, w) {
    Art.ink(g, w);
    path(g); g.stroke();
    g.save();
    g.translate(w * 0.22, -w * 0.18);
    g.lineWidth = w * 0.6;
    path(g); g.stroke();
    g.restore();
  }
  // One painted piece: pencil fill, lighter spots, grain, ink outline.
  // path(g) begins its own path. o: {ink (line width factor, 0 for none), grain,
  // around (true for a union of sub-paths: the line goes around all of them),
  // inside(g) (clipped, under the grain), over(g) (clipped, over the grain), top(g)}
  function piece(s, path, fill, deep, o) {
    o = o || {};
    layer(s, function (g, c) {
      path(g); g.fillStyle = fill; g.fill();
      if (o.inside) { g.save(); path(g); g.clip(); o.inside(g); g.restore(); }
      if (deep) Art.pencil(c, deep, seed++, o.grain === undefined ? 0.8 : o.grain);
      if (o.over) { g.save(); path(g); g.clip(); o.over(g); g.restore(); }
      if (o.ink !== 0) {
        if (o.around) {
          g.save();
          g.globalCompositeOperation = 'destination-over';
          Art.ink(g, lw(o.ink || 1) * 2);
          path(g); g.stroke();
          g.restore();
        } else inkPath(g, path, lw(o.ink || 1));
      }
      if (o.top) o.top(g);
    });
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function dot(g, x, y, r, fill) { circle(g, x, y, r); g.fillStyle = fill; g.fill(); }
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
  // a window like the mushroom houses': round on top (radius R), soft corners below
  function archPath(g, x, y, w, h, R, rb) {
    R = Math.min(R, w / 2, h); rb = Math.min(rb, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x, y + R);
    g.arcTo(x, y, x + R, y, R);
    g.arcTo(x + w, y, x + w, y + R, R);
    g.arcTo(x + w, y + h, x + w - rb, y + h, rb);
    g.arcTo(x, y + h, x, y + h - rb, rb);
    g.closePath();
  }
  function starPath(g, x, y, R, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.52 : R;
      if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
  }
  // adds a heart to the current path (no beginPath)
  function heartSub(g, cx, top, w, h) {
    g.moveTo(cx, top + h * 0.24);
    g.bezierCurveTo(cx - w * 0.06, top - h * 0.04, cx - w * 0.5, top - h * 0.04, cx - w * 0.5, top + h * 0.3);
    g.bezierCurveTo(cx - w * 0.5, top + h * 0.6, cx - w * 0.14, top + h * 0.8, cx, top + h);
    g.bezierCurveTo(cx + w * 0.14, top + h * 0.8, cx + w * 0.5, top + h * 0.6, cx + w * 0.5, top + h * 0.3);
    g.bezierCurveTo(cx + w * 0.5, top - h * 0.04, cx + w * 0.06, top - h * 0.04, cx, top + h * 0.24);
    g.closePath();
  }
  // a soft light (or tinted) spot
  function spot(g, x, y, r, rgb, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function light(g, x, y, r, a) { spot(g, x, y, r, '255,255,255', a === undefined ? 0.4 : a); }
  // the mural's white dotted trim: n dots along pt(t), t 0..1
  function dotsAlong(g, pt, n, r, fill) {
    g.fillStyle = fill || 'rgba(255,255,255,0.92)';
    for (var i = 0; i < n; i++) {
      var p = pt(n > 1 ? i / (n - 1) : 0.5);
      g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fill();
    }
  }
  function quadPt(a, b, c) {
    return function (t) { var m = 1 - t; return [m * m * a[0] + 2 * m * t * b[0] + t * t * c[0], m * m * a[1] + 2 * m * t * b[1] + t * t * c[1]]; };
  }
  function shine(g, x, y, r, rot) {
    ell(g, x, y, r, r * 0.55, rot === undefined ? -0.6 : rot);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  }

  // ------------------------------------------------------------------- room
  function windowRect(W, H) {
    var top = Math.max(0.07 * H, 60), ct = COUNTER * H;
    var w = Math.min(0.56 * W, 0.9 * u);
    var h = Math.max(u * 0.12, Math.min(0.22 * H, 0.4 * u, ct - 0.36 * u - top));
    return { x: W / 2 - w / 2, y: top, w: w, h: h };
  }
  // The window: the mushroom house's round-topped window, a gold frame with the
  // white dotted trim, the sky outside, and a sill the saved cakes stand on.
  function windowSprite(r) {
    var f = u * 0.032, m = f * 3.2, s = paint(r.w + 2 * m, r.h + 2 * m), g = s.g;
    var R = Math.min(r.w / 2, r.h * 0.62), tall = r.h > u * 0.25;
    g.translate(m, m);
    piece(s, function (g) { archPath(g, -f, -f, r.w + 2 * f, r.h + 2 * f, R + f, u * 0.035 + f); }, C.gold, C.goldDeep, {
      ink: 1.3,
      inside: function (g) { light(g, r.w * 0.3, 0, r.w * 0.5, 0.35); }
    });
    piece(s, function (g) { archPath(g, 0, 0, r.w, r.h, R, u * 0.035); }, C.sky, PAL.cloudDeep, {
      grain: 0.45,
      inside: function (g) {
        var sky = g.createLinearGradient(0, 0, 0, r.h);
        sky.addColorStop(0, '#a9daf0'); sky.addColorStop(1, '#eaf6fb');
        g.fillStyle = sky; g.fillRect(-f, -f, r.w + 2 * f, r.h + 2 * f);
        // puffy clouds
        var cr = Math.min(r.h * 0.16, r.w * 0.07);
        [[0.24, 0.3, 1], [0.74, 0.2, 0.75]].forEach(function (q) {
          var x = r.w * q[0], y = r.h * q[1], k = cr * q[2];
          g.fillStyle = 'rgba(255,255,255,0.95)';
          [[-1.1, 0.25, 0.75], [-0.25, -0.3, 1], [0.7, 0, 0.85], [1.4, 0.3, 0.6]].forEach(function (b) {
            g.beginPath(); g.arc(x + b[0] * k, y + b[1] * k, b[2] * k, 0, TAU); g.fill();
          });
          g.fillRect(x - 1.5 * k, y + 0.2 * k, 3.2 * k, 0.7 * k);
        });
        // a green hill and the pink cap of the next mushroom house
        g.fillStyle = PAL.leaf;
        g.beginPath(); g.ellipse(r.w * 0.3, r.h * 1.16, r.w * 0.62, r.h * 0.42, 0, 0, TAU); g.fill();
        g.fillStyle = '#9bd68f';
        g.beginPath(); g.ellipse(r.w * 0.85, r.h * 1.2, r.w * 0.5, r.h * 0.4, 0, 0, TAU); g.fill();
      },
      over: function (g) {
        // the sun's light on the glass
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = lw(2.2);
        g.beginPath(); g.moveTo(r.w * 0.08, r.h * 0.55); g.lineTo(r.w * 0.08 + r.h * 0.22, r.h * 0.2); g.stroke();
      }
    });
    // the cross bars of the mural's windows, above the cakes
    if (tall) {
      piece(s, function (g) {
        var b = f * 0.5, y = r.h * 0.36;
        g.beginPath();
        g.rect(0, y - b / 2, r.w, b);
        g.rect(r.w / 2 - b / 2, 0, b, y);
      }, C.gold, C.goldDeep, {});
    }
    // white dotted trim around the frame
    var n = Math.max(8, Math.round((r.w + 2 * r.h) / (u * 0.045)));
    var per = [];             // the frame's middle line, sampled
    (function () {
      var x0 = -f / 2, y0 = -f / 2, w = r.w + f, h = r.h + f, Rr = Math.min(R + f / 2, w / 2), i, a;
      for (i = 0; i <= 8; i++) per.push([x0, y0 + h - (h - Rr) * i / 8]);
      for (i = 1; i <= 10; i++) { a = Math.PI + (Math.PI / 2) * i / 10; per.push([x0 + Rr + Math.cos(a) * Rr, y0 + Rr + Math.sin(a) * Rr]); }
      for (i = 1; i <= 8; i++) per.push([x0 + Rr + (w - 2 * Rr) * i / 8, y0]);
      for (i = 1; i <= 10; i++) { a = -Math.PI / 2 + (Math.PI / 2) * i / 10; per.push([x0 + w - Rr + Math.cos(a) * Rr, y0 + Rr + Math.sin(a) * Rr]); }
      for (i = 1; i <= 8; i++) per.push([x0 + w, y0 + Rr + (h - Rr) * i / 8]);
    })();
    var len = [0], i;
    for (i = 1; i < per.length; i++) len.push(len[i - 1] + Math.hypot(per[i][0] - per[i - 1][0], per[i][1] - per[i - 1][1]));
    dotsAlong(g, function (t) {
      var d = t * len[len.length - 1], k = 1;
      while (k < len.length - 1 && len[k] < d) k++;
      var q = (d - len[k - 1]) / ((len[k] - len[k - 1]) || 1);
      return [per[k - 1][0] + (per[k][0] - per[k - 1][0]) * q, per[k - 1][1] + (per[k][1] - per[k - 1][1]) * q];
    }, n, f * 0.17);
    // the sill
    piece(s, function (g) { rrect(g, -f * 2.2, r.h + f * 0.35, r.w + f * 4.4, f * 1.25, f * 0.6); }, C.wood, C.woodDeep, {
      ink: 1.2,
      inside: function (g) { g.fillStyle = C.woodTop; g.fillRect(-f * 3, r.h, r.w + f * 6, f * 0.8); }
    });
    return { s: s, m: m };
  }
  // the shelf with three jars of sprinkles
  function shelfSprite(sw) {
    var jh = u * 0.085, p = u * 0.02, s = paint(sw + 2 * p, jh + u * 0.07 + 2 * p), g = s.g, i;
    g.translate(p, p + jh + u * 0.012);
    var cols = [[CREAM.pink[0], CREAM.pink[1]], [CREAM.lemon[0], CREAM.lemon[1]], [CREAM.mint[0], CREAM.mint[1]]];
    var lids = [PAL.roof, PAL.orange, PAL.river];
    for (i = 0; i < 3; i++) {
      (function (i) {
        var x = sw * (0.2 + i * 0.3), jw = Math.min(u * 0.06, sw * 0.24);
        piece(s, function (g) { rrect(g, x - jw / 2, -jh * 0.82, jw, jh * 0.82, jw * 0.3); }, '#f8fbfc', PAL.cloudDeep, {
          grain: 0.3,
          inside: function (g) {
            g.fillStyle = cols[i][0]; g.fillRect(x - jw, -jh * 0.55, 2 * jw, jh);
            var rnd = Art.rng(31 + i);
            for (var k = 0; k < 14; k++) dot(g, x + (rnd() - 0.5) * jw, -rnd() * jh * 0.5, jw * 0.07, k % 2 ? cols[i][1] : '#ffffff');
          },
          over: function (g) {
            g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = lw(1);
            g.beginPath(); g.moveTo(x - jw * 0.28, -jh * 0.66); g.lineTo(x - jw * 0.28, -jh * 0.3); g.stroke();
          }
        });
        piece(s, function (g) { rrect(g, x - jw * 0.58, -jh, jw * 1.16, jh * 0.24, jh * 0.08); }, lids[i], null, { ink: 0.9 });
      })(i);
    }
    piece(s, function (g) { rrect(g, 0, 0, sw, u * 0.03, u * 0.012); }, C.wood, C.woodDeep, {
      ink: 1.1,
      inside: function (g) { g.fillStyle = C.woodTop; g.fillRect(0, 0, sw, u * 0.01); }
    });
    // two round brackets
    [0.16, 0.84].forEach(function (k) {
      piece(s, function (g) { g.beginPath(); g.arc(sw * k, u * 0.03, u * 0.022, 0, Math.PI); g.closePath(); }, C.wood, C.woodDeep, { ink: 0.9 });
    });
    return { s: s, p: p, dy: p + jh + u * 0.012 };
  }
  function room(W, H) {
    var key = W + 'x' + H + 'x' + u + 'x' + dpr;
    if (roomC && roomKey === key) return roomC;
    var s = paint(W, H), g = s.g, i, ct = COUNTER * H;
    // the inside of the pink mushroom cap: a cream-pink wall, lighter in the middle
    var gr = g.createLinearGradient(0, 0, 0, ct);
    gr.addColorStop(0, C.wallDeep); gr.addColorStop(0.45, C.wall); gr.addColorStop(1, '#fbe1e0');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    light(g, W / 2, ct * 0.5, Math.max(W, ct) * 0.6, 0.45);
    var side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(234,132,147,0.3)'); side.addColorStop(0.22, 'rgba(234,132,147,0)');
    side.addColorStop(0.78, 'rgba(234,132,147,0)'); side.addColorStop(1, 'rgba(234,132,147,0.3)');
    g.fillStyle = side; g.fillRect(0, 0, W, H);
    // the cap's ribs curve down the wall from the top, as on the mural's mushroom
    var ribs = [], nr = W > H ? 9 : 5;
    for (i = 0; i < nr; i++) {
      var k = (i - (nr - 1) / 2) / ((nr - 1) / 2);
      ribs.push(quadPt([W / 2 + k * W * 0.2, -ct * 0.15], [W / 2 + k * W * 0.52, ct * 0.3], [W / 2 + k * W * 0.6, ct * 1.05]));
    }
    g.strokeStyle = 'rgba(232,150,168,0.55)'; g.lineWidth = lw(1.3);
    ribs.forEach(function (pt) {
      g.beginPath();
      for (var q = 0; q <= 24; q++) { var p = pt(q / 24); if (q) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
    });
    Art.pencil(s.c, '#e9a3b3', 7, 0.55);
    // white dotted trims beside the ribs
    ribs.forEach(function (pt) {
      dotsAlong(g, function (t) { var p = pt(t); return [p[0] + u * 0.016, p[1]]; }, Math.round(ct * 1.2 / (u * 0.05)), u * 0.006, 'rgba(255,255,255,0.85)');
    });
    // the window
    var r = windowRect(W, H), win = windowSprite(r);
    g.drawImage(win.s.c, r.x - win.m, r.y - win.m, win.s.w, win.s.h);
    // shelf on the left, above the oven
    var sy = Math.min(0.4 * H, ct - 0.38 * u), sx = Math.max(0.02 * W, 4), sw = Math.min(0.22 * W, 0.4 * u);
    var sh = shelfSprite(sw);
    g.drawImage(sh.s.c, sx - sh.p, sy - sh.dy, sh.s.w, sh.s.h);
    roomKey = key; roomC = s.c;
    return roomC;
  }

  // ---------------------------------------------------------------- sprites
  // The wooden counter with a pink cloth along its edge. Its top edge is the counter top.
  function counter() {
    var s = paint(3 * u, u), g = s.g, w = s.w, h = s.h, i;
    var topH = u * 0.036, hang = u * 0.03, sc = u * 0.075, sd = u * 0.034;
    // the wooden front: planks
    g.fillStyle = C.wood; g.fillRect(0, 0, w, h);
    var sh = g.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(169,105,63,0.45)'); sh.addColorStop(0.25, 'rgba(169,105,63,0)'); sh.addColorStop(1, 'rgba(169,105,63,0.25)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    var rnd = Art.rng(5);
    for (i = 0; i < 14; i++) light(g, rnd() * w, u * 0.2 + rnd() * h, u * (0.12 + rnd() * 0.12), 0.16);
    Art.pencil(s.c, C.woodDeep, 3, 0.75);
    g.strokeStyle = 'rgba(122,72,40,0.55)'; g.lineWidth = lw(0.9);
    var step = u * 0.2;
    for (i = 0; i * step < w; i++) {
      var x = (i + 0.5) * step + (rnd() - 0.5) * u * 0.01;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * u * 0.01, h); g.stroke();
      // a little wood grain: a knot or a wavy line on some planks
      if (i % 3 === 1) {
        var ky = u * (0.3 + rnd() * 0.55), kx = x + step * 0.5;
        g.beginPath(); g.ellipse(kx, ky, u * 0.012, u * 0.02, 0, 0, TAU); g.stroke();
        g.beginPath(); g.ellipse(kx, ky, u * 0.026, u * 0.045, 0, 0, TAU); g.stroke();
      } else if (i % 3 === 2) {
        var wy = u * (0.25 + rnd() * 0.5);
        g.beginPath(); g.moveTo(x + step * 0.3, wy); g.quadraticCurveTo(x + step * 0.42, wy + u * 0.08, x + step * 0.36, wy + u * 0.17); g.stroke();
      }
    }
    // the pink cloth: a band with a scalloped hem and the white dotted trim
    function cloth(g) {
      g.beginPath();
      g.moveTo(-sc, topH - 1);
      g.lineTo(w + sc, topH - 1);
      g.lineTo(w + sc, topH + hang);
      for (var x = w + sc; x > -sc; x -= sc) g.quadraticCurveTo(x - sc / 2, topH + hang + sd * 2, x - sc, topH + hang);
      g.closePath();
    }
    piece(s, cloth, C.cloth, C.clothDeep, {
      ink: 1.2,
      inside: function (g) { for (var x = 0; x < w + sc; x += sc) light(g, x + sc * 0.5 - (w + sc) % sc, topH + hang * 0.9, sc * 0.5, 0.35); },
      over: function (g) {
        g.fillStyle = 'rgba(255,255,255,0.92)';
        for (var x = w + sc; x > -sc; x -= sc) {
          var pt = quadPt([x, topH + hang - sd * 0.42], [x - sc / 2, topH + hang + sd * 1.25], [x - sc, topH + hang - sd * 0.42]);
          for (var q = 0; q < 5; q++) { var p = pt((q + 0.5) / 5); g.beginPath(); g.arc(p[0], p[1], u * 0.0055, 0, TAU); g.fill(); }
        }
      }
    });
    // the counter top
    piece(s, function (g) { g.beginPath(); g.rect(-u, 0, w + 2 * u, topH); }, C.woodTop, C.wood, {
      ink: 1.2, grain: 0.6,
      inside: function (g) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, 0, w, topH * 0.4); }
    });
    return s;
  }
  // A round, friendly oven: a warm-orange dome on little feet, a round door with
  // a window (centered 0.38 h above the bottom), two knobs and a short chimney.
  function oven() {
    var s = paint(0.3 * u, 0.34 * u), w = s.w, h = s.h;
    var cx = w / 2, dy = h * 0.62, dr = w * 0.27;
    // chimney
    piece(s, function (g) { rrect(g, cx - w * 0.09, h * 0.02, w * 0.18, h * 0.14, w * 0.03); }, '#c98a6a', C.ovenDeep, {});
    piece(s, function (g) { rrect(g, cx - w * 0.13, h * 0.012, w * 0.26, h * 0.055, w * 0.03); }, C.ovenDark, null, { ink: 0.9 });
    // feet
    [0.2, 0.8].forEach(function (k) {
      piece(s, function (g) { rrect(g, w * k - w * 0.07, h * 0.9, w * 0.14, h * 0.09, w * 0.04); }, C.ovenDark, null, { ink: 0.9 });
    });
    // the dome
    function dome(g) {
      g.beginPath();
      g.moveTo(w * 0.07, h * 0.95);
      g.bezierCurveTo(w * 0.0, h * 0.72, w * 0.02, h * 0.1, cx, h * 0.1);
      g.bezierCurveTo(w * 0.98, h * 0.1, w * 1.0, h * 0.72, w * 0.93, h * 0.95);
      g.quadraticCurveTo(cx, h * 0.985, w * 0.07, h * 0.95);
      g.closePath();
    }
    piece(s, dome, C.oven, C.ovenDeep, {
      ink: 1.3,
      inside: function (g) {
        light(g, w * 0.32, h * 0.3, w * 0.36, 0.45);
        spot(g, w * 0.8, h * 0.9, w * 0.5, '201,100,44', 0.5);
      },
      over: function (g) {
        // white dotted trim around the door and along the base
        dotsAlong(g, function (t) { var a = t * TAU; return [cx + Math.cos(a) * dr * 1.24, dy + Math.sin(a) * dr * 1.24]; }, 23, w * 0.014);
      }
    });
    // the door: a dark ring, the warm window
    piece(s, function (g) { circle(g, cx, dy, dr); }, C.ovenDark, null, { ink: 1.1 });
    piece(s, function (g) { circle(g, cx, dy, dr * 0.7); }, '#f7a94e', '#d9742c', {
      ink: 0.9, grain: 0.5,
      inside: function (g) {
        spot(g, cx, dy + dr * 0.25, dr * 0.75, '255,232,150', 0.95);
      },
      over: function (g) {
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = lw(1.1);
        g.beginPath(); g.arc(cx, dy, dr * 0.5, Math.PI * 1.05, Math.PI * 1.4); g.stroke();
      }
    });
    // the handle, on top of the door
    piece(s, function (g) { rrect(g, cx - dr * 0.5, dy - dr * 1.02, dr, dr * 0.2, dr * 0.1); }, '#fbf3e4', '#c9aa78', { ink: 0.9 });
    // two knobs
    [-1, 1].forEach(function (sd) {
      piece(s, function (g) { circle(g, cx + sd * w * 0.2, h * 0.24, w * 0.045); }, sd < 0 ? '#fbf3e4' : C.gold, null, { ink: 0.9 });
    });
    return s;
  }
  // The friend's stool: a little mushroom, pink cap with white dots.
  function stool() {
    var s = paint(0.22 * u, 0.16 * u), w = s.w, h = s.h;
    piece(s, function (g) {
      g.beginPath();
      g.moveTo(w * 0.36, h * 0.4);
      g.bezierCurveTo(w * 0.38, h * 0.7, w * 0.26, h * 0.86, w * 0.26, h * 0.97);
      g.lineTo(w * 0.74, h * 0.97);
      g.bezierCurveTo(w * 0.74, h * 0.86, w * 0.62, h * 0.7, w * 0.64, h * 0.4);
      g.closePath();
    }, '#f6d9b8', '#c98a5c', {});
    piece(s, function (g) {
      g.beginPath();
      g.moveTo(w * 0.04, h * 0.42);
      g.bezierCurveTo(w * 0.02, h * 0.02, w * 0.98, h * 0.02, w * 0.96, h * 0.42);
      g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.04, h * 0.42);
      g.closePath();
    }, PAL.mushroom, PAL.mushroomDeep, {
      ink: 1.1,
      inside: function (g) { light(g, w * 0.35, h * 0.15, w * 0.3, 0.4); },
      over: function (g) {
        dotsAlong(g, quadPt([w * 0.1, h * 0.39], [w * 0.5, h * 0.56], [w * 0.9, h * 0.39]), 13, w * 0.016);
        [[0.3, 0.2, 0.05], [0.55, 0.14, 0.04], [0.74, 0.25, 0.045]].forEach(function (q) { dot(g, w * q[0], h * q[1], w * q[2], 'rgba(255,255,255,0.9)'); });
      }
    });
    return s;
  }
  // The counter bell: small and golden, so it never hides who stands behind it.
  function bell() {
    var s = paint(0.11 * u, 0.11 * u), w = s.w, h = s.h;
    piece(s, function (g) { ell(g, w / 2, h * 0.9, w * 0.4, h * 0.08); }, '#c98a5c', C.woodDeep, { ink: 0.9 });
    piece(s, function (g) { circle(g, w / 2, h * 0.33, w * 0.075); }, C.gold, null, { ink: 0.8 });
    piece(s, function (g) {
      g.beginPath();
      g.moveTo(w * 0.17, h * 0.86);
      g.bezierCurveTo(w * 0.17, h * 0.3, w * 0.83, h * 0.3, w * 0.83, h * 0.86);
      g.closePath();
    }, C.gold, C.goldDeep, {
      ink: 0.9,
      inside: function (g) { spot(g, w * 0.75, h * 0.85, w * 0.4, '217,163,38', 0.7); },
      over: function (g) {
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = lw(1.2);
        g.beginPath(); g.arc(w * 0.5, h * 0.84, w * 0.26, Math.PI * 1.12, Math.PI * 1.4); g.stroke();
      }
    });
    return s;
  }
  // A thought cloud; two small puffs lead down to the anchor at the bottom center.
  function wishBubble() {
    var s = paint(0.28 * u, 0.28 * u), w = s.w, h = s.h;
    var cx = w * 0.5, cy = h * 0.4, R = h * 0.3, n = 9;
    function cloud(g) {
      g.beginPath();
      g.moveTo(cx + R, cy); g.arc(cx, cy, R, 0, TAU);
      for (var i = 0; i < n; i++) {
        var a = i / n * TAU + 0.3, r = R * (0.3 + 0.05 * (i % 3));
        g.moveTo(cx + Math.cos(a) * R * 0.92 + r, cy + Math.sin(a) * R * 0.92);
        g.arc(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92, r, 0, TAU);
      }
    }
    piece(s, cloud, '#ffffff', PAL.cloud, {
      around: true, ink: 1.1, grain: 0.5,
      inside: function (g) {
        var gr = g.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * 1.35);
        gr.addColorStop(0, 'rgba(166,214,238,0)'); gr.addColorStop(1, 'rgba(166,214,238,0.75)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    });
    piece(s, function (g) { circle(g, w * 0.6, h * 0.83, h * 0.05); }, '#ffffff', PAL.cloud, { ink: 0.9, grain: 0.4 });
    piece(s, function (g) { circle(g, w * 0.53, h * 0.945, h * 0.03); }, '#ffffff', PAL.cloud, { ink: 0.8, grain: 0.4 });
    return s;
  }

  // ------------------------------------------------------------------ cakes
  var CAKE = { round: [0.36, 0.3], heart: [0.36, 0.32], tall: [0.3, 0.4] };
  // one tier seen from the front: adds its outline to the current path
  function tierSub(g, cx, top, bot, rx, ry) {
    g.moveTo(cx - rx, top);
    g.ellipse(cx, top, rx, ry, 0, Math.PI, TAU);
    g.lineTo(cx + rx, bot);
    g.ellipse(cx, bot, rx, ry, 0, 0, Math.PI);
    g.closePath();
  }
  // The measures of a cake in a base of w x h CSS px.
  function cakeGeom(shape, w, h) {
    if (shape === 'round') return { tiers: [[w / 2, h * 0.19, h * 0.8, w * 0.43, h * 0.1]], plate: [h * 0.865, w * 0.495, h * 0.115] };
    if (shape === 'tall') {
      return {
        tiers: [[w / 2, h * 0.56, h * 0.855, w * 0.44, h * 0.07], [w / 2, h * 0.13, h * 0.56, w * 0.3, h * 0.048]],
        plate: [h * 0.9, w * 0.495, h * 0.085]
      };
    }
    return { heart: [w / 2, h * 0.03, w * 0.9, h * 0.72, h * 0.1], plate: [h * 0.7, w * 0.495, h * 0.27] };
  }
  // the cake's outline (top and sides, not the plate) in CSS px of a base w x h,
  // scaled by k: sub-paths of the same winding, so their union fills and clips solid
  function cakePath(g, shape, w, h, k) {
    var G = cakeGeom(shape, w, h), i;
    g.save(); g.scale(k, k);
    if (G.heart) {
      heartSub(g, G.heart[0], G.heart[1], G.heart[2], G.heart[3]);
      heartSub(g, G.heart[0], G.heart[1] + G.heart[4], G.heart[2], G.heart[3]);
    } else {
      for (i = 0; i < G.tiers.length; i++) tierSub(g, G.tiers[i][0], G.tiers[i][1], G.tiers[i][2], G.tiers[i][3], G.tiers[i][4]);
    }
    g.restore();
  }
  function cakeBase(shape) {
    var sz = CAKE[shape], s = paint(sz[0] * u, sz[1] * u), w = s.w, h = s.h;
    var G = cakeGeom(shape, w, h);
    // the plate: white, a blue line inside its rim
    piece(s, function (g) { ell(g, w / 2, G.plate[0], G.plate[1], G.plate[2]); }, C.plate, C.plateDeep, {
      ink: 0.9, grain: 0.5,
      over: function (g) {
        g.strokeStyle = 'rgba(98,174,214,0.7)'; g.lineWidth = lw(0.6);
        g.beginPath(); g.ellipse(w / 2, G.plate[0], G.plate[1] * 0.9, G.plate[2] * 0.82, 0, 0, TAU); g.stroke();
      }
    });
    function all(g) { g.beginPath(); cakePath(g, shape, w, h, 1); }
    piece(s, all, C.sponge, C.spongeDeep, {
      around: true, ink: 1,
      inside: function (g) {
        var i, t;
        if (G.heart) {
          var q = G.heart;
          g.fillStyle = '#eec483'; g.fillRect(0, 0, w, h);                  // the side
          g.fillStyle = C.filling;
          g.beginPath(); heartSub(g, q[0], q[1] + q[4] * 0.62, q[2], q[3]); g.fill();
          g.fillStyle = '#eec483';
          g.beginPath(); heartSub(g, q[0], q[1] + q[4] * 0.36, q[2], q[3]); g.fill();
          g.fillStyle = C.spongeTop;
          g.beginPath(); heartSub(g, q[0], q[1], q[2], q[3]); g.fill();
          light(g, w * 0.3, h * 0.25, w * 0.3, 0.45);
          return;
        }
        for (i = 0; i < G.tiers.length; i++) {
          t = G.tiers[i];
          var sd = g.createLinearGradient(t[0] - t[3], 0, t[0] + t[3], 0);
          sd.addColorStop(0, '#f1cb8c'); sd.addColorStop(0.35, C.sponge); sd.addColorStop(1, '#eec483');
          g.fillStyle = sd;
          g.beginPath(); tierSub(g, t[0], t[1], t[2], t[3], t[4]); g.fill();
          // the filling: a band of cream with a line of jam, around the middle
          var my = (t[1] + t[2]) / 2 + t[4] * 0.5, bh = Math.max(2, u * 0.016);
          g.beginPath();
          g.ellipse(t[0], my - bh / 2, t[3], t[4], 0, 0, Math.PI);
          g.ellipse(t[0], my + bh / 2, t[3], t[4], 0, Math.PI, 0, true);
          g.closePath();
          g.fillStyle = C.filling; g.fill();
          g.strokeStyle = C.jam; g.lineWidth = bh * 0.4;
          g.beginPath(); g.ellipse(t[0], my, t[3], t[4], 0, 0, Math.PI); g.stroke();
          g.fillStyle = C.spongeTop;
          g.beginPath(); g.ellipse(t[0], t[1], t[3], t[4], 0, 0, TAU); g.fill();
          light(g, t[0] - t[3] * 0.4, t[1], t[3] * 0.6, 0.4);
        }
      },
      over: function (g) {
        // thin ink lines inside: the front rims of the tops
        Art.ink(g, lw(0.6));
        g.globalAlpha = 0.75;
        if (G.heart) {
          g.beginPath(); heartSub(g, G.heart[0], G.heart[1], G.heart[2], G.heart[3]); g.stroke();
        } else {
          for (var i = 0; i < G.tiers.length; i++) {
            var t = G.tiers[i];
            g.beginPath(); g.ellipse(t[0], t[1], t[3], t[4], 0, 0, Math.PI); g.stroke();
            if (i) { g.beginPath(); g.ellipse(t[0], t[2], t[3], t[4], 0, 0, Math.PI); g.stroke(); }
          }
        }
        g.globalAlpha = 1;
      }
    });
    var out = { c: s.c, w: w, h: h };
    out.clip = function (cg) { cg.beginPath(); cakePath(cg, shape, w, h, s.c.width / w); cg.clip(); };
    return out;
  }
  // A dab of piped cream: a round rosette, a deeper edge, a pencil swirl and a
  // gloss. Piled up along a stroke the edges make a piped rope.
  function creamStamp(color) {
    var r = u * 0.032, s = paint(2 * r, 2 * r), g = s.g, col = CREAM[color];
    circle(g, r, r, r * 0.9);
    var gr = g.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r * 0.9);
    gr.addColorStop(0, col[2]); gr.addColorStop(0.45, col[0]); gr.addColorStop(1, col[0]);
    g.fillStyle = gr; g.fill();
    Art.pencil(s.c, col[1], CREAMS.indexOf(color) + 11, 0.7);
    g.strokeStyle = col[1]; g.globalAlpha = 0.55; g.lineWidth = Math.max(1, r * 0.11);
    circle(g, r, r, r * 0.86); g.stroke();
    // the swirl of the piping tip
    g.globalAlpha = 0.5; g.lineWidth = Math.max(0.8, r * 0.09);
    g.beginPath();
    for (var i = 0; i <= 20; i++) {
      var a = i / 20 * TAU * 1.25 + 0.8, rr = r * (0.12 + 0.5 * i / 20);
      if (i) g.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr); else g.moveTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr);
    }
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.ellipse(r * 0.68, r * 0.6, r * 0.2, r * 0.11, -0.6, 0, TAU); g.fill();
    return { c: s.c, r: r };
  }

  // --------------------------------------------------------------- toppings
  // Drawn straight on g (a topping sprite or a button face): each shape is
  // stroked in ink first and filled over it, so unions show no inner lines.
  function inked(g, path, fill, k) {
    Art.ink(g, lw(k) * 2);
    path(); g.stroke();
    path(); g.fillStyle = fill; g.fill();
  }
  function drawTopping(g, kind, x, y, d) {
    var i;
    if (kind === 'strawberry') {
      inked(g, function () {
        g.beginPath();
        g.moveTo(x, y + d * 0.46);
        g.bezierCurveTo(x - d * 0.52, y + d * 0.1, x - d * 0.46, y - d * 0.36, x, y - d * 0.26);
        g.bezierCurveTo(x + d * 0.46, y - d * 0.36, x + d * 0.52, y + d * 0.1, x, y + d * 0.46);
        g.closePath();
      }, '#ee4f64', 0.6);
      g.fillStyle = '#fff3a8';
      [[-0.2, -0.04], [0.02, -0.08], [0.22, -0.02], [-0.1, 0.12], [0.12, 0.14], [0, 0.29]].forEach(function (q) {
        g.beginPath(); g.ellipse(x + q[0] * d, y + q[1] * d, d * 0.03, d * 0.045, 0, 0, TAU); g.fill();
      });
      shine(g, x - d * 0.21, y - d * 0.15, d * 0.08);
      inked(g, function () {
        g.beginPath();
        for (i = 0; i < 3; i++) {
          var a = -Math.PI / 2 + (i - 1) * 0.95;
          g.moveTo(x, y - d * 0.24);
          g.ellipse(x + Math.cos(a) * d * 0.14, y - d * 0.26 + Math.sin(a) * d * 0.1, d * 0.17, d * 0.085, a, 0, TAU);
        }
      }, PAL.leaf, 0.45);
    } else if (kind === 'chocdrop') {
      // a round chocolate praline: a light drizzle across it and a clear shine
      inked(g, function () { circle(g, x, y, d * 0.42); }, '#9a623e', 0.6);
      g.save();
      circle(g, x, y, d * 0.42); g.clip();
      dot(g, x - d * 0.1, y - d * 0.12, d * 0.42, '#b47a50');
      g.strokeStyle = '#f6e3c5'; g.lineWidth = d * 0.085; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - d * 0.5, y + d * 0.02);
      for (i = 0; i < 5; i++) g.lineTo(x - d * 0.34 + i * d * 0.17, y + (i % 2 ? d * 0.2 : -d * 0.06));
      g.lineTo(x + d * 0.5, y + d * 0.2);
      g.stroke();
      g.restore();
      shine(g, x - d * 0.16, y - d * 0.22, d * 0.11);
      dot(g, x + d * 0.02, y - d * 0.29, d * 0.03, 'rgba(255,255,255,0.85)');
    } else if (kind === 'sprinkles') {
      var cols = ['#ea5f7a', '#f8c93c', '#4fb4e6', '#a56cc6', '#f39a4f', '#6cc46a', '#ea5f7a'];
      var rods = [[-0.26, -0.2, 0.5], [0.2, -0.26, 2.2], [0.02, 0.0, 1.2], [-0.27, 0.2, 2.6], [0.28, 0.14, 0.2], [0.0, 0.33, 1.7], [-0.02, -0.34, 0.1]];
      for (i = 0; i < rods.length; i++) {
        var q = rods[i], dx = Math.cos(q[2]) * d * 0.11, dy = Math.sin(q[2]) * d * 0.11;
        g.beginPath(); g.moveTo(x + q[0] * d - dx, y + q[1] * d - dy); g.lineTo(x + q[0] * d + dx, y + q[1] * d + dy);
        Art.ink(g, d * 0.13 + lw(0.4) * 2); g.stroke();
        g.strokeStyle = cols[i]; g.lineWidth = d * 0.13; g.stroke();
      }
    } else if (kind === 'flower') {
      inked(g, function () {
        g.beginPath();
        for (i = 0; i < 5; i++) {
          var b = i * TAU / 5 - Math.PI / 2, px = x + Math.cos(b) * d * 0.25, py = y + Math.sin(b) * d * 0.25;
          g.moveTo(px + d * 0.2, py); g.arc(px, py, d * 0.2, 0, TAU);
        }
      }, '#ffd3e6', 0.5);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (i = 0; i < 5; i++) {
        var c = i * TAU / 5 - Math.PI / 2;
        g.beginPath(); g.arc(x + Math.cos(c) * d * 0.29, y + Math.sin(c) * d * 0.29, d * 0.09, 0, TAU); g.fill();
      }
      inked(g, function () { circle(g, x, y, d * 0.14); }, '#f8c93c', 0.4);
    } else if (kind === 'star') {
      inked(g, function () { starPath(g, x, y + d * 0.02, d * 0.46, 0); }, '#f8d648', 0.6);
      g.save(); g.lineJoin = 'round';
      starPath(g, x, y + d * 0.02, d * 0.3, 0); g.fillStyle = '#fbe98c'; g.fill();
      g.restore();
      shine(g, x - d * 0.1, y - d * 0.1, d * 0.07);
    } else if (kind === 'candle') {
      spot(g, x, y - d * 0.42, d * 0.4, '255,214,110', 0.85);
      function body() { rrect(g, x - d * 0.13, y - d * 0.22, d * 0.26, d * 0.72, d * 0.06); }
      inked(g, body, '#ffffff', 0.5);
      g.save(); body(); g.clip();
      g.strokeStyle = '#ee7fa9'; g.lineWidth = d * 0.09;
      for (i = -1; i < 5; i++) { g.beginPath(); g.moveTo(x - d * 0.2, y - d * 0.18 + i * d * 0.2); g.lineTo(x + d * 0.2, y - d * 0.3 + i * d * 0.2); g.stroke(); }
      g.restore();
      inked(g, function () {
        g.beginPath();
        g.moveTo(x, y - d * 0.66);
        g.bezierCurveTo(x + d * 0.2, y - d * 0.46, x + d * 0.12, y - d * 0.27, x, y - d * 0.27);
        g.bezierCurveTo(x - d * 0.12, y - d * 0.27, x - d * 0.2, y - d * 0.46, x, y - d * 0.66);
        g.closePath();
      }, '#f9a13c', 0.45);
      g.beginPath(); g.ellipse(x, y - d * 0.38, d * 0.05, d * 0.08, 0, 0, TAU); g.fillStyle = '#fff3a8'; g.fill();
    }
  }
  function topping(kind) {
    var d = u * 0.07, s = paint(d * 1.3, d * 1.4);
    drawTopping(s.g, kind, s.w / 2, s.h / 2 + (kind === 'candle' ? d * 0.06 : 0), d);
    return s;
  }

  // ------------------------------------------------------------------ icons
  // A cream button: a bowl of whipped cream in that color. The chocolate one is
  // milk-chocolate brown with a rolled wafer stuck in it.
  function drawCreamPot(g, r, color) {
    var col = CREAM[color];
    if (color === 'choc') {
      g.save();
      g.translate(r * 1.3, r * 0.72); g.rotate(0.5);
      inked(g, function () { rrect(g, -r * 0.09, -r * 0.6, r * 0.18, r * 0.9, r * 0.06); }, '#f3cf8e', 0.6);
      g.strokeStyle = '#c98a4a'; g.lineWidth = r * 0.035;
      for (var i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-r * 0.08, -r * 0.5 + i * r * 0.15); g.lineTo(r * 0.08, -r * 0.42 + i * r * 0.15); g.stroke(); }
      g.restore();
    }
    // the cream: a wide soft mound with one little curl
    inked(g, function () {
      g.beginPath();
      g.moveTo(r * 0.46, r * 1.12);
      g.bezierCurveTo(r * 0.28, r * 0.8, r * 0.6, r * 0.62, r * 0.74, r * 0.72);
      g.bezierCurveTo(r * 0.7, r * 0.4, r * 1.12, r * 0.3, r * 1.2, r * 0.52);
      g.bezierCurveTo(r * 1.26, r * 0.42, r * 1.2, r * 0.36, r * 1.12, r * 0.37);
      g.bezierCurveTo(r * 1.34, r * 0.3, r * 1.42, r * 0.56, r * 1.28, r * 0.7);
      g.bezierCurveTo(r * 1.5, r * 0.62, r * 1.72, r * 0.84, r * 1.54, r * 1.12);
      g.closePath();
    }, col[0], 0.8);
    g.strokeStyle = col[1]; g.lineWidth = r * 0.05; g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(r * 0.74, r * 0.72); g.quadraticCurveTo(r * 0.86, r * 0.84, r * 1.0, r * 0.82); g.stroke();
    g.beginPath(); g.moveTo(r * 1.28, r * 0.7); g.quadraticCurveTo(r * 1.2, r * 0.86, r * 1.1, r * 0.9); g.stroke();
    g.globalAlpha = 1;
    shine(g, r * 0.86, r * 0.55, r * 0.09);
    shine(g, r * 0.6, r * 0.85, r * 0.06);
    // the bowl
    function bowl() {
      g.beginPath();
      g.moveTo(r * 0.36, r * 1.06);
      g.lineTo(r * 1.64, r * 1.06);
      g.bezierCurveTo(r * 1.62, r * 1.5, r * 1.36, r * 1.66, r, r * 1.66);
      g.bezierCurveTo(r * 0.64, r * 1.66, r * 0.38, r * 1.5, r * 0.36, r * 1.06);
      g.closePath();
    }
    inked(g, bowl, '#fdfcf8', 0.8);
    g.save(); bowl(); g.clip();
    g.fillStyle = col[0]; g.fillRect(0, r * 1.22, 2 * r, r * 0.14);
    g.fillStyle = 'rgba(98,120,160,0.16)'; g.fillRect(r * 1.3, r, r, r);
    g.restore();
  }
  function icon(id) {
    var r = u * 0.1, s = paint(2 * r, 2 * r), g = s.g, p = id.split(':');
    piece(s, function (g) { circle(g, r, r, r * 0.94); }, C.button, '#e8cfa8', {
      ink: 1.1, grain: 0.35,
      inside: function (g) { spot(g, r * 1.3, r * 1.5, r * 1.1, '246,207,211', 0.5); }
    });
    if (p[0] === 'shape') {
      var b = S.cake[p[1]], k = (r * 1.3) / Math.max(b.w, b.h);
      g.drawImage(b.c, r - b.w * k / 2, r - b.h * k / 2, b.w * k, b.h * k);
    } else if (p[0] === 'cream') {
      drawCreamPot(g, r, p[1]);
    } else if (p[0] === 'top') {
      drawTopping(g, p[1], r, r + (p[1] === 'candle' ? r * 0.1 : 0), r * 1.1);
    } else if (id === 'bell') {
      var bs = S.sprite.bell, kb = (r * 1.5) / bs.h;
      g.drawImage(bs.c, r - bs.w * kb / 2, r * 0.96 - bs.h * kb / 2, bs.w * kb, bs.h * kb);
    }
    return { c: s.c, r: r };
  }

  // ------------------------------------------------------------------ build
  function build(size, ratio) {
    u = size; dpr = ratio; seed = 1;
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
