/* Slop PDF — copy, cut and paste of what is selected in the page view: annotations (text boxes, pictures, signatures, shapes;
   a group of them, multi-sel.js), a block of the page's own text (select-edit.js: copied as an editable paragraph frame in its
   own font, size and colour, para-model.js) and a picture or placed artwork of the page (obj-mode.js: copied as a picture).
   Paste is "paste in place": on another page the copy lands at the same position; on its own page (and on each further paste
   to one page) a little lower and to the right, so copies never stack unseen. Paste on all pages / on pages… (a range) puts
   one copy on each page at that position (logos, stamps). The clipboard is kept across open documents (pictures carry
   their data). The system clipboard gets the copied text as plain text; a plain text pasted from elsewhere becomes a text
   box (pictures already come in through the shared intake, paste-image.js). One undo step per paste. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para, O = S.obj;
  var clip = null, OFF = 12; // { items: [{ a, R, view: [cx, cy] }], assets: {id: asset}, from: pid, pastes: {pid: n}, text }

  function textOf(a) {
    if (a.type === 'para') return (a.paras || []).map(function (pr) { return pr.map(function (r) { return r.t; }).join(''); }).join('\n');
    return a.text || '';
  }
  /** The annotations a copy takes now: a Promise of [annotation] (copies), [] when nothing is selected. */
  async function taken() {
    var p = Ed.page(); if (!p) return [];
    if (P.sel && P.sel.pid === p.id) {
      if (P.editor) await P.editor.commit();
      var sel = P.sel; await sel.ready;
      var base = sel && P.base(sel);
      return base ? [JSON.parse(JSON.stringify(base))] : [];
    }
    var o = O.live() && O.selected();
    if (o) {
      var png = await O.png(p, o), bytes = new Uint8Array(await png.blob.arrayBuffer()), r = O.rect(p, o);
      var asset = E.addAsset({ mime: 'image/png', url: U.bytesToDataURL(bytes, 'image/png'), w: Math.round(r.w * 2), h: Math.round(r.h * 2), name: png.name });
      return [{ id: U.uid('a'), type: 'image', asset: asset.id, opacity: 1, rot: 0, cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h }];
    }
    return S.selectedIds().map(function (id) { return JSON.parse(JSON.stringify(S.findAnnot(id))); }).filter(Boolean);
  }
  Ed.canCopy = function () { return !!(Ed.page() && ((P.sel && P.sel.pid === Ed.pid) || (O.live() && O.selected()) || S.selectedIds().length)); };
  /** Copies the selection: resolves the number of things copied. */
  Ed.copy = async function () {
    var list = await taken(); if (!list.length) return 0;
    var p = Ed.page(), c = S.ctx(), assets = {};
    clip = { from: p.id, pastes: {}, assets: assets, text: list.map(textOf).filter(Boolean).join('\n'), items: list.map(function (a) {
      if (a.asset && E.assets.get(a.asset)) assets[a.asset] = E.assets.get(a.asset);
      var r = E.annotViewRect(a, c.R, c.W, c.H);
      return { a: a, R: c.R, view: [r.x + r.w / 2, r.y + r.h / 2], W: c.W, H: c.H };
    }) };
    clip.pastes[p.id] = 1; // a paste on the same page moves off the original
    if (clip.text && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(clip.text).catch(function () { /* not allowed here */ });
    SlopUI.toast(U.t('pdf.se.copied', { n: list.length }));
    return list.length;
  };
  Ed.cut = async function () {
    var n = await Ed.copy(); if (!n) return 0;
    if (P.sel) await P.remove(); else if (O.live() && O.selected()) await O.act.remove(); else Ed.deleteSelected();
    clip.pastes = {}; // the original is gone: the first paste goes back in place
    return n;
  };
  Ed.canPaste = function () { return !!(clip && Ed.page()); };
  Ed.clipboard = function () { return clip; };

  /** The copies of the clipboard for page q, offset by k steps: annotations with new ids, in place. */
  function copiesFor(q, k) {
    var g = E.geom(q), R = E.rotation(q);
    Object.keys(clip.assets).forEach(function (id) { if (!E.assets.get(id)) E.assets.set(id, clip.assets[id]); }); // another document
    return clip.items.map(function (it) {
      var a = JSON.parse(JSON.stringify(it.a)); a.id = U.uid('a'); delete a.hidden; delete a.locked;
      var same = R === it.R && Math.abs(g.W - it.W) < 0.5 && Math.abs(g.H - it.H) < 0.5;
      if (!same) S.cross.place(a, it.R, { R: R, g: g }, it.view); // a page of another size or turn: the same place on screen
      if (k) { var r = E.annotViewRect(a, R, g.W, g.H); E.setAnnotViewRect(a, { x: r.x + OFF * k, y: r.y + OFF * k, w: r.w, h: r.h }, R, g.W, g.H); }
      return a;
    });
  }
  /** Pastes on page ids (default: the current page), one undo step; resolves the new annotations' ids. */
  Ed.paste = function (ids) {
    if (!clip) return [];
    var pids = ids && ids.length ? ids : Ed.pid ? [Ed.pid] : [], made = [], one = pids.length === 1;
    if (!pids.length) return [];
    var n = clip.items.length;
    E.commit(one ? U.t('pdf.se.undo_paste', { n: n }) : U.t('pdf.se.undo_paste_pages', { n: pids.length }), function (st) {
      st.pages.forEach(function (q) {
        if (pids.indexOf(q.id) < 0) return;
        var k = one ? (clip.pastes[q.id] || 0) : 0;
        copiesFor(q, k).forEach(function (a) { q.annots.push(a); made.push(a.id); });
      });
    });
    if (one) clip.pastes[pids[0]] = (clip.pastes[pids[0]] || 0) + 1;
    if (one && pids[0] === Ed.pid) {
      if (made.length === 1) { var a = S.findAnnot(made[0]); if (a && a.type === 'para' && Ed.uniOn()) P.selectAnnot(Ed.page(), a, true); else Ed.select(made[0]); }
      else if (S.groupSet) S.groupSet(made);
    }
    Ed.paint();
    return made;
  };
  /** Paste on every page, or on the pages of a range ("1-3, 5"). */
  Ed.pasteOnPages = function (range) {
    if (!clip) return [];
    var all = E.state.pages, ids = all.map(function (p) { return p.id; });
    if (range) ids = [].concat.apply([], U.parseRanges(range, all.length)).map(function (i) { return all[i].id; });
    return Ed.paste(ids.filter(function (id, i) { return ids.indexOf(id) === i; }));
  };
  Ed.askPasteOnPages = function () {
    if (!clip) return;
    SlopUI.prompt(U.t('pdf.se.paste_pages_title'), U.t('pdf.se.paste_pages_label', { n: E.state.pages.length }), '1-' + E.state.pages.length, { ok: U.t('pdf.se.paste') }).then(function (v) {
      if (v == null) return;
      try { var made = Ed.pasteOnPages(v); SlopUI.toast(U.t('pdf.se.pasted_pages', { n: made.length })); } catch (e) { SlopUI.alert(U.t('pdf.se.paste_pages_title'), String(e.message || e)); }
    });
  };
  /** Duplicate: a copy beside the selection on its page (frames and page objects too). */
  var dup = Ed.duplicateSelected;
  Ed.duplicateSelected = async function () {
    if (P.sel && P.sel.pid === Ed.pid) { var keep = clip; await Ed.copy(); Ed.paste(); clip = keep; return; }
    if (O.live() && O.selected()) return O.act.duplicate();
    return dup.apply(this, arguments);
  };

  // a copy of the page's text made with the browser (a text selection) is newer than what was copied here
  document.addEventListener('copy', function (e) { if (!e.defaultPrevented && window.getSelection && !window.getSelection().isCollapsed) clip = null; });
  // a plain text pasted from elsewhere (nothing copied here) becomes a text box in the middle of the view
  document.addEventListener('paste', function (e) { // intake-ok: plain text only (no files): pictures and files stay with SlopIntake
    if (e.defaultPrevented || !Ed.page() || !SP.app || SP.app.mode !== 'page' || (window.SlopTyping && SlopTyping.isTyping(document.activeElement))) return;
    var d = e.clipboardData; if (!d || (d.files && d.files.length)) return;
    var t = (d.getData('text/plain') || '').replace(/\r\n?/g, '\n').trim(); if (!t) return;
    e.preventDefault();
    var c = S.ctx(), vr = S.viewer.getBoundingClientRect(), pr = S.pageEl.getBoundingClientRect();
    var a = Object.assign({ type: 'text', text: t.slice(0, 5000), rot: c.R, cx: 0, cy: 0, w: 10, h: 10 }, Ed.defaults.text), tl = E.textLayout(a);
    var cx = ((vr.left + vr.width / 2) - pr.left) / c.z, cy = ((vr.top + vr.height / 2) - pr.top) / c.z;
    E.setAnnotViewRect(a, { x: cx - tl.w / 2, y: cy - tl.h / 2, w: tl.w, h: tl.h }, c.R, c.W, c.H);
    Ed.addAnnot(a, U.t('pdf.se.undo_paste_text'));
  });
})();
