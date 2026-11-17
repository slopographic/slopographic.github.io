/* Slop Press for the assistant (and Ctrl+K, macros and WebMCP): SlopCmd commands with argument schemas
   (shared/commands/args.js). Loaded on demand by SlopCmd.prepare() (ui/actions.js), after ai-build.js. All 'press.ai.*',
   hidden, one undo step each (PR.history.commit). new_document and build_document replace the open document (the
   checkpoint brings it back), so they and delete_page / delete_item are destructive. Lengths are points. */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state, M = PR.model, I = PR.items, ST = PR.story, P = PR.pages, H = PR.history, X = PR.aiPress, C = window.SlopCmd;
  var list = [];
  var Str = function (name, description, extra) { return Object.assign({ name: name, type: 'string', maxLength: 600, description: description }, extra || {}); };
  var Num = function (name, description, min, max, extra) { return Object.assign({ name: name, type: 'number', min: min, max: max, description: description }, extra || {}); };
  var PRESETS = PR.util.PRESETS.map(function (p) { return [p.id, p.name]; });
  var PAGE = Num('page', 'page number (1 = first); the current page when empty', 1, 9999, { integer: true });
  var ITEM = Str('item', 'item id or name from app_state; the selected item when empty', { maxLength: 120 });
  var BOX = [Num('x', 'left edge in pt (A4 is 595 × 842 pt)', -5000, 20000), Num('y', 'top edge in pt', -5000, 20000), Num('w', 'width in pt', 0, 20000), Num('h', 'height in pt', 0, 20000)];
  var COLOUR = function (name, d) { return Str(name, d + ': #rrggbb, cmyk(c,m,y,k), a swatch name, or none', { maxLength: 60 }); };
  var TEXT_FMT = [Str('style', 'paragraph style (Body, Heading 1, Heading 2, Caption, Pull Quote…)', { maxLength: 80 }), Str('char_style', 'character style (Emphasis, Strong…)', { maxLength: 80 }),
    { name: 'font', type: 'enum', values: PR.fonts.list() }, { name: 'font_style', type: 'enum', values: PR.fonts.STYLES }, Num('size', 'font size in pt', 1, 1000), COLOUR('color', 'text colour'),
    { name: 'align', type: 'enum', values: ['left', 'center', 'right', 'justify'] }, Num('leading', 'line spacing in pt', 1, 2000), Num('tracking', 'letter spacing in 1/1000 em', -500, 2000)];
  var DOC = [{ name: 'preset', type: 'enum', options: PRESETS, default: 'a4', description: 'page size' }, Num('width', 'page width in pt (overrides the preset)', 36, 14400), Num('height', 'page height in pt', 36, 14400),   // i18n-ignore: API for the assistant
    { name: 'landscape', type: 'boolean', default: false }, Num('pages', 'how many pages', 1, 500, { integer: true, default: 1 }), { name: 'facing', type: 'boolean', default: false, description: 'facing pages (spreads)' },   // i18n-ignore: API for the assistant
    Num('margin', 'margin on every side in pt', 0, 2000), Num('columns', 'columns', 1, 20, { integer: true }), Num('gutter', 'gutter in pt', 0, 500), Str('name', 'document name', { maxLength: 120 })];
  var ITEM_SPEC = { type: 'object', properties: { type: { type: 'string', enum: X.TYPES }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
    text: { type: 'string' }, style: { type: 'string' }, font: { type: 'string' }, size: { type: 'number' }, color: { type: 'string' }, align: { type: 'string' }, fill: { type: 'string' },
    stroke: { type: 'string' }, stroke_width: { type: 'number' }, file: { type: 'string', description: 'Slop Drive picture' }, url: { type: 'string', description: 'picture on this site' }, name: { type: 'string' } } };   // i18n-ignore: API for the assistant

  function add(tool, title, args, run, extra) {
    list.push(Object.assign({ id: 'press.ai.' + tool.replace(/_/g, '-'), tool: tool, title: title, group: 'AI', hidden: true, destructive: false, args: args,
      when: function () { return !!S.doc; }, run: function (a) { return run(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})); } }, extra || {}));
  }
  function done(label, it) { H.commit(label); if (it) PR.select([it.id]); PR.emit('page'); }
  function open(doc) { return PR.io.openDoc(doc).then(function () { PR.emit('page'); }); }

  add('new_document', 'New document', DOC, function (a) {
    var doc = M.create(X.docOptions(a));
    return open(doc).then(function () { return 'A new ' + Math.round(doc.size.w) + ' × ' + Math.round(doc.size.h) + ' pt document with ' + doc.pages.length + ' page(s) replaced the open one.'; });
  }, { destructive: true, description: 'Start a new, empty document (it replaces the open one; Undo all AI changes brings it back).' });   // i18n-ignore: API for the assistant

  add('build_document', 'Build document from a spec', DOC.concat([{ name: 'spec_pages', type: 'array', required: true, maxItems: 200,
    items: { type: 'object', properties: { items: { type: 'array', items: ITEM_SPEC } } }, description: 'the pages: [{ items: [{ type: text, text, x, y, w, h, style, size, color } | { type: image, file|url, … } | { type: rect, fill, … }] }]' }]),
  function (a) {
    var o = X.docOptions(a); o.pages = Math.max(o.pages, a.spec_pages.length);
    var doc = M.create(o), notes = [];
    return a.spec_pages.reduce(function (p, pg, pi) {
      return [].concat((pg && pg.items) || []).reduce(function (q, spec) { return q.then(function () { return X.makeItem(doc, pi, spec || {}).then(function (it) { var n = X.note(doc, it); if (n) notes.push('page ' + (pi + 1) + ' ' + X.describe(it) + ':' + n); }); }); }, p);
    }, Promise.resolve()).then(function () { return open(doc); }).then(function () {
      var n = 0; doc = S.doc; doc.pages.forEach(function (pg) { n += pg.items.length; });
      var over = []; doc.pages.forEach(function (pg, i) { pg.items.forEach(function (it) { if (it.type === 'text' && PR.engine.overset(it, i)) over.push(it.name || it.id); }); });
      return 'Built “' + doc.name + '”: ' + doc.pages.length + ' page(s), ' + n + ' item(s). ' + (over.length ? 'Warning: the text of ' + over.join(', ') + ' does not fit its frame. ' : '') + notes.join(' ');
    });
  }, { destructive: true, description: 'Make a whole layout (flyer, poster, card, magazine pages) in one step from a spec of pages and their items. It replaces the open document.' });   // i18n-ignore: API for the assistant

  add('add_page', 'Add pages', [Num('after', 'after this page number; 0 = at the start; after the current page when empty', 0, 9999, { integer: true }), Num('count', 'how many', 1, 100, { integer: true, default: 1 })],
  function (a) {
    var at = a.after == null ? S.page + 1 : Math.min(a.after, S.doc.pages.length);
    P.insertPages(S.doc, at, a.count); S.page = at; done(PR.util.t('press.edit.undo_add_pages'));
    return 'Added ' + a.count + ' page(s) after page ' + at + '; the document has ' + S.doc.pages.length + '.';
  });
  add('delete_page', 'Delete page', [Object.assign({}, PAGE, { required: true })], function (a) {
    var i = X.pageIdx(a.page);
    if (S.doc.pages.length < 2) throw new Error('A document keeps at least one page');
    P.deletePages(S.doc, [i]); S.page = Math.min(S.page, S.doc.pages.length - 1); done(PR.util.t('press.edit.undo_delete_page'));
    return 'Deleted page ' + (i + 1) + '; ' + S.doc.pages.length + ' left.';
  }, { destructive: true });

  add('add_text_frame', 'Add text frame', [PAGE, Str('text', 'the text; a line break starts a new paragraph', { maxLength: 50000, required: true })].concat(BOX, TEXT_FMT,
    [Num('columns', 'columns in the frame', 1, 20, { integer: true }), COLOUR('fill', 'frame background'), Str('name', 'item name', { maxLength: 80 })]),
  function (a) {
    var pi = X.pageIdx(a.page);
    return X.makeItem(S.doc, pi, Object.assign({}, a, { type: 'text' })).then(function (it) { S.page = pi; done(PR.util.t('press.edit.undo_add_text_frame'), it); return 'Added ' + X.describe(it) + ' on page ' + (pi + 1) + '.' + X.note(S.doc, it); });
  }, { description: 'Add a text frame with text, a paragraph style, font, size, colour and alignment.' });   // i18n-ignore: API for the assistant

  add('set_text', 'Set text', [ITEM, Str('text', 'the new text of the frame\'s story', { maxLength: 50000, required: true })], function (a) {
    var f = X.findItem(a.item), it = f.item;
    if (it.type !== 'text') throw new Error((it.name || it.id) + ' is not a text frame');
    var st = S.doc.stories[it.story]; ST.remove(st, 0, st.text.length); ST.insert(st, 0, a.text);
    done(PR.util.t('press.edit.undo_edit_text'), it);
    return 'Set the text of ' + X.describe(it) + '.' + X.note(S.doc, it);
  });

  add('format_text', 'Format text', [ITEM].concat(TEXT_FMT, [Str('match', 'format only this text (every occurrence) instead of the whole frame', { maxLength: 300 })]), function (a) {
    var f = X.findItem(a.item), it = f.item;
    if (it.type !== 'text') throw new Error((it.name || it.id) + ' is not a text frame');
    var st = S.doc.stories[it.story], n = 0;
    if (a.match) { var i = -1; while ((i = st.text.indexOf(a.match, i + 1)) >= 0) { X.formatStory(S.doc, st, a, i, i + a.match.length); n++; } if (!n) throw new Error('“' + a.match + '” is not in that frame'); }
    else X.formatStory(S.doc, st, a);
    done(PR.util.t('press.edit.undo_format_text'), it);
    return 'Formatted ' + (a.match ? n + ' × “' + a.match + '” in ' : '') + X.describe(it) + '.' + X.note(S.doc, it);
  }, { description: 'Apply a paragraph or character style, font, size, colour, alignment, leading or tracking to a frame\'s text.' });   // i18n-ignore: API for the assistant

  add('add_image', 'Add picture', [PAGE, Str('file', 'a Slop Drive picture (name or id)', { maxLength: 300 }), Str('url', 'or a picture on this site, e.g. /og-share.png', { maxLength: 500 })].concat(BOX, [Str('name', 'item name', { maxLength: 80 })]),
  function (a) {
    if (!a.file && !a.url) throw new Error('Give file (Slop Drive) or url (a picture on this site)');
    var pi = X.pageIdx(a.page);
    return X.makeItem(S.doc, pi, Object.assign({}, a, { type: 'image' })).then(function (it) { S.page = pi; done(PR.util.t('press.edit.undo_place_image'), it); return 'Placed ' + X.describe(it) + ' on page ' + (pi + 1) + '.' + X.note(S.doc, it); });
  });

  add('add_shape', 'Add shape', [PAGE, { name: 'shape', type: 'enum', values: ['rect', 'ellipse', 'line', 'polygon'], default: 'rect' }].concat(BOX, [COLOUR('fill', 'fill colour'), COLOUR('stroke', 'outline colour'),
    Num('stroke_width', 'outline width in pt', 0, 200), Num('radius', 'corner radius in pt', 0, 2000), Num('sides', 'polygon sides', 3, 64, { integer: true }), Num('rotation', 'degrees', -360, 360), Num('opacity', '0 to 100 %', 0, 100), Str('name', 'item name', { maxLength: 80 })]),
  function (a) {
    var pi = X.pageIdx(a.page);
    return X.makeItem(S.doc, pi, Object.assign({}, a, { type: a.shape })).then(function (it) { S.page = pi; done(PR.util.t('press.edit.undo_add_shape'), it); return 'Added ' + X.describe(it) + ' on page ' + (pi + 1) + '.' + X.note(S.doc, it); });
  });

  add('move_item', 'Move or resize item', [ITEM].concat(BOX, [Num('rotation', 'degrees', -360, 360), Num('opacity', '0 to 100 %', 0, 100)]), function (a) {
    var it = X.findItem(a.item).item;
    ['x', 'y', 'w', 'h'].forEach(function (k) { if (a[k] != null) it[k] = a[k]; });
    if (a.rotation != null) it.rot = a.rotation;
    if (a.opacity != null) it.opacity = a.opacity / 100;
    done(PR.util.t('press.edit.undo_move'), it);
    return 'Now ' + X.describe(it) + '.' + X.note(S.doc, it);
  });
  add('delete_item', 'Delete item', [ITEM], function (a) {
    var it = X.findItem(a.item).item; I.remove(S.doc, it.id); PR.select([]); done(PR.util.t('press.edit.undo_delete'));
    return 'Deleted ' + it.type + (it.name ? ' “' + it.name + '”' : '') + '.';
  }, { destructive: true });

  add('export_document', 'Export', [{ name: 'format', type: 'enum', values: ['pdf', 'png', 'slpress'], default: 'pdf' },
    { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },
    Object.assign({}, PAGE, { description: 'PNG: the page to export; the current page when empty' }), Num('dpi', 'PNG resolution', 36, 600, { default: 150 }), Str('name', 'file name without extension', { maxLength: 120 })],
  function (a) {
    var name = (a.name || PR.io.baseName()) + '.' + a.format;
    var make = a.format === 'pdf' ? PR.pdf.export({ marks: false, bleed: false }).then(function (b) { return new Blob([b], { type: 'application/pdf' }); })
      : a.format === 'png' ? PR.raster.pageBlob(X.pageIdx(a.page), a.dpi) : PR.io.projectBlob();
    return make.then(function (blob) {
      var out = [];
      var drive = a.to === 'download' ? Promise.resolve() : SlopCmdSources.put(blob, name, 'press').then(function (id) { out.push('Saved ' + name + ' to Slop Drive (id ' + id + ')'); });
      return drive.then(function () { if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push('downloaded ' + name); } return out.join(' and ') + '.'; });
    });
  }, { description: 'Export as PDF (every page), PNG (one page) or .slpress, to Slop Drive (other apps can open it there) and/or a download.' });   // i18n-ignore: API for the assistant

  add('undo', 'Undo', [Num('steps', 'how many', 1, 20, { integer: true, default: 1 })], function (a) { var n = 0; while (n < a.steps && H.doUndo()) n++; return 'Undid ' + n + ' step(s).'; });

  function state() {
    var d = S.doc;
    return { app: 'Slop Press', name: d.name, size: Math.round(d.size.w) + ' × ' + Math.round(d.size.h) + ' pt', facing: d.facing, pageCount: d.pages.length, currentPage: S.page + 1,
      pages: d.pages.slice(0, 40).map(function (pg, i) { return { page: i + 1, items: pg.items.slice(0, 40).map(function (it) {
        var o = { id: it.id, name: it.name || '', type: it.type, x: Math.round(it.x), y: Math.round(it.y), w: Math.round(it.w), h: Math.round(it.h) };
        if (it.type === 'text') { o.text = (d.stories[it.story] || { text: '' }).text.slice(0, 120); try { o.overset = PR.engine.overset(it, i); } catch (e) { /* not laid out */ } }
        return o; }) }; }),
      paragraphStyles: Object.keys(d.styles.para), characterStyles: Object.keys(d.styles.char), fonts: PR.fonts.list(), canUndo: H.canUndo() };
  }
  /** The document as it is now; the rollback opens it again (one more undo step when it is the same document). */
  function checkpoint() {
    var snap = JSON.stringify(PR.util.assign({}, S.doc, { assets: null })), assets = S.doc.assets;
    return function () { var d = JSON.parse(snap); d.assets = Object.assign({}, assets, S.doc.assets); PR.setDoc(d, { dirty: true }); PR.emit('page'); return true; };
  }
  C.register(list);
  C.provide({ state: state, checkpoint: checkpoint });
})();
