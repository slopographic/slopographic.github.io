/* Slop 3D commands: every menu item, toolbar button and shortcut is a SlopCmd command with the id 3d.<group>.<name>.
 * Shortcuts: F frame, 1-4 views, W wireframe, G grid, H hide, Delete, Mod+D duplicate, Mod+G group, arrows nudge
 * (Shift+Up/Down for Y). Nudging is off while the outliner has focus, so its arrow keys move the tree.
 * Sets window.Slop3D.commands: register(ui) → the command list. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const A = S.actions, st = S.state, s = st.s, F = S.files;
  const t = S.t;
  // titles are keys (3d/i18n/<code>/commands.js), read when the list is built: main.js builds it again on a language change
  const ADD = [['cube', '3d.cmd.add_cube'], ['sphere', '3d.cmd.add_sphere'], ['cylinder', '3d.cmd.add_cylinder'], ['cone', '3d.cmd.add_cone'], ['torus', '3d.cmd.add_torus'],
    ['plane', '3d.cmd.add_plane'], ['blob', '3d.cmd.add_blob'], ['group', '3d.cmd.add_group'], ['directional', '3d.cmd.add_directional'], ['ambient', '3d.cmd.add_ambient']];
  const VIEWS = [['front', '1', '3d.cmd.view_front'], ['top', '2', '3d.cmd.view_top'], ['side', '3', '3d.cmd.view_side'], ['perspective', '4', '3d.cmd.view_perspective']];
  const G = { File: '3d.cmd.group_file', Edit: '3d.cmd.group_edit', Object: '3d.cmd.group_object', View: '3d.cmd.group_view', Add: '3d.cmd.group_add',
    Nudge: '3d.cmd.group_nudge', Transform: '3d.cmd.group_transform', Mesh: '3d.cmd.group_mesh', Config: '3d.cmd.group_config' };
  const nudgeOk = () => { const a = document.activeElement; return !(a && a.closest && a.closest('.outl-list')); };
  /** Object-mode keys only work outside mesh edit mode (their keys are reused there). */
  const solid = () => !S.edit.active();
  const C = (id, title, group, keys, run, extra = {}) => Object.assign({ id, title, group: G[group] ? t(G[group]) : group, keys, run, noRecent: false }, extra);

  function openMenu(anchor, items) {
    if (!window.SlopUI || !anchor) return;
    const r = anchor.getBoundingClientRect();
    SlopUI.menu(items, r.left, r.bottom + 4);
  }
  function selectAll() { st.select(Object.keys(s.doc.nodes)); }

  /** ui: { applyView(), rename(id), frame(ids), setView(name), stage } */
  function list(ui) {
    const out = [
      C('3d.file.new', t('3d.cmd.new'), 'File', ['Mod+Shift+N'], () => F.newScene()),
      C('3d.file.open', t('3d.cmd.open'), 'File', ['Mod+O'], () => F.openDialog()),
      C('3d.file.import', t('3d.cmd.import'), 'File', ['Mod+I'], () => F.importDialog()),
      C('3d.file.drive', t('3d.cmd.drive'), 'File', [], () => F.openFromDrive()),
      C('3d.file.save', t('3d.cmd.save'), 'File', ['Mod+S'], () => F.save()),
      C('3d.file.download', t('3d.cmd.download'), 'File', ['Mod+Shift+S'], () => F.downloadScene()),
      C('3d.file.exportObj', t('3d.cmd.export_fmt', { format: 'OBJ' }), 'File', [], () => F.exportObj()),
      ...[['Stl', 'STL'], ['Ply', 'PLY'], ['Glb', 'GLB'], ['Gltf', 'glTF'], ['Usdz', 'USDZ']].map(([k, label]) => C(`3d.file.export${k}`, t('3d.cmd.export_fmt', { format: label }), 'File', [], () => F.exportModel(k.toLowerCase()))),
      C('3d.file.png1', t('3d.cmd.png1'), 'File', [], () => F.exportPng(1)),
      C('3d.file.png2', t('3d.cmd.png2'), 'File', [], () => F.exportPng(2)),
      C('3d.edit.undo', t('ui.undo'), 'Edit', ['Mod+Z'], () => A.undo()),
      C('3d.edit.redo', t('ui.redo'), 'Edit', ['Mod+Shift+Z', 'Mod+Y'], () => A.redo()),
      C('3d.edit.duplicate', t('3d.cmd.duplicate'), 'Edit', ['Mod+D'], () => A.duplicate(), { when: solid }),
      C('3d.edit.delete', t('3d.cmd.delete'), 'Edit', ['Delete', 'Backspace'], () => A.remove(), { when: () => nudgeOk() && solid() }),
      C('3d.edit.group', t('3d.cmd.group'), 'Edit', ['Mod+G'], () => A.group(), { when: solid }),
      C('3d.edit.ungroup', t('3d.cmd.ungroup'), 'Edit', ['Mod+Shift+G'], () => A.ungroup(), { when: solid }),
      C('3d.edit.selectall', t('3d.cmd.select_all'), 'Edit', ['Mod+A'], () => selectAll(), { when: solid }),
      C('3d.edit.deselect', t('3d.cmd.deselect'), 'Edit', ['Escape'], () => st.select([]), { when: () => s.sel.length > 0 && solid() }),
      C('3d.object.rename', t('3d.cmd.rename'), 'Object', ['F2'], () => ui.rename(st.primary()), { when: () => !!st.primary() }),
      C('3d.object.hide', t('3d.cmd.hide_show'), 'Object', ['H'], () => A.setVisible(s.sel, !(s.doc.nodes[st.primary()] || { visible: true }).visible), { when: () => s.sel.length > 0 && solid() }),
      C('3d.view.frame', t('3d.cmd.frame'), 'View', ['F'], () => ui.frame(s.sel), { when: solid }),
      C('3d.view.frameAll', t('3d.cmd.frame_all'), 'View', ['Home'], () => ui.frame([])),
      C('3d.view.wire', t('3d.cmd.wire'), 'View', ['W'], () => { s.view.wire = !s.view.wire; ui.applyView(); }, { when: solid }),
      C('3d.view.grid', t('3d.cmd.grid'), 'View', ['G'], () => { s.view.grid = !s.view.grid; ui.applyView(); }, { when: solid }),
      C('3d.view.axes', t('3d.cmd.axes'), 'View', [], () => { s.view.axes = !s.view.axes; ui.applyView(); }),
      C('3d.menu.add', t('3d.cmd.menu_add'), 'Object', [], (ctx) => openMenu(document.getElementById('btnAdd'), S.menus.addItems()), { hidden: true }),
      C('3d.menu.open', t('3d.cmd.menu_open'), 'File', [], () => openMenu(document.getElementById('btnOpen'), [
        S.menus.cmd('3d.file.open', t('3d.menu.from_disk')), S.menus.cmd('3d.file.drive', t('3d.menu.from_drive')), '-',
        S.menus.cmd('3d.file.import', t('3d.menu.import_scene')), S.menus.cmd('3d.file.importConfig', t('3d.cmd.import_config')), '-',
        S.menus.cmd('3d.config.template', t('3d.menu.template')), S.menus.cmd('3d.config.ai', t('3d.menu.ask_ai'))]), { hidden: true }),
      C('3d.menu.export', t('3d.cmd.menu_export'), 'File', [], () => openMenu(document.getElementById('btnExport'), [
        S.menus.cmd('3d.file.download', t('3d.cmd.download')), '-',
        ...[['Obj', 'OBJ'], ['Stl', 'STL'], ['Ply', 'PLY'], ['Glb', 'GLB'], ['Gltf', 'glTF'], ['Usdz', 'USDZ']].map(([k, f]) => S.menus.cmd(`3d.file.export${k}`, t('3d.cmd.export_fmt', { format: f }))), '-',
        S.menus.cmd('3d.file.png1', t('3d.cmd.png1')), S.menus.cmd('3d.file.png2', t('3d.cmd.png2')), '-',
        S.menus.cmd('3d.file.exportConfig', t('3d.cmd.export_config'))]), { hidden: true }),
    ];
    for (const [k, title] of ADD) out.push(C(`3d.add.${k}`, t(title), 'Add', [], () => A.add(k)));
    out.push(...S.editcommands.list(), ...S.configio.commands(C));
    for (const [name, key, title] of VIEWS) out.push(C(`3d.view.${name}`, t(title), 'View', [key], () => ui.setView(name), key === '4' ? {} : { when: solid }));
    const nudge = (id, title, axis, sign, keys) => C(id, t(title), 'Nudge', keys, () => A.nudge(axis, sign), { when: () => nudgeOk() && solid(), repeat: true });
    out.push(nudge('3d.nudge.left', '3d.cmd.nudge_left', 0, -1, ['ArrowLeft']), nudge('3d.nudge.right', '3d.cmd.nudge_right', 0, 1, ['ArrowRight']),
      nudge('3d.nudge.back', '3d.cmd.nudge_back', 2, -1, ['ArrowUp']), nudge('3d.nudge.front', '3d.cmd.nudge_front', 2, 1, ['ArrowDown']),
      nudge('3d.nudge.up', '3d.cmd.nudge_up', 1, 1, ['Shift+ArrowUp']), nudge('3d.nudge.down', '3d.cmd.nudge_down', 1, -1, ['Shift+ArrowDown']));
    return out;
  }

  S.commands = { list, openMenu, C };
})();
