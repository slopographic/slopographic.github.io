/* Slop EML: the PDF of one or many messages, made with Slop Docs' engine (as File convert's text-to-PDF is): its layout
 * (docs/js/layout), its PDF writer (docs/js/io/pdf.js, which draws text with shared/fonts/pdf-runs.js) and its language
 * fonts (docs/js/fonts/lang-doc.js through SlopFontJIT, which asks before the first download). So Swedish, Arabic, Chinese
 * or Hindi mail comes out as real, searchable text. The document comes from eml/js/pdf-doc.js. After the writer:
 * PDF attachments are copied in after their message (pdf-lib), and every page gets "Page n of N".
 *   build(docs, { cover, list = true, append = false, title, order = true }) →
 *     Promise<{ bytes, pages, starts: [first page number of each message], order: [doc ids], info, skipped: [names] }>
 *   cover: the contents page (default: more than one message). append: PDF and image attachments as pages.
 *   order: oldest first (EmlBatch.chrono); false keeps the order given. */
import { messagesDoc } from './pdf-doc.js';

const SHARED = new URL('../../shared/', import.meta.url).href;
const CLASSIC = [['SlopScripts', 'fonts/scripts.js'], ['SlopBidi', 'fonts/bidi.js'], ['SlopPdfRuns', 'fonts/pdf-runs.js'], ['SlopFontJIT', 'fonts/jit.js']];
const IMG = /^image\/(png|jpeg|gif|webp|bmp)$/;
let readyP = null;

function script(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = SHARED + src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
}
/** The Docs engine and its classic helpers, loaded once. */
export function engine() {
  if (!readyP) {
    readyP = (async () => {
      for (const [g, src] of CLASSIC) if (!globalThis[g]) await script(src);
      const [layout, reg, lang, pdf, vendor] = await Promise.all([import('../../docs/js/layout/index.js'), import('../../docs/js/fonts/registry.js'),
        import('../../docs/js/fonts/lang-doc.js'), import('../../docs/js/io/pdf.js'), import('../../docs/js/io/vendor.js')]);
      return { layoutDoc: layout.layoutDoc, reg, lang, exportPdf: pdf.exportPdf, pdfLib: vendor.pdfLib };
    })();
    readyP.catch(() => { readyP = null; });
  }
  return readyP;
}

const fmt = (t, o) => (t == null ? '' : new Date(t).toLocaleString(undefined, o));
const dataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/** One message as the entry pdf-doc.js lays out, and the PDF attachments to copy in after it. */
async function entryOf(d, i, o, PL) {
  const B = window.EmlBatch, s = d.summary, m = d.msg;
  const rows = [['From', s.from], ['To', s.to], ['Cc', s.cc], ['Bcc', s.bcc], ['Date', d.time != null ? fmt(d.time, { dateStyle: 'full', timeStyle: 'short' }) : s.date]].filter((r) => r[1]);
  const text = m.text != null ? m.text : m.html != null ? window.EmlText.htmlToText(m.html) : '';
  const e = { pid: 'msg' + i + '-' + d.id, subject: s.subject || '(no subject)', rows, from: B.person(s.from), dateShort: fmt(d.time, { dateStyle: 'medium' }) || s.date || '',
    text, atts: [], images: [], pdfs: [], skipped: [] };
  for (const a of m.attachments) {
    const type = B.typeOf(a.name, a.type), item = { name: a.name, type, size: a.size };
    e.atts.push(item);
    if (!o.append || a.inline) continue;
    try {
      if (type === 'application/pdf') {
        const src = await PL.PDFDocument.load(a.bytes, { ignoreEncryption: true });
        e.pdfs.push({ src, n: src.getPageCount() });
        item.note = 'added as ' + (src.getPageCount() === 1 ? 'a page' : src.getPageCount() + ' pages') + ' after this message';
      } else if (IMG.test(type)) {
        const blob = new Blob([a.bytes], { type });
        const bm = await createImageBitmap(blob);
        e.images.push({ name: a.name, src: await dataUrl(blob), w: bm.width, h: bm.height });
        bm.close();
        item.note = 'added as a page';
      }
    } catch (x) { item.note = 'could not be added'; e.skipped.push(a.name); }
  }
  return e;
}

/** First page index (0-based) of each message's heading in a layout. */
function startsOf(layout, entries) {
  const at = new Map(layout.headings.map((h) => [h.pid, h.page]));
  return entries.map((e) => at.get(e.h1));
}

export async function build(docs, o = {}) {
  const E = await engine(), PL = await E.pdfLib();
  const list = o.order === false ? docs.slice() : window.EmlBatch.chrono(docs);
  const cover = o.cover != null ? o.cover : list.length > 1;
  const entries = [];
  for (let i = 0; i < list.length; i++) entries.push(await entryOf(list[i], i, o, PL));
  const times = list.map((d) => d.time).filter((t) => t != null);
  const span = times.length ? [fmt(Math.min(...times), { dateStyle: 'medium' }), fmt(Math.max(...times), { dateStyle: 'medium' })] : null;
  const opts = { cover, list: o.list, title: o.title || (list.length === 1 ? entries[0].subject : list.length + ' messages'),
    subtitle: span ? (span[0] === span[1] ? span[0] : span[0] + ' – ' + span[1]) : '' };

  const make = (pages) => {
    const doc = messagesDoc(entries, { ...opts, pages });
    // the heading block of each message (its first H1 after the cover) is where its pages start
    let k = 0;
    for (const b of doc.blocks) if (b.style === 'H1') { if (entries[k]) entries[k].h1 = b.id; k++; }
    return doc;
  };
  let doc = make(null);
  await E.reg.ensureFaces([{ font: 'Carlito', b: false, i: false }, { font: 'Carlito', b: true, i: false }, { font: 'Carlito', b: false, i: true },
    { font: 'Caladea', b: false, i: false }, { font: 'Caladea', b: true, i: false }]);
  let info = '';
  if (E.lang.mayNeedLang(doc) && !(await E.lang.ensureDocLang(doc, { force: true }))) info = window.SlopI18n ? window.SlopI18n.t('eml.toast.font_missing') : 'eml.toast.font_missing';

  let layout = E.layoutDoc(doc), starts = startsOf(layout, entries);
  /* The final page numbers count the PDF pages copied in before each message. The cover shows them, so it is laid out
   * again with them (the number column is as wide as the "000" it was measured with). */
  const finalStarts = (st) => st.map((s, i) => s + 1 + entries.slice(0, i).reduce((n, e) => n + e.pdfs.reduce((a, f) => a + f.n, 0), 0));
  if (cover) {
    for (let pass = 0; pass < 3; pass++) {
      const nums = finalStarts(starts), pages = new Map(entries.map((e, i) => [e.pid, nums[i]]));
      doc = make(pages);
      layout = E.layoutDoc(doc);
      const again = startsOf(layout, entries);
      const same = again.every((v, i) => v === starts[i]);
      starts = again;
      if (same) break;
    }
  }
  const bytes = await E.exportPdf(doc, layout, { title: opts.title });
  const out = await PL.PDFDocument.load(bytes);
  // copy the PDF attachments in after their message, last message first so the earlier places stay put
  const total0 = layout.pages.length, copied = new Set();
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!entries[i].pdfs.length) continue;
    let at = (i + 1 < entries.length ? starts[i + 1] : total0);
    for (const f of entries[i].pdfs) {
      const pages = await out.copyPages(f.src, f.src.getPageIndices());
      for (const pg of pages) { out.insertPage(at, pg); copied.add(pg); at++; }
    }
  }
  const font = await out.embedFont(PL.StandardFonts.Helvetica), all = out.getPages(), n = all.length;
  all.forEach((pg, i) => {
    if (copied.has(pg)) return;
    const label = 'Page ' + (i + 1) + ' of ' + n, w = font.widthOfTextAtSize(label, 8.5);   // i18n-ignore: text in the PDF
    pg.drawText(label, { x: (pg.getWidth() - w) / 2, y: 26, size: 8.5, font, color: PL.rgb(0.4, 0.4, 0.4) });
  });
  out.setCreator('Slop EML');
  out.setProducer('Slop EML');
  return { bytes: await out.save({ useObjectStreams: true }), pages: n, starts: finalStarts(starts), order: list.map((d) => d.id), info,
    skipped: entries.flatMap((e) => e.skipped), replaced: 0, samples: [] };
}
