/* scenes/title.js - the start page: the name (HTML #title), Bella and Bongo,
 * the play button and the best score as medal + stars. Only the play button
 * starts: it asks for full screen and goes to the street, Bella's screen box
 * ({x, y, h}, center and height) passed on as args.hero.
 * Registers the 'title' scene with window.Core (home: none, no day/night cycle,
 * music: 'street').
 */
(function () {
  'use strict';

  var Art = window.Art, Core = window.Core, CHR = window.Characters;
  var W = 0, H = 0, M = 0, DPR = 1, reduced = false;
  function sync() { W = Core.W; H = Core.H; M = Core.M; DPR = Core.DPR; reduced = Core.reduced; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var t = 0, scroll = 0, best = 0;
  var hero = { x: 0, y: 0, h: 100 };
  var pose = { t: 0, run: 0, wave: 0, happy: 0, look: 0, glow: 0.5, face: undefined };
  var S = {};

  // Start page: the name is HTML (#title) at the top, then the hero, the play button, the best score.
  function titleTarget() {
    return { x: W / 2, y: H * 0.35, h: Math.min(H * 0.28, W * 0.55) };
  }
  function playButton() {
    return { x: W / 2, y: H * 0.65, r: M * 0.14 };
  }
  function place() {
    var tt = titleTarget();
    hero.x = tt.x; hero.y = tt.y; hero.h = tt.h;
  }
  // The background drifts at 0.3 of the star game's speed.
  function baseSpeed() { return Math.max(0.26 * W, 0.18 * H); }

  function drawHero(g) {
    var bob = reduced ? 0 : Math.sin(t * 2.4) * M * 0.006;
    var k = hero.h / CHR.H;
    g.save();
    g.translate(hero.x, hero.y + bob);
    g.scale(k, k);
    g.translate(-CHR.W / 2, -CHR.H / 2);
    CHR.draw(g, pose, S.ppu);
    g.restore();
  }

  function drawTitleUI(g) {
    var pb = playButton(), r = pb.r, cx = pb.x, cy = pb.y;
    Art.drawPlayButton(g, cx, cy, r, t);
    if (best > 0) {
      var big = Math.floor(best / 10), small = best % 10;
      var medR = M * 0.05, y = cy + r + M * 0.1 + medR;
      var bigR = M * 0.032, smR = M * 0.019;
      var items = big + small;
      var step = Math.min(bigR * 2.3, (W * 0.8 - medR * 3) / Math.max(items, 1));
      var total = medR * 2 + M * 0.025 + (big ? big * step : 0) + small * Math.min(step, smR * 2.4);
      var x = cx - total / 2;
      Art.drawMedal(g, x + medR, y, medR);
      x += medR * 2 + M * 0.025;
      var i;
      for (i = 0; i < big; i++) {
        Art.drawSprite(g, S.star, x + step / 2, y, bigR / S.starR, 1, 0);
        x += step;
      }
      for (i = 0; i < small; i++) {
        var ss = Math.min(step, smR * 2.4);
        Art.drawSprite(g, S.star, x + ss / 2, y, smR / S.starR, 1, 0);
        x += ss;
      }
    }
  }

  Core.register('title', {
    home: null,
    clock: false,
    music: 'street',
    enter: function () {
      sync();
      best = parseInt(Core.load('bella.best', ['stella.best']), 10) || 0;
      place();
    },
    exit: function () {},
    update: function (dt) {
      sync();
      t += dt;
      scroll += baseSpeed() * 0.3 * dt;
      place();
      pose.t = t;
      pose.face = reduced ? 0 : undefined;   // auto: Bongo turns to the player now and then
    },
    render: function (g) {
      sync();
      Backdrop.draw(g, scroll);
      drawHero(g);
      drawTitleUI(g);
    },
    pointer: function (type, p) {
      if (type !== 'down') return;
      sync();
      // Only the play button starts the game; generous target for small fingers.
      var pb = playButton();
      if (Math.hypot(p.x - pb.x, p.y - pb.y) > pb.r * 1.35) return;
      Core.goFullscreen();
      Core.go('street', { hero: { x: hero.x, y: hero.y, h: hero.h } });
    },
    resize: function () {
      sync();
      S.starR = clamp(M * 0.062, 20, 46);
      S.star = Art.starSprite(S.starR, DPR, { face: true });
      // Drawn at the star game's flying scale, so the Characters cache
      // (2 scales: flying and washing) is never rebuilt for the start page.
      S.ppu = Math.min(H * 0.42, W * 0.52) / CHR.H * DPR;
      CHR.prerender(S.ppu);
      place();
    }
  });
})();
