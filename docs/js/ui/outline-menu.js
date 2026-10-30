/* Slop Docs — ui/outline-menu: the right-click menu of the outline. A row offers Rename, Move up and down, Promote,
 * Demote, Delete section, then Collapse all and Expand all. The panel's empty space offers Add section and the same two.
 * Items call ui/outline-actions.js; ES module, used by ui/outline.js. */
import * as M from '../model/outline.js';
import * as A from './outline-actions.js';

const S = window.SlopDocs;
const t = (k, v) => S.t(k, v);
const run = (fn) => () => { try { fn(); } catch (e) { console.error(e); } };

/** Items for the outline row of node (a tree node). bulk: { collapseAll, expandAll }. */
export function sectionItems(node, bulk) {
  const blocks = S.doc.blocks;
  const can = (dir) => !!M.moveSection(blocks, node.b, dir);
  return [
    { label: t('ui.rename_dots'), act: run(() => A.rename(node.b)) },
    '-',
    { label: t('docs.ol.move_up'), key: 'Alt+Up', disabled: !can(-1), act: run(() => A.move(node.b, -1)) },
    { label: t('docs.ol.move_down'), key: 'Alt+Down', disabled: !can(1), act: run(() => A.move(node.b, 1)) },
    '-',
    { label: t('docs.ol.promote'), disabled: node.level <= 1, act: run(() => A.level(node.b, -1)) },
    { label: t('docs.ol.demote'), disabled: node.level >= M.OUT_MAX, act: run(() => A.level(node.b, 1)) },
    '-',
    { label: t('docs.ol.delete'), act: run(() => A.remove(node.b)) },
    '-',
    { label: t('docs.ol.collapse_all'), act: run(bulk.collapseAll) },
    { label: t('docs.ol.expand_all'), act: run(bulk.expandAll) },
  ];
}

/** Items for the panel's empty space. */
export function panelItems(bulk) {
  return [
    { label: t('docs.ol.add'), act: run(() => A.add()) },
    '-',
    { label: t('docs.ol.collapse_all'), act: run(bulk.collapseAll) },
    { label: t('docs.ol.expand_all'), act: run(bulk.expandAll) },
  ];
}
