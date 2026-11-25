/* art-house.js - the painted pieces of the house (inside the orange house with the
 * red roof on the street), in the style of the bedroom-wall mural. Classic script:
 * window.House. Needs window.Art (js/art.js) loaded first.
 *
 * Round shapes with the ink line and the pencil grain. The API, the sizes and the anchors below are what
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
 *   House.room(W, H) -> canvas  the full-screen room (W x H CSS px at DPR): a warm orange
 *                               wall with loose brick lines, a dotted band and a round
 *                               window (above the low furniture: at 0.6 W, or 0.37 W on a
 *                               wide screen), a wooden floor, a round rug, and the yellow
 *                               arched door at floor level on the left, with a mat, where
 *                               Bella stands. Cached per size.
 *   House.door(W, H) -> {x, y, w, h, heroX, heroH, frontY}
 *                               the painted door (x, y its bottom center) and where Bella
 *                               stands in front of it. heroX, heroH and frontY repeat the
 *                               numbers of layout() in js/scenes/house.js: change both
 *                               together.
 *   House.spot(kind) -> {back: {c, w, h}, front: {c, w, h}, hide: {x, y, h}}
 *                               back and front are ANCHORED AT BOTTOM CENTER (draw them
 *                               with g.drawImage(c, x - w / 2, y - h, w, h)) and are the
 *                               same size. The scene draws back, then a hiding friend,
 *                               then front.
 *                               hide: where a hiding friend's bottom center sits (x, y in
 *                               CSS px from the spot's bottom center, y < 0 is up) and its
 *                               height h. At hide, front covers the friend fully: its top
 *                               edge is only about 0.01 u above the friend. A peeking
 *                               friend is raised by 0.6 h: its ears and eyes show above
 *                               front (beside the tall drape and in front of the window,
 *                               for the curtain; in the open half of the wardrobe; in
 *                               front of the tall leaves and of the toy box's lid).
 *                               tests/render.test.js ('house sheet') measures both for
 *                               the five friends.
 *                               Sizes (u): sofa 0.28 x 0.22, curtain 0.22 x 0.5, basket
 *                               0.22 x 0.2, wardrobe 0.22 x 0.44, plant 0.2 x 0.4, table
 *                               0.28 x 0.22, armchair 0.24 x 0.26, toybox 0.24 x 0.28;
 *                               hide.h about 0.15..0.19 u.
 */
(function () {
  'use strict';

  var Art = window.Art, PAL = Art.PAL;
  var TAU = Math.PI * 2;

  var SPOTS = ['sofa', 'curtain', 'basket', 'wardrobe', 'plant', 'table', 'armchair', 'toybox'];
  var C = {
    wall: '#f8c896', wallDeep: '#eda868', wallLight: '#fff0dc', band: '#f0a868',
    floor: '#dba06f', floorDeep: '#a9693f', floorLine: 'rgba(120,64,30,0.4)',
    rug: '#ea8493', rugDeep: '#c9566f', rugLight: '#f9c4cc',
    glass: '#bfe3f2', glassDeep: '#7fc0de', frame: '#a9734c', frameDeep: '#6b4335',
    door: '#f6dc6e', doorDeep: '#d9a92c',
    plum: '#b86aa8', plumDeep: '#7d3f78', plumLight: '#e0a6d4',
    blue: '#7fb6e6', blueDeep: '#3f7fc0', blueLight: '#c4e0f6',
    wood: '#c98a55', woodDeep: '#8a5532', woodLight: '#e8b98a', inside: '#5a3a2a',
    wicker: '#e0b26c', wickerDeep: '#a8743a', wickerLight: '#f0cf96',
    leaf: PAL.leaf, leafDeep: PAL.leafDeep, leafMid: '#6cbb6c', pot: '#e3734e', potDeep: '#a9472c',
    cloth: '#fff3e0', clothDeep: '#e0b98a', clothLight: '#fffaf0', dot: '#ea8493',
    red: '#e05b5b', redDeep: '#a83434', redLight: '#f08c84', yellow: '#f8dd6c', shadow: 'rgba(120,64,30,0.18)'
  };
  // [w, h] in u, and hide [x, y, h] in u (y < 0 is up)
  var SIZE = {
    sofa: [0.28, 0.22, [0, -0.012, 0.185]],
    curtain: [0.22, 0.5, [0.022, -0.006, 0.158]],
    basket: [0.22, 0.2, [0, -0.006, 0.148]],
    wardrobe: [0.22, 0.44, [0.022, -0.02, 0.17]],
    plant: [0.2, 0.4, [0, -0.012, 0.165]],
    table: [0.28, 0.22, [0, -0.024, 0.165]],
    armchair: [0.24, 0.26, [0, -0.012, 0.19]],
    toybox: [0.24, 0.28, [0, -0.008, 0.155]]
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

  // A closed, smooth blob through the midpoints of pts.
  function sm(pts) {
    return function (g) {
      var n = pts.length, a = pts[n - 1], b = pts[0];
      g.beginPath(); g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      for (var i = 0; i < n; i++) {
        a = pts[i]; b = pts[(i + 1) % n];
        g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      g.closePath();
    };
  }
  function leaf(x, y, rx, ry, rot) {
    return function (g) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
  }
  function heart(x, y, s) {
    return function (g) {
      g.beginPath(); g.moveTo(x, y + s * 0.4);
      g.bezierCurveTo(x - s * 1.0, y - s * 0.2, x - s * 0.5, y - s * 0.85, x, y - s * 0.3);
      g.bezierCurveTo(x + s * 0.5, y - s * 0.85, x + s * 1.0, y - s * 0.2, x, y + s * 0.4);
      g.closePath();
    };
  }
  // A thin detail line on a sheet (or any context in u units): fn(g) adds to the path.
  function det(g, fn, k, col) {
    g.beginPath(); fn(g);
    Art.ink(g, lw(k || 0.7) / u);
    if (col) g.strokeStyle = col;
    g.stroke();
  }
  // A row of n dots from (x0, y0) to (x1, y1).
  function row(g, x0, y0, x1, y1, n, r, col) {
    var pts = [];
    for (var i = 0; i < n; i++) { var q = n > 1 ? i / (n - 1) : 0.5; pts.push([x0 + (x1 - x0) * q, y0 + (y1 - y0) * q]); }
    dots(g, pts, r, col);
  }

  // ----------------------------------------------------------- the spots
  // Each painter gets (back, front) sheets in u units, origin at the bottom center.
  // A front's top edge is a little above hide.h over the friend, so the friend is
  // covered at hide and its ears and eyes come out at peek.
  var PAINT = {
    sofa: function (b, f) {
      shadow(b, 0.13);
      piece(f, ell(-0.1, -0.01, 0.016, 0.01), C.woodDeep, null);                 // round feet
      piece(f, ell(0.1, -0.01, 0.016, 0.01), C.woodDeep, null);
      piece(f, function (g) {                                                    // the plump backrest, two humps
        g.beginPath(); g.moveTo(-0.118, -0.07);
        g.bezierCurveTo(-0.13, -0.2, -0.03, -0.22, 0, -0.2);
        g.bezierCurveTo(0.03, -0.22, 0.13, -0.2, 0.118, -0.07);
        g.closePath();
      }, C.plum, C.plumDeep, {
        over: function (g) {
          dots(g, [[-0.06, -0.165], [0.06, -0.165]], 0.006, C.plumDeep);         // buttons
          g.strokeStyle = 'rgba(125,63,120,0.5)'; g.lineWidth = 0.004;
          g.beginPath();
          g.moveTo(-0.06, -0.165); g.quadraticCurveTo(-0.08, -0.18, -0.09, -0.172);
          g.moveTo(-0.06, -0.165); g.quadraticCurveTo(-0.04, -0.182, -0.03, -0.178);
          g.moveTo(0.06, -0.165); g.quadraticCurveTo(0.08, -0.18, 0.09, -0.172);
          g.moveTo(0.06, -0.165); g.quadraticCurveTo(0.04, -0.182, 0.03, -0.178);
          g.stroke();
        }
      });
      piece(f, rr(-0.118, -0.09, 0.236, 0.078, 0.03), C.plum, C.plumDeep, {      // the base, a dotted hem
        over: function (g) { row(g, -0.075, -0.028, 0.075, -0.028, 9, 0.005, C.plumLight); }
      });
      piece(f, rr(-0.092, -0.122, 0.094, 0.048, 0.022), C.plumLight, C.plum);    // two seat cushions
      piece(f, rr(-0.002, -0.122, 0.094, 0.048, 0.022), C.plumLight, C.plum);
      piece(f, ell(-0.048, -0.142, 0.03, 0.028), C.yellow, C.doorDeep, {         // a round pillow
        over: function (g) { dots(g, [[-0.048, -0.142]], 0.006, C.doorDeep); }
      });
      piece(f, function (g) {                                                    // a soft square pillow
        g.save(); g.translate(0.05, -0.14); g.rotate(0.22);
        rr(-0.028, -0.026, 0.056, 0.052, 0.016)(g);
        g.restore();
      }, C.rugLight, C.rug, {
        over: function (g) { dots(g, [[0.04, -0.15], [0.06, -0.146], [0.046, -0.13], [0.064, -0.127]], 0.0045, C.rugDeep); }
      });
      piece(f, rr(-0.136, -0.14, 0.054, 0.132, 0.027), C.plum, C.plumDeep);      // the rolled arms
      piece(f, rr(0.082, -0.14, 0.054, 0.132, 0.027), C.plum, C.plumDeep);
      det(f.g, function (g) {
        g.arc(-0.109, -0.113, 0.013, 0.4, 5.4); g.moveTo(0.122, -0.113); g.arc(0.109, -0.113, 0.013, 0, 5.0);
      }, 0.7);
    },
    curtain: function (b, f) {
      // behind: the tall window, the rod and the far drape. In front: the near drape,
      // tall on the left, tied, and swept low across to the right: a friend comes up
      // beside the tall drape, over the low sweep, in front of the window.
      piece(b, function (g) {                                                    // the window frame
        g.beginPath(); g.moveTo(-0.07, -0.12); g.lineTo(-0.07, -0.37);
        g.bezierCurveTo(-0.07, -0.47, 0.09, -0.47, 0.09, -0.37); g.lineTo(0.09, -0.12); g.closePath();
      }, C.frame, C.frameDeep);
      piece(b, function (g) {                                                    // the glass
        g.beginPath(); g.moveTo(-0.054, -0.136); g.lineTo(-0.054, -0.368);
        g.bezierCurveTo(-0.054, -0.45, 0.074, -0.45, 0.074, -0.368); g.lineTo(0.074, -0.136); g.closePath();
      }, C.glass, C.glassDeep, {
        grain: 0.4,
        over: function (g) {
          g.fillStyle = C.leaf;                                                  // a hill outside
          g.beginPath(); g.ellipse(0.03, -0.12, 0.12, 0.06, 0, 0, TAU); g.fill();
          g.fillStyle = '#fffbff';
          g.beginPath(); g.ellipse(0.03, -0.34, 0.03, 0.013, 0, 0, TAU); g.ellipse(0.045, -0.35, 0.018, 0.013, 0, 0, TAU); g.fill();
        }
      });
      det(b.g, function (g) { g.moveTo(0.01, -0.43); g.lineTo(0.01, -0.136); g.moveTo(-0.054, -0.28); g.lineTo(0.074, -0.28); }, 2.6, C.frame);
      det(b.g, function (g) { g.moveTo(0.01, -0.43); g.lineTo(0.01, -0.136); g.moveTo(-0.054, -0.28); g.lineTo(0.074, -0.28); }, 0.6);
      piece(b, function (g) {                                                    // the far drape, tied back
        g.beginPath(); g.moveTo(0.106, -0.478); g.lineTo(0.04, -0.478);
        g.quadraticCurveTo(0.06, -0.33, 0.086, -0.25);
        g.quadraticCurveTo(0.07, -0.12, 0.074, 0); g.lineTo(0.106, 0); g.closePath();
      }, C.blue, C.blueDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(63,127,192,0.6)'; g.lineWidth = 0.005;
          g.beginPath(); g.moveTo(0.075, -0.47); g.quadraticCurveTo(0.085, -0.35, 0.095, -0.25);
          g.moveTo(0.092, -0.22); g.quadraticCurveTo(0.088, -0.1, 0.09, 0); g.stroke();
        }
      });
      piece(b, rr(0.078, -0.262, 0.03, 0.02, 0.01), C.yellow, C.doorDeep);
      piece(b, rr(-0.1, -0.494, 0.2, 0.016, 0.008), C.wood, C.woodDeep);        // the rod and its knobs
      piece(b, ell(-0.1, -0.486, 0.01, 0.01), C.yellow, C.doorDeep);
      piece(b, ell(0.1, -0.486, 0.01, 0.01), C.yellow, C.doorDeep);
      piece(f, function (g) {                                                    // the near drape
        g.beginPath(); g.moveTo(-0.106, -0.004); g.lineTo(-0.104, -0.478); g.lineTo(-0.026, -0.478);
        g.bezierCurveTo(-0.03, -0.36, -0.04, -0.26, -0.058, -0.192);
        g.bezierCurveTo(-0.01, -0.168, 0.05, -0.164, 0.104, -0.17);
        g.bezierCurveTo(0.11, -0.12, 0.108, -0.05, 0.106, -0.004);
        g.closePath();
      }, C.blue, C.blueDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(63,127,192,0.6)'; g.lineWidth = 0.006;
          g.beginPath();
          g.moveTo(-0.082, -0.47); g.quadraticCurveTo(-0.085, -0.33, -0.09, -0.205);
          g.moveTo(-0.055, -0.47); g.quadraticCurveTo(-0.06, -0.33, -0.074, -0.205);
          for (var i = 0; i < 5; i++) { g.moveTo(-0.088 + i * 0.008, -0.178); g.quadraticCurveTo(-0.08 + i * 0.03, -0.11, -0.075 + i * 0.04, -0.035); }
          g.stroke();
          row(g, -0.09, -0.02, 0.09, -0.02, 10, 0.006, C.cloth);                 // the dotted hem
        }
      });
      piece(f, rr(-0.11, -0.208, 0.062, 0.024, 0.012), C.yellow, C.doorDeep, {   // the tie
        over: function (g) { dots(g, [[-0.079, -0.196]], 0.005, C.doorDeep); }
      });
    },
    basket: function (b, f) {
      shadow(b, 0.1);
      piece(b, function (g) {                                                    // the handle
        g.beginPath(); g.arc(0, -0.1, 0.092, Math.PI, 0); g.arc(0, -0.1, 0.076, 0, Math.PI, true); g.closePath();
      }, C.wicker, C.wickerDeep, {
        over: function (g) {
          g.strokeStyle = 'rgba(168,116,58,0.7)'; g.lineWidth = 0.004;
          g.beginPath();
          for (var i = 1; i < 12; i++) {
            var a = Math.PI + i * Math.PI / 12;
            g.moveTo(Math.cos(a) * 0.074, -0.1 + Math.sin(a) * 0.074); g.lineTo(Math.cos(a + 0.12) * 0.094, -0.1 + Math.sin(a + 0.12) * 0.094);
          }
          g.stroke();
        }
      });
      piece(b, ell(0, -0.146, 0.098, 0.016), C.wickerDeep, null);                // the far rim, dark inside
      piece(f, function (g) {                                                    // the round belly
        g.beginPath(); g.moveTo(-0.098, -0.15); g.lineTo(0.098, -0.15);
        g.bezierCurveTo(0.112, -0.07, 0.095, -0.004, 0.062, -0.004); g.lineTo(-0.062, -0.004);
        g.bezierCurveTo(-0.095, -0.004, -0.112, -0.07, -0.098, -0.15); g.closePath();
      }, C.wicker, C.wickerDeep, {
        over: function (g) {                                                     // the weave
          g.strokeStyle = 'rgba(168,116,58,0.75)'; g.lineWidth = 0.0045;
          g.beginPath();
          for (var j = 0; j < 5; j++) {
            var y = -0.122 + j * 0.027;
            for (var i = -5; i <= 5; i++) {
              var x = i * 0.022 + (j % 2) * 0.011;
              g.moveTo(x - 0.008, y + 0.004); g.quadraticCurveTo(x, y - 0.008, x + 0.008, y + 0.004);
            }
          }
          g.stroke();
        }
      });
      piece(f, rr(-0.106, -0.16, 0.212, 0.024, 0.012), C.wickerLight, C.wicker, {  // the rope rim
        over: function (g) {
          g.strokeStyle = 'rgba(168,116,58,0.8)'; g.lineWidth = 0.004;
          g.beginPath();
          for (var i = -9; i <= 9; i++) { g.moveTo(i * 0.011 - 0.004, -0.14); g.lineTo(i * 0.011 + 0.004, -0.156); }
          g.stroke();
        }
      });
      piece(f, function (g) {                                                    // the blanket, over the rim
        g.beginPath(); g.moveTo(-0.012, -0.164);
        g.quadraticCurveTo(0.05, -0.17, 0.107, -0.163);
        g.bezierCurveTo(0.112, -0.13, 0.108, -0.09, 0.1, -0.066);
        g.quadraticCurveTo(0.08, -0.05, 0.066, -0.07); g.quadraticCurveTo(0.05, -0.052, 0.034, -0.076);
        g.quadraticCurveTo(0.018, -0.062, 0.004, -0.086);
        g.bezierCurveTo(-0.01, -0.11, -0.016, -0.14, -0.012, -0.164);
        g.closePath();
      }, C.rugLight, C.rug, {
        over: function (g) {
          var pts = [];
          for (var i = 0; i < 4; i++) for (var j = 0; j < 3; j++) pts.push([0.012 + i * 0.026 + (j % 2) * 0.013, -0.15 + j * 0.026]);
          dots(g, pts, 0.005, C.rugDeep);
        }
      });
    },
    wardrobe: function (b, f) {
      shadow(b, 0.11);
      piece(b, function (g) {                                                    // the body, a round top
        g.beginPath(); g.moveTo(-0.098, -0.012); g.lineTo(-0.098, -0.37);
        g.bezierCurveTo(-0.098, -0.452, 0.098, -0.452, 0.098, -0.37); g.lineTo(0.098, -0.012); g.closePath();
      }, C.wood, C.woodDeep, {
        over: function (g) { row(g, -0.05, -0.408, 0.05, -0.408, 6, 0.005, C.woodLight); }
      });
      piece(b, function (g) {                                                    // the dark inside
        g.beginPath(); g.moveTo(-0.076, -0.18); g.lineTo(-0.076, -0.355);
        g.bezierCurveTo(-0.076, -0.398, 0.076, -0.398, 0.076, -0.355); g.lineTo(0.076, -0.18); g.closePath();
      }, C.inside, null, {
        over: function (g) {
          g.strokeStyle = C.woodLight; g.lineWidth = 0.005;                      // the rail and two hangers
          g.beginPath(); g.moveTo(-0.08, -0.362); g.lineTo(0.08, -0.362); g.stroke();
          g.strokeStyle = C.wickerLight; g.lineWidth = 0.004;
          g.beginPath(); g.arc(0.012, -0.352, 0.007, Math.PI, 0); g.arc(0.048, -0.352, 0.007, Math.PI, 0); g.stroke();
          g.fillStyle = C.rug;                                                   // a little dress
          g.beginPath(); g.moveTo(0.002, -0.345); g.lineTo(0.022, -0.345); g.lineTo(0.03, -0.3);
          g.quadraticCurveTo(0.012, -0.292, -0.006, -0.3); g.closePath(); g.fill();
          g.fillStyle = C.blue;                                                  // a little shirt
          g.beginPath(); g.moveTo(0.036, -0.345); g.lineTo(0.06, -0.345); g.lineTo(0.064, -0.308);
          g.lineTo(0.032, -0.308); g.closePath(); g.fill();
        }
      });
      piece(b, function (g) {                                                    // the right door, swung open
        g.beginPath(); g.moveTo(0.074, -0.186); g.lineTo(0.074, -0.37);
        g.quadraticCurveTo(0.09, -0.392, 0.106, -0.4); g.lineTo(0.106, -0.2); g.closePath();
      }, C.woodLight, C.wood);
      piece(f, ell(-0.075, -0.008, 0.016, 0.008), C.woodDeep, null);             // feet
      piece(f, ell(0.075, -0.008, 0.016, 0.008), C.woodDeep, null);
      piece(f, rr(-0.102, -0.2, 0.204, 0.19, 0.022), C.wood, C.woodDeep, {       // the drawers below
        over: function (g) {
          row(g, -0.08, -0.186, 0.08, -0.186, 9, 0.0045, C.woodLight);
          g.fillStyle = 'rgba(255,225,180,0.35)';
          rr(-0.084, -0.17, 0.168, 0.066, 0.016)(g); g.fill();
          rr(-0.084, -0.092, 0.168, 0.066, 0.016)(g); g.fill();
        }
      });
      det(f.g, function (g) { rr(-0.084, -0.17, 0.168, 0.066, 0.016)(g); }, 0.7);
      det(f.g, function (g) { rr(-0.084, -0.092, 0.168, 0.066, 0.016)(g); }, 0.7);
      piece(f, ell(0, -0.137, 0.011, 0.011), C.yellow, C.doorDeep);              // round knobs
      piece(f, ell(0, -0.059, 0.011, 0.011), C.yellow, C.doorDeep);
      piece(f, function (g) {                                                    // the left door, shut
        g.beginPath(); g.moveTo(-0.082, -0.196); g.lineTo(-0.082, -0.355);
        g.quadraticCurveTo(-0.08, -0.384, -0.03, -0.392); g.lineTo(-0.03, -0.196); g.closePath();
      }, C.woodLight, C.wood, {
        over: function (g) {
          g.fillStyle = 'rgba(201,138,85,0.45)';
          rr(-0.07, -0.34, 0.028, 0.12, 0.012)(g); g.fill();
        }
      });
      piece(f, heart(-0.056, -0.36, 0.011), C.rug, null, { ink: 0.6 });
      piece(f, ell(-0.04, -0.27, 0.008, 0.008), C.yellow, C.doorDeep);
    },
    plant: function (b, f) {
      shadow(b, 0.08);
      // the tall leaves behind: [angle, distance of the leaf's middle, rx, ry]
      var L = [[-0.56, 0.1, 0.027, 0.056], [0.56, 0.1, 0.027, 0.056], [-0.27, 0.135, 0.03, 0.066], [0.27, 0.135, 0.03, 0.066], [0, 0.15, 0.032, 0.07]];
      L.forEach(function (q, i) {
        var x = Math.sin(q[0]) * q[1], y = -0.155 - Math.cos(q[0]) * q[1];
        piece(b, leaf(x, y, q[2], q[3], q[0]), i < 2 ? C.leafMid : C.leaf, C.leafDeep);
        det(b.g, function (g) {
          g.moveTo(Math.sin(q[0]) * (q[1] - q[3] * 0.8), -0.155 - Math.cos(q[0]) * (q[1] - q[3] * 0.8));
          g.lineTo(Math.sin(q[0]) * (q[1] + q[3] * 0.55), -0.155 - Math.cos(q[0]) * (q[1] + q[3] * 0.55));
        }, 0.6, C.leafDeep);
      });
      piece(f, ell(0, -0.008, 0.07, 0.009), C.potDeep, null);                    // the saucer
      piece(f, function (g) {                                                    // the round pot
        g.beginPath(); g.moveTo(-0.082, -0.12);
        g.bezierCurveTo(-0.1, -0.06, -0.08, -0.008, -0.05, -0.008); g.lineTo(0.05, -0.008);
        g.bezierCurveTo(0.08, -0.008, 0.1, -0.06, 0.082, -0.12); g.closePath();
      }, C.pot, C.potDeep, {
        over: function (g) {
          row(g, -0.066, -0.066, 0.066, -0.066, 7, 0.0065, C.cloth);
          g.strokeStyle = 'rgba(169,71,44,0.6)'; g.lineWidth = 0.004;
          g.beginPath(); g.moveTo(-0.1, -0.088); g.lineTo(0.1, -0.088); g.moveTo(-0.1, -0.044); g.lineTo(0.1, -0.044); g.stroke();
        }
      });
      piece(f, leaf(-0.078, -0.105, 0.02, 0.045, 0.5), C.leafMid, C.leafDeep);   // two leaves droop over the pot
      piece(f, leaf(0.078, -0.105, 0.02, 0.045, -0.5), C.leafMid, C.leafDeep);
      piece(f, sm([[-0.098, -0.118], [-0.1, -0.175], [-0.062, -0.2], [-0.03, -0.178], [0, -0.204], [0.03, -0.178],
        [0.062, -0.2], [0.1, -0.175], [0.098, -0.118], [0, -0.108]]), C.leaf, C.leafDeep, {   // the low bush
        over: function (g) {
          g.strokeStyle = 'rgba(79,162,90,0.8)'; g.lineWidth = 0.004;
          g.beginPath();
          g.moveTo(-0.06, -0.125); g.quadraticCurveTo(-0.07, -0.16, -0.06, -0.18);
          g.moveTo(0, -0.125); g.lineTo(0, -0.185);
          g.moveTo(0.06, -0.125); g.quadraticCurveTo(0.07, -0.16, 0.06, -0.18);
          g.stroke();
          dots(g, [[-0.035, -0.15], [0.032, -0.158], [-0.078, -0.16], [0.08, -0.148]], 0.008, C.rugLight);   // little flowers
          dots(g, [[-0.035, -0.15], [0.032, -0.158], [-0.078, -0.16], [0.08, -0.148]], 0.003, C.yellow);
        }
      });
      piece(f, rr(-0.092, -0.136, 0.184, 0.03, 0.014), C.pot, C.potDeep);        // the pot's rim
    },
    table: function (b, f) {
      shadow(b, 0.14);
      piece(f, function (g) {                                                    // the long cloth, a scalloped hem
        g.beginPath(); g.moveTo(-0.126, -0.18); g.lineTo(0.126, -0.18);
        g.bezierCurveTo(0.134, -0.12, 0.136, -0.06, 0.134, -0.022);
        for (var i = 0; i < 6; i++) {
          var x1 = 0.134 - (i + 1) * 0.268 / 6;
          g.quadraticCurveTo(x1 + 0.0223, 0.012, x1, -0.022);
        }
        g.bezierCurveTo(-0.136, -0.06, -0.134, -0.12, -0.126, -0.18);
        g.closePath();
      }, C.cloth, C.clothDeep, {
        grain: 0.5,
        over: function (g) {
          g.strokeStyle = 'rgba(224,185,138,0.7)'; g.lineWidth = 0.005;          // soft folds
          g.beginPath();
          for (var i = 1; i < 6; i++) { var x = -0.134 + i * 0.268 / 6; g.moveTo(x, -0.022); g.quadraticCurveTo(x * 0.97, -0.09, x * 0.95, -0.15); }
          g.stroke();
          var pts = [];
          for (var a = 0; a < 6; a++) for (var j = 0; j < 3; j++) pts.push([-0.112 + a * 0.0447 + (j % 2) * 0.0223, -0.142 + j * 0.036]);
          dots(g, pts, 0.0075, C.dot);
          row(g, -0.112, -0.036, 0.112, -0.036, 11, 0.004, C.blue);
        }
      });
      piece(f, ell(0, -0.18, 0.128, 0.015), C.clothLight, C.clothDeep, { grain: 0.4 });   // the table top
      piece(f, ell(0.094, -0.18, 0.03, 0.007), C.blueLight, C.blueDeep);       // a plate of biscuits
      piece(f, ell(0.083, -0.186, 0.01, 0.008), C.wicker, C.wickerDeep);
      piece(f, ell(0.105, -0.186, 0.01, 0.008), C.wicker, C.wickerDeep);
      piece(f, ell(0.094, -0.194, 0.01, 0.008), C.wicker, C.wickerDeep);
      det(f.g, function (g) { g.arc(-0.083, -0.19, 0.01, -1.3, 1.3); }, 1.1);   // a mug, its handle
      piece(f, rr(-0.118, -0.206, 0.034, 0.03, 0.009), C.rug, C.rugDeep, {
        over: function (g) { dots(g, [[-0.108, -0.192], [-0.094, -0.192]], 0.004, C.cloth); }
      });
    },
    armchair: function (b, f) {
      shadow(b, 0.12);
      piece(f, ell(-0.082, -0.01, 0.015, 0.01), C.woodDeep, null);               // round feet
      piece(f, ell(0.082, -0.01, 0.015, 0.01), C.woodDeep, null);
      piece(f, rr(-0.094, -0.214, 0.188, 0.16, 0.066), C.red, C.redDeep, {       // the round backrest, dotted
        over: function (g) {
          var pts = [];
          for (var i = 0; i < 9; i++) { var a = Math.PI * (1.08 + i * 0.84 / 8); pts.push([Math.cos(a) * 0.08, -0.136 + Math.sin(a) * 0.066]); }
          dots(g, pts, 0.0055, C.cloth);
        }
      });
      piece(f, rr(-0.1, -0.1, 0.2, 0.088, 0.03), C.red, C.redDeep, {             // the base, a dotted hem
        over: function (g) { row(g, -0.06, -0.028, 0.06, -0.028, 7, 0.005, C.cloth); }
      });
      piece(f, rr(-0.074, -0.126, 0.148, 0.046, 0.022), C.redLight, C.red);      // the seat cushion
      piece(f, ell(0, -0.152, 0.032, 0.03), C.yellow, C.doorDeep, {              // a round pillow
        over: function (g) {
          g.strokeStyle = 'rgba(217,169,44,0.9)'; g.lineWidth = 0.004;
          g.beginPath(); g.arc(0, -0.152, 0.018, 0, TAU); g.stroke();
          dots(g, [[0, -0.152]], 0.005, C.doorDeep);
        }
      });
      piece(f, rr(-0.118, -0.15, 0.054, 0.142, 0.027), C.red, C.redDeep);        // the rolled arms
      piece(f, rr(0.064, -0.15, 0.054, 0.142, 0.027), C.red, C.redDeep);
      det(f.g, function (g) {
        g.arc(-0.091, -0.123, 0.013, 0.4, 5.4); g.moveTo(0.104, -0.123); g.arc(0.091, -0.123, 0.013, 0, 5.0);
      }, 0.7);
    },
    toybox: function (b, f) {
      shadow(b, 0.12);
      piece(b, function (g) {                                                    // the lid, open, behind
        g.beginPath(); g.moveTo(-0.108, -0.15); g.lineTo(-0.102, -0.245);
        g.bezierCurveTo(-0.09, -0.282, 0.09, -0.282, 0.102, -0.245); g.lineTo(0.108, -0.15); g.closePath();
      }, C.blueLight, C.blue, {
        over: function (g) {
          var pts = [];
          for (var i = 0; i < 9; i++) { var a = Math.PI * (1.12 + i * 0.76 / 8); pts.push([Math.cos(a) * 0.09, -0.19 + Math.sin(a) * 0.066]); }
          dots(g, pts, 0.005, C.cloth);
        }
      });
      piece(f, rr(-0.112, -0.168, 0.224, 0.165, 0.028), C.blue, C.blueDeep, {    // the box
        over: function (g) {
          g.fillStyle = C.blueDeep; g.fillRect(-0.12, -0.17, 0.24, 0.03);        // the rim band, dotted
          row(g, -0.092, -0.154, 0.092, -0.154, 11, 0.005, C.cloth);
          g.fillStyle = C.yellow;                                                // a sun
          g.beginPath(); g.arc(-0.052, -0.074, 0.026, 0, TAU); g.fill();
          g.strokeStyle = C.yellow; g.lineWidth = 0.006; g.lineCap = 'round';
          g.beginPath();
          for (var i = 0; i < 8; i++) { var a = i * TAU / 8; g.moveTo(-0.052 + Math.cos(a) * 0.033, -0.074 + Math.sin(a) * 0.033); g.lineTo(-0.052 + Math.cos(a) * 0.04, -0.074 + Math.sin(a) * 0.04); }
          g.stroke();
          g.fillStyle = C.rugLight; heart(0.052, -0.072, 0.03)(g); g.fill();     // a heart
        }
      });
      det(f.g, function (g) { g.moveTo(-0.112, -0.14); g.lineTo(0.112, -0.14); }, 0.7);
      piece(f, ell(-0.088, -0.178, 0.022, 0.022), C.red, C.redDeep, {            // a ball on the rim
        over: function (g) { g.fillStyle = C.cloth; g.fillRect(-0.12, -0.184, 0.06, 0.01); }
      });
      piece(f, function (g) {                                                    // a soft block
        g.save(); g.translate(0.09, -0.18); g.rotate(-0.2);
        rr(-0.02, -0.02, 0.04, 0.04, 0.01)(g);
        g.restore();
      }, C.yellow, C.doorDeep, {
        over: function (g) { dots(g, [[0.09, -0.18]], 0.008, C.leaf); }
      });
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

  // Where Bella stands (the same numbers as layout() in js/scenes/house.js) and the
  // door painted behind her: x, y its bottom center, w, h.
  function door(W, H) {
    var heroH = Math.min(0.42 * u, 0.27 * H), heroX = Math.max(0.04 * W, 8) + 0.45 * heroH;
    var frontY = H - Math.max(6, 0.03 * H), rowY = (W / H > 1.5 ? 0.64 : 0.7) * H;
    var h = Math.min(1.32 * heroH, frontY - rowY - 0.012 * H), w = 0.54 * h;
    return {
      x: Math.max(heroX - 0.1 * heroH, w / 2 + lw(2) + 2), y: frontY - 0.05 * heroH, w: w, h: h,
      heroX: heroX, heroH: heroH, frontY: frontY
    };
  }

  function room(W, H) {
    var key = W + 'x' + H + 'x' + u + 'x' + dpr;
    if (roomC && roomKey === key) return roomC;
    var c = Art.makeCanvas(W * dpr, H * dpr);
    c.lw = W; c.lh = H;
    var g = c.getContext('2d');
    g.scale(c.width / W, c.height / H);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var fy = floorY(W, H), i, x, y;
    var rand = Art.rng(9);
    // the wall: warm orange, as the house outside, lighter around the window
    var gr = g.createLinearGradient(0, 0, 0, fy);
    gr.addColorStop(0, C.wallDeep); gr.addColorStop(0.55, C.wall); gr.addColorStop(1, C.wall);
    g.fillStyle = gr; g.fillRect(0, 0, W, fy);
    var lx = W * (W / H > 1.5 ? 0.37 : 0.6);
    var lg = g.createRadialGradient(lx, fy * 0.45, 0, lx, fy * 0.45, Math.max(W, fy) * 0.55);
    lg.addColorStop(0, 'rgba(255,238,212,0.6)'); lg.addColorStop(1, 'rgba(255,238,212,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, fy);
    // a few loose brick lines, as on the house outside
    g.strokeStyle = 'rgba(201,106,42,0.24)'; g.lineWidth = lw(0.8);
    var rowH = u * 0.055;
    g.beginPath();
    for (y = rowH; y < fy - u * 0.12; y += rowH) {
      x = rand() * u * 0.1;
      while (x < W) {
        var l = u * (0.05 + rand() * 0.08);
        if (rand() < 0.4) { g.moveTo(x, y); g.lineTo(x + l, y); }
        x += l + u * (0.05 + rand() * 0.1);
      }
    }
    g.stroke();
    // the low band of the wall, with a dotted trim (as the mushrooms' dots)
    var bh = u * 0.1;
    g.fillStyle = C.band; g.fillRect(0, fy - bh, W, bh);
    Art.ink(g, lw(0.9));
    g.beginPath(); g.moveTo(0, fy - bh); g.lineTo(W, fy - bh); g.stroke();
    g.fillStyle = C.wallLight;
    for (x = u * 0.03; x < W; x += u * 0.06) { g.beginPath(); g.arc(x, fy - bh + u * 0.026, u * 0.009, 0, TAU); g.fill(); }
    // the floor: wooden planks
    g.fillStyle = C.floor; g.fillRect(0, fy, W, H - fy);
    var ph = u * 0.06, n = 0;
    g.strokeStyle = C.floorLine; g.lineWidth = lw(0.9);
    for (y = fy; y < H; n++) {
      var h2 = ph * (1 + 0.5 * (y - fy) / (H - fy));
      if (n % 2) { g.fillStyle = 'rgba(255,232,196,0.14)'; g.fillRect(0, y, W, h2); }
      if (n % 3 === 0) { g.fillStyle = 'rgba(150,84,44,0.1)'; g.fillRect(0, y, W, h2); }
      g.beginPath();
      g.moveTo(0, y + h2); g.lineTo(W, y + h2);
      for (x = (rand() * 0.6 - 0.1) * u; x < W; x += u * (0.45 + rand() * 0.35)) { g.moveTo(x, y); g.lineTo(x, y + h2); }
      g.stroke();
      y += h2;
    }
    var fl = g.createLinearGradient(0, fy, 0, H);
    fl.addColorStop(0, 'rgba(120,64,30,0.28)'); fl.addColorStop(0.25, 'rgba(120,64,30,0)');
    g.fillStyle = fl; g.fillRect(0, fy, W, H - fy);
    // the skirting board
    g.fillStyle = C.woodLight; g.fillRect(0, fy - u * 0.024, W, u * 0.024);
    Art.ink(g, lw(1.1));
    g.beginPath(); g.moveTo(0, fy - u * 0.024); g.lineTo(W, fy - u * 0.024); g.moveTo(0, fy); g.lineTo(W, fy); g.stroke();
    // the round rug, with a dotted ring
    var rx = W * 0.56, ry = fy + (H - fy) * 0.55, rw = Math.min(W * 0.36, u * 0.6), rh = (H - fy) * 0.16;
    g.beginPath(); g.ellipse(rx, ry, rw, rh, 0, 0, TAU);
    g.fillStyle = C.rug; g.fill();
    g.beginPath(); g.ellipse(rx, ry, rw * 0.78, rh * 0.7, 0, 0, TAU);
    g.fillStyle = C.rugLight; g.fill();
    g.beginPath(); g.ellipse(rx, ry, rw * 0.42, rh * 0.36, 0, 0, TAU);
    g.fillStyle = C.rug; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
    g.fillStyle = C.cloth;
    var nd = Math.max(12, Math.round(rw / (u * 0.045)));
    for (i = 0; i < nd; i++) {
      var a = i * TAU / nd;
      g.beginPath(); g.arc(rx + Math.cos(a) * rw * 0.89, ry + Math.sin(a) * rh * 0.85, u * 0.008, 0, TAU); g.fill();
    }
    Art.ink(g, lw(1)); g.beginPath(); g.ellipse(rx, ry, rw, rh, 0, 0, TAU); g.stroke();
    // the round window (the house's round window, from inside): sky, a hill, a cloud
    var wr = Math.min(u * 0.13, fy * 0.22), wx = W * (W / H > 1.5 ? 0.37 : 0.6), wy = Math.max(wr + u * 0.16, fy * 0.42);
    g.beginPath(); g.arc(wx, wy, wr * 1.2, 0, TAU); g.fillStyle = C.frame; g.fill();
    Art.ink(g, lw(1.2)); g.stroke();
    g.save();
    g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.clip();
    var sky = g.createLinearGradient(0, wy - wr, 0, wy + wr);
    sky.addColorStop(0, '#9fd3ef'); sky.addColorStop(1, '#e6f4fa');
    g.fillStyle = sky; g.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    g.fillStyle = C.leaf;
    g.beginPath(); g.ellipse(wx + wr * 0.3, wy + wr * 1.05, wr * 1.1, wr * 0.55, 0, 0, TAU); g.fill();
    g.fillStyle = C.leafMid;
    g.beginPath(); g.ellipse(wx - wr * 0.7, wy + wr * 1.1, wr * 0.8, wr * 0.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#fffbff';
    g.beginPath(); g.ellipse(wx - wr * 0.3, wy - wr * 0.3, wr * 0.34, wr * 0.15, 0, 0, TAU);
    g.ellipse(wx - wr * 0.15, wy - wr * 0.42, wr * 0.2, wr * 0.15, 0, 0, TAU); g.fill();
    g.fillStyle = C.yellow;
    g.beginPath(); g.arc(wx + wr * 0.45, wy - wr * 0.4, wr * 0.2, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = C.frame; g.lineWidth = lw(3.4);
    g.beginPath(); g.moveTo(wx - wr, wy); g.lineTo(wx + wr, wy); g.moveTo(wx, wy - wr); g.lineTo(wx, wy + wr); g.stroke();
    Art.ink(g, lw(1));
    g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.stroke();
    // the yellow arched door at floor level, on the left: Bella stands at it, on a mat
    var d = door(W, H), dw = d.w, dh = d.h, dx = d.x, dy = d.y, fw = dw * 0.1;
    function arch(k) {
      var hw = dw / 2 - k, top = dy - dh + k;
      g.beginPath();
      g.moveTo(dx - hw, dy); g.lineTo(dx - hw, top + hw);
      g.arc(dx, top + hw, hw, Math.PI, 0); g.lineTo(dx + hw, dy); g.closePath();
    }
    g.fillStyle = C.shadow;
    g.beginPath(); g.ellipse(dx, dy, dw * 0.62, dh * 0.035, 0, 0, TAU); g.fill();
    arch(0); g.fillStyle = C.frame; g.fill(); Art.ink(g, lw(1.2)); g.stroke();
    arch(fw); g.fillStyle = C.door; g.fill(); Art.ink(g, lw(1)); g.stroke();
    g.save(); arch(fw); g.clip();
    g.strokeStyle = 'rgba(217,169,44,0.9)'; g.lineWidth = lw(0.9);
    g.beginPath();
    for (i = 1; i < 4; i++) { x = dx - dw / 2 + fw + (dw - 2 * fw) * i / 4; g.moveTo(x, dy - dh); g.lineTo(x, dy); }
    g.stroke();
    g.restore();
    var gy = dy - dh + dw * 0.5;                                    // a round pane
    g.beginPath(); g.arc(dx, gy, dw * 0.17, 0, TAU); g.fillStyle = C.glass; g.fill(); Art.ink(g, lw(0.9)); g.stroke();
    g.fillStyle = C.plum;                                           // two hinges
    [0.3, 0.72].forEach(function (q) {
      rr(dx - dw / 2 + fw * 0.6, dy - dh * q, dw * 0.2, dh * 0.04, dh * 0.02)(g);
      g.fill(); Art.ink(g, lw(0.8)); g.stroke(); g.fillStyle = C.plum;
    });
    g.beginPath(); g.arc(dx + dw * 0.26, dy - dh * 0.42, dw * 0.05, 0, TAU);   // the knob
    g.fillStyle = C.red; g.fill(); Art.ink(g, lw(0.8)); g.stroke();
    var mr = Math.min(0.07 * d.heroH, H - d.frontY - 2);            // the mat
    g.beginPath(); g.ellipse(d.heroX, d.frontY, d.heroH * 0.5, mr, 0, 0, TAU);
    g.fillStyle = C.leafMid; g.fill(); Art.ink(g, lw(1)); g.stroke();
    g.beginPath(); g.ellipse(d.heroX, d.frontY, d.heroH * 0.38, mr * 0.6, 0, 0, TAU);
    g.fillStyle = C.cloth; g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1;
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
    door: function (W, H) { need(); return door(W, H); },
    room: function (W, H) { need(); return room(W, H); },
    spot: function (kind) { return need()[kind]; }
  };
})();
