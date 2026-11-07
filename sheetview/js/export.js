/* Slop Sheets viewer: export. The Export menu offers CSV, TSV and XLSX, each for the visible rows (after filter and
 * sort, current sheet) or for all rows. XLSX with all rows holds every sheet; with visible rows, the current sheet only.
 * Files are made in the browser and downloaded; nothing is uploaded. */
import { csvBlob } from '../../shared/sheets/csv.js';
import { exportSheet, toXlsxBlob } from '../../shared/sheets/write.js';

/** The menu items for an open document. ctx: { doc, sheet, order }. */
export function exportItems(ctx, run) {
  const t = (k) => (window.SlopI18n ? window.SlopI18n.t(k) : k);
  const items = [];
  ['visible', 'all'].forEach((scope, i) => {
    if (i) items.push('-');
    for (const kind of ['csv', 'tsv', 'xlsx']) items.push({ label: t(`sheetview.menu.${scope}_${kind}`), act: () => run(kind, scope, ctx) });
  });
  return items;
}

const safeBase = (name) => String(name || 'Sheet').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Sheet';   // i18n-ignore: a file name

/** Builds the file: { blob, name }. */
export async function exportBlob(kind, scope, { doc, sheet, order }) {
  const visible = scope === 'visible';
  const suffix = visible ? ' (visible rows)' : '';   // i18n-ignore: the downloaded file's name stays English
  const base = safeBase(doc.name);
  let blob, name;
  if (kind === 'xlsx') {
    const sheets = visible ? [exportSheet(sheet, order)] : doc.sheets.map((s) => exportSheet(s));
    blob = await toXlsxBlob(sheets);
    name = `${base}${suffix}.xlsx`;
  } else {
    blob = csvBlob(sheet, visible ? order : null, kind === 'tsv' ? '\t' : ',');
    name = `${base}${suffix}.${kind}`;
  }
  return { blob, name };
}
/** Builds the file and downloads it. Returns the file name. */
export async function exportFile(kind, scope, ctx) {
  const { blob, name } = await exportBlob(kind, scope, ctx);
  window.SlopUI.download(blob, name);
  return name;
}

/** Convert… in the header (shared/convert/provided.js): every sheet of the open document, as one XLSX. */
addEventListener('slop:convert-files', (e) => e.detail.provide(async () => {
  const d = window.SlopSheetView && window.SlopSheetView.store.doc();
  if (!d) return null;
  return [{ name: `${safeBase(d.name)}.xlsx`, blob: await toXlsxBlob(d.sheets.map((s) => exportSheet(s))) }];
}, { app: 'Slop Sheets' }));
