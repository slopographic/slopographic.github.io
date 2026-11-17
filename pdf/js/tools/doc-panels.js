/* Slop PDF — Forms, Compress, Convert, Split and Metadata panels. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, h = U.h, P = SP.panels, PANELS = P.PANELS, K = P.helpers;
  var t = U.t, section = K.section, row = K.row, btn = K.btn, seg = K.seg, select = K.select, num = K.num, text = K.text, slider = K.slider, colorPicker = K.colorPicker, check = K.check, note = K.note, needPages = K.needPages, onRefresh = K.onRefresh;
  PANELS.forms = {
    get title() { return t('pdf.tool.forms.title'); }, icon: 'forms', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var list = h('div', { class: 'form-list' }, note(t('pdf.tool.forms.looking')));
      b.appendChild(list);
      var flatten = check(t('pdf.tool.forms.flatten'), E.state.flattenForms, function (v) { E.commit(t(v ? 'pdf.tool.forms.undo_flatten' : 'pdf.tool.forms.undo_keep'), function (st) { st.flattenForms = v; }); });
      b.appendChild(section(t('pdf.tool.forms.output'), [flatten, h('div', { class: 'btn-row' }, btn(t('pdf.tool.forms.reset'), 'undo', function () { E.commit(t('pdf.tool.forms.undo_reset'), function (st) { st.forms = {}; }); P.rebuild(); }))]));
      (async function () {
        var used = new Set(E.state.pages.map(function (p) { return p.f; })), any = false;
        list.innerHTML = '';
        for (var f of E.files.values()) {
          if (!used.has(f.id)) continue;
          var fields = await E.loadFields(f);
          if (!fields.length) continue;
          any = true;
          list.appendChild(section(null, [h('div', { class: 'form-file' }, h('span', { class: 'fdot', style: { '--fc': f.color } }), h('b', null, f.name), h('span', { class: 'fi-meta' }, t('pdf.tool.forms.fields_n', { n: fields.length })))].concat(fields.map(function (fld) { return fieldRow(f, fld); }))));
        }
        if (!any) list.appendChild(section(null, [note(t('pdf.tool.forms.none'))]));
      })();
    }
  };
  function fieldRow(f, fld) {
    var vals = E.state.forms[f.id] || {}, has = Object.prototype.hasOwnProperty.call(vals, fld.name), v = has ? vals[fld.name] : fld.value;
    function set(val) { E.commit(t('pdf.tool.forms.undo_fill', { name: fld.name }), function (st) { st.forms[f.id] = Object.assign({}, st.forms[f.id] || {}); st.forms[f.id][fld.name] = val; }, 'form:' + f.id + ':' + fld.name); }
    var ctrl, label = fld.name.split('.').pop();
    if (fld.type === 'checkbox') ctrl = check(label, !!v, set);
    else if (fld.type === 'radiobutton') ctrl = row(label, select([['', '—']].concat(fld.options.map(function (o) { return [o, o]; })), v || '', set));
    else if (fld.type === 'combobox' || fld.type === 'listbox') ctrl = row(label, select([['', '—']].concat(fld.options.map(function (o) { return [o[0], o[1] || o[0]]; })), v || '', set));
    else {
      var inp = fld.multiline ? h('textarea', { class: 'inp', rows: 3 }) : h('input', { class: 'inp', type: 'text' });
      inp.value = v == null ? '' : v;
      inp.addEventListener('input', function () { set(inp.value); });
      ctrl = row(label, inp);
    }
    var wrap = h('div', { class: 'form-field' + (fld.readOnly ? ' ro' : '') }, ctrl, h('span', { class: 'ff-page' }, t('pdf.tool.forms.field_page', { page: String((fld.page || 0) + 1) })));
    wrap.title = fld.name;
    return wrap;
  }

  /* ----------------------------------------------------------- compress */
  PANELS.compress = {
    get title() { return t('pdf.tool.compress.title'); }, icon: 'compress', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var o = { mode: 'lossless', dpi: 110, quality: 0.65 };
      var lossy = h('div', { hidden: true },
        row(t('pdf.tool.compress.resolution'), slider(o.dpi, 50, 200, 5, function (v) { o.dpi = v; }, function (v) { return v + ' dpi'; })),
        row(t('pdf.tool.compress.jpeg_quality'), slider(Math.round(o.quality * 100), 20, 95, 5, function (v) { o.quality = v / 100; }, function (v) { return v + '%'; })),
        note(t('pdf.tool.compress.lossy_warn'), 'warn'));
      b.appendChild(section(t('pdf.tool.compress.mode'), [seg([['lossless', t('pdf.tool.compress.lossless')], ['lossy', t('pdf.tool.compress.lossy')]], o.mode, function (v) { o.mode = v; lossy.hidden = v !== 'lossy'; }, t('pdf.tool.compress.mode_aria')),
        note(t('pdf.tool.compress.lossless_note')), lossy]));
      var result = h('div', { class: 'result' });
      b.appendChild(section(null, [h('div', { class: 'btn-row' }, btn(t('pdf.tool.compress.go'), 'compress', function () { SP.app.compress(o, result); }, 'primary wide')), result]));
    }
  };

  /* ------------------------------------------------------------ convert */
  /* OCR: reads the text of scanned pages into an invisible text layer (ocr/recognise.js). */
  PANELS.ocr = {
    get title() { return t('pdf.tool.ocr.title'); }, icon: 'ocr', build: function (b) {
      var off = SP.offline || !window.SlopAITools;
      var note = h('p', { class: 'hint' }, t(off ? 'pdf.tool.ocr.offline' : 'pdf.tool.ocr.intro'));
      b.appendChild(note);
      var engine = h('div', { class: 'ocr-engine-row' });   // Text recognition engine (shared/ocr/choose.js), once the OCR list has loaded
      if (!off) SP.ocr.choice().then(function (c) { engine.appendChild(c.engineSelect()); }, function () {});
      b.appendChild(section(t('pdf.tool.ocr.recognise'), [
        row('', engine),
        row('', btn(t('pdf.tool.ocr.run_page'), 'ocr', function () { SP.app.recognisePage(); })),
        row('', btn(t('pdf.tool.ocr.run_doc'), 'ocr', function () { SP.app.recogniseAll(); })),
        row('', btn(t('pdf.tool.ocr.language'), 'ocr', function () { SP.ocr.chooseLanguage(); }))   // shared/ocr/choose.js
      ]));
    }
  };

  PANELS.convert = {
    get title() { return t('pdf.tool.convert.title'); }, icon: 'convert', build: function (b) {
      var o = { format: 'png', dpi: 150, quality: 0.9, which: 'all' };
      if (E.state.pages.length) {
        b.appendChild(section(t('pdf.tool.convert.office'), [
          h('div', { class: 'btn-row' },
            btn('Word (.docx)', 'convert', function () { SP.app.openConvert('pdf-to-docx'); }),   // i18n-ignore
            btn('Excel (.xlsx)', 'convert', function () { SP.app.openConvert('pdf-to-xlsx'); }),   // i18n-ignore
            btn('PowerPoint (.pptx)', 'convert', function () { SP.app.openConvert('pdf-to-pptx'); }))   // i18n-ignore
        ]));
      }
      if (E.state.pages.length) {
        // The full converter, with every format (the Office buttons above open it with one preselected).
        b.appendChild(section(t('pdf.tool.convert.all'), [
          h('div', { class: 'btn-row' }, btn(t('pdf.tool.convert.all_formats'), 'convert', function () { SP.app.openConvert(); })),
          note(t('pdf.tool.convert.all_note'))
        ]));
      }
      if (E.state.pages.length) {
        b.appendChild(section(t('pdf.tool.convert.to_images'), [
          row(t('pdf.tool.convert.format'), seg([['png', 'PNG'], ['jpeg', 'JPEG']], o.format, function (v) { o.format = v; }, t('pdf.tool.convert.format_aria'))),
          row(t('pdf.tool.convert.resolution'), select([['72', t('pdf.tool.convert.dpi_screen')], ['150', '150 dpi'], ['300', t('pdf.tool.convert.dpi_print')], ['600', '600 dpi']], o.dpi, function (v) { o.dpi = +v; })),
          row(t('pdf.tool.convert.jpeg_quality'), slider(90, 30, 100, 5, function (v) { o.quality = v / 100; }, function (v) { return v + '%'; })),
          row(t('pdf.tool.convert.pages'), seg([['all', t('ui.all')], ['sel', t('pdf.tool.convert.selected')]], o.which, function (v) { o.which = v; }, t('pdf.tool.convert.pages_aria'))),
          h('div', { class: 'btn-row' }, btn(t('pdf.tool.convert.download_images'), 'image', function () { SP.app.toImages(o); }, 'primary wide')),
          note(t('pdf.tool.convert.zip_note'))]));
      }
      var io = { size: 'a4', margin: 24, orientation: 'auto', add: E.state.pages.length > 0 };
      b.appendChild(section(t('pdf.tool.convert.from_images'), [
        row(t('pdf.tool.convert.page_size'), select([['fit', t('pdf.tool.convert.size_fit')], ['a4', 'A4'], ['letter', t('pdf.tool.convert.size_letter')]], io.size, function (v) { io.size = v; })),
        row(t('pdf.tool.convert.orientation'), select([['auto', t('pdf.tool.convert.orient_auto')], ['portrait', t('pdf.tool.convert.portrait')], ['landscape', t('pdf.tool.convert.landscape')]], io.orientation, function (v) { io.orientation = v; })),
        row(t('pdf.tool.convert.margin'), select([['0', t('ui.none')], ['24', t('pdf.tool.convert.margin_small')], ['48', t('pdf.tool.convert.margin_large')]], io.margin, function (v) { io.margin = +v; })),
        h('div', { class: 'btn-row' }, btn(t('pdf.tool.convert.choose_images'), 'image', function () { SP.app.imagesToPdf(io); }, 'primary wide')),
        check(t('pdf.tool.convert.add_to_doc'), io.add, function (v) { io.add = v; }),
        note(t('pdf.tool.convert.images_note'))]));
      if (E.state.pages.length) {
        b.appendChild(section(t('pdf.tool.convert.to_text'), [note(t('pdf.tool.convert.text_note')),
          h('div', { class: 'btn-row' }, btn(t('pdf.tool.convert.extract_text'), 'textfile', function () { SP.app.extractText(); }, 'wide'))]));
      }
    }
  };

  /* -------------------------------------------------------------- split */
  P.split = { mode: 'ranges', ranges: '1-2, 3-', every: 2, output: 'zip' };
  PANELS.split = {
    get title() { return t('pdf.tool.split.title'); }, icon: 'split', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var o = P.split, rangeIn, everyIn, preview = h('div', { class: 'split-preview' });
      var rangesBox = h('div', null, row(t('pdf.tool.split.ranges'), (rangeIn = text(o.ranges, function (v) { o.ranges = v; upd(); }, t('pdf.tool.split.ranges_ph')))), note(t('pdf.tool.split.ranges_note')));
      var everyBox = h('div', { hidden: true }, row(t('pdf.tool.split.per_file'), (everyIn = num(o.every, 1, 9999, 1, function (v) { o.every = Math.max(1, Math.round(v)); upd(); }))));
      function modeVis() { rangesBox.hidden = o.mode !== 'ranges'; everyBox.hidden = o.mode !== 'every'; }
      b.appendChild(section(t('pdf.tool.split.by'), [seg([['ranges', t('pdf.tool.split.mode_ranges')], ['every', t('pdf.tool.split.mode_every')], ['each', t('pdf.tool.split.mode_each')]], o.mode, function (v) { o.mode = v; modeVis(); upd(); }, t('pdf.tool.split.mode_aria')), rangesBox, everyBox]));
      b.appendChild(section(t('pdf.tool.split.result'), [preview]));
      b.appendChild(section(t('pdf.tool.split.download_as'), [seg([['zip', t('pdf.tool.split.out_zip')], ['files', t('pdf.tool.split.out_files')]], o.output, function (v) { o.output = v; }, t('pdf.tool.split.out_aria')),
        h('div', { class: 'btn-row' }, btn(t('pdf.tool.split.go'), 'split', function () { SP.app.split(); }, 'primary wide'))]));
      function upd() {
        preview.innerHTML = '';
        var groups;
        try { groups = P.splitGroups(); rangeIn.classList.remove('bad'); } catch (e) { rangeIn.classList.add('bad'); preview.appendChild(note(e.message, 'err')); SP.organizer.render(); return; }
        preview.appendChild(note(t('pdf.tool.split.files_n', { n: groups.length })));
        var ul = h('ol', { class: 'split-list' });
        groups.slice(0, 50).forEach(function (g, i) { ul.appendChild(h('li', null, h('b', null, t('pdf.tool.split.part', { part: String(i + 1) })), ' ' + t('pdf.tool.split.part_pages', { pages: U.describeIdx(g), n: g.length }))); });
        if (groups.length > 50) ul.appendChild(h('li', null, t('pdf.tool.split.more', { n: groups.length - 50 })));
        preview.appendChild(ul);
        SP.organizer.render();
      }
      modeVis(); upd();
      void everyIn;
    }
  };
  /** Groups of page indices for the current split settings. */
  P.splitGroups = function () {
    var o = P.split, n = E.state.pages.length;
    if (o.mode === 'each') return E.state.pages.map(function (_, i) { return [i]; });
    if (o.mode === 'every') { var out = []; for (var i = 0; i < n; i += o.every) { var g = []; for (var j = i; j < Math.min(n, i + o.every); j++) g.push(j); out.push(g); } return out; }
    return U.parseRanges(o.ranges, n);
  };

  /* ----------------------------------------------------------- metadata */
  PANELS.metadata = {
    get title() { return t('pdf.tool.meta.title'); }, icon: 'info', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var m = E.state.meta;
      function field(k, label, undo, ph) {
        return row(t(label), text(m[k], function (v) { E.commit(t(undo), function (st) { st.meta[k] = v; }, 'meta:' + k); }, ph));
      }
      b.appendChild(section(t('pdf.tool.meta.props'), [field('title', 'pdf.tool.meta.f_title', 'pdf.tool.meta.undo_title', t('pdf.tool.meta.title_ph')),
        field('author', 'pdf.tool.meta.f_author', 'pdf.tool.meta.undo_author', ''), field('subject', 'pdf.tool.meta.f_subject', 'pdf.tool.meta.undo_subject', ''),
        field('keywords', 'pdf.tool.meta.f_keywords', 'pdf.tool.meta.undo_keywords', t('pdf.tool.meta.keywords_ph'))]));
      b.appendChild(section(null, [note(t('pdf.tool.meta.note'))]));
    }
  };
})();
