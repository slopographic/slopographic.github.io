/* Slop PDF — comments on screen: the note icon (SVG, page space) and its popups. The composer (a new comment), the
   thread (author, time, text, replies, reply, resolve or reopen, delete) and the hover preview of a comment. The popups
   sit in the active page's overlay, so they move with the page; they are never part of the export. Model: notes.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, V = SP.view, h = U.h;
  var pop = null, popKind = null, popId = null, popSig = '', at = null;
  function fmt(v) { return String(U.round(v, 3)); }
  /** The transform that puts a box annotation's local frame (its top-left corner) in place. */
  V.boxTransform = function (a) {
    return 'translate(' + fmt(a.cx) + ' ' + fmt(a.cy) + ') rotate(' + fmt(-(a.rot || 0)) + ') translate(' + fmt(-a.w / 2) + ' ' + fmt(-a.h / 2) + ')';
  };
  /** A comment's icon: a sticky note with a folded corner and three lines (a check mark when resolved). */
  V.noteNode = function (a) {
    var g = U.s('g', { 'data-aid': a.id, class: 'an an-note' + (a.resolved ? ' is-resolved' : ''), transform: V.boxTransform(a) }), w = a.w, hh = a.h;
    var fill = a.resolved ? '#cfcab8' : '#ffd23f';
    g.appendChild(U.s('rect', { x: 0, y: 0, width: fmt(w), height: fmt(hh), fill: 'transparent', class: 'an-hit' }));
    g.appendChild(U.s('path', { d: 'M0 0H' + fmt(w) + 'V' + fmt(hh * 0.68) + 'L' + fmt(w * 0.68) + ' ' + fmt(hh) + 'H0Z', fill: fill, stroke: '#3a3320', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }));
    g.appendChild(U.s('path', { d: 'M' + fmt(w * 0.68) + ' ' + fmt(hh) + 'V' + fmt(hh * 0.68) + 'H' + fmt(w), fill: 'none', stroke: '#3a3320', 'stroke-width': 0.6 }));
    if (a.resolved) g.appendChild(U.s('path', { d: 'M' + fmt(w * 0.22) + ' ' + fmt(hh * 0.5) + 'l' + fmt(w * 0.18) + ' ' + fmt(hh * 0.2) + 'l' + fmt(w * 0.4) + ' -' + fmt(hh * 0.4), fill: 'none', stroke: '#2c6e3f', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
    else [0.36, 0.52, 0.68].forEach(function (f) { g.appendChild(U.s('path', { d: 'M' + fmt(w * 0.2) + ' ' + fmt(hh * f) + 'H' + fmt(w * 0.8), stroke: '#3a3320', 'stroke-width': 0.8, 'stroke-linecap': 'round' })); });
    return g;
  };

  function date(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toISOString(); }
  }
  function keys(el, submit, cancel) {
    el.addEventListener('keydown', function (e) {
      e.stopPropagation(); // typing is not a shortcut
      if (e.key === 'Escape' && cancel) { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && submit) { e.preventDefault(); submit(); }
    });
    return el;
  }
  function head(a, extra) {
    return h('div', { class: 'np-head' }, h('b', null, a ? (a.author || U.t('pdf.ed.note_unnamed')) : U.t('pdf.ed.note_new')),
      a ? h('time', { datetime: a.date }, date(a.date)) : null, a && a.resolved ? h('span', { class: 'np-badge' }, U.t('pdf.ed.note_resolved')) : null, extra);
  }
  function closeBtn() { return h('button', { type: 'button', class: 'np-x', 'aria-label': U.t('pdf.ed.note_close'), title: U.t('pdf.ed.note_close_tip'), onclick: function () { Ed.noteUI.close(); } }, '×'); }
  function repliesOf(a) {
    if (!a.replies || !a.replies.length) return null;
    return h('ol', { class: 'np-replies' }, a.replies.map(function (r) {
      return h('li', null, h('b', null, r.author || U.t('pdf.ed.note_unnamed')), ' ', h('time', { datetime: r.date }, date(r.date)), h('p', null, r.text));
    }));
  }
  /** Hover preview: read only. */
  function previewBody(a) { return h('div', { class: 'np-body' }, head(a), h('p', { class: 'np-text' }, a.text), repliesOf(a)); }
  /** The thread popup: everything the comment holds, plus the reply, resolve and delete actions. */
  function threadBody(a) {
    var author = Ed.authorName(), who = h('input', { class: 'np-input', type: 'text', value: author, placeholder: U.t('pdf.ed.note_your_name'), 'aria-label': U.t('pdf.ed.note_your_name'), maxlength: 80 });
    var reply = keys(h('textarea', { class: 'np-input', rows: 2, placeholder: U.t('pdf.ed.note_reply_ph'), 'aria-label': U.t('pdf.ed.note_reply') }), function () { send(); });
    function send() {
      var name = Ed.rememberAuthor(who.value), text = reply.value.trim();
      if (!text) { reply.focus(); return; }
      if (!name) { who.focus(); SlopUI.toast(U.t('pdf.ed.note_name_first')); return; }
      Ed.replyNote(a.id, text, name);
    }
    var acts = h('div', { class: 'np-actions' },
      h('button', { type: 'button', class: 'btn primary sm', onclick: send }, U.t('pdf.ed.note_reply')),
      h('button', { type: 'button', class: 'btn sm', onclick: function () { Ed.setNoteResolved(a.id, !a.resolved); } }, U.t(a.resolved ? 'pdf.ed.note_reopen' : 'pdf.ed.note_resolve')),
      h('button', { type: 'button', class: 'btn sm danger-text', onclick: function () { Ed.deleteNote(a.id); } }, U.t('ui.delete')));
    return h('div', { class: 'np-body' }, head(a, closeBtn()), h('p', { class: 'np-text' }, a.text), repliesOf(a),
      h('div', { class: 'np-reply' }, h('label', { class: 'np-field' }, h('span', null, U.t('pdf.ed.note_your_name')), who), reply), acts);
  }
  /** The composer: author and text, then Save or Cancel. */
  function composeBody(pt) {
    var who = h('input', { class: 'np-input', type: 'text', value: Ed.authorName(), placeholder: U.t('pdf.ed.note_your_name'), 'aria-label': U.t('pdf.ed.note_your_name'), maxlength: 80 });
    var text = keys(h('textarea', { class: 'np-input', rows: 3, placeholder: U.t('pdf.ed.note_type_ph'), 'aria-label': U.t('pdf.ed.note_comment') }), save, Ed.noteUI.close);
    function save() {
      var t = text.value.trim(), name = Ed.rememberAuthor(who.value);
      if (!t) { text.focus(); return; }
      if (!name) { who.focus(); SlopUI.toast(U.t('pdf.ed.note_name_first')); return; }
      Ed.noteUI.close();
      Ed.addNote(Ed.newNote(pt, t, name));
      Ed.setTool('select');
    }
    var acts = h('div', { class: 'np-actions' },
      h('button', { type: 'button', class: 'btn primary sm', onclick: save }, U.t('pdf.ed.note_save')),
      h('button', { type: 'button', class: 'btn sm', onclick: function () { Ed.noteUI.close(); } }, U.t('menu.cancel')));
    return h('div', { class: 'np-body' }, head(null, closeBtn()), h('label', { class: 'np-field' }, h('span', null, U.t('pdf.ed.note_your_name')), who), text, acts);
  }
  function sigOf(a) { return JSON.stringify(a); }
  function note() { return popId ? S.findAnnot(popId) : null; }
  /** Places the popup beside its point (view space times zoom, inside the active page's overlay). */
  function place() {
    if (!pop || !Ed.page()) return;
    var c = S.ctx(), p = popKind === 'compose' ? at : (note() ? [note().cx, note().cy] : null);
    if (!p) return;
    var v = E.toView(c.R, c.W, c.H, p[0], p[1]);
    pop.style.left = (v[0] * c.z + 14) + 'px'; pop.style.top = (v[1] * c.z - 10) + 'px';
  }
  function show(kind, body, id) {
    pop = h('div', { class: 'note-pop np-' + kind, role: kind === 'preview' ? 'tooltip' : 'dialog', 'aria-label': U.t('pdf.ed.note_comment') }, body);
    popKind = kind; popId = id || null; popSig = id ? sigOf(note() || {}) : '';
    S.overlay.appendChild(pop); place();
  }
  function close() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null; popKind = null; popId = null; popSig = ''; at = null;
  }
  function pinned() { return !!pop && popKind !== 'preview'; }
  function openThread(id, kind) {
    var a = S.findAnnot(id);
    if (!a || a.type !== 'note') return;
    close();
    show(kind || 'thread', kind === 'preview' ? previewBody(a) : threadBody(a), id);
  }

  Ed.noteUI = {
    /** The composer for a new comment at page point pt. */
    compose: function (p, pt) {
      close(); at = pt.slice();
      show('compose', composeBody(pt));
      var t = pop.querySelector('textarea'); if (t) setTimeout(function () { t.focus(); }, 0);
    },
    open: function (id) { openThread(id, 'thread'); },
    close: close,
    pinned: pinned,
    current: function () { return popId; },
    /** After the overlay is cleared (every paint): puts the popup back, and rebuilds it when its comment changed. */
    reattach: function () {
      if (!pop) return;
      if (popKind !== 'compose' && !note()) { close(); return; }
      if (popKind === 'thread' && sigOf(note()) !== popSig) { openThread(popId, 'thread'); return; }
      S.overlay.appendChild(pop); place();
    },
    /** Hover over a comment's icon on the active page (not while a popup is pinned). */
    hover: function (id) {
      if (pinned() || (popKind === 'preview' && popId === id)) return;
      if (!S.findAnnot(id)) return;
      openThread(id, 'preview');
    },
    unhover: function () { if (popKind === 'preview') close(); }
  };
  /** Hover preview wiring on the viewer (delegated, so it survives page changes). Called from Ed.init. */
  Ed.noteUI.wire = function (viewer) {
    viewer.addEventListener('pointerover', function (e) {
      var g = e.target.closest && e.target.closest('.an-note[data-aid]');
      if (g) Ed.noteUI.hover(g.getAttribute('data-aid'));
    });
    viewer.addEventListener('pointerout', function (e) {
      if (popKind !== 'preview') return;
      var to = e.relatedTarget;
      if (to && to.closest && (to.closest('.np-body') || to.closest('.an-note'))) return;
      Ed.noteUI.unhover();
    });
  };
})();
