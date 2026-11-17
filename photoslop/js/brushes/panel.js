/* PhotoSlop brushes: Brushes panel and Brush Settings */
'use strict';

/* ---------- Brushes panel ---------- */
const previewCache = new Map();
function buildBrushesPanel() {
  const wrap = h('div', { class: 'bp-panel' });
  const render = () => {
    wrap.textContent = '';
    const cur = brushTarget().preset;
    for (const pack of allPacks()) {
      if (!pack.brushes.length && !pack.mine) continue;
      const head = h('div', { class: 'bpk-head' }, h('span', null, packLabel(pack)), h('span', { class: 'bpk-n' }, pack.brushes.length));
      if (!pack.builtin) {
        const ex = h('button', { type: 'button', class: 'bpk-btn', title: tr('photoslop.brush.export_pack') }, '⇩'); ex.addEventListener('click', () => exportPack(pack));
        const del = h('button', { type: 'button', class: 'bpk-btn', title: tr('photoslop.brush.remove_pack') }, '×'); del.addEventListener('click', async () => { if (await SlopUI.confirm(tr('photoslop.brush.remove_pack_q'), tr('photoslop.brush.remove_pack_body', { name: pack.name, n: pack.brushes.length }), tr('ui.remove'), { danger: true })) { customPacks = customPacks.filter((p) => p !== pack); await saveBrushPacks(); emit('brushes'); } });
        head.append(ex, del);
      }
      const grid = h('div', { class: 'bpk-grid' });
      for (const b of pack.brushes) {
        const key = pack.name + '|' + b.name + '|' + theme();
        if (!previewCache.has(key)) previewCache.set(key, presetPreview(b));
        const btn = h('button', { type: 'button', class: 'bpk-b' + (cur === b.name ? ' on' : ''), title: `${brushLabel(b)} · ${b.size}px` }, previewCache.get(key), h('span', null, brushLabel(b)));
        btn.addEventListener('click', () => applyPreset(b));
        ctxTarget(btn, 'brush', () => [{ label: tr('photoslop.brush.use'), act: () => applyPreset(b) }, { label: tr('photoslop.brush.settings_dots'), act: () => { applyPreset(b); dlgBrushSettings(); } }, !pack.builtin ? { label: tr('photoslop.brush.delete_brush'), act: async () => { pack.brushes.splice(pack.brushes.indexOf(b), 1); await saveBrushPacks(); emit('brushes'); } } : null]);
        grid.append(btn);
      }
      wrap.append(head, grid);
    }
  };
  const I = (text, title) => Object.assign({ 'data-i18n': text }, title ? { title: tr(title), 'data-i18n-attr': 'title:' + title } : {});
  const bar = h('div', { class: 'bp-bar' },
    h('button', Object.assign({ type: 'button', class: 'btn', onclick: () => SlopIntake.pick({ to: 'photoslop.brushes' }) }, I('photoslop.brush.import', 'photoslop.brush.import_tip')), tr('photoslop.brush.import')),
    h('button', Object.assign({ type: 'button', class: 'btn', onclick: () => dlgBrushSettings() }, I('photoslop.brush.settings_btn')), tr('photoslop.brush.settings_btn')),
    h('button', Object.assign({ type: 'button', class: 'btn', onclick: () => defineBrushFromSelection() }, I('photoslop.brush.from_selection', 'photoslop.brush.from_selection_tip')), tr('photoslop.brush.from_selection')));
  listeners.add((w) => { if (w === 'brushes' || w === 'theme') render(); });
  onLang(render);
  render();
  return h('div', null, bar, wrap);
}

/* ---------- Brush Settings ---------- */
function dlgBrushSettings() {
  const o = brushTarget();
  Object.keys(DYN).forEach((k) => { if (o[k] === undefined) o[k] = DYN[k]; });
  const prev = h('canvas', { class: 'bs-preview', width: 520, height: 140 });
  const draw = () => {
    const g = cx(prev); g.clearRect(0, 0, prev.width, prev.height);
    g.fillStyle = theme() === 'pro' ? '#1a1a1a' : '#ffffff'; g.fillRect(0, 0, prev.width, prev.height);
    const d = makeDabber(Object.assign({}, o, { size: Math.min(o.size, 90) }), theme() === 'pro' ? '#e8e8e8' : '#111111', false);
    const st = new Stroker(() => d.spacing(1), (x, y, pr) => d.dab(g, x, y, pr));
    const pt = (t) => ({ x: 40 + t * 440, y: 70 + Math.sin(t * Math.PI * 2) * 38, pressure: 1 });
    st.begin(pt(0)); for (let i = 1; i <= 60; i++) st.to(pt(i / 60));
  };
  const rows = [];
  const range = (label, key, min, max, step, fmt = (v) => v, toV = (v) => v, fromV = (v) => v) => {
    const r = h('input', { type: 'range', min, max, step, value: fromV(o[key]) }), n = h('span', { class: 'bs-v' }, fmt(fromV(o[key])));
    r.addEventListener('input', () => { o[key] = toV(+r.value); n.textContent = fmt(+r.value); o.preset = null; saveToolOptions(); draw(); });
    rows.push(h('label', { class: 'bs-row' }, h('span', null, label), r, n));
  };
  const pctF = (v) => Math.round(v) + '%';
  range(tr('photoslop.brush.s_size'), 'size', 1, 1000, 1, (v) => v + 'px');
  range(tr('photoslop.brush.s_hardness'), 'hardness', 0, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_spacing'), 'spacing', 1, 300, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_angle'), 'angle', -180, 180, 1, (v) => v + '°');
  range(tr('photoslop.brush.s_roundness'), 'roundness', 5, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_flow'), 'flow', 1, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_size_jitter'), 'sizeJitter', 0, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_angle_jitter'), 'angleJitter', 0, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_scatter'), 'scatter', 0, 300, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_count'), 'count', 1, 6, 1);
  range(tr('photoslop.brush.s_opacity_jitter'), 'opacityJitter', 0, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  range(tr('photoslop.brush.s_hue_jitter'), 'hueJitter', 0, 100, 1, pctF, (v) => v / 100, (v) => v * 100);
  const tipSel = SlopUI.select(tipOptions(o), o.tip || 'round');
  tipSel.addEventListener('change', () => { o.tip = tipSel.value; o.preset = null; saveToolOptions(); draw(); });
  const follow = SlopUI.check(tr('photoslop.brush.follow'), o.follow); follow.input.addEventListener('change', () => { o.follow = follow.input.checked; draw(); saveToolOptions(); });
  const pop = SlopUI.check(tr('photoslop.brush.pressure_opacity'), o.pressureOpacity); pop.input.addEventListener('change', () => { o.pressureOpacity = pop.input.checked; saveToolOptions(); });
  const body = h('div', { class: 'bs' }, prev, SlopUI.field(tr('photoslop.brush.tip'), tipSel), h('div', { class: 'bs-grid' }, rows), h('div', { class: 'bs-checks' }, follow.el, pop.el));
  draw();
  SlopUI.dialog({ title: tr('photoslop.brush.settings'), cls: 'sui-wide bs-dlg', body, buttons: [
    { label: tr('photoslop.brush.save_preset'), act: async () => {
      const name = await SlopUI.prompt(tr('photoslop.brush.new_preset'), tr('photoslop.brush.name'), o.preset || tr('photoslop.brush.my_brush')); if (name == null) return false;
      const b = Object.assign({}, o, { name: name || tr('photoslop.brush.my_brush') }); delete b.preset; delete b.k; delete b.pressure; delete b.blend;
      if (b.tip === 'image') b.image = maskToDataURL(TIP_IMAGES.get(b.tipImage));
      myBrushes().brushes.push(b); await saveBrushPacks(); o.preset = b.name; emit('brushes'); toast(tr('photoslop.brush.saved', { name: b.name }));
      return false;
    } },
    { label: tr('ui.done'), primary: true },
  ], onClose: () => { buildOptions(); emit('brushes'); } });
}
