/* Slop PDF — Comments panel: every comment in the document with its page and author, filtered by state. A click
   jumps to the page, selects the comment and opens its thread. Model and popups: editor/notes.js, notes-view.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, Ed = SP.editor, h = U.h, P = SP.panels, PANELS = P.PANELS, K = P.helpers;
  var t = U.t, section = K.section, seg = K.seg, note = K.note, needPages = K.needPages, onRefresh = K.onRefresh;
  var filter = 'all';
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toISOString(); }
  }
  PANELS.comments = {
    get title() { return t('pdf.tool.comments.title'); }, icon: 'comments', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var list = h('ul', { class: 'cm-list', 'aria-label': t('pdf.tool.comments.title') });
      var sel = seg([['all', t('ui.all')], ['open', t('pdf.tool.comments.f_open')], ['resolved', t('pdf.tool.comments.f_resolved')]], filter, function (v) { filter = v; P.refresh('filter'); }, t('pdf.tool.comments.show'));
      b.appendChild(section(null, [h('div', { class: 'cm-filter' }, sel), list,
        note(t('pdf.tool.comments.note'))]));
      onRefresh(function () {
        list.innerHTML = '';
        var rows = Ed.allNotes().filter(function (r) { return filter === 'all' || (filter === 'open' ? !r.note.resolved : r.note.resolved); });
        if (!rows.length) list.appendChild(h('li', null, note(t(filter === 'all' ? 'pdf.tool.comments.empty' : 'pdf.tool.comments.empty_filter'))));
        rows.forEach(function (r) {
          var a = r.note, n = (a.replies || []).length;
          var item = h('button', { type: 'button', class: 'cm-item' + (a.resolved ? ' is-resolved' : ''), title: t('pdf.tool.comments.go_tip') },
            h('b', null, t('pdf.tool.comments.item_head', { page: String(r.index + 1), author: a.author || t('pdf.tool.edit.unnamed') })),
            h('span', null, when(a.date) + (n ? ' · ' + t('pdf.tool.edit.replies_n', { n: n }) : '') + (a.resolved ? ' · ' + t('pdf.tool.edit.resolved') : '')),
            h('p', null, a.text));
          item.addEventListener('click', function () {
            SP.app.openPage(r.pid, true); // SP.app is set by ui/app.js, which loads after this file
            Ed.select(a.id);
            Ed.noteUI.open(a.id);
          });
          list.appendChild(h('li', null, item));
        });
      });
    }
  };
})();
