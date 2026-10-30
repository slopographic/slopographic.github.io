/* Slop Hex: boot. Registers the app with Slop Drive, wires the toolbar, the Go to and Find bars, drag and drop, the
 * right-click menu and the commands. The open files come back as tabs (js/tabs.js); a file launched with ?drive=<id> (the way
 * Paste and Code launch) opens in a tab of its own.
 * Classic script, runs once the page is parsed. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = () => window.HexApp;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function wire() {
    const act = (id, fn) => $(id).addEventListener('click', fn);
    act('hx-open', () => A().pickComputer());
    act('hx-open2', () => A().pickComputer());
    act('hx-drive', () => A().pickDrive());
    act('hx-drive2', () => A().pickDrive());
    act('hx-save', () => A().saveVersion());
    act('hx-saveas', () => A().saveAs());
    act('hx-dl', () => A().download());
    act('hx-sha-btn', () => A().computeSha());
    act('hx-cmd', () => { if (window.SlopCmd && SlopCmd.open) SlopCmd.open(); });
    act('hx-menu', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      SlopUI.menu(window.HexCommands.menuItems(), r.left, r.bottom + 4);
    });
    act('hx-prev', () => A().find(-1));
    $('hx-goform').addEventListener('submit', (e) => {
      e.preventDefault();
      if (A().gotoOffset($('hx-goto').value)) A().grid().focus();
    });
    $('hx-findform').addEventListener('submit', (e) => { e.preventDefault(); A().find(1); });
    if (window.SlopCtx) SlopCtx.bind($('hx-scroll'), () => window.HexCommands.contextItems());
    /* The one way in (shared/intake, spec 'hex'): a file dropped on the tabs, the strip or the bytes, Open file…, Open from
       Slop Drive (linked to its record), the sample, a paste, ?drive=<id> and a PWA launch open in a tab, one file at a time; a file
       already open is not opened again. Files wait for the tabs to come back (boot). */
    window.SlopIntake.register({
      id: 'hex', accept: { any: true, allowEmpty: true, noun: 'hex.app.a_file' }, limit: 1,
      before: () => tabsBack,
      process: async (file, ctx) => {
        if (A().isOpen(file)) throw new Error(t('hex.app.already_open', { name: file.name }));   // shown to the person (the intake's row)
        await A().openBlob(file, { name: file.name, driveId: ctx.drive ? ctx.drive.id : null });
        return file.name;
      },
    });
    window.SlopDrop.attach($('hx-drop'), {
      intake: 'hex',
      compact: true,
      targets: [$('hx-tabs'), $('hx-drop'), $('hx-main')],
    });
    // The empty page shows a file's bytes and how (SlopDrop's preview); the sample (a small PDF) goes through the strip.
    const empty = $('hx-empty'), row = empty.querySelector('.hx-empty-b'), sample = document.createElement('button');
    const pre = window.SlopDrop.panel.preview({
      picture: { src: '../assets/shots/hex.jpg', alt: t('hex.drop.alt') },
      steps: [t('hex.drop.step1'), t('hex.drop.step2'), t('hex.drop.step3')],
    });
    // the preview is drawn once: its steps and picture text are marked so they follow a language change
    pre.querySelectorAll('.sd-steps li').forEach((li, i) => { li.dataset.i18n = 'hex.drop.step' + (i + 1); });
    const img = pre.querySelector('img'); if (img) img.dataset.i18nAttr = 'alt:hex.drop.alt';
    empty.insertBefore(pre, row);
    sample.type = 'button'; sample.className = 'sd-sample'; sample.id = 'hx-sample'; sample.dataset.i18n = 'hex.drop.sample'; sample.textContent = t('hex.drop.sample');
    sample.addEventListener('click', () => window.SlopIntake.sample([window.SlopSamples.docs.pdf()], { to: 'hex' }));
    row.append(sample);
  }

  let tabsBack = null;
  async function boot() {
    SlopHub.register('hex');
    const grid = HexGrid.create({
      scroll: $('hx-scroll'), spacer: $('hx-spacer'), rows: $('hx-rows'),
      onSelect: () => A().refresh(),
      onChange: () => A().changed(),
      onCopy: () => A().copySel(),
    });
    A().app.grid = grid;
    wire();
    window.HexPanel.mount();   // the inspector on the right, Save version at its foot (js/panel.js)
    window.HexCommands.register();
    // The launch (the intake) is read before the tabs come back: showing a tab rewrites the address bar (its ?drive= id).
    // Its file opens once the tabs are back.
    let back;
    tabsBack = new Promise((r) => { back = r; });
    const launching = window.SlopIntake.launch({ to: 'hex' }).catch((e) => { SlopUI.toast(t('hex.app.open_failed', { error: e.message })); });
    const session = HexTabs.mount($('hx-tabs'), { activate: A().activate, deactivate: A().deactivate, refresh: A().refresh });
    try { await session.restore(); } catch (e) { console.warn('Slop Hex: restore failed', e); }
    if (!HexTabs.current()) HexTabs.api().newTab();
    A().refresh();
    back();
    await launching;
    document.body.classList.add('ready');
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((e) => { console.error(e); document.body.classList.add('ready'); if (window.SlopUI) SlopUI.toast(t('hex.app.start_failed', { error: e.message })); });
  });
})();
