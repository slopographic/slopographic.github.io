/* Slop Drive — ui/items: which items the main pane shows (section, search, kind filter) and in what order. */
'use strict';
(function (DR) {
  const S = DR.S;
  const recency = (r) => Math.max(r.modified || 0, r.opened || 0, r.time || 0);
  const SORTS = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    type: (a, b) => DR.kindLabel(a).localeCompare(DR.kindLabel(b)) || SORTS.name(a, b),
    size: (a, b) => DR.sizeOf(a) - DR.sizeOf(b) || SORTS.name(a, b),
    modified: (a, b) => (a.modified || a.time || 0) - (b.modified || b.time || 0) || SORTS.name(a, b),
    added: (a, b) => (a.time || 0) - (b.time || 0) || SORTS.name(a, b),
    opened: (a, b) => (a.opened || 0) - (b.opened || 0) || SORTS.name(a, b),
  };
  /** The sort keys, in menu order. */
  DR.SORT_KEYS = [['name', 'Name'], ['type', 'Type'], ['size', 'Size'], ['modified', 'Modified'], ['added', 'Added'], ['opened', 'Opened']];   // i18n-ignore: English fallback
  /** A sort key's or a List column's label (Name, Type, ...), in the current language. */
  DR.colLabel = (key) => DR.t('drive.col.' + key);
  DR.SORTS = SORTS;
  DR.recency = recency;
  /** The first direction for a key: newest, biggest and last-used first; names and types A to Z. */
  DR.defaultDir = (key) => (['modified', 'added', 'size', 'opened'].includes(key) ? -1 : 1);
  /** Sort by key in dir (1 ascending, -1 descending) for the current view, and remember it for that view. */
  DR.setSort = function (key, dir = DR.defaultDir(key)) {
    S.sort = { key, dir: dir > 0 ? 1 : -1 };
    S.sorts[S.view] = S.sort;
    DR.savePrefs(); DR.render();
  };
  /** A header click or menu pick: a new key starts at its default direction; the same key flips. */
  DR.sortClick = (key) => DR.setSort(key, S.sort.key === key ? -S.sort.dir : DR.defaultDir(key));
  DR.sortItems = function (list, sort = S.sort) {
    const f = SORTS[sort.key] || SORTS.name, d = sort.dir || 1;
    return list.sort((a, b) => (a.isFolder !== b.isFolder ? (a.isFolder ? -1 : 1) : d * f(a, b)));
  };
  const kindOk = (it) => S.kind === 'all' || (S.kind === 'folder' ? it.isFolder : !it.isFolder && DR.kindOf(it) === S.kind);
  const queryOk = (it, q) => !q || it.name.toLowerCase().includes(q) || (!it.isFolder && (DR.appName(it.from).toLowerCase().includes(q) || DR.kindLabel(it).toLowerCase().includes(q)));
  /** The edited copy and the change list of a PDF are versions of its original (shown in its preview), not files of their own. */
  DR.isCompanion = (it) => !!(it && it.meta && it.meta.pdf && (it.meta.pdf.role === 'edited' || it.meta.pdf.role === 'changes'));
  /** The items for the current view, already filtered and sorted. */
  DR.visible = function () {
    const q = S.query.trim().toLowerCase();
    let list;
    if (S.section === 'trash') list = DR.trashTops();
    else if (S.section === 'recent') list = DR.liveFiles();
    else if (S.section === 'starred') list = [...DR.liveFolders(), ...DR.liveFiles()].filter((it) => it.starred);
    else if (q || S.tag) list = [...DR.liveFolders(), ...DR.liveFiles()];
    else { const c = DR.children(S.cwd); list = [...c.folders, ...c.files]; }
    list = list.filter((it) => !DR.isCompanion(it) && kindOk(it) && queryOk(it, q) && DR.tagOk(it));
    if (S.section === 'recent') return list.sort((a, b) => recency(b) - recency(a)).slice(0, 200);
    if (S.section === 'trash' && S.sort.key === 'name' && !q) return list.sort((a, b) => b.trashedAt - a.trashedAt);
    return DR.sortItems(list);
  };
  DR.searching = () => !!(S.query.trim() || S.tag) && S.section === 'folder';
  /** Title of the current place. */
  DR.placeName = function () {
    if (S.section === 'recent') return DR.t('drive.place.recent');
    if (S.section === 'starred') return DR.t('drive.place.starred');
    if (S.section === 'trash') return DR.t('drive.place.trash');
    return S.cwd ? (S.folders.get(S.cwd) || {}).name || DR.rootName() : DR.rootName();
  };
  /** Can the user add files here? (Only in a real folder, not Recent/Starred/Trash/search.) */
  DR.canAddHere = () => S.section === 'folder';
  DR.dest = () => (S.section === 'folder' ? S.cwd : null);
  /** Columns, Nodes and Usage show the folder tree; Recent, Starred, Trash and search fall back to the list. */
  DR.viewNow = () => (['columns', 'nodes', 'usage'].includes(S.view) && (S.section !== 'folder' || DR.searching()) ? 'list' : S.view);

  /** Navigate. go(folderId) opens a folder; go(null) the root; section switches with goSection. */
  DR.go = function (id, { keepQuery = false } = {}) {
    S.section = 'folder'; S.cwd = id || null; S.sel.clear(); S.anchor = S.focus = null;
    if (!keepQuery) { S.query = ''; S.tag = ''; const s = DR.$('search'); if (s) s.value = ''; }
    for (const f of DR.pathOf(S.cwd)) S.tree.add(f.id);
    DR.pushHistory && DR.pushHistory();
    DR.render();
  };
  DR.goSection = function (sec) {
    S.section = sec; S.sel.clear(); S.anchor = S.focus = null; S.query = ''; S.tag = ''; const s = DR.$('search'); if (s) s.value = '';
    DR.pushHistory && DR.pushHistory();
    DR.render();
  };
  DR.up = function () { if (S.section !== 'folder') return DR.goSection('folder'); if (S.cwd) { const prev = S.cwd; DR.go(S.folders.get(S.cwd).parent); DR.select(['d:' + prev]); } };
  /** Show a file or folder where it lives, selected. */
  DR.reveal = function (it) {
    if (!it) return;
    if (it.trashedAt || DR.hidden(it)) { DR.goSection('trash'); }
    else DR.go(it.parent);
    DR.select([DR.keyOf(it)]);
    DR.scrollToFocus && DR.scrollToFocus();
  };
  // DR.pushHistory (a navigation adds a history entry) and back/forward live in app/url-state.js.
})(window.DR);
