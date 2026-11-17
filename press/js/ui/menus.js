/* Slop Press — menubar: buttons with SlopUI dropdowns built from command ids (labels + live shortcut keys). Menu and submenu
   labels are keys (press/i18n/<code>/menus.js), read when the bar or a menu is built. */
(function () {
  'use strict';
  var PR = window.PR, A = PR.actions, U = PR.util, S = PR.state;
  var UI = PR.ui = PR.ui || {};

  var MENUS = [
    { id: 'File', label: 'menu.file', items: ['file.new', 'file.template', 'file.open', 'file.openDrive', '-', 'file.save', 'file.saveAs', 'file.saveDrive', '-', 'file.place', 'file.placeDrive', 'file.loadFont', '-',
      'file.exportPDF', 'file.exportPNG', { label: 'press.menu.send_to', dyn: 'sendto' }, 'file.print', '-', 'file.docSetup', '-', 'file.downloadApp'] },
    { id: 'Edit', label: 'menu.edit', items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.pasteInPlace', 'edit.delete', '-', 'edit.duplicate', 'edit.selectAll', 'edit.deselect', '-', 'help.search', 'help.shortcuts'] },
    { id: 'Layout', label: 'press.menu.layout', items: ['layout.addPage', 'layout.insertPages', 'layout.duplicatePage', 'layout.deletePage', '-', { label: 'press.menu.pages', items: ['layout.firstPage', 'layout.prevPage', 'layout.nextPage', 'layout.lastPage', 'layout.goto'] }, '-',
      'layout.editMaster', 'layout.newMaster', 'layout.applyMaster', 'layout.overrideMaster', '-', 'layout.marginsColumns', 'layout.createGuides', 'layout.clearGuides', '-', 'layout.autoflow'] },
    { id: 'Type', label: 'press.menu.type', items: [{ label: 'press.menu.para_style', dyn: 'para' }, { label: 'press.menu.char_style', dyn: 'char' }, 'type.newParaStyle', 'type.newCharStyle', 'type.redefinePara', 'type.clearOverrides', '-',
      'type.bold', 'type.italic', 'type.underline', { label: 'press.menu.alignment', items: ['type.alignLeft', 'type.alignCenter', 'type.alignRight', 'type.justify', 'type.justifyAll'] }, 'type.bigger', 'type.smaller', '-',
      { label: 'press.menu.special_char', items: ['type.pageNumber', 'type.emDash', 'type.enDash', 'type.nbsp', 'type.softHyphen', 'type.lineBreak', 'type.bullet', 'type.copyright'] },
      'type.dropCap', 'type.hyphenate', 'type.gridAlign', { label: 'press.menu.composer', items: ['type.composerKP', 'type.composerGreedy'] }, '-', 'type.placeholder', 'file.loadFont'] },
    { id: 'Object', label: 'press.menu.object', items: [{ label: 'press.menu.arrange', items: ['arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back'] }, '-', 'object.textFrameOptions', 'object.breakThread', '-',
      { label: 'press.menu.fitting', items: ['object.fitFill', 'object.fitFit', 'object.fitCenter', 'object.fitStretch'] }, 'object.placeImage', '-',
      { label: 'press.menu.text_wrap', items: ['wrap.none', 'wrap.box', 'wrap.contour', 'wrap.jump'] }, 'object.rotate90', '-', 'object.lock', 'object.unlockAll'] },
    { id: 'View', label: 'menu.view', items: ['view.zoomIn', 'view.zoomOut', 'view.fitPage', 'view.fitSpread', 'view.actual', 'view.pasteboard', '-', 'view.preview', '-', 'view.rulers', 'view.guides', 'view.baseline', 'view.frames', 'view.threads', 'view.snap', '-',
      { label: 'press.menu.theme', items: ['theme.pro', 'theme.light', 'theme.classic'] }] },
    { id: 'Window', label: 'press.menu.window', items: ['window.pages', 'window.layers', 'window.paraStyles', 'window.charStyles', 'window.props', 'window.swatches', '-', 'window.togglePanels'] },
    { id: 'Help', label: 'menu.help', items: ['help.search', 'help.shortcuts', '-', 'help.about', 'help.home'] }
  ];
  UI.MENUS = MENUS;
  function dyn(kind) {
    if (kind === 'sendto') return PR.hub ? PR.hub.sendItems() : [{ label: U.t('press.menu.hub_unavailable'), disabled: true }];
    if (kind === 'para' || kind === 'char') {
      var cur = PR.format.current();
      return PR.styles.names(S.doc, kind).map(function (n) {
        return { label: n, check: cur && (kind === 'para' ? cur.ps : cur.cs) === n, disabled: !PR.format.hasText(), act: function () { if (kind === 'para') PR.format.paraStyle(n); else PR.format.charStyle(n); } };
      });
    }
    return [];
  }
  function toItems(items) {
    return items.map(function (it) {
      if (it === '-') return '-';
      if (typeof it === 'string') {
        var c = A.get(it); if (!c) return null;
        return { label: c.title, key: A.keyFor(it), disabled: !A.enabled(it), check: A.checked(it), act: function () { clearBar(); A.run(it); } };
      }
      var sub = it.items ? toItems(it.items) : dyn(it.dyn);
      return { label: U.t(it.label), sub: sub.length ? sub : [{ label: U.t('press.menu.none'), disabled: true }] };
    }).filter(Boolean);
  }
  UI.toItems = toItems;
  /** A top menu's items by its id ('File', 'Layout', ...; the English name, the same in every language). */
  UI.menuItems = function (id) { var m = MENUS.filter(function (x) { return x.id === id; })[0]; return m ? toItems(m.items) : []; };
  var openIdx = null;
  function clearBar() { openIdx = null; U.$$('.menu-btn.open').forEach(function (b) { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }); }
  UI.closeMenus = function () { window.SlopUI.closeMenu(); clearBar(); };
  function openAt(btn, idx) {
    UI.closeMenus();
    var r = btn.getBoundingClientRect(), m = window.SlopUI.menu(toItems(MENUS[idx].items), r.left, r.bottom);
    m.classList.add('pr-dropdown'); m.setAttribute('data-menu', MENUS[idx].id);
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { clearBar(); btn.focus(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var bs = U.$$('#menus .menu-btn'), n = bs.length, j = (idx + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
        openAt(bs[j], j);
      }
    });
    btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); openIdx = idx;
    // closing the SlopUI menu any other way clears the bar state
    var obs = new MutationObserver(function () { if (!document.body.contains(m)) { obs.disconnect(); if (openIdx === idx) clearBar(); } });
    obs.observe(document.body, { childList: true });
  }
  UI.buildMenubar = function () {
    var nav = U.$('#menus'); nav.innerHTML = '';
    MENUS.forEach(function (m, i) {
      var b = U.h('button', { type: 'button', class: 'menu-btn', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'data-menu': m.id }, U.t(m.label));
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (openIdx === i) UI.closeMenus(); else openAt(b, i); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openAt(b, i); } });
      b.addEventListener('pointerenter', function () { if (openIdx !== null && openIdx !== i) openAt(b, i); });
      nav.append(b);
    });
  };
  // a language change: the menu titles again (the menus themselves are built on open)
  U.onLang(function () { if (U.$('#menus') && U.$('#menus').children.length) { UI.closeMenus(); UI.buildMenubar(); } });
})();
