/* SlopLabel for the assistant (and Ctrl+K, macros and WebMCP): SlopCmd commands with argument schemas
 * (shared/commands/args.js). Loaded on demand by SlopCmd.prepare() (ui/commands.js), with ai-files.js after it. Every edit
 * goes through the app's own model and history (makeObject, addObject, commit, applySymbology, docFromConfig, openDocTab),
 * so it is one undo step. Lengths are millimetres from the label's top-left corner. Only delete_object is destructive.
 * Exposes window.LabelAI = { list, add, made, findObj, edgeNote, state, checkpoint }. */
'use strict';

(function () {
  if (!window.SlopCmd || !SlopCmd.register) return;
  const list = [], made = [];
  const N = (name, min, max, def, description, extra) => Object.assign({ name, type: 'number', min, max, default: def, description }, extra);
  const E = (name, values, def, description) => ({ name, type: 'enum', values, default: def, description });
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 300, description }, extra);
  const B = (name, description, def) => ({ name, type: 'boolean', default: def, description });
  const add = (tool, title, args, run, extra) => list.push(Object.assign({ id: 'label.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, args,
    when: () => !!App.doc && !inFormMode(), run: (a) => run(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})) }, extra));
  const XY = [N('x', -1000, 2000, undefined, 'left edge in mm from the label\'s left'), N('y', -1000, 2000, undefined, 'top edge in mm from the label\'s top')];
  const WH = [N('w', 0.5, 2000, undefined, 'width in mm'), N('h', 0, 2000, undefined, 'height in mm')];
  const FONT_IDS = Object.keys(FONTS);

  /** An object by id or name, or the single selected object. */
  function findObj(q) {
    if (q) {
      const s = String(q).toLowerCase(), o = objById(q) || App.doc.objects.find((x) => String(x.name).toLowerCase() === s);
      if (!o) throw new Error(`No object “${q}”. Objects: ${App.doc.objects.map((x) => x.name).join(', ') || 'none'}`);
      return o;
    }
    const one = selOne();
    if (!one) throw new Error('Name the object (object: name or id from the app state), or select one');
    return one;
  }
  /** Where an object sits, and a plain warning when it runs past the label's edge. */
  function edgeNote(o) {
    App.stale = true;
    const b = boxOf(o), L = App.doc.label, f = (v) => Math.round(v * 10) / 10;
    let s = ` It is ${f(b.w)} × ${f(b.h)} mm at ${f(b.x)}, ${f(b.y)} on the ${f(L.w)} × ${f(L.h)} mm label.`;
    const cut = [b.x < -0.05 ? `${f(-b.x)} mm past the left edge` : '', b.x + b.w > L.w + 0.05 ? `${f(b.x + b.w - L.w)} mm past the right edge` : '',
      b.y < -0.05 ? `${f(-b.y)} mm past the top` : '', b.y + b.h > L.h + 0.05 ? `${f(b.y + b.h - L.h)} mm past the bottom` : ''].filter(Boolean);
    if (cut.length) s += ` Warning: it runs ${cut.join(' and ')}, so that part will not print. Move it, make it smaller, or use fit: true.`;
    return s;
  }
  /** fit: the object is shrunk (keeping its shape) and moved so it lies inside the label. */
  function fitInside(o) {
    const L = App.doc.label, b = boxOf(o), k = Math.min(1, L.w / Math.max(0.1, b.w), L.h / Math.max(0.1, b.h));
    if (k < 1) { if (o.size) o.size = Math.max(o.minSize || 2, Math.floor(o.size * k * 10) / 10); o.w = round(o.w * k); o.h = round(o.h * k); if (o.barHeight) o.barHeight = round(o.barHeight * k); if (o.module) o.module = Math.max(0.1, round(o.module * k, 3)); }
    syncAutoSize(App.doc, o, previewGet()); App.stale = true;
    const c = boxOf(o);
    o.x = round(Math.max(0, Math.min(L.w - c.w, o.x))); o.y = round(Math.max(0, Math.min(L.h - c.h, o.y)));
  }
  function place(o, a, label) {
    const L = App.doc.label;
    if (a.x == null) o.x = round(Math.max(0, (L.w - o.w) / 2)); if (a.y == null) o.y = round(Math.max(0, (L.h - (o.h || 0)) / 2));
    App.doc.objects.push(o); syncAutoSize(App.doc, o, previewGet());
    if (a.fit) fitInside(o);
    App.sel = [o.id]; App.tab = 'props';
    commit(label);
    return o;
  }
  const pick = (a, keys) => { const o = {}; for (const k of keys) if (a[k] != null && a[k] !== '') o[k] = a[k]; return o; };

  add('new_label', 'New label', [E('preset', PRESETS.map((p) => p.id), undefined, 'a built-in size or sheet (Avery sheets, 4×6 shipping, address, product, round); or give width and height'),
    N('width', 1, 2000, undefined, 'label width in mm'), N('height', 1, 2000, undefined, 'label height in mm'), N('radius', 0, 500, 0, 'corner radius in mm'),
    E('stock', STOCKS.map((s) => s.id), undefined, 'or a label stock from the library (thermal rolls, Avery and Herma sheets)'), S('name', 'the label name', { default: 'Untitled label', maxLength: 120 })],
  (a) => {
    let d;
    if (a.preset) d = docFromConfig(presetById(a.preset).body, a.name);
    else if (a.stock) d = newDoc({ stock: stockById(a.stock), name: a.name });
    else d = newDoc({ name: a.name, stock: { id: 'custom', name: 'Custom', kind: 'roll', w: a.width || 50, h: a.height || 30, gap: 3, radius: a.radius || 0, group: null } });
    d.name = String(a.name || d.name).slice(0, 120);
    made.push(openDocTab(d, { label: 'New label', dirty: true }));
    const st = App.doc.stock;
    return `Opened a new ${round(App.doc.label.w, 1)} × ${round(App.doc.label.h, 1)} mm label “${App.doc.name}” in a new tab` + (st.kind === 'sheet' ? ` (${st.cols} × ${st.rows} per sheet).` : '.');
  }, { description: 'Start a new label in a new tab: a preset, a stock from the library, or a width and height in mm.' });

  add('add_text', 'Add text', [S('text', 'the words; {Column} puts in a data field, \\n starts a new line', { required: true, maxLength: 2000 })].concat(XY,
    [E('font', FONT_IDS, 'sans'), N('size', 2, 400, 12, 'points'), B('bold', '', false), B('italic', '', false), E('align', ['left', 'center', 'right'], 'left'),
      N('rotation', -360, 360, 0, 'degrees (0, 90, 180, 270 print best)'), N('w', 1, 2000, undefined, 'wrap the text in a box this wide (mm)'), S('color', 'black or white (thermal printers print black)', { maxLength: 20, default: 'black' }),
      B('fit', 'shrink and move it so it stays on the label', false), S('name', 'object name', { maxLength: 80 })]),
  (a) => {
    const wrap = a.w != null;
    const o = makeObject(wrap ? 'para' : 'text', Object.assign(styleProps(App.doc, 'text'), { content: a.text.replace(/\\n/g, '\n'), font: a.font, size: a.size, bold: a.bold, italic: a.italic, align: a.align, rot: a.rotation, color: a.color },
      pick(a, ['x', 'y', 'w', 'name'])));
    if (wrap) { o.h = Math.max(o.h, a.size * 0.3528 * 1.3 * Math.max(1, a.text.split('\n').length)); o.shrink = true; }
    place(o, a, 'Add text');
    return `Added the text “${a.text.slice(0, 40)}” (id ${o.id}).` + edgeNote(o);
  }, { description: 'Add a line (or a wrapped box) of text: font, size, bold, alignment and rotation.' });

  add('add_barcode', 'Add barcode', [S('value', 'what it encodes; {Column} uses a data field', { required: true, maxLength: 2000 }),
    E('type', SYMBOLOGIES.map((s) => s.id), 'code128', 'symbology: code128, ean13, upca, qrcode, datamatrix, gs1-128, pdf417…')].concat(XY, WH,
    [E('text', ['below', 'above', 'none'], undefined, 'human-readable text (1D codes)'), N('module', 0.1, 5, undefined, 'narrowest bar or 2D cell in mm'), N('bar_height', 1, 500, undefined, 'bar height in mm (1D)'),
      B('fit', 'shrink and move it so it stays on the label', false), S('name', 'object name', { maxLength: 80 })]),
  (a) => {
    const o = makeObject('barcode', Object.assign({ content: a.value }, pick(a, ['x', 'y', 'w', 'name'])));
    applySymbology(o, a.type);
    if (a.h != null) { o.h = a.h; o.barHeight = SYM[a.type].kind === '2d' ? o.barHeight : Math.max(1, a.h - (o.hr === 'none' ? 0 : 4)); }
    if (a.text) o.hr = a.text; if (a.module) o.module = a.module; if (a.bar_height) o.barHeight = a.bar_height;
    const it = buildItem(o, previewGet(), App.doc);
    if (it.error) throw new Error(`${SYM[a.type].name} cannot encode “${a.value}”: ${it.error}`);
    place(o, a, 'Add barcode');
    return `Added a ${SYM[a.type].name} barcode for “${a.value.slice(0, 40)}” (id ${o.id}).` + edgeNote(o);
  }, { description: 'Add a barcode or 2D code (Code 128, EAN-13, UPC-A, GS1-128, QR, Data Matrix, PDF417, Aztec…); check digits are added for you.' });

  add('add_qr', 'Add QR code', [S('value', 'text or address to encode', { required: true, maxLength: 2000 })].concat(XY, [N('size', 3, 500, 20, 'side in mm'), B('fit', '', false), S('name', 'object name', { maxLength: 80 })]),
  (a) => {
    const o = makeObject('barcode', Object.assign({ content: a.value, w: a.size, h: a.size }, pick(a, ['x', 'y', 'name'])));
    applySymbology(o, 'qrcode');
    // a QR code's size follows its module: scale the module so the code comes out at the size asked for
    syncAutoSize(App.doc, o, previewGet());
    for (let i = 0; i < 6 && o.w > 0 && o.module && Math.abs(o.w - a.size) > 0.3; i++) { o.module = round(o.module * a.size / o.w, 4); syncAutoSize(App.doc, o, previewGet()); }
    place(o, a, 'Add QR code');
    return `Added a QR code for “${a.value.slice(0, 40)}” (id ${o.id}).` + edgeNote(o);
  }, { description: 'Add a QR code.' });

  add('add_shape', 'Add shape', [E('shape', ['rect', 'ellipse', 'line', 'inverse'], 'rect', 'inverse: a black box that prints its contents white')].concat(XY, WH,
    [N('line_width', 0, 50, undefined, 'outline (or line) width in mm'), E('fill', ['none', 'black', 'white'], undefined), N('radius', 0, 500, undefined, 'corner radius (rect) mm'),
      E('direction', ['h', 'v'], 'h', 'line: horizontal or vertical'), B('fit', '', false), S('name', 'object name', { maxLength: 80 })]),
  (a) => {
    const o = makeObject(a.shape, Object.assign(styleProps(App.doc, a.shape), pick(a, ['x', 'y', 'w', 'h', 'name', 'fill', 'radius'])));
    if (a.line_width != null) o.stroke = a.line_width;
    if (a.shape === 'line') { o.dir = a.direction; if (a.direction === 'v') { o.h = a.h || a.w || 30; o.w = 0; } }
    place(o, a, 'Add ' + TYPE_NAMES[a.shape].toLowerCase());
    return `Added a ${TYPE_NAMES[a.shape].toLowerCase()} (id ${o.id}).` + edgeNote(o);
  }, { description: 'Add a rectangle, ellipse, line or inverse box.' });

  window.LabelAI = { list, add, made, findObj, edgeNote, fitInside, place, pick, N, E, S, B, XY, WH };
})();
