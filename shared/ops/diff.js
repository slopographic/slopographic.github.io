/* Slop Compare's headless operation, for Slop Workflows and any app's AI panel (registry: shared/ops/registry.js):
 *   diff.report   two files in (texts, code, JSON, CSV, two PDFs or two pictures), one report out: the HTML page or the PDF
 *                 that Slop Compare downloads, or the .patch of two texts. The comparison is Slop Compare's own
 *                 (diff/js/io/files.js compareSides, the same options as the page: diff/js/core/compare.js OPTIONS), so the
 *                 step and the page always agree. The first file is A (the original), the second B.
 * reportOf(files, options) → { name, blob, kind, summary } is the work, for the tests and the page alike. */
import { register } from './registry.js';
import { t, opt } from './i18n.js';
import { compareSides, withUrls } from '../../diff/js/io/files.js';
import { reportHtml, reportName } from '../../diff/js/core/report.js';
import { summary } from '../../diff/js/core/kind.js';
import { unified } from '../../diff/js/core/patch.js';
import { diffLines } from '../../diff/js/core/text.js';

const MIME = { html: 'text/html', pdf: 'application/pdf', patch: 'text/x-diff' };

export async function reportOf(files, o = {}) {
  if (files.length !== 2) throw new Error(t('ui.ops.diff.two_files', { n: files.length }));
  const [a, b] = files.map((f) => ({ name: f.name, type: f.file.type || '', file: f.file }));
  const format = MIME[o.format] ? o.format : 'html';
  const r = await compareSides(a, b, o);
  const names = { nameA: a.name, nameB: b.name };
  let blob;
  if (format === 'patch') {
    if (r.kind === 'image' || r.kind === 'pdf') throw new Error(t('ui.ops.diff.patch_texts'));
    const text = r.text || diffLines(await a.file.text(), await b.file.text(), { ignoreWs: r.opts.ignoreWs, ignoreCase: r.opts.ignoreCase });
    blob = new Blob([unified(text, { nameA: `a/${a.name}`, nameB: `b/${b.name}` })], { type: MIME.patch });
  } else if (format === 'pdf') {
    const { reportPdf } = await import('../../diff/js/io/report-pdf.js');
    blob = new Blob([await reportPdf(withUrls(r), names)], { type: MIME.pdf });
  } else blob = new Blob([reportHtml(withUrls(r), names)], { type: MIME.html });
  return { name: reportName(a.name, b.name, format), blob, kind: format, summary: summary(r) };
}

async function run(files, o) {
  const r = await reportOf(files, o);
  const out = [{ name: r.name, blob: r.blob, kind: r.kind }];
  out.info = r.summary;
  return out;
}

export const DIFF_OPS = register([
  { id: 'diff.report', group: 'Files', from: ['*'], mode: 'combine', out: (k, o) => (o && MIME[o.format] ? o.format : 'html'),   // i18n-ignore: a group id (search words), an app name
    keywords: ['compare', 'diff', 'difference', 'changes', 'patch', 'report', 'versions'],
    options: [
      opt('ui.ops.diff.format', { key: 'format', type: 'select', value: 'html', options: ['html', 'pdf', 'patch'] }),
      opt('ui.ops.diff.mode', { key: 'mode', type: 'select', value: 'auto', options: ['auto', 'text', 'json', 'csv'] }),
      opt('ui.ops.diff.view', { key: 'view', type: 'select', value: 'split', options: ['split', 'unified'] }),
      opt('ui.ops.diff.ignore_ws', { key: 'ignoreWs', type: 'checkbox', value: false }),
      opt('ui.ops.diff.ignore_case', { key: 'ignoreCase', type: 'checkbox', value: false }),
      opt('ui.ops.diff.pdf_view', { key: 'pdfView', type: 'select', value: 'text', options: ['text', 'visual'] }),
      opt('ui.ops.diff.threshold', { key: 'threshold', type: 'range', min: 0, max: 100, value: 10 }),
    ],
    run },
], { app: 'diff', label: 'Slop Compare' });   // i18n-ignore: a group id (search words), an app name
