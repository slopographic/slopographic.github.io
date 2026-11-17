/* PhotoSlop Layers panel: each layer's effects as indented rows under the layer, in stack order.
 * A row has an eye toggle, its order number, its label and an edit button. Double-click, the edit
 * button and "Edit effect…" open the Layer Style dialog. Rows drag to reorder within their layer.
 * Keys on a focused row: Enter edits, Delete removes, Alt+Up and Alt+Down move. */
'use strict';

const FX_EYE_SVG = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>';
let fxDrag = null;

/** The <li> rows for a layer's effects, in stack order (index 0 is applied first). */
function fxRows(L) {
  const list = L.fx || [];
  return list.map((e, i) => fxRow(L, e, i));
}
function fxRow(L, e, i) {
  const label = fxLabel(e), on = e.on !== false;
  const eye = h('button', { type: 'button', class: 'lp-eye fx-eye' + (on ? ' on' : ''), title: tr(on ? 'photoslop.fx.hide_tip' : 'photoslop.fx.show_tip'), 'aria-label': tr(on ? 'photoslop.fx.hide_named' : 'photoslop.fx.show_named', { name: label }), html: FX_EYE_SVG });
  eye.addEventListener('click', (ev) => { ev.stopPropagation(); setFxProps(L.id, e.id, { on: !on }, tr(on ? 'photoslop.fx.hide_effect' : 'photoslop.fx.show_effect')); });
  const edit = h('button', { type: 'button', class: 'lp-btn fx-edit', title: tr('photoslop.fx.edit_tip'), 'aria-label': tr('photoslop.fx.edit_named', { name: label }), html: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>' });
  edit.addEventListener('click', (ev) => { ev.stopPropagation(); openFxDialog(L.id, e.id); });
  const row = h('li', { class: 'fx' + (on ? '' : ' off'), role: 'option', tabindex: '0', draggable: 'true', 'data-layer': String(L.id), 'data-fx': String(e.id), 'aria-label': `${i + 1}. ${label}`, title: tr('photoslop.fx.row_tip') },
    eye, h('span', { class: 'fx-n' }, String(i + 1)), h('span', { class: 'fx-name' }, label), edit);
  row.addEventListener('dblclick', (ev) => { ev.stopPropagation(); openFxDialog(L.id, e.id); });
  row.addEventListener('click', () => { if (D.activeId !== L.id) { D.activeId = L.id; UI.editMask = false; emit('doc'); emit('tool'); } });
  ctxTarget(row, 'fx', () => fxItems(L, e));
  row.addEventListener('dragstart', (ev) => { fxDrag = { layer: L.id, id: e.id }; ev.stopPropagation(); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', label); row.classList.add('dragging'); });
  row.addEventListener('dragend', () => { fxDrag = null; $$('li.fx').forEach((r) => r.classList.remove('dragging', 'drop-above', 'drop-below')); });
  row.addEventListener('dragover', (ev) => {
    if (!fxDrag || fxDrag.layer !== L.id) return;
    ev.preventDefault(); ev.stopPropagation();
    const r = row.getBoundingClientRect(), above = ev.clientY < r.top + r.height / 2;
    row.classList.toggle('drop-above', above); row.classList.toggle('drop-below', !above);
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
  row.addEventListener('drop', (ev) => { // intake-ok: an effect row dragged to a new place (no files)
    if (!fxDrag || fxDrag.layer !== L.id) return;
    ev.preventDefault(); ev.stopPropagation();
    const r = row.getBoundingClientRect(), above = ev.clientY < r.top + r.height / 2;
    const from = fxIndex(L.id, fxDrag.id);
    fxDrag = null;
    let to = fxIndex(L.id, e.id) + (above ? 0 : 1);
    if (from < to) to--;
    moveFx(L.id, from, to);
  });
  return row;
}
/** Right-click menu of an effect row. Indexes are read at click time, so they stay right after edits. */
function fxItems(L, e) {
  const on = e.on !== false, idx = () => fxIndex(L.id, e.id), n = () => fxOf(L.id).length;
  return [
    { label: tr('photoslop.fx.edit_effect'), act: () => openFxDialog(L.id, e.id) },
    { label: tr(on ? 'photoslop.fx.hide_effect' : 'photoslop.fx.show_effect'), act: () => setFxProps(L.id, e.id, { on: !on }, tr(on ? 'photoslop.fx.hide_effect' : 'photoslop.fx.show_effect')) },
    '-',
    { label: tr('photoslop.fx.move_up'), act: () => moveFx(L.id, idx(), idx() - 1), en: () => idx() > 0 },
    { label: tr('photoslop.fx.move_down'), act: () => moveFx(L.id, idx(), idx() + 1), en: () => idx() < n() - 1 },
    '-',
    { label: tr('photoslop.fx.delete_effect'), act: () => removeFx(L.id, e.id) },
  ];
}
/** Keys on a focused effect row. Registered before SlopCmd's window handler, so Delete and Alt+arrows reach the stack. */
function fxKey(ev) {
  const row = ev.target && ev.target.closest && ev.target.closest('li.fx');
  if (!row || row !== ev.target || ev.isComposing) return;
  const L = D.layers.find((l) => String(l.id) === row.dataset.layer);
  const i = L ? (L.fx || []).findIndex((e) => String(e.id) === row.dataset.fx) : -1;
  if (i < 0) return;
  const id = L.fx[i].id;
  let done = true;
  if (ev.key === 'Enter' && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) openFxDialog(L.id, id);
  else if (ev.key === 'Delete') removeFx(L.id, id);
  else if (ev.altKey && ev.key === 'ArrowUp') moveFx(L.id, i, i - 1);
  else if (ev.altKey && ev.key === 'ArrowDown') moveFx(L.id, i, i + 1);
  else done = false;
  if (done) { ev.preventDefault(); ev.stopImmediatePropagation(); }
}
window.addEventListener('keydown', fxKey, true);
