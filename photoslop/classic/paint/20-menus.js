/* Slop Paint, part 20: actions, menu definitions and the menu bar.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, $$, S, t, aboutDialog, applyImage, attributesDialog, cancelOp, clamp, clearImage, clearSelection, confirmSave, copySel, customZoomDialog, cutSel, editColorsDialog, fileInput, finishPending, flipRotateDialog, fontbar, h, helpDialog, invert, layout, mctx, pasteMenu, redo, redoStack, renderFloating, renderOptions, saveAsDialog, savePNG, selCanvas, selectAll, setColor, setTool, setZoom, slopify, status, stretchSkewDialog, toast, undo, undoStack, updateTitle, viewBitmap } = P;

/* =====================================================================
 * Menus
 * ===================================================================== */
const ui = { toolbox: true, colorbox: true, statusbar: true };
const ACTIONS = {
  new: async () => { if (P.st.op) cancelOp(); finishPending(); if (!await confirmSave()) return; mctx.fillStyle = '#ffffff'; mctx.fillRect(0, 0, S.w, S.h); undoStack.length = 0; redoStack.length = 0; S.fileName = 'untitled'; S.dirty = false; updateTitle(); status(); },
  open: async () => { if (P.st.op) cancelOp(); finishPending(); if (!await confirmSave()) return; P.st.fileMode = 'open'; fileInput.click(); },
  save: () => savePNG(),
  saveAs: saveAsDialog,
  home: () => { location.href = '../../'; },
  exit: async () => { if (P.st.op) cancelOp(); finishPending(); if (await confirmSave()) location.href = '../../'; },
  undo, redo,
  cut: cutSel, copy: copySel, paste: pasteMenu,
  clearSel: () => { if (P.st.text) return; clearSelection(); },
  selectAll,
  copyTo: async () => { const c = selCanvas(); if (!c) return; c.toBlob(b => { const a = h('a', { href: URL.createObjectURL(b), download: 'selection.png' }); document.body.append(a); a.click(); a.remove(); }); },
  pasteFrom: () => { P.st.fileMode = 'paste'; fileInput.click(); },
  toolbox: () => { ui.toolbox = !ui.toolbox; $('#toolbox').hidden = !ui.toolbox; },
  colorbox: () => { ui.colorbox = !ui.colorbox; $('#colorbox').hidden = !ui.colorbox; },
  statusbar: () => { ui.statusbar = !ui.statusbar; $('#statusbar').hidden = !ui.statusbar; },
  textbar: () => { S.fontbarClosed = !S.fontbarClosed; fontbar.hidden = S.fontbarClosed || S.tool !== 'text'; if (!S.fontbarClosed && S.tool !== 'text') setTool('text'); },
  zoomNormal: () => setZoom(1), zoomLarge: () => setZoom(4), zoomCustom: customZoomDialog,
  zoomIn: () => setZoom([1, 2, 4, 6, 8].find(z => z > S.zoom) || 8),
  zoomOut: () => setZoom([8, 6, 4, 2, 1].find(z => z < S.zoom) || 1),
  grid: () => { S.grid = !S.grid; layout(); if (S.grid && S.zoom < 4) status(t('paint-classic.status.grid_zoom')); },
  viewBitmap,
  flipRotate: flipRotateDialog, stretchSkew: stretchSkewDialog,
  invert: () => applyImage(invert),
  attributes: attributesDialog,
  clearImage,
  opaque: () => { S.transparent = !S.transparent; renderFloating(); renderOptions(); },
  slopify: async () => { await applyImage(slopify); toast(t('paint-classic.toast.slopified')); status(t('paint-classic.status.slopified')); },
  editColors: async () => { const res = await editColorsDialog(S.primary); if (res) setColor(0, res); },
  help: helpDialog, about: aboutDialog,
  palette: () => { if (window.SlopCmd) SlopCmd.open(); }, keymap: () => { if (window.SlopCmd) SlopCmd.openKeymap(); },
};
const hasSel = () => !!P.st.sel;
/** A menu or menu item whose label (with & before the Alt key letter) is read in the chosen language each time. */
const M = (key, o) => Object.defineProperty(o, 'label', { get: () => t(key), enumerable: true });
const MENUS = [
  M('paint-classic.menu.file', { items: [
    M('paint-classic.menu.new', { act: 'new' }),
    M('paint-classic.menu.open', { key: 'Ctrl+O', act: 'open' }),
    M('paint-classic.menu.open_drive', { act: 'openDrive', enabled: () => !!window.SlopHub }),
    M('paint-classic.menu.save', { key: 'Ctrl+S', act: 'save' }),
    M('paint-classic.menu.save_as', { act: 'saveAs' }),
    '-',
    M('paint-classic.menu.home', { act: 'home' }),
    '-',
    M('paint-classic.menu.exit', { act: 'exit' }),
  ] }),
  M('paint-classic.menu.edit', { items: [
    M('paint-classic.menu.undo', { key: 'Ctrl+Z', act: 'undo', enabled: () => undoStack.length > 0 || !!P.st.text || !!P.st.sel || !!P.st.curve || !!P.st.poly }),
    M('paint-classic.menu.repeat', { key: 'Ctrl+Y', act: 'redo', enabled: () => redoStack.length > 0 }),
    '-',
    M('paint-classic.menu.cut', { key: 'Ctrl+X', act: 'cut', enabled: hasSel }),
    M('paint-classic.menu.copy', { key: 'Ctrl+C', act: 'copy', enabled: hasSel }),
    M('paint-classic.menu.paste', { key: 'Ctrl+V', act: 'paste' }),
    M('paint-classic.menu.clear_sel', { key: 'Del', act: 'clearSel', enabled: hasSel }),
    M('paint-classic.menu.select_all', { key: 'Ctrl+A', act: 'selectAll' }),
    '-',
    M('paint-classic.menu.copy_to', { act: 'copyTo', enabled: hasSel }),
    M('paint-classic.menu.paste_from', { act: 'pasteFrom' }),
  ] }),
  M('paint-classic.menu.view', { items: [
    M('paint-classic.menu.toolbox', { act: 'toolbox', checked: () => ui.toolbox }),
    M('paint-classic.menu.colorbox', { act: 'colorbox', checked: () => ui.colorbox }),
    M('paint-classic.menu.statusbar', { act: 'statusbar', checked: () => ui.statusbar }),
    M('paint-classic.menu.textbar', { act: 'textbar', checked: () => !S.fontbarClosed && S.tool === 'text' }),
    '-',
    M('paint-classic.menu.normal_size', { key: 'Ctrl+PgUp', act: 'zoomNormal', checked: () => S.zoom === 1 }),
    M('paint-classic.menu.large_size', { key: 'Ctrl+PgDn', act: 'zoomLarge', checked: () => S.zoom === 4 }),
    M('paint-classic.menu.custom', { act: 'zoomCustom' }),
    M('paint-classic.menu.grid', { key: 'Ctrl+G', act: 'grid', checked: () => S.grid }),
    '-',
    M('paint-classic.menu.view_bitmap', { key: 'Ctrl+F', act: 'viewBitmap' }),
  ] }),
  M('paint-classic.menu.image', { items: [
    M('paint-classic.menu.flip_rotate', { key: 'Ctrl+R', act: 'flipRotate' }),
    M('paint-classic.menu.stretch_skew', { key: 'Ctrl+Shift+W', act: 'stretchSkew' }),
    M('paint-classic.menu.invert', { key: 'Ctrl+I', act: 'invert' }),
    M('paint-classic.menu.attributes', { key: 'Ctrl+E', act: 'attributes' }),
    M('paint-classic.menu.clear_image', { key: 'Ctrl+Shift+X', act: 'clearImage' }),
    M('paint-classic.menu.opaque', { act: 'opaque', checked: () => !S.transparent }),
    '-',
    M('paint-classic.menu.slopify', { act: 'slopify', cls: 'slopify' }),
  ] }),
  M('paint-classic.menu.colors', { items: [
    M('paint-classic.menu.edit_colors', { act: 'editColors' }),
  ] }),
  M('paint-classic.menu.help', { items: [
    M('paint-classic.menu.help_topics', { key: 'F1', act: 'help' }),
    M('paint-classic.menu.search_commands', { key: 'Ctrl+K', act: 'palette' }),
    M('paint-classic.menu.shortcuts', { act: 'keymap' }),
    '-',
    M('paint-classic.menu.about', { act: 'about' }),
    M('paint-classic.menu.home', { act: 'home' }),
  ] }),
];
const accel = label => { const i = label.indexOf('&'); if (i < 0) return document.createTextNode(label); const s = h('span'); s.append(label.slice(0, i), h('u', { text: label[i + 1] }), label.slice(i + 2)); return s; };
const accKey = label => { const i = label.indexOf('&'); return i < 0 ? '' : label[i + 1].toLowerCase(); };
const menubar = $('#menubar');
function run(act) { const f = ACTIONS[act]; if (f) f(); }
function closeMenus() {
  if (P.st.menuEl) { P.st.menuEl.remove(); P.st.menuEl = null; }
  $$('.mb-item', menubar).forEach(b => { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
  P.st.openMenu = -1;
}
function showMenu(i, focusFirst) {
  closeMenus();
  P.closeStart();
  P.st.openMenu = i;
  const btn = menubar.children[i];
  btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
  const m = h('div', { class: 'menu', role: 'menu', tabindex: '-1', 'aria-label': MENUS[i].label.replace('&', '') });
  for (const it of MENUS[i].items) {
    if (it === '-') { m.append(h('div', { class: 'sep', role: 'separator' })); continue; }
    const dis = it.enabled ? !it.enabled() : false;
    const chk = it.checked ? it.checked() : null;
    const b = h('button', { class: 'mi' + (it.cls ? ' ' + it.cls : ''), type: 'button', role: chk == null ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': chk == null ? null : String(chk), 'aria-disabled': dis ? 'true' : null, 'data-acc': accKey(it.label) },
      h('span', { class: 'chk', text: chk ? '✓' : '' }), h('span', { class: 'lbl' }, accel(it.label)), h('span', { class: 'k', text: (window.SlopCmd && SlopCmd.get(it.act === 'palette' ? 'cmd.palette' : 'paint.' + it.act) ? SlopCmd.keyFor(it.act === 'palette' ? 'cmd.palette' : 'paint.' + it.act) : it.key) || '' }));
    b.addEventListener('pointerenter', () => b.focus({ preventScroll: true }));
    b.addEventListener('click', () => { if (dis) return; closeMenus(); run(it.act); });
    m.append(b);
  }
  m.addEventListener('keydown', menuKey);
  document.body.append(m);
  P.st.menuEl = m;
  const r = btn.getBoundingClientRect();
  const mw = m.offsetWidth;
  m.style.left = clamp(r.left, 0, innerWidth - mw) + 'px';
  m.style.top = r.bottom + 'px';
  if (focusFirst) { const f = $('.mi:not([aria-disabled])', m); if (f) f.focus(); } else m.focus({ preventScroll: true });
}
function menuKey(e) {
  const items = $$('.mi', P.st.menuEl);
  const i = items.indexOf(document.activeElement);
  const enabled = items.filter(x => !x.hasAttribute('aria-disabled'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    let j = i;
    for (let k = 0; k < items.length; k++) { j = (j + dir + items.length) % items.length; if (!items[j].hasAttribute('aria-disabled')) break; }
    if (i < 0) j = dir > 0 ? items.indexOf(enabled[0]) : items.indexOf(enabled[enabled.length - 1]);
    if (items[j]) items[j].focus();
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    showMenu((P.st.openMenu + (e.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length, true);
  } else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    const k = P.st.openMenu; closeMenus(); menubar.children[k].focus();
  } else if (e.key === 'Tab') {
    e.preventDefault();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    const hit = items.find(x => x.dataset.acc === e.key.toLowerCase() && !x.hasAttribute('aria-disabled'));
    if (hit) { e.preventDefault(); hit.click(); }
  }
}
MENUS.forEach((m, i) => {
  const b = h('button', { class: 'mb-item', type: 'button', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, accel(m.label));
  b.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); if (P.st.openMenu === i) closeMenus(); else showMenu(i); });
  b.addEventListener('pointerenter', () => { if (P.st.openMenu >= 0 && P.st.openMenu !== i) showMenu(i); });
  b.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); showMenu(i, true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); menubar.children[(i + (e.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length].focus(); }
  });
  menubar.append(b);
});
/** The menu bar's titles again, in the chosen language (a language change); an open menu closes. */
function labelMenus() {
  closeMenus();
  MENUS.forEach((m, i) => { const b = menubar.children[i]; if (b) b.replaceChildren(accel(m.label)); });
}
document.addEventListener('pointerdown', e => {
  if (P.st.openMenu >= 0 && !(P.st.menuEl && P.st.menuEl.contains(e.target)) && !menubar.contains(e.target)) closeMenus();
  if (!$('#startmenu').hidden && !e.target.closest('#startmenu, #startBtn')) P.closeStart();
}, true);

Object.assign(P, { ACTIONS, MENUS, accKey, closeMenus, labelMenus, menubar, run, showMenu });
})();
