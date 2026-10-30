/* Slop Compare: what goes out of the page, through the one way out (SlopOuttake: Open in…, Save to Slop Drive…).
 *   blobOf(format) → { blob, name }   format 'html' (the report page), 'pdf' (the report as a PDF) or 'patch' (the unified
 *                                     diff of the two texts; for texts, JSON and CSV only)
 *   download(format), saveToDrive(format) → the Slop Drive id, openInItems() → menu items for the report
 *   canPatch()   the two sides are texts (a .patch is made from their lines whatever the Compare as setting) */
import { S } from './state.js';
import { reportHtml, reportName } from '../core/report.js';
import { unified } from '../core/patch.js';
import { diffLines } from '../core/text.js';
import { withUrls } from '../io/files.js';
import { t } from './i18n.js';

const TYPES = { html: 'text/html', pdf: 'application/pdf', patch: 'text/x-diff' };
const names = () => ({ nameA: S.sides.a.name || 'A', nameB: S.sides.b.name || 'B' });

export const canPatch = () => !!S.result && !S.sides.a.file && !S.sides.b.file;

export async function blobOf(format = 'html') {
  if (!S.result) throw new Error(t('diff.err.compare_first'));
  const n = names();
  if (format === 'patch') {
    if (!canPatch()) throw new Error(t('diff.err.no_patch'));
    const text = S.result.text && S.result.kind === 'text' ? S.result.text : diffLines(S.sides.a.text, S.sides.b.text, { ignoreWs: S.opts.ignoreWs, ignoreCase: S.opts.ignoreCase });
    const strip = (s) => String(s).replace(/\s+/g, '_');
    const body = unified(text, { nameA: `a/${strip(n.nameA)}`, nameB: `b/${strip(n.nameB)}`, context: 3 });
    return { blob: new Blob([body], { type: TYPES.patch }), name: reportName(n.nameA, n.nameB, 'patch') };
  }
  const r = withUrls(S.result);
  if (format === 'pdf') {
    const { reportPdf } = await import('../io/report-pdf.js');
    return { blob: new Blob([await reportPdf(r, n)], { type: TYPES.pdf }), name: reportName(n.nameA, n.nameB, 'pdf') };
  }
  return { blob: new Blob([reportHtml(r, n)], { type: TYPES.html }), name: reportName(n.nameA, n.nameB, 'html') };
}

export async function download(format = 'html') {
  const o = await blobOf(format);
  window.SlopUI.download(o.blob, o.name);
  return o.name;
}

export async function saveToDrive(format = 'html') {
  const o = await blobOf(format);
  return window.SlopHub.put(o.blob, { name: o.name, from: 'diff' });
}

/** The report's "Open in…" items (the apps that take HTML or PDF, and Save to Slop Drive…). */
export function openInItems(format = 'html') {
  const O = window.SlopOuttake;
  if (!O || !S.result) return [];
  const n = names();
  return O.items({ get: async () => (await blobOf(format)).blob, name: reportName(n.nameA, n.nameB, format), type: TYPES[format], from: 'diff', folder: false });
}
