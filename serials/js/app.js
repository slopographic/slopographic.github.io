/* Slop Serial counter: many photos in, each read once on this device, a table of unique serials and a table of totals.
 * Recognition is the site's OCR engine (shared/ocr/engines.js) with its quick model (PP-OCRv4 in the inference worker,
 * or Tesseract's English model where PaddleOCR is not offered or the person chose Tesseract), as on the OCR page. Photos
 * stay in this browser. The rules (pattern, tally, CSV) are in extract.js. */
import { DEFAULT_PATTERN, serialsFor, serialsIn, tally, csvOf } from './extract.js';

const T = window.SlopAITools, E = window.SlopOcrEngines;
const $ = (id) => document.getElementById(id);
const MAX_SIDE = 2200; // photos are scaled down to this long side before reading: enough for small print, quicker to read
const state = { photos: [], busy: false, nextId: 1 };

const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const say = (s) => { $('msg').textContent = s; };
const pattern = () => $('pattern').value.trim() || DEFAULT_PATTERN;
/** A photo's serials for the page; an invalid pattern shows no serials (the message says why). */
const serialsOf = (p) => { try { return serialsFor(p, pattern()); } catch (e) { return []; } };
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name);

/** Adds the photos given; the first use shows the first-use notice (Your files stay in this browser…). */
async function addFiles(list) {
  const all = [...list];
  const files = all.filter(isImage);
  if (!files.length) { say(t('serials.app.only_photos')); return; }
  for (const f of files) {
    state.photos.push({ id: state.nextId++, name: f.name, file: f, text: '', read: false, error: null, manual: new Set(), removed: new Set() });
  }
  const skipped = all.length - files.length;
  say(t(skipped ? 'serials.app.added_skipped' : 'serials.app.added', { n: files.length, m: skipped }));
  render();
}

async function readOne(p, onProgress) {
  const { bitmap, w, h } = await T.image(p.file, { maxSide: MAX_SIDE });   // scaled in aitools/common.js
  const r = await E.run(E.quick(), { bitmap, w, h }, { onProgress });
  p.text = r.lines.map((l) => l.text).join('\n');
  p.read = true;
  p.error = null;
}

async function readAll() {
  const todo = state.photos.filter((p) => !p.read);
  if (state.busy || !todo.length) return;
  state.busy = true;
  const prog = $('prog');
  prog.value = 0;
  render();
  try {
    await E.load(E.quick(), say);
    for (const [k, p] of todo.entries()) {
      say(t('serials.app.reading', { name: p.name, i: k + 1, n: todo.length }));
      try {
        await readOne(p, (q) => { prog.value = q.total ? q.done / q.total : 0; });
      } catch (e) {
        p.error = e.message; // the photo stays unread, so Read photos tries it again
      }
      render();
    }
    const found = tally(state.photos, pattern()).totals;
    say(t('serials.app.read_done', { n: found.read, unique: t('serials.app.n_unique', { n: found.quantity }) }));
  } catch (e) {
    say(e.message);
  } finally {
    state.busy = false;
    render();
  }
}

/** A typed serial is added to the photo; a found one is removed from it, and a typed one is simply taken off. */
function changeSerial(p, s, add) {
  if (add) { p.removed.delete(s); p.manual.add(s); } else if (p.manual.has(s)) p.manual.delete(s); else p.removed.add(s);
  render();
}

function photoRow(p) {
  const li = el('li', 'sr-photo');
  const head = el('div', 'sr-photo-head');
  head.append(el('span', 'sr-name', p.name), el('span', 'sr-status', p.error ? t('serials.app.could_not_read', { error: p.error }) : p.read ? t('serials.app.status_read') : t('serials.app.not_read')));
  li.append(head);
  const chips = el('div', 'sr-chips');
  for (const s of p.read ? serialsOf(p) : []) {
    const c = el('span', 'sr-chip', s);
    const x = el('button', 'sr-chip-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', t('serials.app.remove_serial', { serial: s, name: p.name }));
    x.addEventListener('click', () => changeSerial(p, s, false));
    c.append(x);
    chips.append(c);
  }
  if (p.read && !chips.childNodes.length) chips.append(el('span', 'sr-none', t('serials.app.no_serial')));
  li.append(chips);
  const form = el('form', 'sr-add');
  const input = el('input');
  input.placeholder = t('serials.app.type_serial');
  input.setAttribute('aria-label', t('serials.app.add_serial', { name: p.name }));
  const btn = el('button', null, t('serials.app.add'));
  btn.type = 'submit';
  form.append(input, btn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = input.value.trim().toUpperCase();
    if (!s) return;
    if (!serialsIn(s, pattern()).includes(s)) { say(t('serials.app.no_match', { serial: s })); return; }
    changeSerial(p, s, true);
  });
  li.append(form);
  return li;
}

function renderPhotos() {
  $('photos').replaceChildren(...state.photos.map(photoRow));
}

function renderUnique(rows) {
  $('unique').replaceChildren(...rows.map((r) => {
    const tr = el('tr');
    tr.append(el('td', 'sr-mono', r.serial), el('td', null, String(r.count)), el('td', null, r.photos.join(', ')));
    return tr;
  }));
  $('unique-empty').hidden = rows.length > 0;
}

function renderTotals(n) {
  const items = [
    ['t_photos', n.photos], ['t_read', n.read], ['t_with', n.withSerial], ['t_review', n.needsReview], ['t_unique', n.quantity],
    ['t_hits', n.hits], ['t_repeats', n.repeats],
  ];
  $('totals').replaceChildren(...items.flatMap(([k, v]) => [el('dt', null, t('serials.app.' + k)), el('dd', 'sr-num', String(v))]));
}

/** Enables the buttons the state allows, and redraws the tables from the photos. */
function render() {
  let res;
  try {
    res = tally(state.photos, pattern());
    $('pattern').classList.remove('bad');
  } catch (e) {
    $('pattern').classList.add('bad');
    say(e.message);
    res = { unique: [], totals: { photos: state.photos.length, read: 0, withSerial: 0, needsReview: 0, hits: 0, quantity: 0, repeats: 0 } };
  }
  $('work').hidden = state.photos.length === 0;
  $('read').disabled = state.busy || !state.photos.some((p) => !p.read);
  $('clear').disabled = state.busy;
  $('prog').hidden = !state.busy;
  $('export-serials').disabled = res.unique.length === 0;
  $('export-photos').disabled = state.photos.length === 0;
  renderPhotos();
  renderUnique(res.unique);
  renderTotals(res.totals);
}

/** Saves a CSV: SlopAITools.download (aitools/common.js), the tools' one copy. */
function download(name, text) { window.SlopAITools.download(name, text, 'text/csv;charset=utf-8'); }

const serialsCsv = () => csvOf([['Serial', 'Count', 'Photos'], ...tally(state.photos, pattern()).unique.map((r) => [r.serial, r.count, r.photos.join('; ')])]);   // i18n-ignore: the CSV's columns stay English (a file the user makes)
const photosCsv = () => csvOf([['Photo', 'Status', 'Serials'], ...state.photos.map((p) => [p.name, p.error ? 'Could not read' : p.read ? 'Read' : 'Not read', p.read ? serialsOf(p).join('; ') : ''])]);   // i18n-ignore
function exportSerials() { download('serials.csv', serialsCsv()); }
function exportPhotos() { download('photos.csv', photosCsv()); }

function wire() {
  // The one way in (shared/intake, spec 'serials'): the box (click to choose photos, or a drop on it) and a paste, after
  // the first-use notice (the intake's, once per batch). A paste waits for the gate to show the page.
  window.SlopIntake.register({
    id: 'serials', accept: { types: ['image/*'], exts: ['.jpg', '.jpeg', '.png', '.webp'], noun: 'serials.app.a_photo' },
    notice: { title: 'Serial counter', lines: [t('serials.app.notice')], downloads: [] },
    gate: (batch) => !$('ui').hidden || batch.source !== 'paste',
    processAll: async (files) => { drop.classList.remove('over'); await addFiles(files); return files.map((f) => f.name); },
  });
  const drop = $('drop');
  drop.addEventListener('click', () => window.SlopIntake.pick({ to: 'serials', accept: 'image/*' }));
  window.SlopIntake.dropTarget(drop, { to: 'serials' });
  drop.addEventListener('dragenter', () => drop.classList.add('over'));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  $('pattern').addEventListener('input', () => render());
  $('read').addEventListener('click', readAll);
  $('export-serials').addEventListener('click', exportSerials);
  $('export-photos').addEventListener('click', exportPhotos);
  $('clear').addEventListener('click', () => {
    if (state.busy) return;
    state.photos = [];
    say(t('serials.app.cleared'));
    render();
  });
}

wire();
// a language change: the photo rows and the totals again (the status line keeps what it said)
if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (!$('ui').hidden) render(); });
// The assistant's commands with arguments (ai-commands.js) work on the same state, through these.
window.SlopSerials = { state, DEFAULT_PATTERN, addFiles, readAll, changeSerial, render, pattern, serialsOf, tally: () => tally(state.photos, pattern()), serialsCsv, photosCsv };
if (window.SlopCmd) {
  window.SlopCmd.init({ app: 'serials' });
  if (window.SlopCmd.provide) window.SlopCmd.provide({ prepare: () => import('./ai-commands.js') });
}
T.gate('ocr', () => {
  $('ui').hidden = false;
  render();
});
