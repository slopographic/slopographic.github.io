/* Export a note as Markdown (.md, the body as it is), one standalone HTML page (.html, styles inline), plain text (.txt),
 * a Word-compatible HTML file (.doc), or the print view for PDF (the browser's print dialog: Save as PDF). A whole notebook
 * goes out as a zip of Markdown or HTML files, in folders, through the shared zip writer. Nothing is uploaded: the files
 * are made in the page and downloaded through SlopUI.download. */
import { render, esc } from './markdown.js';
import { plainText } from './plain.js';
import { writeZip } from '../../shared/office/zip.js';

const PAGE_CSS = 'body{max-width:44em;margin:2.5em auto;padding:0 16px;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1c19;background:#fbfaf6}' +
  'h1,h2,h3{line-height:1.25}code{font:0.9em ui-monospace,Menlo,Consolas,monospace;background:#f1efe8;padding:0.1em 0.3em;border-radius:4px}' +
  'pre{background:#f1efe8;padding:12px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}blockquote{margin:0;padding-left:14px;border-left:3px solid #b6b09f;color:#5f5b52}' +
  'img{max-width:100%}a{color:#3d6b00}table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid #d6d2c6;padding:6px 10px;vertical-align:top}th{background:#f1efe8}' +
  '.md-table{overflow:auto}aside.md-callout{border-left:4px solid #3d6b00;background:#f1efe8;padding:8px 14px;border-radius:6px;margin:1em 0}' +
  '.md-callout-title{font-weight:600;margin:0 0 .3em}.md-warning{border-color:#b26a00}.md-video{border-color:#1d4f91}';
const PRINT_CSS = '@page{size:A4;margin:18mm}body{max-width:none;margin:0;padding:0;background:#fff}';
const EXT = { md: '.md', html: '.html', txt: '.txt', doc: '.doc' };

/** A file name from a title: no slashes or control characters, short. */
export function fileBase(title) {
  return String(title || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
}

/** The whole standalone page for a note, with its styles inline. */
function page(n, css = PAGE_CSS) {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="generator" content="Slop Notes">\n<title>' + esc(n.title || 'Untitled') + '</title>\n<style>' + css + '</style>\n</head>\n<body>\n<article>\n' +
    render(n.body || '') + '\n</article>\n</body>\n</html>\n';
}

export function noteToMarkdown(n) {
  return new Blob([n.body || ''], { type: 'text/markdown;charset=utf-8' });
}

export function noteToHtml(n) {
  return new Blob([page(n)], { type: 'text/html;charset=utf-8' });
}

export function noteToText(n) {
  return new Blob([(n.title ? n.title + '\n\n' : '') + plainText(n.body)], { type: 'text/plain;charset=utf-8' });
}

/** Word opens HTML saved as .doc with the Office namespaces (the page is rendered the same way). */
export function noteToDoc(n) {
  const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n' +
    '<head>\n<meta charset="utf-8">\n<meta name="ProgId" content="Word.Document">\n<meta name="Generator" content="Slop Notes">\n<title>' + esc(n.title || 'Untitled') + '</title>\n' +
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->\n' +
    '<style>' + PAGE_CSS + '</style>\n</head>\n<body>\n<div class="Section1">\n' + render(n.body || '') + '\n</div>\n</body>\n</html>\n';
  return new Blob([doc], { type: 'application/msword' });
}

/** The print view: the note in a hidden frame with the print dialog open (Save as PDF gives the PDF). */
export function printNote(n) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const done = () => frame.remove();
  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    w.addEventListener('afterprint', done, { once: true });
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { done(); } }, 50);
  }, { once: true });
  setTimeout(done, 120000);
  frame.srcdoc = page(n, PAGE_CSS + PRINT_CSS);
  document.body.append(frame);
}

/** The file for a note in a format (md, html, txt, doc), as a Blob. */
export function blobFor(n, format) {
  if (format === 'html') return noteToHtml(n);
  if (format === 'txt') return noteToText(n);
  if (format === 'doc') return noteToDoc(n);
  return noteToMarkdown(n);
}

/** Downloads the note as md, html, txt or doc, or opens the print view for pdf. Returns the file name ('' for pdf). */
export function download(n, format) {
  if (format === 'pdf') { printNote(n); return ''; }
  const name = fileBase(n.title) + (EXT[format] || EXT.md);
  SlopUI.download(blobFor(n, format), name);
  return name;
}

/** A zip of a notebook: one file per note, in its folders (nested folders become nested directories). */
export function notebookZip(notes, folders, format) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const dirs = (f) => {
    const names = [], seen = new Set();
    for (let cur = f; cur && !seen.has(cur.id); cur = byId.get(cur.parent)) { seen.add(cur.id); names.unshift(fileBase(cur.title)); }
    return names;
  };
  const ext = format === 'html' ? '.html' : '.md';
  const used = new Set();
  const entries = notes.map((n) => {
    const dir = n.folder ? dirs(byId.get(n.folder)) : [];
    let path = [...dir, fileBase(n.title) + ext].join('/');
    for (let k = 2; used.has(path); k++) path = [...dir, fileBase(n.title) + ' (' + k + ')' + ext].join('/');
    used.add(path);
    return { path, data: format === 'html' ? page(n) : n.body || '' };
  });
  return writeZip(entries);
}
