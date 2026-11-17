/* SlopLabel — ui/keys: keyboard shortcuts, clipboard (copy/cut/paste, pasted images and text),
 * arrange commands (align, distribute, order, group, rotate, lock) and the canvas context menu. */
'use strict';

/* ---------------- arrange commands ---------------- */
function alignSel(how) {
  const objs = selObjs(); if (!objs.length) return;
  const L = App.doc.label, ref = objs.length === 1 ? { x: 0, y: 0, w: L.w, h: L.h } : selBox();
  // align uses drawn boxes: shift each object by the offset between its box and its stored position
  const get = previewGet();
  for (const o of objs) {
    if (o.locked) continue;
    const b = boxOf(o), tmp = { x: b.x, y: b.y, w: b.w, h: b.h, locked: false };
    alignObjects([tmp], how, ref);
    o.x = round(o.x + tmp.x - b.x, 3); o.y = round(o.y + tmp.y - b.y, 3);
    syncAutoSize(App.doc, o, get);
  }
  commit(LT('label.undo.align'));
}
function distributeSel(axis) { if (distributeObjects(selObjs(), axis)) commit(LT('label.keys.distribute')); else SlopUI.toast(LT('label.keys.select_three_or_more_objects')); }
function orderSel(how) { if (!App.sel.length) return; reorder(App.doc, App.sel, how); commit({ front: LT('label.cmd.bring_to_front'), back: LT('label.cmd.send_to_back'), forward: LT('label.cmd.bring_forward'), backward: LT('label.cmd.send_backward') }[how]); }
function groupSel() { if (groupObjects(App.doc, App.sel)) commit(LT('label.cmd.group')); }
function ungroupSel() { if (ungroupObjects(App.doc, App.sel)) commit(LT('label.cmd.ungroup')); }
/** Rotate 90° steps about the object's centre. */
function rotateSel(deg) {
  editSel((o) => {
    if (o.locked) return;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    o.rot = (((o.rot || 0) + deg) % 360 + 360) % 360;
    if (deg % 180) { const w = o.w; o.w = o.h; o.h = w; o.x = round(cx - o.w / 2, 3); o.y = round(cy - o.h / 2, 3); }
  }, LT('label.keys.rotate'));
}
function setRotation(o, r) { const d = ((r - (o.rot || 0)) % 360 + 360) % 360; if (d) { App.sel = [o.id]; rotateSel(d); } }
function toggleLock() { const objs = selObjs(), lock = !objs.every((o) => o.locked); editSel((o) => { o.locked = lock; }, lock ? LT('label.menu.lock') : LT('label.menu.unlock')); }
function toggleHide() { const objs = selObjs(), hide = !objs.every((o) => o.hidden); editSel((o) => { o.hidden = hide; }, hide ? LT('label.menu.hide') : LT('label.menu.show')); }
function nudge(dx, dy) {
  if (!App.sel.length) return;
  editSel((o) => { if (!o.locked) { o.x = round(o.x + dx, 3); o.y = round(o.y + dy, 3); } }, LT('label.keys.nudge'), 'nudge', { keepProps: false });
}

/* ---------------- clipboard ---------------- */
function copySel() {
  const objs = selObjs(); if (!objs.length) return false;
  const assets = {}; for (const o of objs) if (o.asset && App.doc.assets[o.asset]) assets[o.asset] = App.doc.assets[o.asset];
  App.clip = { objects: deepClone(objs), assets };
  lsSet('sloplabel-clip', JSON.stringify(App.clip).length < 2e6 ? JSON.stringify(App.clip) : '');
  status(LT('label.keys.copied', { n: objs.length }), '', 1500);
  return true;
}
function cutSel() { if (copySel()) deleteSel(); }
function pasteClip() {
  let c = App.clip;
  if (!c) { try { c = JSON.parse(lsGet('sloplabel-clip') || 'null'); } catch (e) { c = null; } }
  if (!c || !c.objects || !c.objects.length) return false;
  Object.assign(App.doc.assets, c.assets || {});
  const off = c.objects.some((o) => App.doc.objects.some((p) => p.x === o.x && p.y === o.y)) ? 2 : 0, gmap = {};
  const out = c.objects.map((o) => Object.assign(deepClone(o), { id: uid(), x: round(o.x + off, 3), y: round(o.y + off, 3), group: o.group ? gmap[o.group] || (gmap[o.group] = uid('g')) : null }));
  App.doc.objects.push(...out);
  App.sel = out.map((o) => o.id);
  if (c === App.clip) c.objects = out.map((o) => deepClone(o));
  commit(LT('label.cmd.paste'));
  return true;
}
/** System paste: images become image objects, plain text becomes a text object. */
// A pasted picture is the intake's (ui/intake.js; its paste listener comes first and takes it); this is the app's own
// clipboard, ZPL and pasted text.
async function onPaste(e) {
  if (e.defaultPrevented || isTyping(e.target)) return;
  e.preventDefault();
  if (pasteClip()) return;
  const text = e.clipboardData && e.clipboardData.getData('text/plain');
  if (text && /^\s*\^XA/.test(text)) { await importZPLText(text); return; }
  if (text) { const kind = text.length > 40 || text.includes('\n') ? 'para' : 'text'; addObject(makeObject(kind, Object.assign(styleProps(App.doc, kind), { content: text.slice(0, 2000), x: 4, y: 4 }))); }
}

/* ---------------- keyboard: Space-to-pan (held); the rest lives in ui/commands.js ---------------- */
const isTyping = (t) => (!!window.SlopTyping && window.SlopTyping.isTyping(t, { controls: true }));   // shared/input/typing.js
function onKeyDown(e) {
  if (e.key === ' ' && !isTyping(e.target)) { spaceDown = true; $('stage').classList.add('panning'); if (e.target === $('stage')) e.preventDefault(); }
  // every other shortcut is a command in ui/commands.js, dispatched (and rebindable) by SlopCmd
}
function onKeyUp(e) { if (e.key === ' ') { spaceDown = false; $('stage').classList.remove('panning'); } }

/* ---------------- context menu ---------------- */
function contextItems() {
  const n = App.sel.length, one = selOne();
  if (!n) return [
    { label: LT('label.cmd.paste'), key: 'Ctrl+V', act: () => pasteClip() || SlopUI.toast(LT('label.cmd.nothing_to_paste')) },
    { label: LT('label.cmd.select_all'), key: K('selectAll'), act: selectAll }, '-',
    { label: LT('label.cmd.label_setup'), act: () => labelSetupDialog() }, { label: LT('label.cmd.fit_label'), key: K('fit'), act: fitView },
  ];
  const grouped = selObjs().some((o) => o.group);
  return [
    { label: LT('label.cmd.cut'), key: K('cut'), act: cutSel }, { label: LT('label.cmd.copy'), key: K('copy'), act: copySel }, { label: LT('label.cmd.paste'), key: 'Ctrl+V', act: pasteClip },
    { label: LT('label.cmd.duplicate'), key: K('duplicate'), act: () => duplicateSel() }, { label: 'Delete', key: K('delete'), act: deleteSel }, '-',
    one ? { label: LT('label.keys.edit_content'), key: K('editContent'), act: focusContent } : null,
    { label: LT('label.cmd.rotate_90_clockwise'), act: () => rotateSel(90) }, { label: LT('label.cmd.rotate_90_counter_clockwise'), act: () => rotateSel(270) },
    { label: LT('label.menu.align'), sub: alignItems() },
    { label: LT('label.menu.arrange'), sub: [{ label: LT('label.cmd.bring_to_front'), key: K('front'), act: () => orderSel('front') }, { label: LT('label.cmd.bring_forward'), key: K('forward'), act: () => orderSel('forward') }, { label: LT('label.cmd.send_backward'), key: K('backward'), act: () => orderSel('backward') }, { label: LT('label.cmd.send_to_back'), key: K('back'), act: () => orderSel('back') }] },
    n > 1 ? { label: LT('label.cmd.group'), key: K('group'), act: groupSel } : null,
    grouped ? { label: LT('label.cmd.ungroup'), key: K('ungroup'), act: ungroupSel } : null, '-',
    { label: selObjs().every((o) => o.locked) ? LT('label.menu.unlock') : LT('label.menu.lock'), key: K('lock'), act: toggleLock },
    { label: selObjs().every((o) => o.hidden) ? LT('label.menu.show') : LT('label.menu.hide'), act: toggleHide },
  ];
}
function alignItems() {
  const one = App.sel.length === 1, to = one ? ' (to label)' : '';
  return [
    { label: LT('label.keys.left') + to, act: () => alignSel('left') }, { label: LT('label.keys.centre_horizontally') + to, act: () => alignSel('hcenter') }, { label: LT('label.keys.right') + to, act: () => alignSel('right') }, '-',
    { label: LT('label.keys.top') + to, act: () => alignSel('top') }, { label: LT('label.keys.centre_vertically') + to, act: () => alignSel('vcenter') }, { label: LT('label.keys.bottom') + to, act: () => alignSel('bottom') }, '-',
    { label: LT('label.cmd.distribute_horizontally'), disabled: App.sel.length < 3, act: () => distributeSel('h') }, { label: LT('label.cmd.distribute_vertically'), disabled: App.sel.length < 3, act: () => distributeSel('v') },
  ];
}
function initKeys() {
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { spaceDown = false; });
  document.addEventListener('paste', onPaste); // intake-ok: the app's own clipboard, ZPL and text (files go to the intake)
  document.addEventListener('copy', (e) => { if (!isTyping(e.target) && copySel()) e.preventDefault(); });
  document.addEventListener('cut', (e) => { if (!isTyping(e.target) && App.sel.length) { e.preventDefault(); cutSel(); } });
}
