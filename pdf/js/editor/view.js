/* Slop PDF — page view: the page stack (continuous, single page or two pages side by side), the active page that
   the annotation tools work on, and page sizes. Zoom and navigation: view-zoom.js. Page slots and lazy rasters:
   view-pages.js. Rows, page changes and scroll-follow: view-rows.js. Annotation tools: annots.js, pointer.js, text.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, V = SP.view;
  var Ed = SP.editor = {};
  var S = Ed._ = {}; // DOM + interaction state shared by the editor/*.js files
  Ed.pid = null; Ed.tool = 'select'; Ed.selId = null; Ed.zoomMode = 'fit'; Ed.zoom = 1; Ed.fitPid = null;
  // [id, name key (pdf/i18n/en/tools.js: U.t(tool[1]) where it shows), icon, shortcut]
  Ed.TOOLS = ['select', 'block', 'text', 'pen', 'marker', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'redact', 'hlbox', 'texthl', 'image', 'signature', 'note', 'callout', 'step']
    .map(function (id, i) { return [id, 'pdf.tool.edit.tool_' + id, id === 'signature' ? 'sign' : id, 'VKTPHRELAWXBUISNCG'.charAt(i)]; });
  var DEF = {
    text: { color: '#111111', font: 'Helvetica', size: 16, bold: false, italic: false, opacity: 1 },
    pen: { color: '#1d4ed8', width: 2.5, opacity: 1 },
    marker: { color: '#ffe14d', width: 14, opacity: 0.5 },
    rect: { color: '#e0245e', width: 2.5, fill: 'none', opacity: 1 },
    ellipse: { color: '#e0245e', width: 2.5, fill: 'none', opacity: 1 },
    line: { color: '#e0245e', width: 2.5, opacity: 1 },
    arrow: { color: '#e0245e', width: 2.5, opacity: 1 },
    whiteout: { fill: '#ffffff', opacity: 1 },
    hlbox: { fill: '#ffe14d', opacity: 0.4 },
    texthl: { color: '#ffe14d', opacity: 0.4 },
    redact: {},
    image: { opacity: 1 },
    note: {},
    callout: { color: '#111111', font: 'Helvetica', size: 14, bold: false, italic: false, borderC: '#e0245e', borderW: 1.2, opacity: 1 },
    step: { fill: '#e0245e', color: '#111111', size: 28, opacity: 1 }
  };
  Ed.DEF = DEF;
  Ed.defaults = U.store.get('toolDefaults', null) || JSON.parse(JSON.stringify(DEF));
  Object.keys(DEF).forEach(function (k) { Ed.defaults[k] = Object.assign({}, DEF[k], Ed.defaults[k] || {}); });

  Ed.init = function (viewerEl) {
    S.viewer = viewerEl;
    // typing on a phone: the page view scrolls the edited text (S.ta, the paragraph editor) above the keyboard, with room
    // at its end for the last lines (shared/input/keyboard.js)
    viewerEl.setAttribute('data-slop-kb-pad', '');
    if (Ed.noteUI) Ed.noteUI.wire(viewerEl);
    S.pad = U.h('div', { class: 'pv-pad' });
    S.overlay = U.h('div', { class: 'pv-overlay' }); // moves to the active page element (placeTools)
    S.ta = U.h('textarea', { class: 'pv-text', spellcheck: 'false', autocomplete: 'off', 'aria-label': U.t('pdf.ed.text_box_field'), 'data-i18n-attr': 'aria-label:pdf.ed.text_box_field', wrap: 'off', hidden: true, dir: 'auto' });
    S.pageEl = null;
    S.viewer.appendChild(S.pad);
    S.viewer.addEventListener('pointerdown', function (e) {
      if (!e.target.isConnected || (e.target.closest && e.target.closest('.pv-page'))) return; // a mark repainted by the press itself is a press on its page
      if (e.pointerType === 'mouse' && e.button === 0) S.startPan(e); else if (e.pointerType !== 'mouse') S.startPan(e);
      Ed.select(null);
    });
    S.ta.addEventListener('input', S.onTextInput);
    S.ta.addEventListener('blur', function () { S.finishText(true); });
    S.ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); S.ta.blur(); }
      e.stopPropagation();
    });
    new ResizeObserver(function () { if (Ed.pid && Ed.zoomMode !== 'num') Ed.layout(); }).observe(S.viewer);
    S.initRows();
    S.initZoom();
  };
  Ed.page = function () { return Ed.pid ? E.pageById(Ed.pid) : null; };
  /** Shows a page: in continuous and two-page layouts it is scrolled to the top of the view; in single page it is the page. */
  Ed.show = function (pid) {
    if (Ed.pid !== pid) { S.finishText(true); Ed.selId = null; if (Ed.noteUI) Ed.noteUI.close(); }
    S.stopEase();
    Ed.pid = pid; Ed.fitPid = pid;
    if (SP.organizer && SP.organizer.markCurrent) SP.organizer.markCurrent();
    Ed.layout(true);
    S.reveal(pid);
  };
  Ed.hide = function () { S.finishText(true); S.stopEase(); Ed.pid = null; Ed.selId = null; };

  /* --------------------------------------------------------------- layout */
  S.fitZoom = function (mode) {
    var p = E.pageById(Ed.fitPid) || Ed.page(); if (!p) return 1;
    var vs = E.viewSize(p), cw = Math.max(100, S.viewer.clientWidth - 48), ch = Math.max(100, S.viewer.clientHeight - 48);
    return mode === 'width' ? cw / vs.w : Math.min(cw / vs.w, ch / vs.h);
  };
  Ed.layout = function (forceRaster) {
    if (!Ed.page()) return;
    if (Ed.zoomMode !== 'num') { if (!E.pageById(Ed.fitPid)) Ed.fitPid = Ed.pid; Ed.zoom = S.fitZoom(Ed.zoomMode); }
    S.pad.style.left = ''; S.pad.style.top = ''; // back to centred; the zoom anchor sets its offset again
    S.buildRows();
    S.sizeRows();
    if (S.blockRedraw) S.blockRedraw();   // a block copy box keeps its words when the page is zoomed (editor/block-copy.js)
    Ed.paint();
    S.scheduleRaster(forceRaster ? 0 : 120);
    if (SP.app) SP.app.zoomChanged(Ed.zoom);
    if (S.zoomPct) S.zoomPct.textContent = Ed.percent(Ed.zoom) + '%';
  };

  /* ---------------------------------------------------------------- paint */
  Ed.paint = function () {
    if (!Ed.page()) return;
    S.paintLive();
    if (Ed.selId && !S.findAnnot(Ed.selId)) Ed.selId = null;
    S.drawSelection();
  };
  S.findAnnot = function (id) { var p = Ed.page(); if (!p) return null; for (var i = 0; i < p.annots.length; i++) if (p.annots[i].id === id) return p.annots[i]; return null; };
  Ed.getSelected = function () { return Ed.selId ? S.findAnnot(Ed.selId) : null; };
  Ed.select = function (id) {
    if (Ed.selId === id) return;
    Ed.selId = id; S.drawSelection();
    if (SP.app) SP.app.editorSelectionChanged();
  };
  S.ctx = function () { var p = Ed.page(), g = E.geom(p); return { p: p, g: g, R: E.rotation(p), W: g.W, H: g.H, z: Ed.zoom }; };
  /** The lock badge on a locked layer's selection: its top-right corner. */
  function lockCue(r, z) {
    var el = U.h('div', { class: 'sel-lock', title: U.t('pdf.ed.locked_tip'), 'aria-label': U.t('pdf.ed.locked'), html: U.icon('lock') });
    el.style.left = ((r.x + r.w) * z) + 'px'; el.style.top = (r.y * z) + 'px';
    return el;
  }
  S.drawSelection = function () {
    S.overlay.innerHTML = '';
    if (Ed.noteUI) Ed.noteUI.reattach(); // an open comment stays on top of the overlay
    var a = Ed.getSelected();
    if (!a) { if (S.drawTextBox) S.drawTextBox(); return; } // a text selection's box (editor/sel-actions.js)
    if (a.hidden || (S.editing && S.editing.id === a.id)) return;
    var c = S.ctx(), r = E.annotViewRect(a, c.R, c.W, c.H), z = c.z;
    var box = U.h('div', { class: 'sel-box' + (a.type === 'line' || a.type === 'arrow' ? ' is-line' : '') + (a.locked ? ' is-locked' : '') });
    box.style.left = (r.x * z) + 'px'; box.style.top = (r.y * z) + 'px'; box.style.width = (r.w * z) + 'px'; box.style.height = (r.h * z) + 'px';
    S.overlay.appendChild(box);
    // A locked layer stays selectable (so it can be unlocked) but has no handles and no delete button: it cannot be changed.
    if (a.locked) { S.overlay.appendChild(lockCue(r, z)); return; }
    var hs;
    if (a.type === 'line' || a.type === 'arrow') {
      [0, a.pts.length - 1].forEach(function (k, n) {
        var q = E.toView(c.R, c.W, c.H, a.pts[k][0], a.pts[k][1]);
        var h = U.h('div', { class: 'handle h-pt', 'data-h': n ? 'p2' : 'p1' });
        h.style.left = (q[0] * z) + 'px'; h.style.top = (q[1] * z) + 'px';
        S.overlay.appendChild(h);
      });
      return;
    }
    // a paragraph frame (para-view.js): its left and right edges reflow the text (on an unrotated page)
    hs = a.type === 'para' ? (c.R ? [] : ['w', 'e']) : a.type === 'note' ? [] : (a.type === 'text' || a.type === 'image' || a.type === 'callout') ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    if (a.type === 'callout' && a.tip) { // the leader line's end: dragged on its own
      var tq = E.toView(c.R, c.W, c.H, a.tip[0], a.tip[1]), th = U.h('div', { class: 'handle h-pt', 'data-h': 'tip' });
      th.style.left = (tq[0] * z) + 'px'; th.style.top = (tq[1] * z) + 'px';
      S.overlay.appendChild(th);
    }
    hs.forEach(function (h) {
      var el = U.h('div', { class: 'handle h-' + h, 'data-h': h });
      el.style.left = ((r.x + (/w/.test(h) ? 0 : /e/.test(h) ? r.w : r.w / 2)) * z) + 'px';
      el.style.top = ((r.y + (/n/.test(h) ? 0 : /s/.test(h) ? r.h : r.h / 2)) * z) + 'px';
      S.overlay.appendChild(el);
    });
    // its actions (Edit, Colour, Opacity, Comment, Duplicate, Delete) are on the selection bar (sel-bar.js, sel-annot.js)
  };
})();
