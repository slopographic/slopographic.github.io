/* Slop Press — boot: build the UI, attach the view and tools, open a document (Slop Drive launch,
   autosave, or the welcome template), autosave on every change, drag & drop. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state, V = PR.view, UI = PR.ui, ST = PR.store;

  function welcomeDoc() {
    if (PR.templates && PR.templates.make) { try { return PR.templates.make('magazine'); } catch (e) { console.warn(e); } }
    return PR.model.create({ pages: 4 });
  }
  /* Files dropped on the stage (or chosen with the zone's button) go through the one intake (io/intake.js): a picture
     lands in the frame under the drop point, or on a new frame; a .slpress file opens. */
  function dropSetup() { PR.intake.attachDrop(U.$('#pressDrop'), U.$('#stage')); }
  function prefs() {
    var show = ST.pref('show'); if (show) U.assign(V.show, show);
    U.$('#app').classList.toggle('no-rulers', !V.show.rulers);
  }
  function boot() {
    prefs();
    UI.buildMenubar(); UI.buildToolbar(); UI.buildDock(); UI.buildStatus();
    V.init(U.$('#view'));
    PR.rulers.attach(U.$('#rulerH'), U.$('#rulerV'));
    PR.tools.attach(V.canvas);
    PR.textEdit.attach(U.$('#textInput'));
    dropSetup();
    UI.attachDockSheet();
    U.$('#panelsToggle').addEventListener('click', function () { if (!UI.dockSheet.isPhone()) UI.togglePanels(); });   // on a phone it is the drawer's toggle
    U.$('#searchCmd').addEventListener('click', function () { PR.actions.palette(); });
    var setKey = function () { U.$('#searchKey').textContent = PR.actions.keyFor('help.search') || (U.IS_MAC ? '⌘K' : 'Ctrl+K'); };
    setKey(); PR.on('keys', setKey);
    PR.on('commit', function () { ST.schedule(); });
    PR.on('doc', function () { V.request(); });
    PR.on('page', function () { V.request(); PR.ui.refreshPanels(); });
    addEventListener('pagehide', function () { if (S.dirty) ST.autosave(); });
    PR.actions.loadSlopCmd();
    PR.tools.set('select');
    // open: what the page was opened with (?drive=<id>, a PWA launch; the intake) → autosave → welcome template.
    // ?new skips the autosave (it stays saved). Not ?fresh: on every page that loads the newest release and reloads
    // without it (shared/pwa.js), so the reload restored the session anyway and swapped the document under its user.
    if (PR.hub) PR.hub.init();
    return PR.intake.launch().catch(function () { return false; }).then(function (opened) {
      if (opened) return true;
      return ST.restore().then(function (saved) {
        if (saved && saved.doc && !/[?&]new\b/.test(location.search)) { return PR.io.openDoc(saved.doc, saved.fileName).then(function () { S.dirty = true; U.toast(U.t('press.app.restored')); return true; }); }
        return PR.io.openDoc(welcomeDoc()).then(function () { return true; });
      });
    }).catch(function (e) {
      console.error(e);
      return PR.io.openDoc(PR.model.create({ pages: 2 }));
    }).then(function () {
      UI.dockSheet.close();
      V.resize(); V.fitPage(); UI.refreshPanels(); UI.refreshControlBar(true); UI.refreshStatus();
      U.$('#app').classList.add('ready');
      PR.emit('ready');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
