/* SlopLabel — ui/export: print jobs → scenes, file open/save, PDF/ZPL/EPL/TSPL/PNG/SVG output, ZPL import. */
'use strict';

/** Expand a job and build one scene per label (identical copies share a scene). */
function jobScenes(opts = {}, doc = App.doc) {
  const job = buildJob(doc, opts), memo = new Map(), scenes = [], keys = [];
  for (const l of job.labels) {
    if (!memo.has(l.serial)) { l.get.__print = true; memo.set(l.serial, buildScene(doc, l.get)); }
    scenes.push(memo.get(l.serial)); keys.push(l.serial);
  }
  const errors = [...new Set(scenes.flatMap((s) => sceneErrors(s)))];
  return { job, scenes, keys, errors };
}
const fileBase = () => safeName(App.doc.name, '').replace(/\s+/g, '-');
function downloadBytes(bytes, name, type) { SlopUI.download(new Blob([bytes], { type }), name); }

/* ---------------- outputs ---------------- */
async function pdfBytes(opts = {}) { const { scenes } = jobScenes(opts); await preloadImages(App.doc); return buildPDF(App.doc, scenes, { start: opts.start || 0, title: App.doc.name }); }
function zplText(opts = {}) { const { scenes, keys } = jobScenes(opts); return buildZPL(App.doc, scenes, { keys, text: opts.zplText || 'font', barcodes: opts.zplBarcodes || 'native' }); }
/** The label as currently previewed, as a PNG blob at `dpi` (defaults to max(printer dpi, 300)). */
async function labelPNGBlob(dpi, { mono = false, record = App.rec } = {}) {
  await preloadImages(App.doc);
  const get = previewResolver(App.doc, record, App.prompts); get.__print = true;
  const c = renderLabelCanvas(App.doc, buildScene(App.doc, get), dpi || Math.max(300, App.doc.dpi), { mono });
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
async function exportPNG() { SlopUI.download(await labelPNGBlob(), fileBase() + '.png'); SlopSupport.afterExport('label'); }
function exportSVG() {
  const get = previewGet(); get.__print = true;
  SlopUI.download(new Blob([labelSVG(App.doc, buildScene(App.doc, get))], { type: 'image/svg+xml' }), fileBase() + '.svg');
  SlopSupport.afterExport('label');
}
async function exportPDFQuick() { try { downloadBytes(await pdfBytes({ prompts: App.prompts }), fileBase() + '.pdf', 'application/pdf'); SlopSupport.afterExport('label'); } catch (e) { SlopUI.alert(LT('label.exp.pdf_export_failed'), e.message); } }
function exportZPLQuick() { try { downloadBytes(zplText({ prompts: App.prompts }), fileBase() + '.zpl', 'text/plain'); SlopSupport.afterExport('label'); } catch (e) { SlopUI.alert(LT('label.exp.zpl_export_failed'), e.message); } }

/* ---------------- projects ---------------- */
/** File ▸ Save (Ctrl+S): to Slop Drive when available (see hub.js), otherwise the .sloplabel download. */
function saveProject() {
  if (hubAvailable()) return saveProjectToDrive();
  downloadProject();
}
function downloadProject() {
  SlopUI.download(projectBlob(App.doc), safeName(App.doc.name, '.sloplabel'));
  markSaved();
  status(LT('label.exp.saved', { name: safeName(App.doc.name, '.sloplabel') }), '', 2500);
}
/** Open whatever came in (ui/intake.js: chosen, dropped, sent from another app): projects, ZPL, images (placed) or data
 *  files (merged). o.driveId: the Slop Drive file a project came from (Save writes back to it). */
async function openFiles(files, o = {}) {
  const tab = (f) => ({ origName: f.name, driveId: o.driveId || null });
  for (const f of files) {
    const n = (f.name || '').toLowerCase();
    try {
      if (/\.sloplabel$/.test(n)) { openDocTab(parseProject(await f.text()), tab(f)); status(LT('label.exp.opened', { name: f.name }), '', 2500); }
      else if (/\.(zpl|prn)$/.test(n)) await importZPLText(await f.text(), f.name);
      else if (/\.webm$/.test(n) || /^video\//.test(f.type)) SlopUI.alert(LT('label.exp.webm_is_video'), LT('label.exp.sloplabel_places_pictures_and_does'));
      else if (/^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(n)) await insertImageFile(f);
      else if (/\.(csv|tsv|tab|xlsx)$/.test(n) || /csv|spreadsheet/.test(f.type)) await importDataDialog(f);
      else if (/\.(json|txt)$/.test(n)) {
        const t = await f.text();
        if (/"app"\s*:\s*"sloplabel"/.test(t.slice(0, 400))) { openDocTab(parseProject(t), tab(f)); status(LT('label.exp.opened', { name: f.name }), '', 2500); }
        else if (/"format"\s*:\s*"sloplabel-configs"/.test(t.slice(0, 400))) importConfigsText(t);
        else if (/\^XA/.test(t)) await importZPLText(t, f.name);
        else await importDataDialog(f);
      } else SlopUI.toast(LT('label.exp.unsupported', { name: f.name }));
    } catch (e) { SlopUI.alert(LT('label.exp.cannot_open', { name: f.name }), e.message || String(e)); }
  }
}

/* ---------------- ZPL import ---------------- */
/** ZPL text → a new tab (the open label is kept). dpi defaults to the open label's. */
async function importZPLText(text, name, dpi = App.doc.dpi) {
  try {
    const d = await importZPL(text, { dpi });
    if (name) d.name = name.replace(/\.[^.]+$/, '');
    openDocTab(d, { label: LT('label.exp.import_zpl'), origName: name || null, dirty: true });
    SlopUI.toast(d.vars.length ? LT('label.exp.zpl_vars', { n: d.objects.length, v: d.vars.length }) : LT('label.exp.zpl', { n: d.objects.length }));
    return true;
  } catch (e) { SlopUI.alert(LT('label.exp.could_not_import_zpl'), e.message || String(e)); return false; }
}
function importZPLDialog() {
  const ta = mk('textarea', { class: 'inp', rows: 12, placeholder: '^XA\n^FO50,50^A0N,40,40^FDHello^FS\n^XZ', style: 'width:100%;min-height:220px;font-family:var(--mono)' });
  const dpi = dSel([[152, '152 dpi'], [203, '203 dpi'], [300, '300 dpi'], [600, '600 dpi']], App.doc.dpi);
  const zbody = mk('div', { class: 'dlg-form' }, mk('p', { class: 'sui-p' }, LT('label.exp.paste_a_zpl_ii_format')), ta, dRow(LT('label.exp.printer_resolution'), dpi));
  SlopFormReset.snapshot(zbody);
  SlopUI.dialog({ title: LT('label.exp.import_zpl'), cls: 'sui-wide', body: zbody,
    buttons: [{ label: LT('label.exp.open_file'), act: async () => { const t = await pickZPLText(); if (t != null) ta.value = t; return false; } }, SlopFormReset.dialogButton(zbody), { label: LT('label.dlg.cancel') },
      { label: LT('label.exp.import'), primary: true, act: async () => {
        if (!/\^XA/i.test(ta.value)) { SlopUI.toast(LT('label.exp.no_xa_xz_format_found')); return false; }
        await importZPLText(ta.value, undefined, +dpi.value);
      } }] });
}
/** Render ZPL as a picture (for checking exported or third-party ZPL). */
async function zplPreviewCanvas(text, dpi) {
  const d = await importZPL(text, { dpi });
  await preloadImages(d);
  return renderLabelCanvas(d, buildScene(d, makeResolver(d, {})), Math.min(dpi, 203));
}
// Convert… in the header (shared/convert/provided.js): the label as a PDF, the way Send to makes it.
addEventListener('slop:convert-files', (e) => e.detail.provide(async () => (App.doc ? [{ name: fileBase() + '.pdf', blob: new Blob([await pdfBytes({ prompts: App.prompts })], { type: 'application/pdf' }) }] : null)));
