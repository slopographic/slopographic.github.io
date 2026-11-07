/* SlopIsolate: the shared config kind 'project' for app 'cutout' (shared/config, HANDOFF.md there). The file holds the look
   that new pictures start with: edge settings (threshold, softness, feather, decontaminate, refine), the background (transparent,
   colour, blur, gradient or the picture's own), the shadow and the crop. Pictures are not in the file. Import sets the look
   new pictures start with (and remembers it, as the look panel does); the open pictures keep their own look. Classic script.
   Exposes window.CO.config. */
(function () {
  'use strict';
  const CO = window.CO, C = window.SlopConfig, D = window.SlopConfigDialog, F = C && C.F;
  const APP = 'cutout';
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const clone = (o) => ({ s: { ...o.s }, bg: { ...o.bg, image: null }, shadow: { ...o.shadow }, crop: { ...o.crop } });

  function read() {
    const d = clone(CO.state.defaults);
    return {
      look: {
        edges: { threshold: d.s.threshold, softness: d.s.softness, feather: d.s.feather, decontaminate: !!d.s.decontaminate, refine: !!d.s.refine },
        background: { mode: d.bg.mode, color: d.bg.color, blur: d.bg.blur, gradA: d.bg.gradA, gradB: d.bg.gradB, angle: d.bg.angle },
        shadow: { on: !!d.shadow.on, opacity: d.shadow.opacity, blur: d.shadow.blur, x: d.shadow.x, y: d.shadow.y, color: d.shadow.color },
        crop: { mode: d.crop.mode, pad: d.crop.pad },
      },
    };
  }

  /** The file's look as the app's look object (the picture itself is never in it). */
  function lookFrom(l) {
    const base = clone(CO.state.defaults);
    return {
      s: Object.assign(base.s, { threshold: l.edges.threshold, softness: l.edges.softness, feather: l.edges.feather, decontaminate: l.edges.decontaminate, refine: l.edges.refine }),
      bg: Object.assign(base.bg, l.background, { image: null }),
      shadow: Object.assign(base.shadow, l.shadow),
      crop: Object.assign(base.crop, l.crop),
    };
  }

  async function apply(data) {
    const look = lookFrom(data.look);
    CO.state.defaults = clone(look);
    CO.util.store.set('look', CO.state.defaults);
    if (window.SlopUI) SlopUI.toast(window.CO.util.t('cutout.config.applied'));
  }

  if (C && D && F) {
    const edge = F.obj({
      threshold: F.num({ min: 0, max: 1, required: true, desc: 'cut-off between subject and background, 0 to 1' }),
      softness: F.num({ min: 0, max: 5, required: true, desc: 'how soft the edge is' }),
      feather: F.num({ min: 0, max: 50, required: true, desc: 'feather in pixels' }),
      decontaminate: F.bool({ desc: 'remove the old background colour from the edge' }),
      refine: F.bool({ desc: 'refine the edge with the mask' }),
    }, { required: true });
    C.registerKind('project', APP, {
      strict: true,
      fields: {
        look: F.obj({
          edges: edge,
          background: F.obj({
            mode: F.enum(['transparent', 'color', 'blur', 'gradient', 'image'], { required: true, desc: 'image means the picture\'s own background; it is not in the file' }),
            color: F.str({ max: 7, pattern: HEX, desc: 'colour as #rrggbb' }),
            blur: F.num({ min: 0, max: 200, desc: 'blur radius in pixels (blur mode)' }),
            gradA: F.str({ max: 7, pattern: HEX, desc: 'gradient start colour' }),
            gradB: F.str({ max: 7, pattern: HEX, desc: 'gradient end colour' }),
            angle: F.num({ min: 0, max: 360, desc: 'gradient angle in degrees' }),
          }, { required: true }),
          shadow: F.obj({
            on: F.bool({ required: true }), opacity: F.num({ min: 0, max: 1, desc: '0 to 1' }),
            blur: F.num({ min: 0, max: 100, desc: 'blur in pixels' }), x: F.num({ min: -500, max: 500, desc: 'x offset' }),
            y: F.num({ min: -500, max: 500, desc: 'y offset' }), color: F.str({ max: 7, pattern: HEX, desc: 'shadow colour' }),
          }, { required: true }),
          crop: F.obj({
            mode: F.str({ max: 20, required: true, desc: 'original, or the crop mode the app offers (e.g. square)' }),
            pad: F.num({ min: 0, max: 500, desc: 'padding around the subject in pixels' }),
          }, { required: true }),
        }, { required: true, desc: 'the look new pictures start with' }),
      },
    }, apply, { label: 'Look', description: 'Edge, background, shadow and crop settings for new pictures', read });
    window.CO.config = { read };
    window.CO.configCommands = () => D.commands({ app: APP, prefix: 'cutout' });
    D.install({ app: APP });
  }
})();
