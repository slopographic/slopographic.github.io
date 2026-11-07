/* Slop OCR for the assistant: SlopCmd commands with argument schemas, through the page's own actions (app.js,
 * window.SlopOcrPage: addFiles, readAll, the outputs of export.js). Imported by SlopCmd.prepare(); files from Slop Drive
 * or this site through window.SlopCmdSources (shared/commands/sources.js, loaded here). Reading uses the model the page
 * would (the language choice, the model gate and its downloads stay the page's).
 *   ocr.ai.new-document   new_document   (none)                         destructive: drops the text read
 *   ocr.ai.add-files      add_files      files[], urls[]                pictures and PDFs
 *   ocr.ai.read-text      read_text      (none)                         reads every page not read yet, returns the text
 *   ocr.ai.set-text       set_text       page, text                     corrects a page's text
 *   ocr.ai.export-text    export_text    format txt|md|docx|pdf, to drive|download|both */
const P = window.SlopOcrPage, C = window.SlopCmd;
if (!window.SlopCmdSources) await new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
  { src: new URL('../../shared/commands/sources.js', import.meta.url).href, onload: res, onerror: () => rej(new Error('Could not load sources.js')) })));
const S = P.state, plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const notBusy = () => { if (S.busy) throw new Error('Slop OCR is busy; wait for it first'); };
const MIME = { txt: 'text/plain', md: 'text/markdown' };

async function addFiles(a) {
  notBusy();
  const src = window.SlopCmdSources, files = [];
  for (const q of a.files || []) { const r = await src.driveFile(q); files.push(new File([r.blob], r.name, { type: r.type || r.blob.type || '' })); }
  for (const u of a.urls || []) { const r = await src.siteFile(u); files.push(new File([r.blob], r.name, { type: r.blob.type || '' })); }
  if (!files.length) throw new Error('Give files (Slop Drive names or ids) or urls (pictures on this site)');
  const before = S.pages.length;
  await P.addFiles(files);
  const n = S.pages.length - before;
  if (!n) throw new Error('No page could be opened (Slop OCR reads pictures and PDFs): ' + document.getElementById('msg').textContent);
  return `Added ${plural(n, 'page', 'pages')} (${S.pages.length} in all). Use read_text to read them.`;
}
async function readText() {
  notBusy();
  if (!S.pages.length) throw new Error('Nothing is open: add_files first');
  await P.readAll();
  const failed = S.pages.filter((p) => p.error), unread = S.pages.filter((p) => !p.done);
  if (unread.length && unread.length === S.pages.length) throw new Error(document.getElementById('msg').textContent || 'The text could not be read');
  const text = P.plainText(P.outPages());
  return { done: `Read ${plural(S.pages.length - unread.length, 'page', 'pages')}${failed.length ? `; ${failed.length} failed (${failed[0].error})` : ''}.`, text: text.slice(0, 6000) + (text.length > 6000 ? '…' : '') };
}
function setText(a) {
  notBusy();
  const p = S.pages[(a.page || 1) - 1];
  if (!p) throw new Error(`There is no page ${a.page} (${S.pages.length} open)`);
  if (!p.done) throw new Error('Read the page first (read_text)');
  Object.assign(p, { text: String(a.text), edited: true });
  P.refresh();
  return `Page ${a.page || 1} now holds the corrected text.`;
}
async function exportText(a) {
  notBusy();
  if (!S.pages.length || !S.pages.every((p) => p.done)) throw new Error('Read every page first (read_text)');
  const f = a.format, pages = P.outPages();
  const blob = f === 'pdf' ? await P.pdfBlob() : f === 'docx' ? await P.docxFile(pages, { title: P.stem() })
    : new Blob([f === 'md' ? P.markdownText(pages) : P.plainText(pages)], { type: MIME[f] });
  const name = `${a.name || P.stem()}.${f}`, out = [];
  if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopCmdSources.put(blob, name, 'ocr')})`);
  if (a.to !== 'drive') { const el = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); document.body.append(el); el.click(); el.remove(); out.push(`downloaded ${name}`); }
  return out.join(' and ') + '.';
}
function state() {
  return { app: 'Slop OCR', busy: S.busy, page: S.cur + 1, message: document.getElementById('msg').textContent,
    pages: S.pages.slice(0, 40).map((p, i) => ({ page: i + 1, label: p.label, read: !!p.done, error: p.error || null, text: p.done ? String(p.text || '').slice(0, 400) : null })) };
}
function checkpoint() {
  const texts = S.pages.map((p) => ({ p, text: p.text, edited: p.edited }));
  return () => { for (const t of texts) Object.assign(t.p, { text: t.text, edited: t.edited }); P.refresh(); return true; };
}

const base = { group: 'AI', hidden: true };
C.register([
  Object.assign({ id: 'ocr.ai.new-document', tool: 'new_document', title: 'Start over', destructive: true, args: [], run: () => { notBusy(); P.clearAll(); return 'Cleared: add_files to start again.'; },
    description: 'Close every page and the text read from them.' }, base),
  Object.assign({ id: 'ocr.ai.add-files', tool: 'add_files', title: 'Add pictures or PDFs', destructive: false,
    args: [{ name: 'files', type: 'array', maxItems: 100, items: { type: 'string' }, description: 'Slop Drive file names or ids (pictures or PDFs)' },
      { name: 'urls', type: 'array', maxItems: 20, items: { type: 'string' }, description: 'or addresses of pictures on this site' }],
    run: addFiles, description: 'Open photos, scans or PDFs from Slop Drive to read their text.' }, base),
  Object.assign({ id: 'ocr.ai.read-text', tool: 'read_text', title: 'Read text', destructive: false, args: [], run: readText,
    description: 'Read the text of every page on this device and return it.' }, base),
  Object.assign({ id: 'ocr.ai.set-text', tool: 'set_text', title: 'Correct a page\'s text', destructive: false,
    args: [{ name: 'page', type: 'number', min: 1, max: 1000, integer: true, default: 1 }, { name: 'text', type: 'string', maxLength: 100000, required: true }],
    run: setText, description: 'Replace the text read from one page (to fix what was misread) before saving it.' }, base),
  Object.assign({ id: 'ocr.ai.export-text', tool: 'export_text', title: 'Save the text', destructive: false,
    args: [{ name: 'format', type: 'enum', options: [['txt', 'Text'], ['md', 'Markdown'], ['docx', 'Word'], ['pdf', 'Searchable PDF']], default: 'txt' },
      { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },
      { name: 'name', type: 'string', maxLength: 120, description: 'file name without extension' }],
    run: exportText, description: 'Save the text as plain text, Markdown, Word or a searchable PDF, to Slop Drive and/or a download.' }, base),
]);
C.provide({ state, checkpoint });
