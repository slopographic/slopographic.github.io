/* SlopLabel — ui/boot: builds the toolbox, wires the chrome (buttons, drag and drop, resize) and
 * starts the app: print-form link, the open label tabs (ui/tabs.js), a file sent from another app, or the starter label. */
'use strict';

function buildToolbox() {
  const box = $('toolbox');
  for (const t of TOOLS) {
    if (t === '-') { box.append(mk('span', { class: 'tool-sep' })); continue; }
    const b = mk('button', { type: 'button', class: 'tool' + (t.id === App.tool ? ' on' : ''), 'data-tool': t.id, title: `${t.name} (${(window.SlopCmd && SlopCmd.keyFor('label.tool.' + t.id)) || t.key})`, 'aria-label': t.name, html: `<svg viewBox="0 0 24 24" aria-hidden="true">${t.svg}</svg>` });
    b.addEventListener('click', () => {
      if (t.id === 'image') { setTool('select'); insertImageFile(); return; }
      setTool(t.id);
      if (narrow() && t.create) status(LT('label.boot.tap_the_label_to_place'));
    });
    box.append(b);
  }
}
function wireChrome() {
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnPrint').addEventListener('click', openPrintDialog);
  wireDock();   // ui/app.js: the phone sheet
  // The suite rule (shared/frame/HANDOFF.md): Print…, the main button, sits at the foot of the right-hand dock (the shared
  // footer, shared/frame/panel.js); on a phone the closed dock sheet still shows it. File ▸ Print and Ctrl+P too.
  if (window.SlopFramePanel) SlopFramePanel.create($('dock'), { bare: true }).footer([{ el: $('btnPrint') }], { more: LT('label.boot.panels'), onMore: () => App.sheet && App.sheet.toggle() });
  $('cbLabel').addEventListener('click', () => labelSetupDialog());
  $('recPrev').addEventListener('click', () => setRecord(App.rec - 1));
  $('recNext').addEventListener('click', () => setRecord(App.rec + 1));
  $('zoomIn').addEventListener('click', () => zoomTo(App.zoom * 1.25));
  $('zoomOut').addEventListener('click', () => zoomTo(App.zoom / 1.25));
  $('zoomVal').addEventListener('click', fitView);
  // drag and drop anywhere: the strip over the stage is the intake's zone (ui/intake.js); a picture dropped on the stage
  // lands where it was dropped, everything else opens as Open… does (openFiles).
  attachLabelDrop();
  matchMedia('(max-width: 760px)').addEventListener('change', () => setTimeout(fitView, 50));
}
/** The label people see on first visit: the product label template. */
function starterDoc() { return TEMPLATES.find((t) => t.id === 'product').build(); }

async function boot() {
  applyTheme(document.documentElement.dataset.theme); // theme.js has painted the shared choice before this runs
  if (lsGet('sloplabel-rulers') === '0') $('workspace').classList.add('no-rulers');
  App.doc = starterDoc(); // until the tabs are up (startTabs)
  App.hist.reset(App.doc);
  buildToolbox(); initView(); initInteract(); initKeys(); initCommands(); wireChrome();
  onLabelLang(() => { if (App.doc) refreshNow(); });   // a language change: the panels, the bars and the status draw again
  onImageReady = () => refresh({ keepProps: true });
  if (await maybeFormMode()) return;
  rebuildScene(); fitView(); refreshNow();
  await startTabs(); // ui/tabs.js: the open labels come back, each with its tool, view and undo history
  status(LT('label.boot.ready'), '', 3000);
  await hubBoot().catch((e) => console.warn(e));
  document.body.classList.add('ready');
}
boot().catch((e) => { console.error(e); SlopUI.alert(LT('label.boot.sloplabel_could_not_start'), String(e && e.message || e)); });
