/* Stella's sound designer: js/audio.js
 * ---------------------------------------------------------------------------
 * Everything is synthesized with the Web Audio API (no sound files, no network)
 * except the optional recorded voice cues assets/sounds/<key>.mp3.
 *
 * Public API: window.Sound = { init, isMuted, setMuted, toggleMute, star,
 *   bubble, boing, splat, fanfare, sparkle, say, suspend, resume }
 *
 * Graph:   sfxBus ----\
 *                      +--> master --> compressor(limiter) --> destination
 *          musicBus --/
 *
 * Design rules: soft, short, cheerful. Every envelope starts at ~0 and ramps,
 * and ends by ramping back to ~0 before the oscillator is stopped (no clicks).
 *
 * The synth functions in `Synth` take any BaseAudioContext + destination node,
 * so they can be rendered offline for testing (Sound._synth, Sound._levels).
 */
(function () {
  'use strict';

  var MUTE_KEY = 'stella.muted';
  var LEVELS = { master: 0.85, sfx: 0.8, music: 0.15, duck: 0.35 };

  // ------------------------------------------------------------------ helpers
  // C-major pentatonic ladder: index 0 = C4, then D4 E4 G4 A4, C5 ... (5 per octave)
  var PENT = [0, 2, 4, 7, 9];
  function pent(i) {
    var oct = Math.floor(i / 5), deg = PENT[((i % 5) + 5) % 5];
    return 440 * Math.pow(2, (60 + 12 * oct + deg - 69) / 12);
  }

  var noiseCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function noiseBuffer(ctx) {
    var buf = noiseCache && noiseCache.get(ctx);
    if (buf) return buf;
    var len = Math.floor(ctx.sampleRate * 1);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (noiseCache) noiseCache.set(ctx, buf);
    return buf;
  }

  /** One soft enveloped oscillator. o: {type, f, f2 (glide target), glide (s),
   *  peak, attack, dur (total incl. release), curve ('exp'|'lin')} */
  function tone(ctx, dest, t, o) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    var attack = o.attack || 0.008, dur = o.dur || 0.3, peak = o.peak || 0.2;
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    var out = g;
    if (o.lp) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = o.lp;
      g.connect(lp); out = lp;
    }
    out.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Music-box / bell voice: sine + soft 3rd partial + quiet inharmonic shimmer. */
  function bell(ctx, dest, t, f, peak, dur) {
    tone(ctx, dest, t, { f: f, peak: peak, dur: dur, attack: 0.006 });
    tone(ctx, dest, t, { f: f * 3, peak: peak * 0.18, dur: dur * 0.45, attack: 0.004 });
    tone(ctx, dest, t, { f: f * 5.4, peak: peak * 0.05, dur: dur * 0.25, attack: 0.004 });
  }

  // ------------------------------------------------------------- synth voices
  var Synth = {};

  /** Happy sparkly ding; n walks up the pentatonic scale (8 notes, wraps). */
  Synth.star = function (ctx, dest, t, n) {
    var f = pent(5 + (((n | 0) % 8) + 8) % 8);          // C5 .. E6
    bell(ctx, dest, t, f, 0.30, 0.55);
    bell(ctx, dest, t + 0.07, f * 1.5, 0.12, 0.35);    // little fifth above
  };

  /** Soft soap-bubble plop: short rising sine blip. rnd in [0,1) randomizes pitch. */
  Synth.bubble = function (ctx, dest, t, rnd) {
    var f = 420 + (rnd === undefined ? 0.5 : rnd) * 380;
    tone(ctx, dest, t, { f: f, f2: f * 1.7, glide: 0.07, peak: 0.22, attack: 0.008, dur: 0.14 });
    tone(ctx, dest, t, { f: f * 2, f2: f * 3.2, glide: 0.07, peak: 0.04, attack: 0.008, dur: 0.08 });
  };

  /** Cute bounce: triangle gliding up then down with a wobble, mellow filter. */
  Synth.boing = function (ctx, dest, t) {
    var osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.30);
    // gentle vibrato
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 22; lg.gain.value = 14;
    lfo.connect(lg); lg.connect(osc.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.30, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(lp); lp.connect(g); g.connect(dest);
    osc.start(t); lfo.start(t);
    osc.stop(t + 0.40); lfo.stop(t + 0.40);
  };

  /** Funny soft mud splosh: swept low-passed noise + two low bloops. */
  Synth.splat = function (ctx, dest, t) {
    var src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    src.connect(lp); lp.connect(g); g.connect(dest);
    src.start(t); src.stop(t + 0.36);
    tone(ctx, dest, t, { f: 190, f2: 70, glide: 0.22, peak: 0.34, attack: 0.012, dur: 0.30 });
    tone(ctx, dest, t + 0.13, { f: 300, f2: 120, glide: 0.15, peak: 0.18, attack: 0.012, dur: 0.22 });
  };

  /** Short cheerful fanfare, ~1.2 s: rising C-E-G-C arpeggio then a held chord. */
  Synth.fanfare = function (ctx, dest, t) {
    var run = [pent(5), pent(7), pent(8), pent(10)];       // C5 E5 G5 C6
    for (var i = 0; i < run.length; i++) {
      tone(ctx, dest, t + i * 0.14, { type: 'triangle', f: run[i], peak: 0.2, dur: 0.30, attack: 0.012, lp: 3200 });
      tone(ctx, dest, t + i * 0.14, { f: run[i] * 2, peak: 0.05, dur: 0.2, attack: 0.012 });
    }
    var ct = t + 0.58, chord = [pent(5), pent(7), pent(8), pent(10)];
    for (var j = 0; j < chord.length; j++) {
      tone(ctx, dest, ct, { type: 'triangle', f: chord[j], peak: 0.13, dur: 0.62, attack: 0.02, lp: 3200 });
    }
    bell(ctx, dest, ct, pent(12), 0.12, 0.6);              // sparkle on top
  };

  /** Shimmering rising glissando of bell notes, ~1.3 s. */
  Synth.sparkle = function (ctx, dest, t) {
    var count = 14;
    for (var i = 0; i < count; i++) {
      var shape = Math.sin(Math.PI * (i + 1) / (count + 1));  // swell up and down
      bell(ctx, dest, t + i * 0.065, pent(5 + i), 0.05 + 0.10 * shape, 0.42);
    }
  };

  // ---- Music: 8-bar lullaby loop, 96 bpm, C major pentatonic. 8 eighth-note slots per bar.
  var BPM = 96, EIGHTH = 60 / BPM / 2;
  var _ = -1;
  var MELODY = [               // pentatonic ladder indices (5 = C5), _ = rest
    [5, _, 7, _, 8, _, 7, _],
    [6, _, 5, _, 4, _, _, _],
    [5, _, 7, _, 8, _, 9, _],
    [8, _, 7, _, 6, _, _, _],
    [9, _, 8, _, 7, _, 5, _],
    [6, _, 7, _, 8, _, _, _],
    [7, _, 8, _, 9, _, 8, 7],
    [5, _, _, _, _, _, _, _]
  ];
  // Alternate ending bar on odd passes so the loop doesn't grate.
  var MELODY_ALT_BAR3 = [8, _, 9, _, 10, _, 8, _];
  // Chord roots + pad per bar (all notes belong to the pentatonic scale).
  var PADS = [
    [-12, -8, -5],  // C   (C3 E3 G3 relative to C4=0)
    [-15, -12, -8], // Am  (A2 C3 E3)
    [-12, -8, -5],  // C
    [-17, -15, -10],// Gsus2 (G2 A2 D3)
    [-15, -12, -8], // Am
    [-17, -15, -10],// Gsus2
    [-12, -8, -5],  // C
    [-12, -8, -5]   // C
  ];
  function semis(s) { return 261.6256 * Math.pow(2, s / 12); }
  var LADDER_SEMI = function (i) { return PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5); };

  /** Schedule one eighth-note slot (0..63) of the loop; pass is the loop count. */
  Synth.musicSlot = function (ctx, dest, t, slot, pass) {
    var bar = Math.floor(slot / 8), step = slot % 8, alt = (pass % 2) === 1;
    var row = (alt && bar === 3) ? MELODY_ALT_BAR3 : MELODY[bar];
    var m = row[step];
    if (m >= 0) {
      // soften the off-beat notes a touch; on odd passes the first bar rings an octave up too
      var peak = (step % 4 === 0) ? 0.55 : 0.42;
      bell(ctx, dest, t, semis(LADDER_SEMI(m)), peak, 1.0);
      if (alt && bar === 0 && step === 0) bell(ctx, dest, t + EIGHTH, semis(LADDER_SEMI(m + 5)), 0.2, 0.7);
    }
    if (step === 0) {
      // soft pad (two detuned triangles per note, slow swell) + a round bass note
      var barLen = EIGHTH * 8, p = PADS[bar];
      for (var i = 0; i < p.length; i++) {
        var f = semis(p[i] + 12);
        tone(ctx, dest, t, { type: 'triangle', f: f, peak: 0.10, attack: barLen * 0.35, dur: barLen * 1.05, lp: 900 });
      }
      tone(ctx, dest, t, { f: semis(p[0] - 0), peak: 0.35, attack: 0.03, dur: barLen * 0.9 });
    }
    if (step === 4) {
      tone(ctx, dest, t, { f: semis(PADS[bar][0] + 7), peak: 0.16, attack: 0.03, dur: EIGHTH * 3.5 });
    }
  };

  // ---------------------------------------------------------------- runtime
  var ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
  var muted = false, suspended = false, musicStarted = false, unlockedSpeech = false;
  var musicTimer = null, nextSlotTime = 0, slotCounter = 0;
  var lastBubble = 0;

  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();       // gentle limiter so overlaps never clip
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 8;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : LEVELS.master;
      sfxBus = ctx.createGain(); sfxBus.gain.value = LEVELS.sfx;
      musicBus = ctx.createGain(); musicBus.gain.value = LEVELS.music;
      sfxBus.connect(master); musicBus.connect(master);
      master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function ramp(param, value, secs) {
    try {
      var t = ctx.currentTime;
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(value, t + secs);
    } catch (e) { /* ignore */ }
  }

  // ---- music scheduler (lookahead): setInterval + AudioContext time
  function musicTick() {
    if (!ctx || suspended || ctx.state !== 'running') return;
    var horizon = ctx.currentTime + 0.35;
    if (nextSlotTime < ctx.currentTime - 0.1) nextSlotTime = ctx.currentTime + 0.05; // fell behind
    while (nextSlotTime < horizon) {
      var slot = slotCounter % 64, pass = Math.floor(slotCounter / 64);
      try { Synth.musicSlot(ctx, musicBus, nextSlotTime, slot, pass); } catch (e) { /* keep going */ }
      nextSlotTime += EIGHTH;
      slotCounter++;
    }
  }
  function startMusic() {
    if (musicTimer || !ctx) return;
    nextSlotTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(musicTick, 60);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // ---- speech / recorded voice
  var VOICE_TEXT = { via: 'Si vola!', bravissima: 'Bravissima!', laviamo: 'Laviamoli!', puliti: 'Che puliti!' };
  var files = {};   // key -> { el, ok }
  Object.keys(VOICE_TEXT).forEach(function (key) {
    try {
      var el = new Audio();
      var rec = { el: el, ok: false };
      el.preload = 'auto';
      el.addEventListener('canplaythrough', function () { rec.ok = true; });
      el.addEventListener('error', function () { rec.ok = false; });
      el.src = 'assets/sounds/' + key + '.mp3';
      files[key] = rec;
    } catch (e) { /* no HTMLAudio */ }
  });

  var synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
  var itVoice = null;
  function pickVoice() {
    try {
      var vs = synth.getVoices() || [];
      itVoice = null;
      for (var i = 0; i < vs.length; i++) {
        if (/^it([-_]|$)/i.test(vs[i].lang)) { itVoice = vs[i]; if (vs[i].localService) break; }
      }
    } catch (e) { /* ignore */ }
  }
  if (synth) {
    pickVoice();
    try { synth.onvoiceschanged = pickVoice; } catch (e) { /* ignore */ }
  }

  var duckTimer = null, currentFile = null;
  function duck(on) {
    if (!ctx) return;
    ramp(musicBus.gain, on ? LEVELS.music * LEVELS.duck : LEVELS.music, on ? 0.12 : 0.4);
  }
  function endVoice() {
    if (duckTimer) { clearTimeout(duckTimer); duckTimer = null; }
    duck(false);
  }
  function cancelVoice() {
    try { if (synth) synth.cancel(); } catch (e) { /* ignore */ }
    try { if (currentFile) { currentFile.pause(); currentFile = null; } } catch (e) { /* ignore */ }
  }
  function speak(text) {
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      if (itVoice) u.voice = itVoice;
      u.pitch = 1.3; u.rate = 0.95; u.volume = 1;
      u.onend = u.onerror = endVoice;
      synth.speak(u);
      return true;
    } catch (e) { return false; }
  }

  // --------------------------------------------------------------- public API
  /** Fire a one-shot synth voice on the sfx bus (respects mute/suspend). */
  function playSfx(fn, arg) {
    try {
      if (muted || suspended) return;
      if (!ensureCtx()) return;
      if (ctx.state === 'suspended') ctx.resume();
      fn(ctx, sfxBus, ctx.currentTime + 0.01, arg);
    } catch (e) { /* never throw into the game */ }
  }

  var Sound = {
    init: function () {
      try {
        if (!ensureCtx()) return;
        if (ctx.state === 'suspended' && !suspended) {
          var p = ctx.resume(); if (p && p.catch) p.catch(function () {});
        }
        if (!musicStarted) { musicStarted = true; startMusic(); }
        if (!unlockedSpeech && synth && typeof SpeechSynthesisUtterance !== 'undefined') {
          unlockedSpeech = true;
          var u = new SpeechSynthesisUtterance('');
          u.volume = 0; u.lang = 'it-IT';
          synth.speak(u);
        }
      } catch (e) { /* silent game */ }
    },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
      try {
        if (ctx) ramp(master.gain, muted ? 0 : LEVELS.master, 0.15);
        if (muted) { cancelVoice(); endVoice(); }
      } catch (e) { /* ignore */ }
    },
    toggleMute: function () { Sound.setMuted(!muted); return muted; },

    star: function (n) { playSfx(Synth.star, n || 0); },
    bubble: function () {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (now - lastBubble < 90) return;
      lastBubble = now;
      playSfx(Synth.bubble, Math.random());
    },
    boing: function () { playSfx(Synth.boing); },
    splat: function () { playSfx(Synth.splat); },
    fanfare: function () { playSfx(Synth.fanfare); },
    sparkle: function () { playSfx(Synth.sparkle); },

    say: function (key) {
      try {
        if (muted || suspended || !VOICE_TEXT[key]) return;
        cancelVoice();
        var rec = files[key];
        if (rec && rec.ok) {
          currentFile = rec.el;
          rec.el.currentTime = 0;
          rec.el.onended = endVoice;
          duck(true);
          if (duckTimer) clearTimeout(duckTimer);
          duckTimer = setTimeout(endVoice, 6000);
          var pr = rec.el.play();
          if (pr && pr.catch) pr.catch(function () { rec.ok = false; endVoice(); speak(VOICE_TEXT[key]) && duck(true); });
          return;
        }
        if (speak(VOICE_TEXT[key])) {
          duck(true);
          if (duckTimer) clearTimeout(duckTimer);
          duckTimer = setTimeout(endVoice, 6000);   // safety if onend never fires
        }
      } catch (e) { /* ignore */ }
    },

    suspend: function () {
      try {
        suspended = true;
        stopMusic();
        cancelVoice(); endVoice();
        if (ctx && ctx.state === 'running') ctx.suspend();
      } catch (e) { /* ignore */ }
    },
    resume: function () {
      try {
        suspended = false;
        if (!ctx) return;
        var p = ctx.resume(); if (p && p.catch) p.catch(function () {});
        if (musicStarted) { nextSlotTime = ctx.currentTime + 0.1; startMusic(); }
      } catch (e) { /* ignore */ }
    },

    // test hooks (offline rendering / auditioning); not part of the game contract
    _synth: Synth, _levels: LEVELS, _eighth: EIGHTH
  };

  window.Sound = Sound;
})();
