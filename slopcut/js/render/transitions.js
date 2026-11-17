/* SlopCut: the transition library. TR.params(type, role, q, w, h, solo) gives the drawing terms for one side of a
   transition at progress q (0 to 1). Role 'out' is the clip leaving, 'in' the clip arriving; solo means there is no
   clip underneath (a fade into the track below). Sizes are in sequence pixels (w × h): the compositor scales them to
   the output, the transition preview draws them at its own size. Both use these terms, so they show the same motion.
   Result: { hide, alpha, dx, dy, sc, rot, blur, clip: [x, y, w, h] | null, overlay: { col, a } | null, slices | null }.
   slices (glitch only) is a list of { rect, dx } bands; the compositor draws the layer once per band. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const TR = SE.transitions = {};
  /** Default length (s) for a transition added from the Effects tab or by click; the duration slider sets it. */
  TR.DUR = { min: 0.2, max: 3, step: 0.1 };
  TR.dur = U.clamp(+U.store.get('trDur', 1) || 1, TR.DUR.min, TR.DUR.max);
  TR.setDur = (v) => { const n = +v; TR.dur = U.clamp(isFinite(n) ? n : 1, TR.DUR.min, TR.DUR.max); U.store.set('trDur', TR.dur); };
  TR.list = () => M.TRANSITIONS;
  TR.label = (type) => ((M.TRANSITIONS.find((x) => x[0] === type) || [null, type || ''])[1]);

  const inOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const outCubic = (x) => 1 - Math.pow(1 - x, 3);
  const BANDS = 8, GLITCH_TICKS = 12;
  /** Pseudo-random in [0, 1) from a number (the same input always gives the same band offset). */
  const rnd = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

  /** Glitch: the outgoing clip breaks into shifting bands that grow until the cut at q = 0.5; the incoming one settles. */
  function glitch(inR, q, w, h, P) {
    if (inR ? q < 0.5 : q >= 0.5) { P.hide = true; return P; }
    const power = inR ? 1 - (q - 0.5) * 2 : q * 2, amp = w * 0.05 * power, tick = Math.floor(q * GLITCH_TICKS);
    P.slices = Array.from({ length: BANDS }, (_, b) => ({ rect: [0, (b * h) / BANDS, w, h / BANDS + 1], dx: (rnd(b * 7 + tick * 13 + (inR ? 101 : 0)) * 2 - 1) * amp }));
    return P;
  }

  TR.params = function (type, role, q, w, h, solo) {
    const P = { hide: false, alpha: 1, dx: 0, dy: 0, sc: 1, rot: 0, blur: 0, clip: null, overlay: null, slices: null };
    const inR = role === 'in', x = U.clamp(q, 0, 1);
    switch (type) {
      case 'cross': if (inR) P.alpha = x; break;
      case 'blur': if (inR) { P.alpha = x; P.blur = (1 - x) * h * 0.03; } else P.blur = x * h * 0.03; break;
      case 'black': case 'white': {
        const col = type === 'black' ? '#000' : '#fff';
        if (solo) { if (inR) P.overlay = { col, a: 1 - x }; }            // fade in from the colour over the track below
        else if (!inR) { if (x >= 0.5) P.hide = true; else P.overlay = { col, a: x * 2 }; }
        else if (x < 0.5) P.hide = true; else P.overlay = { col, a: (1 - x) * 2 };
        break;
      }
      case 'wipe': if (inR) P.clip = [0, 0, w * x, h]; break;
      case 'wipe-left': if (inR) P.clip = [w * (1 - x), 0, w * x, h]; break;
      case 'wipe-up': if (inR) P.clip = [0, h * (1 - x), w, h * x]; break;
      case 'wipe-down': if (inR) P.clip = [0, 0, w, h * x]; break;
      case 'slide': if (inR) P.dx = (1 - inOut(x)) * w; break;
      case 'push': P.dx = inR ? (1 - inOut(x)) * w : -inOut(x) * w; break;
      case 'zoom-in':
        if (inR) { P.alpha = x; P.sc = 0.5 + 0.5 * outCubic(x); } else { P.alpha = 1 - x; P.sc = 1 + 0.5 * inOut(x); }
        break;
      case 'zoom-out':
        if (inR) { P.alpha = x; P.sc = 1.5 - 0.5 * outCubic(x); } else { P.alpha = 1 - x; P.sc = 1 - 0.5 * inOut(x); }
        break;
      case 'spin':
        if (inR) { P.alpha = x; P.rot = -90 * (1 - inOut(x)); P.sc = 0.5 + 0.5 * inOut(x); } else { P.alpha = 1 - x; P.rot = 90 * inOut(x); P.sc = 1 - 0.5 * inOut(x); }
        break;
      case 'glitch': return glitch(inR, x, w, h, P);
      default: if (inR) P.alpha = x; // an unknown id falls back to a cross dissolve
    }
    return P;
  };
})();
