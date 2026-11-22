/* core.js - shared core for "Bella e Bongo". Classic script: window.Core.
 * Owns the canvas, size/DPR, the rAF loop, pointer input, the mute and home
 * buttons, full screen, the visibility pause, save data and scene switching.
 * Places in the game are scenes (js/scenes/*.js) that register here.
 *
 *   Core.W, Core.H, Core.M, Core.DPR  size in CSS px, M = min(W, H), DPR <= 2 (read-only)
 *   Core.ctx                          2D context of canvas#game (the core sets the DPR transform)
 *   Core.reduced                      prefers-reduced-motion, kept up to date (read-only)
 *   Core.register(name, scene)
 *   Core.go(name, args)               0.4 s fade out, old.exit(), new.enter(args), fade in.
 *                                     Input is ignored during a fade; a second go() is dropped.
 *   Core.current() -> name
 *   Core.start(name)                  boot: size, Backdrop.build(), enter the first scene, loop
 *   Core.snd(name, ...args)           Sound[name](...args); audio must never break the game
 *   Core.load(key, fallbackKeys[]) -> string|null, Core.store(key, value)
 *                                     localStorage in try/catch, with an in-memory copy
 *                                     so private mode keeps values for the session
 *   Core.goFullscreen()               call from a tap; leaving full screen goes to 'title'
 *   Core.after(sec, fn)               timer for the current scene, cleared on scene change
 *
 * Scene shape:
 *   { home: 'scene'|null,    // #home is shown when set; a click goes there
 *     clock: bool,           // whether the day/night cycle runs (Backdrop)
 *     enter(args), exit(), update(dt), render(g),
 *     pointer(type, p),      // type 'down'|'move'|'up', p = {id, x, y, dx, dy}
 *     resize() }             // called before enter() when the size changed, and on resize
 *
 * Pointers are captured and tracked here. pointercancel, blur and hiding the page
 * send 'up' for every tracked pointer; a scene change sends 'up' to the old scene
 * before exit(), so a scene never keeps a stuck pointer.
 * body.playing is set when the current scene isn't 'title'.
 */
(function () {
  'use strict';

  var Sound = window.Sound;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var muteBtn = document.getElementById('mute');
  var homeBtn = document.getElementById('home');

  var FADE = 0.4;                 // seconds for each half of a scene change
  var FADE_COLOR = '#e8dcf5';     // the page background: a soft lilac, never black

  var W = 0, H = 0, M = 0, DPR = 1;
  var scenes = {}, cur = null;
  var fade = null;                // {name, args, t, phase: 'out'|'in'}
  var timers = [];
  var pointers = new Map();       // id -> {id, x, y, dx, dy, on}; on = 'down' went to the current scene
  var sizeKey = 0, sized = {};    // sized[name] = sizeKey the scene was last resized for

  // ------------------------------------------------------------ audio, storage
  function snd(name) {
    try {
      if (Sound && Sound[name]) return Sound[name].apply(Sound, Array.prototype.slice.call(arguments, 1));
    } catch (e) { /* audio must never break the game */ }
  }

  var mem = {};
  function load(key, fallbacks) {
    var keys = [key].concat(fallbacks || []), i, v;
    for (i = 0; i < keys.length; i++) {
      if (mem[keys[i]] !== undefined) return mem[keys[i]];
      v = null;
      try { v = localStorage.getItem(keys[i]); } catch (e) { /* private mode */ }
      if (v !== null && v !== '') return v;
    }
    return null;
  }
  function store(key, value) {
    mem[key] = String(value);
    try { localStorage.setItem(key, String(value)); } catch (e) { /* private mode */ }
  }

  var reduced = false;
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = mq.matches;
    var onMq = function (e) { reduced = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  } catch (e) { /* ignore */ }

  // ------------------------------------------------------------------- scenes
  function register(name, scene) { scenes[name] = scene; }

  function call(sc, fn, a, b) {
    if (sc && sc[fn]) sc[fn](a, b);
  }

  function homeTarget() {
    var sc = scenes[cur];
    return sc && typeof sc.home === 'string' && scenes[sc.home] ? sc.home : null;
  }

  function ensureSized(name) {
    if (sized[name] === sizeKey) return;
    sized[name] = sizeKey;
    call(scenes[name], 'resize');
  }

  function switchTo(name, args) {
    timers.length = 0;
    pointers.forEach(function (p) { if (p.on) { p.on = false; send('up', p); } });
    call(scenes[cur], 'exit');
    cur = name;
    document.body.classList.toggle('playing', name !== 'title');
    document.body.classList.toggle('has-home', !!homeTarget());
    ensureSized(name);
    call(scenes[name], 'enter', args || {});
  }

  function go(name, args) {
    if (fade || !scenes[name] || name === cur) return;
    fade = { name: name, args: args, t: 0, phase: 'out' };
  }

  function tickFade(dt) {
    if (!fade) return;
    fade.t += dt;
    if (fade.phase === 'out' && fade.t >= FADE) {
      switchTo(fade.name, fade.args);
      fade.phase = 'in'; fade.t = 0;
    } else if (fade.phase === 'in' && fade.t >= FADE) fade = null;
  }

  function fadeAlpha() {
    if (!fade) return 0;
    var p = Math.min(1, fade.t / FADE);
    return fade.phase === 'out' ? p : 1 - p;
  }

  function after(sec, fn) { timers.push({ t: sec, fn: fn }); }

  function runTimers(dt) {
    for (var i = timers.length - 1; i >= 0; i--) {
      var tm = timers[i];
      if (!tm) continue;
      tm.t -= dt;
      if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); }
    }
  }

  // --------------------------------------------------------------------- size
  var resizeTimer = 0;
  function applySize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight; M = Math.min(W, H);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  function rebuild() {
    sizeKey++;
    if (window.Backdrop) window.Backdrop.build();
    if (cur) ensureSized(cur);
  }
  function onResize() {
    applySize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      try { rebuild(); } catch (err) { if (window.console) console.error(err); }
    }, 150);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // ------------------------------------------------------------------ input
  function send(type, p) {
    var sc = scenes[cur];
    if (!sc || !sc.pointer) return;
    try { sc.pointer(type, { id: p.id, x: p.x, y: p.y, dx: p.dx, dy: p.dy }); }
    catch (err) { if (window.console) console.error(err); }
  }

  function releaseAll() {
    var list = [];
    pointers.forEach(function (p) { list.push(p); });
    pointers.clear();
    list.forEach(function (p) { if (p.on) send('up', p); });
  }

  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    snd('init');
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    var p = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, on: false };
    pointers.set(e.pointerId, p);
    if (fade) return;               // input is ignored during a fade
    p.on = true;
    send('down', p);
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    p.dx = e.clientX - p.x; p.dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (p.on && !fade) send('move', p);
  });
  // An 'up' always reaches the scene that got the 'down', even during a fade,
  // so a held finger can never stay stuck.
  function lift(e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    p.dx = 0; p.dy = 0;
    if (p.on) send('up', p);
  }
  cv.addEventListener('pointerup', function (e) { lift(e); snd('init'); });
  cv.addEventListener('pointercancel', function () { releaseAll(); snd('init'); });
  cv.addEventListener('lostpointercapture', lift);
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', releaseAll);

  // ------------------------------------------------------------ full screen
  // Full screen starts with the play tap (browsers allow it only after a tap).
  // iPhone Safari has no full screen for pages: there, "Add to Home Screen" gives it.
  var fsUsed = false, fsTarget = null;
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function goFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || fsElement()) return;
    try {
      var r = req.call(el, { navigationUI: 'hide' });
      fsUsed = true;
      if (r && r.catch) r.catch(function () { fsUsed = false; });
    } catch (e) { fsUsed = false; }
  }
  function onFsChange() {
    // Leaving full screen (back button, Esc) goes back to the start page,
    // or to the home target when the home button closed it.
    if (fsElement() || !fsUsed) return;
    fsUsed = false;
    var to = fsTarget || 'title';
    fsTarget = null;
    if (cur !== to) go(to);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // ---------------------------------------------------------------- buttons
  function safeMuted() { try { return Sound.isMuted(); } catch (e) { return false; } }
  muteBtn.setAttribute('aria-pressed', String(!!safeMuted()));
  muteBtn.addEventListener('click', function () {
    snd('init');
    var m = snd('toggleMute');
    muteBtn.setAttribute('aria-pressed', String(m === undefined ? safeMuted() : !!m));
  });

  function pressHome() {
    var to = homeTarget();
    if (!to || fade) return;
    if (fsElement()) {
      fsUsed = true; fsTarget = to;   // onFsChange goes there once full screen has closed
      var done = function () { fsTarget = null; go(to); };
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      try { var r = ex.call(document); if (r && r.catch) r.catch(done); } catch (e) { done(); }
    } else go(to);
  }
  homeBtn.addEventListener('click', pressHome);

  // Offline play and "Add to Home Screen": cache the game files (only over http/https).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* online play still works */ });
    });
  }

  var paused = false, last = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { snd('suspend'); paused = true; releaseAll(); }
    else { snd('resume'); paused = false; last = 0; }
  });

  // --------------------------------------------------------------------- loop
  function frame(ts) {
    requestAnimationFrame(frame);
    if (paused) return;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    try {
      tickFade(dt);
      var sc = scenes[cur];
      if (window.Backdrop) window.Backdrop.update(dt, !!sc.clock);
      runTimers(dt);
      sc.update(dt);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      sc.render(ctx);
      var a = fadeAlpha();
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = FADE_COLOR;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    } catch (err) {
      if (window.console) console.error(err);
    }
  }

  function start(name) {
    applySize();
    sizeKey++;
    if (window.Backdrop) window.Backdrop.build();
    switchTo(name, {});
    // Debug hook for the tests and for parents' devices (see AGENTS.md).
    var hook = window.__bella = window.__bella || {};
    hook.scene = function () { return cur; };
    hook.goHome = pressHome;
    requestAnimationFrame(frame);
  }

  var Core = {
    register: register, go: go, start: start,
    current: function () { return cur; },
    snd: snd, load: load, store: store,
    goFullscreen: goFullscreen, after: after
  };
  function ro(name, get) { Object.defineProperty(Core, name, { get: get, enumerable: true }); }
  ro('W', function () { return W; });
  ro('H', function () { return H; });
  ro('M', function () { return M; });
  ro('DPR', function () { return DPR; });
  ro('ctx', function () { return ctx; });
  ro('reduced', function () { return reduced; });
  window.Core = Core;
})();
