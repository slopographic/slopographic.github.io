/* Slop PDF — page organizer grid: keyed thumbnail rendering with lazy pdf.js rasters and the
   selection model. Pointer drag & drop lives in organize/drag.js, keyboard in organize/keys.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, V = SP.view;
  var O = SP.organizer = {};
  var grid, scroller, els = new Map(), io = null, size = U.clamp(+U.store.get('thumbSize', 168) || 168, 80, 4000);
  O.sel = new Set(); O.anchor = null; O.focusId = null;
  var S = O._ = { els: els }; // state shared with organize/drag.js and organize/keys.js

  O.init = function (gridEl, scrollEl) {
    grid = gridEl; scroller = scrollEl; S.grid = grid; S.scroller = scroller;
    grid.style.setProperty('--thumb', size + 'px');
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { var el = en.target; el._visible = true; if (!S.zooming) loadThumb(el); } else en.target._visible = false; });
    }, { root: scroller, rootMargin: '400px 0px' });
    U.onLang(function () { O.render(); }); // the thumbnails' labels (their buttons follow through data-i18n-attr)
    grid.addEventListener('pointerdown', function (e) { S.onDown(e); });
    grid.addEventListener('dblclick', function (e) { var t = e.target.closest('.thumb'); if (t && !e.target.closest('button')) SP.app.openPage(t.dataset.id); });
    grid.addEventListener('contextmenu', function (e) { S.onContext(e); });
    // once a touch drag has started, stop the browser from scrolling instead
    grid.addEventListener('touchmove', function (e) { if (S.dragging()) e.preventDefault(); }, { passive: false });
    grid.addEventListener('keydown', function (e) { S.onKey(e); });
    if (O.initZoom) O.initZoom();
    grid.addEventListener('focusin', function (e) { var t = e.target.closest('.thumb'); if (t) O.focusId = t.dataset.id; });
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var t = b.closest('.thumb'), id = t && t.dataset.id; if (!id) return;
      e.stopPropagation();
      var act = b.dataset.act;
      if (act === 'check') { toggle(id); return; }
      var ids = O.sel.has(id) ? O.selected() : [id];
      if (act === 'rotl') SP.app.rotate(ids, -90);
      else if (act === 'rotr') SP.app.rotate(ids, 90);
      else if (act === 'del') SP.app.remove(ids);
      else if (act === 'view') SP.app.openPage(id);
      else SP.app.pageAct(act, ids);
    });
  };
  O.MIN = 80;
  /** Largest useful size: one page per row across the grid's inner width. */
  O.maxSize = function () {
    if (!grid) return 1200;
    var cs = getComputedStyle(grid), w = (scroller || grid).clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return w > 0 ? Math.max(O.MIN + 40, Math.floor(w)) : 4000; // hidden grid: no limit yet
  };
  var sizeFns = [];
  O.onSize = function (fn) { sizeFns.push(fn); };
  /** Sets the thumbnail size in CSS px (clamped to MIN..maxSize). Rasters follow once zooming settles. */
  O.setSize = function (px) {
    px = Math.round(U.clamp(px, O.MIN, O.maxSize()));
    if (px === size && grid.style.getPropertyValue('--thumb')) return;
    size = px; U.store.set('thumbSize', px);
    grid.style.setProperty('--thumb', px + 'px');
    S.zooming = true; O.render(); settle();
    sizeFns.forEach(function (fn) { fn(px); });
  };
  var settle = U.debounce(function () { S.zooming = false; els.forEach(function (el) { if (el._visible) loadThumb(el); }); }, 160);
  O.getSize = function () { return size; };
  O.selected = function () { return E.state.pages.filter(function (p) { return O.sel.has(p.id); }).map(function (p) { return p.id; }); };
  O.selectedIndices = function () { var out = []; E.state.pages.forEach(function (p, i) { if (O.sel.has(p.id)) out.push(i); }); return out; };
  O.setSelection = function (ids, anchor) { O.sel = new Set(ids); if (anchor !== undefined) O.anchor = anchor; syncSel(); };
  O.selectAll = function () { O.setSelection(E.state.pages.map(function (p) { return p.id; })); };
  function toggle(id) { if (O.sel.has(id)) O.sel.delete(id); else O.sel.add(id); O.anchor = id; syncSel(); }

  function thumbBox() { var s = Math.min(size, O.maxSize()); return { w: s, h: Math.round(s * 1.3) }; }
  function makeThumb(p) {
    var el = U.h('div', { class: 'thumb', role: 'option', tabindex: '-1', 'data-id': p.id, 'aria-selected': 'false' },
      U.h('div', { class: 'thumb-box' }),
      U.h('button', { class: 'thumb-check', type: 'button', 'data-act': 'check', tabindex: '-1', 'aria-label': U.t('pdf.org.toggle_sel'), 'data-i18n-attr': 'aria-label:pdf.org.toggle_sel', html: U.icon('check') }),
      U.h('div', { class: 'thumb-tools' },
        U.h('button', { type: 'button', 'data-act': 'rotl', tabindex: '-1', title: U.t('pdf.org.rotate_left'), 'aria-label': U.t('pdf.org.rotate_left'), 'data-i18n-attr': 'title:pdf.org.rotate_left;aria-label:pdf.org.rotate_left', html: U.icon('rotl') }),
        U.h('button', { type: 'button', 'data-act': 'rotr', tabindex: '-1', title: U.t('pdf.org.rotate_right'), 'aria-label': U.t('pdf.org.rotate_right'), 'data-i18n-attr': 'title:pdf.org.rotate_right;aria-label:pdf.org.rotate_right', html: U.icon('rotr') }),
        U.h('button', { type: 'button', 'data-act': 'view', tabindex: '-1', title: U.t('pdf.org.open_page'), 'aria-label': U.t('pdf.org.open_page'), 'data-i18n-attr': 'title:pdf.org.open_page;aria-label:pdf.org.open_page', html: U.icon('zoomin') }),
        U.h('button', { type: 'button', 'data-act': 'dup', tabindex: '-1', title: U.t('ui.duplicate'), 'aria-label': U.t('pdf.org.dup_page'), 'data-i18n-attr': 'title:ui.duplicate;aria-label:pdf.org.dup_page', html: U.icon('copy') }),
        U.h('button', { type: 'button', 'data-act': 'up', tabindex: '-1', title: U.t('pdf.org.move_up'), 'aria-label': U.t('pdf.org.move_page_up'), 'data-i18n-attr': 'title:pdf.org.move_up;aria-label:pdf.org.move_page_up', html: U.icon('up') }),
        U.h('button', { type: 'button', 'data-act': 'down', tabindex: '-1', title: U.t('pdf.org.move_down'), 'aria-label': U.t('pdf.org.move_page_down'), 'data-i18n-attr': 'title:pdf.org.move_down;aria-label:pdf.org.move_page_down', html: U.icon('down') }),
        U.h('button', { type: 'button', 'data-act': 'ext', tabindex: '-1', title: U.t('pdf.org.extract_page'), 'aria-label': U.t('pdf.org.extract_page'), 'data-i18n-attr': 'title:pdf.org.extract_page;aria-label:pdf.org.extract_page', html: U.icon('download') }),
        U.h('button', { type: 'button', 'data-act': 'del', tabindex: '-1', title: U.t('ui.delete'), 'aria-label': U.t('pdf.org.delete_page'), 'data-i18n-attr': 'title:ui.delete;aria-label:pdf.org.delete_page', class: 'danger', html: U.icon('trash') })),
      U.h('div', { class: 'thumb-grip', 'aria-hidden': 'true', html: U.icon('grip') }),
      U.h('div', { class: 'thumb-cap' }, U.h('span', { class: 'fdot' }), U.h('span', { class: 'pnum' }), U.h('span', { class: 'psrc' })),
      U.h('span', { class: 'thumb-badge', hidden: true }),
      U.h('span', { class: 'thumb-part', hidden: true }),
      U.h('span', { class: 'thumb-redact', hidden: true }));
    io.observe(el);
    return el;
  }
  function loadThumb(el) {
    var p = E.pageById(el.dataset.id); if (!p || !el._sheet) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var vs = E.viewSize(p), g = E.geom(p), sc = el._sheet._scale || 1;
    var px = Math.max(g.W, g.H) * sc * dpr;
    V.loadRaster(el._sheet, p, px);
  }
  /** Re-renders the grid from state (keyed; reuses elements). */
  O.render = function (force) {
    if (!grid) return;
    var pages = E.state.pages, total = pages.length, box = thumbBox(), seen = new Set();
    var parts = SP.app.splitPreview ? SP.app.splitPreview() : null;
    pages.forEach(function (p, i) {
      seen.add(p.id);
      var el = els.get(p.id);
      if (!el) { el = makeThumb(p); els.set(p.id, el); }
      var f = E.fileOfPage(p);
      el.style.setProperty('--fc', f ? f.color : 'var(--faint)');
      if (force) { if (el._sheet) el._sheet._sig = null; }
      el._sheet = V.sheet(el._sheet, p, box.w - 16, box.h - 16, i, total);
      var bx = el.firstChild; if (el._sheet.parentNode !== bx) bx.appendChild(el._sheet);
      el.querySelector('.pnum').textContent = String(i + 1);
      var n = String(i + 1), src = String(p.i + 1);
      el.querySelector('.psrc').textContent = p.blank ? U.t('pdf.org.src_blank') : (E.files.size > 1 ? U.t('pdf.org.src_file_page', { file: shortName(f.name), page: src }) : U.t('pdf.org.src_page', { page: src }));
      var lab = p.blank ? U.t('pdf.org.thumb_blank', { n: n }) : U.t('pdf.org.thumb_from', { n: n, file: f ? f.name : '', page: src });
      el.setAttribute('aria-label', p.rot ? U.t('pdf.org.thumb_rotated', { label: lab, deg: String(p.rot) }) : lab);
      el.title = p.blank ? U.t('pdf.org.blank_page') : U.t('pdf.org.thumb_title', { file: f.name, page: src });
      var badge = el.querySelector('.thumb-badge'), na = (p.annots || []).length;
      var nr = (p.annots || []).filter(function (a) { return a.type === 'redact'; }).length, rb = el.querySelector('.thumb-redact');
      na -= nr; badge.hidden = !na; if (na) badge.innerHTML = U.icon('edit') + na;
      rb.hidden = !(nr || p.redacted); rb.className = 'thumb-redact' + (nr ? ' pending' : '');
      rb.textContent = nr ? U.t('pdf.org.to_redact', { n: nr }) : U.t('pdf.org.redacted');
      var part = el.querySelector('.thumb-part');
      if (parts && parts[i]) { part.hidden = false; part.textContent = parts[i]; part.className = 'thumb-part' + (parts[i].charAt(0) === '✂' ? ' cut' : ''); } else part.hidden = true;
      if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
      if (el._visible && !S.zooming) loadThumb(el);
    });
    els.forEach(function (el, id) { if (!seen.has(id)) { io.unobserve(el); el.remove(); els.delete(id); } });
    O.sel.forEach(function (id) { if (!seen.has(id)) O.sel.delete(id); });
    syncSel();
  };
  function shortName(n) { n = U.baseName(n); return n.length > 14 ? n.slice(0, 12) + '…' : n; }
  function syncSel() {
    els.forEach(function (el, id) { var on = O.sel.has(id); el.classList.toggle('selected', on); el.setAttribute('aria-selected', on ? 'true' : 'false'); });
    var fid = O.focusId && els.has(O.focusId) ? O.focusId : (E.state.pages[0] && E.state.pages[0].id);
    els.forEach(function (el, id) { setTab(el, id === fid ? 0 : -1); });
    O.markCurrent();
    if (SP.app) SP.app.selectionChanged();
  }
  /** Tab order: the focused thumbnail and its action buttons are reachable with Tab; the others are not (arrows move). */
  function setTab(el, t) {
    el.tabIndex = t;
    el.querySelectorAll('.thumb-tools button').forEach(function (b) { b.tabIndex = t; });
  }
  /** The active page (page view) gets the current-page border in the thumbnails. */
  O.markCurrent = function () {
    var cur = SP.editor && SP.editor.pid;
    els.forEach(function (el, id) { el.classList.toggle('is-current', id === cur); });
  };
  O.focus = function (id, scroll) {
    var el = els.get(id); if (!el) return;
    O.focusId = id;
    els.forEach(function (e2, i2) { setTab(e2, i2 === id ? 0 : -1); });
    el.focus({ preventScroll: true });
    if (scroll !== false) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  O.reveal = function (id) { var el = els.get(id); if (el) el.scrollIntoView({ block: 'center' }); };

  S.syncSel = syncSel; S.toggle = toggle; S.loadThumb = loadThumb;
})();
