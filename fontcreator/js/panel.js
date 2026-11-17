/* Slop Font: the right panel (shared/frame/panel.js, the suite's rule): the settings of the glyph being drawn (width and
 * side bearings, the stroke tool's pen, what to draw it from), the font's names and licence, and its metrics. The
 * characters, the handwriting sheet, the export and the footer (Download font, the main action) are js/panel-more.js.
 * Fields show the state and change it through FC.state.edit (undoable). Classic script. FC.panel: mount(el), paint(). */
(function (g) {
  'use strict';
  const S = () => g.FC.state, F = () => g.SlopFont, t = (k, v) => g.FC.t(k, v);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  let side = null;
  const parts = {};
  const OFL = 'This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org';

  /** A labelled control; label and note are keys (the panel is rendered again on a language change). */
  function field(label, control, note) {
    const l = el('label', { class: 'sf-field' }, el('span', { class: 'sf-lab' }, t(label)), control);
    if (note) l.append(el('span', { class: 'sf-note' }, t(note)));
    return l;
  }
  const num = (id, min, max) => el('input', { type: 'number', id, min, max, step: '1', inputmode: 'numeric' });
  const text = (id, max) => el('input', { type: 'text', id, maxlength: String(max || 200), autocomplete: 'off', spellcheck: 'false' });
  const button = (id, label, run) => { const b = el('button', { type: 'button', class: 'sui-btn', id }, t(label)); b.addEventListener('click', () => { try { const r = run(); if (r && r.catch) r.catch((e) => g.SlopUI.toast(e.message)); } catch (e) { g.SlopUI.toast(e.message); } }); return b; };
  function onNum(input, fn) {
    input.addEventListener('change', () => { const v = Number(input.value); if (input.value === '' || !Number.isFinite(v)) { paint(); return; } try { fn(Math.round(v)); } catch (e) { g.SlopUI.toast(e.message); paint(); } });
  }

  function glyphSection() {
    const adv = num('fc-advance', 0, 20000), lsb = num('fc-lsb', -5000, 5000), rsb = num('fc-rsb', -5000, 5000);
    onNum(adv, (v) => S().edit(t('fontcreator.panel.undo_width'), 'glyph', (p, gl) => { F().model.setSides(gl, { advance: v }); }));
    onNum(lsb, (v) => S().edit(t('fontcreator.panel.undo_lsb'), 'glyph', (p, gl) => { F().model.setSides(gl, { lsb: v }); }));
    onNum(rsb, (v) => S().edit(t('fontcreator.panel.undo_rsb'), 'glyph', (p, gl) => { F().model.setSides(gl, { rsb: v }); }));
    const sw = num('fc-stroke-width', 1, 1000), cap = el('select', { id: 'fc-stroke-cap' });
    for (const v of ['round', 'square', 'butt']) cap.append(el('option', { value: v }, t(`fontcreator.panel.cap_${v}`)));
    onNum(sw, (v) => S().set({ strokeWidth: Math.max(1, Math.min(1000, v)) }));
    cap.addEventListener('change', () => S().set({ cap: cap.value }));
    const grid = num('fc-grid', 1, 500);
    onNum(grid, (v) => S().set({ grid: Math.max(1, Math.min(500, v)) }));
    Object.assign(parts, { adv, lsb, rsb, sw, cap, grid });
    const from = el('div', { class: 'fc-btns' },
      button('fc-from-svg', 'fontcreator.panel.from_svg', () => g.FC.svgUi.open()),
      button('fc-from-picture', 'fontcreator.panel.from_picture', () => g.FC.traceUi.pick()),
      button('fc-copy-from', 'fontcreator.panel.copy_from', async () => {
        const k = await g.SlopUI.prompt(t('fontcreator.panel.copy_from_title'), t('fontcreator.panel.copy_from_msg'), '');
        if (k) g.SlopUI.toast(t('fontcreator.panel.copied', { name: g.FC.ops.copyFrom(k.trim()) }));
      }),
      button('fc-add-from', 'fontcreator.panel.add_from', async () => {
        const k = await g.SlopUI.prompt(t('fontcreator.panel.add_from_title'), t('fontcreator.panel.add_from_msg'), '');
        if (k) g.SlopUI.toast(t('fontcreator.panel.added', { name: g.FC.ops.copyFrom(k.trim(), { add: true }) }));
      }),
      button('fc-merge', 'fontcreator.cmd.merge', () => g.FC.ops.merge()),
      button('fc-delete-glyph', 'fontcreator.panel.delete_glyph', async () => {
        const v = S().view();
        if (v.virtual) throw new Error(t('fontcreator.panel.not_in_font'));
        if (!(await g.SlopUI.confirm(t('fontcreator.panel.delete_title'), t('fontcreator.panel.delete_msg', { name: v.name }), t('ui.delete'), { danger: true }))) return;
        S().edit(t('fontcreator.panel.undo_delete', { name: v.name }), 'project', (p) => F().model.remove(p, v.id));
      }));
    return { title: t('fontcreator.panel.glyph'), key: 'glyph', settings: [
      el('div', { class: 'fc-trio' }, field('fontcreator.panel.width', adv), field('fontcreator.panel.lsb', lsb), field('fontcreator.panel.rsb', rsb)),
      from, el('div', { class: 'fc-duo' }, field('fontcreator.panel.stroke_width', sw), field('fontcreator.panel.stroke_ends', cap)),
      field('fontcreator.panel.grid', grid, 'fontcreator.panel.grid_note')] };
  }
  const INFO = [['family', 120], ['style', 60], ['version', 20], ['designer', 120], ['designerURL', 200], ['manufacturer', 120], ['copyright', 300], ['licenseURL', 200]];   // labels: fontcreator.info.<key>
  function fontSection() {
    const list = [];
    for (const [k, max] of INFO) {
      const i = text('fc-info-' + k, max), label = 'fontcreator.info.' + k;
      i.addEventListener('change', () => { try { S().edit(t('fontcreator.panel.undo_change', { what: t(label) }), 'meta', (p) => { p.info = F().model.cleanInfo(Object.assign({}, p.info, { [k]: i.value })); }); } catch (e) { g.SlopUI.toast(e.message); } });
      parts['info_' + k] = i;
      list.push(field(label, i));
    }
    const weight = el('select', { id: 'fc-info-weight' });
    for (let v = 100; v <= 900; v += 100) weight.append(el('option', { value: String(v) }, `${v} ${t(`fontcreator.weight.w${v}`)}`));
    weight.addEventListener('change', () => S().edit(t('fontcreator.panel.undo_change', { what: t('fontcreator.info.weight') }), 'meta', (p) => { p.info.weight = Number(weight.value); }));
    const lic = el('textarea', { id: 'fc-info-license', rows: '3', maxlength: '4000' }), desc = el('textarea', { id: 'fc-info-description', rows: '2', maxlength: '4000' });
    lic.addEventListener('change', () => S().edit(t('fontcreator.panel.undo_change', { what: t('fontcreator.info.license') }), 'meta', (p) => { p.info.license = lic.value.slice(0, 4000); }));
    desc.addEventListener('change', () => S().edit(t('fontcreator.panel.undo_change', { what: t('fontcreator.info.description') }), 'meta', (p) => { p.info.description = desc.value.slice(0, 4000); }));
    Object.assign(parts, { weight, lic, desc });
    list.splice(2, 0, field('fontcreator.info.weight', weight));
    list.push(field('fontcreator.info.license', lic), button('fc-ofl', 'fontcreator.panel.ofl', () => S().edit(t('fontcreator.panel.undo_ofl'), 'meta', (p) => {
      p.info.license = OFL; p.info.licenseURL = 'https://openfontlicense.org';
    })), field('fontcreator.info.description', desc));
    return { title: t('fontcreator.panel.font'), key: 'font', settings: list };
  }
  const METRICS = [['ascender'], ['capHeight'], ['xHeight'], ['descender'], ['lineGap']];   // labels: fontcreator.metric.<key>
  function metricsSection() {
    const list = [];
    for (const [k] of METRICS) {
      const i = num('fc-m-' + k, -20000, 20000), label = 'fontcreator.metric.' + k;
      onNum(i, (v) => S().edit(t('fontcreator.panel.undo_change', { what: t(label) }), 'meta', (p) => { p.metrics = F().model.cleanMetrics(Object.assign({}, p.metrics, { [k]: v })); }));
      parts['m_' + k] = i;
      list.push(field(label, i));
    }
    parts.upm = el('output', { id: 'fc-upm' });
    return { title: t('fontcreator.panel.metrics'), key: 'metrics', settings: [el('div', { class: 'fc-duo' }, ...list), field('fontcreator.panel.upm', parts.upm, 'fontcreator.panel.upm_note')] };
  }
  function setVal(i, v) { if (i && document.activeElement !== i) i.value = v == null ? '' : String(v); }
  function paint() {
    if (!side) return;
    const p = S().project(), v = S().view(), sd = F().model.sides(v), st = S().settings();
    setVal(parts.adv, v.advance); setVal(parts.lsb, sd.box ? sd.lsb : ''); setVal(parts.rsb, sd.box ? sd.rsb : '');
    parts.lsb.disabled = parts.rsb.disabled = !sd.box;
    setVal(parts.sw, st.strokeWidth); parts.cap.value = st.cap; setVal(parts.grid, st.grid);
    for (const [k] of INFO) setVal(parts['info_' + k], p.info[k]);
    parts.weight.value = String(p.info.weight); setVal(parts.lic, p.info.license); setVal(parts.desc, p.info.description);
    for (const [k] of METRICS) setVal(parts['m_' + k], p.metrics[k]);
    parts.upm.textContent = String(p.metrics.upm);
    g.FC.panelMore.paint();
  }
  function mount(panelEl) {
    side = g.SlopFrame.panel(panelEl, { title: t('fontcreator.panel.font') });
    const render = () => side.render([glyphSection(), ...g.FC.panelMore.sections(), fontSection(), metricsSection()]);
    render();
    S().on(paint);
    g.FC.onLang(() => { side.setTitle(t('fontcreator.panel.font')); render(); paint(); });   // every label, note and option
    paint();
    return side;
  }
  g.FC.panel = { mount, paint, side: () => side, parts: () => parts, OFL };
})(window);
