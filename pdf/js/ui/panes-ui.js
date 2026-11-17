/* Slop PDF — the split view's controls (ui/panes.js holds the panes, the focus and the swaps). Each pane has its own tab
 * strip (shared/doctabs/pane-tabs.js) with the open documents, the one that pane shows marked; an empty pane offers to open
 * a file or show an open document; the View menu and the header's Split view button list the layouts; Ctrl+Alt+Left and
 * Ctrl+Alt+Right move between the panes. Everything goes through SP.panes. Classic script, after ui/panes.js; exposes
 * SP.panesUI. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, DT = SP.tabs, P = function () { return SP.panes; };
  var bars = [];

  function api() { return DT.api ? DT.api() : null; }
  function openDocs() { var a = api(); return a ? a.tabs().map(function (t) { return { doc: t.doc, title: t.title }; }) : []; }
  function docById(id) { var hit = openDocs().find(function (t) { return t.doc.id === id; }); return hit ? hit.doc : null; }

  /** Pane i's strip items: the open documents, with the one pane i shows marked (the focused pane shows the live one). */
  function barItems(i) {
    return function () {
      var shown = P().shownDocs()[i];
      return openDocs().map(function (t) { return { id: t.doc.id, title: t.title, active: t.doc === shown }; });
    };
  }
  /** A tab was picked in pane i. A pane that shows the document takes the focus; otherwise the focused pane takes it live,
   *  or pane i does when it is not the focused one. */
  function pickTab(i, id) {
    var doc = docById(id), shown = P().shownDocs();
    if (!doc) return;
    for (var j = 0; j < shown.length; j++) if (shown[j] === doc) { P().focus(j); return; }
    if (i === P().focused()) { if (api()) api().activate(doc); } else P().openDocIn(i, doc);
  }
  function closeTab(id) { var doc = docById(id); if (doc && api()) api().close(doc); }
  /** The strip's + in pane i: a new empty document, which takes pane i (the focused pane shows it live). */
  function addInPane(i) {
    if (!api() || P().busy()) return;
    var prev = DT.current();
    var doc = api().newTab().doc;
    if (i !== P().focused()) P().placeIn(i, doc, prev);
  }
  /** Draws every pane's tab strip, and puts the strip above the stage away while the view is split. */
  function renderBars() {
    var strip = document.getElementById('tabs'), count = P().count();
    if (strip) strip.hidden = true;
    for (var i = count; i < bars.length; i++) if (bars[i]) { bars[i].destroy(); bars[i] = null; }
    bars.length = count;
    for (var j = 0; j < count; j++) {
      var el = P().paneEl(j);
      if (!bars[j] || bars[j].el.parentNode !== el) {
        bars[j] = SlopPaneTabs.mount(el, {
          label: U.t('pdf.act.open_documents'),
          items: barItems(j),
          pick: (function (k) { return function (id) { pickTab(k, id); }; })(j),
          close: closeTab,
          add: (function (k) { return function () { addInPane(k); }; })(j),
        });
      } else bars[j].render();
    }
  }
  // The strips stay on screen: their label follows a language change.
  U.onLang(function () { bars.forEach(function (b) { if (b) b.el.setAttribute('aria-label', U.t('pdf.act.open_documents')); }); });

  /** What an empty pane offers: open a file in it, or show a document that is open in the strip. */
  function emptyPane(i) {
    var box = U.h('div', { class: 'pv-pv-empty' });
    var open = U.h('button', { type: 'button', class: 'sui-btn sui-primary' }, U.t('pdf.act.pane_open_file'));
    var show = U.h('button', { type: 'button', class: 'sui-btn' }, U.t('pdf.act.pane_show_doc'));
    open.addEventListener('click', function () {
      SlopIntake.pick({ to: 'pdf', accept: 'application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp', multiple: false, mode: 'new', data: { pane: i } });
    });
    show.addEventListener('click', function () {
      var r = show.getBoundingClientRect();
      var items = openDocs().filter(function (t) { return t.doc !== DT.current(); }).map(function (t) {
        return { label: t.title, act: function () { P().openDocIn(i, t.doc); } };
      });
      SlopUI.menu(items.length ? items : [{ label: U.t('pdf.act.pane_no_other'), disabled: true }], r.left, r.bottom + 4);
    });
    box.append(open, show);
    return box;
  }

  /** The layouts as menu items: the View menu and the header's Split view button show the same list. */
  function layoutItems() {
    var count = P().count(), layout = P().layout(), set = function (k) { return function () { P().setLayout(k); }; };
    return [
      { label: U.t('pdf.act.layout_one'), check: count === 1, act: set('one') },
      { label: U.t('pdf.act.layout_cols2'), check: count === 2 && layout === 'columns2', act: set('columns2') },
      { label: U.t('pdf.act.layout_rows2'), check: count === 2 && layout === 'rows2', act: set('rows2') },
      { label: U.t('pdf.act.layout_cols3'), check: count === 3, act: set('columns3') },
      { label: U.t('pdf.act.layout_grid4'), check: count === 4, act: set('grid4') },
      '-',
      { label: U.t('pdf.act.pane_prev'), key: 'Ctrl+Alt+Left', act: function () { P().step(-1); } },
      { label: U.t('pdf.act.pane_next'), key: 'Ctrl+Alt+Right', act: function () { P().step(1); } },
    ];
  }

  // Ctrl+Alt+Left and Ctrl+Alt+Right move between the panes (the View menu shows them).
  window.addEventListener('keydown', function (e) {
    if (!e.ctrlKey || !e.altKey || P().count() < 2 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    P().step(e.key === 'ArrowLeft' ? -1 : 1);
  });

  /** The header's Split view button: the layout list as a menu, in Page view with pages open. */
  var splitBtn = document.getElementById('btnSplit');
  if (splitBtn) splitBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var A = SP.app;
    if (A.mode !== 'page' || !SP.engine.state.pages.length) { SlopUI.toast(U.t('pdf.act.split_need_page')); return; }
    var r = splitBtn.getBoundingClientRect();
    SlopUI.menu(layoutItems(), r.left, r.bottom + 4);
  });

  SP.panesUI = {
    renderBars: renderBars,
    /** The view is one pane again: the strips went with the panes. */
    dropBars: function () { bars = []; },
    emptyPane: emptyPane,
    layoutItems: layoutItems,
  };
})();
