/* Slop PDF for the assistant and macros: the page's own objects (pdf.objects.*: list, move, resize, rotate, arrange,
   duplicate, delete, replace an image) and Extract all (pdf.extract.*: list what is stored, save it). The same code as
   Objects mode (editor/obj-*.js: one content rewrite, one undo step each) and File ▸ Extract all (ui/assets.js,
   io/extract-more.js). Positions are points from the top-left of the page as shown. Loaded on demand after ai-commands.js.
   Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, Ed = SP.editor, X = SP.aiPdf, C = window.SlopCmd;
  var O = Ed._.obj, N = O.act, Mv = window.SlopPdfMove, Num = X.Num, Str = X.Str, list = [];
  var OBJ = Str('object', 'the object id from list_page_objects, e.g. image:12', { required: true, maxLength: 60 });

  function add(tool, id, title, args, run, extra) {
    list.push(Object.assign({ id: id, tool: tool, title: title, group: 'AI', hidden: true, destructive: false, args: args,
      run: function (a) { return run(a || SlopCmdArgs.defaults(args)); } }, extra || {}));
  }
  /** The object's box as shown on the page (view space, points): { x, y, w, h }. */
  function viewRect(p, o) {
    var g = E.geom(p), R = E.rotation(p), q = O.quad(p, o).map(function (v) { return E.toView(R, g.W, g.H, v[0], v[1]); });
    var xs = q.map(function (v) { return v[0]; }), ys = q.map(function (v) { return v[1]; }), x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  }
  function describe(p, o) {
    var r = viewRect(p, o), round = function (v) { return Math.round(v * 10) / 10; };
    return { id: o.id, kind: o.kind, name: O.name(o), resource: o.name || null, layer: o.oc || null, x: round(r.x), y: round(r.y), width: round(r.w), height: round(r.h), pixels: o.w ? o.w + '×' + o.h : null };
  }
  async function target(a) {
    var t = X.page(a.page), l = await O.load(t.p), o = l.filter(function (x) { return x.id === a.object; })[0];
    if (!o) throw new Error('There is no object ' + a.object + ' on page ' + (t.i + 1) + ': list_page_objects lists them');
    return { p: t.p, o: o, i: t.i };
  }
  /** A view-space change as a page-space matrix. */
  function pageT(p, f) {
    var g = E.geom(p), R = E.rotation(p), at = function (x, y) { return E.toPage(R, g.W, g.H, x, y); };
    var o = at(0, 0), ex = at(1, 0), ey = at(0, 1), A = [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]]; // view → page
    var Ob = window.SlopPdfObjs;
    return Ob.mul(Ob.mul(Ob.inv(A), f), A);
  }
  function done(t, now, verb) {
    if (!now) throw new Error('The object could not be changed');
    var o = now === true ? null : now;
    return verb + ' on page ' + (t.i + 1) + '.' + (o ? ' It is now ' + o.id + ' at ' + JSON.stringify(describe(t.p, o)) + '.' : '');
  }

  add('list_page_objects', 'pdf.objects.list', 'List the objects on a page', [X.PAGE], async function (a) {
    var t = X.page(a.page), l = await O.load(t.p);
    return { page: t.i + 1, objects: l.map(function (o) { return describe(t.p, o); }) };
  }, { description: 'The images, inline images, placed artwork (forms) and vector drawings a page paints, with ids and boxes.' });
  add('move_page_object', 'pdf.objects.move', 'Move an object on the page', [X.PAGE, OBJ, Num('x', 'new left edge, points from the left', -14400, 14400), Num('y', 'new top edge, points from the top', -14400, 14400),
    Num('dx', 'or move right by (points)', -14400, 14400), Num('dy', 'or move down by (points)', -14400, 14400)], async function (a) {
    var t = await target(a), r = viewRect(t.p, t.o), dx = a.x != null ? a.x - r.x : a.dx || 0, dy = a.y != null ? a.y - r.y : a.dy || 0;
    return done(t, await O.apply(t.p, t.o, pageT(t.p, Mv.move(dx, dy)), 'Move '), 'Moved ' + t.o.id);
  });
  add('resize_page_object', 'pdf.objects.resize', 'Resize an object', [X.PAGE, OBJ, Num('width', 'new width in points', 1, 14400), Num('height', 'new height in points (empty: keep the shape)', 1, 14400)], async function (a) {
    var t = await target(a), r = viewRect(t.p, t.o), sx = a.width ? a.width / r.w : a.height / r.h, sy = a.height ? a.height / r.h : sx;
    if (!isFinite(sx) || !isFinite(sy)) throw new Error('Give a width or a height');
    return done(t, await O.apply(t.p, t.o, pageT(t.p, Mv.scaleAbout(sx, sy, r.x, r.y)), 'Resize '), 'Resized ' + t.o.id);
  });
  add('rotate_page_object', 'pdf.objects.rotate', 'Turn an object', [X.PAGE, OBJ, Num('degrees', 'clockwise, about its centre', -360, 360, { default: 90 })], async function (a) {
    var t = await target(a), r = viewRect(t.p, t.o);
    return done(t, await O.apply(t.p, t.o, pageT(t.p, Mv.rotateAbout(a.degrees, r.x + r.w / 2, r.y + r.h / 2)), 'Turn '), 'Turned ' + t.o.id);
  });
  add('arrange_page_object', 'pdf.objects.arrange', 'Bring an object forward or send it back', [X.PAGE, OBJ, { name: 'to', type: 'enum', values: ['front', 'forward', 'backward', 'back'], default: 'front' }], async function (a) {
    var t = await target(a); return done(t, await N.order(a.to, t), 'Arranged ' + t.o.id);
  });
  add('duplicate_page_object', 'pdf.objects.duplicate', 'Duplicate an object', [X.PAGE, OBJ], async function (a) {
    var t = await target(a); return done(t, await N.duplicate(t), 'Duplicated ' + t.o.id);
  });
  add('delete_page_object', 'pdf.objects.delete', 'Delete an object from the page', [X.PAGE, OBJ], async function (a) {
    var t = await target(a); if (!(await N.remove(t))) throw new Error('The object could not be deleted'); return 'Deleted ' + t.o.id + ' from page ' + (t.i + 1) + '.';
  }, { destructive: true });
  add('replace_page_image', 'pdf.objects.replace', 'Replace an image, keeping its place', [X.PAGE, OBJ, Str('file', 'a Slop Drive picture (name or id)', { maxLength: 300 }), Str('url', 'or a picture on this site', { maxLength: 500 })], async function (a) {
    var t = await target(a), pic = await SlopCmdSources.picture({ file: a.file, url: a.url });
    return done(t, await N.replaceWith(new File([pic.blob], pic.name, { type: pic.blob.type }), t), 'Replaced ' + t.o.id + ' with ' + pic.name);
  });

  var PARTS = ['images', 'attachments', 'fonts', 'text', 'pages'];
  add('list_pdf_contents', 'pdf.extract.list', 'List what the PDF stores', [], async function () {
    X.need(); await E.libs();
    var f = await SP.assets.findAll();
    return { images: f.images.map(function (i) { return { name: i.name, size: i.width + '×' + i.height, pages: i.pages, saved_as: i.kind === 'skip' ? 'skipped: ' + i.reason : i.ext }; }),
      inline_images: f.inline.length, attachments: f.attachments.map(function (x) { return { name: x.name, type: x.mime, bytes: x.size, einvoice: !!x.einvoice }; }),
      fonts: f.fonts.map(function (x) { return { name: x.name, type: x.type, embedded: x.embedded }; }) };
  }, { description: 'The stored images, embedded files (attachments, e-invoices) and fonts of the open PDF.' });
  add('export_pdf_contents', 'pdf.extract.save', 'Extract files from the PDF', [{ name: 'parts', type: 'array', maxItems: 5, items: { type: 'enum', values: PARTS }, description: 'what to extract; all of it when empty' },
    { name: 'text_format', type: 'enum', values: ['txt', 'md', 'both'], default: 'txt' }, { name: 'page_format', type: 'enum', values: ['png', 'svg'], default: 'png' },
    { name: 'to', type: 'enum', values: ['drive', 'download'], default: 'drive', description: 'Slop Drive (a folder named after the PDF) or a download' }, { name: 'zip', type: 'boolean', default: true }], async function (a) {
    X.need(); await E.libs();
    var want = a.parts && a.parts.length ? a.parts : PARTS, f = await SP.assets.findAll(), on = function (k) { return want.indexOf(k) >= 0; };
    var ok = function (l) { return l.filter(function (x) { return x.kind !== 'skip' && x.embedded !== false && x.bytes !== null; }); };
    var out = await SP.assets.collect({ images: on('images') ? ok(f.images) : [], inline: on('images') ? f.inline : [], attachments: on('attachments') ? f.attachments : [],
      fonts: on('fonts') ? f.fonts.filter(function (x) { return x.embedded; }) : [], text: on('text') ? a.text_format : '', pages: on('pages') ? a.page_format : '', dpi: 150 });
    if (!out.entries.length) return 'Nothing to extract.';
    var base = SP.assets.baseName(), zipName = base + '-assets.zip';
    if (a.to === 'drive' && window.SlopHub && !SP.offline) await SP.assets.saveToDrive(out.entries, zipName, base, a.zip !== false);
    else await SP.assets.download(out.entries, zipName, a.zip !== false);
    return 'Extracted ' + out.entries.length + ' file' + (out.entries.length === 1 ? '' : 's') + (a.to === 'drive' ? ' to Slop Drive (folder ' + base + ')' : '') + '.' + (out.skipped.length ? ' Skipped: ' + out.skipped.map(function (s) { return s.name; }).join(', ') + '.' : '');
  }, { description: 'Save the PDF\'s images, attachments, fonts, text and page pictures, as a ZIP or one file each.' });

  C.register(list);
})();
