/* Slop Code: Run. HTML files show their page in the preview; JavaScript files run on their own. The open
 * editor text is used for every file that is open, so unsaved edits run. Each run reloads the frame. */
import { projectFiles } from './drive.js';
import { htmlPreview, scriptPreview } from './preview-doc.js';
import { extOf } from './lang.js';

let runs = 0;
let frame = null, consoleEl = null, onMessage = null;

/** Wire the preview frame and console list, and listen for console messages from the frame. */
export function attachPreview(f, list) {
  frame = f; consoleEl = list;
  if (onMessage) window.removeEventListener('message', onMessage);
  onMessage = (e) => {
    if (!frame || e.source !== frame.contentWindow || !e.data || e.data.slopCode !== 'console') return;
    addLine(e.data.level, e.data.text);
  };
  window.addEventListener('message', onMessage);
}
function addLine(level, text) {
  if (!consoleEl) return;
  const li = document.createElement('li');
  li.className = 'cd-cl cd-cl-' + (level === 'error' || level === 'warn' ? level : 'log');
  li.textContent = text;
  consoleEl.append(li);
  while (consoleEl.children.length > 300) consoleEl.firstElementChild.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
export function clearConsole() { if (consoleEl) consoleEl.replaceChildren(); }

/** Can this document be run? HTML and JavaScript only. */
export const canRun = (name) => ['html', 'htm', 'js', 'mjs', 'cjs'].includes(extOf(name));

/**
 * Run a document. `doc` is { id, name, folderId }, `text` its editor text, and `openText(id)` returns the
 * editor text of an open document (or undefined). Returns the number of files that were inlined.
 */
export async function runDoc(doc, text, openText) {
  if (!frame) return 0;
  runs++;
  clearConsole();
  const ext = extOf(doc.name);
  let html;
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    html = scriptPreview(text, runs);
  } else {
    const files = await projectFiles(doc.folderId);
    for (const [path, rec] of files) {
      const open = openText(rec.id); // an open tab's text, unsaved edits included
      files.set(path, { blob: rec.blob, text: open !== undefined ? async () => open : () => rec.blob.text() });
    }
    html = await htmlPreview(text, files, runs);
  }
  frame.srcdoc = html;
  return runs;
}
