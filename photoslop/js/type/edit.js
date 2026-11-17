/* PhotoSlop type: on-canvas text editing (a contenteditable box of styled spans) and the Type tool.
 * The box shows the rich text at the current zoom; the whole edit becomes one history step. */
'use strict';

const TE = { el: null, layerId: null, t: null, sel: { s: 0, e: 0 }, orig: null };
function teSpanCss(st, z) { return `font:${typeFont(st, z)};color:${st.color};letter-spacing:${trackPx(st) * z}px`; }
/** Rebuild the box from TE.t (keeps the selection when the box has focus). */
function teRender(keepSel) {
  const el = TE.el, t = TE.t, z = V.zoom, arr = charOverrides(t), base = baseStyle(t);
  const had = keepSel && document.activeElement === el ? teGetSel() : null;
  el.textContent = '';
  let i = 0;
  while (i < t.str.length) {
    const key = arr[i] ? JSON.stringify(arr[i]) : ''; let j = i;
    while (j < t.str.length && (arr[j] ? JSON.stringify(arr[j]) : '') === key) j++;
    const sp = h('span', { 'data-o': key || '{}' }, t.str.slice(i, j));
    sp.style.cssText = teSpanCss(Object.assign({}, base, arr[i] || {}), z);
    el.append(sp); i = j;
  }
  el.append(h('br', { 'data-end': '' }));
  el.style.cssText = teSpanCss(base, z);
  layoutTypeEdit();
  if (had) teSetSel(had.s, had.e);
}
function teOffset(node, off) { const r = document.createRange(); r.setStart(TE.el, 0); r.setEnd(node, off); return r.toString().length; }
function teGetSel() {
  const s = getSelection(); if (!TE.el || !s.rangeCount) return null;
  const r = s.getRangeAt(0);
  if (!TE.el.contains(r.startContainer) || !TE.el.contains(r.endContainer)) return null;
  return { s: teOffset(r.startContainer, r.startOffset), e: teOffset(r.endContainer, r.endOffset) };
}
function teSetSel(s, e) {
  const pos = (n) => {
    const w = document.createTreeWalker(TE.el, NodeFilter.SHOW_TEXT); let node, left = n, last = null;
    while ((node = w.nextNode())) { last = node; if (left <= node.length) return [node, left]; left -= node.length; }
    return last ? [last, last.length] : [TE.el, 0];
  };
  const r = document.createRange(), a = pos(s), b = pos(e);
  r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  TE.sel = { s, e };
}
/** Read the text and its runs back from the box. Returns false if the DOM needs rebuilding. */
function teRead() {
  const arr = []; let str = '', clean = true;
  const walk = (node, o) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { str += n.data; for (let k = 0; k < n.data.length; k++) arr.push(o); }
      else if (n.nodeName === 'BR') { if (n.hasAttribute('data-end') && n === TE.el.lastChild) continue; clean = false; str += '\n'; arr.push(o); }
      else if (n.nodeName === 'SPAN' && node === TE.el) { let oo = null; try { oo = JSON.parse(n.dataset.o || '{}'); } catch (e) { /* ignore */ } walk(n, oo && Object.keys(oo).length ? oo : null); }
      else { clean = false; if (/^(DIV|P)$/.test(n.nodeName) && str && !str.endsWith('\n')) { str += '\n'; arr.push(o); } walk(n, o); }
    }
  };
  walk(TE.el, null);
  TE.t.str = str; TE.t.runs = packRuns(TE.t, arr);
  return clean;
}
function startTypeEdit(p, L, selectAll) {
  endTypeEdit();
  const t = L ? normText(L.text) : normText(Object.assign({}, T.type, { str: '', x: Math.round(p.x), y: Math.round(p.y), color: C.fg }));
  const el = h('div', { class: 'type-edit', contenteditable: 'plaintext-only', spellcheck: 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-label': tr('photoslop.type.layer_text') });
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  Object.assign(TE, { el, layerId: L ? L.id : null, t, orig: L ? JSON.stringify(normText(L.text)) : null, sel: { s: 0, e: selectAll ? t.str.length : t.str.length } });
  if (L) live = { layerId: L.id, surface: () => ({ canvas: scratchCanvas('b', 1, 1), x: 0, y: 0, w: 1, h: 1 }) };
  // a phone's on-screen keyboard (shared/input/keyboard.js): the view pans so the box shows above it
  el.slopKeyboard = { reveal: (need) => { const d = viewDelta(0, -need.dy); V.ox += d.x; V.oy += d.y; layoutTypeEdit(); dirty(); } };
  V.el.append(el);
  teRender(false);
  el.addEventListener('input', (e) => { if (e.isComposing) return; const sel = teGetSel(); if (!teRead()) { teRender(false); if (sel) teSetSel(sel.s, sel.e); } layoutTypeEdit(); });
  el.addEventListener('paste', (e) => { e.preventDefault(); const s = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; document.execCommand('insertText', false, s.replace(/\r\n?/g, '\n')); }); // intake-ok: text pasted into the type editor (no files)
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); endTypeEdit(true); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); endTypeEdit(); }
    else if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
    else if ((e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) { e.preventDefault(); if (e.key.toLowerCase() === 'b') setTypeProps({ bold: !typeStyleNow().bold }); if (e.key.toLowerCase() === 'i') setTypeProps({ italic: !typeStyleNow().italic }); }
    e.stopPropagation();
  });
  setTimeout(() => { if (TE.el !== el) return; el.focus(); teSetSel(TE.sel.s, TE.sel.e); }, 0);
  emit('typesel');
  dirty(true);
}
document.addEventListener('selectionchange', () => { if (!TE.el) return; const s = teGetSel(); if (s) { TE.sel = s; emit('typesel'); } });
/** Restyle the selected characters (or everything when nothing is selected) while editing. */
function teApply(patch) {
  if (!TE.el) return;
  const { s, e } = TE.sel;
  TE.t = setTextStyle(TE.t, s, e, patch);
  teRender(true);
  dirty(true);
}
function layoutTypeEdit() {
  if (!TE.el) return;
  const t = TE.t, el = TE.el, u = toScreen(t.x, t.y), s = hostPt(u.x, u.y); // the box turns with the view (view-rot.js)
  Object.assign(el.style, { left: s.x + 'px', top: s.y + 'px', textAlign: t.align, lineHeight: (t.leading || 120) / 100, minWidth: t.size * V.zoom * 0.6 + 'px', transformOrigin: '0 0', transform: V.rot ? `rotate(${V.rot}deg)` : '' });
}
async function endTypeEdit(cancel) {
  if (!TE.el) return;
  const el = TE.el, id = TE.layerId;
  teRead();
  const t = TE.t;
  TE.el = null; el.remove();
  live = null; emit('typesel');
  if (cancel) { dirty(true); return; }
  t.str = t.str.replace(/\s+$/, '');
  t.runs = t.runs.filter((r) => r.s < t.str.length).map((r) => ({ s: r.s, e: Math.min(r.e, t.str.length), o: r.o }));
  await loadTextFonts(t);
  if (!t.str) { if (id) { const i = layerIndex(id); if (i >= 0 && D.layers.length > 1) { D.layers.splice(i, 1); D.activeId = D.layers[Math.max(0, i - 1)].id; commit(tr('photoslop.type.step_delete')); } } dirty(true); return; }
  if (id && JSON.stringify(t) === TE.orig) { dirty(true); return; }
  const r = renderTextCanvas(t), name = t.str.split('\n')[0].slice(0, 32);
  if (id && layerIndex(id) >= 0) { patchLayer(id, { canvas: r.canvas, x: r.x, y: r.y, text: t, name }); commit(tr('photoslop.type.step_edit')); }
  else addLayer({ name, canvas: r.canvas, x: r.x, y: r.y, text: t }, tr('photoslop.type.step_new'));
}
/** Edit a type layer with all its text selected (double-click on its thumbnail, Layer ▸ Type ▸ Edit Text). */
function editTypeLayer(L = activeLayer()) {
  if (!L || !L.text) return;
  if (UI.tool !== 'type') selectTool('type');
  D.activeId = L.id; UI.editMask = false; emit('doc');
  startTypeEdit(null, L, true);
  showCharacterPanel();
}
listeners.add((w) => { if (w === 'zoom' && TE.el) teRender(true); });
// Double-click on a text layer, with any tool: edit its text (the Type tool already does this on a single press).
listeners.add((w) => { if (w === 'dblclick' && !TE.el && V.lastDbl) { const L = textLayerAt(V.lastDbl); if (L) editTypeLayer(L); } });
defTool({ id: 'type', nk: 'type', key: 'T', icon: ICON('M5 5V3h14v2M12 3v18M9 21h6'),
  down(p, e) { if (e && e.target && e.target.closest && e.target.closest('.type-edit')) return; if (TE.el) { endTypeEdit(); return; } startTypeEdit(p, textLayerAt(p)); },
  deactivate() { endTypeEdit(); },
  hover(p) { V.el.style.cursor = 'text'; },
  overlay() { if (TE.el) layoutTypeEdit(); },
});
