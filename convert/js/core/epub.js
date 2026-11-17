/* EPUB e-books (EPUB 2 and 3) read in reading order and written as plain text, Markdown or one HTML page. Browser only
 * (DOMParser); resolveHref is pure. The zip reader is the shared one (shared/office/zip.js), the text and Markdown come
 * from html-text.js and html-md.js, so a chapter reads like any other HTML.
 *   resolveHref(fromPath, href) -> path       a link inside the book as a zip path ('OEBPS/text/ch1.xhtml', '../img/a.png'
 *                                             -> 'OEBPS/img/a.png'); %20 and the like decoded, #fragment dropped
 *   readEpub(file) -> { title, author, chapters: [{ path, doc, html }], files }   the spine, in order. A book locked with
 *                                             DRM (its chapters listed in META-INF/encryption.xml) is refused.
 *   epubToText(book) / epubToMarkdown(book) -> text      the title and author first, then each chapter; pictures become
 *                                             their alt text
 *   epubToHtml(book) -> text                  every chapter in one page, pictures kept inside it as data: URLs */
import { readZip, readText } from '../../../shared/office/zip.js';
import { htmlToText } from './html-text.js';
import { nodeToMarkdown } from './html-md.js';
import { bytesToBase64 } from './text.js';
import { tr } from './i18n.js';

export function resolveHref(from, href) {
  const clean = String(href || '').split('#')[0].split('?')[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch (e) { /* a stray % stays as it is */ }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return '';   // http:, mailto:, data: are not in the book
  const parts = decoded.startsWith('/') ? [] : String(from || '').split('/').slice(0, -1);
  for (const p of decoded.split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return parts.join('/');
}

const xml = (text, what) => {
  const doc = new DOMParser().parseFromString(text || '', 'application/xml');
  if (!text || doc.getElementsByTagName('parsererror').length) throw new Error(tr('convert.epub.broken', { what: what() }));
  return doc;
};
const byName = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
const first = (doc, name) => (byName(doc, name)[0] || { textContent: '' }).textContent.trim();

function chapterDoc(text) {
  const d = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  return d.getElementsByTagName('parsererror').length || !byName(d, 'body').length ? new DOMParser().parseFromString(text, 'text/html') : d;
}

export async function readEpub(file) {
  let files;
  try { files = await readZip(file); } catch (e) { throw new Error(tr('convert.epub.not_zip')); }
  const container = xml(readText(files, 'META-INF/container.xml'), () => tr('convert.epub.part_container'));
  const opfPath = (byName(container, 'rootfile')[0] || { getAttribute: () => '' }).getAttribute('full-path');
  const opf = xml(opfPath && readText(files, opfPath), () => tr('convert.epub.part_opf'));
  const items = new Map(byName(opf, 'item').map((i) => [i.getAttribute('id'), resolveHref(opfPath, i.getAttribute('href'))]));
  const spine = byName(opf, 'itemref').map((r) => items.get(r.getAttribute('idref'))).filter((p) => p && files.has(p));
  const enc = readText(files, 'META-INF/encryption.xml');
  if (enc) {
    const locked = new Set(byName(xml(enc, () => tr('convert.epub.part_encryption')), 'CipherReference').map((c) => resolveHref('', c.getAttribute('URI')))); // i18n-ignore: an XML element name
    if (spine.some((p) => locked.has(p))) throw new Error(tr('convert.epub.drm'));
  }
  if (!spine.length) throw new Error(tr('convert.epub.no_spine'));
  const chapters = spine.map((path) => { const html = readText(files, path); return { path, html, doc: chapterDoc(html) }; });
  return { title: first(opf, 'title'), author: first(opf, 'creator'), chapters, files };
}

const bodyOf = (doc) => doc.body || byName(doc, 'body')[0] || doc.documentElement;
const header = (book, md) => [book.title && (md ? `# ${book.title}` : book.title), book.author && (md ? `*${book.author}*` : book.author)].filter(Boolean).join('\n\n');

/** Pictures replaced by their alt text (the text forms carry no pictures). */
function altOnly(doc) {
  for (const img of [...byName(doc, 'img'), ...byName(doc, 'image')]) {
    const alt = img.getAttribute('alt') || '';
    img.replaceWith(doc.createTextNode(alt ? `[${alt}]` : ''));
  }
  return doc;
}

export function epubToText(book) {
  const parts = book.chapters.map((c) => { const d = altOnly(c.doc.cloneNode(true)); return htmlToText(`<body>${bodyOf(d).innerHTML}</body>`).trim(); }).filter(Boolean);
  const head = header(book, false);
  return [head, ...parts].filter(Boolean).join('\n\n\n') + '\n';
}

export function epubToMarkdown(book) {
  const parts = book.chapters.map((c) => nodeToMarkdown(bodyOf(altOnly(c.doc.cloneNode(true)))).trim()).filter(Boolean);
  return [header(book, true), ...parts].filter(Boolean).join('\n\n') + '\n';
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STYLE = 'body{max-width:42em;margin:2em auto;padding:0 1em;font:1.1em/1.6 Georgia,serif;color:#111;background:#fff}img{max-width:100%;height:auto}section{margin-bottom:3em}';

export function epubToHtml(book) {
  const sections = book.chapters.map((c) => {
    const d = c.doc.cloneNode(true);
    for (const n of byName(d, 'script')) n.remove();
    for (const img of byName(d, 'img')) {
      const p = resolveHref(c.path, img.getAttribute('src')), bytes = p && book.files.get(p);
      if (bytes) img.setAttribute('src', `data:${MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`);
    }
    return `<section>\n${bodyOf(d).innerHTML.replace(/\s+xmlns(:\w+)?="[^"]*"/g, '').trim()}\n</section>`;
  });
  const title = book.title || 'Book'; // i18n-ignore: written into the HTML file
  const by = book.author ? `<p><em>${esc(book.author)}</em></p>\n` : '';
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${STYLE}</style>\n</head>\n<body>\n<h1>${esc(title)}</h1>\n${by}${sections.join('\n')}\n</body>\n</html>\n`;
}
