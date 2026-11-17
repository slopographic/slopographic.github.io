/* Slop Music: the page controller. Views (Library, Playlists, Now playing), the keyboard (Space, arrows, M, N, P),
 * the document title, launch from Slop Drive (?drive=<id>), and refresh when Drive changes in another tab.
 * Scripts it wires: core/* and ui/* (see HANDOFF.md). */
(function () {
  'use strict';
  const M = window.SlopMusic, H = () => window.SlopHub, $ = (id) => document.getElementById(id);
  const VIEWS = ['library', 'playlists', 'now'];
  let view = 'library', tabs = null;
  function setView(v, { focus = false } = {}) {
    view = VIEWS.includes(v) ? v : 'library';
    tabs.show(view);   // SlopTabs (shared/ui/tabs.js): the view, the selected tab and the arrow keys
    if (view === 'now' && !$('queue-sheet').hidden) M.now.openQueue(false);
    M.mini.paint(view);
    if (focus) $('v-' + view).querySelector('h2, input, button, select')?.focus();
    try { history.replaceState(null, '', view === 'library' ? location.pathname + location.search : '#' + view); } catch (e) { /* file: pages */ }
  }
  function titleNow() {
    const s = M.engine.state(), t = s.trackId ? M.lib.track(s.trackId) : null;
    document.title = t && s.playing ? `▶ ${M.lib.display(t)} — Slop Music` : 'Slop Music — Slopographic';
  }
  const isTyping = (e) => (!!window.SlopTyping && window.SlopTyping.isTyping(e));   // shared/input/typing.js
  function keys(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || e.target.closest?.('[role=tab]')) return;   // a tab's arrows move between tabs
    const eng = M.engine, k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); eng.toggle(); }
    else if (k === 'ArrowLeft' && !e.target.closest?.('[role=slider]')) { e.preventDefault(); eng.seek(eng.state().time - (e.shiftKey ? 15 : 5)); }
    else if (k === 'ArrowRight' && !e.target.closest?.('[role=slider]')) { e.preventDefault(); eng.seek(eng.state().time + (e.shiftKey ? 15 : 5)); }
    else if (k === 'ArrowUp' && e.target.tagName !== 'SELECT') { e.preventDefault(); eng.setVolume(eng.state().volume + 0.05); }
    else if (k === 'ArrowDown' && e.target.tagName !== 'SELECT') { e.preventDefault(); eng.setVolume(eng.state().volume - 0.05); }
    else if (k === 'm' || k === 'M') eng.toggleMute();
    else if (k === 'n' || k === 'N') eng.next();
    else if (k === 'p' || k === 'P') eng.prev();
  }
  /** Plays a track of the library, with the whole library as the queue (the intake's reader, for Open in Slop Music). */
  M.playTrack = function (id) {
    M.engine.setQueue(M.lib.list().map((t) => t.id), id);
    setView('now');
  };
  /** What the page was opened with (?drive=<id>, a PWA launch), through the intake (ui/library.js). */
  const launch = () => window.SlopIntake.launch({ to: 'music' }).catch(() => null);
  function bindTabs() {
    tabs = window.SlopTabs.mount(document.querySelector('.mu-tabs'), { select: (v) => setView(v), panel: (k) => $('v-' + k) });
  }
  async function start() {
    if (H()) H().register('music');
    if (window.SlopCmd && M.cmds) { SlopCmd.init({ app: 'music' }); M.cmds.install(); }   // ai-commands.js: palette + Slop AI
    M.libUI.bind(); M.plUI.bind(); M.now.bind(); M.mini.bind(() => setView('now'));
    M.libUI.render();
    M.engine.subscribe(() => { titleNow(); M.mini.paint(view); });
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => M.mini.paint(view));   // its play button's label
    bindTabs();
    document.addEventListener('keydown', keys);
    const hash = location.hash.slice(1);
    setView(VIEWS.includes(hash) ? hash : 'library');
    await M.playlists.load();
    await M.lib.load().catch((e) => console.warn(e));
    launch();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) M.lib.load().catch(() => {}); });
    if (H()) H().on('drive:change', () => M.lib.load().catch(() => {}));
    M.libUI.render();
  }
  M.setView = setView;
  M.ready = new Promise((res) => {
    if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', res, { once: true });
  }).then(start);
})();
