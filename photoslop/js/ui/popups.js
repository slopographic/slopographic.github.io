/* PhotoSlop UI: brush picker, context menus and system paste */
'use strict';

/* ---------- right-click: brush picker & context menus ---------- */
const BRUSH_OPTS = () => ({ brush: T.brush, pencil: T.pencil, eraser: T.eraser, clone: T.clone, heal: T.heal, spot: T.spot, smudge: T.smudge, dodge: T.dodge, blur: T.blur, sharpen: T.sharpen, sponge: T.sponge });
let popover = null;
function closePopover() { if (popover) { popover.remove(); popover = null; } }
function openBrushPicker(x, y, toolId = UI.tool) {
  closeMenus(); closePopover();
  const o = BRUSH_OPTS()[toolId]; if (!o) return;
  const t = TOOL[toolId];
  const el = h('div', { class: 'brush-pop', role: 'dialog', 'aria-label': tr('photoslop.popup.brush_picker') });
  const row = (label, key, min, max, toV = (v) => v, fromV = (v) => v, unit = 'px') => {
    const r = h('input', { type: 'range', min, max, value: Math.round(fromV(o[key])), 'aria-label': label });
    const n = h('input', { type: 'number', min, max, value: Math.round(fromV(o[key])), class: 'opt-num', 'aria-label': label });
    const set = (v) => { v = clamp(+v, min, max); o[key] = toV(v); r.value = v; if (document.activeElement !== n) n.value = v; saveToolOptions(); buildOptions(); dirty(); };
    r.addEventListener('input', () => set(r.value)); n.addEventListener('change', () => set(n.value));
    return h('label', { class: 'bp-row' }, h('span', null, label), r, n, h('span', { class: 'opt-u' }, unit));
  };
  el.append(h('div', { class: 'bp-head' }, h('b', null, t.short), h('span', null, tr('photoslop.popup.right_click'))));
  el.append(row(tr('photoslop.popup.size'), 'size', 1, toolId === 'pencil' ? 200 : 1000));
  if (o.hardness != null) el.append(row(tr('photoslop.popup.hardness'), 'hardness', 0, 100, (v) => v / 100, (v) => v * 100, '%'));
  if (o.opacity != null) el.append(row(tr('photoslop.popup.opacity'), 'opacity', 1, 100, (v) => v / 100, (v) => v * 100, '%'));
  if (o.tip != null) {
    for (const pack of allPacks()) {
      if (!pack.brushes.length) continue;
      const grid = h('div', { class: 'bp-grid' });
      for (const p of pack.brushes) {
        const b = h('button', { type: 'button', class: 'bp-preset' + (o.preset === p.name ? ' on' : ''), title: `${brushLabel(p)} · ${p.size}px`, 'aria-label': brushLabel(p) }, presetPreview(p), h('span', null, brushLabel(p)), h('em', null, p.size));
        b.addEventListener('click', () => { applyPreset(p); closePopover(); toast(tr('photoslop.popup.brush_named', { name: brushLabel(p) }), 900); });
        grid.append(b);
      }
      el.append(h('div', { class: 'bp-sub' }, packLabel(pack)), grid);
    }
    el.append(h('div', { class: 'bp-sub bp-tip' }, tr('photoslop.popup.tip')));
  }
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = clamp(x, 4, innerWidth - r.width - 4) + 'px';
  el.style.top = clamp(y, 4, innerHeight - r.height - 4) + 'px';
  popover = el;
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopPropagation(); closePopover(); } });
  setTimeout(() => { const f = el.querySelector('input[type=range]'); if (f) f.focus(); }, 0);
}
document.addEventListener('pointerdown', (e) => { if (popover && !e.target.closest('.brush-pop')) closePopover(); }, true);

/* ---------- pasting from the system clipboard ---------- */
let catcher = null;
function armPasteCatcher() {
  // Some browsers only fire 'paste' at an editable element: give them one for this keystroke.
  if (!catcher) { catcher = h('textarea', { class: 'paste-catcher', 'aria-hidden': 'true', tabindex: '-1' }); document.body.append(catcher); }
  catcher.value = ''; catcher.focus({ preventScroll: true });
  setTimeout(() => { if (document.activeElement === catcher) catcher.blur(); }, 400);
}
async function clipboardImage() {
  if (!navigator.clipboard || !navigator.clipboard.read) return null;
  const items = await navigator.clipboard.read();
  for (const it of items) { const type = it.types.find((t) => t.startsWith('image/')); if (type) return it.getType(type); }
  return null;
}
async function pasteFromSystem(inPlace) {
  try {
    const blob = await clipboardImage();
    if (blob && SlopBuffer.isSystemCopyOf(blob) && pasteBuffer()) return; // our own buffer copy: the buffer item, with its vector
    if (blob) {
      const c = await fileToCanvas(blob);
      if (CLIP.canvas && c.width === CLIP.canvas.width && c.height === CLIP.canvas.height) { pasteInternal(inPlace); return; }
      pasteCanvas(c, null, null, 'photoslop.layer.pasted_image'); return;
    }
  } catch (e) { /* permission denied or unsupported: fall back to the internal clipboard */ }
  if (pasteBuffer()) return; // nothing on the system clipboard: the shared buffer, if it is newer
  if (CLIP.canvas) pasteInternal(inPlace);
  else toast(tr('photoslop.popup.copy_first', { key: MOD + 'V' }));
}
async function newFromClipboard() {
  let c = null;
  try { const blob = await clipboardImage(); if (blob) c = await fileToCanvas(blob); } catch (e) { /* fall through */ }
  if (!c && CLIP.canvas) c = copyCanvas(CLIP.canvas);
  if (!c) { toast(tr('photoslop.popup.no_clip_image')); return; }
  openDocTab(c.width, c.height, [{ name: tr('photoslop.layer.background'), canvas: c }], tr('photoslop.layer.pasted_doc'));
}

function brushPickerButton() {
  const o = BRUSH_OPTS()[UI.tool];
  const b = h('button', { type: 'button', class: 'bp-btn', title: tr('photoslop.popup.picker_btn_tip'), 'aria-label': tr('photoslop.popup.picker_btn') },
    dabCanvas(clamp(o.size, 4, 22), o.hardness != null ? o.hardness : 1, theme() === 'pro' ? '#e8e8e8' : '#111111', o.tip || 'round', 0), h('span', null, o.size), h('i', null, '▾'));
  b.addEventListener('click', () => { const r = b.getBoundingClientRect(); openBrushPicker(r.left, r.bottom + 4); });
  return b;
}
