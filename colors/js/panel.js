/* Slop Colors: the right panel (shared/frame/panel.js, the suite's rule): only the settings: what to make from the colour
 * (harmony, scale, steps), how many colours to find in a picture, and the palette's name and export format; at its foot
 * Download palette (the main action), Save to Slop Drive…, Copy code and Open in…. The colour and its values are in the
 * main view (js/values.js). Classic script. */
(function (g) {
  'use strict';
  const S = () => g.CO.state, X = () => g.SlopColors;
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let side = null, parts = null;
  /** A harmony's, a scale's or a format's name in the current language (core/ keeps the English one). */
  const label = (kind, id, en) => (g.SlopI18n && g.SlopI18n.has('colors.' + kind + '.' + id) ? t('colors.' + kind + '.' + id) : en);

  function field(label, control, note) {
    const l = el('label', { class: 'sf-field' }, el('span', { class: 'sf-lab' }, label), control);
    if (note) l.append(el('span', { class: 'sf-note' }, note));
    return l;
  }
  function select(id) { return el('select', { id }); }
  /** The options of the three lists, in the current language (the chosen value is kept). */
  function options() {
    const H = X().harmony, P = parts;
    const fill = (s, list) => { const v = s.value; s.replaceChildren(...list.map(([id, txt]) => el('option', { value: id }, txt))); if (v) s.value = v; };
    fill(P.harmony, H.HARMONIES.map(([id, en]) => [id, label('harmony', id, en)]));
    fill(P.scale, H.SCALES.map(([id, en]) => [id, label('scale', id, en)]));
    fill(P.format, X().formats.FORMATS.map((f) => [f.id, label('format', f.id, f.label)]));
  }
  function build() {
    if (!parts) {
      parts = { harmony: select('co-harmony-kind'), scale: select('co-scale-kind'), format: select('co-format'),
        steps: el('input', { type: 'number', id: 'co-steps', min: '2', max: '12', step: '1' }),
        k: el('input', { type: 'number', id: 'co-k', min: '2', max: '12', step: '1' }),
        name: el('input', { type: 'text', id: 'co-pal-name', maxlength: '80', autocomplete: 'off' }) };
      wire();
    }
    options();
    const P = parts;
    return [
      { title: t('colors.panel.gen'), key: 'gen', settings: [field(t('colors.panel.harmony'), P.harmony), field(t('colors.panel.scale'), P.scale), field(t('colors.panel.steps'), P.steps)] },
      { title: t('colors.panel.pic'), key: 'pic', settings: [field(t('colors.panel.k'), P.k, t('colors.panel.k_note'))] },
      { title: t('colors.panel.export'), key: 'export', settings: [field(t('colors.panel.name'), P.name), field(t('colors.panel.format'), P.format)] },
    ];
  }
  function wire() {
    const P = parts;
    P.harmony.addEventListener('change', () => S().set({ harmony: P.harmony.value }));
    P.scale.addEventListener('change', () => S().set({ scale: P.scale.value }));
    P.steps.addEventListener('change', () => S().set({ steps: P.steps.value }));
    P.k.addEventListener('change', () => { S().set({ k: P.k.value }); g.CO.picture.find(); });
    P.name.addEventListener('input', () => S().set({ palette: { name: P.name.value || 'Palette', colors: S().get().palette.colors } }));
    P.format.addEventListener('change', () => S().set({ format: P.format.value }));
  }
  /** Puts the state into the controls, except the one being typed in. */
  function paint(s) {
    const P = parts, active = document.activeElement;
    P.harmony.value = s.harmony; P.scale.value = s.scale; P.steps.value = s.steps; P.k.value = s.k;
    if (active !== P.name) P.name.value = s.palette.name;
    P.format.value = s.format;
    footer(s);
  }
  function footer(s) {
    const IO = g.CO.io, n = s.palette.colors.length, f = X().formats.FORMATS.find((x) => x.id === s.format) || X().formats.FORMATS[0];
    side.footer([
      { id: 'co-download', label: t('colors.panel.download', { ext: f.ext }), primary: true, disabled: !n, run: () => IO.download() },
      { id: 'co-drive', label: t('colors.panel.drive'), disabled: !n, run: () => IO.saveToDrive().catch((e) => g.SlopUI.toast(t('colors.panel.save_failed', { msg: e.message }))) },
      { id: 'co-copy-code', label: t('colors.panel.copy_code'), disabled: !n || f.id === 'ase', run: () => IO.copyCode() },
      { id: 'co-openin', label: t('colors.panel.open_in'), disabled: !n, menu: () => IO.openInItems() },
    ], { stack: true, more: t('ui.settings'), note: n ? t('colors.panel.count', { n, name: s.palette.name }) : t('colors.panel.empty') });
  }
  function mount(panelEl) {
    side = g.SlopFrame.panel(panelEl, { title: t('ui.settings') });
    side.render(build());
    return side;
  }
  /** Again in the current language (a language change): the title, the sections and the lists' options. */
  function redraw() {
    if (!side) return;
    side.setTitle(t('ui.settings'));
    side.render(build());
  }
  g.CO.panel = { mount, paint, footer, redraw, parts: () => parts };
})(window);
