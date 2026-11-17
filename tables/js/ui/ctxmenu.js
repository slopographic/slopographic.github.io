/* Slop Tables — ui/ctxmenu: context menus for a cell, a selection, a row header, a column header and a sheet tab.
 * A right-click selects what is under the pointer first (as a desktop app does). The Menu key or Shift+F10 opens the
 * same menu for the selection on the grid, or for the focused sheet tab. The items are the menu bar's own rows
 * (commands.js menus()) and the shared actions in actions.js and sheets.js, so nothing is duplicated. */
import { S, range, redraw } from './state.js';
import * as A from './actions.js';
import * as Sh from './sheets.js';
import * as cmd from './commands.js';
import { startEdit } from './editor.js';
import { cellAt } from './pointer.js';
import * as OBJ from './objects.js';
import { t } from '../i18n.js';

const pick = (menu, ids) => ids.map((id) => menu.find((i) => i && i.id === id)).filter((i) => i !== undefined);
const isMulti = () => { const g = range(); return g.r1 !== g.r2 || g.c1 !== g.c2; };
const rowIn = (r) => { const g = range(); return r >= g.r1 && r <= g.r2; };
const colIn = (c) => { const g = range(); return c >= g.c1 && c <= g.c2; };
const cellIn = (r, c) => rowIn(r) && colIn(c);

/** The cell menu (one cell) or the selection menu (a range): clipboard, clear, and the common formats. */
function cellItems(multi) {
  const M = cmd.menus(), out = [];
  if (!multi) out.push({ label: t('tables.ctx.edit_cell'), act: () => startEdit() }, '-');
  out.push(...pick(M.Edit, ['edit.cut', 'edit.copy', 'edit.paste']), '-', ...pick(M.Edit, ['edit.clear', 'edit.clearAll']), '-', ...pick(M.Format, ['format.bold', 'format.italic', 'format.nf']));
  return out;
}
function rowItems(r) {
  return [
    { label: t('tables.ctx.select_row'), act: () => A.selectLine('row', r) },
    { label: t('tables.cmd.edit_clear'), act: () => { A.selectLine('row', r); A.clearRange('contents'); } },
    '-',
    { label: t('tables.ctx.hide_row'), act: () => A.setHidden('row', r, r, true) },
    ...showAllItem(),
  ];
}
function colItems(c) {
  return [
    { label: t('tables.ctx.select_col'), act: () => A.selectLine('col', c) },
    { label: t('tables.cmd.edit_clear'), act: () => { A.selectLine('col', c); A.clearRange('contents'); } },
    '-',
    { label: t('tables.ctx.hide_col'), act: () => A.setHidden('col', c, c, true) },
    ...showAllItem(),
  ];
}
/** Only when something is hidden. */
const showAllItem = () => (A.hasHidden() ? ['-', { label: t('tables.ctx.show_all'), act: () => A.showAll() }] : []);
function tabItems(i) {
  return [
    { label: t('ui.rename_dots'), act: () => Sh.rename(i) },
    { label: t('tables.cmd.sheet_delete'), act: () => Sh.remove(i) },
    '-',
    { label: t('tables.cmd.sheet_add'), act: () => Sh.add() },
  ];
}

/** Right-click or Menu key target: a cell, a row or column header, or a sheet tab. ev is null from the keyboard. */
function resolve(target, ev) {
  if (!target || !target.closest) return null;
  const tab = target.closest('.tab[data-i]');
  if (tab) return tabItems(+tab.dataset.i);
  if (!ev) {
    // keyboard: the grid itself (not an open cell editor) opens the menu for the selection
    if (target.id !== 'grid' || S.edit) return null;
    return cellItems(isMulti());
  }
  const box = target.closest('.chart-box');
  if (box) return OBJ.chartItems(box.dataset.id);
  const ch = target.closest('.ch[data-c]');
  if (ch) { const c = +ch.dataset.c; if (!colIn(c)) A.selectLine('col', c); return colItems(c); }
  const rh = target.closest('.rh[data-r]');
  if (rh) { const r = +rh.dataset.r; if (!rowIn(r)) A.selectLine('row', r); return rowItems(r); }
  const cell = target.closest('[data-rc]'), under = !cell && target.closest('#vp') ? cellAt(ev) : null;
  if (cell || under) {
    const [r, c] = cell ? cell.dataset.rc.split(',').map(Number) : [under.r, under.c];
    if (!cellIn(r, c)) { S.sel = { r, c, er: r, ec: c }; redraw(); }
    const pv = OBJ.pivotItems(r, c);
    return pv ? [...pv, '-', ...cellItems(isMulti())] : cellItems(isMulti());
  }
  return null;
}

export function init() {
  if (!window.SlopCtx) return;
  const grid = document.getElementById('grid'), tabs = document.getElementById('tabs');
  if (grid) SlopCtx.bind(grid, resolve);
  if (tabs) SlopCtx.bind(tabs, resolve);
}
