/* Slop Transcribe: drawing the file list and the transcript pane from the queue. No state of its own: the selection and
 * the "show times" choice are app.js's. Sizes and lengths read as people write them. */
import { languageName } from './languages.js';
import { tr } from './words.js';
const $ = (id) => document.getElementById(id);
const X = () => globalThis.SlopTranscript;
const STATUS_EN = { waiting: 'Waiting', reading: 'Transcribing…', done: 'Done', error: 'Could not read' };
const status = (s) => tr('transcribe.list.' + s, STATUS_EN[s]);

/** Pure: "4.2 MB · 03:12" for a file, its length once known. */
export function metaOf(item) {
  const mb = item.size >= 1e6 ? `${(item.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(item.size / 1e3))} KB`;
  return [mb, item.seconds ? X().clock(item.seconds) : ''].filter(Boolean).join(' · ');
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** One row of the file list. */
function row(item, selected, actions) {
  const li = el('li', 'tr-file' + (item.id === selected ? ' is-on' : ''));
  li.dataset.id = item.id;
  li.tabIndex = 0;
  li.setAttribute('aria-selected', String(item.id === selected));
  const main = el('div', 'tr-file-main');
  main.append(el('span', 'tr-file-name', item.name), el('span', 'tr-file-meta', metaOf(item)));
  const chip = el('span', `tr-chip is-${item.status}`, item.status === 'reading' ? `${Math.round(item.progress * 100)}%` : status(item.status));
  const x = el('button', 'tr-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', tr('transcribe.list.remove', 'Remove {name}', { name: item.name }));
  x.addEventListener('click', (e) => { e.stopPropagation(); actions.remove(item.id); });
  li.append(main, chip, x);
  if (item.status === 'reading') { const bar = el('progress', 'tr-prog'); bar.max = 1; bar.value = item.progress; li.append(bar); }
  if (item.error) li.append(el('p', 'tr-err', item.error));
  li.addEventListener('click', () => actions.select(item.id));
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actions.select(item.id); } });
  return li;
}

/** The list, the counts and the buttons the state allows. */
export function drawList(q, selected, actions) {
  const list = q.items;
  $('trFiles').replaceChildren(...list.map((it) => row(it, selected, actions)));
  $('trEmpty').hidden = list.length > 0;
  const waiting = list.filter((x) => x.status === 'waiting' || x.status === 'error').length;
  $('trRun').disabled = q.busy || !waiting;
  $('trRun').textContent = q.busy ? status('reading') : waiting > 1 ? tr('transcribe.list.run_n', 'Transcribe {n} files', { n: waiting }) : tr('transcribe.app.run', 'Transcribe');
  $('trStop').hidden = !q.busy;
  $('trClear').disabled = q.busy || !list.length;
  $('trCount').textContent = list.length ? tr('transcribe.list.count', '{done} of {n} done', { done: list.filter((x) => x.status === 'done').length, n: list.length }) : '';
}

/** "412 words" (the count formatted for the language). */
function words(text) { const n = X().words(text); return tr('transcribe.list.words', n === 1 ? '{n} word' : '{n} words', { n }); }

/** The transcript pane for the selected item: its text (editable once done), its meta, and the export buttons. */
export function drawTranscript(item, { times }) {
  const done = !!item && item.status === 'done';
  $('trPaneTitle').textContent = item ? item.name : tr('transcribe.app.transcript', 'Transcript');
  $('trPaneMeta').textContent = !item ? tr('transcribe.list.hint', 'Add a file or record your voice, then press Transcribe.')
    : done ? [metaOf(item), item.language ? tr('transcribe.list.language', 'language {name}', { name: languageName(item.language) }) : '', words($('trText').value)].filter(Boolean).join(' · ')
      : item.status === 'error' ? item.error : status(item.status);
  for (const id of ['trCopy', 'trDownload', 'trFormat', 'trDrive', 'trDocs', 'trTimes']) $(id).disabled = !done;
  $('trText').readOnly = !done;
  $('trEdited').hidden = !(done && item.text != null);
}

/** The text the box shows for an item: the corrections, or the segments (with times when asked). */
export function textFor(item, { times }) {
  if (!item || item.status !== 'done') return '';
  return item.text != null ? item.text : X().txt(item.segments, { times });
}
