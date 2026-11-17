/* SlopLabel — ui/context: right-click and keyboard (Menu key / Shift+F10) menus per target kind.
 * Kinds: canvas (empty label), selection (several objects), text (text and paragraph boxes),
 * barcode, image, shape (box, ellipse, line, inverse box). Each kind puts its own items above the
 * object menu (contextItems, ui/keys.js). Every item calls an existing action; none duplicates logic. */
'use strict';

const isMenuKey = (e) => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
const withoutNulls = (items) => items.filter((it) => it !== null && it !== undefined);

const KINDS = {
  canvas: () => contextItems(),
  selection: () => [
    App.sel.length >= 3 ? { label: LT('label.keys.distribute'), sub: [{ label: LT('label.ctx.horizontally'), key: K('distribute.h'), act: () => distributeSel('h') }, { label: LT('label.ctx.vertically'), key: K('distribute.v'), act: () => distributeSel('v') }] } : null,
    App.sel.length >= 3 ? '-' : null, ...contextItems()
  ],
  text: (o) => [
    { label: LT('label.ctx.edit_text'), key: K('editContent'), act: focusContent },
    { label: o.bold ? LT('label.ctx.not_bold') : LT('label.ptypes.bold'), act: () => setProp('bold', !o.bold, LT('label.ptypes.bold')) },
    '-', ...contextItems()
  ],
  barcode: () => [{ label: LT('label.ctx.edit_data'), key: K('editContent'), act: focusContent }, '-', ...contextItems()],
  image: () => [
    { label: LT('label.ptypes.replace_image'), act: () => replaceImage() },
    { label: LT('label.ptypes.original_ratio'), act: () => originalRatio() },
    '-', ...contextItems()
  ],
  shape: (o) => [
    o.type === 'rect' || o.type === 'ellipse'
      ? { label: LT('label.ptypes.fill'), sub: [['none', LT('label.ptypes.none')], ['black', LT('label.dlg.black')], ['white', LT('label.dlg.white')]].map(([v, l]) => ({ label: l, check: (o.fill || 'none') === v, act: () => setProp('fill', v, LT('label.ptypes.fill'), true) })) }
      : null,
    o.type === 'rect' || o.type === 'ellipse' ? '-' : null,
    ...contextItems()
  ]
};

/** The kind of target under the pointer (or the focused object). */
function kindOf(o) {
  if (!o) return 'canvas';
  if (App.sel.length > 1 && App.sel.includes(o.id)) return 'selection';
  return { text: 'text', para: 'text', barcode: 'barcode', image: 'image' }[o.type] || 'shape';
}
/** Opens the menu for object o (or the empty canvas when o is null) at screen point (x, y). */
function openContext(o, x, y) {
  const items = withoutNulls(KINDS[kindOf(o)](o || null));
  if (items.length) SlopUI.menu(items, x, y);
}

/* keyboard: the Menu key or Shift+F10 on the canvas or on a layer row opens the same menus */
document.addEventListener('keydown', (e) => {
  if (!isMenuKey(e) || document.querySelector('.sui-menu')) return;
  const row = e.target.closest && e.target.closest('.li[data-id]');
  const stage = e.target.id === 'stage';
  if (!row && !stage) return;
  e.preventDefault();
  const box = (row || document.getElementById('stage')).getBoundingClientRect();
  const o = row ? App.doc.objects.find((x) => x.id === row.dataset.id) : selObjs()[0];
  if (row && o && !App.sel.includes(o.id)) select([o.id]);
  openContext(o || null, box.left + 16, box.top + 16);
});
