/* scenes/house.js - the house: hide and seek. Five friends (the husky, Pagi, the
 * mouse, the lizard and the red octopus) hide behind the furniture; a tap on a
 * hiding place wiggles it, and a friend hiding there pops out giggling: 1 star.
 * One friend at a time peeks out (ears or tail show, its place rustles); if it
 * isn't tapped within `wait` seconds it scurries, giggling and in plain sight, to
 * another free place. Nothing is ever lost: no fail sound, no points taken, no
 * wrong taps (an empty place just wiggles). When all five are found they cheer
 * together (+2 stars), then run off and hide again.
 *
 * Registers the 'house' scene with window.Core (home: 'street', no day/night
 * cycle: it is indoors, music: 'house').
 * Uses window.Art, window.House (js/art-house.js), window.Friends and
 * window.Characters; audio only through Core.snd ('rustle', 'scurry', 'giggle',
 * 'star', 'fanfare', 'say' 'trovato' at most every 3 s / 'cucu' at most every
 * 6 s, when a friend starts to peek / 'bravissima').
 *
 * Modes (st.mode), one round:
 *   hide   the friends run from Bella (or from the door, on enter) to random
 *          distinct places (1.2 s, 'scurry') -> seek
 *   seek   every 0.8..1.5 s, when nobody peeks or runs, one unfound hidden friend
 *          starts to peek ('rustle', the place wiggles a little, "Cucù!"): it rises
 *          0.5 of its hiding height. Its peekT counts up; at peekT >= st.wait it
 *          scurries to a free place ('scurry', 'giggle', 0.9 s, drawn over
 *          everything) and stops peeking; st.inRow = 0.
 *          A tap on a place wiggles it ('rustle'). A friend hiding there, peeking or
 *          not, is found (also in the first 0.25 s of its scurry, from the place it
 *          left: it never both runs and is found): it pops up ('giggle',
 *          "Trovato!"), 1 star flies to the star row (Core.addStars(1), once per
 *          find), and it runs to stand next to Bella, waving, until the round ends.
 *          Bella is happy. st.inRow + 1, st.wait = max(2.5, 5 - 0.5 inRow).
 *   party  all five found: they all hop and cheer, confetti, 'fanfare',
 *          "Bravissima!", +2 stars. After 3 s -> hide, a new round (st.round + 1)
 *          with wait = 5 and inRow = 0.
 *   off    while another scene runs. Leaving mid-round keeps the stars already
 *          given; coming back starts a fresh round.
 *
 * Layout (CSS px; resize()):
 *   u = min(M, 0.9 H), the size unit: House.build(u, DPR); House.room(W, H)
 *   rows   one row of 8 places when W / H > 1.5, at 0.64 H; else two rows of 4, at
 *          0.46 H (curtain, sofa, wardrobe, plant: against the wall) and 0.7 H
 *          (basket, table, armchair, toybox). Each row spans the width (8 px
 *          margins); each place is scaled by k = min(1, 0.94 slot width / w,
 *          room above / h) (room above: the row's y - max(70, 0.08 H) for the back
 *          row, 1.25 x the gap between the rows for the front row).
 *          Tap target: centered on the hiding friend, radius clamp(0.5 max(w k,
 *          1.6 hide.h k), 0.075 M, half the slot width); a tap anywhere on the
 *          place's box counts too (the nearest center wins).
 *   Bella  min(0.42 u, 0.27 H) tall, by the door on the left, her hooves at the
 *          front line frontY = H - max(6, 0.03 H), facing right; drawn from the
 *          star game's flying-scale ppu (min(0.42 H, 0.52 W) / Characters.H * DPR):
 *          Characters keeps 2 cached scales.
 *   friends Friends.build(0.22 u) and Friends.buildOctopus(0.22 u) in enter() and
 *          resize() (both no-ops at the same size). Hiding: scaled to the place's
 *          hide.h x k (the octopus 0.85 of that). Found: full size, in a line to
 *          Bella's right on frontY, every other one 0.02 u higher, closer together
 *          on narrow screens.
 *   star row  10 slots at the top left (the stars of this visit), a big star per 10
 *
 * Debug hook window.__bella.house:
 *   st          {mode, found, inRow, wait, round, enters, scurrying} (tests may set
 *               wait and inRow)
 *   spots()     [{id, kind, x, y, r, friend, peek, peekT, state, wig}] on screen: the
 *               tap center and radius; friend: the kind hiding there (or running
 *               there) or null; state 'hidden'|'peek'|'scurry'|null
 *   peek(id)    that place's hiding friend starts to peek now (any other peeker
 *               hides again); true when it took
 *   friendH(), octoH()   the friend and octopus sizes Friends has cached now
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core, CHR = window.Characters, House = window.House, Friends = window.Friends;
  var TAU = Math.PI * 2;
  var snd = Core.snd;

  var KINDS = ['husky', 'pagi', 'mouse', 'lizard', 'octopus'];
  var SPOTS = House.SPOTS;
  var ROWS2 = [[1, 0, 3, 4], [2, 5, 6, 7]];          // indices into SPOTS: back row, front row
  var ROW1 = [[1, 2, 0, 5, 3, 6, 4, 7]];
  var T = { hide: 1.2, scurry: 0.9, grace: 0.25, pop: 0.35, join: 0.6, party: 3, rise: 0.25 };
  var WAIT0 = 5, WAIT_MIN = 2.5, WAIT_STEP = 0.5, PEEK_UP = 0.5, OCTO_K = 0.85;
  var FOOT = 1050;          // rig y of Bella's hooves at rest (Characters.H = 1100)

  var W = 0, H = 0, M = 0, DPR = 1, reduced = false;
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function backOut(p) { p = clamp(p, 0, 1) - 1; return 1 + p * p * (2.6 * p + 1.6); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ------------------------------------------------------------------ state
  var st = { mode: 'off', mt: 0, found: 0, inRow: 0, wait: WAIT0, round: 0, enters: 0, scurrying: 0 };
  var t = 0, nextPeek = 1, lastTrovato = -9, lastCucu = -9, hap = 0;
  // A friend: state 'run' (to its place at the round start) | 'hidden' | 'peek' |
  // 'scurry' (from place `from` to place `spot`) | 'pop' (out of place `spot`, then
  // to its line slot) | 'wave' (in the line by Bella). st0: where a run starts
  // ({kind: 'door'} or {kind: 'slot', i}). peekK: 0..1, how far it is raised.
  var friends = KINDS.map(function (k) {
    return { kind: k, state: 'run', spot: -1, from: -1, slot: -1, start: null, t: 0, dur: 1, peekT: 0, peekK: 0, ph: Math.random() * TAU };
  });
  var spots = SPOTS.map(function (k, i) { return { id: i, kind: k, x: 0, y: 0, k: 1, cx: 0, cy: 0, r: 1, box: null, wig: 0, wdir: 1 }; });
  var parts = [], flying = [];
  var visit = 0, shown = 0, slotPop = [];
  var L = { u: 1 };
  var S = {};
  var bpose = { t: 0, run: 0, walk: 0, stride: 0, wave: 0, happy: 0, look: 0, glow: 0.5, face: undefined };
  var fpose = { t: 0, state: 'sit', p: 0 };
  var opose = { t: 0, side: 'red', flip: 0, giggle: 0 };

  // ----------------------------------------------------------------- layout
  function layout() {
    var u = L.u, rows = W / H > 1.5 ? ROW1 : ROWS2, top = Math.max(70, 0.08 * H);
    var ys = rows.length === 1 ? [0.64 * H] : [0.46 * H, 0.7 * H];
    rows.forEach(function (row, ri) {
      var n = row.length, slotW = (W - 16) / n;
      var room = ri === 0 ? ys[0] - top : (ys[1] - ys[0]) * 1.25;
      row.forEach(function (si, j) {
        var sp = spots[si], a = House.spot(sp.kind), w = a.front.w, h = a.front.h;
        var k = Math.min(1, slotW * 0.94 / w, room / h);
        sp.x = 8 + slotW * (j + 0.5); sp.y = ys[ri]; sp.k = k;
        sp.cx = sp.x + a.hide.x * k;
        sp.cy = sp.y + (a.hide.y - 0.6 * a.hide.h) * k;
        sp.r = clamp(0.5 * Math.max(w * k, 1.6 * a.hide.h * k), 0.075 * M, slotW / 2);
        sp.cy = clamp(sp.cy, sp.r + 2, H - sp.r - 2);
        var bw = Math.max(w * k, 0.14 * M), bh = Math.max(h * k, 0.14 * M);
        sp.box = { x: sp.x - bw / 2, y: sp.y - bh, w: bw, h: bh };
      });
    });
    L.frontY = H - Math.max(6, 0.03 * H);
    L.heroH = Math.min(0.42 * u, 0.27 * H);
    L.heroX = Math.max(0.04 * W, 8) + 0.45 * L.heroH;
    var fw = 0.2 * u, x0 = L.heroX + 0.45 * L.heroH + 0.5 * fw;
    L.lineX0 = x0;
    L.lineStep = Math.max(0.1 * fw, Math.min(fw * 0.95, (W - 8 - fw / 2 - x0) / (KINDS.length - 1)));
  }
  function spotAt(x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i], d = Math.hypot(x - sp.cx, y - sp.cy), b = sp.box;
      var on = d <= sp.r * 1.1 || (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (on && d < bd) { bd = d; best = sp; }
    }
    return best;
  }
  // Where a friend's bottom center is, and its scale (1 = 0.22 u tall).
  var P = { x: 0, y: 0, s: 1 };
  function atSpot(i, up) {
    var sp = spots[i], a = House.spot(sp.kind), k = sp.k;
    P.x = sp.x + a.hide.x * k;
    P.y = sp.y + a.hide.y * k - (up || 0) * PEEK_UP * a.hide.h * k;
    P.s = a.hide.h * k / L.friendH;
    return P;
  }
  function atSlot(i) {
    P.x = L.lineX0 + i * L.lineStep;
    P.y = L.frontY - (i % 2) * 0.02 * L.u;
    P.s = 1;
    return P;
  }
  function atDoor() {
    P.x = L.heroX; P.y = L.frontY; P.s = 0.9;
    return P;
  }
  function atStart(f) {
    if (f.start && f.start.kind === 'slot') return atSlot(f.start.i);
    return atDoor();
  }

  // ------------------------------------------------------------------ flow
  function setMode(m) { st.mode = m; st.mt = 0; }
  function occupied(i) {
    for (var j = 0; j < friends.length; j++) {
      var f = friends[j];
      if (f.spot === i && (f.state === 'run' || f.state === 'hidden' || f.state === 'peek' || f.state === 'scurry')) return true;
    }
    return false;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  // A new round: everyone runs from where they are (the door on enter, else their
  // place in the line) to random distinct places.
  function startRound(fromDoor) {
    var order = shuffle(SPOTS.map(function (k, i) { return i; }));
    friends.forEach(function (f, i) {
      f.start = fromDoor ? { kind: 'door' } : { kind: 'slot', i: f.slot >= 0 ? f.slot : i };
      f.state = 'run'; f.spot = order[i]; f.from = -1; f.slot = -1;
      f.t = 0; f.dur = T.hide * rnd(0.8, 1); f.peekT = 0; f.peekK = 0;
    });
    st.found = 0; st.inRow = 0; st.wait = WAIT0; st.round++; st.scurrying = 0;
    snd('scurry');
    setMode('hide');
  }
  function stopPeeking() {
    friends.forEach(function (f) { if (f.state === 'peek') { f.state = 'hidden'; f.peekT = 0; } });
  }
  function startPeek(f) {
    stopPeeking();
    f.state = 'peek'; f.peekT = 0;
    var sp = spots[f.spot];
    sp.wig = Math.max(sp.wig, 0.5); sp.wdir = Math.random() < 0.5 ? -1 : 1;
    snd('rustle');
    if (t - lastCucu >= 6) { lastCucu = t; snd('say', 'cucu'); }
  }
  function startScurry(f) {
    var free = [];
    for (var i = 0; i < spots.length; i++) if (i !== f.spot && !occupied(i)) free.push(i);
    if (!free.length) { f.state = 'hidden'; f.peekT = 0; return; }
    f.from = f.spot;
    f.spot = free[(Math.random() * free.length) | 0];
    f.state = 'scurry'; f.t = 0; f.dur = T.scurry; f.peekT = 0;
    st.inRow = 0;
    snd('scurry'); snd('giggle');
    nextPeek = rnd(0.8, 1.5);
  }
  function wiggle(sp) {
    sp.wig = 1; sp.wdir = Math.random() < 0.5 ? -1 : 1;
    snd('rustle');
  }
  // The friend in place i (hiding or peeking there, or just leaving it), or null.
  function hiderAt(i) {
    for (var j = 0; j < friends.length; j++) {
      var f = friends[j];
      if ((f.state === 'hidden' || f.state === 'peek') && f.spot === i) return f;
      if (f.state === 'scurry' && f.from === i && f.t < T.grace) return f;
    }
    return null;
  }
  function find(f, i) {
    if (st.mode !== 'seek') return;
    if (f.state === 'scurry') { f.spot = f.from; nextPeek = rnd(0.8, 1.5); }
    f.from = -1;
    f.state = 'pop'; f.t = 0; f.dur = T.pop + T.join; f.peekT = 0;
    f.slot = st.found;
    st.found++;
    st.inRow++;
    st.wait = Math.max(WAIT_MIN, WAIT0 - WAIT_STEP * st.inRow);
    Core.addStars(1);
    hap = 1;
    snd('giggle');
    if (t - lastTrovato >= 3) { lastTrovato = t; snd('say', 'trovato'); }
    var p = atSpot(f.spot, 1);
    sparkle(p.x, p.y - L.friendH * p.s * 0.6, 8);
    flying.push({ x0: p.x, y0: p.y - L.friendH * p.s * 0.6, t: 0, dur: 0.8, slot: visit++ });
    if (st.found >= KINDS.length) party();
  }
  function party() {
    setMode('party');
    Core.addStars(2);
    for (var i = 0; i < 2; i++) flying.push({ x0: W / 2, y0: H * 0.4, t: -0.3 - i * 0.15, dur: 0.8, slot: visit++ });
    hap = 1;
    confetti();
    snd('fanfare');
    Core.after(0.8, function () { snd('say', 'bravissima'); });
  }

  // ---------------------------------------------------------------- input
  function pointer(type, p) {
    if (type !== 'down' || st.mode === 'off') return;
    var sp = spotAt(p.x, p.y);
    if (!sp) return;
    wiggle(sp);
    var f = hiderAt(sp.id);
    if (f) find(f, sp.id);
  }

  // ------------------------------------------------------------ particles
  function addPart(q) {
    if (parts.length > 200) parts.shift();
    parts.push(q);
  }
  function sparkle(x, y, n) {
    if (reduced) n = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = L.u * rnd(0.1, 0.35);
      addPart({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.4, 0.7) });
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
      } else { q.x += q.vx * dt; q.y += q.vy * dt; }
      parts[n++] = q;
    }
    parts.length = n;
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

  // ------------------------------------------------------------------ update
  function update(dt) {
    t += dt;
    st.mt += dt;
    hap = Math.max(0, hap - dt / 1.2);
    var i, f, run = 0;
    for (i = 0; i < spots.length; i++) spots[i].wig = Math.max(0, spots[i].wig - dt / 0.5);
    for (i = 0; i < friends.length; i++) {
      f = friends[i];
      f.peekK = f.state === 'peek' ? Math.min(1, f.peekK + dt / T.rise) : Math.max(0, f.peekK - dt / T.rise);
      if (f.state === 'run' || f.state === 'scurry' || f.state === 'pop') {
        f.t += dt;
        if (f.t >= f.dur) {
          if (f.state === 'pop') f.state = 'wave';
          else { f.state = 'hidden'; f.from = -1; f.peekK = 0; }
          f.t = 0;
        }
      } else if (f.state === 'peek') {
        f.peekT += dt;
        if (f.peekT >= st.wait && st.mode === 'seek') startScurry(f);
      }
      if (f.state === 'scurry') run++;
    }
    st.scurrying = run;
    if (st.mode === 'hide') {
      var all = true;
      for (i = 0; i < friends.length; i++) if (friends[i].state === 'run') all = false;
      if (all && st.mt >= T.hide * 0.8) { setMode('seek'); nextPeek = rnd(0.8, 1.5); }
    } else if (st.mode === 'seek') {
      var busy = false, hidden = [];
      for (i = 0; i < friends.length; i++) {
        f = friends[i];
        if (f.state === 'peek' || f.state === 'scurry') busy = true;
        else if (f.state === 'hidden') hidden.push(f);
      }
      if (!busy) {
        nextPeek -= dt;
        if (nextPeek <= 0 && hidden.length) { startPeek(hidden[(Math.random() * hidden.length) | 0]); nextPeek = rnd(0.8, 1.5); }
      }
    } else if (st.mode === 'party') {
      if (st.mt >= T.party) startRound(false);
    }
    updateParts(dt);
  }

  // ------------------------------------------------------------------ render
  function drawSpr(g, s, x, y, k) { g.drawImage(s.c, x - s.w * k / 2, y - s.h * k, s.w * k, s.h * k); }
  // A friend with its bottom center at (x, y), s x its built size; dir 1 faces right.
  function drawFriend(g, f, x, y, s, state, p, dir, giggle) {
    g.save();
    g.translate(x, y);
    if (dir > 0) g.scale(-s, s); else g.scale(s, s);
    if (f.kind === 'octopus') {
      opose.t = t + f.ph; opose.giggle = giggle;
      g.scale(OCTO_K, OCTO_K);
      Friends.octopus(g, 0, -L.friendH / 2, opose);
    } else {
      fpose.t = t + f.ph; fpose.state = state; fpose.p = p;
      Friends.draw(g, f.kind, 0, 0, fpose);
    }
    g.restore();
  }
  function drawSpots(g) {
    for (var i = 0; i < spots.length; i++) drawSpot(g, spots[i]);
  }
  function drawSpot(g, sp) {
    var a = House.spot(sp.kind), k = sp.k, rot = 0;
    if (sp.wig > 0) rot = sp.wdir * Math.sin(sp.wig * Math.PI * 5) * 0.06 * sp.wig * (reduced ? 0.4 : 1);
    g.save();
    g.translate(sp.x, sp.y);
    if (rot) g.rotate(rot);
    drawSpr(g, a.back, 0, 0, k);
    g.restore();
    for (var j = 0; j < friends.length; j++) {
      var f = friends[j];
      if (f.spot !== sp.id || f.peekK <= 0.01 || (f.state !== 'peek' && f.state !== 'hidden')) continue;
      var p = atSpot(sp.id, smooth(f.peekK)), bob = reduced ? 0 : Math.sin(t * 5 + f.ph) * 0.015 * L.u * p.s;
      drawFriend(g, f, p.x, p.y + bob, p.s, 'sit', 0, -1, 0);
    }
    g.save();
    g.translate(sp.x, sp.y);
    if (rot) g.rotate(rot);
    drawSpr(g, a.front, 0, 0, k);
    g.restore();
  }
  function drawHero(g) {
    var k = L.heroH / CHR.H;
    bpose.t = t; bpose.happy = Math.min(1, hap * 1.5); bpose.wave = st.mode === 'party' ? 1 : 0;
    g.save();
    g.translate(L.heroX, L.frontY);
    g.scale(k, k);
    g.translate(-CHR.W / 2, -FOOT);
    CHR.draw(g, bpose, L.ppu);
    g.restore();
  }
  function drawLine(g) {
    // the found friends by Bella, back ones (higher) first
    for (var pass = 1; pass >= 0; pass--) {
      for (var i = 0; i < friends.length; i++) {
        var f = friends[i];
        if (f.state !== 'wave' || f.slot % 2 !== pass) continue;
        var p = atSlot(f.slot), hop = 0;
        if (st.mode === 'party' && !reduced) hop = Math.abs(Math.sin(t * 6 + f.slot)) * 0.06 * L.u;
        drawFriend(g, f, p.x, p.y - hop, 1, 'happy', (t * 0.8 + f.slot * 0.2) % 1, -1, st.mode === 'party' ? 1 : 0.4);
      }
    }
  }
  // Friends on the move, drawn over everything: running to hide, scurrying, popping out.
  function drawMoving(g) {
    for (var i = 0; i < friends.length; i++) {
      var f = friends[i], s = f.state;
      if (s !== 'run' && s !== 'scurry' && s !== 'pop') continue;
      var x0, y0, s0, x1, y1, s1, pr, hopH, state = 'walk', giggle = 1;
      if (s === 'pop') {
        var a = atSpot(f.spot, 1);
        x0 = a.x; y0 = a.y; s0 = a.s;
        if (f.t < T.pop) {               // out of the place, with a bounce
          var up = backOut(f.t / T.pop);
          drawFriend(g, f, x0, y0 - up * L.friendH * s0 * 0.5, s0, 'happy', f.t / T.pop, -1, 1);
          continue;
        }
        y0 -= L.friendH * s0 * 0.5;
        var b = atSlot(f.slot);
        x1 = b.x; y1 = b.y; s1 = b.s;
        pr = (f.t - T.pop) / T.join; hopH = 0.25 * L.u; state = 'happy';
      } else {
        var st0 = s === 'scurry' ? atSpot(f.from, smooth(f.peekK)) : atStart(f);
        x0 = st0.x; y0 = st0.y; s0 = st0.s;
        var e = atSpot(f.spot, 0);
        x1 = e.x; y1 = e.y; s1 = e.s;
        pr = f.t / f.dur; hopH = 0.05 * L.u;
      }
      var q = smooth(pr), x = lerp(x0, x1, q), y = lerp(y0, y1, q), sc = lerp(s0, s1, q);
      if (s === 'pop') y -= Math.sin(Math.PI * clamp(pr, 0, 1)) * hopH;
      else y -= Math.abs(Math.sin(pr * Math.PI * 4)) * hopH * sc;
      drawFriend(g, f, x, y, sc, state, (pr * 4) % 1, x1 >= x0 ? 1 : -1, giggle);
    }
  }
  // the star row: 10 slots at the top left (clear of #home and #mute), and under
  // them one big star per 10
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
        Art.drawSprite(g, S.spark, q.x, q.y, 0.5 + 0.7 * (1 - f), 1 - f, q.life * 4);
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
      var fl = flying[i];
      if (fl.t < 0) continue;
      var p = smooth(fl.t / fl.dur), to = slotPos(fl.slot % 10);
      var x = lerp(fl.x0, to.x, p), y = lerp(fl.y0, to.y, p) - Math.sin(Math.PI * p) * L.u * 0.25;
      Art.drawSprite(g, S.star, x, y, lerp(1, S.slotR / S.starR, p), 1, 0);
    }
  }
  function render(g) {
    g.drawImage(L.room, 0, 0, W, H);
    drawSpots(g);
    drawHero(g);
    drawLine(g);
    drawMoving(g);
    drawParts(g);
    drawStarRow(g);
  }

  // ------------------------------------------------------------------ resize
  function buildFriends() {
    Friends.build(L.friendH, DPR);
    Friends.buildOctopus(L.friendH, DPR);
  }
  function resize() {
    sync();
    var u = L.u = Math.min(M, 0.9 * H);
    House.build(u, DPR);
    L.room = House.room(W, H);
    L.friendH = 0.22 * u;
    layout();
    // the star game's flying scale, as js/scenes/street.js: no third Characters scale
    L.ppu = Math.min(H * 0.42, W * 0.52) / CHR.H * DPR;
    CHR.prerender(L.ppu);
    if (st.mode !== 'off') buildFriends();
    S.starR = clamp(M * 0.05, 16, 34);
    S.star = Art.starSprite(S.starR, DPR, { face: true });
    S.spark = Art.starSprite(Math.max(5, u * 0.02), DPR, { glow: false });
    var rowW = Math.max(100, W - 12 - 170);           // left of #home and #mute
    S.slotStep = Math.min(clamp(M * 0.03, 10, 17) * 2.5, rowW / 10);
    S.slotR = S.slotStep / 2.5;
    S.bigR = clamp(M * 0.035, 12, 22);
    S.bigMax = Math.max(1, Math.floor(rowW / (2.2 * S.bigR)));
    S.bigStar = Art.starSprite(S.bigR, DPR, { glow: false });
    S.slotFull = Art.starSprite(S.slotR, DPR, { glow: false });
    S.slotEmpty = Art.starSprite(S.slotR, DPR, { empty: true, glow: false });
  }

  Core.register('house', {
    home: 'street',
    clock: false,
    music: 'house',
    enter: function () {
      sync();
      st.enters++;
      buildFriends();             // another place may have cached its own friend size
      t = 0; hap = 0; lastTrovato = -9; lastCucu = -9;
      parts.length = 0; flying.length = 0;
      visit = 0; shown = 0;
      for (var i = 0; i < 10; i++) slotPop[i] = 9;
      spots.forEach(function (sp) { sp.wig = 0; });
      st.round = 0;
      friends.forEach(function (f) { f.slot = -1; });
      startRound(true);
    },
    exit: function () {
      parts.length = 0; flying.length = 0;
      friends.forEach(function (f) { f.state = 'run'; f.spot = -1; f.from = -1; f.slot = -1; f.peekK = 0; });
      st.scurrying = 0;
      setMode('off');
    },
    update: function (dt) { sync(); update(dt); },
    render: function (g) { sync(); render(g); },
    pointer: function (type, p) { sync(); pointer(type, p); },
    resize: resize
  });

  if (window.__bella === undefined) window.__bella = {};
  window.__bella.house = {
    st: st,
    spots: function () {
      return spots.map(function (sp) {
        var who = null;
        for (var j = 0; j < friends.length; j++) {
          var f = friends[j];
          if (f.spot === sp.id && (f.state === 'hidden' || f.state === 'peek' || f.state === 'scurry')) who = f;
        }
        return {
          id: sp.id, kind: sp.kind, x: sp.cx, y: sp.cy, r: sp.r,
          friend: who ? who.kind : null, peek: !!who && who.state === 'peek', peekT: who ? who.peekT : 0,
          state: who ? who.state : null, wig: sp.wig
        };
      });
    },
    peek: function (id) {
      if (st.mode !== 'seek') return false;
      for (var j = 0; j < friends.length; j++) {
        var f = friends[j];
        if (f.spot === id && (f.state === 'hidden' || f.state === 'peek')) { startPeek(f); return true; }
      }
      return false;
    },
    friendH: function () { return Friends.built().h; },
    octoH: function () { return Friends.built().octoH; }
  };
})();
