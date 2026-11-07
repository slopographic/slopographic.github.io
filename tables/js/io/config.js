/* Slop Tables: the shared config kind 'template' for app 'tables' (shared/config, HANDOFF.md there). A sheet is a page with one
   table block: each cell is its input (a formula is the text "=…", a value is the value itself, styles are not in the file).
   Export reads the open workbook; import builds a new unsaved workbook from the file and opens it (the same path as
   File ▸ From template, so the open workbook is kept when the person cancels). Also the palette commands. */
import { S } from '../ui/state.js';
import { toNative, fromNative } from './native.js';
import { useWorkbook } from '../ui/storage.js';
import { t } from '../i18n.js';

const C = window.SlopConfig, D = window.SlopConfigDialog;
const APP = 'tables';
const MAX_ROWS = 1000, MAX_COLS = 100;

/** The workbook as pages. A sheet bigger than the format allows is refused, so the export says so. */
function pagesOf(wb) {
  const n = toNative(wb);
  return {
    pages: n.sheets.map((sh) => {
      if (!sh.cells.length) return { name: sh.name, blocks: [] };
      let maxR = 0, maxC = 0;
      for (const [r, c] of sh.cells) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
      if (maxR >= MAX_ROWS || maxC >= MAX_COLS) throw new Error(`the sheet "${sh.name}" is bigger than ${MAX_ROWS} rows or ${MAX_COLS} columns`);
      const rows = Array.from({ length: maxR + 1 }, () => Array(maxC + 1).fill(null));
      for (const [r, c, rec] of sh.cells) rows[r][c] = rec.f !== undefined ? '=' + rec.f : rec.v !== undefined ? rec.v : null;
      return { name: sh.name, blocks: [{ type: 'table', rows }] };
    }),
  };
}

/** The file's pages as the native workbook format, then a new unsaved workbook. */
async function apply(data, ctx) {
  const sheets = data.pages.map((pg) => {
    const cells = [];
    const table = pg.blocks.find((b) => b.type === 'table');
    ((table && table.rows) || []).forEach((row, r) => row.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      if (typeof v === 'string' && v.startsWith('=')) cells.push([r, c, { f: v.slice(1) }]);
      else cells.push([r, c, { v }]);
    }));
    return { name: pg.name, freeze: { r: 0, c: 0 }, merges: [], cols: [], rows: [], cells };
  });
  let wb;
  try { wb = fromNative({ format: 'slop-tables', version: 1, title: ctx.name, active: 0, styles: [{}], sheets, names: [] }); } catch (e) {
    return { ok: false, message: e.message };
  }
  const opened = await useWorkbook(wb, ctx.name);
  return opened ? undefined : { ok: false, message: t('tables.config.kept') };
}

/** Palette commands and the Config menu items (ids tables.config.*). */
const EXAMPLE = { kind: 'template', value: { pages: [{ name: 'Sheet 1', blocks: [{ type: 'table', rows: [['Item', 'Cost'], ['Rent', 900], ['Total', '=SUM(B2:B2)']] }] }] } }; // i18n-ignore: sample content
export function configCommands() { return D ? D.commands({ app: APP, prefix: 'tables', example: EXAMPLE }) : []; }

if (C && D) {
  C.registerKind('template', APP, C.templateSchema, apply, {
    label: t('tables.config.label'), description: t('tables.config.desc'),
    read: () => pagesOf(S.wb),
  });
  D.install({ app: APP, dragover: true });
}
