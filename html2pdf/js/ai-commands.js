/* Slop HTML to PDF for the assistant: SlopCmd commands with argument schemas, through the page's own source, sheet and
 * options (app.js, window.H2P.app). The PDF file is File convert's HTML to PDF operation (convert/js/core/pdf-extra.js,
 * html-to-pdf: the shared picture PDF, shared/convert/html-pdf.js) run on the page's print document, so no second PDF
 * writer is made; the page's own Print button still gives the vector PDF through the browser. ES module, imported by
 * SlopCmd.prepare(); files from Slop Drive through window.SlopCmdSources (shared/commands/sources.js, loaded here).
 *   h2p.ai.new-document   new_document   html | file, name, images[]
 *   h2p.ai.add-images     add_images     files[]                         pictures the HTML names by file name
 *   h2p.ai.set-page       set_page       paper, orientation, margin, scale, background, header, qr, qr_text
 *   h2p.ai.export-pdf     export_pdf     to drive|download|both, name */
import { PDF_EXTRA } from '../../convert/js/core/pdf-extra.js';

const H = window.H2P, A = H.app, C = window.SlopCmd;
if (!window.SlopCmdSources) await new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
  { src: new URL('../../shared/commands/sources.js', import.meta.url).href, onload: res, onerror: () => rej(new Error('Could not load sources.js')) })));
const OP = PDF_EXTRA.find((o) => o.id === 'html-to-pdf');
const $ = (id) => document.getElementById(id);
const pick = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = !!v; else e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'INPUT' && e.type === 'text' ? 'input' : 'change', { bubbles: true })); };
const files = async (list) => { const out = []; for (const q of list || []) { const r = await window.SlopCmdSources.driveFile(q); out.push(new File([r.blob], r.name, { type: r.type || r.blob.type || '' })); } return out; };

async function addImages(a) {
  const pics = (await files(a.files)).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(f.name));
  if (!pics.length) throw new Error('Give pictures from Slop Drive (the HTML names them by file name)');
  A.attachImages(pics);
  return `Attached ${pics.map((f) => f.name).join(', ')}.`;
}
async function newDocument(a) {
  if (a.html == null && !a.file) throw new Error('Give html (the HTML text) or file (an .html file in Slop Drive)');
  let name = a.name, html = a.html;
  if (a.file) {
    const [f] = await files([a.file]);
    if (!/\.html?$/i.test(f.name) && f.type !== 'text/html') throw new Error(`${f.name} is not an HTML file`);
    html = await f.text(); name = name || f.name;
  }
  if (!String(html).trim()) throw new Error('The HTML is empty');
  A.setSource(name ? (/\.html?$/i.test(name) ? name : name + '.html') : 'Pasted HTML', html);
  const note = a.images && a.images.length ? ' ' + (await addImages({ files: a.images })) : '';
  return `${A.st.name} is open on ${A.options().paper} ${A.options().orientation} paper.${note} Scripts, remote images and fonts are removed.`;
}
function setPage(a) {
  const map = { paper: 'h2p-paper', orientation: 'h2p-orient', margin: 'h2p-margin', scale: 'h2p-scale', background: 'h2p-bg', header: 'h2p-header', qr: 'h2p-qr-mode', qr_text: 'h2p-qr-text' };
  const given = Object.keys(map).filter((k) => a[k] != null);
  if (!given.length) throw new Error('Nothing to change: give paper, orientation, margin, scale, background, header, qr or qr_text');
  for (const k of given) pick(map[k], a[k]);
  const o = A.options();
  return `Page: ${o.paper} ${o.orientation}, ${o.margin} margins, scale ${o.scale}, header ${o.header ? 'on' : 'off'}.`;
}
async function exportPdf(a) {
  if (!A.hasSource()) throw new Error('Nothing is open: new_document first');
  const o = A.options(), doc = H.sheet.printDocument(o, A.cleaned(), o.fileName);
  const name = (a.name || o.fileName.replace(/\.html?$/i, '')) + '.pdf';
  const [r] = await OP.run([{ name: name.replace(/\.pdf$/, '.html'), file: new File([doc], name.replace(/\.pdf$/, '.html'), { type: 'text/html' }), kind: 'html' }], {});
  const out = [];
  if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopCmdSources.put(r.blob, name, 'html2pdf')})`);
  if (a.to !== 'drive') { const el = Object.assign(document.createElement('a'), { href: URL.createObjectURL(r.blob), download: name }); document.body.append(el); el.click(); el.remove(); out.push(`downloaded ${name}`); }
  return out.join(' and ') + '. It is a picture PDF on A4 (text is not selectable); the Print button gives a text PDF through the browser.';
}
function state() {
  const o = A.options();
  return { app: 'Slop HTML to PDF', open: A.hasSource() ? A.st.name : null, characters: A.st.html.length, images: [...A.st.images.keys()],
    page: { paper: o.paper, orientation: o.orientation, margin: o.margin, scale: o.scale, background: o.background, header: o.header }, status: A.status() };
}
function checkpoint() {
  const snap = { name: A.st.name, html: A.st.html };
  return () => { A.setSource(snap.name, snap.html); return true; };
}

const base = { group: 'AI', hidden: true };
C.register([
  Object.assign({ id: 'h2p.ai.new-document', tool: 'new_document', title: 'Open HTML', destructive: false,
    args: [{ name: 'html', type: 'string', maxLength: 2000000, description: 'the HTML to lay out (a whole page or a fragment)' }, { name: 'file', type: 'string', maxLength: 300, description: 'or an .html file in Slop Drive' },
      { name: 'name', type: 'string', maxLength: 120, description: 'the file name shown in the header' }, { name: 'images', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'Slop Drive pictures the HTML names' }],
    run: newDocument, description: 'Lay out HTML you write (or an .html file from Slop Drive) on paper, ready to save as PDF.' }, base),
  Object.assign({ id: 'h2p.ai.add-images', tool: 'add_images', title: 'Attach pictures', destructive: false,
    args: [{ name: 'files', type: 'array', required: true, maxItems: 50, items: { type: 'string' }, description: 'Slop Drive picture names or ids' }], run: addImages,
    description: 'Attach pictures that the HTML refers to by file name (img src="logo.png").' }, base),
  Object.assign({ id: 'h2p.ai.set-page', tool: 'set_page', title: 'Page settings', destructive: false,
    args: [{ name: 'paper', type: 'enum', values: ['A4', 'Letter', 'A5', 'Legal'] }, { name: 'orientation', type: 'enum', values: ['portrait', 'landscape'] },
      { name: 'margin', type: 'enum', values: ['normal', 'narrow', 'none'] }, { name: 'scale', type: 'enum', values: ['fit', '100'] },
      { name: 'background', type: 'boolean', description: 'print background colours and pictures' }, { name: 'header', type: 'boolean', description: 'the header with file name, date and QR code' },
      { name: 'qr', type: 'enum', options: [['file', 'the file name'], ['url', 'a URL'], ['text', 'custom text']] }, { name: 'qr_text', type: 'string', maxLength: 500 }],
    run: setPage, description: 'Paper size, orientation, margins, scale, backgrounds and the header.' }, base),
  Object.assign({ id: 'h2p.ai.export-pdf', tool: 'export_pdf', title: 'Save as PDF', destructive: false,
    args: [{ name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' }, { name: 'name', type: 'string', maxLength: 120 }],
    run: exportPdf, description: 'Save the laid-out HTML as a PDF file in Slop Drive and/or as a download.' }, base),
]);
C.provide({ state, checkpoint });
