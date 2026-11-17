/* SlopLabel for the assistant, part two (after ai-commands.js): add_image (Slop Drive or a picture on this site, through
 * shared/commands/sources.js and the app's own addImageAsset), set_property, data_merge (columns and rows, or a CSV / JSON
 * file from Slop Drive, through the app's own parseCSV / tableToSource / parseJSONSource), delete_object (destructive),
 * export (PDF of every label, PNG of the current one, ZPL or the .sloplabel file, to Slop Drive and/or a download, with
 * export.js's own writers), undo; then registers every command and the state and checkpoint. */
'use strict';

(function () {
  const X = window.LabelAI;
  if (!X) return;
  const { add, N, E, S, B, XY, WH, findObj, edgeNote, place, pick, made } = X;
  const SRC = () => window.SlopCmdSources;

  add('add_image', 'Add picture', [S('file', 'a Slop Drive file name or id'), S('url', 'or the address of a picture on this site, e.g. /favicon.svg', { maxLength: 500 })].concat(XY, WH,
    [B('fit', 'shrink and move it so it stays on the label', false), S('name', 'object name', { maxLength: 80 })]),
  async (a) => {
    if (!a.file && !a.url) throw new Error('Give file (a Slop Drive name or id) or url (a picture on this site)');
    const f = a.file ? await SRC().driveFile(a.file) : await SRC().siteFile(a.url);
    const blob = f.blob.name ? f.blob : new File([f.blob], f.name, { type: f.blob.type || f.type || '' });
    const as = await addImageAsset(App.doc, blob);
    let w = a.w || Math.min(30, App.doc.label.w * 0.6), h = a.h || w / as.aspect;
    if (!a.h && !a.w && h > App.doc.label.h * 0.8) { h = App.doc.label.h * 0.6; w = h * as.aspect; }
    const o = makeObject('image', Object.assign(pick(a, ['x', 'y', 'name']), { w: round(w, 3), h: round(h, 3), asset: as.id, aspect: as.aspect }));
    if (!a.name) o.name = String(f.name || 'Image').replace(/\.[^.]+$/, '');
    await preloadImages(App.doc);
    place(o, a, 'Place image');
    return `Placed ${f.name} (id ${o.id}).` + edgeNote(o);
  }, { description: 'Place a picture (logo, icon) from Slop Drive or from this site.' });

  const PROPS = { x: 'number', y: 'number', w: 'number', h: 'number', rot: 'number', content: 'string', font: 'string', size: 'number', bold: 'boolean', italic: 'boolean', align: 'string',
    color: 'string', symbology: 'string', module: 'number', barHeight: 'number', hr: 'string', stroke: 'number', fill: 'string', radius: 'number', name: 'string', hidden: 'boolean', locked: 'boolean' };
  add('set_property', 'Change an object', [S('object', 'object name or id (app state); the selected object when empty', { maxLength: 120 }),
    { name: 'set', type: 'object', required: true, description: 'what to change: x, y, w, h (mm), rot, content, font, size, bold, italic, align, color, symbology, module, barHeight, hr, stroke, fill, radius, name, hidden, locked' }],
  (a) => {
    const o = findObj(a.object), notes = [];
    for (const [k, v] of Object.entries(a.set || {})) {
      if (!PROPS[k]) { notes.push(`no property “${k}”`); continue; }
      if (k === 'symbology') { if (!SYM[v]) throw new Error(`No barcode type “${v}”`); applySymbology(o, v); continue; }
      if (k === 'font' && !FONTS[v]) throw new Error(`No font “${v}” (${Object.keys(FONTS).join(', ')})`);
      o[k] = PROPS[k] === 'number' ? Number(v) : PROPS[k] === 'boolean' ? v === true || /^(true|yes|1)$/i.test(String(v)) : String(v);
      if (PROPS[k] === 'number' && !Number.isFinite(o[k])) throw new Error(`${k} must be a number`);
    }
    syncAutoSize(App.doc, o, previewGet());
    App.sel = [o.id];
    commit('Edit ' + o.name);
    return `Changed “${o.name}”.` + (notes.length ? ' Note: ' + notes.join('; ') + '.' : '') + edgeNote(o);
  }, { description: 'Change properties of one object (position, size, text, font, barcode type…).' });

  add('data_merge', 'Data merge', [{ name: 'columns', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'column names; use {Name} in text and barcodes' },
    { name: 'rows', type: 'array', maxItems: 20000, items: {}, description: 'records: arrays in column order, or objects { column: value }' },
    S('file', 'or a CSV, TSV or JSON file in Slop Drive'), { name: 'map', type: 'object', description: 'optional column → field name' }, S('quantity_column', 'a column with the number of copies of each label', { maxLength: 120 })],
  async (a) => {
    let src;
    if (a.file) {
      const f = await SRC().driveFile(a.file), text = await f.blob.text();
      src = /\.json$/i.test(f.name) || /^\s*[[{]/.test(text) ? parseJSONSource(text, f.name) : tableToSource(parseCSV(text), f.name);
    } else {
      if (!a.rows || !a.rows.length) throw new Error('Give rows (and columns), or a file from Slop Drive');
      const cols = a.columns && a.columns.length ? a.columns.map(String) : Object.keys(a.rows.find((r) => r && !Array.isArray(r)) || {});
      if (!cols.length) throw new Error('Give columns, or rows as objects');
      src = tableToSource([cols, ...a.rows.map((r) => (Array.isArray(r) ? r : cols.map((c) => (r && r[c] != null ? r[c] : ''))))], 'AI data');
    }
    if (!src.rows.length) throw new Error('The data has a header row but no records');
    if (a.map) for (const [c, v] of Object.entries(a.map)) if (src.columns.includes(c)) src.map[c] = String(v);
    if (a.quantity_column) { if (!src.columns.includes(a.quantity_column)) throw new Error(`No column “${a.quantity_column}”`); src.qtyCol = a.quantity_column; }
    App.rec = 0;
    editDoc((d) => { d.data = src; }, 'Import data');
    const used = App.doc.objects.filter((o) => src.columns.some((c) => String(o.content || '').includes('{' + ((src.map && src.map[c]) || c)))).length;
    return `Merged ${src.rows.length} records with columns ${src.columns.join(', ')}; ${used} object(s) use them. Each record prints one label` + (src.qtyCol ? ` (copies from ${src.qtyCol}).` : '.');
  }, { description: 'Give the label data to merge: one label per record, {Column} in text and barcodes is replaced.' });

  add('delete_object', 'Delete object', [S('object', 'object name or id; the selection when empty', { maxLength: 120 })], (a) => {
    const ids = a.object ? [findObj(a.object).id] : App.sel.slice();
    if (!ids.length) throw new Error('Name the object to delete');
    App.sel = ids; const n = App.doc.objects.length; deleteSel();
    if (App.doc.objects.length === n) throw new Error('That object is locked');
    return `Deleted ${n - App.doc.objects.length} object(s).`;
  }, { destructive: true, description: 'Delete an object from the label.' });

  const TYPES = { pdf: 'application/pdf', png: 'image/png', zpl: 'text/plain', sloplabel: 'application/json' };
  add('export', 'Export', [E('format', ['pdf', 'png', 'zpl', 'sloplabel'], 'pdf', 'pdf: every label (all records) on the stock; png: the current label'),
    E('to', ['drive', 'download', 'both'], 'drive'), S('name', 'file name without extension', { maxLength: 120 })],
  async (a) => {
    let blob;
    if (a.format === 'pdf') blob = new Blob([await pdfBytes({ prompts: App.prompts })], { type: TYPES.pdf });
    else if (a.format === 'png') blob = await labelPNGBlob();
    else if (a.format === 'zpl') blob = new Blob([zplText({ prompts: App.prompts })], { type: TYPES.zpl });
    else blob = projectBlob(App.doc);
    const name = (a.name ? safeName(a.name, '') : fileBase()) + '.' + a.format, out = [];
    if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await SRC().put(blob, name, 'label')})`);
    if (a.to !== 'drive') { SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    const n = recordCount(App.doc);
    return out.join(' and ') + (a.format === 'pdf' && n ? ` (${n} records).` : '.');
  }, { description: 'Export the label as PDF (all records), PNG, ZPL for Zebra printers, or the .sloplabel file, to Slop Drive and/or a download.' });

  add('undo', 'Undo', [N('steps', 1, 20, 1, '', { integer: true })], (a) => { let n = 0; while (n < a.steps && App.hist.canUndo) { undo(); n++; } return `Undid ${n} step${n === 1 ? '' : 's'}.`; });

  function state() {
    const d = App.doc, f = (v) => Math.round(v * 10) / 10;
    if (!d) return { app: 'SlopLabel', open: false };
    return { app: 'SlopLabel', name: d.name, unit: 'mm', label: { width: f(d.label.w), height: f(d.label.h), radius: d.label.radius },
      stock: d.stock.kind === 'sheet' ? `${d.stock.name}: ${d.stock.cols} × ${d.stock.rows} per sheet` : d.stock.name,
      objects: d.objects.slice(0, 80).map((o) => ({ id: o.id, name: o.name, type: o.type, x: f(o.x), y: f(o.y), w: f(o.w), h: f(o.h), content: o.content != null ? String(o.content).slice(0, 80) : undefined, symbology: o.symbology })),
      selection: App.sel.slice(), data: d.data ? { columns: d.data.columns, records: d.data.rows.length } : null, variables: d.vars.map((v) => v.name), canUndo: App.hist.canUndo };
  }
  /** Rollback: closes the tabs the assistant opened, then undoes back to where the request started. */
  function checkpoint() {
    const T = App.T, idx = App.hist.idx, mark = made.length;
    return () => {
      for (const t of made.splice(mark)) { t.dirty = false; if (t === App.T) App.dirty = false; if (LabelTabs.api) LabelTabs.api.close(t); }
      if (App.T !== T && LabelTabs.api) LabelTabs.api.activate(T);
      if (App.T !== T) return false;
      while (App.hist.idx > idx && App.hist.canUndo) undo();
      return true;
    };
  }
  SlopCmd.register(X.list);
  SlopCmd.provide({ state, checkpoint });
  X.state = state; X.checkpoint = checkpoint;
})();
