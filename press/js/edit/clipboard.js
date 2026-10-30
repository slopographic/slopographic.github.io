/* Slop Press — object clipboard: copy/cut/paste frames (with their stories and images) through the system
   clipboard (so it also works between tabs), paste images and plain text as new frames. */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state, M = PR.model, I = PR.items, U = PR.util, H = PR.history;
  var CB = PR.clipboard = { data: null };
  var MARK = 'SLOPPRESS1:';

  function pack(ids) {
    var items = [], stories = {}, assets = {};
    ids.forEach(function (id) {
      var f = M.findItem(S.doc, id); if (!f) return;
      var c = U.clone(f.item); items.push(c);
      if (c.type === 'text') stories[c.story] = U.clone(S.doc.stories[c.story]);
      if (c.asset && S.doc.assets[c.asset]) assets[c.asset] = S.doc.assets[c.asset];
    });
    return { items: items, stories: stories, assets: assets };
  }
  CB.has = function () { return !!CB.data; };
  CB.copyItems = function (cut) {
    if (!S.sel.length) return null;
    CB.data = pack(S.sel);
    if (cut) { S.sel.slice().forEach(function (id) { I.remove(S.doc, id); }); S.sel = []; H.commit(U.t('press.edit.undo_cut')); }
    return CB.data;
  };
  /** Pastes the clipboard items onto the active page (in place, or offset when pasting on the same spot). */
  CB.pasteItems = function (inPlace, data) {
    data = data || CB.data; if (!data || !data.items.length) return false;
    var idmap = {}, smap = {}, list = PR.activeItems();
    data.items.forEach(function (it) { idmap[it.id] = U.uid('F'); });
    for (var a in data.assets) if (!S.doc.assets[a]) S.doc.assets[a] = data.assets[a];
    var off = inPlace ? 0 : list.some(function (x) { return data.items.some(function (y) { return x.x === y.x && x.y === y.y; }); }) ? 12 : 0;
    var made = data.items.map(function (src) {
      var c = U.clone(src); c.id = idmap[src.id]; c.x += off; c.y += off;
      if (!S.doc.layers.some(function (l) { return l.id === c.layer; })) c.layer = PR.layers.active || S.doc.layers[S.doc.layers.length - 1].id;
      if (c.type === 'text') {
        if (!smap[src.story]) { var ns = U.clone(data.stories[src.story] || M.story('')); ns.id = U.uid('S'); S.doc.stories[ns.id] = M.fixStory(ns); smap[src.story] = ns.id; }
        c.story = smap[src.story]; c.next = c.next && idmap[c.next] || null; c.prev = c.prev && idmap[c.prev] || null;
      }
      list.push(c); return c;
    });
    H.commit(U.t('press.edit.undo_paste')); PR.select(made.map(function (c) { return c.id; }));
    return true;
  };
  /** Runs a clipboard command from a menu (uses the system clipboard events where allowed). */
  CB.command = function (what) {
    if (S.text && PR.textEdit.input) PR.textEdit.focus();
    var ok = false;
    try { ok = document.execCommand(what); } catch (e) { ok = false; }
    if (ok) return;
    if (what === 'paste') { if (!S.text) CB.pasteItems(false); else if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (t) PR.textEdit.insert(t, U.t('press.edit.undo_paste')); }).catch(function () { U.toast(U.t('press.app.paste_hint')); }); }
    else if (!S.text) CB.copyItems(what === 'cut');
  };
  function editable(t) { return t && (t.tagName === 'INPUT' || (t.tagName === 'TEXTAREA' && t.id !== 'textInput') || t.tagName === 'SELECT' || t.isContentEditable); }
  document.addEventListener('copy', function (e) {
    if (S.text || editable(e.target) || !S.sel.length) return;
    var d = CB.copyItems(false); if (!d) return;
    e.clipboardData.setData('text/plain', MARK + JSON.stringify(d)); e.preventDefault();
  });
  document.addEventListener('cut', function (e) {
    if (S.text || editable(e.target) || !S.sel.length) return;
    var d = CB.copyItems(true); if (!d) return;
    e.clipboardData.setData('text/plain', MARK + JSON.stringify(d)); e.preventDefault();
  });
  // A pasted file (a picture) is the intake's (io/intake.js), which takes it first; this is Press's own clipboard and text.
  document.addEventListener('paste', function (e) { // intake-ok: the items copied in Press, and pasted text
    if (e.defaultPrevented || S.text || editable(e.target) || !S.doc) return;
    var dt = e.clipboardData; if (!dt) return;
    var txt = dt.getData('text/plain');
    e.preventDefault();
    if (txt && txt.indexOf(MARK) === 0) { try { CB.data = JSON.parse(txt.slice(MARK.length)); } catch (er) { /* fall back to the in-memory copy */ } CB.pasteItems(false); return; }
    if (txt) { PR.place.text(txt); return; }
    CB.pasteItems(false);
  });
})();
