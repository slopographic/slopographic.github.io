/* Slop PDF for the assistant: text, shapes, highlights, pictures, form fields, metadata, export and undo, as SlopCmd
   commands with argument schemas, plus the state summary and the checkpoint. Everything is the editor's own annotation
   kinds (core/model.js: text, rect, ellipse, line, arrow, hlbox, whiteout, image), drawn and exported by the same code
   as the tools (io/export.js E.build), one E.commit each. Positions are points from the page's top-left as it is shown.
   Loaded on demand after ai-pages.js (SP.aiPdf). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, H = SP.history, X = SP.aiPdf, C = window.SlopCmd;
  var add = X.add, Str = X.Str, Num = X.Num;
  var COLOR = function (name, description, def) { return { name: name, type: 'color', default: def, description: description }; };
  var BOX = [Num('x', 'left edge, points from the left of the page', -14400, 14400), Num('y', 'top edge, points from the top', -14400, 14400),
    Num('width', 'points', 1, 14400), Num('height', 'points', 1, 14400)];

  /** Puts annotation a on page t.p with its view rect r, in one step; returns the sentence about where it landed. */
  function place(t, a, r, label, what) {
    var g = E.geom(t.p), R = E.rotation(t.p), id = t.p.id;
    a.id = U.uid('a');
    if (E.isBox(a)) { a.rot = R; E.setAnnotViewRect(a, r, R, g.W, g.H); }
    E.commit(label, function (st) { st.pages.filter(function (p) { return p.id === id; })[0].annots.push(a); });
    return X.where(t.p, r, what);
  }

  add('add_text', 'Add text', [X.PAGE, Str('text', 'the words; a line break starts a new line', { required: true, maxLength: 5000 }),
    Num('x', 'left edge in points', -14400, 14400, { default: 72 }), Num('y', 'top edge in points', -14400, 14400, { default: 72 }),
    Num('size', 'font size in points', 4, 400, { default: 16 }), { name: 'font', type: 'enum', values: ['Helvetica', 'Times', 'Courier'], default: 'Helvetica' },
    { name: 'bold', type: 'boolean', default: false }, { name: 'italic', type: 'boolean', default: false }, COLOR('color', 'text colour', '#111111')],
  async function (a) {
    await E.libs();
    var t = X.page(a.page);
    var an = { type: 'text', text: a.text, font: a.font, bold: a.bold, italic: a.italic, size: a.size, color: a.color, opacity: 1 }, L = E.textLayout(an);
    return 'Added the text on page ' + (t.i + 1) + '.' + place(t, an, { x: a.x, y: a.y, w: L.w, h: L.h }, U.t('pdf.cmd.undo_add_text'), 'the text');
  }, { description: 'Write text on a page (a text box in Helvetica, Times or Courier), as the Text tool does.' });

  var KINDS = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', highlight: 'Highlight box', whiteout: 'Whiteout' };
  add('add_shape', 'Add a shape or highlight', [X.PAGE, { name: 'kind', type: 'enum', values: Object.keys(KINDS), default: 'rect', description: 'highlight is a see-through box; whiteout covers what is under it' }].concat(BOX,
    [COLOR('color', 'outline or line colour', '#e0245e'), { name: 'fill', type: 'string', maxLength: 40, description: 'fill colour, or none' }, Num('line_width', 'points', 0, 100, { default: 2.5 }),
      Num('opacity', '0 to 1', 0, 1)]),
  function (a) {
    var t = X.page(a.page), vs = E.viewSize(t.p);
    var r = { x: a.x == null ? 72 : a.x, y: a.y == null ? 72 : a.y, w: a.width || vs.w / 3, h: a.height || (a.kind === 'line' || a.kind === 'arrow' ? 0 : vs.h / 6) };
    var fill = a.fill && a.fill !== 'none' ? SlopCmdArgs.toColor(a.fill) : null;
    if (a.fill && a.fill !== 'none' && !fill) throw new Error('“' + a.fill + '” is not a colour');
    var an;
    if (a.kind === 'line' || a.kind === 'arrow') {
      var g = E.geom(t.p), R = E.rotation(t.p);
      an = { type: a.kind, color: a.color, width: a.line_width, opacity: a.opacity == null ? 1 : a.opacity,
        pts: [E.toPage(R, g.W, g.H, r.x, r.y), E.toPage(R, g.W, g.H, r.x + r.w, r.y + r.h)] };
      var b = { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
      return 'Added a ' + a.kind + ' on page ' + (t.i + 1) + '.' + place(t, an, b, U.t('pdf.cmd.undo_add_kind', { kind: a.kind }), 'the ' + a.kind);
    }
    if (a.kind === 'highlight') an = { type: 'hlbox', fill: fill || '#ffe14d', opacity: a.opacity == null ? 0.4 : a.opacity };
    else if (a.kind === 'whiteout') an = { type: 'whiteout', fill: fill || '#ffffff', opacity: 1 };
    else an = { type: a.kind, color: a.color, width: a.line_width, fill: fill || 'none', opacity: a.opacity == null ? 1 : a.opacity };
    return 'Added a ' + KINDS[a.kind].toLowerCase() + ' on page ' + (t.i + 1) + '.' + place(t, an, r, U.t('pdf.cmd.undo_add_kind', { kind: an.type }), 'the shape');
  }, { description: 'Draw a rectangle, ellipse, line, arrow, see-through highlight box or whiteout on a page.' });

  add('add_image', 'Add a picture', [X.PAGE, Str('file', 'a Slop Drive picture (name or id)', { maxLength: 300 }), Str('url', 'or a picture on this site, e.g. /og-share.png', { maxLength: 500 })].concat(BOX),
  async function (a) {
    await E.libs();
    var t = X.page(a.page), pic = await SlopCmdSources.picture({ file: a.file, url: a.url });
    var im = await E.prepareImage(new Uint8Array(await pic.blob.arrayBuffer()));
    var asset = E.addAsset({ mime: im.mime, url: U.bytesToDataURL(im.bytes, im.mime), w: im.w, h: im.h, name: pic.name });
    var vs = E.viewSize(t.p), w = a.width || (a.height ? a.height * im.w / im.h : Math.min(vs.w * 0.45, im.w * 0.75)), h = a.height || w * im.h / im.w;
    var r = { x: a.x == null ? (vs.w - w) / 2 : a.x, y: a.y == null ? (vs.h - h) / 2 : a.y, w: w, h: h };
    return 'Added ' + pic.name + ' on page ' + (t.i + 1) + '.' + place(t, { type: 'image', asset: asset.id, opacity: 1 }, r, U.t('pdf.cmd.undo_add_image'), 'the picture');
  }, { description: 'Put a picture from Slop Drive or this site on a page.' });

  add('fill_form_field', 'Fill a form field', [Str('name', 'the field name (app_state lists them)', { required: true, maxLength: 300 }), Str('value', 'the text, the choice, or true/false for a checkbox', { maxLength: 5000, default: '' }),
    { name: 'flatten', type: 'boolean', description: 'make the whole form fixed text when exported' }],
  async function (a) {
    X.need();
    for (var f of E.files.values()) {
      var fld = (await E.loadFields(f)).filter(function (x) { return x.name === a.name; })[0];
      if (!fld) continue;
      if (fld.readOnly) throw new Error('The field “' + a.name + '” is read-only');
      var v = fld.type === 'checkbox' ? /^(true|yes|on|1|x)$/i.test(a.value) : String(a.value);
      if (fld.options && fld.type !== 'checkbox') { var hit = fld.options.map(function (o) { return Array.isArray(o) ? o[0] : o; }).filter(function (o) { return String(o).toLowerCase() === String(v).toLowerCase(); })[0]; if (hit == null) throw new Error('“' + a.value + '” is not a choice of “' + a.name + '”'); v = hit; }
      E.commit(U.t('pdf.cmd.undo_fill_field', { name: a.name }), function (st) { st.forms[f.id] = Object.assign({}, st.forms[f.id] || {}); st.forms[f.id][a.name] = v; if (a.flatten != null) st.flattenForms = !!a.flatten; });
      return 'Filled “' + a.name + '” with ' + JSON.stringify(v) + '.';
    }
    throw new Error('No form field “' + a.name + '”');
  });

  add('set_metadata', 'Set the document info', [Str('title', 'title', { maxLength: 300 }), Str('author', 'author', { maxLength: 300 }), Str('subject', 'subject', { maxLength: 300 }), Str('keywords', 'keywords, comma separated', { maxLength: 500 })],
  function (a) {
    X.need();
    var m = {}; ['title', 'author', 'subject', 'keywords'].forEach(function (k) { if (a[k] != null) m[k] = a[k]; });
    if (!Object.keys(m).length) throw new Error('Give title, author, subject or keywords');
    E.commit(U.t('pdf.cmd.undo_document_info'), function (st) { st.meta = Object.assign({}, st.meta, m); });
    if (A.paintMeta) A.paintMeta();
    return 'Set ' + Object.keys(m).join(', ') + '.';
  });

  add('export_pdf', 'Save the PDF', [{ name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }, Str('name', 'file name without .pdf; the name in the top bar when empty', { maxLength: 120 })],
  async function (a) {
    X.need();
    var n = E.state.pages.length, bytes = await E.build({});
    await E.validate(bytes, n);
    var field = document.getElementById('fileName'), base = a.name || (field && field.value ? field.value.replace(/\.pdf$/i, '') : 'document');
    var name = base + '.pdf', blob = new Blob([bytes], { type: 'application/pdf' }), out = [];
    if (a.to !== 'download') out.push('Saved ' + name + ' to Slop Drive (id ' + (await SlopCmdSources.put(blob, name, 'pdf')) + ')');
    if (a.to !== 'drive') { var l = U.h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(l); l.click(); l.remove(); out.push('downloaded ' + name); }
    return out.join(' and ') + ' (' + n + ' page' + (n === 1 ? '' : 's') + ').';
  }, { description: 'Write the PDF with every change (the same file as Download) to Slop Drive and/or a download.' });

  add('undo', 'Undo', [Num('steps', 'how many', 1, 50, { integer: true, default: 1 })], function (a) {
    var k = 0; while (k < a.steps && A.undo()) k++;
    return 'Undid ' + k + ' step' + (k === 1 ? '' : 's') + '.';
  });

  function state() {
    var st = E.state, fields = [];
    E.files.forEach(function (f) { (f.fields || []).forEach(function (x) { fields.push({ name: x.name, type: x.type, value: (st.forms[f.id] || {})[x.name] != null ? st.forms[f.id][x.name] : x.value, options: x.options }); }); });
    return { app: 'Slop PDF', pages: st.pages.length, meta: st.meta, files: Array.from(E.files.values()).map(function (f) { return f.name; }),
      currentPage: A.mode === 'page' && SP.editor.pid ? E.indexOf(SP.editor.pid) + 1 : null, canUndo: E.canUndo(), formFields: fields.slice(0, 80),
      pageList: st.pages.slice(0, 60).map(function (p, i) { var vs = E.viewSize(p); return { page: i + 1, width: Math.round(vs.w), height: Math.round(vs.h), rotation: E.rotation(p), blank: !!p.blank,
        additions: (p.annots || []).map(function (an) { return an.type + (an.text ? ': ' + an.text.slice(0, 40) : ''); }).slice(0, 20) }; }) };
  }
  /** The open tab and its history depth; the rollback closes tabs the assistant opened and undoes back to that depth. */
  function checkpoint() {
    var key = H.stackKey(), depth = H.depth(key), made = X.made.length;
    return function () {
      var api = SP.tabs && SP.tabs.api && SP.tabs.api();
      X.made.splice(made).forEach(function (doc) { if (api && doc) { try { api.close(doc); } catch (e) { /* the person keeps it */ } } });
      if (H.stackKey() !== key) return false;
      H.goTo(Math.min(depth, H.depth(key)));
      return true;
    };
  }
  C.register(X.list);
  C.provide({ state: state, checkpoint: checkpoint });
})();
