/* Slop Code: Search in files. A sidebar section with a search box (match case, whole word, regular expression), a replace box, where to
 * look (Slop Drive, the selected folder, the open tabs), a file-name filter and the results grouped by file. A click on a result opens
 * the file with the match selected. Replace all (or Replace in one file) works on files in any encoding; what it will and will not do
 * is in search-run.js. When shared/patterns is on the page, a "Find" list fills the box with the expression for IP addresses, e-mail
 * addresses, keys and so on. */
import * as docs from './docs.js';
import { el, t } from './dom.js';
import { readPref, writePref } from './prefs.js';
import { openRecord } from './ops.js';
import { setFindQuery } from './editor.js';
import { selectedFolder } from './tree.js';
import { expandSection } from './explorer.js';
import { searchFiles, replaceFiles } from './search-run.js';

const UI = () => window.SlopUI;
const $ = (id) => document.getElementById(id);
const H = () => window.SlopHub;
const saved = () => readPref('search', {});
let box, st = { run: 0, results: [], q: null, scope: null, busy: false };
const F = {};   // the form's fields

/** "3 matches in 2 files" in the page's language (the plural forms come from the keys). */
const summary = (matches, files) => t('code.search.summary', { matches: t('code.search.matches', { n: matches }), files: t('code.search.files', { n: files }) });

const toggle = (name, key, label) => {
  const b = el('button', { type: 'button', class: 'cd-find-tog', 'aria-pressed': saved()[name] ? 'true' : 'false', title: t(key), 'aria-label': t(key),
    onclick: () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); writePref('search', { ...saved(), [name]: on }); } }, label);
  F[name] = b;
  return b;
};
const isOn = (name) => F[name].getAttribute('aria-pressed') === 'true';
const query = () => ({ find: F.find.value, regexp: isOn('regexp'), caseSensitive: isOn('caseSensitive'), wholeWord: isOn('wholeWord') });
const place = () => ({ scope: F.scope.value, folderId: selectedFolder() || null, include: F.include.value });

function say(msg, kind) { F.status.textContent = msg || ''; F.status.dataset.kind = kind || ''; }
function setBusy(on) {
  st.busy = on;
  F.go.textContent = t(on ? 'code.search.stop' : 'code.search.go');
  F.replaceAll.disabled = on || !st.results.length;
}

/** Open a result: the file, the match selected, and the search left in the find panel (Ctrl+F, F3). */
async function openAt(res, m) {
  const rec = await H().get(res.id);
  const doc = await openRecord(rec);
  const view = docs.mainView();
  if (!doc || doc.kind !== 'text' || !view) return;
  const end = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(m.from, end), head: Math.min(m.to, end) }, scrollIntoView: true });
  setFindQuery(view, { ...st.q, replace: F.replace.value });
  view.focus();
}

function hitNode(res, m) {
  return el('li', null, el('button', { type: 'button', class: 'cd-find-hit', title: `${res.path}:${m.line}:${m.col}`, onclick: () => openAt(res, m) },
    el('span', { class: 'cd-find-ln' }, m.line), el('span', { class: 'cd-find-tx' }, m.before, el('mark', null, m.hit), m.after)));
}

function fileNode(res, i) {
  const open = i < 8;
  const list = el('ul', { class: 'cd-find-hits', hidden: !open }, res.matches.slice(0, 50).map((m) => hitNode(res, m)),
    res.matches.length > 50 || res.more ? el('li', { class: 'cd-find-more' }, t('code.search.more', { n: res.matches.length - 50 + res.more })) : null);
  const head = el('button', { type: 'button', class: 'cd-find-name', 'aria-expanded': open ? 'true' : 'false', title: res.path,
    onclick: () => { const o = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', o ? 'true' : 'false'); list.hidden = !o; } },
    el('span', { class: 'cd-find-path' }, res.path), el('span', { class: 'cd-find-n' }, res.matches.length + res.more));
  const one = el('button', { type: 'button', class: 'sui-btn cd-mini', title: t('code.search.replace_file'), 'aria-label': t('code.search.replace_file'), onclick: () => doReplace([res]) }, t('code.search.replace_one'));
  return el('li', { class: 'cd-find-file' }, el('div', { class: 'cd-find-head' }, head, one), list);
}

function show(r) {
  st.results = r.results;
  F.list.replaceChildren(...r.results.map(fileNode));
  const parts = [];
  if (!r.results.length) parts.push(t('code.search.none'));
  else parts.push(summary(r.total, r.results.length));
  if (r.truncated) parts.push(t('code.search.truncated', { n: r.total }));
  if (r.skipped && r.skipped.length) parts.push(t('code.search.skipped', { n: r.skipped.length }));
  say(parts.join(' '));
  F.replaceAll.disabled = !r.results.length;
}

async function run() {
  if (st.busy) { st.run++; return; }   // the button says Stop: the running search sees a new run number and ends
  const q = query();
  if (!q.find) { say(t('code.search.empty'), 'err'); F.find.focus(); return; }
  const my = ++st.run;
  st.q = q; st.scope = place();
  F.list.replaceChildren(); st.results = [];
  say(''); // the old result line goes at once; progress and then the new result line follow
  setBusy(true);
  const r = await searchFiles(q, st.scope, { cancelled: () => st.run !== my, progress: (done, total) => say(t('code.search.progress', { done, total })) });
  setBusy(false);
  if (st.run !== my && !r.error && !r.results.length) { say(t('code.search.stopped')); return; }
  if (r.error) { say(r.error.error === 'regex' ? t('code.search.bad_regex', { error: r.error.message }) : t('code.search.empty'), 'err'); return; }
  show(r);
}

const whyText = (s) => t('code.search.why_' + s);
/** Replace in the given results (all of them for Replace all), after asking: files that are not open are written at once. */
async function doReplace(list) {
  if (st.busy || !list.length || !st.q) return;
  const matches = list.reduce((n, r) => n + r.matches.length + r.more, 0);
  const closed = list.filter((r) => !r.open).length;
  const body = el('div', null, el('p', { class: 'sui-p' }, t('code.search.confirm', { matches: t('code.search.matches', { n: matches }), files: t('code.search.files', { n: list.length }) })),
    closed ? el('p', { class: 'sui-p cd-note' }, t('code.search.confirm_closed', { n: closed })) : null);
  const ok = await new Promise((res) => UI().dialog({ title: t('code.search.confirm_title'), body, buttons: [{ label: t('menu.cancel') },
    { label: t('code.search.confirm_btn'), primary: true, act: () => res(true) }], onClose: () => res(false) }));
  if (!ok) return;
  const my = ++st.run;
  setBusy(true);
  const r = await replaceFiles(st.q, F.replace.value, list, { cancelled: () => st.run !== my, progress: (done, total) => say(t('code.search.progress', { done, total })) });
  setBusy(false);
  F.list.replaceChildren(); st.results = []; F.replaceAll.disabled = true;
  if (r.error) { say(t('code.search.bad_regex', { error: r.error.message }), 'err'); return; }
  say(t('code.search.done', { matches: t('code.search.matches', { n: r.count }), files: t('code.search.files', { n: r.files }) }));
  if (r.skipped.length) F.list.replaceChildren(el('li', { class: 'cd-find-skip' }, t('code.search.left_alone', { n: r.skipped.length })),
    ...r.skipped.map((s) => el('li', { class: 'cd-find-skip' }, `${s.path}: ${whyText(s.why)}`)));
  if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(t('code.search.done', { matches: t('code.search.matches', { n: r.count }), files: t('code.search.files', { n: r.files }) }));
}

/** A kind from shared/patterns fills the box with its expression (and the replacement with a mask). */
function patternList() {
  const P = window.SlopPatterns;
  if (!P || !P.KINDS) return null;
  const sel = el('select', { class: 'sui-select cd-find-kind', 'aria-label': t('code.search.pattern') },
    el('option', { value: '' }, t('code.search.pattern_none')), P.KINDS.map((k) => el('option', { value: k.id }, t('ui.patterns.' + k.id))));
  sel.addEventListener('change', () => {
    const k = P.byId(sel.value);
    if (!k) return;
    const r = P.regex(k.id);
    F.find.value = r.source;
    F.regexp.setAttribute('aria-pressed', 'true');
    F.caseSensitive.setAttribute('aria-pressed', /i/.test(r.flags || '') ? 'false' : 'true');
    F.wholeWord.setAttribute('aria-pressed', 'false');
    F.replace.value = '[' + k.id + ']';
  });
  return sel;
}

/** Build the section. Called once at boot. */
export function initSearch() {
  box = $('cd-sec-search-body');
  if (!box) return;
  const s = saved();
  F.find = el('input', { class: 'sui-input', type: 'search', name: 'find', placeholder: t('code.search.find'), 'aria-label': t('code.search.find'), spellcheck: 'false', autocomplete: 'off' });
  F.replace = el('input', { class: 'sui-input', type: 'text', name: 'replace', placeholder: t('code.search.replace'), 'aria-label': t('code.search.replace'), spellcheck: 'false', autocomplete: 'off' });
  F.include = el('input', { class: 'sui-input', type: 'text', name: 'include', placeholder: t('code.search.include'), 'aria-label': t('code.search.include'), spellcheck: 'false', autocomplete: 'off' });
  F.scope = el('select', { class: 'sui-select', name: 'scope', 'aria-label': t('code.search.scope') }, ['all', 'folder', 'open'].map((v) => el('option', { value: v }, t('code.search.scope_' + v))));
  F.scope.value = ['all', 'folder', 'open'].includes(s.scope) ? s.scope : 'all';
  F.scope.addEventListener('change', () => writePref('search', { ...saved(), scope: F.scope.value }));
  F.go = el('button', { type: 'button', class: 'sui-btn sui-primary', onclick: run }, t('code.search.go'));
  F.replaceAll = el('button', { type: 'button', class: 'sui-btn', disabled: true, onclick: () => doReplace(st.results) }, t('code.search.replace_all'));
  F.status = el('p', { class: 'cd-find-status', role: 'status', 'aria-live': 'polite' });
  F.list = el('ul', { class: 'cd-find-list', 'aria-label': t('code.search.results') });
  const kinds = patternList();
  for (const input of [F.find, F.replace, F.include]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  box.replaceChildren(el('div', { class: 'cd-find' },
    el('div', { class: 'cd-find-row' }, F.find, toggle('caseSensitive', 'code.search.case', 'Aa'), toggle('wholeWord', 'code.search.word', 'ab'), toggle('regexp', 'code.search.regex', '.*')),
    kinds ? el('div', { class: 'cd-find-row' }, kinds) : null,
    el('div', { class: 'cd-find-row' }, F.replace), el('div', { class: 'cd-find-row' }, F.scope), el('div', { class: 'cd-find-row' }, F.include),
    el('div', { class: 'cd-find-row cd-find-btns' }, F.go, F.replaceAll), F.status, F.list));
}

/** Open the section and put the cursor in the search box, with the selected text (if any) as the search. */
export function focusSearch(setTreeOpen) {
  if (setTreeOpen) setTreeOpen(true);
  expandSection('search');
  const v = docs.mainView();
  const sel = v && !v.state.selection.main.empty ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : '';
  if (sel && !/\n/.test(sel)) F.find.value = sel;
  F.find.focus(); F.find.select();
}
