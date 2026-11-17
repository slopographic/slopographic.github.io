/* Slop PDF — comments: the model and its commands. A comment is a page annotation of type 'note': an icon at a point
   with an author, a time, text, a thread of replies and a resolved flag. It is saved as a PDF text annotation
   (io/export-notes.js). The icon and the popups are in notes-view.js. Every change is one undo step (commitPage). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  var SIZE = 20, NAME_KEY = 'commentAuthor';
  Ed.NOTE_SIZE = SIZE;
  /** The name for new comments: the profile's name when the profile declares one, else the name typed before. */
  Ed.authorName = function () {
    var fromProfile = window.SlopProfile && typeof SlopProfile.get === 'function' ? SlopProfile.get('pdf', 'commentAuthor', '') : '';
    return String(fromProfile || U.store.get(NAME_KEY, '') || '').trim();
  };
  /** Keeps the name for next time (in this browser only). */
  Ed.rememberAuthor = function (name) {
    name = String(name || '').trim().slice(0, 80);
    if (name) U.store.set(NAME_KEY, name);
    return name;
  };
  /** A new comment at page point pt (unrotated page space), its icon centred on the point. */
  Ed.newNote = function (pt, text, author) {
    var c = S.ctx();
    return { id: U.uid('a'), type: 'note', cx: U.round(pt[0], 2), cy: U.round(pt[1], 2), w: SIZE, h: SIZE, rot: c.R,
      text: String(text), author: String(author), date: new Date().toISOString(), resolved: false, replies: [] };
  };
  /** One change to a comment on the current page. */
  function change(id, label, fn) {
    S.commitPage(label, function (p) { p.annots.forEach(function (a) { if (a.id === id && a.type === 'note') fn(a); }); });
  }
  Ed.addNote = function (note) { return Ed.addAnnot(note, U.t('pdf.ed.undo_add_comment')); };
  Ed.replyNote = function (id, text, author) {
    var r = { id: U.uid('r'), author: String(author), date: new Date().toISOString(), text: String(text) };
    change(id, U.t('pdf.ed.undo_reply_comment'), function (a) { a.replies = (a.replies || []).concat([r]); });
  };
  Ed.setNoteResolved = function (id, on) {
    change(id, U.t(on ? 'pdf.ed.undo_resolve_comment' : 'pdf.ed.undo_reopen_comment'), function (a) { a.resolved = !!on; });
  };
  Ed.deleteNote = function (id) {
    S.commitPage(U.t('pdf.ed.undo_delete_comment'), function (p) { p.annots = p.annots.filter(function (a) { return a.id !== id; }); });
    Ed.select(null);
  };
  /** Every comment in the document, in page order: [{ pid, index, note }]. */
  Ed.allNotes = function () {
    var out = [];
    E.state.pages.forEach(function (p, k) { (p.annots || []).forEach(function (a) { if (a.type === 'note') out.push({ pid: p.id, index: k, note: a }); }); });
    return out;
  };

  /* The comment tool: a click places the icon and opens the composer (notes-view.js); nothing is stored until Save. */
  S.noteDown = function (e, p, pt) { Ed.noteUI.compose(p, pt); };
})();
