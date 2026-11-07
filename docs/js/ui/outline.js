/* Slop Docs — ui/outline: the document outline sidebar. A tree of the Heading 1 to 3 paragraphs, read from the document
 * through model/outline.js. The current section is highlighted as the caret or the page moves. A header button hides the
 * sidebar to a rail; the rail button shows it again. On a phone the outline is a drawer from the start edge, opened and
 * closed by the rail button: SlopSheet (shared/ui/sheet.js) gives it the ×, Escape, a tap outside and a swipe. The
 * desktop state is kept per session. Shortcuts: Ctrl+Shift+O, Alt+Up, Alt+Down (SlopCmd). ES module, loaded last. */
import * as M from '../model/outline.js';
import * as A from './outline-actions.js';
import * as MENU from './outline-menu.js';

const S = window.SlopDocs;
const t = (k, v) => S.t(k, v);
const KEY = 'slop-docs.outline';
const PHONE = window.matchMedia('(max-width: 640px)');
const ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>';
const PLUS = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const collapsed = new Set();   // ids of the collapsed headings (kept for the session)
const st = { root: null, app: null, stage: null, tree: null, tn: null, nodes: new Map(), desk: true, sheet: null, active: -1, timer: 0, raf: 0 };

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function button(cls, html, label, onClick) {
  const b = el('button', cls);
  b.type = 'button';
  b.innerHTML = html;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- sidebar state: desktop open or rail, phone drawer ---------- */
function readOpen() { try { return sessionStorage.getItem(KEY) !== 'shut'; } catch (e) { return true; } }
function saveOpen() { try { sessionStorage.setItem(KEY, st.desk ? 'open' : 'shut'); } catch (e) { /* storage blocked */ } }
const isOpen = () => (PHONE.matches ? !!st.sheet && st.sheet.isOpen() : st.desk);

function applyMode() {
  const phone = PHONE.matches;
  st.app.classList.toggle('ol-phone', phone);
  st.app.classList.toggle('ol-shut', !phone && !st.desk);
  const show = st.root.querySelector('.ol-show');
  show.setAttribute('aria-expanded', String(isOpen()));
  show.setAttribute('aria-label', t(phone ? 'docs.ol.open' : 'docs.ol.show'));
  show.title = t(phone ? 'docs.ol.open' : 'docs.ol.show_tip');
  const hide = st.root.querySelector('.ol-hide');
  hide.setAttribute('aria-label', t('docs.ol.hide'));
  hide.title = t(phone ? 'docs.ol.close' : 'docs.ol.hide_tip');
}
function setOpen(open) {
  if (PHONE.matches) { if (st.sheet) { if (open) st.sheet.open(); else st.sheet.close(); } return; }
  st.desk = open; saveOpen();
  applyMode();
  S.focusIme();
}

/* ---------- the tree ---------- */
function render() {
  if (!st.tn || !st.tree) return;
  st.nodes = new Map();
  const rows = M.visibleRows(st.tree, collapsed).map((r) => {
    const n = r.node;
    st.nodes.set(n.b, n);
    const row = el('div', 'ol-row');
    row.dataset.b = n.b;
    row.dataset.level = n.level;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(r.depth + 1));
    row.style.paddingLeft = (4 + r.depth * 14) + 'px';
    if (r.hasKids) {
      row.setAttribute('aria-expanded', String(r.open));
      const tw = el('button', 'ol-twist', r.open ? '▾' : '▸');
      tw.type = 'button';
      tw.dataset.id = n.id;
      tw.setAttribute('aria-label', t(r.open ? 'docs.ol.collapse_x' : 'docs.ol.expand_x', { name: n.text || t('docs.ol.heading') }));
      row.append(tw);
    } else row.append(el('span', 'ol-gap'));
    const label = el('button', 'ol-label', n.text || t('docs.ol.untitled_heading'));
    label.type = 'button';
    label.title = n.text;
    label.dataset.b = n.b;
    row.append(label);
    return row;
  });
  if (!rows.length) rows.push(el('p', 'ol-empty', t('docs.ol.empty')));
  st.tn.replaceChildren(...rows);
  markActive();
}
/** Rebuild the tree from the document (debounced after edits). */
function rebuild() {
  st.timer = 0;
  if (!S.doc) return;
  st.tree = M.buildTree(S.doc.blocks);
  render();
  setActive(M.headingAt(S.doc.blocks, S.sel.f.b));
}
function schedule() { clearTimeout(st.timer); st.timer = setTimeout(rebuild, 120); }
function toggleNode(id) {
  if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
  render();
}
const bulk = {
  collapseAll: () => { if (st.tree) { for (const n of M.allNodes(st.tree)) if (n.children.length) collapsed.add(n.id); render(); } },
  expandAll: () => { collapsed.clear(); render(); },
};

/* ---------- the current section ---------- */
/** Highlight the row of block b (the heading, or the collapsed ancestor that hides it). */
function setActive(b) {
  st.active = b;
  markActive();
}
function markActive() {
  if (!st.tn) return;
  const path = st.active >= 0 && st.tree ? M.pathTo(st.tree, st.active) : null;
  let show = -1;
  if (path) { const hidden = path.slice(0, -1).find((n) => collapsed.has(n.id)); show = (hidden || path[path.length - 1]).b; }
  let cur = null;
  for (const row of st.tn.querySelectorAll('.ol-row')) {
    const on = +row.dataset.b === show;
    row.classList.toggle('ol-active', on);
    if (on) { row.setAttribute('aria-selected', 'true'); cur = row; } else row.removeAttribute('aria-selected');
  }
  if (cur) {
    const r = cur.getBoundingClientRect(), tn = st.tn.getBoundingClientRect();
    if (r.height && (r.top < tn.top || r.bottom > tn.bottom)) st.tn.scrollTop += r.top - tn.top - tn.height / 2 + r.height / 2;
  }
}
/** As the page scrolls, the section under the top of the page area is current. */
function scrollActive() {
  st.raf = 0;
  if (!st.tree || !S.R || !S.layout) return;
  const top = st.stage.getBoundingClientRect().top + 48, k = S.R.k();
  let pick = -1;
  for (const n of M.allNodes(st.tree)) {
    const c = S.R.caretBox({ b: n.b, o: 0 });
    const pg = c && document.querySelector(`#pages .page[data-pi="${c.pi}"]`);
    if (!pg) continue;
    if (pg.getBoundingClientRect().top + c.top * k > top) break;
    pick = n.b;
  }
  setActive(pick);
}

/* ---------- menus and shortcuts ---------- */
function onContext(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!S.doc || !window.SlopUI) return;
  const row = e.target.closest('.ol-row');
  const node = row && st.nodes.get(+row.dataset.b);
  const items = node ? MENU.sectionItems(node, bulk) : MENU.panelItems(bulk);
  SlopUI.menu(items, e.clientX, e.clientY);
}
function moveAtCaret(dir) {
  const b = M.headingAt(S.doc.blocks, S.sel.f.b);
  if (b < 0) { if (window.SlopUI) SlopUI.toast(t('docs.ol.not_in_section')); return; }
  A.move(b, dir);
}
/** Alt+Up and Alt+Down are read here, not by SlopCmd: SlopCmd skips Alt-only shortcuts while the caret is typing. */
function onAltArrow(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (!st.app.contains(e.target) || !S.doc || document.querySelector('.sui-back')) return;
  e.preventDefault();
  e.stopPropagation();
  moveAtCaret(e.key === 'ArrowUp' ? -1 : 1);
}
function registerKeys() {
  if (!window.SlopCmd) return;
  const group = t('docs.cmd.group_outline');
  SlopCmd.register([
    { id: 'outline.toggle', title: t('docs.cmd.outline_toggle'), group, keys: ['Shift+Mod+O'], run: () => setOpen(!isOpen()) },
    { id: 'outline.up', title: t('docs.cmd.outline_up'), group, keys: [], run: () => moveAtCaret(-1) },
    { id: 'outline.down', title: t('docs.cmd.outline_down'), group, keys: [], run: () => moveAtCaret(1) },
    { id: 'outline.add', title: t('docs.cmd.outline_add'), group, keys: [], run: () => A.add() },
  ]);
}

/* ---------- mount ---------- */
/** The sidebar's own words, set when it is built and again after a language switch (the rail button: applyMode). */
function words() {
  st.root.setAttribute('aria-label', t('docs.ol.aria'));
  st.root.querySelector('.ol-title').textContent = t('docs.ol.title');
  const add = st.root.querySelector('.ol-add');
  add.querySelector('span').textContent = t('docs.ol.add');
  add.setAttribute('aria-label', t('docs.ol.add')); add.title = t('docs.ol.add');
  st.tn.setAttribute('aria-label', t('docs.ol.sections'));
}
function build() {
  const rail = el('div', 'ol-rail');
  rail.append(button('ol-show', ICON, t('docs.ol.show'), () => { if (!PHONE.matches) setOpen(true); }));   // on a phone: the drawer's toggle
  const panel = el('div', 'ol-panel');
  const head = el('div', 'ol-head');
  head.append(el('span', 'ol-title'));
  const add = button('ol-add', PLUS + '<span></span>', t('docs.ol.add'), () => A.add());
  head.append(add, button('ol-hide', ICON, t('docs.ol.hide'), () => setOpen(false)));
  st.tn = el('div', 'ol-tree');
  st.tn.setAttribute('role', 'tree');
  st.tn.addEventListener('click', (e) => {
    const tw = e.target.closest('.ol-twist');
    if (tw) { e.stopPropagation(); toggleNode(tw.dataset.id); return; }
    const lb = e.target.closest('.ol-label');
    if (!lb) return;
    A.goTo(+lb.dataset.b);
    if (PHONE.matches) setOpen(false);
  });
  panel.append(head, st.tn);
  st.root.append(rail, panel);
  st.root.addEventListener('contextmenu', onContext);
  if (window.SlopSheet) st.sheet = SlopSheet.attach({ root: st.app, panel, side: 'start', phone: PHONE.media, toggles: [rail.querySelector('.ol-show')], label: t('docs.ol.title'), onChange: applyMode });
  words();
}
function injectCss() {
  if (document.querySelector('link[data-outline]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../css/outline.css', import.meta.url).href;
  l.dataset.outline = '';
  document.head.append(l);
}
function init() {
  st.root = document.getElementById('outline');
  st.app = document.getElementById('app');
  st.stage = document.getElementById('stage');
  if (!S || !st.root || !st.app || !st.stage) return;
  injectCss();
  st.desk = readOpen();
  build();
  applyMode();
  PHONE.addEventListener('change', applyMode);
  st.stage.addEventListener('scroll', () => { if (!st.raf) st.raf = requestAnimationFrame(scrollActive); }, { passive: true });
  S.on('sel', () => { if (S.doc) setActive(M.headingAt(S.doc.blocks, S.sel.f.b)); });
  S.on('change', () => { if (S.doc) setActive(M.headingAt(S.doc.blocks, S.sel.f.b)); schedule(); });
  S.on('doc', schedule);
  S.on('layout', schedule);
  window.addEventListener('keydown', onAltArrow, true);
  registerKeys();
  S.onLang(() => { words(); applyMode(); registerKeys(); render(); });   // the sidebar's words and the palette follow a switch
  if (S.doc) rebuild();
}
init();
