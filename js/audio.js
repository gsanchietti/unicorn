/* Bella's sound designer: js/audio.js
 * ---------------------------------------------------------------------------
 * Everything is synthesized with the Web Audio API (no sound files, no network)
 * except the optional recorded voice cues assets/sounds/<key>.mp3.
 *
 * Public API: window.Sound = { init, isMuted, setMuted, toggleMute, star,
 *   bubble, boing, splat, fanfare, sparkle, clipClop, door, ding, squish, plop,
 *   bell, munch, say, setMood, getMood, setPlace, suspend, resume }
 *   setPlace('street'|'bakery'|'stars') picks the DAY song of a place; setMood('day'|
 *   'night') still switches to the shared lullaby. Both crossfade at a bar line.
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

  var MUTE_KEY = 'bella.muted';
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
  Synth.nightSlot = function (ctx, dest, t, slot, pass) {
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


  // ---- DAY song: 16-bar bouncy loop, 124 bpm, C major (pentatonic lead, C-F-G bass).
  // Marimba lead, bass on beats 1 and 3, soft kick, tiny noise-tick hats.
  var DAY_BPM = 124, DEIGHTH = 60 / DAY_BPM / 2;
  var D_P1 = [5, _, 7, 5, 8, _, 7, _], D_P2 = [6, _, 8, 6, 9, _, 8, _],
      D_P3 = [8, 7, 5, _, 7, 5, 4, _], D_P4 = [5, _, 6, 7, 8, _, _, _], D_P4b = [5, _, 7, _, 5, _, _, _],
      D_B1 = [9, _, 8, 9, 10, _, 9, 8], D_B2 = [8, _, 7, 8, 9, _, 8, 7],
      D_B3 = [7, _, 5, 7, 8, _, 7, 5], D_B4 = [6, 7, 8, _, 5, _, _, _];
  var DAY_MELODY = [D_P1, D_P2, D_P3, D_P4,  D_P1, D_P2, D_P3, D_P4b,
                    D_B1, D_B2, D_B3, D_B4,  D_P1, D_P2, D_P3, D_P4];
  // bass root per bar, semitones relative to C4 (C3, F2, G2, A2)
  var DAY_ROOT = [-12, -19, -17, -12,  -12, -19, -17, -12,  -15, -19, -17, -12,  -12, -19, -17, -12];

  function marimba(ctx, dest, t, f, peak) {
    tone(ctx, dest, t, { f: f, peak: peak, attack: 0.004, dur: 0.30 });
    tone(ctx, dest, t, { f: f * 4, peak: peak * 0.22, attack: 0.003, dur: 0.07 });
    tone(ctx, dest, t, { type: 'triangle', f: f * 2, peak: peak * 0.15, attack: 0.004, dur: 0.12 });
  }
  function tick(ctx, dest, t, peak) {                 // soft filtered-noise hat
    var src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    hp.type = 'bandpass'; hp.frequency.value = 6500; hp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp); hp.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.06);
  }
  function kick(ctx, dest, t, peak) {                 // soft round kick
    tone(ctx, dest, t, { f: 130, f2: 50, glide: 0.1, peak: peak, attack: 0.006, dur: 0.16 });
  }

  /** One eighth-note slot (0..127) of the 16-bar day loop. */
  Synth.daySlot = function (ctx, dest, t, slot, pass) {
    var bar = Math.floor(slot / 8), step = slot % 8, alt = (pass % 2) === 1;
    var m = DAY_MELODY[bar][step];
    if (m >= 0) {
      var pk = (step % 4 === 0) ? 0.5 : 0.4;
      marimba(ctx, dest, t, semis(LADDER_SEMI(m)), pk);
      if (alt && bar < 8) marimba(ctx, dest, t, semis(LADDER_SEMI(m + 2)), 0.16);   // harmony on odd passes
    }
    if (alt && bar === 15 && step >= 4 && step % 2 === 0)                             // little rising fill
      marimba(ctx, dest, t, semis(LADDER_SEMI(5 + ((step - 4) * 1.25 | 0))), 0.3);
    if (step === 0 || step === 4) {
      var root = DAY_ROOT[bar] + (step === 4 ? 7 : 0);
      tone(ctx, dest, t, { f: semis(root), peak: 0.5, attack: 0.008, dur: DEIGHTH * 3.2 });
      tone(ctx, dest, t, { type: 'triangle', f: semis(root + 12), peak: 0.1, attack: 0.008, dur: DEIGHTH * 1.5, lp: 900 });
      if (!(alt && bar >= 8 && bar < 12)) kick(ctx, dest, t, 0.32);
    }
    tick(ctx, dest, t, step % 2 === 1 ? 0.07 : 0.035);
  };

  // ---- STREET song: 16-bar walking loop, 104 bpm, C major. Same marimba family as the
  // day song, but calmer: oom-pah bass, soft off-beat chords, a woodblock tick on 1 and 3.
  var STREET_BPM = 104, SEIGHTH = 60 / STREET_BPM / 2;
  var S_A1 = [5, _, 7, _, 8, 7, 5, _], S_A2 = [6, _, 8, _, 9, 8, 6, _],
      S_A3 = [8, _, 9, 8, 7, _, 5, _], S_A4 = [7, 5, 6, 7, 5, _, _, _],
      S_B1 = [9, _, 8, 9, 10, _, 9, _], S_B2 = [8, _, 7, 8, 9, _, 8, _],
      S_B3 = [7, 8, 7, 5, 4, _, 5, _], S_B4 = [5, _, 7, _, 5, _, _, _];
  var STREET_MELODY = [S_A1, S_A2, S_A3, S_A4,  S_A1, S_A2, S_A3, S_B4,
                       S_B1, S_B2, S_B3, S_A4,  S_A1, S_A2, S_A3, S_B4];
  var STREET_ROOT = [-12, -19, -17, -12,  -12, -19, -17, -12,  -15, -19, -17, -12,  -12, -19, -17, -12];
  // off-beat chord tone (pentatonic ladder index) per bar
  var STREET_CHORD = [2, 3, 3, 2,  2, 3, 3, 2,  1, 3, 3, 2,  2, 3, 3, 2];

  /** One eighth-note slot (0..127) of the 16-bar street loop. */
  Synth.streetSlot = function (ctx, dest, t, slot, pass) {
    var bar = Math.floor(slot / 8), step = slot % 8, alt = (pass % 2) === 1;
    var m = STREET_MELODY[bar][step];
    if (m >= 0) {
      marimba(ctx, dest, t, semis(LADDER_SEMI(m)), (step % 4 === 0) ? 0.46 : 0.36);
      if (alt && bar >= 8 && bar < 12) marimba(ctx, dest, t, semis(LADDER_SEMI(m + 2)), 0.14);
    }
    if (step === 0 || step === 4) {
      var root = STREET_ROOT[bar] + (step === 4 ? 7 : 0);
      tone(ctx, dest, t, { f: semis(root), peak: 0.42, attack: 0.008, dur: SEIGHTH * 3.2 });
      tone(ctx, dest, t, { type: 'triangle', f: semis(root + 12), peak: 0.08, attack: 0.008, dur: SEIGHTH * 1.5, lp: 900 });
      tone(ctx, dest, t, { f: 900, f2: 600, glide: 0.04, peak: 0.05, attack: 0.003, dur: 0.06 });   // soft wood tock
    }
    if (step === 2 || step === 6) {
      marimba(ctx, dest, t, semis(LADDER_SEMI(STREET_CHORD[bar])), 0.13);
      marimba(ctx, dest, t, semis(LADDER_SEMI(STREET_CHORD[bar] + 2)), 0.10);
    }
    tick(ctx, dest, t, step % 2 === 1 ? 0.04 : 0.02);
  };

  /** Soft two-tap hoof step, ~0.12 s. k alternates 0/1: second foot a little higher. */
  Synth.clipClop = function (ctx, dest, t, k) {
    var up = ((k | 0) % 2) ? 1.12 : 1, wob = 1 + (Math.random() - 0.5) * 0.06;
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.065, f = (i ? 420 : 340) * up * wob;
      tone(ctx, dest, tt, { f: f, f2: f * 0.6, glide: 0.04, peak: i ? 0.10 : 0.14, attack: 0.004, dur: 0.055, lp: 1800 });
      tone(ctx, dest, tt, { type: 'triangle', f: f * 2.4, peak: 0.025, attack: 0.003, dur: 0.03 });
    }
  };

  /** Small door chime: three bell notes, E5 G5 C6. */
  Synth.door = function (ctx, dest, t) {
    var notes = [pent(2), pent(3), pent(5)];
    for (var i = 0; i < notes.length; i++) bell(ctx, dest, t + i * 0.17, notes[i] * (i === 2 ? 2 : 1), 0.2, i === 2 ? 0.8 : 0.5);
  };


  // ---- BAKERY song: 16-bar cozy loop, 112 bpm, C major. Music-box lead (the same bell voice
  // as the lullaby, shorter) over soft pizzicato: plucked bass on beats 1 and 3, little chord
  // plucks on the off-beats, a hush of tick. No kick, so it stays warm and never tiring.
  var BAKE_BPM = 112, BEIGHTH = 60 / BAKE_BPM / 2;
  var K_A1 = [8, _, 7, 5, 7, _, 8, _], K_A2 = [9, _, 8, 7, 8, _, _, _],
      K_A3 = [7, _, 8, 9, 8, 7, 5, _], K_A4 = [6, 7, 8, _, 5, _, _, _],
      K_B1 = [5, _, 7, _, 9, _, 8, 7], K_B2 = [8, _, 9, 10, 9, _, 8, _],
      K_B3 = [7, _, 8, _, 7, 6, 5, _], K_B4 = [5, _, 6, 7, 5, _, _, _];
  var BAKERY_MELODY = [K_A1, K_A2, K_A3, K_A4,  K_A1, K_A2, K_A3, K_B4,
                       K_B1, K_B2, K_B3, K_A4,  K_A1, K_A2, K_A3, K_B4];
  var BAKERY_ROOT = [-12, -17, -19, -12,  -12, -17, -19, -12,  -15, -17, -19, -12,  -12, -17, -19, -12];
  var BAKERY_CHORD = [2, 3, 3, 2,  2, 3, 3, 2,  1, 3, 3, 2,  2, 3, 3, 2];

  function pluck(ctx, dest, t, f, peak) {              // soft pizzicato: short triangle + lowpass
    tone(ctx, dest, t, { type: 'triangle', f: f, peak: peak, attack: 0.005, dur: 0.22, lp: 1400 });
    tone(ctx, dest, t, { f: f * 2, peak: peak * 0.2, attack: 0.004, dur: 0.07 });
  }

  /** One eighth-note slot (0..127) of the 16-bar bakery loop. */
  Synth.bakerySlot = function (ctx, dest, t, slot, pass) {
    var bar = Math.floor(slot / 8), step = slot % 8, alt = (pass % 2) === 1;
    var m = BAKERY_MELODY[bar][step];
    if (m >= 0) {
      bell(ctx, dest, t, semis(LADDER_SEMI(m)), (step % 4 === 0) ? 0.42 : 0.32, 0.7);
      if (alt && bar >= 8 && bar < 12) bell(ctx, dest, t, semis(LADDER_SEMI(m + 2)), 0.10, 0.5);
    }
    if (step === 0 || step === 4) {
      var root = BAKERY_ROOT[bar] + (step === 4 ? 7 : 0);
      pluck(ctx, dest, t, semis(root), 0.42);
    }
    if (step === 2 || step === 6) {
      pluck(ctx, dest, t, semis(LADDER_SEMI(BAKERY_CHORD[bar])), 0.16);
      pluck(ctx, dest, t, semis(LADDER_SEMI(BAKERY_CHORD[bar] + 2)), 0.12);
    }
    tick(ctx, dest, t, step % 2 === 1 ? 0.025 : 0.012);
  };

  // ---- Bakery kitchen sounds (all soft and short).
  /** Oven ding: one clear bell, high and bright but gentle (~1.2 s). */
  Synth.ding = function (ctx, dest, t) {
    bell(ctx, dest, t, pent(10) * 2, 0.22, 1.2);          // C7
    bell(ctx, dest, t + 0.012, pent(10) * 2 * 1.5, 0.05, 0.6);
  };
  /** Soft cream squish: low-passed noise puff with a tiny downward bloop (~0.2 s). */
  Synth.squish = function (ctx, dest, t) {
    var src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(lp); lp.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.22);
    tone(ctx, dest, t, { f: 320 + Math.random() * 60, f2: 200, glide: 0.12, peak: 0.1, attack: 0.012, dur: 0.16 });
  };
  /** A topping lands: round little "plop" with a soft sparkle on top (~0.2 s). */
  Synth.plop = function (ctx, dest, t) {
    tone(ctx, dest, t, { f: 520, f2: 260, glide: 0.09, peak: 0.26, attack: 0.006, dur: 0.18 });
    tone(ctx, dest, t, { f: 1040, f2: 600, glide: 0.06, peak: 0.05, attack: 0.005, dur: 0.1 });
    bell(ctx, dest, t + 0.04, pent(8) * 2, 0.06, 0.3);
  };
  /** Shop bell: two bright bell strikes, a fifth apart (~1.2 s). */
  Synth.shopBell = function (ctx, dest, t) {
    bell(ctx, dest, t, pent(8) * 2, 0.2, 0.9);             // G6
    bell(ctx, dest, t + 0.16, pent(5) * 4, 0.18, 1.0);     // C7
  };
  /** Happy nibble, ~0.4 s: three soft low-passed noise bites with a little hum. k unused. */
  Synth.munch = function (ctx, dest, t) {
    for (var i = 0; i < 3; i++) {
      var tt = t + i * 0.12;
      var src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuffer(ctx);
      lp.type = 'lowpass'; lp.frequency.value = 900 + i * 150; lp.Q.value = 1;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.16, tt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
      src.connect(lp); lp.connect(g); g.connect(dest);
      src.start(tt, Math.random() * 0.5); src.stop(tt + 0.1);
      tone(ctx, dest, tt, { f: 240 + i * 40, f2: 180 + i * 30, glide: 0.07, peak: 0.07, attack: 0.01, dur: 0.1 });
    }
    tone(ctx, dest, t + 0.3, { f: pent(8), peak: 0.05, attack: 0.02, dur: 0.1 });   // contented "mm"
  };

  Synth.musicSlot = Synth.nightSlot;   // backwards-compatible name
  var SONGS = {
    night: { slots: 64, step: EIGHTH, fn: Synth.nightSlot, gain: 1 },
    day:   { slots: 128, step: DEIGHTH, fn: Synth.daySlot, gain: 0.7 },
    street: { slots: 128, step: SEIGHTH, fn: Synth.streetSlot, gain: 0.7 },
    bakery: { slots: 128, step: BEIGHTH, fn: Synth.bakerySlot, gain: 0.7 }
  };
  var XFADE = 3;   // seconds, mood crossfade

  // ---------------------------------------------------------------- runtime
  var ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
  var muted = false, suspended = false, musicStarted = false, unlockedSpeech = false;
  var musicTimer = null, nextSlotTime = 0, slotCounter = 0;
  var mood = 'day', place = 'stars', curMood = 'day', pendingMood = null, songBus = {};
  // curMood / pendingMood hold a SONG key: 'day', 'street', 'bakery' or 'night'.
  function wantSong() { return mood === 'night' ? 'night' : (place === 'street' || place === 'bakery' ? place : 'day'); }
  var lastBubble = 0, lastSquish = 0, stepFlip = false;

  try {
    var saved = window.localStorage.getItem(MUTE_KEY);
    if (saved === null) saved = window.localStorage.getItem('stella.muted');   // key before the rename
    muted = saved === '1';
  } catch (e) { muted = false; }

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
      // one sub-bus per song, so moods can be crossfaded under the shared (ducked) musicBus
      curMood = wantSong(); pendingMood = null;
      ['day', 'street', 'bakery', 'night'].forEach(function (k) {
        songBus[k] = ctx.createGain();
        songBus[k].gain.value = (k === curMood) ? SONGS[k].gain : 0;
        songBus[k].connect(musicBus);
      });
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

  /** Move to the wanted song: at the next bar line if music runs, else at once. */
  function applySong() {
    if (!ctx) return;                                  // before init(): remembered, used at start
    var w = wantSong();
    if (musicTimer) { pendingMood = (w !== curMood) ? w : null; return; }
    songBus[curMood].gain.value = 0; songBus[w].gain.value = SONGS[w].gain;
    curMood = w; pendingMood = null; slotCounter = 0;
  }

  // ---- music scheduler (lookahead): setInterval + AudioContext time
  /** Crossfade to another song starting at audio time T. */
  function switchSong(next, T) {
    var out = songBus[curMood].gain, inn = songBus[next].gain;
    out.cancelScheduledValues(T); out.setValueAtTime(out.value, T); out.linearRampToValueAtTime(0, T + XFADE);
    inn.cancelScheduledValues(T); inn.setValueAtTime(inn.value, T); inn.linearRampToValueAtTime(SONGS[next].gain, T + XFADE);
    curMood = next; pendingMood = null; slotCounter = 0;
  }
  function musicTick() {
    if (!ctx || suspended || ctx.state !== 'running') return;
    var horizon = ctx.currentTime + 0.35;
    if (nextSlotTime < ctx.currentTime - 0.1) nextSlotTime = ctx.currentTime + 0.05; // fell behind
    while (nextSlotTime < horizon) {
      if (pendingMood && slotCounter % 8 === 0) switchSong(pendingMood, nextSlotTime);  // bar boundary
      var song = SONGS[curMood], slot = slotCounter % song.slots, pass = Math.floor(slotCounter / song.slots);
      try { song.fn(ctx, songBus[curMood], nextSlotTime, slot, pass); } catch (e) { /* keep going */ }
      nextSlotTime += song.step;
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
  var VOICE_TEXT = { via: 'Si vola!', bravissima: 'Bravissima!', laviamo: 'Laviamoli!', puliti: 'Che puliti!', andiamo: 'Andiamo!',
    chebuona: 'Che buona!', grazie: 'Grazie!' };
  // Recorded voice files. Add a key here after dropping assets/sounds/<key>.mp3,
  // e.g. ['bravissima', 'via']. Keys not listed use the browser's Italian voice,
  // so nothing is requested for missing files.
  var RECORDED = [];
  var files = {};   // key -> { el, ok }
  RECORDED.forEach(function (key) {
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

    /** 'day' (bouncy, default) or 'night' (lullaby). Crossfades over ~3 s at a bar boundary. */
    setMood: function (m) {
      try {
        if (m !== 'day' && m !== 'night') return;
        if (m === mood) return;
        mood = m;
        applySong();
      } catch (e) { /* ignore */ }
    },
    getMood: function () { return mood; },
    /** 'street', 'bakery' or 'stars': which day song plays. Night stays the shared lullaby. */
    setPlace: function (p) {
      try {
        if (p !== 'street' && p !== 'bakery' && p !== 'stars') return;
        if (p === place) return;
        place = p;
        applySong();
      } catch (e) { /* ignore */ }
    },

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
    clipClop: function () { stepFlip = !stepFlip; playSfx(Synth.clipClop, stepFlip ? 1 : 0); },
    door: function () { playSfx(Synth.door); },
    ding: function () { playSfx(Synth.ding); },
    squish: function () {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (now - lastSquish < 150) return;
      lastSquish = now;
      playSfx(Synth.squish);
    },
    plop: function () { playSfx(Synth.plop); },
    bell: function () { playSfx(Synth.shopBell); },
    munch: function () { playSfx(Synth.munch); },

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
    _synth: Synth, _levels: LEVELS, _eighth: EIGHTH, _dayEighth: DEIGHTH, _songs: SONGS,
    _song: function () { return curMood; }, _voiceText: VOICE_TEXT
  };

  window.Sound = Sound;
})();
