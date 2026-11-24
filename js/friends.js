/* friends.js - the bakery's friends: the plush husky, Pagi the dog, the mouse
 * and the lizard from the bedroom-wall mural. Classic script: window.Friends.
 * Needs window.Art (js/art.js) loaded first.
 *
 * THESE ARE PLACEHOLDER DRAWINGS (a round body, a head, ears, googly eyes and a
 * smile in each friend's colors). The designer replaces the bodies of build()
 * and draw(); the API below stays as it is, because js/scenes/bakery.js uses it.
 *
 *   Friends.KINDS = ['husky', 'pagi', 'mouse', 'lizard']   the order they visit in
 *   Friends.build(h, DPR)       pre-renders every friend h CSS px tall (sitting, with
 *                               the head; a walking friend is about as tall). The
 *                               scene calls it from its resize(); draw() only blits
 *                               cached canvases and moves them: no shadowBlur, no
 *                               filters, no grain per frame.
 *   Friends.draw(g, kind, x, y, pose)
 *                               draws the friend with its BOTTOM CENTER at (x, y),
 *                               FACING LEFT (toward the counter and the cake; the
 *                               scene mirrors it with scale(-1, 1) to walk out to
 *                               the right). pose = {t, state, p}:
 *                                 t      time in seconds (idle breathing, blinks)
 *                                 state  'walk' | 'sit' | 'eat' | 'happy'
 *                                 p      0..1, the progress of that state: the walk
 *                                        phase (one full step cycle per 1), how far
 *                                        eating has got, how far the happy wiggle is
 *   Everyone smiles at rest. The husky keeps its plush look (big glittery blue eyes,
 *   light-blue inner ears, cream muzzle); Pagi, the mouse and the lizard keep their
 *   big round googly eyes with black pupils. Pagi's collar has no letters (nothing to read).
 */
(function () {
  'use strict';

  var Art = window.Art;
  var TAU = Math.PI * 2;
  var KINDS = ['husky', 'pagi', 'mouse', 'lizard'];
  var LOOK = {
    husky: { body: '#f4f4f6', deep: '#9aa3b5', ear: '#a8d8f0', muzzle: '#fbf1dc', eye: '#4aa3e0', earShape: 'point' },
    pagi: { body: '#b47c52', deep: '#7c5235', ear: '#8a5a3a', muzzle: '#e8c39a', eye: '#2b2230', earShape: 'long', collar: '#f6dc6e' },
    mouse: { body: '#a88f7c', deep: '#76604f', ear: '#f2b6c4', muzzle: '#e9d8c8', eye: '#2b2230', earShape: 'round' },
    lizard: { body: '#f49a7c', deep: '#e26a6a', ear: null, muzzle: '#f8c39a', eye: '#2b2230', earShape: 'none' }
  };

  var S = {}, H = 100;

  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function inked(g, fill, w) { g.fillStyle = fill; g.fill(); Art.ink(g, w); g.stroke(); }

  function paintFriend(kind, h, dpr) {
    var L = LOOK[kind], w = h * 0.9;
    var c = Art.makeCanvas(w * dpr, h * dpr), g = c.getContext('2d');
    c.lw = w; c.lh = h;
    g.scale(dpr, dpr);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var lw = Math.max(1.2, h * 0.018), hx = w * 0.42, hy = h * 0.32, hr = h * 0.22;
    // tail
    if (kind === 'lizard' || kind === 'mouse') {
      g.beginPath(); g.moveTo(w * 0.7, h * 0.9);
      g.bezierCurveTo(w * 0.98, h * 0.9, w * 0.98, h * 0.6, w * 0.86, h * 0.55);
      Art.ink(g, lw * (kind === 'lizard' ? 4 : 1.6)); g.stroke();
      g.strokeStyle = L.body; g.lineWidth = lw * (kind === 'lizard' ? 2.4 : 0.5); g.stroke();
    }
    // body
    g.beginPath(); g.ellipse(w * 0.52, h * 0.74, w * 0.3, h * 0.25, 0, 0, TAU); inked(g, L.body, lw);
    g.beginPath(); g.ellipse(w * 0.46, h * 0.78, w * 0.15, h * 0.15, 0, 0, TAU); g.fillStyle = L.muzzle; g.fill();
    // feet
    g.beginPath(); g.ellipse(w * 0.36, h * 0.96, w * 0.1, h * 0.04, 0, 0, TAU); inked(g, L.body, lw * 0.8);
    g.beginPath(); g.ellipse(w * 0.6, h * 0.96, w * 0.1, h * 0.04, 0, 0, TAU); inked(g, L.body, lw * 0.8);
    // ears
    if (L.earShape === 'point') {
      [-1, 1].forEach(function (sd) {
        g.beginPath(); g.moveTo(hx + sd * hr * 0.75, hy - hr * 0.4); g.lineTo(hx + sd * hr * 0.6, hy - hr * 1.35); g.lineTo(hx + sd * hr * 0.1, hy - hr * 0.8); g.closePath();
        inked(g, L.body, lw);
        g.beginPath(); g.moveTo(hx + sd * hr * 0.6, hy - hr * 0.55); g.lineTo(hx + sd * hr * 0.55, hy - hr * 1.05); g.lineTo(hx + sd * hr * 0.28, hy - hr * 0.75); g.closePath();
        g.fillStyle = L.ear; g.fill();
      });
    } else if (L.earShape === 'round') {
      [-1, 1].forEach(function (sd) { circle(g, hx + sd * hr * 0.85, hy - hr * 0.75, hr * 0.5); inked(g, L.ear, lw); });
    }
    // head
    circle(g, hx, hy, hr); inked(g, L.body, lw);
    if (L.earShape === 'long') {
      [-1, 1].forEach(function (sd) {
        g.beginPath(); g.ellipse(hx + sd * hr * 0.95, hy + hr * 0.25, hr * 0.28, hr * 0.7, sd * 0.2, 0, TAU); inked(g, L.ear, lw);
      });
      g.beginPath(); g.moveTo(hx - hr * 0.7, hy + hr * 0.95); g.quadraticCurveTo(hx, hy + hr * 1.2, hx + hr * 0.7, hy + hr * 0.95);
      Art.ink(g, lw * 2.6); g.stroke(); g.strokeStyle = L.collar; g.lineWidth = lw * 1.5; g.stroke();
    }
    // muzzle, nose, smile
    g.beginPath(); g.ellipse(hx - hr * 0.2, hy + hr * 0.38, hr * 0.42, hr * 0.3, 0, 0, TAU); inked(g, L.muzzle, lw * 0.7);
    circle(g, hx - hr * 0.3, hy + hr * 0.25, hr * 0.1); g.fillStyle = '#2b2230'; g.fill();
    g.beginPath(); g.arc(hx - hr * 0.22, hy + hr * 0.38, hr * 0.22, 0.2, Math.PI - 0.2); Art.ink(g, lw * 0.8); g.stroke();
    // eyes: googly (white, black pupil), or the husky's glittery blue
    [-0.45, 0.15].forEach(function (ex) {
      var x = hx + ex * hr, y = hy - hr * 0.2, r = hr * (kind === 'husky' ? 0.22 : 0.27);
      if (kind === 'husky') {
        circle(g, x, y, r); inked(g, L.eye, lw * 0.7);
        circle(g, x - r * 0.3, y - r * 0.3, r * 0.35); g.fillStyle = '#ffffff'; g.fill();
        circle(g, x + r * 0.35, y + r * 0.3, r * 0.15); g.fill();
      } else {
        circle(g, x, y, r); inked(g, '#ffffff', lw * 0.7);
        circle(g, x - r * 0.25, y + r * 0.1, r * 0.5); g.fillStyle = '#2b2230'; g.fill();
        circle(g, x - r * 0.38, y - r * 0.05, r * 0.15); g.fillStyle = '#ffffff'; g.fill();
      }
    });
    Art.pencil(c, L.deep, KINDS.indexOf(kind) + 3, 0.5);
    return { c: c, w: w, h: h };
  }

  function build(h, dpr) {
    H = h;
    KINDS.forEach(function (k) { S[k] = paintFriend(k, h, dpr); });
  }

  function draw(g, kind, x, y, pose) {
    var s = S[kind];
    if (!s) return;
    var t = pose.t || 0, p = pose.p || 0, st = pose.state;
    var bob = 0, rot = 0, sx = 1, sy = 1;
    if (st === 'walk') {
      bob = Math.abs(Math.sin(p * TAU)) * s.h * 0.05;
      rot = Math.sin(p * TAU) * 0.06;
    } else if (st === 'eat') {
      var ch = Math.abs(Math.sin(t * 12));
      sy = 1 - 0.04 * ch; sx = 1 + 0.02 * ch;
    } else if (st === 'happy') {
      rot = Math.sin(t * 14) * 0.12 * (1 - p * 0.5);
      bob = Math.abs(Math.sin(p * TAU * 2)) * s.h * 0.06;
    } else {
      sy = 1 + 0.015 * Math.sin(t * 2);
    }
    g.save();
    g.translate(x, y - bob);
    if (rot) g.rotate(rot);
    g.scale(sx, sy);
    g.drawImage(s.c, -s.w / 2, -s.h, s.w, s.h);
    g.restore();
  }

  window.Friends = { KINDS: KINDS, build: build, draw: draw };
})();
