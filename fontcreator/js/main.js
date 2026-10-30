/* Slop Font: boot. The header (SlopAppBar: Open…, and New font, Save project, the handwriting sheet in its menu), the
 * suite's List · View · Panel layout (shared/frame, SlopFrame: the glyph grid on the left, the editor, Kerning and Type
 * test views in the middle, the settings with Download font at the foot of the right panel; on phones the grid is the
 * page, a glyph opens over it, and the panel is a bottom sheet whose foot always shows), drops anywhere on the page
 * (shared intake, spec 'fontcreator'), a file sent from another app (?drive=), and the project kept in this browser
 * (js/store.js). Classic script, after the other parts. FC.main: frame(), tab(name), newFont(), ready (a Promise). */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => g.FC.state, F = () => g.SlopFont, t = (k, v) => g.FC.t(k, v);
  let frame = null, tabs = null, bar = null, resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  const name = () => (g.slopAppName ? g.slopAppName('fontcreator') : 'Slop Font');

  function tab(v) {
    if (!['draw', 'kerning', 'test'].includes(v)) throw new Error(`Unknown view “${v}”: draw, kerning or test`);   // i18n-ignore (API)
    if (tabs) tabs.show(v);
    S().set({ tab: v });
    if (frame && frame.showView) frame.showView();
    if (v === 'kerning') g.FC.kerning.paint();
    if (v === 'test') g.FC.tester.show();
    if (v === 'draw') g.FC.editor.paint();
  }
  function newFont() {
    const U = g.SlopUI, el = U.el;
    // the default names are the font's own data (they go into the file): i18n-ignore
    const fam = el('input', { class: 'sui-input', id: 'fc-new-family', value: 'My Font', maxlength: '120' }), style = el('input', { class: 'sui-input', id: 'fc-new-style', value: 'Regular', maxlength: '60' }); // i18n-ignore
    const chars = el('select', { class: 'sui-input', id: 'fc-new-chars' });
    for (const id of ['none', ...F().charset.SETS.map((s) => s.id), 'all']) chars.append(el('option', { value: id }, g.FC.setName(id)));
    chars.value = 'basic';
    U.dialog({ title: t('fontcreator.app.new_title'), cls: 'fc-dialog', body: el('div', { class: 'fc-dlg' }, U.field(t('fontcreator.info.family'), fam), U.field(t('fontcreator.info.style'), style), U.field(t('fontcreator.app.new_chars'), chars),
      el('p', { class: 'sui-p' }, t('fontcreator.app.new_note'))),
    buttons: [{ label: t('menu.cancel') }, { label: t('fontcreator.app.create'), primary: true, act: () => {
      const p = F().model.create({ family: fam.value.trim() || 'My Font', style: style.value.trim() || 'Regular' });
      if (chars.value !== 'none') for (const cp of F().charset.codes(chars.value)) F().model.ensure(p, cp);
      S().load(p, t('fontcreator.app.new_title'));
      S().set({ set: chars.value === 'none' ? 'font' : chars.value });
      U.toast(t('fontcreator.app.new_done', { name: p.info.family }));
    } }] });
  }
  function hint() {
    const box = $('fc-start');
    if (box) box.hidden = F().model.stats(S().project()).drawn > 0;
  }
  /** The header first, at once: the shell's buttons and the Tour button go into it when the page is parsed. */
  const actions = () => [{ id: 'open', label: t('fontcreator.app.open'), icon: 'open', onClick: () => g.SlopIntake.pick({ to: 'fontcreator' }) }];
  const menu = () => [{ id: 'new', label: t('fontcreator.cmd.new'), onClick: newFont }, { id: 'save', label: t('fontcreator.app.save_project'), icon: 'save', onClick: () => g.FC.io.saveToDrive('sfont').catch((e) => g.SlopUI.toast(e.message)) },
    { id: 'download-project', label: t('fontcreator.app.download_project'), icon: 'download', onClick: () => g.FC.io.download('sfont') }, { separator: true },
    { id: 'sheet', label: t('fontcreator.cmd.sheet'), icon: 'print', onClick: () => g.FC.sheetUi.template() }, { id: 'sheet-read', label: t('fontcreator.more.sheet_read'), onClick: () => g.FC.sheetUi.pick() }];
  function header() {
    bar = g.SlopAppBar.mount($('fc-bar'), { home: '../', title: name(), subtitle: t('fontcreator.app.subtitle'), actions: actions(), menu: menu() });
    g.FC.onLang(() => { if (!bar) return; bar.setTitle(name()); bar.setSubtitle(t('fontcreator.app.subtitle')); bar.setActions(actions()); bar.setMenu(menu()); });
  }
  function boot() {
    frame = g.SlopFrame.mount($('fc-main'), { list: $('fc-list'), view: $('fc-view'), panel: $('fc-panel'), panelLabel: 'ui.settings', storageKey: 'fontcreator',
      phone: '(max-width: 860px)', phoneButton: false, width: 320, min: 280, max: 480 });
    if (frame.setList) frame.setList(true);
    g.FC.io.register();
    g.FC.grid.mount($('fc-list'));
    g.FC.toolbar.mount($('fc-tools-host'));
    g.FC.editor.mount($('fc-stage'));
    g.FC.kerning.mount($('view-kerning'));
    g.FC.tester.mount($('view-test'));
    g.FC.panel.mount($('fc-panel'));
    tabs = g.SlopTabs.mount($('fc-tabs'), { select: (v) => tab(v) });
    tabs.show(S().settings().tab || 'draw');
    for (const [id, run] of [['fc-start-pen', () => { g.FC.tools.set('pen'); g.FC.editor.focus(); }], ['fc-start-open', () => g.SlopIntake.pick({ to: 'fontcreator' })],
      ['fc-start-sheet', () => g.FC.sheetUi.template()], ['fc-start-svg', () => g.FC.svgUi.open()]]) $(id).addEventListener('click', run);
    g.SlopIntake.dropTarget($('fc-main'), { to: 'fontcreator' });
    S().on(hint);
    hint();
    if (g.SlopHub) g.SlopHub.register('fontcreator');
    g.SlopIntake.launch({ to: 'fontcreator' });
  }
  g.FC.main = { frame: () => frame, tab, newFont, ready };
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      header();
      await g.FC.store.restore();
      boot();
      if (S().settings().tab !== 'draw') tab(S().settings().tab);
    } catch (e) { console.error(e); if (g.SlopUI) g.SlopUI.toast(t('fontcreator.app.start_failed', { app: name(), error: e.message })); }
    document.body.classList.add('ready');
    resolveReady();
  });
})(window);
