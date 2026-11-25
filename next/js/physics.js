/* physics.js - small physics for the fairy town. Classic script: window.Phys.
 * Needs window.Matter (js/vendor/matter.min.js, Matter.js 0.19.0, MIT) loaded
 * first; Matter is used only for the star jar.
 *
 *   Phys.jar.create(seedTotal, hooks) -> jar
 *       A star jar world in JAR SPACE: a unit box, x 0..1, y 0..1, y down. The
 *       inner glass walls are Matter static bodies: a rounded bottom (y 0.955),
 *       straight sides (x 0.085 and 0.915) up to y 0.18, then the shoulders in to
 *       the neck (x 0.31..0.69) and the cork on top (y 0). See js/art-town.js
 *       (drawJar) for how jar space lies on the painted jar.
 *       The starting pile is made at once and settled with no animation:
 *       min(floor(seedTotal / 10), 50) big stars and seedTotal % 10 small ones,
 *       so at most 59 bodies; past 500 the jar simply looks full. A corrupt or
 *       infinite seed counts as 0 / 500.
 *       hooks (optional): {land(x, y), merge(x, y)}, in jar space: a dropped star
 *       touched something for the first time; 10 small stars became a big one.
 *   jar.drop(n)       queues n new small stars. They fall in from the neck, at
 *                     most 3 every 0.2 s (only while the jar is stepped).
 *   jar.step(dt)      fixed 1/60 s substeps, at most 3 per call.
 *   jar.bodies()      [{x, y, a, big}] in jar space (a: angle in radians). The
 *                     same array is refilled on every call.
 *   jar.count()       bodies in the jar now
 *   jar.pending()     stars still queued to drop
 *   jar.steps()       substeps run so far (for the tests)
 *   jar.ms()          average cost of the last 120 step() calls that ran, in ms
 *   The merge: when the small stars reach 20, or one more body would pass 60,
 *   the 10 lowest small ones merge into one big star where they lay (at the
 *   bottom of the small ones). Big stars stop at 50: past that the 10 simply
 *   melt into the full jar. So the jar never holds more than 60 bodies.
 *   Phys.jar.R = {small, big}: the body radii in jar space (big = 2.2 x small).
 *
 *   Phys.spring(k, damp) -> {x, v, kick(v0), step(dt)}
 *       A damped spring around 0 (defaults k = 120, damp = 9). kick adds v0 to
 *       the speed; step integrates dt seconds (in substeps of at most 1/60 s).
 *
 *   Phys.separate(circles, iterations)
 *       Pushes overlapping {x, y, r} circles apart along their center line, each
 *       by half the overlap. In place, O(n^2); default iterations = 2. Meant for
 *       a couple of dozen circles (bubbles).
 */
(function () {
  'use strict';

  var Matter = window.Matter;
  var STEP = 1 / 60, MAX_SUB = 3;
  var MAX_BIG = 50, MAX_BODIES = 60, MERGE_AT = 20, MERGE_N = 10;
  var RS = 0.024, RB = RS * 2.2;      // body radii in jar space
  var Z = 400;                         // Matter units per jar unit (Matter likes sizes of ~10-100)
  var DROP_EVERY = 0.2, DROP_MAX = 3;
  // the inner glass, left half, top to bottom (mirrored for the right half)
  var NECK = 0.31, SIDE = 0.085, FLOOR = 0.955, SHOULDER = 0.18, CORNER = 0.13;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // The inner wall as a polyline (jar space), going round from the left neck down,
  // along the bottom and up to the right neck. Walls are thick rectangles laid
  // outside each segment, so stars can't slip through.
  function wallLine() {
    var pts = [[NECK, 0], [NECK, 0.05], [0.2, 0.11], [SIDE, SHOULDER], [SIDE, FLOOR - CORNER]];
    for (var i = 1; i <= 4; i++) {                     // the rounded corner
      var a = Math.PI - i / 4 * Math.PI / 2;
      pts.push([SIDE + CORNER + Math.cos(a) * CORNER, FLOOR - CORNER + Math.sin(a) * CORNER]);
    }
    var left = pts.slice();
    for (var j = left.length - 1; j >= 0; j--) pts.push([1 - left[j][0], left[j][1]]);
    return pts;
  }
  function makeWalls() {
    var pts = wallLine(), T = 0.3, out = [];
    function opt(angle) { return { isStatic: true, friction: 0.4, restitution: 0.1, angle: angle || 0 }; }
    for (var i = 0; i < pts.length - 1; i++) {
      var x1 = pts[i][0], y1 = pts[i][1], x2 = pts[i + 1][0], y2 = pts[i + 1][1];
      var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      var nx = -dy / len, ny = dx / len;               // outward normal (the jar is on the left of travel)
      var cx = (x1 + x2) / 2 + nx * T / 2, cy = (y1 + y2) / 2 + ny * T / 2;
      out.push(Matter.Bodies.rectangle(cx * Z, cy * Z, (len + T * 0.4) * Z, T * Z, opt(Math.atan2(dy, dx))));
    }
    // the cork: a lid over the neck
    out.push(Matter.Bodies.rectangle(0.5 * Z, -T / 2 * Z, (1 - 2 * NECK + T) * Z, T * Z, opt()));
    return out;
  }

  function create(seedTotal, hooks) {
    hooks = hooks || {};
    var seed = Math.floor(+seedTotal);
    if (!(seed >= 0)) seed = 0;
    if (!isFinite(seed)) seed = MAX_BIG * 10;
    var engine = Matter.Engine.create({ enableSleeping: true, positionIterations: 6, velocityIterations: 4 });
    engine.gravity.y = 1;
    engine.gravity.scale = 0.0012;
    var world = engine.world;
    Matter.Composite.add(world, makeWalls());

    var stars = [];                  // the Matter bodies of the stars
    var queue = 0, dropT = 0, acc = 0, nSteps = 0;
    var out = [], msBuf = new Float32Array(120), msI = 0, msN = 0;
    var rand = rng(seed * 7919 + 13);

    function addStar(x, y, big, dropped) {
      var b = Matter.Bodies.circle(x * Z, y * Z, (big ? RB : RS) * Z, {
        restitution: 0.25, friction: 0.25, frictionStatic: 0.6, frictionAir: 0.012,
        density: 0.001, slop: 0.02 * Z * RS, sleepThreshold: 40
      });
      b.star = { big: big, landed: !dropped };
      Matter.Body.setAngle(b, (rand() - 0.5) * 1.4);
      stars.push(b);
      Matter.Composite.add(world, b);
      return b;
    }
    function removeStar(b) {
      var i = stars.indexOf(b);
      if (i >= 0) stars.splice(i, 1);
      Matter.Composite.remove(world, b);
    }
    function nSmall() {
      var n = 0;
      for (var i = 0; i < stars.length; i++) if (!stars[i].star.big) n++;
      return n;
    }
    function nBig() { return stars.length - nSmall(); }
    function wakeAll() {
      for (var i = 0; i < stars.length; i++) Matter.Sleeping.set(stars[i], false);
    }
    // The 10 lowest small stars become one big star where they lay.
    function merge() {
      var small = stars.filter(function (b) { return !b.star.big; });
      if (small.length < MERGE_N) return;
      small.sort(function (a, b) { return b.position.y - a.position.y; });
      var sx = 0, sy = 0, i;
      for (i = 0; i < MERGE_N; i++) { sx += small[i].position.x; sy += small[i].position.y; removeStar(small[i]); }
      var x = clamp(sx / MERGE_N / Z, SIDE + RB, 1 - SIDE - RB), y = clamp(sy / MERGE_N / Z, SHOULDER + RB, FLOOR - RB);
      if (nBig() < MAX_BIG) addStar(x, y, true, false);
      wakeAll();
      if (hooks.merge) hooks.merge(x, y);
    }
    function needMerge(adding) {
      var s = nSmall() + adding;
      return s >= MERGE_AT || (stars.length + adding > MAX_BODIES && s >= MERGE_N);
    }

    // A spot in the neck for a new star, or null when the neck is still busy.
    var SPOTS = [0.5, 0.42, 0.58, 0.36, 0.64];
    function freeSpot(used) {
      for (var k = 0; k < SPOTS.length; k++) {
        var x = SPOTS[k] + (rand() - 0.5) * 0.02, y = 0.04 + RS, ok = true;
        for (var i = 0; i < stars.length && ok; i++) {
          var p = stars[i].position, r = (stars[i].star.big ? RB : RS) + RS + 0.004;
          if (Math.hypot(p.x / Z - x, p.y / Z - y) < r) ok = false;
        }
        for (var j = 0; j < used.length && ok; j++) if (Math.abs(used[j] - x) < RS * 2.2) ok = false;
        if (ok) return x;
      }
      return null;
    }
    function release() {
      var used = [];
      for (var n = 0; n < DROP_MAX && queue > 0; n++) {
        if (needMerge(1)) merge();
        var x = freeSpot(used);
        if (x === null) break;
        used.push(x);
        var b = addStar(x, 0.04 + RS, false, true);
        Matter.Body.setVelocity(b, { x: (rand() - 0.5) * 0.6, y: 1.5 });
        Matter.Body.setAngularVelocity(b, (rand() - 0.5) * 0.15);
        queue--;
      }
    }

    Matter.Events.on(engine, 'collisionStart', function (e) {
      for (var i = 0; i < e.pairs.length; i++) {
        var p = e.pairs[i];
        land(p.bodyA); land(p.bodyB);
      }
    });
    function land(b) {
      if (!b.star || b.star.landed) return;
      b.star.landed = true;
      if (hooks.land) hooks.land(b.position.x / Z, b.position.y / Z);
    }

    // A body that left the jar somehow goes back in at the neck.
    function keepInside() {
      for (var i = 0; i < stars.length; i++) {
        var b = stars[i], x = b.position.x / Z, y = b.position.y / Z;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && x === x && y === y) continue;
        Matter.Body.setPosition(b, { x: 0.5 * Z, y: (0.04 + RS) * Z });
        Matter.Body.setVelocity(b, { x: 0, y: 0 });
        Matter.Sleeping.set(b, false);
      }
    }

    function substep() {
      Matter.Engine.update(engine, STEP * 1000);
      nSteps++;
    }

    // ---- the starting pile: big stars at the bottom, the small ones over them,
    // in loose rows, then run the world until it rests (no animation).
    (function seedPile() {
      var big = Math.min(Math.floor(seed / 10), MAX_BIG), small = seed % 10;
      var left = SIDE + 0.01, right = 1 - SIDE - 0.01, y = FLOOR - 0.004;
      // hex rows from the floor up; y is the bottom of the next row
      function rows(n, r, isBig) {
        var per = Math.max(1, Math.floor((right - left) / (r * 2.02))), k = 0, row = 0;
        while (k < n) {
          var inRow = Math.min(row % 2 ? per - 1 : per, n - k), gap = (right - left) / inRow;
          for (var c = 0; c < inRow; c++, k++) {
            var x = left + gap * (c + 0.5) + (rand() - 0.5) * r * 0.3;
            addStar(clamp(x, left + r, right - r), Math.max(y - r, 0.04 + r), isBig, false);
          }
          row++;
          y -= r * 1.74;
        }
        if (n) y -= r * 0.26;
      }
      rows(big, RB, true);
      rows(small, RS, false);
      for (var s = 0; s < 400; s++) {
        substep();
        if (s > 30 && stars.every(function (b) { return b.isSleeping; })) break;
      }
      keepInside();
      nSteps = 0;
    })();

    function step(dt) {
      var t0 = performance.now();
      if (!(dt > 0)) dt = 0;
      acc += Math.min(dt, STEP * MAX_SUB);
      dropT -= dt;
      if (queue > 0 && dropT <= 0) { release(); dropT = DROP_EVERY; }
      var n = 0;
      while (acc >= STEP && n < MAX_SUB) { substep(); acc -= STEP; n++; }
      if (n) keepInside();
      if (n) {
        msBuf[msI] = performance.now() - t0;
        msI = (msI + 1) % msBuf.length;
        if (msN < msBuf.length) msN++;
      }
    }

    return {
      drop: function (n) {
        n = Math.floor(+n);
        if (n > 0 && isFinite(n)) queue += n;
      },
      step: step,
      bodies: function () {
        out.length = stars.length;
        for (var i = 0; i < stars.length; i++) {
          var b = stars[i], o = out[i] || (out[i] = {});
          o.x = b.position.x / Z; o.y = b.position.y / Z;
          o.a = b.angle; o.big = b.star.big;
        }
        return out;
      },
      count: function () { return stars.length; },
      pending: function () { return queue; },
      steps: function () { return nSteps; },
      ms: function () {
        var s = 0;
        for (var i = 0; i < msN; i++) s += msBuf[i];
        return msN ? s / msN : 0;
      }
    };
  }

  // ---------------------------------------------------------------- helpers
  function spring(k, damp) {
    k = k === undefined ? 120 : k;
    damp = damp === undefined ? 9 : damp;
    var s = {
      x: 0, v: 0,
      kick: function (v0) { s.v += v0; },
      step: function (dt) {
        while (dt > 1e-6) {
          var h = Math.min(dt, STEP);
          s.v += (-k * s.x - damp * s.v) * h;
          s.x += s.v * h;
          dt -= h;
        }
      }
    };
    return s;
  }

  function separate(circles, iterations) {
    iterations = iterations === undefined ? 2 : iterations;
    var n = circles.length;
    for (var it = 0; it < iterations; it++) {
      for (var i = 0; i < n; i++) {
        var a = circles[i];
        for (var j = i + 1; j < n; j++) {
          var b = circles[j], dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
          var d = Math.sqrt(dx * dx + dy * dy), over = rr - d;
          if (over <= 0) continue;
          var ux = 1, uy = 0;
          if (d > 1e-9) { ux = dx / d; uy = dy / d; }
          var h = over / 2;
          a.x -= ux * h; a.y -= uy * h;
          b.x += ux * h; b.y += uy * h;
        }
      }
    }
    return circles;
  }

  window.Phys = {
    jar: { create: create, R: { small: RS, big: RB } },
    spring: spring,
    separate: separate
  };
})();
