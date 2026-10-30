/* SlopCut: the menu bar (File, Edit, Clip, Sequence, View, Help), built from commands, plus the
   About dialog. Every item runs a command so shortcuts shown here always match the keymap. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, C = SE.cmd, A = SE.app;
  const h = U.h;
  const it = (id, label) => C.item(id, label);
  const has = (id) => C.get(id) && (!C.get(id).when || C.get(id).when());

  function sendSub() {
    if (!window.SlopHub || SE.offline) return null;
    return { label: U.t('slopedit.menu.send_frame_to'), sub: [it('file.snapshotSend', U.t('slopedit.menu.photoslop_current_frame'))] };
  }
  const MENUS = {
    File: () => [
      it('file.import'), it('file.drive'), '-',
      it('file.new'), it('file.open'), it('file.save'), it('file.saveDrive'), it('file.download'), '-',
      it('file.export'), it('file.gif'), it('file.snapshot'), sendSub(), '-',
      it('file.sample'), it('file.offline'), { label: U.t('slopedit.menu.config'), sub: SE.config ? SE.config.menu() : [] }, '-',
      { label: U.t('slopedit.menu.autosave_project_in_this_browser'), check: U.store.get('autosave', true), act: () => { const v = !U.store.get('autosave', true); U.store.set('autosave', v); if (!v) U.idb.del('project').catch(() => null); SlopUI.toast(v ? U.t('slopedit.menu.autosave_on_stored_only_in') : U.t('slopedit.menu.autosave_off_saved_project_deleted')); } }
    ],
    Edit: () => [
      it('edit.undo', SE.history.canUndo() ? U.t('ui.undo_what', { what: SE.history.undoLabel() }) : U.t('slopedit.cmd.undo')),
      it('edit.redo', SE.history.canRedo() ? U.t('ui.redo_what', { what: SE.history.redoLabel() }) : U.t('slopedit.cmd.redo')), '-',
      it('edit.cut'), it('edit.copy'), it('edit.paste'), it('edit.duplicate'), '-',
      it('edit.delete'), it('edit.rippleDelete'), it('edit.split'), it('edit.splitAll'), it('edit.trimIn'), it('edit.trimOut'), '-',
      it('edit.selectAll'), it('edit.deselect'), it('edit.link')
    ],
    Clip: () => [
      { label: U.t('slopedit.menu.apply_template'), sub: SE.templates.list.map((t) => it('tpl.apply.' + t.id, t.name)) },
      { label: U.t('slopedit.menu.add_transition'), sub: SE.model.TRANSITIONS.map(([t, l]) => it('tr.' + t, U.w('tr', t, l))).concat(['-', it('tr.remove')]) },
      it('clip.fadeIn'), it('clip.fadeOut'), it('clip.speed'), it('clip.volKey'), '-',
      { label: U.t('slopedit.menu.mask'), sub: SE.maskMenu() }, '-',
      it('edit.nudgeL'), it('edit.nudgeR'), it('clip.reset')
    ],
    Sequence: () => [
      it('tpl.panel'), it('tpl.random'), it('tpl.reshuffle'), it('tpl.clear'), '-',
      it('tl.title'), it('tl.color'), it('tl.marker'), '-',
      it('tl.vtrack'), it('tl.atrack'), '-',
      it('play.markIn'), it('play.markOut'), it('play.clearInOut'), it('play.loop'), '-',
      it('tl.zoomIn'), it('tl.zoomOut'), it('tl.fit'), '-',
      it('tl.settings')
    ],
    View: () => [
      it('tool.select'), it('tool.razor'), it('tool.ripple'), it('tool.snap'), '-',
      it('view.safe'), it('view.quality'), '-',
      { label: U.t('slopedit.menu.theme'), sub: A.THEMES.map(([t, k]) => it('view.theme.' + t, U.t(k))) }
    ],
    Layout: () => (window.SlopLayouts ? SlopLayouts.menu('slopcut') : []),
    Help: () => [
      it('help.search'), it('help.keys'), it('help.about'),
      { label: U.t('slopedit.menu.ai_agents'), act: () => window.SlopAgents && SlopAgents.about(), disabled: !window.SlopAgents }, '-',
      { label: U.t('slopedit.menu.slopographic_home'), act: () => { location.href = SE.offline ? 'https://slopographic.com/' : '../'; } }
    ]
  };
  /** The menu names: the shared words (strings.js, ui.*) or the app's own; data-i18n keeps them in the chosen language. */
  const MKEY = { File: 'menu.file', Edit: 'menu.edit', Clip: 'slopedit.cmd.clip', Sequence: 'slopedit.cmd.sequence', View: 'menu.view', Layout: 'slopedit.rnd.layout', Help: 'menu.help' };
  SE.menus = { MENUS };
  SE.menus.build = function () {
    const bar = A.els.menus;
    for (const name of Object.keys(MENUS)) {
      const b = h('button', { type: 'button', class: 'menu-b', 'aria-haspopup': 'menu', dataset: { i18n: MKEY[name] } }, U.t(MKEY[name]));
      b.addEventListener('click', (e) => { e.stopPropagation(); const r = b.getBoundingClientRect(); SlopUI.menu(MENUS[name](), r.left, r.bottom + 2); });
      bar.append(b);
    }
    A.els.btnMore.addEventListener('click', (e) => {
      e.stopPropagation(); const r = A.els.btnMore.getBoundingClientRect();
      SlopUI.menu(Object.keys(MENUS).map((n) => ({ label: U.t(MKEY[n]), sub: MENUS[n]() })), r.right - 220, r.bottom + 4);
    });
    A.els.btnUndo.addEventListener('click', () => C.run('edit.undo'));
    A.els.btnRedo.addEventListener('click', () => C.run('edit.redo'));
    A.els.btnSearch.addEventListener('click', () => C.palette());
    A.els.btnExport.addEventListener('click', () => (has('file.export') ? C.run('file.export') : SlopUI.toast(U.t('slopedit.menu.add_some_clips_to_the'))));
    const sync = () => {
      A.els.btnUndo.disabled = !SE.history.canUndo(); A.els.btnRedo.disabled = !SE.history.canRedo();
      A.els.btnUndo.title = U.t('ui.undo_what', { what: SE.history.undoLabel() }) + ' (' + C.keyFor('edit.undo') + ')';
      A.els.btnRedo.title = U.t('ui.redo_what', { what: SE.history.redoLabel() }) + ' (' + C.keyFor('edit.redo') + ')';
      A.els.btnSearch.title = U.t('slopedit.fb.search_commands') + ' (' + (C.usingShared() ? (SlopCmd.keyFor && SlopCmd.keyFor('cmd.palette')) || 'Ctrl+K' : C.keyFor('help.search')) + ')';
    };
    SE.on('change', sync); SE.on('keys', sync); sync();
  };
  SE.act.about = function () {
    const caps = SE.caps || {};
    SlopUI.dialog({ title: U.t('slopedit.menu.about_slopcut'), body: h('div', null,
      h('p', { class: 'sui-p' }, U.t('slopedit.menu.slopcut_is_a_free_video')),
      h('p', { class: 'sui-p' }, U.t('slopedit.menu.export_uses_webcodecs_hardware_video')),
      h('p', { class: 'sui-p' }, U.t('slopedit.menu.this_browser', { caps: caps.summary || U.t('slopedit.menu.checking') })),
      h('p', { class: 'sui-p' }, U.t('slopedit.menu.autosave_keeps_your_project_and'))),
    buttons: [{ label: U.t('slopedit.menu.nice'), primary: true }] });
  };
})();
