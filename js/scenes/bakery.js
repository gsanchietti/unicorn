/* scenes/bakery.js - the bakery: friends come in one at a time with a wish, Bongo
 * bakes a cake, the child decorates it with cream and toppings, gives it
 * (taps the friend or the big give button), and the friend eats it happily and gives stars. Every cake is loved: there is
 * no wrong cake and no timer. The loop repeats until the home button.
 *
 * Registers the 'bakery' scene with window.Core (home: 'street', no day/night
 * cycle: the room has its own lamp light, music: 'bakery').
 * Uses window.Art, window.Bakery (js/art-bakery.js), window.Friends (js/friends.js)
 * and window.Characters (Characters.drawBongo when it exists, else a placeholder
 * teddy); audio only through Core.snd ('ding', 'squish', 'plop', 'bell', 'munch',
 * 'bubble', 'star', 'fanfare', 'say' 'chebuona' / 'bravissima' / 'grazie').
 *
 * Modes (st.mode), one friend visit:
 *   arrive    the friend walks in from the right (2 s) to the stool and sits; the
 *             wish bubble pops up with one random topping (0.4 s) -> pick
 *   pick      three shape buttons; a tap -> oven
 *   oven      the oven opens with a 'ding' (0.4 s), the cake slides out onto the
 *             counter (1.2 s) -> decorate
 *   decorate  4 creams, 6 toppings and the give button. The selected tool is ringed; it
 *             starts on cream:pink.
 *               cream:   a finger moving over the cake stamps Bakery.creamStamp into
 *                        the cake's own canvas (on the input event, never per frame),
 *                        clipped by the base's clip(); 'squish' at most every 0.15 s
 *               topping: a tap on the cake drops it there (cake space 0..1, bounce
 *                        0.3 s, 'plop', sparkle). Off the cake: nothing. Past 80
 *                        toppings a tap only sparkles.
 *               give:    the 'serve' button (a cream disk: the cake, three dots, the
 *                        friend's head) or a pointer DOWN on the friend (friendRect) ->
 *                        'bell', the bell sprite rings -> serve. Only 'down' serves; a drag
 *                        or an up never does; a down on the cake itself decorates. A plain
 *                        cake is loved too. From the first decoration the button pulses
 *                        (1 +- 0.05 at 1.5 Hz; a still glow ring with reduced motion) and the
 *                        friend hops softly (about 1 Hz, transforms only).
 *               hint:    after 4 s without input (10 s with nothing on the cake) the tap
 *                        hint (Art.drawTapHint) shows on the friend and on the give button,
 *                        alternating every 1.5 s; any pointer down hides it (st.hint).
 *   serve     Bongo carries the cake on a tray to the friend (1.5 s) -> eat
 *   eat       the friend eats (2.5 s, crumbs, 'munch', "Che buona!"), then is happy
 *             (1 s wiggle): 3 stars fly to the star row and Core.addStars(3); with
 *             the wish topping on the cake +2, confetti and "Bravissima!"; "Grazie!";
 *             the cake is saved -> leave. Stars are given exactly once per cake.
 *   leave     the friend walks out to the right (1.5 s); the next friend in
 *             Friends.KINDS order comes -> arrive
 *   off       while another scene runs. Leaving mid-cake gives no stars and loses
 *             nothing; coming back starts a fresh visit (the unserved friend again).
 *
 * Layout (CSS px; resize()):
 *   u = min(M, 0.9 H), the size unit; Bakery.build(u, DPR)
 *   counter top ctY = Bakery.COUNTER * H = 0.62 H; the counter fills the screen below
 *   oven at x = max(0.1 W, 0.15 u) on the counter; Bongo stands at max(0.3 W, oven
 *   + 0.2 u) behind the counter, 0.34 u tall, feet 0.06 u below the counter top
 *   cake (0.3..0.36 u wide) centered at max(0.56 W, Bongo + 0.28 u), on the counter;
 *   the bell sprite 0.21 u left of it (only a picture now)
 *   stool and friend (0.34 u tall) at W - max(0.14 W, 0.14 u), the friend sitting
 *   0.1 u above the counter top; the cake is served at stool - 0.14 u, in front of
 *   the friend, and eaten from the friend's side
 *   the wish bubble's tail 0.04 u below the friend's head, 0.12 u left of it (moved
 *   left, clear of #home and #mute, when it reaches the top 90 px)
 *   buttons: the band between ctY + 0.05 u and H - max(10, 0.03 M); pick: 3 buttons
 *   r <= 0.1 M; decorate: the give button first, R = min(0.105 M, room right of the cake)
 *   >= 0.08 M, centered at x = stool x (pushed right, clear of the cake, in portrait), y =
 *   friend's feet + R; then the tools below it: one row (creams | toppings) or two rows
 *   (creams / toppings), whichever gives the bigger radius, r <= min(0.09 M, 0.92 R); aimed at
 *   r >= 0.06 M (0.12 M across)
 *   star row (the stars of this visit, 10 slots, a big star per 10) at the top left
 *   the window (Bakery.windowRect) shows the last 6 saved cakes as thumbnails in one
 *   cached canvas, built on enter, on resize and when a cake is saved
 * Friends.build(0.34 u) runs in enter() too (a no-op at the cached size): the house
 * and the pond cache their own friend sizes.
 * Bongo and the friends are drawn at the star game's flying-scale ppu
 * (min(0.42 H, 0.52 W) / Characters.H * DPR): Characters keeps 2 cached scales.
 * Characters.drawBongo(g, pose, ppu): bottom center at the origin, facing right;
 * the scene scales the context by 0.34 u / Characters.BONGO_H (mirrored to walk
 * left). pose = {t, walk, stride, carry, face}.
 *
 * Save data: 'bella.cakes', the last 6 served cakes as JSON [{s, c, t}], s the shape,
 * c the cream used most ('' for none), t up to 40 toppings [[kind, x, y], ...] with
 * x, y in cake space 0..1. Read in try/catch; corrupt data counts as [].
 *
 * Debug hook window.__bella.bakery:
 *   st          {mode, mt, friend, wish, shape, tool, toppings: [{k, x, y, a}],
 *               creamDabs, served, enters, saved} (mt: seconds in this mode;
 *               x, y in cake space; served: cakes served since the page loaded;
 *               enters: enter() calls; saved: cakes in the window; hint: the tap
 *               hint is showing)
 *   buttons()   [{id, x, y, r}] of the buttons shown now (none outside pick/decorate):
 *               shape:* in pick; cream:*, top:* and serve in decorate
 *   friendRect() {x, y, w, h} of the friend on screen, or null while away (off)
 *   cakeRect()  {x, y, w, h} of the cake on screen (null before a cake is picked)
 *   friendH()   the friend height Friends has cached now (0.34 u while here)
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core, CHR = window.Characters, Bakery = window.Bakery, Friends = window.Friends;
  var TAU = Math.PI * 2;
  var snd = Core.snd;

  var SHAPES = Bakery.SHAPES, CREAMS = Bakery.CREAMS, TOPS = Bakery.TOPPINGS;
  var MAX_TOPS = 80, KEEP_CAKES = 6, KEEP_TOPS = 40;
  var T = { arrive: 2, sit: 0.4, door: 0.4, slide: 1.2, serve: 1.5, eat: 2.5, happy: 1, leave: 1.5 };
  var BONGO_H = 480;          // Bongo's rig height until Characters.BONGO_H exists

  var W = 0, H = 0, M = 0, DPR = 1, reduced = false;
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function backOut(p) { p = clamp(p, 0, 1) - 1; return 1 + p * p * (2.6 * p + 1.6); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ------------------------------------------------------------------ state
  var st = {
    mode: 'off', mt: 0, friend: Friends.KINDS[0], wish: null, shape: null, tool: 'cream:pink',
    toppings: [], creamDabs: 0, served: 0, enters: 0, saved: 0, hint: false
  };
  var idle = 0;                // seconds without input while decorating
  var friendI = 0, t = 0;
  var fr = { x: 0, stride: 0, dir: -1, state: 'walk', p: 0, sit: 0 };    // the friend
  var bo = { x: 0, dir: 1, walk: 0, stride: 0, carry: 0 };               // Bongo
  var bpose = { t: 0, walk: 0, stride: 0, carry: 0, face: undefined };
  var fpose = { t: 0, state: 'walk', p: 0 };
  var cake = { x: 0, lift: 0, scale: 1, eat: 0, show: 0 };
  var base = null, cakeCv = null, cakeG = null, dabsBy = {};
  var hitG = Art.makeCanvas(1, 1).getContext('2d');
  var cues = {};               // things that happen once per cake: ding, chebuona, paid
  var strokes = new Map();     // pointer id -> {x, y, color}
  var lastSquish = -1, munchT = 0, crumbT = 0;
  var ovenOpen = 0, bellRing = 0, wishK = 0;
  var parts = [], flying = [];
  var visit = 0, shown = 0, slotPop = [];
  var pops = {};               // button id -> age of its tap pop
  var cakes = [], thumbs = null;
  var L = { u: 1, ctY: 0 };
  var S = {};

  // ------------------------------------------------------------------ cakes
  function validTop(q) {
    return Array.isArray(q) && TOPS.indexOf(q[0]) >= 0 && isFinite(q[1]) && isFinite(q[2]) &&
      q[1] >= 0 && q[1] <= 1 && q[2] >= 0 && q[2] <= 1;
  }
  function loadCakes() {
    var list = [];
    try {
      var raw = Core.load('bella.cakes');
      var v = raw ? JSON.parse(raw) : [];
      if (Array.isArray(v)) list = v;
    } catch (e) { list = []; }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || typeof o !== 'object' || SHAPES.indexOf(o.s) < 0) continue;
      out.push({
        s: o.s, c: CREAMS.indexOf(o.c) >= 0 ? o.c : '',
        t: (Array.isArray(o.t) ? o.t.filter(validTop) : []).slice(0, KEEP_TOPS).map(function (q) { return [q[0], +q[1], +q[2]]; })
      });
    }
    cakes = out.slice(-KEEP_CAKES);
    st.saved = cakes.length;
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function saveCake() {
    var best = '', most = 0;
    CREAMS.forEach(function (c) { if ((dabsBy[c] || 0) > most) { most = dabsBy[c]; best = c; } });
    cakes.push({
      s: st.shape, c: best,
      t: st.toppings.slice(0, KEEP_TOPS).map(function (q) { return [q.k, r3(q.x), r3(q.y)]; })
    });
    if (cakes.length > KEEP_CAKES) cakes = cakes.slice(-KEEP_CAKES);
    Core.store('bella.cakes', JSON.stringify(cakes));
    st.saved = cakes.length;
    buildThumbs();
  }
  // The window's thumbnails: every saved cake drawn small into one cached canvas.
  function buildThumbs() {
    var r = L.win;
    thumbs = null;
    if (!r || !cakes.length) return;
    var c = Art.makeCanvas(r.w * DPR, r.h * DPR), g = c.getContext('2d');
    g.scale(DPR, DPR);
    var slot = r.w / KEEP_CAKES, maxW = slot * 0.82, maxH = r.h * 0.5, n = cakes.length;
    for (var i = 0; i < n; i++) {
      var ck = cakes[i], b = Bakery.cakeBase(ck.s), k = Math.min(maxW / b.w, maxH / b.h);
      var w = b.w * k, h = b.h * k, x = r.w / 2 + (i - (n - 1) / 2) * slot - w / 2, y = r.h * 0.96 - h;
      g.save();
      g.translate(x, y);
      g.drawImage(b.c, 0, 0, w, h);
      var px = w / b.c.width;              // base pixel -> thumbnail CSS px
      if (ck.c) {
        g.save();
        g.scale(px, px);
        b.clip(g);
        var cs = Bakery.creamStamp(ck.c), d = 2 * cs.r * b.c.width / b.w;
        for (var sx = 0; sx < b.c.width; sx += d * 0.4) {
          for (var sy = 0; sy < b.c.height * 0.45; sy += d * 0.4) g.drawImage(cs.c, sx - d / 2, sy - d / 2, d, d);
        }
        g.restore();
      }
      for (var j = 0; j < ck.t.length; j++) {
        var q = ck.t[j], tp = Bakery.topping(q[0]);
        g.drawImage(tp.c, q[1] * w - tp.w * k / 2, q[2] * h - tp.h * k / 2, tp.w * k, tp.h * k);
      }
      g.restore();
    }
    thumbs = c;
  }

  // the cake's own canvas: the base, then cream stamped into it
  function newCake(shape) {
    st.shape = shape;
    st.toppings = [];
    st.creamDabs = 0;
    st.tool = 'cream:pink';
    dabsBy = {};
    base = Bakery.cakeBase(shape);
    cakeCv = Art.makeCanvas(base.c.width, base.c.height);
    cakeG = cakeCv.getContext('2d');
    cakeG.drawImage(base.c, 0, 0);
  }
  // after a resize: a new base at the new size, the old cake (cream and all) scaled into it
  function refitCake() {
    if (!st.shape || !cakeCv) return;
    base = Bakery.cakeBase(st.shape);
    var c = Art.makeCanvas(base.c.width, base.c.height), g = c.getContext('2d');
    g.drawImage(cakeCv, 0, 0, c.width, c.height);
    cakeCv = c; cakeG = g;
  }

  // ----------------------------------------------------------------- layout
  function cakeBottom() { return L.ctY + L.u * 0.015; }
  function cakeScreen() {
    if (!base) return null;
    var w = base.w * cake.scale, h = base.h * cake.scale;
    return { x: cake.x - w / 2, y: cakeBottom() - cake.lift - h, w: w, h: h };
  }
  function friendBottom() { return L.ctY + lerp(L.u * 0.08, -L.u * 0.1, fr.sit); }
  function bubblePos() {
    var bs = Bakery.sprite('wishBubble'), top = friendBottom() - L.friendH;
    var x = L.stoolX - L.u * 0.12, y = top + L.u * 0.04;
    if (y - bs.h < 90) x = Math.min(x, W - 170 - bs.w / 2);
    var k = clamp((y - 6) / bs.h, 0.5, 1);
    return { x: x, y: y, k: k, w: bs.w * k, h: bs.h * k };
  }

  function rowLayout(rows, r, top) {
    // rows: [[id or null (a gap)], ...]; returns buttons centered in the band
    var out = [], A = top === undefined ? L.ctY + L.u * 0.05 : top, B = H - Math.max(10, M * 0.03);
    var gapY = r * 2.45, mid = (A + B) / 2;
    rows.forEach(function (row, ri) {
      var wRow = 0;
      row.forEach(function (id) { wRow += id ? 2.3 * r : 0.7 * r; });
      var x = W / 2 - wRow / 2, y = mid + (ri - (rows.length - 1) / 2) * gapY;
      row.forEach(function (id) {
        if (!id) { x += 0.7 * r; return; }
        out.push({ id: id, x: x + 1.15 * r, y: y, r: r });
        x += 2.3 * r;
      });
    });
    return out;
  }
  function rowsFit(rows, rMax, top) {
    var A = top === undefined ? L.ctY + L.u * 0.05 : top, B = H - Math.max(10, M * 0.03), pad = 8;
    var widest = 0;
    rows.forEach(function (row) {
      var w = 0;
      row.forEach(function (id) { w += id ? 2.3 : 0.7; });
      widest = Math.max(widest, w);
    });
    var tall = rows.length * 2.3 + (rows.length - 1) * 0.15;
    return Math.min(rMax, (W - 2 * pad) / widest, (B - A) / tall);
  }
  function layoutButtons() {
    var shapes = SHAPES.map(function (s) { return 'shape:' + s; });
    var creams = CREAMS.map(function (c) { return 'cream:' + c; });
    var tops = TOPS.map(function (k) { return 'top:' + k; });
    var pick = [shapes];
    L.pick = rowLayout(pick, rowsFit(pick, M * 0.1));
    // The give button ('serve') sits by the friend, on the counter's edge in front of
    // the stool, clear of the cake (in portrait it is pushed right, to the screen edge).
    // The tool rows go below it.
    var cakeRight = L.cakeX + 0.19 * L.u, A = L.ctY + L.u * 0.05;
    var one = [creams.concat([null], tops)], two = [creams, tops], R, gx, gy, top, rMax, r1, r2, rows;
    function tools() {
      r1 = rowsFit(one, rMax, top); r2 = rowsFit(two, rMax, top);
      return r1 >= r2 ? rowLayout(one, r1, top) : rowLayout(two, r2, top);
    }
    if (H > W) {
      // Portrait: the give button sits in the open band between the counter's cloth edge
      // and the first tool row, under the friend, as big as the band allows.
      R = M * 0.12;
      top = A + 2 * R + 0.02 * H; rMax = M * 0.09;
      rows = tools();
      var rowTop = Infinity;
      rows.forEach(function (b) { rowTop = Math.min(rowTop, b.y - b.r); });
      var band = rowTop - A;
      R = Math.min(M * 0.12, band / 2 - 0.01 * H);
      gx = clamp(L.stoolX, R + 0.03 * W, W - R - 0.03 * W);
      gy = A + band / 2;
      rMax = Math.min(M * 0.09, R * 0.92);
      if (rMax < r1 || rMax < r2) { top = gy + R + 6; rows = tools(); }
    } else {
      // Landscape: by the friend, on the counter's edge in front of the stool; the tools go below it.
      R = Math.max(Math.min(M * 0.105, (W - 10 - cakeRight - 4) / 2), M * 0.08);
      gx = Math.min(Math.max(cakeRight + 4 + R, Math.min(L.stoolX, W - R - 6)), W - R - 6);
      gy = Math.min(L.ctY - 0.08 * L.u + R, H - R - 10);
      top = Math.max(A, gy + R + 6); rMax = Math.min(M * 0.09, R * 0.92);
      rows = tools();
    }
    L.give = { id: 'serve', x: gx, y: gy, r: R };
    L.deco = rows.concat([L.give]);
    buildGiveArt();
  }
  function buttons() {
    if (st.mode === 'pick') return L.pick;
    if (st.mode === 'decorate') return L.deco;
    return [];
  }
  function buttonAt(x, y) {
    var list = buttons(), best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var b = list[i], d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r * 1.15 && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ------------------------------------------------------------------ flow
  function setMode(m) { st.mode = m; st.mt = 0; }
  function pickWish() {
    var w;
    do { w = TOPS[(Math.random() * TOPS.length) | 0]; } while (w === st.wish && TOPS.length > 1);
    return w;
  }
  function startVisit() {
    st.friend = Friends.KINDS[friendI % Friends.KINDS.length];
    st.wish = pickWish();
    st.shape = null; st.toppings = []; st.creamDabs = 0; st.tool = 'cream:pink';
    base = null; cakeCv = null; cakeG = null; dabsBy = {};
    cues = {}; strokes.clear();
    fr.x = W + L.friendH; fr.dir = -1; fr.state = 'walk'; fr.sit = 0; fr.stride = 0;
    cake.lift = 0; cake.scale = 1; cake.eat = 0; cake.show = 0;
    wishK = 0; ovenOpen = 0;
    setMode('arrive');
  }
  function press(b) {
    pops[b.id] = 0;
    if (st.mode === 'pick') {
      newCake(b.id.split(':')[1]);
      cake.x = L.ovenX; cake.show = 0;
      setMode('oven');
      snd('bubble');
    } else if (st.mode === 'decorate') {
      if (b.id === 'serve') {
        giveCake();
      } else {
        st.tool = b.id;
        snd('bubble');
      }
    }
  }
  // The cake goes to the friend: from the give button or a tap on the friend.
  function giveCake() {
    if (st.mode !== 'decorate') return;
    strokes.clear();
    bellRing = 1;
    snd('bell');
    st.hint = false;
    setMode('serve');
  }
  function decorated() { return st.creamDabs > 0 || st.toppings.length > 0; }
  function friendRect() {
    if (st.mode === 'off') return null;
    var w = L.friendH * 0.75, h = L.friendH, x0 = fr.x - w / 2, cs = base && cakeCv && st.mode === 'decorate' ? cakeScreen() : null;
    if (cs && x0 < cs.x + cs.w + 2) x0 = Math.min(cs.x + cs.w + 2, fr.x);   // a cake tap always decorates
    return { x: x0, y: friendBottom() - h, w: fr.x + w / 2 - x0, h: h };
  }
  function wishOn() {
    for (var i = 0; i < st.toppings.length; i++) if (st.toppings[i].k === st.wish) return true;
    return false;
  }
  // The friend is happy: stars (once per cake), the wish bonus, thanks, the cake saved.
  function reward() {
    if (cues.paid) return;
    cues.paid = true;
    var bonus = wishOn(), n = bonus ? 5 : 3;
    Core.addStars(n);
    st.served++;
    var head = { x: L.stoolX, y: friendBottom() - L.friendH * 0.7 };
    for (var i = 0; i < n; i++) {
      flying.push({ x0: head.x + rnd(-1, 1) * L.u * 0.05, y0: head.y, t: -i * 0.15, dur: 0.8, slot: visit + i });
    }
    visit += n;
    sparkle(head.x, head.y, 8);
    if (bonus) {
      confetti();
      snd('fanfare');
      Core.after(0.8, function () { snd('say', 'bravissima'); });
    }
    Core.after(bonus ? 1.9 : 0.7, function () { snd('say', 'grazie'); });
    saveCake();
  }

  // ---------------------------------------------------------------- input
  function creamAt(s, x1, y1) {
    var r = cakeScreen();
    if (!r || !cakeG) return;
    var stamp = Bakery.creamStamp(s.color), sr = stamp.r, k = cakeCv.width / r.w;
    var d = Math.hypot(x1 - s.x, y1 - s.y), step = Math.max(1, sr * 0.35);
    var n = Math.min(40, Math.max(1, Math.ceil(d / step))), made = 0;
    cakeG.save();
    base.clip(cakeG);
    for (var i = 1; i <= n; i++) {
      var x = s.x + (x1 - s.x) * i / n, y = s.y + (y1 - s.y) * i / n;
      if (x < r.x - sr || x > r.x + r.w + sr || y < r.y - sr || y > r.y + r.h + sr) continue;
      cakeG.drawImage(stamp.c, (x - r.x - sr) * k, (y - r.y - sr) * k, 2 * sr * k, 2 * sr * k);
      made++;
    }
    cakeG.restore();
    if (!made) return;
    st.creamDabs += made;
    dabsBy[s.color] = (dabsBy[s.color] || 0) + made;
    if (t - lastSquish >= 0.15) { lastSquish = t; snd('squish'); }
  }
  function onCake(px, py) {
    hitG.save();
    base.clip(hitG);
    var inside = hitG.isPointInPath(px * base.c.width, py * base.c.height);
    hitG.restore();
    return inside;
  }
  function pointOnCake(x, y) {
    var r = cakeScreen();
    if (!r || !base) return false;
    var px = (x - r.x) / r.w, py = (y - r.y) / r.h;
    return px >= 0 && px <= 1 && py >= 0 && py <= 1 && onCake(px, py);
  }
  function dropTopping(x, y) {
    var r = cakeScreen();
    if (!r) return;
    var px = (x - r.x) / r.w, py = (y - r.y) / r.h;
    if (px < 0 || px > 1 || py < 0 || py > 1 || !onCake(px, py)) return;
    if (st.toppings.length >= MAX_TOPS) { sparkle(x, y, 3); return; }
    st.toppings.push({ k: st.tool.split(':')[1], x: px, y: py, a: 0 });
    snd('plop');
    sparkle(x, y, 3);
  }
  function pointer(type, p) {
    if (type === 'down') {
      idle = 0; st.hint = false;
      var b = buttonAt(p.x, p.y);
      if (b) { press(b); return; }
      if (st.mode !== 'decorate') return;
      if (!pointOnCake(p.x, p.y)) {          // a tap on the friend gives the cake
        var fz = friendRect();
        if (fz && p.x >= fz.x && p.x <= fz.x + fz.w && p.y >= fz.y && p.y <= fz.y + fz.h) { giveCake(); return; }
      }
      if (st.tool.indexOf('cream:') === 0) {
        var s = { x: p.x, y: p.y, color: st.tool.split(':')[1] };
        strokes.set(p.id, s);
        creamAt(s, p.x, p.y);
      } else dropTopping(p.x, p.y);
    } else if (type === 'move') {
      var sk = strokes.get(p.id);
      if (!sk) return;
      idle = 0; st.hint = false;
      if (st.mode !== 'decorate') { strokes.delete(p.id); return; }
      creamAt(sk, p.x, p.y);
      sk.x = p.x; sk.y = p.y;
    } else if (type === 'up') strokes.delete(p.id);
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
      addPart({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.4, 0.7), g: 0 });
    }
  }
  function crumbs(x, y) {
    var cols = ['#f6d79e', '#d9a865', '#ef8fa8'];
    for (var i = 0; i < (reduced ? 1 : 3); i++) {
      addPart({ k: 'k', x: x + rnd(-1, 1) * L.u * 0.03, y: y, vx: rnd(-0.3, 0.3) * L.u, vy: -rnd(0.1, 0.4) * L.u, life: 0, max: rnd(0.5, 0.9), g: L.u * 2.4, r: L.u * rnd(0.006, 0.012), c: cols[i % 3] });
    }
  }
  function confetti() {
    var n = reduced ? 8 : 60, cols = Art.PAL.confetti;
    for (var i = 0; i < n; i++) {
      addPart({ k: 'c', x: rnd(0, W), y: rnd(-0.25 * H, -10), vx: 0, vy: rnd(0.12, 0.26) * H, life: 0, max: 7, w: rnd(4, 8) * (M / 400 + 0.5), h: rnd(2.5, 5) * (M / 400 + 0.5), rot: rnd(0, TAU), vr: rnd(-3, 3), ph: rnd(0, TAU), c: cols[(Math.random() * cols.length) | 0], sw: rnd(0.02, 0.06) * W });
    }
  }
  function updateParts(dt) {
    var n = 0;
    for (var i = 0; i < parts.length; i++) {
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
      }
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
  function walkBongo(dt, to) {
    var v = L.u * 0.9 * dt, dx = to - bo.x;
    if (Math.abs(dx) <= v) { bo.x = to; bo.walk = Math.max(0, bo.walk - dt * 5); return; }
    bo.dir = dx > 0 ? 1 : -1;
    bo.x += bo.dir * v;
    bo.stride += v / (L.bongoH * 0.8);
    bo.walk = Math.min(1, bo.walk + dt * 5);
  }
  function update(dt) {
    t += dt;
    st.mt += dt;
    var mt = st.mt, i;
    for (i = 0; i < st.toppings.length; i++) if (st.toppings[i].a < 1) st.toppings[i].a += dt;
    for (var id in pops) if (pops[id] < 1) pops[id] += dt;
    bellRing = Math.max(0, bellRing - dt / 0.8);
    if (st.mode !== 'decorate') { idle = 0; st.hint = false; }
    bo.carry = 0;
    fr.state = fr.sit > 0.99 ? 'sit' : 'walk';
    var fx0 = fr.x;

    if (st.mode === 'arrive') {
      var pa = clamp(mt / T.arrive, 0, 1);
      fr.x = lerp(W + L.friendH, L.stoolX, 1 - (1 - pa) * (1 - pa));
      fr.dir = -1;
      if (mt > T.arrive) { fr.sit = smooth((mt - T.arrive) / 0.3); wishK = Math.min(1, wishK + dt / 0.3); }
      walkBongo(dt, L.bongoX);
      if (mt >= T.arrive + T.sit) { fr.sit = 1; setMode('pick'); }
    } else if (st.mode === 'pick') {
      wishK = Math.min(1, wishK + dt / 0.3);
      walkBongo(dt, L.bongoX);
    } else if (st.mode === 'oven') {
      ovenOpen = mt < T.door ? smooth(mt / T.door) : 1 - smooth((mt - T.door - T.slide + 0.3) / 0.3);
      if (!cues.ding && mt >= T.door * 0.6) { cues.ding = true; snd('ding'); }
      var sp = smooth((mt - T.door) / T.slide);
      cake.show = mt > T.door ? 1 : 0;
      cake.x = lerp(L.ovenX, L.cakeX, sp);
      cake.scale = lerp(0.5, 1, Math.min(1, sp * 2));
      cake.lift = lerp(L.u * 0.12, 0, Math.min(1, sp * 2.5));
      bo.carry = mt > T.door ? 0.6 : 0;
      walkBongo(dt, L.bongoX);
      if (mt >= T.door + T.slide) {
        ovenOpen = 0; cake.x = L.cakeX; cake.scale = 1; cake.lift = 0;
        setMode('decorate');
      }
    } else if (st.mode === 'decorate') {
      walkBongo(dt, L.bongoX);
      idle += dt;
      st.hint = idle >= (decorated() ? 4 : 10);
    } else if (st.mode === 'serve') {
      var ps = smooth(mt / T.serve);
      var x0 = cake.x;
      cake.x = lerp(L.cakeX, L.serveX, ps);
      cake.lift = Math.sin(Math.PI * clamp(mt / T.serve, 0, 1)) * L.u * 0.1;
      bo.carry = 1;
      bo.dir = 1;
      var bx = cake.x - L.u * 0.16;
      bo.stride += Math.abs(cake.x - x0) / (L.bongoH * 0.8);
      bo.walk = Math.min(1, bo.walk + dt * 5);
      bo.x = bx;
      if (mt >= T.serve) { cake.x = L.serveX; cake.lift = 0; setMode('eat'); }
    } else if (st.mode === 'eat') {
      walkBongo(dt, L.bongoX);
      if (mt < T.eat) {
        fr.state = 'eat'; fr.p = mt / T.eat;
        cake.eat = smooth(mt / T.eat);
        munchT -= dt; crumbT -= dt;
        if (munchT <= 0) { munchT = 0.45; snd('munch'); }
        if (crumbT <= 0) {
          crumbT = 0.08;
          var cr = cakeScreen();
          if (cr) crumbs(cr.x + cr.w * (1 - cake.eat), cr.y + cr.h * rnd(0.2, 0.8));
        }
        if (!cues.yum && mt >= 1.2) { cues.yum = true; snd('say', 'chebuona'); }
      } else {
        cake.eat = 1;
        reward();
        fr.state = 'happy'; fr.p = clamp((mt - T.eat) / T.happy, 0, 1);
        if (mt >= T.eat + T.happy) {
          setMode('leave');
          base = null; cakeCv = null; cakeG = null;
        }
      }
    } else if (st.mode === 'leave') {
      walkBongo(dt, L.bongoX);
      wishK = Math.max(0, wishK - dt / 0.3);
      fr.sit = 1 - smooth(mt / 0.25);
      fr.state = 'walk'; fr.dir = 1;
      var pl = clamp(mt / T.leave, 0, 1);
      fr.x = lerp(L.stoolX, W + L.friendH, pl * pl);
      if (mt >= T.leave) { friendI++; startVisit(); }
    }
    if (fr.state === 'walk') { fr.stride += Math.abs(fr.x - fx0) / (L.friendH * 0.5); fr.p = fr.stride % 1; }
    updateParts(dt);
  }

  // ------------------------------------------------------------------ render
  function drawSpr(g, s, x, y) { g.drawImage(s.c, x - s.w / 2, y - s.h, s.w, s.h); }
  function drawBongo(g) {
    var y = L.ctY + L.u * 0.06;
    bpose.t = t; bpose.walk = bo.walk; bpose.stride = bo.stride; bpose.carry = bo.carry;
    bpose.face = reduced ? 0 : (st.mode === 'decorate' || st.mode === 'pick' ? undefined : 0);
    if (CHR.drawBongo) {
      var k = L.bongoH / (CHR.BONGO_H || BONGO_H);
      g.save();
      g.translate(bo.x, y);
      g.scale(bo.dir * k, k);
      CHR.drawBongo(g, bpose, L.ppu);
      g.restore();
      return;
    }
    var s = S.bongo, bob = Math.abs(Math.sin(bo.stride * Math.PI * 2)) * L.bongoH * 0.03 * bo.walk;
    g.save();
    g.translate(bo.x, y - bob);
    g.scale(bo.dir, 1);
    g.drawImage(s, -s.lw / 2, -s.lh, s.lw, s.lh);
    if (bo.carry > 0) {              // arms out, toward the cake
      Art.ink(g, Math.max(1.5, L.u * 0.008));
      g.fillStyle = '#f8eed8';
      g.beginPath(); g.ellipse(s.lw * 0.32, -s.lh * 0.55, s.lw * 0.16, s.lh * 0.06, -0.3 * bo.carry, 0, TAU); g.fill(); g.stroke();
    }
    g.restore();
  }
  function drawFriend(g) {
    if (fr.x - L.friendH > W) return;
    fpose.t = t; fpose.state = fr.state; fpose.p = fr.p;
    g.save();
    var hop = 0, sq = 1;
    if (st.mode === 'decorate' && decorated() && !reduced) {       // eager: a soft hop
      var ph = Math.abs(Math.sin(Math.PI * st.mt * 1.0));
      hop = ph * L.friendH * 0.04;
      sq = 1 + 0.03 * (1 - ph) - 0.015;
    }
    g.translate(fr.x, friendBottom() - hop);
    if (fr.dir > 0) g.scale(-1, 1);
    if (sq !== 1) g.scale(1 / sq, sq);
    Friends.draw(g, st.friend, 0, 0, fpose);
    g.restore();
  }
  function drawCake(g) {
    if (!base || !cakeCv || !cake.show) return;
    var r = cakeScreen(), i;
    if (bo.carry >= 1 && st.mode === 'serve') {       // the tray
      g.fillStyle = '#dfe6ef';
      g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h - L.u * 0.01, r.w * 0.6, L.u * 0.025, 0, 0, TAU); g.fill();
      Art.ink(g, Math.max(1.5, L.u * 0.008)); g.stroke();
    }
    var clipped = cake.eat > 0;
    if (clipped) {
      if (cake.eat >= 1) return;
      g.save();
      g.beginPath();
      g.rect(r.x - r.w, r.y - r.h, r.w * (2 - cake.eat), r.h * 3);
      g.clip();
    }
    g.drawImage(cakeCv, r.x, r.y, r.w, r.h);
    var k = cake.scale;
    for (i = 0; i < st.toppings.length; i++) {
      var q = st.toppings[i], tp = Bakery.topping(q.k), b = q.a < 0.3 ? backOut(q.a / 0.3) : 1;
      var w = tp.w * k * b, h = tp.h * k * b;
      g.drawImage(tp.c, r.x + q.x * r.w - w / 2, r.y + q.y * r.h - h / 2, w, h);
    }
    if (clipped) g.restore();
  }
  function drawBubble(g) {
    if (wishK <= 0.01 || !st.wish) return;
    var b = bubblePos(), s = Bakery.sprite('wishBubble'), sc = backOut(wishK) * b.k;
    var happy = wishOn() && st.mode === 'decorate' ? Math.sin(t * 6) * 0.06 : 0;
    g.save();
    g.translate(b.x, b.y);
    g.scale(sc, sc);
    if (happy) g.rotate(happy);
    g.drawImage(s.c, -s.w / 2, -s.h, s.w, s.h);
    var tp = Bakery.topping(st.wish), kk = 0.5 * s.h / Math.max(tp.w, tp.h);
    g.drawImage(tp.c, -tp.w * kk / 2, -0.6 * s.h - tp.h * kk / 2, tp.w * kk, tp.h * kk);
    g.restore();
  }
  function drawButtons(g) {
    var list = buttons();
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.id === 'serve') { drawGive(g, b); continue; }
      var ic = Bakery.icon(b.id), sel = b.id === st.tool, r = b.r;
      var pop = pops[b.id] !== undefined && pops[b.id] < 0.3 ? 1 + 0.15 * Math.sin(Math.PI * pops[b.id] / 0.3) : 1;
      if (st.mode === 'pick' && !reduced) r *= 1 + 0.04 * Math.sin(t * 3 + i);
      if (sel) {
        r *= 1.06;
        g.fillStyle = 'rgba(249,233,142,0.75)';
        g.beginPath(); g.arc(b.x, b.y, r * 1.2, 0, TAU); g.fill();
        g.lineWidth = Math.max(2, r * 0.08); g.strokeStyle = Art.PAL.ink; g.stroke();
      }
      r *= pop;
      g.drawImage(ic.c, b.x - r, b.y - r, 2 * r, 2 * r);
    }
  }
  // The give button: a cream disk, the cake on the left, three dots toward the
  // friend's head on the right. Static parts are cached (buildGiveArt).
  function drawGive(g, b) {
    var ga = S.give, r = b.r, pop = pops.serve !== undefined && pops.serve < 0.3 ? 1 + 0.15 * Math.sin(Math.PI * pops.serve / 0.3) : 1;
    var on = decorated(), pulse = on && !reduced ? 1 + 0.05 * Math.sin(t * TAU * 1.5) : 1;
    var k = pulse * pop;
    g.save();
    g.translate(b.x, b.y);
    g.scale(k, k);
    if (on) g.drawImage(ga.ring, -ga.ringR, -ga.ringR, 2 * ga.ringR, 2 * ga.ringR);
    g.drawImage(ga.disk, -r, -r, 2 * r, 2 * r);
    if (base && cakeCv) {                          // the cake, small, on the left
      var cw = r * 0.78, ck = cw / base.w, ch = base.h * ck, cx = -r * 0.46 - cw / 2, cy = r * 0.1 - ch / 2;
      g.drawImage(cakeCv, cx, cy, cw, ch);
      var n = Math.min(st.toppings.length, 40);
      for (var i = 0; i < n; i++) {
        var q = st.toppings[i], tp = Bakery.topping(q.k);
        g.drawImage(tp.c, cx + q.x * cw - tp.w * ck / 2, cy + q.y * ch - tp.h * ck / 2, tp.w * ck, tp.h * ck);
      }
    }
    g.drawImage(ga.dots, -r, -r, 2 * r, 2 * r);
    g.save();                                       // the friend's head, in a small round window on the right
    g.beginPath(); g.arc(r * 0.5, r * 0.02, r * 0.43, 0, TAU); g.clip();
    var fk = r * 1.85 / L.friendH;
    g.translate(r * 0.5, r * 1.1);
    g.scale(-fk, fk);
    fpose.t = t; fpose.state = 'sit'; fpose.p = 0;
    Friends.draw(g, st.friend, 0, 0, fpose);
    g.restore();
    g.drawImage(ga.rim, -r, -r, 2 * r, 2 * r);
    g.restore();
  }
  function drawHint(g) {
    if (!st.hint || st.mode !== 'decorate') return;
    var ph = Math.floor((idle - (decorated() ? 4 : 10)) / 1.5) % 2, fz = friendRect();
    if (ph === 0 && fz) Art.drawTapHint(g, fz.x + fz.w / 2, fz.y + fz.h * 0.6, L.friendH * 0.4, t);
    else Art.drawTapHint(g, L.give.x, L.give.y, L.give.r * 0.9, t);
  }
  function buildGiveArt() {
    var r = L.give.r, c, g;
    var ring = Art.makeCanvas(2 * r * 1.5 * DPR, 2 * r * 1.5 * DPR);
    g = ring.getContext('2d'); g.scale(DPR, DPR);
    var gr = g.createRadialGradient(r * 1.5, r * 1.5, r * 0.8, r * 1.5, r * 1.5, r * 1.5);
    gr.addColorStop(0, 'rgba(255,214,120,0.9)'); gr.addColorStop(0.55, 'rgba(249,200,90,0.45)'); gr.addColorStop(1, 'rgba(249,200,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 3 * r, 3 * r);
    function layer() { c = Art.makeCanvas(2 * r * DPR, 2 * r * DPR); g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(r, r); return c; }
    var disk = layer();
    g.beginPath(); g.arc(0, 0, r * 0.94, 0, TAU);
    g.fillStyle = '#fff6df'; g.fill();
    disk.lw = 2 * r;
    Art.pencil(disk, '#f3cf8e', 5, 0.55);
    var dots = layer();
    g.fillStyle = Art.PAL.orange || '#f08a3c';
    for (var i = 0; i < 3; i++) { g.beginPath(); g.arc(-r * 0.08 + i * r * 0.17, r * 0.1, r * (0.045 + 0.012 * i), 0, TAU); g.fill(); }
    var rim = layer();
    g.beginPath(); g.arc(0, 0, r * 0.94, 0, TAU);
    Art.ink(g, Math.max(2, r * 0.07)); g.stroke();
    S.give = { disk: disk, dots: dots, rim: rim, ring: ring, ringR: r * 1.5 };
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
      } else if (q.k === 'k') {
        g.fillStyle = q.c;
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill();
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
    if (thumbs) g.drawImage(thumbs, L.win.x, L.win.y, L.win.w, L.win.h);
    drawSpr(g, Bakery.sprite('stool'), L.stoolX, L.ctY + L.u * 0.04);
    drawBongo(g);
    drawFriend(g);
    var ct = Bakery.sprite('counter'), cw = Math.min(W, ct.w), ch = Math.min(H - L.ctY, ct.h);
    g.drawImage(ct.c, (ct.w - cw) / 2 * DPR, 0, cw * DPR, ch * DPR, 0, L.ctY, W, H - L.ctY);
    var ov = Bakery.sprite('oven'), sq = ovenOpen * (reduced ? 0.01 : 0.04);
    g.save();
    g.translate(L.ovenX, L.ctY + L.u * 0.01);
    g.scale(1 + sq, 1 - sq);
    drawSpr(g, ov, 0, 0);
    if (ovenOpen > 0.01) Art.drawSprite(g, S.glow, 0, -0.38 * ov.h, 0.6 + 0.4 * ovenOpen, ovenOpen, 0);
    g.restore();
    var bl = Bakery.sprite('bell');
    g.save();
    g.translate(L.bellX, L.ctY + L.u * 0.015);
    if (bellRing > 0) g.rotate(Math.sin(bellRing * 30) * 0.2 * bellRing);
    drawSpr(g, bl, 0, 0);
    g.restore();
    drawCake(g);
    drawBubble(g);
    drawButtons(g);
    drawHint(g);
    drawParts(g);
    drawStarRow(g);
  }

  // ------------------------------------------------------------------ resize
  function glowSprite(r) {
    var c = Art.makeCanvas(2 * r * DPR, 2 * r * DPR), g = c.getContext('2d');
    c.lw = 2 * r; c.lh = 2 * r;
    g.scale(DPR, DPR);
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,214,120,0.95)'); gr.addColorStop(0.5, 'rgba(249,166,70,0.5)'); gr.addColorStop(1, 'rgba(249,166,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 2 * r, 2 * r);
    return c;
  }
  // Bongo until Characters.drawBongo exists: a round cream teddy in blue overalls.
  function placeholderBongo(h) {
    var w = h * 0.7, c = Art.makeCanvas(w * DPR, h * DPR), g = c.getContext('2d');
    c.lw = w; c.lh = h;
    g.scale(DPR, DPR);
    var lw = Math.max(1.2, h * 0.016), fur = '#f8eed8', blue = '#2b6cb0';
    function blob(x, y, rx, ry, col) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = col; g.fill(); Art.ink(g, lw); g.stroke(); }
    blob(w * 0.36, h * 0.93, w * 0.13, h * 0.06, fur);
    blob(w * 0.64, h * 0.93, w * 0.13, h * 0.06, fur);
    blob(w * 0.5, h * 0.7, w * 0.3, h * 0.22, blue);
    blob(w * 0.22, h * 0.15, w * 0.1, w * 0.1, fur);
    blob(w * 0.78, h * 0.15, w * 0.1, w * 0.1, fur);
    blob(w * 0.5, h * 0.3, w * 0.33, h * 0.22, fur);
    blob(w * 0.56, h * 0.37, w * 0.13, h * 0.07, '#fffaf0');
    g.fillStyle = Art.PAL.ink;
    g.beginPath(); g.arc(w * 0.4, h * 0.27, h * 0.022, 0, TAU); g.fill();
    g.beginPath(); g.arc(w * 0.66, h * 0.27, h * 0.022, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(w * 0.57, h * 0.34, h * 0.025, h * 0.017, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(w * 0.56, h * 0.37, h * 0.035, 0.3, Math.PI - 0.3); Art.ink(g, lw * 0.8); g.stroke();
    return c;
  }
  function resize() {
    var oldW = W || 1;
    sync();
    var u = L.u = Math.min(M, 0.9 * H);
    L.ctY = Bakery.COUNTER * H;
    Bakery.build(u, DPR);
    L.room = Bakery.room(W, H, false);
    L.win = Bakery.windowRect(W, H);
    // Left to right: oven, Bongo, cake, friend. On narrow screens (portrait) they
    // overlap a little: Bongo stands just off the oven's door, the cake just off
    // Bongo, and the friend sits partly behind the cake (the head stays clear).
    L.ovenX = Math.max(0.1 * W, 0.15 * u);
    L.bongoX = Math.max(0.3 * W, L.ovenX + 0.2 * u);
    L.cakeX = Math.max(0.56 * W, L.bongoX + 0.28 * u);
    L.bellX = L.cakeX - 0.21 * u;      // clear of Bongo's belly in portrait
    L.stoolX = W - Math.max(0.14 * W, 0.14 * u);
    L.serveX = L.stoolX - 0.14 * u;
    L.friendH = 0.34 * u;
    L.bongoH = 0.34 * u;
    // the star game's flying scale, as js/scenes/street.js: no third Characters scale
    L.ppu = Math.min(H * 0.42, W * 0.52) / CHR.H * DPR;
    CHR.prerender(L.ppu);
    Friends.build(L.friendH, DPR);
    S.bongo = placeholderBongo(L.bongoH);
    S.glow = glowSprite(u * 0.12);
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
    layoutButtons();
    bo.x = bo.x ? bo.x * W / oldW : L.bongoX;
    if (st.mode === 'decorate' || st.mode === 'pick') cake.x = L.cakeX;
    if (st.mode === 'eat') cake.x = L.serveX;
    refitCake();
    buildThumbs();
  }

  Core.register('bakery', {
    home: 'street',
    clock: false,
    music: 'bakery',
    enter: function () {
      sync();
      st.enters++;
      Friends.build(L.friendH, DPR);     // another place may have cached its own friend size
      t = 0;
      parts.length = 0; flying.length = 0;
      visit = 0; shown = 0;
      for (var i = 0; i < 10; i++) slotPop[i] = 9;
      pops = {};
      bo.x = L.bongoX; bo.dir = 1; bo.walk = 0; bo.carry = 0;
      idle = 0; st.hint = false;
      loadCakes();
      buildThumbs();
      startVisit();
    },
    exit: function () {
      strokes.clear();
      parts.length = 0; flying.length = 0;
      base = null; cakeCv = null; cakeG = null;
      st.shape = null; st.toppings = [];
      setMode('off');
    },
    update: function (dt) { sync(); update(dt); },
    render: function (g) { sync(); render(g); },
    pointer: function (type, p) { sync(); pointer(type, p); },
    resize: resize
  });

  if (window.__bella === undefined) window.__bella = {};
  window.__bella.bakery = {
    st: st,
    buttons: function () {
      return buttons().map(function (b) { return { id: b.id, x: b.x, y: b.y, r: b.r }; });
    },
    friendRect: function () { return friendRect(); },
    friendH: function () { return Friends.built().h; },
    cakeRect: function () {
      var r = cakeScreen();
      return r && { x: r.x, y: r.y, w: r.w, h: r.h };
    }
  };
})();
