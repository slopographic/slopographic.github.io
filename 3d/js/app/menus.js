/* Slop 3D context menus (right-click on an object or on empty viewport). Each item runs a registered SlopCmd
 * command, so the menu, the shortcut hints and the palette share one code path. Sets window.Slop3D.menus. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, st = S.state, s = st.s;
  const t = S.t;
  const ADD = [['cube', '3d.menu.cube'], ['sphere', '3d.menu.sphere'], ['cylinder', '3d.menu.cylinder'], ['cone', '3d.menu.cone'], ['torus', '3d.menu.torus'], ['plane', '3d.menu.plane'], ['blob', '3d.menu.blob'], '-',
    ['group', '3d.menu.group'], '-', ['directional', '3d.menu.directional'], ['ambient', '3d.menu.ambient']];

  /** A SlopUI menu item for a command id (label and shortcut come from SlopCmd / SlopCtx). */
  function cmd(id, label, extra = {}) {
    const key = window.SlopCtx ? SlopCtx.keyFor(id) : '';
    return Object.assign({ label, key, act: () => { if (window.SlopCmd) SlopCmd.run(id); } }, extra);
  }
  function addItems() {
    return ADD.map((x) => (x === '-' ? '-' : cmd(`3d.add.${x[0]}`, t(x[1]))));
  }
  function viewItems() {
    return [cmd('3d.view.perspective', t('3d.menu.perspective')), cmd('3d.view.front', t('3d.menu.front')), cmd('3d.view.top', t('3d.menu.top')), cmd('3d.view.side', t('3d.menu.side'))];
  }
  function objectItems() {
    if (S.edit && S.edit.active()) return S.editcommands.menuItems();
    const p = st.primary(), n = p && s.doc.nodes[p];
    return [
      cmd('3d.edit.duplicate', t('3d.cmd.duplicate')),
      cmd('3d.edit.delete', t('3d.cmd.delete')),
      '-',
      cmd('3d.edit.group', t('3d.cmd.group'), { disabled: !s.sel.length }),
      cmd('3d.edit.ungroup', t('3d.cmd.ungroup'), { disabled: !(n && n.type === 'group') }),
      '-',
      cmd('3d.view.frame', t('3d.cmd.frame')),
      cmd('3d.object.hide', n && n.visible ? t('3d.menu.hide') : t('3d.menu.show')),
      cmd('3d.object.rename', t('3d.cmd.rename')),
      '-',
      { label: t('3d.menu.add'), sub: addItems() },
    ];
  }
  function viewportItems() {
    if (S.edit && S.edit.active()) return S.editcommands.menuItems();
    return [
      { label: t('3d.menu.add'), sub: addItems() },
      '-',
      cmd('3d.edit.selectall', t('3d.menu.select_all')),
      cmd('3d.view.frameAll', t('3d.cmd.frame_all')),
      { label: t('3d.menu.view'), sub: viewItems() },
      { label: t('3d.menu.layout'), sub: window.SlopLayouts ? SlopLayouts.menu('3d') : [] },
      '-',
      cmd('3d.view.wire', t('3d.cmd.wire'), { check: s.view.wire }),
      cmd('3d.view.grid', t('3d.cmd.grid'), { check: s.view.grid }),
      cmd('3d.view.axes', t('3d.cmd.axes'), { check: s.view.axes }),
      '-',
      cmd('3d.edit.undo', t('ui.undo'), { disabled: !s.history.canUndo() }),
      cmd('3d.edit.redo', t('ui.redo'), { disabled: !s.history.canRedo() }),
    ];
  }

  S.menus = { objectItems, viewportItems, addItems, cmd };
})();
