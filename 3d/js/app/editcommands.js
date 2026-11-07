/* Slop 3D mesh edit commands: mode keys (1 vertex, 2 edge, 3 face), selection (A all, I invert, Alt+A or Escape none),
 * transforms (G move, R rotate, S scale, E extrude), mesh tools (X delete, W subdivide, M merge, Shift+F flip, F fill,
 * H hide, Alt+H show) and the Mesh menu. Tab toggles edit mode. The `when` guards keep the object-mode keys (1-3 views,
 * F frame, G grid, H hide object, Delete) apart from these. Sets window.Slop3D.editcommands. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const E = S.edit, MM = S.editmodal, SEL = S.meshsel;
  const editing = () => E.active() && !MM.active();
  const C = (...a) => S.commands.C(...a), t = S.t;

  /** Selected edges (converted from faces or vertices when needed) grown into their loops. */
  function loopOfSelection() {
    const m = E.mesh();
    E.loopSelect([...SEL.convert(m, E.sel(), 'edge').ids]);
  }
  /** The Mesh menu (also used by the right-click menu in edit mode). */
  function menuItems() {
    const c = (id, label) => S.menus.cmd(id, label);
    return [
      c('3d.mesh.vertex', t('3d.cmd.vertex_mode')), c('3d.mesh.edge', t('3d.cmd.edge_mode')), c('3d.mesh.face', t('3d.cmd.face_mode')), '-',
      c('3d.mesh.all', t('3d.menu.select_all')), c('3d.mesh.invert', t('3d.cmd.mesh_invert')), c('3d.mesh.none', t('3d.menu.deselect_all')), '-',
      c('3d.mesh.move', t('3d.menu.move')), c('3d.mesh.rotate', t('3d.menu.rotate')), c('3d.mesh.scale', t('3d.menu.scale')), c('3d.mesh.extrude', t('3d.cmd.mesh_extrude')), '-',
      c('3d.mesh.delete', t('3d.cmd.delete')), c('3d.mesh.subdivide', t('3d.cmd.mesh_subdivide')), c('3d.mesh.merge', t('3d.cmd.mesh_merge')),
      c('3d.mesh.mergeDist', t('3d.cmd.mesh_merge_dist')), c('3d.mesh.flip', t('3d.cmd.mesh_flip')), c('3d.mesh.fill', t('3d.menu.fill')), c('3d.mesh.loop', t('3d.menu.select_loop')), '-',
      c('3d.mesh.hide', t('3d.cmd.mesh_hide')), c('3d.mesh.reveal', t('3d.cmd.mesh_reveal')), '-',
      c('3d.edit.toggle', t('3d.menu.exit_edit')),
    ];
  }
  function list() {
    const mode = (id, m, title, key) => C(id, t(title), 'Edit', [key], () => E.setMode(m), { when: editing });
    return [
      C('3d.edit.toggle', t('3d.cmd.edit_toggle'), 'Edit', ['Tab'], () => E.toggle()),
      mode('3d.mesh.vertex', 'vertex', '3d.cmd.vertex_mode', '1'),
      mode('3d.mesh.edge', 'edge', '3d.cmd.edge_mode', '2'),
      mode('3d.mesh.face', 'face', '3d.cmd.face_mode', '3'),
      C('3d.mesh.all', t('3d.cmd.mesh_all'), 'Edit', ['A'], () => E.selectAll(), { when: editing }),
      C('3d.mesh.invert', t('3d.cmd.mesh_invert'), 'Edit', ['I'], () => E.invert(), { when: editing }),
      C('3d.mesh.none', t('3d.cmd.mesh_none'), 'Edit', ['Alt+A', 'Escape'], () => E.clear(), { when: editing }),
      C('3d.mesh.move', t('3d.cmd.mesh_move'), 'Transform', ['G'], () => MM.start('move'), { when: editing }),
      C('3d.mesh.rotate', t('3d.cmd.mesh_rotate'), 'Transform', ['R'], () => MM.start('rotate'), { when: editing }),
      C('3d.mesh.scale', t('3d.cmd.mesh_scale'), 'Transform', ['S'], () => MM.start('scale'), { when: editing }),
      C('3d.mesh.extrude', t('3d.cmd.mesh_extrude'), 'Mesh', ['E'], () => MM.start('extrude'), { when: editing }),
      C('3d.mesh.delete', t('3d.cmd.mesh_delete'), 'Mesh', ['X', 'Delete'], () => E.remove(), { when: editing }),
      C('3d.mesh.subdivide', t('3d.cmd.mesh_subdivide'), 'Mesh', ['W'], () => E.subdivide(), { when: editing }),
      C('3d.mesh.merge', t('3d.cmd.mesh_merge'), 'Mesh', ['M'], () => E.mergeCentre(), { when: editing }),
      C('3d.mesh.mergeDist', t('3d.cmd.mesh_merge_dist'), 'Mesh', [], () => E.mergeByDistance(), { when: editing }),
      C('3d.mesh.flip', t('3d.cmd.mesh_flip'), 'Mesh', ['Shift+F'], () => E.flip(), { when: editing }),
      C('3d.mesh.fill', t('3d.cmd.mesh_fill'), 'Mesh', ['F'], () => E.fill(), { when: editing }),
      C('3d.mesh.loop', t('3d.cmd.mesh_loop'), 'Mesh', [], loopOfSelection, { when: () => editing() && E.hasSel() }),
      C('3d.mesh.hide', t('3d.cmd.mesh_hide'), 'Mesh', ['H'], () => E.hide(), { when: editing }),
      C('3d.mesh.reveal', t('3d.cmd.mesh_reveal'), 'Mesh', ['Alt+H'], () => E.reveal(), { when: editing }),
      C('3d.menu.mesh', t('3d.cmd.menu_mesh'), 'Mesh', [], () => S.commands.openMenu(document.getElementById('btnMesh'), menuItems()), { hidden: true, when: editing }),
    ];
  }

  S.editcommands = { list, menuItems, editing };
})();
