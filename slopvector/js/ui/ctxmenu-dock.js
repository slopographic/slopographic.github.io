/* SlopVector — ui: context menus for swatches, dock tabs and dock groups (SlopUI menus).
 * Opened by UI.menuForTarget (ctxmenu.js) from a right-click or the Menu key. */
(function () {
  'use strict';
  var SV = window.SV;
  var UI = SV.ui = SV.ui || {}; var $ = UI._p;
  function menu(items, x, y) { return window.SlopUI.menu(items, x, y); }
  /** A swatch: apply it to the fill or the stroke, or delete it. */
  UI.swatchMenu = function (i, x, y) {
    if ($.swatches()[i] === undefined) return null;
    return menu([
      { label: SV.t('vector.swatch.apply_fill'), act: function () { $.applySwatch(i, 'fill'); } },
      { label: SV.t('vector.swatch.apply_stroke'), act: function () { $.applySwatch(i, 'stroke'); } }, '-',
      { label: SV.t('vector.swatch.delete'), act: function () { $.deleteSwatch(i); } }], x, y);
  };
  /** A dock tab: show its panel, or collapse or expand its group. */
  UI.tabMenu = function (tab, x, y) {
    var gid = tab.parentNode.parentNode.id.replace(/^dg-/, ''), folded = !!UI.st.collapsed[gid];
    return menu([
      { label: SV.t('vector.ctx.show_panel', { name: tab.textContent }), act: function () { UI.showPanel(tab.getAttribute('data-tab')); } },
      { label: folded ? SV.t('vector.ctx.expand_group') : SV.t('vector.ctx.collapse_group'), act: function () { UI.setGroupCollapsed(gid, !folded); } }, '-',
      $.mi('window.togglePanels')], x, y);
  };
  /** A dock group's tab bar: collapse or expand the group, show or hide all panels. */
  UI.panelMenu = function (ge, x, y) {
    var gid = ge.id.replace(/^dg-/, ''), folded = !!UI.st.collapsed[gid];
    return menu([
      { label: folded ? SV.t('vector.ctx.expand_group') : SV.t('vector.ctx.collapse_group'), act: function () { UI.setGroupCollapsed(gid, !folded); } }, '-',
      $.mi('window.togglePanels')], x, y);
  };
})();
