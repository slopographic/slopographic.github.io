/* Slop PDF for the assistant: the helpers and the page commands (SlopCmd with argument schemas, shared/commands/args.js).
   Every change is one E.commit (one undo step), through the page operations of core/model.js (E.ops, E.blankPage) and
   the file intake of ui/actions.js (A.addFiles). Loaded on demand by SlopCmd.prepare() (ui/commands.js), before
   ai-commands.js, which adds the drawing, export and state. Exposes SP.aiPdf. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, Ed = SP.editor;
  var X = SP.aiPdf = { list: [], made: [] };
  var SIZES = Object.keys(E.SIZES);

  X.add = function (tool, title, args, run, extra) {
    X.list.push(Object.assign({ id: 'pdf.ai.' + tool.replace(/_/g, '-'), tool: tool, title: title, group: 'AI', hidden: true, destructive: false, args: args,
      run: function (a) { return run(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})); } }, extra || {}));
  };
  X.Str = function (name, description, extra) { return Object.assign({ name: name, type: 'string', maxLength: 500, description: description }, extra || {}); };
  X.Num = function (name, description, min, max, extra) { return Object.assign({ name: name, type: 'number', min: min, max: max, description: description }, extra || {}); };
  X.PAGE = X.Num('page', 'page number (1 = first); the page on screen, else page 1, when empty', 1, 100000, { integer: true });
  X.PAGES = { name: 'pages', type: 'array', maxItems: 5000, items: { type: 'integer' }, description: 'page numbers, e.g. [1, 3]; every page when empty' };

  X.need = function () { if (!E.state.pages.length) throw new Error('No PDF is open: use new_document or open one first'); };
  /** The page for a 1-based number (the one on screen when empty) and its index. */
  X.page = function (n) {
    X.need();
    var i = n == null ? (Ed && Ed.pid && A.mode === 'page' ? E.indexOf(Ed.pid) : 0) : n - 1;
    if (i < 0 || i >= E.state.pages.length) throw new Error('There is no page ' + n + ' (the document has ' + E.state.pages.length + ')');
    return { p: E.state.pages[i], i: i };
  };
  X.ids = function (nums) {
    X.need();
    if (!nums || !nums.length) return E.state.pages.map(function (p) { return p.id; });
    return nums.map(function (n) { return X.page(Math.round(n)).p.id; });
  };
  /** A blank page size in points from a size name (and landscape) or width/height. */
  X.size = function (a) {
    var s = E.SIZES[a.size] || E.SIZES.a4, w = a.width || s[0], h = a.height || s[1];
    if (a.landscape && h > w) { var t = w; w = h; h = t; }
    return [U.round(w, 2), U.round(h, 2)];
  };
  /** A sentence about where a rect (view space, points) lands, with a warning when part of it is off the page. */
  X.where = function (p, r, what) {
    var vs = E.viewSize(p), s = ' It is at ' + Math.round(r.x) + ', ' + Math.round(r.y) + ', ' + Math.round(r.w) + ' × ' + Math.round(r.h) + ' pt on a ' + Math.round(vs.w) + ' × ' + Math.round(vs.h) + ' pt page.';
    var cut = [];
    if (r.x < 0) cut.push(Math.round(-r.x) + ' pt off the left');
    if (r.x + r.w > vs.w) cut.push(Math.round(r.x + r.w - vs.w) + ' pt off the right');
    if (r.y < 0) cut.push(Math.round(-r.y) + ' pt off the top');
    if (r.y + r.h > vs.h) cut.push(Math.round(r.y + r.h - vs.h) + ' pt off the bottom');
    return s + (cut.length ? ' Warning: ' + what + ' runs past the page (' + cut.join(', ') + '); it is cut off there.' : '');
  };
  X.fileOf = async function (q) {
    var rec = await SlopCmdSources.driveFile(q);
    return new File([rec.blob], rec.name, { type: rec.type || rec.blob.type || 'application/pdf' });
  };

  X.add('new_document', 'New PDF', [{ name: 'size', type: 'enum', values: SIZES, default: 'a4' }, { name: 'landscape', type: 'boolean', default: false },
    X.Num('width', 'custom width in points (72 = 1 inch)', 36, 14400), X.Num('height', 'custom height in points', 36, 14400),
    X.Num('pages', 'how many blank pages', 1, 500, { integer: true, default: 1 }), X.Str('title', 'document title', { maxLength: 200 })],
  async function (a) {
    await E.libs();
    if (E.state.pages.length) { A.newTab(); X.made.push(SP.tabs && SP.tabs.current ? SP.tabs.current() : null); }
    var sz = X.size(a), pages = [];
    for (var i = 0; i < a.pages; i++) pages.push(E.blankPage(sz[0], sz[1]));
    E.commit(U.t('pdf.cmd.undo_new_document'), function (st) { E.ops.insert(st, 0, pages); if (a.title) st.meta = Object.assign({}, st.meta, { title: a.title }); });
    return 'A new PDF with ' + a.pages + ' blank page' + (a.pages === 1 ? '' : 's') + ' of ' + sz[0] + ' × ' + sz[1] + ' pt.';
  }, { description: 'Start a new PDF of blank pages (in a new tab when one is already open).' });

  X.add('add_pages', 'Add blank pages', [X.Num('after', 'after this page number; 0 = first; at the end when empty', 0, 100000, { integer: true }),
    X.Num('count', 'how many', 1, 500, { integer: true, default: 1 }), { name: 'size', type: 'enum', values: SIZES.concat(['same']), default: 'same' }, { name: 'landscape', type: 'boolean', default: false }],
  function (a) {
    X.need();
    var n = E.state.pages.length, at = a.after == null ? n : Math.min(a.after, n), sz;
    if (a.size === 'same') { var nb = E.state.pages[Math.max(0, at - 1)], vs = E.viewSize(nb); sz = [vs.w, vs.h]; } else sz = X.size(a);
    var pages = []; for (var i = 0; i < a.count; i++) pages.push(E.blankPage(sz[0], sz[1]));
    E.commit(U.t('pdf.cmd.undo_insert_blank'), function (st) { E.ops.insert(st, at, pages); });
    return 'Added ' + a.count + ' blank page' + (a.count === 1 ? '' : 's') + ' from page ' + (at + 1) + '; the document has ' + E.state.pages.length + '.';
  });

  X.add('insert_pdf', 'Insert pages from another PDF', [X.Str('file', 'a Slop Drive PDF (name or id)', { required: true, maxLength: 300 }),
    X.Num('after', 'after this page number; 0 = first; at the end when empty', 0, 100000, { integer: true })],
  async function (a) {
    var n = E.state.pages.length, before = n, file = await X.fileOf(a.file);
    await A.addFiles([file], { at: a.after == null ? n : Math.min(a.after, n) });
    var added = E.state.pages.length - before;
    if (!added) throw new Error(file.name + ' added no pages');
    return 'Added the ' + added + ' page' + (added === 1 ? '' : 's') + ' of ' + file.name + '; the document has ' + E.state.pages.length + '.';
  }, { description: 'Merge: put the pages of a PDF from Slop Drive into this one.' });

  X.add('delete_pages', 'Delete pages', [Object.assign({}, X.PAGES, { required: true })], function (a) {
    var ids = X.ids(a.pages);
    if (ids.length >= E.state.pages.length) throw new Error('That would delete every page; keep at least one');
    E.commit(U.t('pdf.cmd.undo_delete_pages'), function (st) { E.ops.remove(st, ids); });
    return 'Deleted ' + ids.length + ' page' + (ids.length === 1 ? '' : 's') + '; ' + E.state.pages.length + ' left.';
  }, { destructive: true });

  X.add('rotate_pages', 'Rotate pages', [X.PAGES, { name: 'angle', type: 'enum', values: ['90', '180', '270', '-90'], default: '90', description: 'clockwise degrees' }], function (a) {
    var ids = X.ids(a.pages);
    E.commit(U.t('pdf.cmd.undo_rotate_pages'), function (st) { E.ops.rotate(st, ids, Number(a.angle)); });
    return 'Rotated ' + ids.length + ' page' + (ids.length === 1 ? '' : 's') + ' by ' + a.angle + '°.';
  });

  X.add('move_page', 'Move a page', [Object.assign({}, X.PAGE, { required: true }), X.Num('to', 'its new page number', 1, 100000, { integer: true, required: true })], function (a) {
    var t = X.page(a.page), to = Math.min(a.to, E.state.pages.length) - 1, id = t.p.id;
    E.commit(U.t('pdf.cmd.undo_move_pages'), function (st) { E.ops.move(st, [id], to > t.i ? to + 1 : to); });
    return 'Page ' + a.page + ' is now page ' + (E.indexOf(id) + 1) + '.';
  });
})();
