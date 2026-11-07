/* Slop Slides: boot. Loads the fonts, wires each view to the app state, registers with Slop Drive, then opens what the
   page was launched with (?drive=<id>) in a new tab. The open tabs come back first (ui/tabs.js). The "ready" class on <body> is
   what the tests wait for. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS;
  async function boot() {
    try { await SS.fonts.load(); } catch (e) { console.warn('Slop Slides: fonts did not load', e); }
    if (window.SlopHub) SlopHub.register('slides');
    var canvas = document.getElementById('canvas');
    SS.stage.mount(document.getElementById('stage'), canvas);
    SS.pointer.bind(canvas);
    SS.textEdit.mount(document.getElementById('editor'));
    SS.sorter.mount(document.getElementById('slides-list'));
    SS.inspector.mount(document.getElementById('inspector'));
    // Phones: the inspector is a bottom sheet (SlopSheet, shared/ui/sheet.js), opened and closed by Properties in the top
    // bar, with the shared ×, Escape, a tap outside and a swipe down. Wider, it stays in its column.
    if (window.SlopSheet) SS.sheet = SlopSheet.attach({ root: document.getElementById('app'), panel: document.getElementById('inspector'),
      phone: '(max-width: 700px)', toggles: [document.getElementById('btnInspector')], label: SU.t('slides.app.properties') });
    // The suite rule (shared/frame/HANDOFF.md): Save, the main button, and Present sit at the foot of the inspector on the
    // right (the shared footer, shared/frame/panel.js); on a phone the closed sheet still shows them. File ▸ Save, Ctrl+S too.
    if (window.SlopFramePanel) SlopFramePanel.create(document.getElementById('inspector'), { bare: true }).footer(
      [{ el: document.getElementById('btnSave'), primary: true }, { el: document.getElementById('btnPresent') }],
      { more: SU.t('slides.app.properties'), onMore: function () { if (SS.sheet) SS.sheet.toggle(); } });
    SS.toolbar.mount();
    SS.fileDrop.mount();
    SS.ctxmenu.mount();
    SS.commands.setup();
    await SS.files.boot(SS.fileDrop.launch()); // the launch is read before the tabs come back (they rewrite the address bar)
    await SS.viewState.restore();
    document.body.classList.add('ready');
  }
  boot();
})();
