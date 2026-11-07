/* SlopIsolate — menus: the File / Edit / View / Help bar, the More menu (theme, Send to, about), the top-bar
 * buttons (undo, redo, download, panel, more) and the empty-state buttons. The shared actions live in
 * CO.menus.act, so the menus and the SlopCmd commands (ui/commands.js) run the same code. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, H = CO.history, $ = U.$, h = U.h, t = U.t;
  const hub = () => (document.documentElement.dataset.offline ? null : window.SlopHub || null);
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  const cur = () => S.current();
  const done = () => { const it = cur(); return !!it && it.status === 'done'; };
  /* The app's names and the shared theme ids (shared/theme/theme.js): the choice is saved through SlopTheme.set. */
  const THEMES = [['pro', 'cutout.menu.theme_pro', 'dark'], ['light', 'cutout.menu.theme_light', 'light'], ['classic', 'cutout.menu.theme_classic', 'classic']]
    .filter(([, , s]) => !window.SlopTheme || SlopTheme.has(s));   // only the themes the site offers
  CO.THEMES = THEMES;
  /** Undo / Redo with the step's name (ui.undo_what), for the Edit menu, the canvas menu and the buttons' tooltips. */
  const stepLabel = (dir, l) => (l ? t('ui.' + dir + '_what', { what: l }) : t('ui.' + dir));

  /* ---------- shared actions ---------- */
  async function guard(fn) { try { await fn(); } catch (e) { toast(e.message || String(e)); } }
  function needItem() { const it = cur(); if (!it) throw new Error(t('cutout.menu.open_first')); return it; }
  const act = {
    open: () => CO.files.open(),
    sample: () => CO.files.sample(),
    driveOpen: () => guard(() => SlopIntake.fromDrive({ to: 'cutout', accept: ['image/*'], title: t('cutout.menu.drive_title') })),
    exportOne: (it) => guard(() => CO.export.one(it || needItem())),
    exportAll: () => guard(() => CO.export.all()),
    exportSel: () => guard(() => CO.bulk.act('export')),   // the selected pictures that are done, as a ZIP
    // Slop Workflows: Remove background as a step, with the model and the look of the image on screen, or of the selected
    // pictures where they agree (a setting they differ on comes from the image on screen) (shared/ops/flowdoc.js)
    workflow: () => guard(() => {
      const src = cur() || S.defaults, items = S.bulk() ? S.targets() : [src];
      const it = CO.settings.agreed(items, src, S.modelOf);
      return window.SlopFlowDoc.addToWorkflow({ id: 'slopisolate.remove-bg' }, { settings: { model: it.model || S.model, look: { bg: it.bg, shadow: it.shadow, crop: it.crop } } });
    }),
    undo: () => { const it = cur(); if (H.can(it, 'undo')) H.undo(it); },
    redo: () => { const it = cur(); if (H.can(it, 'redo')) H.redo(it); },
    clearEdits: () => {
      if (S.bulk()) return CO.bulk.act('clear');   // with a selection: every selected picture, one undo step
      const it = cur();
      if (!it || !CO.brush.hasEdits(it)) return toast(t('cutout.menu.no_edits'));
      const old = it.edit.slice();
      it.edit.fill(128);
      // The entry holds the bytes it swaps with, so undo restores `old` and redo clears again.
      H.push(it, { kind: 'stroke', label: 'cutout.menu.clear_edits', tiles: [{ x0: 0, y0: 0, w: it.w, h: it.h, bytes: old }], rect: { x: 0, y: 0, x1: it.w, y1: it.h } });
    },
    tool: (tool) => S.setTool(tool),
    view: (v) => S.setView(v),
    fit: () => CO.view.fit(),
    zoom: (f) => { const r = $('#stage').getBoundingClientRect(); CO.view.zoomAt(f, r.width / 2, r.height / 2); },
    panel: () => {
      if (CO.sheet && CO.sheet.isPhone()) return CO.sheet.toggle();   // a phone: the settings bottom sheet
      const off = $('#app').classList.toggle('no-panel');
      U.store.set('panel', !off);
      $('#btnPanel').setAttribute('aria-expanded', String(!off));
    },
    theme: (v) => {
      const row = THEMES.find(([x]) => x === v) || THEMES[0];
      const r = window.SlopTheme ? SlopTheme.set(row[2]) : { ok: false, error: t('cutout.menu.no_theme') };
      if (!r.ok) { if (window.SlopTheme) SlopTheme.apply(row[2]); toast(r.error); }
    },
    keys: () => (window.SlopCmd ? SlopCmd.openKeymap() : SlopUI.alert(t('cutout.menu.keys_title'), t('cutout.menu.keys_body'))),
    about: () => SlopUI.alert('SlopIsolate', t('cutout.menu.about_body')),
  };

  /* ---------- menu items (built fresh each time a menu opens, so states and keys are current) ---------- */
  const keyOf = (id, fallback) => (window.SlopCmd ? SlopCmd.keyFor(id) : fallback) || '';
  function fileItems() {
    const out = [
      { label: t('cutout.menu.open'), key: keyOf('co.file-open', 'Ctrl+O'), act: act.open },
      { label: t('cutout.menu.sample'), key: keyOf('co.file-sample'), act: act.sample },
      { label: t('cutout.menu.config'), sub: window.SlopConfigDialog ? SlopConfigDialog.menuItems({ app: 'cutout' }) : [] },
    ];
    if (hub()) out.push({ label: t('cutout.menu.drive_open'), act: act.driveOpen });
    out.push('-',
      { label: t('cutout.menu.export'), key: keyOf('co.export-one', 'Ctrl+S'), act: act.exportOne, disabled: !done() },
      { label: t('cutout.menu.export_all'), key: keyOf('co.export-all', 'Ctrl+Shift+S'), act: act.exportAll, disabled: !S.items.some((i) => i.status === 'done') });
    if (window.SlopFlowDoc) out.push('-', { label: t('cutout.menu.add_workflow'), act: act.workflow });
    return out;
  }
  function editItems() {
    const it = cur(), ul = H.label(it, 'undo'), rl = H.label(it, 'redo');
    return [
      { label: stepLabel('undo', ul), key: keyOf('co.undo', 'Ctrl+Z'), act: act.undo, disabled: !H.can(it, 'undo') },
      { label: stepLabel('redo', rl), key: keyOf('co.redo', 'Ctrl+Shift+Z'), act: act.redo, disabled: !H.can(it, 'redo') },
      '-',
      { label: t('cutout.menu.clear_edits'), act: act.clearEdits, disabled: !it || !CO.brush.hasEdits(it) },
      ...(window.SlopMacros ? ['-', SlopMacros.recording ? { label: t('cutout.menu.macro_stop'), act: () => SlopMacros.stop() } : { label: t('cutout.menu.macro_record'), act: () => SlopMacros.record() },
        { label: t('cutout.menu.macros'), act: () => SlopMacros.openPanel() }] : []),
    ];
  }
  function viewItems() {
    const has = !!cur();
    return [
      ...[['result', 'cutout.menu.view_result'], ['before', 'cutout.menu.view_before'], ['mask', 'cutout.menu.view_mask']].map(([v, l]) => ({ label: t(l), check: S.view === v, act: () => act.view(v), disabled: !has })),
      '-',
      { label: t('cutout.menu.fit'), key: keyOf('co.view-fit', '0'), act: act.fit, disabled: !has },
      { label: t('ui.zoom_in'), key: keyOf('co.zoom-in', '+'), act: () => act.zoom(1.25), disabled: !has },
      { label: t('ui.zoom_out'), key: keyOf('co.zoom-out', '-'), act: () => act.zoom(0.8), disabled: !has },
    ];
  }
  function helpItems() {
    return [{ label: t('cutout.menu.keys'), key: '', act: act.keys }];
  }
  function moreItems() {
    const now = window.SlopTheme ? SlopTheme.get() : 'dark';
    const out = [{ label: t('cutout.menu.theme'), sub: THEMES.map(([v, l, s]) => ({ label: t(l), check: now === s, act: () => act.theme(v) })) }];
    // Open in: the same items as the toolbar's Open in… (ui/openin.js, SlopOuttake), for the selection when there is one.
    const sub = S.bulk() ? CO.openIn.bulkItems() : CO.openIn.items(cur());
    out.push({ label: t('cutout.menu.open_in'), sub, disabled: !sub.length });
    if (hub() && cur() && cur().request) out.push({ label: t('cutout.menu.send_mask'), act: () => CO.send.mask(), disabled: !done() });
    // A narrow top bar hides Clear saved work (css/themes.css); the More menu runs the same button.
    const clear = $('#btnClearSaved');
    if (clear) out.push({ label: t('cutout.menu.clear_saved'), act: () => clear.click() });
    out.push('-', { label: t('cutout.menu.about'), act: act.about });
    return out;
  }

  /** Open a menu under a button. */
  function openAt(build, btn) {
    const r = btn.getBoundingClientRect();
    SlopUI.menu(build(), r.left, r.bottom + 2);
  }
  const BAR = [['menu.file', 'File', fileItems], ['menu.edit', 'Edit', editItems], ['menu.view', 'View', viewItems], ['menu.help', 'Help', helpItems]];
  function buildBar() {
    const nav = $('#menus');
    for (const [key, name, build] of BAR) {
      const b = h('button', { type: 'button', class: 'menu-b', 'aria-haspopup': 'menu', 'data-i18n': key }, t(key) === key ? name : t(key));
      b.addEventListener('click', () => openAt(build, b));
      // Once one menu is open, hovering the others switches to them (like a desktop menu bar).
      b.addEventListener('pointerenter', () => { if (document.querySelector('.sui-menu[data-level="0"]')) openAt(build, b); });
      nav.append(b);
    }
  }

  /* ---------- top-bar and empty-state buttons ---------- */
  function bindButtons() {
    const undo = $('#btnUndo'), redo = $('#btnRedo'), panel = $('#btnPanel'), more = $('#btnMore');
    U.btnIcon(undo, 'undo'); U.btnIcon(redo, 'redo');
    U.btnIcon($('#btnDownload'), 'download');
    U.btnIcon(panel, 'panel'); U.btnIcon(more, 'more');
    labels();
    undo.addEventListener('click', () => act.undo());
    redo.addEventListener('click', () => act.redo());
    $('#btnDownload').addEventListener('click', () => (CO.state.bulk() ? act.exportSel() : act.exportOne()));
    panel.addEventListener('click', () => { if (!CO.sheet.isPhone()) act.panel(); });   // on a phone it is the sheet's toggle
    more.addEventListener('click', () => openAt(moreItems, more));
    $('#emptyOpen').addEventListener('click', () => act.open());
    $('#emptySample').addEventListener('click', () => act.sample());
  }
  /** The empty view's buttons (again after a language change). */
  function labels() {
    U.btnIcon($('#emptyOpen'), 'open', t('cutout.app.choose_images'));
    U.btnIcon($('#emptySample'), 'sparkle', t('cutout.app.try_sample'));
  }
  /** Undo/redo enabled state and their tooltips follow the active image's history. */
  function sync() {
    const it = cur(), undo = $('#btnUndo'), redo = $('#btnRedo');
    undo.disabled = !H.can(it, 'undo'); redo.disabled = !H.can(it, 'redo');
    const ul = H.label(it, 'undo'), rl = H.label(it, 'redo');
    undo.title = stepLabel('undo', ul); redo.title = stepLabel('redo', rl);
  }

  function init() {
    // Phones: the settings panel is a bottom sheet (shared/ui/sheet.js: this button, ×, Escape, a tap outside, swipe down).
    CO.sheet = SlopSheet.attach({ root: $('#app'), panel: $('#props'), phone: '(max-width: 900px)', toggles: [$('#btnPanel')], label: t('cutout.app.settings') });
    // the settings panel's width: dragged on its edge and kept (shared/ui/resize-panel.js, every side panel's one implementation)
    if (window.SlopResizePanel) SlopResizePanel.attach($('#props'), { app: 'slopisolate', id: 'props', edge: 'start', width: 304, min: 260, max: 560,
      phone: '(max-width: 900px)', cssVar: '--props-w', target: $('#app'), label: t('cutout.app.settings') });
    buildBar(); bindButtons(); sync();
    U.onLang(() => { labels(); sync(); });   // the menu bar's names follow through data-i18n
    ['history', 'activeItem', 'item', 'list'].forEach((ev) => CO.on(ev, sync));
    if (U.store.get('panel', true) === false) $('#app').classList.add('no-panel');
    $('#btnPanel').setAttribute('aria-expanded', String(!CO.sheet.isPhone() && !$('#app').classList.contains('no-panel')));
  }

  CO.menus = { init, act, moreItems, stepLabel };
})();
