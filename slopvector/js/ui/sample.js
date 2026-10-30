/* SlopVector — ui: the Sloppo sample document */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};

  /* ================= sample document ================= */
  SV.sampleDoc = function () {
    var mk = SV.mk, d = SV.newDoc(1200, 800, 'Sloppo');
    var bg = mk.layer('Background', '#4f8bff'), slop = mk.layer('Sloppo', '#2fc65a'), type = mk.layer('Type', '#ff4f7b');
    var INK = '#0a0a0a', LIME = '#d4ff3a';
    var limeBody = { type: 'radial', cx: 0.38, cy: 0.3, r: 0.85, fx: 0.33, fy: 0.22, stops: [{ o: 0, c: '#f7ffcf', a: 1 }, { o: 0.28, c: '#dcff52', a: 1 }, { o: 0.72, c: '#a3d600', a: 1 }, { o: 1, c: '#6a9600', a: 1 }] };
    var limeGoo = { type: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: [{ o: 0, c: '#c9f227', a: 1 }, { o: 1, c: '#7fa800', a: 1 }] };
    bg.children.push(
      mk.rect(0, 0, 1200, 800, 0, { fill: { type: 'radial', cx: 0.32, cy: 0.5, r: 0.8, fx: 0.32, fy: 0.5, stops: [{ o: 0, c: '#fbf9f3', a: 1 }, { o: 1, c: '#e6e0d1', a: 1 }] } }, 'Paper'),
      mk.ellipse(400, 440, 330, 330, { fill: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ o: 0, c: LIME, a: 0.55 }, { o: 0.6, c: LIME, a: 0.18 }, { o: 1, c: LIME, a: 0 }] } }, 'Glow'),
      mk.star(176, 176, 26, 7, 4, { fill: INK }, 'Sparkle'),
      mk.star(622, 132, 16, 4.5, 4, { fill: INK }, 'Sparkle small'),
      mk.star(1110, 648, 24, 7, 4, { fill: LIME, stroke: INK, sw: 3, join: 'round' }, 'Sparkle lime'),
      mk.star(96, 470, 12, 3.5, 4, { fill: INK }, 'Sparkle tiny'),
      mk.text(60, 74, 'SLOPOGRAPHIC  Nº 002', { family: 'JetBrains Mono', size: 14, weight: 600, tracking: 120 }, { fill: '#8a8577' }, 'Kicker')
    );
    var shadowGlow = mk.ellipse(408, 690, 270, 22, { fill: '#0a0a0a', opacity: 0.12 }, 'Shadow');
    var puddle = mk.d('M150 646C146 622 236 610 300 614C360 604 450 606 520 612C600 608 676 622 668 648C662 672 580 684 470 680C400 690 300 686 236 680C176 676 152 664 150 646Z', { fill: limeGoo, stroke: INK, sw: 6, join: 'round' }, 'Puddle');
    var dropL = mk.ellipse(124, 664, 11, 8, { fill: '#b5e000', stroke: INK, sw: 4 }, 'Goo drop');
    var dropR = mk.ellipse(698, 660, 8, 6, { fill: '#b5e000', stroke: INK, sw: 4 }, 'Goo drop');
    var body = mk.d('M236 622C236 560 240 490 262 420C290 320 336 244 404 240C474 236 520 312 548 410C568 482 572 560 570 622C590 630 604 640 598 650C520 664 290 666 210 650C204 640 216 628 236 622Z', { fill: limeBody, stroke: INK, sw: 6, join: 'round' }, 'Body');
    var gloss = mk.ellipse(318, 330, 20, 44, { fill: '#ffffff', opacity: 0.78 }, 'Gloss');
    gloss.m = G.rotate(28 * PI / 180, 318, 330);
    var glossDot = mk.ellipse(298, 398, 8, 8, { fill: '#ffffff', opacity: 0.78 }, 'Gloss dot');
    var eyeL = mk.ellipse(352, 420, 30, 40, { fill: INK }, 'Eye left'), eyeR = mk.ellipse(458, 420, 30, 40, { fill: INK }, 'Eye right');
    var sp1 = mk.ellipse(342, 404, 11, 11, { fill: '#ffffff' }, 'Sparkle'), sp2 = mk.ellipse(364, 440, 5, 5, { fill: '#ffffff' }, 'Sparkle');
    var sp3 = mk.ellipse(448, 404, 11, 11, { fill: '#ffffff' }, 'Sparkle'), sp4 = mk.ellipse(470, 440, 5, 5, { fill: '#ffffff' }, 'Sparkle');
    var eyes = mk.group([eyeL, eyeR, sp1, sp2, sp3, sp4], 'Eyes');
    var blush = mk.group([mk.ellipse(298, 478, 24, 13, { fill: '#ff6fae', opacity: 0.6 }, 'Blush left'), mk.ellipse(512, 478, 24, 13, { fill: '#ff6fae', opacity: 0.6 }, 'Blush right')], 'Blush');
    var mouth = mk.d('M384 474C394 492 420 492 430 474', { stroke: INK, sw: 6, cap: 'round', join: 'round' }, 'Smile');
    var tuft = mk.d('M404 242C398 214 414 194 434 196C452 198 454 222 436 224', { stroke: INK, sw: 6, cap: 'round', join: 'round' }, 'Tuft');
    var flying = mk.d('M512 150C512 150 492 178 492 192C492 203 501 212 512 212C523 212 532 203 532 192C532 178 512 150 512 150Z', { fill: limeBody, stroke: INK, sw: 4, join: 'round' }, 'Flying drop');
    slop.children.push(shadowGlow, puddle, dropL, dropR, body, gloss, glossDot, eyes, blush, mouth, tuft, flying);
    var word = mk.text(656, 352, 'SLOP\nVECTOR', { family: 'Archivo', size: 108, weight: 900, lh: 0.9, tracking: -12 }, { fill: INK }, 'Wordmark');
    var tag = mk.text(660, 506, 'The illustrator clone nobody asked for.', { family: 'Inter Tight', size: 24, weight: 500 }, { fill: '#3b3a36' }, 'Tagline');
    var pillR = mk.rect(658, 546, 344, 46, 23, { fill: LIME, stroke: INK, sw: 3 }, 'Pill');
    var pillT = mk.text(830, 575, '100% LOCAL · 0% UPLOADS', { family: 'JetBrains Mono', size: 16, weight: 600, align: 'center', tracking: 40 }, { fill: INK }, 'Pill label');
    type.children.push(word, tag, mk.group([pillR, pillT], 'Badge'));
    d.layers = [bg, slop, type];
    return d;
  };
})();
