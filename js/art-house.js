/* art-house.js - the painted pieces of the house (inside the orange house with the
 * red roof on the street), in the style of the bedroom-wall mural. Classic script:
 * window.House. Needs window.Art (js/art.js) loaded first.
 *
 * PLACEHOLDER drawings: simple round shapes with the ink line and the pencil grain,
 * until the designer paints them. The API, the sizes and the anchors below are what
 * js/scenes/house.js lays the room out with; a repaint keeps them.
 *
 * Sizes: `u` is the scene's size unit in CSS px, u = min(M, 0.9 H). Everything is
 * pre-rendered into canvases at DPR in build() (the room when first asked for a
 * size); the scene only blits them per frame: no shadowBlur, no filters, no grain
 * per frame. Every {c, w, h} below is a canvas c of (w x h CSS px) x DPR.
 *
 *   House.SPOTS = ['sofa', 'curtain', 'basket', 'wardrobe', 'plant', 'table',
 *                  'armchair', 'toybox']       the hiding places
 *   House.build(u, DPR)         (re)builds every sprite for this size. The scene calls
 *                               it from its resize().
 *   House.floorY(W, H) -> y     where the back wall meets the floor, in CSS px: 0.5 H on
 *                               a wide screen (W / H > 1.5, one row of spots), else 0.4 H.
 *                               room() paints it there; the scene stands the furniture
 *                               on the floor below it.
 *   House.room(W, H) -> canvas  the full-screen room (W x H CSS px at DPR): a warm
 *                               cream-orange wall with a round window and a yellow arched
 *                               door on the left (Bella comes in there), a wooden floor
 *                               and a rug. Cached per size.
 *   House.spot(kind) -> {back: {c, w, h}, front: {c, w, h}, hide: {x, y, h}}
 *                               back and front are ANCHORED AT BOTTOM CENTER (draw them
 *                               with g.drawImage(c, x - w / 2, y - h, w, h)) and are the
 *                               same size. The scene draws back, then a hiding friend,
 *                               then front.
 *                               hide: where a hiding friend's bottom center sits (x, y in
 *                               CSS px from the spot's bottom center, y < 0 is up) and its
 *                               height h. At hide, front covers the friend fully. A
 *                               peeking friend is raised by 0.35 h: its ears or tail show
 *                               above or beside front.
 *                               Sizes (u): sofa 0.28 x 0.22, curtain 0.22 x 0.5, basket
 *                               0.22 x 0.2, wardrobe 0.22 x 0.44, plant 0.2 x 0.4, table
 *                               0.28 x 0.22, armchair 0.24 x 0.26, toybox 0.24 x 0.28;
 *                               hide.h about 0.14..0.19 u.
 */
(function () {
  'use strict';

  var Art = window.Art, PAL = Art.PAL;
  var TAU = Math.PI * 2;

  var SPOTS = ['sofa', 'curtain', 'basket', 'wardrobe', 'plant', 'table', 'armchair', 'toybox'];
  var C = {
    wall: '#fbdcb4', wallDeep: '#efb47a', wallLight: '#fff0dc',
    floor: '#dba06f', floorDeep: '#a9693f', floorLine: 'rgba(120,64,30,0.35)',
    rug: '#ea8493', rugDeep: '#c9566f', rugLight: '#f9c4cc',
    glass: '#bfe3f2', glassDeep: '#7fc0de', frame: '#a9734c', frameDeep: '#6b4335',
    door: '#f6dc6e', doorDeep: '#d9a92c',
    plum: '#b86aa8', plumDeep: '#7d3f78', plumLight: '#e0a6d4',
    blue: '#7fb6e6', blueDeep: '#3f7fc0', blueLight: '#c4e0f6',
    wood: '#c98a55', woodDeep: '#8a5532', woodLight: '#e8b98a',
    wicker: '#e0b26c', wickerDeep: '#a8743a',
    leaf: PAL.leaf, leafDeep: PAL.leafDeep, pot: '#e3734e', potDeep: '#a9472c',
    cloth: '#fff3e0', clothDeep: '#e0b98a', dot: '#ea8493',
    red: '#e05b5b', redDeep: '#a83434', yellow: '#f8dd6c', shadow: 'rgba(120,64,30,0.18)'
  };
  // [w, h] in u, and hide [x, y, h] in u (y < 0 is up)
  var SIZE = {
    sofa: [0.28, 0.22, [0, 0, 0.18]],
    curtain: [0.22, 0.5, [0, 0, 0.18]],
    basket: [0.22, 0.2, [0, -0.004, 0.14]],
    wardrobe: [0.22, 0.44, [0, -0.02, 0.17]],
    plant: [0.2, 0.4, [0, 0, 0.17]],
    table: [0.28, 0.22, [0, 0, 0.18]],
    armchair: [0.24, 0.26, [0, 0, 0.19]],
    toybox: [0.24, 0.28, [0, 0, 0.155]]
  };

  var u = 100, dpr = 1, S = null, seed = 1;
  var roomKey = '', roomC = null;

  // ---------------------------------------------------------------- helpers
  function lw(k) { return Math.max(1, u * 0.008 * (k || 1)); }
  // A sprite w x h (in u) with its context in u units, origin at the bottom center.
  function sheet(wU, hU) {
    var w = wU * u, h = hU * u, c = Art.makeCanvas(w * dpr, h * dpr);
    c.lw = w; c.lh = h;
    var g = c.getContext('2d');
    g.scale(c.width / w, c.height / h);
    g.translate(w / 2, h);
    g.scale(u, u);
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { c: c, g: g, w: w, h: h };
  }
  // One painted piece on its own layer: fill, grain, ink. path(g) begins its own path.
  function piece(s, path, fill, deep, o) {
    o = o || {};
    var c = Art.makeCanvas(s.c.width, s.c.height);
    c.lw = s.w; c.lh = s.h;
    var g = c.getContext('2d');
    g.setTransform(s.g.getTransform());
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(g); g.fillStyle = fill; g.fill();
    if (o.over) { g.save(); path(g); g.clip(); o.over(g); g.restore(); }
    if (deep) Art.pencil(c, deep, seed++, o.grain === undefined ? 0.7 : o.grain);
    if (o.ink !== 0) { path(g); Art.ink(g, lw(o.ink || 1) / u); g.stroke(); }
    s.g.save(); s.g.setTransform(1, 0, 0, 1, 0, 0); s.g.drawImage(c, 0, 0); s.g.restore();
  }
  function ell(x, y, rx, ry) { return function (g) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }; }
  function rr(x, y, w, h, r) {
    return function (g) {
      var q = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + q, y);
      g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q);
      g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q);
      g.closePath();
    };
  }
  function shadow(s, w) {
    var g = s.g;
    g.fillStyle = C.shadow;
    g.beginPath(); g.ellipse(0, -0.008, w, 0.016, 0, 0, TAU); g.fill();
  }
  function dots(g, pts, r, col) {
    g.fillStyle = col;
    for (var i = 0; i < pts.length; i++) { g.beginPath(); g.arc(pts[i][0], pts[i][1], r, 0, TAU); g.fill(); }
  }

  // ----------------------------------------------------------- the spots
  // Each painter gets (back, front) sheets in u units, origin at the bottom center.
  var PAINT = {
    sofa: function (b, f) {
      shadow(b, 0.13);
      piece(f, rr(-0.12, -0.2, 0.24, 0.13, 0.05), C.plum, C.plumDeep);          // backrest
      piece(f, rr(-0.12, -0.11, 0.24, 0.09, 0.03), C.plum, C.plumDeep);         // seat
      piece(f, rr(-0.1, -0.135, 0.095, 0.05, 0.025), C.plumLight, C.plum);      // cushions
      piece(f, rr(0.005, -0.135, 0.095, 0.05, 0.025), C.plumLight, C.plum);
      piece(f, rr(-0.138, -0.14, 0.05, 0.13, 0.025), C.plum, C.plumDeep);       // arms
      piece(f, rr(0.088, -0.14, 0.05, 0.13, 0.025), C.plum, C.plumDeep);
      piece(f, rr(-0.11, -0.016, 0.03, 0.016, 0.006), C.woodDeep, null);        // feet
      piece(f, rr(0.08, -0.016, 0.03, 0.016, 0.006), C.woodDeep, null);
    },
    curtain: function (b, f) {
      // the rod and the long curtains (behind); the gathered bottom of the drape (front)
      piece(b, rr(-0.105, -0.49, 0.21, 0.014, 0.007), C.wood, C.woodDeep);
      piece(b, function (g) {
        g.beginPath(); g.moveTo(-0.1, -0.476); g.lineTo(-0.02, -0.476);
        g.quadraticCurveTo(-0.03, -0.25, -0.07, -0.12); g.lineTo(-0.1, -0.12); g.closePath();
      }, C.blue, C.blueDeep);
      piece(b, function (g) {
        g.beginPath(); g.moveTo(0.1, -0.476); g.lineTo(0.02, -0.476);
        g.quadraticCurveTo(0.03, -0.25, 0.07, -0.12); g.lineTo(0.1, -0.12); g.closePath();
      }, C.blue, C.blueDeep);
      piece(f, function (g) {
        g.beginPath(); g.moveTo(-0.105, 0);
        g.quadraticCurveTo(-0.11, -0.12, -0.075, -0.2); g.quadraticCurveTo(0, -0.215, 0.075, -0.2);
        g.quadraticCurveTo(0.11, -0.12, 0.105, 0); g.closePath();
      }, C.blue, C.blueDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(63,127,192,0.6)'; g.lineWidth = 0.006;
          g.beginPath();
          for (var i = -2; i <= 2; i++) { g.moveTo(i * 0.035, -0.19); g.quadraticCurveTo(i * 0.042, -0.1, i * 0.04, 0); }
          g.stroke();
        }
      });
      piece(f, rr(-0.1, -0.205, 0.2, 0.022, 0.011), C.yellow, C.doorDeep);     // the tie
    },
    basket: function (b, f) {
      shadow(b, 0.1);
      piece(b, function (g) {                                                    // the handle
        g.beginPath(); g.arc(0, -0.13, 0.085, Math.PI, 0); g.arc(0, -0.13, 0.07, 0, Math.PI, true); g.closePath();
      }, C.wicker, C.wickerDeep);
      piece(f, function (g) {
        g.beginPath(); g.moveTo(-0.1, -0.15); g.lineTo(0.1, -0.15);
        g.quadraticCurveTo(0.098, -0.02, 0.07, 0); g.lineTo(-0.07, 0);
        g.quadraticCurveTo(-0.098, -0.02, -0.1, -0.15); g.closePath();
      }, C.wicker, C.wickerDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(168,116,58,0.7)'; g.lineWidth = 0.005;
          g.beginPath();
          for (var i = 0; i < 4; i++) { g.moveTo(-0.11, -0.12 + i * 0.033); g.lineTo(0.11, -0.12 + i * 0.033); }
          g.stroke();
        }
      });
      piece(f, function (g) {                                                    // the blanket over the rim
        g.beginPath(); g.moveTo(-0.108, -0.145);
        g.quadraticCurveTo(-0.05, -0.172, 0, -0.152); g.quadraticCurveTo(0.05, -0.172, 0.108, -0.145);
        g.quadraticCurveTo(0.06, -0.1, 0.03, -0.13); g.quadraticCurveTo(-0.02, -0.1, -0.06, -0.125);
        g.quadraticCurveTo(-0.09, -0.11, -0.108, -0.145); g.closePath();
      }, C.rugLight, C.rug);
    },
    wardrobe: function (b, f) {
      shadow(b, 0.11);
      piece(b, rr(-0.1, -0.43, 0.2, 0.42, 0.03), C.wood, C.woodDeep);           // the body
      piece(b, rr(-0.08, -0.4, 0.16, 0.2, 0.02), '#5a3a2a', null);              // dark inside, door open
      piece(b, rr(0.08, -0.41, 0.03, 0.22, 0.012), C.woodLight, C.wood);        // the open door's edge
      piece(f, rr(-0.1, -0.2, 0.2, 0.19, 0.02), C.wood, C.woodDeep, {           // the drawer below
        over: function (g) { dots(g, [[-0.04, -0.105], [0.04, -0.105]], 0.009, C.yellow); }
      });
      piece(f, rr(-0.095, -0.012, 0.03, 0.012, 0.005), C.woodDeep, null);
      piece(f, rr(0.065, -0.012, 0.03, 0.012, 0.005), C.woodDeep, null);
    },
    plant: function (b, f) {
      shadow(b, 0.08);
      var leaves = [[-0.05, -0.29, -0.5], [0.05, -0.3, 0.5], [0, -0.325, 0], [-0.07, -0.23, -0.9], [0.07, -0.23, 0.9]];
      leaves.forEach(function (q) {
        piece(b, function (g) {
          g.save(); g.translate(q[0], q[1]); g.rotate(q[2]);
          g.beginPath(); g.ellipse(0, 0, 0.03, 0.07, 0, 0, TAU);
          g.restore();
        }, C.leaf, C.leafDeep);
      });
      piece(f, function (g) {                                                    // the low leaf clump
        g.beginPath(); g.moveTo(-0.095, -0.1);
        g.quadraticCurveTo(-0.11, -0.19, -0.05, -0.2); g.quadraticCurveTo(0, -0.225, 0.05, -0.2);
        g.quadraticCurveTo(0.11, -0.19, 0.095, -0.1); g.closePath();
      }, C.leaf, C.leafDeep);
      piece(f, function (g) {                                                    // the pot
        g.beginPath(); g.moveTo(-0.085, -0.12); g.lineTo(0.085, -0.12);
        g.lineTo(0.065, 0); g.lineTo(-0.065, 0); g.closePath();
      }, C.pot, C.potDeep, { over: function (g) { dots(g, [[-0.035, -0.06], [0, -0.075], [0.035, -0.06]], 0.008, C.cloth); } });
      piece(f, rr(-0.095, -0.13, 0.19, 0.03, 0.012), C.pot, C.potDeep);
    },
    table: function (b, f) {
      shadow(b, 0.14);
      piece(b, rr(-0.01, -0.27, 0.02, 0.06, 0.008), C.glass, C.glassDeep);       // a little vase on top
      piece(b, ell(0, -0.27, 0.025, 0.02), C.red, C.redDeep);
      piece(f, function (g) {                                                    // the long cloth
        g.beginPath(); g.moveTo(-0.13, -0.205);
        g.quadraticCurveTo(0, -0.225, 0.13, -0.205);
        g.quadraticCurveTo(0.14, -0.1, 0.13, 0); g.lineTo(-0.13, 0);
        g.quadraticCurveTo(-0.14, -0.1, -0.13, -0.205); g.closePath();
      }, C.cloth, C.clothDeep, {
        over: function (g) {
          var pts = [];
          for (var i = 0; i < 6; i++) for (var j = 0; j < 4; j++) pts.push([-0.105 + i * 0.042 + (j % 2) * 0.021, -0.17 + j * 0.045]);
          dots(g, pts, 0.008, C.dot);
        }
      });
    },
    armchair: function (b, f) {
      shadow(b, 0.12);
      piece(f, rr(-0.09, -0.215, 0.18, 0.15, 0.06), C.red, C.redDeep);         // backrest
      piece(f, rr(-0.1, -0.105, 0.2, 0.09, 0.03), C.red, C.redDeep);            // seat
      piece(f, rr(-0.118, -0.14, 0.05, 0.125, 0.025), C.red, C.redDeep);       // arms
      piece(f, rr(0.068, -0.14, 0.05, 0.125, 0.025), C.red, C.redDeep);
      piece(f, ell(0, -0.16, 0.035, 0.03), C.yellow, C.doorDeep);               // a round cushion
      piece(f, rr(-0.09, -0.016, 0.025, 0.016, 0.006), C.woodDeep, null);
      piece(f, rr(0.065, -0.016, 0.025, 0.016, 0.006), C.woodDeep, null);
    },
    toybox: function (b, f) {
      shadow(b, 0.12);
      piece(b, function (g) {                                                    // the lid, open, behind
        g.beginPath(); g.moveTo(-0.11, -0.16); g.lineTo(-0.105, -0.27);
        g.quadraticCurveTo(0, -0.285, 0.105, -0.27); g.lineTo(0.11, -0.16); g.closePath();
      }, C.blueLight, C.blueDeep);
      piece(f, rr(-0.11, -0.168, 0.22, 0.166, 0.025), C.blue, C.blueDeep, {      // the box
        over: function (g) {
          g.fillStyle = C.yellow;
          g.beginPath(); g.arc(-0.05, -0.085, 0.022, 0, TAU); g.fill();
          g.fillStyle = C.rugLight;
          g.beginPath(); g.arc(0.05, -0.085, 0.022, 0, TAU); g.fill();
        }
      });
      piece(f, ell(-0.03, -0.172, 0.022, 0.016), C.red, C.redDeep);             // a ball on the rim
    }
  };

  function buildSpot(kind) {
    var z = SIZE[kind];
    var back = sheet(z[0], z[1]), front = sheet(z[0], z[1]);
    PAINT[kind](back, front);
    return {
      back: { c: back.c, w: back.w, h: back.h },
      front: { c: front.c, w: front.w, h: front.h },
      hide: { x: z[2][0] * u, y: z[2][1] * u, h: z[2][2] * u }
    };
  }

  // ------------------------------------------------------------------ room
  function floorY(W, H) { return (W / H > 1.5 ? 0.5 : 0.4) * H; }

  function room(W, H) {
    var key = W + 'x' + H + 'x' + u + 'x' + dpr;
    if (roomC && roomKey === key) return roomC;
    var c = Art.makeCanvas(W * dpr, H * dpr);
    c.lw = W; c.lh = H;
    var g = c.getContext('2d');
    g.scale(c.width / W, c.height / H);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var fy = floorY(W, H), i;
    // the wall: warm cream-orange, lighter in the middle
    var gr = g.createLinearGradient(0, 0, 0, fy);
    gr.addColorStop(0, C.wallDeep); gr.addColorStop(0.5, C.wall); gr.addColorStop(1, '#f8cf9e');
    g.fillStyle = gr; g.fillRect(0, 0, W, fy);
    var lg = g.createRadialGradient(W * 0.55, fy * 0.5, 0, W * 0.55, fy * 0.5, Math.max(W, fy) * 0.6);
    lg.addColorStop(0, 'rgba(255,240,220,0.55)'); lg.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, fy);
    // a few loose brick lines, as on the house outside
    g.strokeStyle = 'rgba(201,106,42,0.22)'; g.lineWidth = lw(0.8);
    var rand = Art.rng(9), row = u * 0.05;
    g.beginPath();
    for (var y = row; y < fy - row * 0.5; y += row) {
      var x = rand() * u * 0.1;
      while (x < W) { var l = u * (0.05 + rand() * 0.08); if (rand() < 0.5) { g.moveTo(x, y); g.lineTo(x + l, y); } x += l + u * (0.04 + rand() * 0.08); }
    }
    g.stroke();
    // the floor: wooden planks
    g.fillStyle = C.floor; g.fillRect(0, fy, W, H - fy);
    var fl = g.createLinearGradient(0, fy, 0, H);
    fl.addColorStop(0, 'rgba(120,64,30,0.25)'); fl.addColorStop(0.3, 'rgba(120,64,30,0)');
    g.fillStyle = fl; g.fillRect(0, fy, W, H - fy);
    g.strokeStyle = C.floorLine; g.lineWidth = lw(0.9);
    g.beginPath();
    var ph = u * 0.06;
    for (y = fy + ph; y < H; y += ph * (1 + (y - fy) / H)) { g.moveTo(0, y); g.lineTo(W, y); }
    for (i = 0; i < 40; i++) { var px = rand() * W, py = fy + rand() * (H - fy); g.moveTo(px, py); g.lineTo(px, py + ph * 0.8); }
    g.stroke();
    // the skirting board
    g.fillStyle = C.woodLight; g.fillRect(0, fy - u * 0.022, W, u * 0.022);
    Art.ink(g, lw(1.1));
    g.beginPath(); g.moveTo(0, fy - u * 0.022); g.lineTo(W, fy - u * 0.022); g.moveTo(0, fy); g.lineTo(W, fy); g.stroke();
    // the rug
    var rx = W * 0.56, ry = fy + (H - fy) * 0.55, rw = Math.min(W * 0.36, u * 0.6), rh = (H - fy) * 0.16;
    g.beginPath(); g.ellipse(rx, ry, rw, rh, 0, 0, TAU);
    g.fillStyle = C.rug; g.fill();
    g.beginPath(); g.ellipse(rx, ry, rw * 0.8, rh * 0.72, 0, 0, TAU);
    g.fillStyle = C.rugLight; g.fill();
    Art.ink(g, lw(1)); g.beginPath(); g.ellipse(rx, ry, rw, rh, 0, 0, TAU); g.stroke();
    // the round window (the house's round window, from inside)
    var wr = Math.min(u * 0.13, fy * 0.22), wx = W * 0.6, wy = Math.max(wr + u * 0.16, fy * 0.42);
    g.beginPath(); g.arc(wx, wy, wr * 1.18, 0, TAU); g.fillStyle = C.frame; g.fill();
    Art.ink(g, lw(1.2)); g.stroke();
    var sky = g.createLinearGradient(0, wy - wr, 0, wy + wr);
    sky.addColorStop(0, '#9fd3ef'); sky.addColorStop(1, '#dff1f9');
    g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.fillStyle = sky; g.fill();
    g.fillStyle = '#fffbff';
    g.beginPath(); g.ellipse(wx - wr * 0.3, wy + wr * 0.2, wr * 0.35, wr * 0.16, 0, 0, TAU); g.fill();
    Art.ink(g, lw(1));
    g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.moveTo(wx - wr, wy); g.lineTo(wx + wr, wy); g.moveTo(wx, wy - wr); g.lineTo(wx, wy + wr); g.stroke();
    // the yellow arched door on the left
    var dw = u * 0.17, dh = Math.min(u * 0.3, fy * 0.62), dx = Math.max(W * 0.1, u * 0.13);
    g.beginPath();
    g.moveTo(dx - dw / 2, fy); g.lineTo(dx - dw / 2, fy - dh + dw / 2);
    g.arc(dx, fy - dh + dw / 2, dw / 2, Math.PI, 0); g.lineTo(dx + dw / 2, fy); g.closePath();
    g.fillStyle = C.door; g.fill();
    Art.ink(g, lw(1.2)); g.stroke();
    g.beginPath(); g.moveTo(dx, fy - dh + dw * 0.2); g.lineTo(dx, fy); g.lineWidth = lw(0.8); g.stroke();
    g.fillStyle = PAL.ink;
    g.beginPath(); g.arc(dx + dw * 0.3, fy - dh * 0.42, lw(1.6), 0, TAU); g.fill();
    Art.pencil(c, '#c98a55', 41, 0.35);
    roomC = c; roomKey = key;
    return c;
  }

  // ------------------------------------------------------------------ build
  function build(size, ratio) {
    u = size; dpr = ratio; seed = 1;
    S = {};
    SPOTS.forEach(function (k) { S[k] = buildSpot(k); });
    roomKey = '';
  }
  function need() { if (!S) build(u, Math.min(2, window.devicePixelRatio || 1)); return S; }

  window.House = {
    SPOTS: SPOTS,
    build: build,
    floorY: floorY,
    room: function (W, H) { need(); return room(W, H); },
    spot: function (kind) { return need()[kind]; }
  };
})();
