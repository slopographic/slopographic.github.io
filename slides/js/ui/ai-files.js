/* Slop Slides for the assistant: the commands that bring files in and send them out (add_image from Slop Drive or a picture
   on this site through shared/commands/sources.js, export_presentation as PDF, PowerPoint or .sslide to Slop Drive and/or a download), the state summary and
   the checkpoint for "Undo all AI changes". The writers are the File menu's own (io/pdf.js, io/pptx.js, io/native.js).
   Loaded on demand before ai-commands.js, which calls SS.aiFiles.commands(add, helpers). Exposes SS.aiFiles. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, M = SS.model, O = SS.objects, U = SS.util, N = SS.native;
  var F = SS.aiFiles = {};

  F.commands = function (add, h) {
    add('add_image', 'Add picture', [h.SLIDE, h.Str('file', 'a Slop Drive file name or id (list_files)', { maxLength: 300 }), // i18n-ignore
      h.Str('url', 'or the address of a picture on this site, e.g. /assets/logo.png', { maxLength: 500 }), h.Str('name', 'object name', { maxLength: 120 })].concat(h.BOX), // i18n-ignore
    async function (a) {
      var t = h.slideAt(a.slide), f = await SlopCmdSources.picture({ file: a.file, url: a.url }), url = f.dataUrl, sz = { w: f.w, h: f.h }, d = A.deck;
      var slot = a.x == null && t.s.objects.filter(function (o) { return o.placeholder === 'pic' && !o.media; })[0];
      var k = Math.min(1, d.size.w * 0.6 / sz.w, d.size.h * 0.6 / sz.h), id = M.addMedia(d, url, f.name);
      var name = a.name || f.name.replace(/\.[^.]+$/, '') || 'Picture'; // i18n-ignore
      if (slot) {
        SS.app.change('Insert picture', function () { slot.media = id; slot.src = { w: sz.w, h: sz.h }; slot.name = name; }); // i18n-ignore
        return 'Put ' + f.name + ' into the picture placeholder of ' + h.nth(t.i) + '.'; // i18n-ignore
      }
      var fr = h.frame(a, a.w || (a.h ? a.h * sz.w / sz.h : sz.w * k), a.h || (a.w ? a.w * sz.h / sz.w : sz.h * k));
      var o = O.make('image', Object.assign(fr, { src: { w: sz.w, h: sz.h }, media: id, name: name }));
      SS.aiCmd.place(t.s, o, 'Insert picture'); // i18n-ignore
      return 'Added ' + f.name + ' on ' + h.nth(t.i) + ' (id ' + o.id + ').'; // i18n-ignore
    }, { description: 'Add a picture from Slop Drive or from this site to a slide (it fills an empty picture placeholder).' }); // i18n-ignore

    add('export_presentation', 'Export presentation', [{ name: 'format', type: 'enum', values: ['pdf', 'pptx', 'sslide'], default: 'pdf' }, // i18n-ignore
      { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' }, // i18n-ignore
      h.Str('name', 'file name without extension; the presentation title when empty', { maxLength: 120 })],
    async function (a) {
      if (!A.deck) throw new Error('No presentation is open');
      var r = await F.exportBlob(A.deck, a.format), name = (a.name || N.fileName(A.deck.title).replace(/\.sslide$/, '')) + '.' + a.format, out = [];
      if (a.to !== 'download') {
        var id = await SlopCmdSources.put(r.blob, name, 'slides');
        out.push('Saved ' + name + ' to Slop Drive (id ' + id + ')'); // i18n-ignore
      }
      if (a.to !== 'drive') { U.download(r.blob, name); out.push('downloaded ' + name); }
      return out.join(' and ') + (r.note ? '. ' + r.note : '.');
    }, { description: 'Export the open presentation as PDF, PowerPoint (.pptx) or .sslide, to Slop Drive (other apps can open it there) and/or as a download.' }); // i18n-ignore
  };

  /** The deck as a file: { blob, note }. */
  F.exportBlob = async function (deck, format) {
    if (format === 'pdf') {
      var p = await SS.pdfExport.write(deck);
      return { blob: p.blob, note: p.pages + ' page' + (p.pages === 1 ? '' : 's') + (p.missing.length ? '; text in ' + p.missing.join(', ') + ' needs a font that was not downloaded' : '') }; // i18n-ignore
    }
    if (format === 'pptx') {
      var x = await SS.pptx.write(deck);
      return { blob: x.blob, note: x.skipped ? x.skipped + ' object(s) left out (tables, charts and media are not in PowerPoint export yet)' : '' }; // i18n-ignore
    }
    return { blob: N.toBlob(deck), note: '' };
  };

  F.state = function () {
    var d = A.deck;
    if (!d) return { app: 'Slop Slides', open: false }; // i18n-ignore
    var sel = A.selObjs().map(function (o) { return { id: o.id, name: o.name, type: o.type }; });
    return { app: 'Slop Slides', title: d.title, size: d.size.preset + ' (' + d.size.w + ' × ' + d.size.h + ' pt)', theme: SS.themes.of(d).name, // i18n-ignore
      fonts: SS.themes.of(d).fonts.heading + ' / ' + SS.themes.of(d).fonts.body, unsaved: !!A.dirty, mode: A.mode, currentSlide: A.idx + 1,
      slideCount: d.slides.length, slides: SS.outline.summary(d).slice(0, 60), selection: sel, canUndo: A.hist.canUndo(),
      layouts: SS.layouts.list.map(function (l) { return l.id; }) };
  };
  /** The open presentation as it is now. The rollback closes the tabs the assistant opened and puts the deck back as one undo step. */
  F.checkpoint = function () {
    var T = SS.tabs.current(), snap = A.deck ? JSON.stringify(A.deck) : null, made = SS.aiCmd.made.length;
    return function () {
      var api = SS.tabs.api();
      SS.aiCmd.made.splice(made).forEach(function (t) { if (t && t.doc) t.doc.dirty = false; if (api) api.close(t); });
      if (!T || !snap) return true;
      if (api && SS.tabs.current() !== T) api.activate(T);
      if (SS.tabs.current() !== T) return false;
      if (JSON.stringify(A.deck) !== snap) A.change('Undo AI changes', function () { var media = A.deck.media, d = JSON.parse(snap); d.media = Object.assign({}, d.media, media); A.deck = d; A.emit('deck'); }); // i18n-ignore
      return true;
    };
  };
})();
