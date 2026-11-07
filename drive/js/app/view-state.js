/* Slop Drive — app/view-state: the place you were in (section, folder, tag, search, file kind and scroll) is kept in
 * SlopSession, so leaving Drive for another app, or reloading, returns to the same folder. View, sort, columns and the
 * info panel are already kept in slop-drive.prefs (core/util.js) and are not repeated here. Back and forward inside
 * Drive still use history (items.js). */
'use strict';
(function (DR) {
  const S = DR.S, APP = 'drive', SECTIONS = ['folder', 'recent', 'starred', 'trash'];
  const pane = () => DR.$('pane');
  const state = () => ({ section: S.section, cwd: S.cwd, tag: S.tag, kind: S.kind, query: S.query, scroll: pane() ? pane().scrollTop : 0 });
  const auto = window.SlopSession.autosave(APP, 'view', state, { delay: 300 });
  let pendingScroll = 0;

  /** Called by render() once Drive is ready, so nothing is saved before the saved place is applied. */
  DR.touchView = () => auto.touch();

  /** Boot: apply the saved place. Runs after the Drive mirror is loaded, so a folder that is gone is ignored. */
  DR.restoreView = async function () {
    const v = await window.SlopSession.load(APP, 'view', null).catch(() => null);
    if (!v || typeof v !== 'object') return;
    if (SECTIONS.includes(v.section)) S.section = v.section;
    S.cwd = v.cwd && S.folders.has(v.cwd) && !DR.hidden(S.folders.get(v.cwd)) ? v.cwd : null;
    S.tag = typeof v.tag === 'string' ? v.tag : '';
    S.kind = typeof v.kind === 'string' ? v.kind : 'all';
    S.query = typeof v.query === 'string' ? v.query : '';
    const s = DR.$('search'); if (s) s.value = S.query;
    pendingScroll = Number(v.scroll) || 0;
  };
  /** Boot, after the first render: put the list back where it was. */
  DR.restoreScroll = function () { if (pendingScroll && pane()) { pane().scrollTop = pendingScroll; pendingScroll = 0; } };

  // The scripts load at the end of <body>, so the pane exists here.
  if (pane()) pane().addEventListener('scroll', () => { if (S.ready) auto.touch(); }, { passive: true });
})(window.DR);
