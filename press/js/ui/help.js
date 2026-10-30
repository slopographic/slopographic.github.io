/* Slop Press — small dialogs: About, Load Font, placeholder text, and the built-in command palette /
   shortcut list used only while the shared SlopCmd package is not available. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, t = U.t, h = U.h, S = PR.state, A = PR.actions, H = PR.history;
  var UI = PR.ui = PR.ui || {};
  var SU = function () { return window.SlopUI; };

  UI.about = function () {
    SU().dialog({ title: t('press.cmd.help_about'), body: h('div', { class: 'pr-form' },
      h('p', { class: 'sui-p' }, t('press.help.about_body', { app: 'Slop Press' })),
      h('p', { class: 'sui-p' }, t('press.help.about_privacy')),
      h('p', { class: 'sui-p' }, t('press.help.about_keys', { key: A.keyFor('help.search') || 'Ctrl+K' }))), buttons: [{ label: t('menu.ok'), primary: true }] });
  };
  /** The shared Fonts panel (shared/fonts/panel.js) for this document: its fonts, your own TTF or OTF (kept in the document,
   * so PDF export embeds it), and the closest family Press embeds. No library download: Press embeds Liberation Sans and the
   * font files the document holds, not the library's WOFF2 faces. */
  UI.openFonts = function (fonts) {
    if (!window.SlopFonts) return;
    SlopFonts.ready().then(function () {
      // the font files the document holds are the document's own fonts (listed as "your own file" in the panel)
      SlopFontCatalog.setDocumentFonts(Object.keys(PR.fonts.user).map(function (fam) {
        var rec = (S.doc.fonts || []).filter(function (r) { return r.family === fam; })[0];
        return { family: fam, bytes: rec && S.doc.assets[rec.asset] ? U.dataURLToBytes(S.doc.assets[rec.asset]).bytes : null };
      }).filter(function (f) { return f.bytes; }), { only: true });
      SlopFonts.openPanel({
        fonts: fonts || [], standard: Object.keys(PR.fonts.FAMILIES), title: t('press.help.fonts_title'), library: false, download: false,
        note: t('press.help.fonts_note'),
        closest: { sans: 'Liberation Sans', serif: 'Liberation Sans', mono: 'Liberation Sans' },
        addFile: addFontFile,
        onUse: function (r) { PR.format.char({ font: r.use }, U.t('press.edit.undo_use_closest_font')); }
      });
    });
  };
  /** Adds a TTF or OTF file to the document (what the panel's "Your own file" drop and File ▸ Load Font File use). forName: the
   * missing family the file is dropped on (the file is then used for it). WOFF and WOFF2 are refused with a message. */
  function addFontFile(file, forName) {
    return SlopFonts.ready().then(function () { return SlopFontCatalog.readFontFile(file, 'Slop Press'); }).then(function () {   // i18n-ignore: app name
      return PR.fonts.addFile(S.doc, file, forName);
    }).then(function (fam) { H.commit(U.t('press.edit.undo_load_font')); PR.emit('fonts'); return fam; });
  }
  UI.loadFont = function () { UI.openFonts([]); };
  var IPSUM = ['Slop Press sets type the old-fashioned way: every line is measured, broken and justified by the composer, then hyphenated where the measure demands it.',   // i18n-ignore: sample text stamped into the document
    'Good typography is invisible. The reader never notices the even colour of a well-set column, only that the reading felt easy and the page looked calm.',   // i18n-ignore: sample text stamped into the document
    'Threaded frames carry a story from page to page; when the last frame fills up, a small red plus sign tells you the text is overset.',   // i18n-ignore: sample text stamped into the document
    'Master pages hold the furniture of a publication: running heads, folios and the grid. Change the master and every page follows.',   // i18n-ignore: sample text stamped into the document
    'Paragraph styles describe the voice of the text, character styles its accents. Redefine a style once and the whole document reflows.'];   // i18n-ignore: sample text stamped into the document
  UI.placeholder = function (n) { var out = []; for (var i = 0; i < n; i++) out.push(IPSUM[i % IPSUM.length]); return out.join('\n'); };
  UI.fillPlaceholder = function () {
    var fr = S.text ? PR.model.findItem(S.doc, S.text.frame).item : PR.selected().filter(function (it) { return it.type === 'text'; })[0];
    if (!fr) return;
    var st = S.doc.stories[fr.story];
    if (S.text) { PR.textEdit.insert(UI.placeholder(3), U.t('press.edit.undo_placeholder_text')); return; }
    PR.story.remove(st, 0, st.text.length);
    PR.story.insert(st, 0, UI.placeholder(12));
    PR.touch();
    // trim so the text just fits the frame chain
    var r = PR.engine.story(fr.story);
    if (r && r.overset && r.end > 0) { PR.story.remove(st, r.end, st.text.length); while (st.text.length && /\s/.test(st.text[st.text.length - 1])) PR.story.remove(st, st.text.length - 1, st.text.length); }
    H.commit(U.t('press.edit.undo_placeholder_text'));
  };

  /* ---------- fallback palette + shortcut list (SlopCmd provides the real ones) ---------- */
  UI.miniPalette = function () {
    var inp = h('input', { class: 'sui-input', type: 'search', placeholder: t('press.help.type_command'), 'aria-label': t('ui.cmd.search') }), list = h('div', { class: 'pr-pal-list', role: 'listbox' });
    var items = [], sel = 0, dlg;
    function score(c, q) { var hay = (c.title + ' ' + c.group + ' ' + (c.keywords || []).join(' ')).toLowerCase(); var i = hay.indexOf(q); if (i >= 0) return 100 - i; var k = 0; for (var j = 0; j < hay.length && k < q.length; j++) if (hay[j] === q[k]) k++; return k === q.length ? 10 : -1; }
    function render() {
      var q = inp.value.trim().toLowerCase();
      items = A.order.map(function (id) { return A.get(id); }).filter(function (c) { return c && A.enabled(c.id); }).map(function (c) { return { c: c, s: q ? score(c, q) : 1 }; }).filter(function (x) { return x.s >= 0; })
        .sort(function (a, b) { return b.s - a.s; }).slice(0, 60).map(function (x) { return x.c; });
      sel = Math.min(sel, Math.max(0, items.length - 1)); list.innerHTML = '';
      items.forEach(function (c, i) {
        var b = h('button', { type: 'button', class: i === sel ? 'on' : '', role: 'option' }, h('span', null, c.title, ' ', h('small', null, c.group)), h('small', null, A.keyFor(c.id)));
        b.addEventListener('click', function () { dlg.close(true); setTimeout(function () { A.run(c.id); }, 0); });
        list.append(b);
      });
    }
    inp.addEventListener('input', function () { sel = 0; render(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); e.stopPropagation(); var c = items[sel]; dlg.close(true); setTimeout(function () { A.run(c.id); }, 0); }
    });
    dlg = SU().dialog({ title: t('press.help.search_title'), body: h('div', { class: 'pr-pal' }, inp, list), dismissable: true });
    render();
  };
  UI.shortcutList = function () {
    var grid = h('div', { class: 'pr-keys' }), last = '';
    A.order.map(function (id) { return A.get(id); }).filter(function (c) { return c && c.keys && c.keys.length && c.id.indexOf('style.') !== 0; }).forEach(function (c) {
      if (c.group !== last) { grid.append(h('h5', null, c.group)); last = c.group; }
      grid.append(h('span', null, c.title), h('kbd', null, c.keys.map(A.label).join('  ·  ')));
    });
    SU().dialog({ title: t('ui.cmd.km_title'), cls: 'sui-wide', body: grid, buttons: [{ label: t('menu.ok'), primary: true }] });
  };
})();
