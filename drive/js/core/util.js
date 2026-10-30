/* Slop Drive — core/util: the DR namespace, UI state, preferences and small helpers.
 * Every script is a classic script that adds to window.DR. Item keys: 'd:<folderId>' and 'f:<fileId>'. */
'use strict';
window.DR = window.DR || {};
(function (DR) {
  const el = (...a) => window.SlopUI.el(...a);
  const PREF = 'slop-drive.prefs';
  // Stored as { v: 1, data }. The flat object from before the envelope (and from before sorts and cols) is still read.
  const load = () => { try { const o = JSON.parse(localStorage.getItem(PREF)) || {}; return o.v === 1 && o.data && typeof o.data === 'object' ? o.data : o; } catch (e) { return {}; } };
  const p = load();
  /** UI state. section: folder | recent | starred | trash. view: grid | list | compact | columns | nodes | usage. */
  DR.S = {
    files: new Map(), folders: new Map(),
    section: 'folder', cwd: null, query: '', kind: 'all',
    view: p.view || 'grid', usageMode: p.usageMode || 'treemap', tag: '',
    sorts: p.sorts || (p.sort ? { [p.view || 'grid']: p.sort } : {}), cols: p.cols || {},
    info: p.info != null ? p.info : innerWidth > 1100, tree: new Set(p.tree || []), collapsed: new Set(p.collapsed || []),
    sel: new Set(), anchor: null, focus: null, clip: null, ready: false,
  };
  /** The sort in use is the one remembered for the current view (each view keeps its own). */
  DR.S.sort = DR.S.sorts[DR.S.view] || { key: 'name', dir: 1 };
  DR.savePrefs = function () {
    const S = DR.S;
    const data = { view: S.view, usageMode: S.usageMode, sorts: S.sorts, cols: S.cols, info: S.info, tree: [...S.tree], collapsed: [...S.collapsed] };
    try { localStorage.setItem(PREF, JSON.stringify({ v: 1, data })); } catch (e) { /* blocked */ }
  };
  DR.el = el;
  DR.$ = (id) => document.getElementById(id);
  DR.fmtSize = (n) => window.SlopHub.fmtSize(n);   // one copy: SlopHub.fmtSize (shared/hub.js)
  /** The words: DR.t(key, vars) reads drive/i18n (shared/i18n/APPS-HOWTO.md); onLang(fn) re-runs fn after a language
   * change, once the new tables are in (for UI built once). loc() is the locale for dates ([] = the browser's in English). */
  DR.t = (key, vars) => { const I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  DR.onLang = (fn) => { const I = window.SlopI18n; return I && I.on ? I.on(fn) : () => {}; };
  DR.loc = () => { const I = window.SlopI18n, c = I && I.get && I.get(); return c && c !== 'en' ? c : []; };
  DR.fmtDate = (t) => {
    if (!t) return '—';
    const d = new Date(t), now = new Date(), hm = () => d.toLocaleTimeString(DR.loc(), { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return DR.t('drive.app.today_at', { time: hm() });
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return DR.t('drive.app.yesterday_at', { time: hm() });
    return d.toLocaleDateString(DR.loc(), { year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'short', day: 'numeric' });
  };
  DR.fmtFull = (t) => (t ? new Date(t).toLocaleString(DR.loc()) : '—');
  DR.debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  DR.keyOf = (item) => (item.isFolder ? 'd:' : 'f:') + item.id;
  DR.isMobile = () => matchMedia('(max-width: 760px)').matches;
  DR.toast = (m) => window.SlopUI.toast(m);
  /** Stroke icons (24×24). */
  const P = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/>',
    compact: '<path d="M4 5h16M4 9h16M4 13h16M4 17h16M4 21h16"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/>',
    nodes: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11 15.7 7M8.3 13l7.4 4"/>',
    usage: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12m0 0-4-4m4 4 4-4"/><path d="M4 16v4h16v-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    dupes: '<rect x="3" y="7" width="11" height="13" rx="1.5"/><rect x="10" y="4" width="11" height="13" rx="1.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  DR.icon = (name, cls = 'ic') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.innerHTML = P[name] || P.file; return s; };
  DR.ICONS = P;
})(window.DR);
