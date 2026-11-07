/* SlopIsolate — the look sections of the settings panel: Background, Shadow and Crop. panel.js appends
 * them. Each control is a kit control bound to one field (a path of core/settings.js) of what the panel edits: the image on
 * screen or every selected picture (undo per drag, one step for all; a field whose values differ shows as mixed). */
(function () {
  'use strict';
  const CO = window.CO, S = CO.state, K = CO.kit, ST = CO.settings, t = CO.util.t;
  const PL = CO.panelLook = {};
  const pct = (v) => Math.round(v * 100) + '%';
  const px = (v) => v + ' px';
  const show = (el, on) => { el.hidden = !on; };

  /** Slider bound to one look field. */
  function slider(bind, label, min, max, step, fmt, path, look) {
    const c = K.slider({ label: t(label), min, max, step, value: ST.get(S.defaults, path), fmt, onInput: look.input, onCommit: look.commit });
    bind((it, M) => c.sync(M.value(path), M.mixed(path)));
    return c;
  }
  /** Colour row bound to one look field. */
  function colour(bind, label, path, look) {
    const c = K.color({ label: t(label), value: ST.get(S.defaults, path), onInput: look.input, onCommit: look.commit });
    bind((it, M) => c.sync(M.value(path), M.mixed(path)));
    return c;
  }

  function background(bind) {
    const mode = K.look('cutout.undo.bg', 'bg.mode');
    const col = K.look('cutout.undo.bg_color', 'bg.color');
    const blur = K.look('cutout.undo.blur', 'bg.blur');
    const gA = K.look('cutout.undo.grad_a', 'bg.gradA');
    const gB = K.look('cutout.undo.grad_b', 'bg.gradB');
    const ang = K.look('cutout.undo.grad_angle', 'bg.angle');

    const seg = K.seg({
      options: [['transparent', t('cutout.panel.transparent')], ['color', t('cutout.panel.colour')], ['gradient', t('cutout.panel.gradient')], ['blur', t('cutout.panel.blur')]],
      value: S.defaults.bg.mode, onChange: (v) => mode.once(v),
    });
    const colRow = colour(bind, 'cutout.panel.colour', 'bg.color', col);
    const blurRow = slider(bind, 'cutout.panel.blur', 0, 80, 1, px, 'bg.blur', blur);
    const aRow = colour(bind, 'cutout.panel.start', 'bg.gradA', gA);
    const bRow = colour(bind, 'cutout.panel.end', 'bg.gradB', gB);
    const angRow = slider(bind, 'cutout.panel.angle', 0, 360, 1, (v) => v + '°', 'bg.angle', ang);
    bind((it, M) => {
      const m = M.mixed('bg.mode') ? null : M.value('bg.mode');
      seg.sync(m, m == null);
      show(colRow, m === 'color');
      show(blurRow, m === 'blur');
      show(aRow, m === 'gradient');
      show(bRow, m === 'gradient');
      show(angRow, m === 'gradient');
    });
    return K.section(t('cutout.panel.background'), seg, colRow, blurRow, aRow, bRow, angRow);
  }

  function shadow(bind) {
    const on = K.look('cutout.undo.shadow', 'shadow.on');
    const op = K.look('cutout.undo.shadow_opacity', 'shadow.opacity');
    const bl = K.look('cutout.undo.shadow_blur', 'shadow.blur');
    const sx = K.look('cutout.undo.shadow_x', 'shadow.x');
    const sy = K.look('cutout.undo.shadow_y', 'shadow.y');
    const sc = K.look('cutout.undo.shadow_color', 'shadow.color');

    const chk = K.check({ label: t('cutout.panel.drop_shadow'), checked: S.defaults.shadow.on, onChange: (v) => on.once(v) });
    const rows = [
      slider(bind, 'cutout.panel.opacity', 0, 1, 0.01, pct, 'shadow.opacity', op),
      slider(bind, 'cutout.panel.blur', 0, 30, 0.5, px, 'shadow.blur', bl),
      slider(bind, 'cutout.panel.offset_x', -100, 100, 1, px, 'shadow.x', sx),
      slider(bind, 'cutout.panel.offset_y', -100, 100, 1, px, 'shadow.y', sy),
      colour(bind, 'cutout.panel.colour', 'shadow.color', sc),
    ];
    bind((it, M) => {
      const on = M.value('shadow.on'), mixed = M.mixed('shadow.on');
      chk.sync(on, mixed);
      for (const r of rows) r.input.disabled = !on && !mixed;
    });
    return K.section(t('cutout.panel.shadow'), chk, ...rows);
  }

  function crop(bind) {
    const mode = K.look('cutout.undo.crop', 'crop.mode');
    const pad = K.look('cutout.undo.crop_pad', 'crop.pad');
    const seg = K.seg({
      options: [['original', t('cutout.panel.original')], ['subject', t('cutout.panel.subject')]],
      value: S.defaults.crop.mode, onChange: (v) => mode.once(v),
    });
    const padRow = slider(bind, 'cutout.panel.padding', 0, 64, 1, px, 'crop.pad', pad);
    bind((it, M) => {
      const mixed = M.mixed('crop.mode');
      seg.sync(M.value('crop.mode'), mixed);
      padRow.input.disabled = !mixed && M.value('crop.mode') !== 'subject';
    });
    return K.section(t('cutout.panel.crop'), seg, padRow);
  }

  /** The three look sections. bind(fn) registers fn(it) to run on every panel refresh (it = active image or null). */
  PL.build = function (bind = () => {}) {
    return [background(bind), shadow(bind), crop(bind)];
  };
})();
