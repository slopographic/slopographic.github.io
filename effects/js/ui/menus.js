// Slop Effects menus and the top bar: undo and redo, the project name, File (Slop Drive, config, render), Composition
// (size with social presets, frame rate, duration, background) and Layer (add by type, import media). Built on SlopUI's
// menu and dialog. Classic script: window.SlopEffects.menus.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h, numberOf } = ns.dom;
  const D = () => ns.defs, t = (k, v) => ns.defs.t(k, v);
  const UI = () => g.SlopUI;

  /** Opens the render dialog for the document. */
  const openRender = (S, act) => ns.renderDialog.open(S, act.toast);

  /** Opens a SlopUI menu under an element. items as SlopUI.menu takes them. */
  function openMenu(anchor, items) {
    const r = anchor.getBoundingClientRect();
    UI().menu(items, r.left, r.bottom + 4);
  }

  /** The Composition dialog: size preset, width and height, frame rate, duration and background. */
  function compDialog(S, act) {
    const c = S.doc.comp;
    const preset = D().SIZES.find((s) => s.w === c.width && s.h === c.height) || D().SIZES.find((s) => s.id === 'custom');
    const size = h('select', { class: 'sui-input', 'aria-label': t('effects.menu.size_preset') }, D().SIZES.map((s) => h('option', { value: s.id, selected: s.id === preset.id ? true : null }, D().word('size', s.id, s.name))));
    const w = h('input', { class: 'sui-input', type: 'number', min: 16, max: 7680, step: 2, value: c.width, 'aria-label': t('effects.props.width') });
    const hh = h('input', { class: 'sui-input', type: 'number', min: 16, max: 4320, step: 2, value: c.height, 'aria-label': t('effects.props.height') });
    const fps = h('select', { class: 'sui-input', 'aria-label': t('effects.menu.fps') }, D().FPS.map((f) => h('option', { value: f, selected: f === c.fps ? true : null }, `${f} fps`)));
    const dur = h('input', { class: 'sui-input', type: 'number', min: D().LIMIT.minDur, max: D().LIMIT.maxDur, step: 0.1, value: c.duration, 'aria-label': t('effects.menu.duration_s') });
    const bgHex = /^#[0-9a-f]{6}$/i.test(c.background) ? c.background : '#000000';
    const bg = h('input', { class: 'sui-input', type: 'color', value: bgHex, 'aria-label': t('effects.menu.bg_colour'), style: 'height:32px;padding:2px' });
    const clear = h('input', { type: 'checkbox', checked: c.background === 'transparent' ? true : null, 'aria-label': t('effects.menu.bg_clear') });
    size.addEventListener('change', () => {
      const p = D().SIZES.find((s) => s.id === size.value);
      if (p && p.id !== 'custom') { w.value = p.w; hh.value = p.h; }
    });
    const form = h('div', { class: 'fx-group' },
      h('div', { class: 'fx-row' }, h('label', null, t('effects.menu.format')), size, h('span')),
      h('div', { class: 'fx-row' }, h('label', null, t('effects.props.size')), h('div', { class: 'fx-pair' }, w, hh), h('span', null, 'px')),
      h('div', { class: 'fx-row' }, h('label', null, t('effects.menu.fps')), fps, h('span')),
      h('div', { class: 'fx-row' }, h('label', null, t('effects.menu.duration')), dur, h('span', null, 's')),
      h('div', { class: 'fx-row' }, h('label', null, t('effects.menu.bg')), h('div', { class: 'fx-pair' }, bg, h('label', { class: 'sui-check' }, clear, h('span', null, t('effects.menu.transparent')))), h('span')),
      h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.menu.comp_note')));
    UI().dialog({
      title: t('effects.app.comp'), body: form,
      buttons: [{ label: t('menu.cancel') }, {
        label: t('ui.apply'), primary: true,
        act: () => {
          const W = numberOf(w), H = numberOf(hh), F = Number(fps.value), Dn = numberOf(dur);
          if (W === null || H === null || Dn === null) { act.toast(t('effects.menu.need_numbers')); return false; }
          act.setComp({ width: W, height: H, fps: F, duration: Dn, background: clear.checked ? 'transparent' : bg.value });
        },
      }],
    });
  }

  /** Shows a dialog with a text field, and calls done(value) with the trimmed value when it is applied. */
  const askText = (title, label, value, done) => UI().prompt(title, label, value).then((v) => { if (v !== null && v.trim()) done(v.trim()); });

  /** The File menu items. io: the file actions. */
  function fileItems(S, act, io) {
    const cfg = g.SlopConfigDialog && g.SlopConfigDialog.menuItems ? g.SlopConfigDialog.menuItems({ app: 'effects' }) : [];
    return [
      { label: t('effects.menu.new'), act: () => io.newProject() },
      '-',
      { label: t('effects.menu.open_drive'), act: () => io.openDrive() },
      { label: t('effects.menu.save_drive'), act: () => io.saveDrive() },
      '-',
      ...cfg,
      '-',
      { label: t('effects.app.render'), key: 'Mod+E', act: () => openRender(S, act) },
    ];
  }

  /** The Layer menu items: add by type, import media. */
  function layerItems(S, act, io) {
    return [
      { label: D().word('type', 'solid', 'Solid'), act: () => act.addLayer('solid') }, // i18n-ignore: English fallback of the effects.def.* words
      { label: D().word('type', 'shape', 'Shape'), sub: D().SHAPES.map(([v, l]) => ({ label: D().word('shape', v, l), act: () => act.addLayer('shape', { shape: v }) })) }, // i18n-ignore: English fallback of the effects.def.* words
      { label: D().word('type', 'text', 'Text'), act: () => act.addLayer('text', { size: 120 }) }, // i18n-ignore: English fallback of the effects.def.* words
      { label: t('effects.menu.null_layer'), act: () => act.addLayer('null') },
      '-',
      { label: t('effects.menu.media_computer'), act: () => io.importFromComputer() },
      { label: t('effects.menu.media_drive'), act: () => io.importFromDrive() },
    ];
  }

  /** Mounts the top bar. Returns { refresh }. */
  function mount(S, act, io) {
    const undo = document.getElementById('fx-undo'), redo = document.getElementById('fx-redo');
    const name = document.getElementById('fx-name');
    undo.addEventListener('click', () => S.undo());
    redo.addEventListener('click', () => S.redo());
    name.addEventListener('change', () => act.renameProject(name.value));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    document.getElementById('fx-file').addEventListener('click', (e) => openMenu(e.currentTarget, fileItems(S, act, io)));
    document.getElementById('fx-layer').addEventListener('click', (e) => openMenu(e.currentTarget, layerItems(S, act, io)));
    document.getElementById('fx-comp').addEventListener('click', () => compDialog(S, act));
    document.getElementById('fx-render').addEventListener('click', () => openRender(S, act));
    document.getElementById('fx-search').addEventListener('click', () => g.SlopCmd && g.SlopCmd.open && g.SlopCmd.open(''));

    /** Keeps the buttons and the name in step with the document. */
    function refresh() {
      undo.disabled = !S.canUndo();
      redo.disabled = !S.canRedo();
      undo.title = S.canUndo() ? (S.lastLabel ? t('ui.undo_what', { what: S.lastLabel }) : t('ui.undo')) : t('effects.menu.nothing_undo');
      if (document.activeElement !== name) name.value = S.doc.name;
      document.title = `${S.doc.name} — Slop Effects`;
    }
    S.on((what) => { if (what === 'doc' || what === 'view') refresh(); });
    refresh();
    return { refresh };
  }

  ns.menus = { mount, compDialog, askText, fileItems, layerItems };
})(typeof window !== 'undefined' ? window : globalThis);
