/* The editor pane: title, tags, Markdown source and the live preview. Typing saves in the background (store.touch). */
import * as store from './store.js';
import { S, curNote } from './state.js';
import * as A from './actions.js';
import { render } from './markdown.js';
import { tablesFromHtml } from './table.js';
import { $, t } from './dom.js';

const tagsFrom = (text) => [...new Set(String(text).split(',').map((tag) => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 30);
let redrawList = () => {};

export function renderPreview() {
  const n = curNote();
  $('nt-preview').innerHTML = render(n ? n.body : '');
}

function applyMode() {
  const panes = $('nt-panes');
  panes.dataset.mode = S.mode;
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode));
}

export function renderEditor() {
  const n = curNote();
  $('nt-empty-note').hidden = !!n;
  $('nt-note').hidden = !n;
  if (!n) return;
  $('nt-title').value = n.title;
  $('nt-tags-in').value = n.tags.join(', ');
  $('nt-body').value = n.body;
  $('nt-pin').textContent = n.pinned ? t('notes.app.unpin') : t('notes.app.pin');
  $('nt-pin').setAttribute('aria-pressed', String(n.pinned));
  renderPreview();
  applyMode();
}

export function setMode(mode) {
  S.mode = mode;
  applyMode();
}

/** Writes a block at the caret of the Markdown source, after a blank line when the text needs one. It goes in with
 * execCommand, so the undo history keeps it, and then saves like typing. sel = [from, to] selects part of the block
 * (the caret after a code fence's opening line, say). Returns false when no note is open. */
export function insertAtCaret(block, sel = null) {
  const ta = $('nt-body');
  if (!curNote() || !ta) return false;
  const v = ta.value;
  const s = ta.selectionStart ?? v.length, e = ta.selectionEnd ?? s;
  const before = v.slice(0, s), after = v.slice(e);
  const lead = !before || /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n';
  const tail = !after || /^\n\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n';
  const text = lead + block + tail;
  ta.focus();
  ta.setSelectionRange(s, e);
  if (!document.execCommand('insertText', false, text)) {
    ta.value = before + text + after;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const base = s + lead.length;
  ta.setSelectionRange(base + (sel ? sel[0] : block.length), base + (sel ? sel[1] : block.length));
  return true;
}

/** A paste with an HTML table (a web page or a spreadsheet) goes in as Markdown tables. Anything else pastes as it is. */
function onPaste(e) {
  const html = e.clipboardData ? e.clipboardData.getData('text/html') : '';
  if (!/<table[\s>]/i.test(html)) return;
  const tables = tablesFromHtml(html);
  if (!tables.length) return;
  e.preventDefault();
  insertAtCaret(tables.join('\n\n'));
}

/** Connects the editor controls. redraw refreshes the list and sidebar after a title or tag change. */
export function wireEditor(redraw) {
  redrawList = redraw.list;
  $('nt-title').addEventListener('input', (e) => {
    const n = curNote(); if (!n) return;
    n.title = e.target.value;
    store.touch(n);
    redraw.list();
  });
  $('nt-tags-in').addEventListener('input', (e) => {
    const n = curNote(); if (!n) return;
    n.tags = tagsFrom(e.target.value);
    store.touch(n);
    redraw.side(); redraw.list();
  });
  $('nt-body').addEventListener('input', (e) => {
    const n = curNote(); if (!n) return;
    n.body = e.target.value;
    store.touch(n);
    renderPreview();
    redrawList();
  });
  $('nt-body').addEventListener('paste', onPaste); // intake-ok: a table pasted as HTML becomes Markdown text
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
  $('nt-pin').addEventListener('click', () => A.togglePin());
  $('nt-back').addEventListener('click', () => A.setPane('list'));
}
