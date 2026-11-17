/* PhotoSlop type: changing type properties (options bar, Character panel, colour picker, Warp Text).
 * While editing, a change restyles the selected characters (all of them when nothing is selected) and
 * is part of the edit's one history step. With a type layer selected, it restyles the whole layer at once:
 * sliders and colour drags preview live and commit one step when they settle. */
'use strict';

/** The history step of a property change: photoslop.type.step_<name>. */
const TYPE_LABEL = { font: 'font', size: 'font_size', bold: 'font_style', italic: 'font_style', color: 'text_color', tracking: 'tracking', align: 'align', leading: 'leading', aa: 'aa', warp: 'warp' };
let typePending = null;
/** The style shown by the controls: the selection while editing, else the active type layer, else the tool defaults. */
function typeStyleNow() {
  if (TE.el) { const { s, e } = TE.sel; const t = TE.t; return Object.assign({}, t, styleAt(t, s < e ? s : s - 1)); }
  const L = activeLayer();
  if (L && L.text) return normText(L.text);
  return Object.assign({}, TYPE_DEFAULTS, T.type, { color: C.fg, warp: Object.assign({}, TYPE_DEFAULTS.warp) });
}
const typeTarget = () => !!TE.el || !!(activeLayer() && activeLayer().text);
function flushTypePending() { if (typePending) { clearTimeout(typePending.timer); const l = typePending.label; typePending = null; commit(l); } }
/** Apply a patch of type properties. final=false previews (layer mode) and commits once it settles. */
async function setTypeProps(patch, final = true) {
  const label = tr('photoslop.type.step_' + (TYPE_LABEL[Object.keys(patch)[0]] || 'character'));
  for (const k in patch) if (k !== 'color' && k !== 'warp' && k in TYPE_DEFAULTS) T.type[k] = patch[k];
  saveToolOptions();
  if (patch.font || patch.bold != null || patch.italic != null) { try { await document.fonts.load(typeFont(Object.assign({}, typeStyleNow(), patch, { size: 20 }))); } catch (e) { /* offline */ } }
  if (TE.el) { teApply(patch); emit('typeprops'); return true; }
  const L = activeLayer();
  if (!L || !L.text) { emit('typeprops'); return false; }
  const t = setTextStyle(L.text, 0, L.text.str.length, patch), r = renderTextCanvas(t);
  patchLayer(L.id, { text: t, canvas: r.canvas, x: r.x, y: r.y });
  if (typePending && typePending.id !== L.id) flushTypePending();
  if (final) { if (typePending) { clearTimeout(typePending.timer); typePending = null; } commit(label); }
  else {
    if (typePending) clearTimeout(typePending.timer);
    typePending = { id: L.id, label, timer: setTimeout(flushTypePending, 600) };
    emit('doc');
  }
  emit('typeprops');
  return true;
}
/** Put a layer record back after a cancelled preview (no history entry). */
function revertTypePreview(orig) {
  if (typePending) { clearTimeout(typePending.timer); typePending = null; }
  const i = layerIndex(orig.id); if (i >= 0) { D.layers[i] = orig; emit('doc'); }
}
listeners.add((w) => { if (w === 'history' && typePending && Hist.states[Hist.idx] && Hist.states[Hist.idx].label !== typePending.label) { clearTimeout(typePending.timer); typePending = null; } });
// The foreground colour is the text colour while the Type tool works on a type layer (as in Photoshop's editing mode).
let typeColorSync = false;
listeners.add((w) => { if (w === 'color' && !typeColorSync && UI.tool === 'type' && typeTarget() && typeStyleNow().color !== C.fg) setTypeProps({ color: C.fg }, false); });

/* ---------- controls (options bar and Character panel share them) ---------- */
function typeControls(full) {
  const wrap = h('div', { class: full ? 'char-panel' : 'type-opts' }), sync = [];
  const lab = (text, ...kids) => h('label', { class: 'opt' }, text ? h('span', null, text) : null, ...kids);
  const font = h('select', { 'aria-label': tr('photoslop.type.font_family'), 'data-k': 'font' });
  // The shared picker is stripped from the offline single-file build; there the plain list stays.
  const fontPick = window.SlopFonts ? SlopFonts.attach(font, { legacy: TYPE_FONTS, onPick: (f) => setTypeProps({ font: f }) }) : null;
  if (!fontPick) { font.append(...TYPE_FONTS.map((f) => h('option', { value: f }, f))); font.addEventListener('change', () => setTypeProps({ font: font.value })); }
  sync.push((s) => { if (![...font.options].some((o) => o.value === s.font)) font.add(new Option(s.font, s.font)); font.value = s.font; });
  const style = h('select', { 'aria-label': tr('photoslop.type.font_style'), 'data-k': 'style' }, [['0', 'regular'], ['1', 'bold'], ['2', 'italic'], ['3', 'bold_italic']].map(([v, k]) => h('option', { value: v }, tr('photoslop.type.style_' + k))));
  style.addEventListener('change', () => setTypeProps({ bold: !!(+style.value & 1), italic: !!(+style.value & 2) }));
  sync.push((s) => { style.value = String((s.bold ? 1 : 0) + (s.italic ? 2 : 0)); });
  const num = (label, key, min, max, unit, step = 1) => {
    const i = h('input', { type: 'number', class: 'opt-num', min, max, step, 'aria-label': label, 'data-k': key });
    i.addEventListener('change', () => setTypeProps({ [key]: clamp(+i.value || 0, min, max) }));
    sync.push((s) => { if (document.activeElement !== i) i.value = Math.round(s[key] * 10) / 10; });
    return lab(label, i, unit ? h('span', { class: 'opt-u' }, unit) : null);
  };
  const sizeR = h('input', { type: 'range', min: 4, max: 600, 'aria-label': tr('photoslop.type.size_slider'), 'data-k': 'size-range' });
  sizeR.addEventListener('input', () => setTypeProps({ size: +sizeR.value }, false));
  sizeR.addEventListener('change', () => setTypeProps({ size: +sizeR.value }, true));
  sync.push((s) => { if (document.activeElement !== sizeR) sizeR.value = s.size; });
  const color = h('button', { type: 'button', class: 'type-color', title: tr('photoslop.type.text_colour'), 'aria-label': tr('photoslop.type.text_colour'), 'data-k': 'color' });
  color.addEventListener('click', async () => { const v = await pickColorDialog(tr('photoslop.type.text_colour_title'), typeStyleNow().color); if (v) setTypeProps({ color: v }); });
  sync.push((s) => { color.style.background = s.color; });
  const align = h('div', { class: 'opt seg', role: 'group', 'aria-label': tr('photoslop.type.para_align') }); // i18n-ignore: a class name
  for (const [a, d] of [['left', 'M4 6h16M4 10h10M4 14h16M4 18h10'], ['center', 'M4 6h16M7 10h10M4 14h16M7 18h10'], ['right', 'M4 6h16M10 10h10M4 14h16M10 18h10']]) {
    const b = h('button', { type: 'button', class: 'seg-b', 'data-align': a, title: tr('photoslop.type.align_' + a), 'aria-label': tr('photoslop.type.align_' + a), html: `<svg viewBox="0 0 24 24"><path d="${d}" stroke="currentColor" stroke-width="2" fill="none"/></svg>` });
    b.addEventListener('click', () => setTypeProps({ align: a }));
    align.append(b);
  }
  sync.push((s) => $$('.seg-b', align).forEach((b) => b.classList.toggle('on', b.dataset.align === s.align)));
  const aa = h('select', { 'aria-label': tr('photoslop.type.antialias'), 'data-k': 'aa' }, AA_MODES.map(([v, l]) => h('option', { value: v }, l)));
  aa.addEventListener('change', () => setTypeProps({ aa: aa.value }));
  sync.push((s) => { aa.value = s.aa || 'smooth'; });
  const warp = h('button', { type: 'button', class: 'btn', title: tr('photoslop.type.warp_text_dots'), 'data-k': 'warp' }, tr('photoslop.type.warp'));
  warp.addEventListener('click', dlgWarpText);
  wrap.append(lab('', font, ...(fontPick ? [fontPick.button, fontPick.fontsButton] : [])), lab('', style), num(tr('photoslop.type.size'), 'size', 1, 1296, 'px'));
  if (!full) wrap.append(sizeR);
  else wrap.append(num(tr('photoslop.type.tracking'), 'tracking', -1000, 1000, '‰'), num(tr('photoslop.type.leading'), 'leading', 50, 400, '%'));
  wrap.append(lab(tr('photoslop.type.colour'), color), align, lab(tr('photoslop.type.aa_short'), aa), warp);
  const refresh = () => { if (!wrap.isConnected) return; const s = typeStyleNow(); for (const f of sync) f(s); };
  listeners.add((w) => { if (['doc', 'typesel', 'typeprops', 'tool', 'history'].includes(w)) refresh(); });
  refresh();
  return wrap;
}
function buildTypeOptions(add) { add(typeControls(false), h('span', { class: 'opt-hint' }, tr('photoslop.type.hint', { mod: MOD }))); }
function buildCharPanel() { if (store.get('collapsed.character', null) == null) store.set('collapsed.character', true); return typeControls(true); }
function showCharacterPanel() {
  const p = $('#panel-character'); if (!p) return;
  p.classList.remove('collapsed'); p.firstChild.setAttribute('aria-expanded', 'true'); store.set('collapsed.character', false);
  if (window.innerWidth < 900) return; // phones: the options bar already shows the controls
  p.scrollIntoView({ block: 'nearest' });
}
function dlgWarpText() {
  if (!typeTarget()) { toast(tr('photoslop.type.select_layer_first')); return; }
  const start = typeStyleNow().warp || { style: 'none', bend: 0 }, L0 = activeLayer(), editing = !!TE.el, origT = editing ? TE.t : null;
  const sty = SlopUI.select(WARP_STYLES, start.style), bend = h('input', { type: 'range', min: -100, max: 100, value: start.bend, 'aria-label': tr('photoslop.type.bend') });
  const val = () => ({ style: sty.value, bend: +bend.value });
  const prev = () => setTypeProps({ warp: val() }, false);
  sty.addEventListener('change', prev); bend.addEventListener('input', prev);
  dialog({ title: tr('photoslop.type.warp_text'), body: h('div', { class: 'form' }, field(tr('photoslop.type.style'), sty), field(tr('photoslop.type.bend'), bend, '%')),
    buttons: [{ label: tr('menu.cancel'), act: () => { if (editing) { TE.t = origT; if (TE.el) teRender(true); } else revertTypePreview(L0); } },
      { label: tr('menu.ok'), primary: true, act: () => setTypeProps({ warp: val() }, true) }],
    onClose: (ok) => { if (!ok && typePending) revertTypePreview(L0); } });
}
