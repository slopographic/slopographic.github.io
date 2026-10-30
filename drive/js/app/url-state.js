/* Slop Drive — app/url-state: the place in the page URL, through shared/router (SlopRoute, app 'drive').
 * Parameters (old links with the drv. prefix still work, and are rewritten to the plain names on the next change):
 *   cwd   the folder open in the tree (absent = the root)      s     the section when it is not the folder tree: recent | starred | trash
 *   v     the view (grid, list, compact, columns, nodes, usage)  sort  the sort key; dir its direction (1 or -1)
 *   q     the search text                                        f     the file open in Quick look
 * The URL follows every render and each Quick look open or close. A navigation (folder or section) adds a history entry,
 * so back and forward walk the folders; the file and the search are replaced in place. A link that has any of these keys
 * restores that place in place of the saved one. Nothing here is content: only ids and view options. */
'use strict';
(function (DR) {
  const S = DR.S;
  const SECTIONS = ['folder', 'recent', 'starred', 'trash'];
  const LEGACY = (k) => ['drv.' + k];
  let R = null;

  /** The router handle (shared/router). Registered once, when this file loads. */
  R = window.SlopRoute ? SlopRoute.register('drive', {
    params: {
      s: { values: SECTIONS, def: 'folder', legacy: LEGACY('s') },
      cwd: { pattern: /^\S{1,120}$/, def: '', legacy: LEGACY('cwd') },
      v: { pattern: /^[a-z]{1,20}$/, def: '', legacy: LEGACY('v') },
      sort: { pattern: /^[a-z]{1,20}$/, def: '', legacy: LEGACY('sort') },
      dir: { values: ['1', '-1'], def: '1', legacy: LEGACY('dir') },
      q: { def: '', max: 200, legacy: LEGACY('q') },
      f: { pattern: /^\S{1,120}$/, def: '', legacy: LEGACY('f') },
    },
    apply(s, why) { if (why === 'popstate') onPop(); },
  }) : null;
  const KEYS = ['s', 'cwd', 'v', 'sort', 'dir', 'q', 'f'];

  /** The place as URL parameters (null removes a key). */
  DR.urlPlace = function () {
    return {
      s: S.section === 'folder' ? null : S.section,
      cwd: S.section === 'folder' ? S.cwd : null,
      v: S.view,
      sort: S.sort.key,
      dir: String(S.sort.dir),
      q: S.query.trim() ? S.query : null,
      f: DR.quickLookId ? DR.quickLookId() : null,
    };
  };
  /** Write the place to the URL. push: a navigation, which adds a history entry. */
  DR.syncUrl = function ({ push = false, state = null } = {}) {
    if (!S.ready || !R) return;
    const p = DR.urlPlace();
    if (push) R.set(p, { push: true, state });
    else R.set(p);
  };
  /** A folder or section change: a new history entry, unless the URL already names this place (then it is replaced). */
  DR.pushHistory = function () {
    if (!R) return;
    const p = DR.urlPlace();
    const same = R.get('s') === (p.s || 'folder') && (R.get('cwd') || null) === (p.cwd || null);
    DR.syncUrl({ push: !same, state: { section: S.section, cwd: S.cwd } });
  };
  /** Does the URL carry a place? */
  DR.urlHasPlace = () => !!R && KEYS.some((k) => R.has(k));

  /** Apply the place in the URL to the UI state (no render). A missing key means the root, the stored view or sort.
   * Returns { file }: the id of the file the link opens in Quick look. */
  DR.placeFromUrl = function () {
    if (!R) return { file: null };
    const st = R.state();
    S.section = SECTIONS.includes(st.s) ? st.s : 'folder';
    const id = st.cwd;
    S.cwd = S.section === 'folder' && id && S.folders.has(id) && !DR.hidden(S.folders.get(id)) ? id : null;
    if (R.has('v') && DR.VIEWS.some((x) => x[0] === st.v)) S.view = st.v;
    const key = R.has('sort') ? st.sort : null;
    S.sort = key && DR.SORTS[key] ? { key, dir: Number(st.dir) === -1 ? -1 : 1 } : (S.sorts[S.view] || { key: 'name', dir: 1 });
    S.query = st.q;
    const search = DR.$('search'); if (search) search.value = S.query;
    S.sel.clear(); S.anchor = S.focus = null;
    for (const f of DR.pathOf(S.cwd)) S.tree.add(f.id);
    return { file: st.f || null };
  };
  /** Open a file in Quick look, if Drive has it and it is not in the Trash. */
  DR.openFileById = function (id) {
    const it = id ? S.files.get(id) : null;
    if (it && !it.trashedAt && !DR.hidden(it) && DR.quickLook) DR.quickLook(it);
  };
  // Back and forward: the URL is the state. A popped entry may hold another file, so Quick look follows it.
  function onPop() {
    if (!S.ready) return;
    const want = DR.placeFromUrl().file;
    if (DR.quickLookId() && DR.quickLookId() !== want && DR.quickLookClose) DR.quickLookClose();
    DR.render();
    if (want && want !== DR.quickLookId()) DR.openFileById(want);
  }

  /** Copy the link to the current view (the Copy link command). */
  DR.copyLink = async function () {
    const url = R ? R.link() : location.href;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { ok = copyFallback(url); }
    DR.toast(DR.t(ok ? 'drive.toast.link_copied' : 'drive.toast.link_failed'));
  };
  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
})(window.DR);
