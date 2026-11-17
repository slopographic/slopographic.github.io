/* Sheet tabs: switch, add, rename (double-click or menu), delete. The right-click menu is in ui/ctxmenu.js. */
import { S, $, redraw, toast } from './state.js';
import { transact } from './history.js';
import { commitEdit } from './editor.js';
import { renamed } from './objects.js';
import { t } from '../i18n.js';

export function render() {
  const frag = document.createDocumentFragment();
  S.wb.sheets.forEach((sh, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (i === S.si ? ' on' : '');
    b.textContent = sh.name;
    b.title = t('tables.sheet.tab_tip', { name: sh.name });
    b.dataset.i = i;
    b.addEventListener('click', () => select(i));
    b.addEventListener('dblclick', () => rename(i));
    frag.append(b);
  });
  const plus = document.createElement('button');
  plus.type = 'button'; plus.className = 'tab tab-add'; plus.textContent = '+'; plus.title = t('tables.cmd.sheet_add');
  plus.addEventListener('click', add);
  frag.append(plus);
  $('tabs').replaceChildren(frag);
}

export function select(i) {
  if (S.edit && !commitEdit()) return;
  if (i === S.si) { redraw(); return; }
  S.si = i;
  S.wb.active = i;
  S.sel = { r: 0, c: 0, er: 0, ec: 0 };
  const vp = $('vp');
  vp.scrollTop = 0; vp.scrollLeft = 0;
  redraw();
}

export function add() {
  if (S.edit && !commitEdit()) return;
  transact(() => S.wb.addSheet());
  select(S.wb.sheets.length - 1);
}

export async function rename(i = S.si) {
  const sh = S.wb.sheets[i];
  const name = await window.SlopUI.prompt(t('tables.sheet.rename_title'), t('tables.sheet.name'), sh.name, { ok: t('ui.rename') });
  if (name === null || name.trim() === sh.name) return;
  const old = sh.name;
  try { transact(() => { S.wb.renameSheet(sh, name); renamed(S.wb, old, sh.name); }); }
  catch (err) { toast(err.message); }
}

export async function remove(i = S.si) {
  const sh = S.wb.sheets[i];
  if (S.wb.sheets.length < 2) { toast(t('tables.sheet.need_one')); return; }
  const ok = await window.SlopUI.confirm(t('tables.cmd.sheet_delete'), t('tables.sheet.delete_body', { name: sh.name }), t('ui.delete'), { danger: true });
  if (!ok) return;
  transact(() => S.wb.removeSheet(sh));
  S.si = Math.min(S.si, S.wb.sheets.length - 1);
  select(S.si);
}
