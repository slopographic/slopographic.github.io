/* Slop Code: "Kinds of text in this file". Looks through the open file for IP addresses, e-mail addresses, web addresses, ids, keys,
 * tokens and other things shared/patterns knows, and lists what it found with a count. Each kind can be searched (the find panel is
 * filled in with its expression, so Next, Previous and Replace work) or masked (every match becomes its masked form in one change that
 * Ctrl+Z undoes). Everything happens on this device. */
import * as docs from './docs.js';
import { el, t } from './dom.js';
import { setFindQuery, showFind } from './editor.js';

const UI = () => window.SlopUI;
const P = () => window.SlopPatterns;
const toast = (m) => UI() && UI().toast && UI().toast(m);

/** What the file holds, kind by kind: [{ kind, list: [{ start, end, text }] }] in the order of the kinds table. */
export function kindsIn(text) {
  const by = new Map();
  for (const m of P().scan(text, { limit: 20000 })) { if (!by.has(m.kind)) by.set(m.kind, []); by.get(m.kind).push(m); }
  return P().KINDS.filter((k) => by.has(k.id)).map((k) => ({ kind: k, list: by.get(k.id) }));
}

/** Put the kind's expression in the find panel and go to its first match. */
function findKind(view, row) {
  const r = P().regex(row.kind.id), first = row.list[0];
  setFindQuery(view, { find: r.source, regexp: true, caseSensitive: !/i/.test(r.flags || '') });
  view.dispatch({ selection: { anchor: first.start, head: first.end }, scrollIntoView: true });
  showFind(view, false);
}

/** Replace every match of the kind with its masked form, as one change. Returns how many. */
function maskKind(view, row) {
  const changes = row.list.map((m) => ({ from: m.start, to: m.end, insert: P().mask(row.kind.id, m.text) }));
  view.dispatch({ changes, userEvent: 'input.replace' });
  toast(t('code.kinds.masked', { n: changes.length }));
  return changes.length;
}

/** Open the dialog for the file on screen. Returns false when there is nothing to look through. */
export function openKinds() {
  const view = docs.mainView(), d = docs.current();
  if (!P()) return false;
  if (!d || d.kind !== 'text' || !view) { toast(t('code.kinds.no_text')); return false; }
  const rows = kindsIn(view.state.doc.toString());
  let dlg = null;
  const button = (label, fn) => el('button', { type: 'button', class: 'sui-btn cd-mini', onclick: () => { dlg.close(false); fn(); } }, label);
  const body = el('div', { class: 'cd-kinds' }, rows.length
    ? el('ul', { class: 'cd-kinds-list' }, rows.map((row) => el('li', { class: 'cd-kinds-row' },
      el('span', { class: 'cd-kinds-name' }, t('ui.patterns.' + row.kind.id), row.kind.secret ? el('em', { class: 'cd-kinds-warn' }, t('code.kinds.secret')) : null),
      el('span', { class: 'cd-kinds-n' }, row.list.length),
      button(t('code.kinds.find'), () => findKind(view, row)), button(t('code.kinds.mask'), () => maskKind(view, row)))))
    : el('p', { class: 'sui-p' }, t('code.kinds.none')),
  el('p', { class: 'sui-p cd-note' }, t('code.kinds.note')));
  dlg = UI().dialog({ title: t('code.kinds.title', { name: d.name }), body, buttons: [{ label: t('menu.close'), primary: true }] });
  return true;
}
