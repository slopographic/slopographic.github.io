/* Slop Tables sidebar: the left column with Sheets, Templates (From template…, My templates) and Functions.
   It is collapsible; the choice is kept in this browser. Every item calls the same code as the menus. On a phone
   (720 px and under) the column is only its toggle strip, and the toggle opens the sidebar as a drawer from the start
   edge: SlopSheet (shared/ui/sheet.js) gives it the ×, Escape, a tap outside and a swipe left. */
import { S, $, redraw } from './state.js';
import * as Sheets from './sheets.js';
import * as TPL from './templates.js';
import * as F from './storage.js';
import { fromNative } from '../io/native.js';
import { fnNames } from '../fn/index.js';
import { startEdit } from './editor.js';
import { t as tr, onLang } from '../i18n.js';

const KEY = 'slop-tables.sidebar';
const LIMIT_MS = 1500; // My templates is read from IndexedDB; a read that never answers shows an empty list
const PHONE = '(max-width: 720px)';
let sheetsKey = '';
let drawer = null;
/** On a phone, picking a sheet or a function shows the grid again. */
const closeDrawer = () => { if (drawer) drawer.close(); };
let mineSeq = 0;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** A list item holding one control or text. */
const wrap = (node) => { const li = el('li'); li.append(node); return li; };

/* ---- collapse ---- */
function applyCollapsed(collapsed) {
  const side = $('side'), t = $('sideToggle');
  if (!side || !t) return;
  if (drawer && drawer.isPhone()) return phoneToggle(drawer.isOpen());   // the strip's toggle is the drawer's
  side.classList.toggle('collapsed', collapsed);
  t.setAttribute('aria-expanded', String(!collapsed));
  t.setAttribute('aria-label', tr(collapsed ? 'tables.side.show' : 'tables.side.hide'));
  t.title = t.getAttribute('aria-label');
  t.textContent = collapsed ? '›' : '‹';
}
function savedCollapsed() {
  try { return localStorage.getItem(KEY) === 'collapsed'; } catch (e) { return false; }
}
export function setCollapsed(collapsed) {
  try { localStorage.setItem(KEY, collapsed ? 'collapsed' : 'open'); } catch (e) { /* storage blocked: lasts this visit */ }
  applyCollapsed(collapsed);
  if (!collapsed) loadMine();
  redraw(); // the grid is wider or narrower now
}

/* ---- Sheets ---- */
/** Rebuilds the sheet list only when the names or the active sheet change. */
export function renderSheets() {
  const list = $('sideSheets');
  if (!list || !S.wb) return;
  const key = S.wb.sheets.map((s) => s.name).join('\u0001') + '|' + S.si;
  if (key === sheetsKey) return;
  sheetsKey = key;
  list.replaceChildren(...S.wb.sheets.map((sh, i) => {
    const b = el('button', 'side-item' + (i === S.si ? ' on' : ''), sh.name);
    b.type = 'button';
    b.title = sh.name;
    if (i === S.si) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => { Sheets.select(i); closeDrawer(); });
    return wrap(b);
  }));
}

/* ---- My templates ---- */
async function loadMine() {
  const list = $('sideMine');
  if (!list) return;
  const seq = ++mineSeq;
  const recs = await new Promise((res) => {
    const t = setTimeout(() => res([]), LIMIT_MS);
    Promise.resolve().then(() => TPL.listMine()).then((v) => { clearTimeout(t); res(v || []); }, () => { clearTimeout(t); res([]); });
  });
  if (seq !== mineSeq) return; // a newer load has started
  if (!recs.length) { list.replaceChildren(wrap(el('span', 'side-empty', tr('tables.side.none_saved')))); return; }
  list.replaceChildren(...recs.map((rec) => {
    const b = el('button', 'side-item', rec.name || tr('tables.tpl.untitled'));
    b.type = 'button';
    b.title = rec.description || rec.name || '';
    b.addEventListener('click', async () => {
      try { await F.useWorkbook(fromNative(rec.native), rec.name); } catch (e) { window.SlopUI.toast(tr('tables.tpl.open_failed')); }
      loadMine();
    });
    return wrap(b);
  }));
}

/* ---- Functions ---- */
function buildFunctions() {
  const list = $('sideFns');
  if (!list) return;
  list.replaceChildren(...fnNames().map((name) => {
    const b = el('button', 'side-item side-fn-b', name);
    b.type = 'button';
    b.title = tr('tables.side.fn_tip', { name });
    b.dataset.name = name;
    b.addEventListener('click', () => { if (!S.edit) { closeDrawer(); startEdit('=' + name + '('); } });
    return wrap(b);
  }));
  const filter = $('fnFilter');
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toUpperCase();
    for (const b of list.querySelectorAll('.side-fn-b')) b.parentNode.hidden = !!q && !b.dataset.name.includes(q);
  });
}

/** The toggle strip on a phone: › opens the drawer, ‹ closes it. */
function phoneToggle(open) {
  const t = $('sideToggle');
  t.textContent = open ? '‹' : '›';
  t.setAttribute('aria-label', tr(open ? 'tables.side.hide' : 'tables.side.show'));
  t.title = t.getAttribute('aria-label');
  t.setAttribute('aria-expanded', String(open));
}

/** Wires the sidebar. Called once at boot. */
export function init() {
  drawer = window.SlopSheet.attach({ root: $('side'), panel: $('sideBody'), side: 'start', phone: PHONE, toggles: [$('sideToggle')], label: tr('tables.side.sidebar'),
    onChange: (open) => { phoneToggle(open); if (open) loadMine(); } });
  matchMedia(PHONE).addEventListener('change', () => applyCollapsed(savedCollapsed()));
  applyCollapsed(savedCollapsed());
  $('sideToggle').addEventListener('click', () => { if (!drawer.isPhone()) setCollapsed(!$('side').classList.contains('collapsed')); });
  $('sideAddSheet').addEventListener('click', () => Sheets.add());
  $('sideFromTpl').addEventListener('click', () => TPL.openTemplates());
  buildFunctions();
  if (!savedCollapsed()) loadMine();
  onLang(() => { // the toggle, the function tips and My templates in the new language
    if (drawer && drawer.isPhone()) phoneToggle(drawer.isOpen()); else applyCollapsed(savedCollapsed());
    for (const b of document.querySelectorAll('#sideFns .side-fn-b')) b.title = tr('tables.side.fn_tip', { name: b.dataset.name });
    loadMine();
  });
}

/** Repaint hook: keeps the sheet list in step with the workbook. */
export function render() { renderSheets(); }
