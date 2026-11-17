/* SlopLabel: the shared config kind 'label' for app 'label' (shared/config, HANDOFF.md there). The file holds the label size,
   units, print resolution, the stock name, and the objects: text, paragraphs, barcodes, rectangles, ellipses, lines and inverse
   boxes, with their position, size and their main settings. Pictures (image objects), groups, the data-merge source and the
   printer settings are not in the file yet; export counts the pictures it leaves out. Import replaces the open label after
   the person confirms. Classic script; exposes window.LabelConfig. */
(function () {
  'use strict';
  const C = window.SlopConfig, D = window.SlopConfigDialog, F = C && C.F;
  const APP = 'label';
  const KINDS = ['text', 'para', 'barcode', 'rect', 'ellipse', 'line', 'inverse'];
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const r2 = (v) => Math.round(v * 100) / 100;
  const LabelConfig = (window.LabelConfig = { skipped: 0 });

  /** The open label's objects as file objects (pictures and groups are left out and counted). */
  function read() {
    const d = App.doc;
    LabelConfig.skipped = d.objects.filter((o) => !KINDS.includes(o.type)).length;
    const objects = d.objects.filter((o) => KINDS.includes(o.type)).map((o) => {
      const out = { type: o.type, name: String(o.name || o.type).slice(0, 120), x: r2(o.x), y: r2(o.y), w: r2(o.w || 0), h: r2(o.h || 0), rot: r2(o.rot || 0) };
      if (o.locked) out.locked = true;
      if (o.hidden) out.hidden = true;
      if (o.type === 'text' || o.type === 'para') Object.assign(out, { content: String(o.content || '').slice(0, 2000), font: String(o.font || 'sans').slice(0, 40), size: r2(o.size || 12), bold: !!o.bold, italic: !!o.italic, align: o.align || 'left' });
      if (o.type === 'barcode') Object.assign(out, { content: String(o.content || '').slice(0, 2000), symbology: String(o.symbology || 'code128').slice(0, 30) });
      if (o.type === 'rect' || o.type === 'ellipse') Object.assign(out, { stroke: r2(o.stroke || 0), fill: o.fill && o.fill !== 'none' && HEX.test(o.fill) ? o.fill : undefined });
      if (o.type === 'rect') out.radius = r2(o.radius || 0);
      return out;
    });
    return { label: { w: r2(d.label.w), h: r2(d.label.h), radius: r2(d.label.radius || 0), gap: r2(d.label.gap || 0), orientation: d.label.orientation || 'landscape' },
      unit: d.unit, dpi: d.dpi, stock: { id: d.stock && d.stock.id ? String(d.stock.id).slice(0, 60) : '', name: d.stock && d.stock.name ? String(d.stock.name).slice(0, 120) : '' },
      objects };
  }

  /** The file as a new label document, then opened (the open label is replaced after the person confirms). */
  async function apply(data, ctx) {
    if (window.SlopUI && App.dirty && !(await SlopUI.confirm(LT('label.io.discard_unsaved_changes'), LT('label.io.the_open_label_has_changes'), LT('label.bgen.replace'), { danger: true }))) {
      return { ok: false, message: LT('label.io.the_open_label_was_kept') };
    }
    const doc = newDoc({ name: ctx.name, unit: data.unit, dpi: data.dpi });
    Object.assign(doc.label, data.label, { margin: doc.label.margin });
    const s = data.stock && data.stock.id ? stockById(data.stock.id) : null;
    if (s) applyStock(doc, s);
    doc.objects = data.objects.map((o) => makeObject(o.type, Object.assign({}, o, { name: o.name })));
    setDoc(doc, LT('label.io.import_config'));
  }

  if (C && D && F) {
    const obj = F.obj({
      type: F.enum(KINDS, { required: true, desc: 'text, para, barcode, rect, ellipse, line or inverse' }),
      name: F.str({ max: 120, desc: 'object name' }),
      x: F.num({ min: -1e4, max: 1e4, required: true, desc: 'left edge, in the label units' }),
      y: F.num({ min: -1e4, max: 1e4, required: true, desc: 'top edge, in the label units' }),
      w: F.num({ min: 0, max: 1e4, desc: 'width' }), h: F.num({ min: 0, max: 1e4, desc: 'height' }),
      rot: F.num({ min: -360, max: 360, desc: 'rotation in degrees' }),
      locked: F.bool(), hidden: F.bool(),
      content: F.text({ max: 2000, desc: 'text, paragraph or barcode data' }),
      font: F.str({ max: 40, desc: 'font: sans, serif or mono' }),
      size: F.num({ min: 1, max: 200, desc: 'text size in points' }),
      bold: F.bool(), italic: F.bool(),
      align: F.enum(['left', 'center', 'right'], { desc: 'text alignment' }),
      symbology: F.str({ max: 30, pattern: /^[a-z0-9-]+$/, desc: 'barcode type, e.g. code128 or qrcode' }),
      stroke: F.num({ min: 0, max: 20, desc: 'line width' }),
      fill: F.str({ max: 7, pattern: HEX, desc: 'fill colour #rrggbb; leave out for no fill' }),
      radius: F.num({ min: 0, max: 100, desc: 'corner radius (rect)' }),
    });
    C.registerKind('label', APP, {
      strict: true,
      fields: {
        label: F.obj({
          w: F.num({ min: 1, max: 2000, required: true, desc: 'label width in the units' }),
          h: F.num({ min: 1, max: 2000, required: true, desc: 'label height in the units' }),
          radius: F.num({ min: 0, max: 100, desc: 'corner radius of the label' }),
          gap: F.num({ min: 0, max: 100, desc: 'gap between labels on the roll or sheet' }),
          orientation: F.enum(['portrait', 'landscape'], { desc: 'orientation' }),
        }, { required: true, desc: 'the label size' }),
        unit: F.enum(['mm', 'in', 'dots'], { required: true, desc: 'units of every size in the file' }),
        dpi: F.enum([152, 203, 300, 600], { desc: 'print resolution in dots per inch' }),
        stock: F.obj({ id: F.str({ max: 60, desc: 'stock id from the built-in list, e.g. roll-4x6' }), name: F.str({ max: 120, desc: 'stock name' }) }),
        objects: F.list(obj, { max: 1000, desc: 'objects, bottom first' }),
      },
    }, apply, { label: 'Label', description: 'Label size, units, stock and the objects on it (pictures are not in the file)', read });
    D.install({ app: APP });
  }
})();
