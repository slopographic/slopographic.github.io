/* Slop Press — ui/context: right-click and keyboard (Menu key / Shift+F10) menus on the canvas.
 * Kinds: text (in-story editing), textFrame, imageFrame, graphic (rectangle, ellipse, line, polygon),
 * selection (several items), page (nothing selected). Items are command ids run through the menu
 * bar's builder (UI.toItems), so labels, shortcuts and checks match the menu bar. Items that do not
 * apply (disabled commands, empty submenus) are left out. Panels (pages, layers, styles, swatches,
 * masters) keep their own menus; submenu labels are keys (UI.toItems reads them); the Menu key reaches them through a synthetic contextmenu event. */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state, UI = PR.ui = PR.ui || {};
  var CANVAS = 'view', PANEL_TARGETS = '.pthumb, .lrow, .srow, .mchip, .sw';
  var COMMON = ['edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-'];
  var ARRANGE = { label: 'press.menu.arrange', items: ['arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back'] };
  var WRAP = { label: 'press.menu.text_wrap', items: ['wrap.none', 'wrap.box', 'wrap.contour', 'wrap.jump'] };
  var FIT = { label: 'press.menu.fitting', items: ['object.fitFill', 'object.fitFit', 'object.fitCenter', 'object.fitStretch'] };
  var KINDS = {
    text: ['edit.cut', 'edit.copy', 'edit.paste', '-', { label: 'press.menu.para_style', dyn: 'para' }, { label: 'press.menu.char_style', dyn: 'char' },
      { label: 'press.menu.special_char', items: ['type.pageNumber', 'type.emDash', 'type.enDash', 'type.nbsp', 'type.softHyphen', 'type.lineBreak'] }, '-', 'type.placeholder'],
    textFrame: COMMON.concat([ARRANGE, WRAP, '-', 'object.textFrameOptions', 'object.breakThread', '-', 'object.lock']),
    imageFrame: COMMON.concat([ARRANGE, WRAP, FIT, 'object.placeImage', '-', 'object.lock']),
    graphic: COMMON.concat([ARRANGE, WRAP, 'object.rotate90', '-', 'object.lock']),
    selection: COMMON.concat([ARRANGE, WRAP, FIT, '-', 'object.textFrameOptions', 'object.placeImage', 'type.placeholder', 'object.lock']),
    page: ['edit.paste', 'edit.selectAll', '-', 'layout.addPage', 'layout.marginsColumns', 'layout.createGuides', '-', 'view.fitPage', 'view.preview']
  };

  /** Drops disabled items, empty submenus and stray or doubled separators. */
  function tidy(items) {
    var out = [];
    items.forEach(function (it) {
      if (!it) return;
      if (it === '-') { if (out.length && out[out.length - 1] !== '-') out.push('-'); return; }
      if (it.disabled) return;
      if (it.sub) { it = Object.assign({}, it, { sub: tidy(it.sub) }); if (!it.sub.length) return; }
      out.push(it);
    });
    while (out.length && out[out.length - 1] === '-') out.pop();
    return out;
  }
  /** The kind for the current state: editing text, nothing, one item by type, or several items. */
  function kindNow() {
    if (S.text) return 'text';
    var sel = PR.selected();
    if (!sel.length) return 'page';
    if (sel.length > 1) return 'selection';
    var t = sel[0].type;
    return t === 'text' ? 'textFrame' : t === 'image' ? 'imageFrame' : 'graphic';
  }
  function openKind(kind, x, y) {
    var items = tidy(UI.toItems(KINDS[kind]));
    if (items.length) window.SlopUI.menu(items, x, y);
  }

  /** Right-click on the canvas: select the item under the pointer (unless editing text), then open its menu. */
  UI.contextMenu = function (w, e) {
    var hit = PR.tools.hit(w.x, w.y);
    if (hit && S.sel.indexOf(hit.it.id) < 0 && !S.text) PR.select([hit.it.id]);
    openKind(kindNow(), e.clientX, e.clientY);
  };

  /* keyboard: the Menu key or Shift+F10. Panel rows open their own menus; the canvas (or text editing) opens its kind. */
  document.addEventListener('keydown', function (e) {
    if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) || document.querySelector('.sui-menu')) return;
    var t = e.target, field = t.closest && t.closest('input, select, textarea, [contenteditable="true"]');
    if (field && field.id !== 'textInput') return;
    var panel = t.closest && t.closest(PANEL_TARGETS);
    if (panel) {
      e.preventDefault();
      var pr = panel.getBoundingClientRect();
      panel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: pr.left + 8, clientY: pr.top + 8 }));
      return;
    }
    var canvas = document.getElementById(CANVAS);
    if (!canvas || !(t === document.body || t === canvas || t.id === 'textInput' || t.closest('#stage'))) return;
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    openKind(kindNow(), r.left + Math.min(r.width / 2, 160), r.top + Math.min(r.height / 2, 120));
  });

  UI.contextKinds = KINDS;
})();
