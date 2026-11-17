/* Slop OCR's headless operation, for Slop Workflows (registry: shared/ops/registry.js):
 *   ocr.read   reads the text of photos, scans and PDFs with the Slop AI Tools OCR engine (PP-OCRv4 in the inference
 *              worker, aitools/common.js SlopAITools.call('ocr')), the page renderer and layout of Slop OCR
 *              (ocr/js/sources.js, ocr/js/layout.js) and its outputs (ocr/js/export.js): a searchable PDF (the picture with
 *              an invisible text layer), plain text or Markdown. The text model is installed from Slop OCR's Get more; a
 *              workflow never downloads it by itself, it says where to get it. */
import { register } from './registry.js';
import { scripts, abortable, stem } from './load.js';
import { t, opt } from './i18n.js';

const g = globalThis;
const AI = ['aitools/model-registry.js', 'aitools/models.js', 'aitools/support.js', 'aitools/common.js'];
const MODEL = 'ppocr-v4';
const OUT = { pdf: 'pdf', txt: 'txt', md: 'md' };

async function engine() {
  await scripts(AI, () => !!(g.SlopAITools && g.SlopAIManager));
  const status = await g.SlopAIManager.status(MODEL);
  if (status === 'needs-download') throw new Error(t('ui.ops.ocr.no_model'));
  await g.SlopAITools.ensure(MODEL);
  return g.SlopAITools;
}

async function read(files, o, ctx = {}) {
  const [T, src, lay, out] = await Promise.all([engine(), import('../../ocr/js/sources.js'), import('../../ocr/js/layout.js'), import('../../ocr/js/export.js')]);
  const f = files[0], pages = await src.openFile(f.file), done = [];
  for (let i = 0; i < pages.length; i++) {
    abortable(ctx.signal);
    const canvas = await src.renderPage(pages[i]), bitmap = await createImageBitmap(canvas);
    const r = await T.call('ocr', { bitmap, w: canvas.width, h: canvas.height }, { transfer: [bitmap] });
    done.push({ ...pages[i], w: canvas.width, h: canvas.height, lines: r.lines, text: lay.linesToText(r.lines), image: o.output === 'pdf' ? await out.jpegBytes(canvas) : null });
    if (ctx.progress) ctx.progress((i + 1) / pages.length);
  }
  const name = stem(f.name), kind = OUT[o.output] || 'pdf';
  if (kind === 'pdf') return [{ name: `${name}-searchable.pdf`, blob: await out.searchablePdf(done, { title: name }), kind }];
  const text = kind === 'md' ? out.markdownText(done) : out.plainText(done);
  return [{ name: `${name}.${kind}`, blob: new Blob([text], { type: kind === 'md' ? 'text/markdown' : 'text/plain' }), kind }];
}

export const OCR_OPS = register([
  { id: 'ocr.read', group: 'Text', from: ['png', 'jpg', 'webp', 'bmp', 'gif', 'pdf'], mode: 'each', out: (k, o) => OUT[o.output] || 'pdf',   // i18n-ignore: a group id (search words), an app name
    keywords: ['ocr', 'searchable pdf', 'scan to text', 'read text', 'recognise'], engine: 'ocr',
    options: [opt('ui.ops.ocr.output', { key: 'output', type: 'select', value: 'pdf', options: ['pdf', 'txt', ['md', 'Markdown']] })],
    run: read },
], { app: 'ocr', label: 'Slop OCR' });   // i18n-ignore: a group id (search words), an app name
