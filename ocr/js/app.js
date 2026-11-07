/* Slop OCR page: files in, text out. Recognition runs through the OCR engines (shared/ocr/engines.js, window.SlopOcrEngines:
 * PaddleOCR in the inference worker of aitools/common.js, or Tesseract), with the engine chosen under Text recognition
 * engine (Auto by default). The model is only used after the gate passes; nothing downloads here except from the Language
 * and model dialog (shared/ocr/choose.js): without a choice the quick model reads first (PaddleOCR's bundled Chinese and
 * English one), and a line under the text offers the model for another script when the text looks like one. Layout,
 * outputs and drawing live in the modules beside this file. */
import { isSupported, openFile, renderPage } from './sources.js';
import { linesToText, rowsOf } from './layout.js';
import { drawPage } from './overlay.js';
import { plainText, markdownText, docxFile, searchablePdf, jpegBytes, saveBlob, copyText } from './export.js';
import { sampleReceipt } from './sample.js';
import { createOcrChoice } from '../../shared/ocr/choose.js';

const T = window.SlopAITools, E = window.SlopOcrEngines;
const $ = (id) => document.getElementById(id);
const EXPORT_IDS = ['dlTxt', 'dlMd', 'dlDocx', 'dlPdf', 'copy'];
const state = { pages: [], cur: 0, busy: false, shown: null };
const choice = createOcrChoice({ ui: window.SlopUI, storageHref: '../settings/#storage' });
let dropZone = null;   // the SlopDrop zone (its preview shows while no page is open)

const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const say = (s) => { $('msg').textContent = s; };
/** What the page makes and how: in the drop zone once the tool can run, and above the model prompt before that. */
const PREVIEW = () => ({
  picture: { src: '../assets/shots/ocr.jpg', alt: 'ocr.drop.alt' },
  steps: ['ocr.drop.step1', 'ocr.drop.step2', 'ocr.drop.step3'],
});
const allRead = () => state.pages.length > 0 && state.pages.every((p) => p.done);
const stem = () => {
  const f = state.pages[0] && state.pages[0].file;
  return (f ? f.name.replace(/\.[^.]+$/, '') : 'document').replace(/[\\/:*?"<>|]+/g, '_') + '-ocr';
};

/** Enables the Read and export buttons that the current state allows. */
function refresh() {
  const n = state.pages.length;
  $('work').hidden = n === 0;
  if (dropZone) dropZone.empty(!n); // the preview in the zone is for an empty page only
  $('read').disabled = state.busy || n === 0 || allRead();
  $('pages').replaceChildren(...state.pages.map((p, i) => new Option(`${i + 1}. ${p.done ? p.label : t('ocr.app.not_read', { label: p.label })}`, String(i))));
  $('pages').value = String(state.cur);
  $('prev').disabled = state.cur <= 0;
  $('next').disabled = state.cur >= n - 1;
  const ready = allRead() && !state.busy;
  for (const id of EXPORT_IDS) $(id).disabled = !ready;
  const p = state.pages[state.cur];
  $('text').readOnly = !p || !p.done;
  if (p && document.activeElement !== $('text')) $('text').value = p.text || '';
}

/** The picture of a page, from the cache when it is the one on screen. */
async function canvasOf(i) {
  if (state.shown && state.shown.i === i) return state.shown.canvas;
  const canvas = await renderPage(state.pages[i]);
  state.shown = { i, canvas };
  return canvas;
}
async function paint() {
  const p = state.pages[state.cur];
  if (!p) return;
  const i = state.cur, canvas = await canvasOf(i);
  if (i !== state.cur) return;
  drawPage($('preview'), canvas, p.lines || [], $('boxes').checked);
}
async function show(i) {
  if (i < 0 || i >= state.pages.length) return;
  state.cur = i;
  state.shown = null;
  refresh();
  try { await paint(); } catch (e) { say(t('ocr.app.draw_failed', { error: e.message })); }
}

async function addFiles(list) {
  const files = [...list];
  if (!files.length) return;
  const skipped = files.filter((f) => !isSupported(f)).map((f) => f.name);
  const first = state.pages.length;
  for (const f of files.filter(isSupported)) {
    say(t('ocr.app.opening', { name: f.name }));
    try { state.pages.push(...(await openFile(f))); } catch (e) { say(e.message); }
  }
  if (skipped.length) say(t('ocr.app.skipped', { names: skipped.join(', ') }));
  else if (state.pages.length > first) say(t('ocr.app.ready', { n: state.pages.length }));
  if (state.pages.length > first) await show(first);
  else refresh();
}

/** Reads one page into p: the picture goes to the worker, the lines and the text come back. */
async function readPage(p, i, model, onProgress) {
  const canvas = await renderPage(p);
  const bitmap = await createImageBitmap(canvas);
  const r = await E.run(model, { bitmap, w: canvas.width, h: canvas.height }, { onProgress: (q) => onProgress(q) });
  Object.assign(p, { w: canvas.width, h: canvas.height, lines: r.lines, skipped: r.skipped || 0, model, text: linesToText(r.lines), done: true, error: null, edited: false });
  if (i === state.cur) state.shown = { i, canvas };
}

async function readAll() {
  if (state.busy || allRead()) return;
  const todo = state.pages.map((p, i) => ({ p, i })).filter((x) => !x.p.done);
  state.busy = true;
  const prog = $('prog');
  prog.hidden = false; prog.value = 0;
  $('read').disabled = true;
  $('suggest').replaceChildren();
  try {
    const pick = await choice.pick();
    if (!pick) { say(t('ocr.app.choose_lang')); return; }
    await E.load(pick.model, say);
    for (let k = 0; k < todo.length; k++) {
      const { p, i } = todo[k];
      say(t('ocr.app.reading', { label: p.label, i: k + 1, n: todo.length }));
      try {
        await readPage(p, i, pick.model, (q) => {
          prog.value = q.total ? q.done / q.total : 0;
          say(q.stage === 'detect' ? t('ocr.app.finding', { label: p.label }) : t('ocr.app.line_of', { i: q.done + 1, n: q.total, label: p.label }));
        });
      } catch (e) {
        p.error = e.message; // the page stays unread, so Read text tries it again
      }
      if (i === state.cur) await paint();
      refresh();
    }
    const lines = state.pages.reduce((n, p) => n + (p.lines ? rowsOf(p.lines).length : 0), 0);
    const failed = state.pages.filter((p) => p.error);
    say(failed.length
      ? t('ocr.app.failed_pages', { n: failed.length, error: failed[0].error })
      : lines ? t('ocr.app.lines_read', { n: lines }) : t('ocr.app.no_text'));
    offer(pick.model);
  } catch (e) {
    say(t('ocr.app.read_failed', { error: e.message }));
  } finally {
    state.busy = false;
    prog.hidden = true;
    refresh();
  }
}

/** After a read with no language chosen: the line that offers a better model (shared/ocr/suggest.js), whose button opens
 *  the dialog; once a model is chosen there, the pages are read again with it. */
function offer(model) {
  const read = state.pages.filter((p) => p.done && p.model === model);
  const s = choice.suggest(read.flatMap((p) => p.lines || []), model, read.reduce((n, p) => n + (p.skipped || 0), 0));
  const el = choice.suggestion(s, again);
  $('suggest').replaceChildren(...(el ? [el] : []));
}
/** Reads every page again with the model just chosen; asks first when the person corrected the text. */
async function again() {
  if (state.busy || !state.pages.length) return;
  if (state.pages.some((p) => p.edited) && !(await window.SlopUI.confirm(t('ocr.app.again_q'), t('ocr.app.again_body'), t('ocr.app.again')))) return;
  for (const p of state.pages) p.done = false;
  refresh();
  await readAll();
}

/** The pages as the outputs want them: the text as edited, the lines and the picture size. */
const outPages = () => state.pages.map((p) => ({ text: p.text || '', lines: p.lines || [], w: p.w, h: p.h }));

/** The searchable PDF of every page (the picture with an invisible text layer). */
async function pdfBlob(onPage = () => {}) {
  const base = outPages(), pages = [];
  for (let i = 0; i < base.length; i++) {
    const canvas = await renderPage(state.pages[i]);
    pages.push({ ...base[i], w: canvas.width, h: canvas.height, image: await jpegBytes(canvas) });
    onPage((i + 1) / base.length);
  }
  return searchablePdf(pages, { title: stem() });
}
async function exportPdf() {
  const prog = $('prog');
  prog.hidden = false; prog.value = 0;
  setExporting(true, t('ocr.app.making_pdf'));
  try {
    const blob = await pdfBlob((f) => { prog.value = f; });
    saveBlob(stem() + '.pdf', blob);
    say(t('ocr.app.pdf_saved'));
  } catch (e) {
    say(t('ocr.app.pdf_failed', { error: e.message }));
  } finally {
    prog.hidden = true;
    setExporting(false);
  }
}

function setExporting(on, text) {
  state.busy = on;
  if (text) say(text);
  refresh();
}

function wire() {
  // The one way in (shared/intake, spec 'ocr'): the zone (a drop, its Choose files, the sample), a paste, ?drive=<id>
  // (another app's Open in Slop OCR) and a PWA launch all reach addFiles. A paste waits for the gate (the launch is read
  // only once the gate has passed).
  window.SlopIntake.register({
    id: 'ocr',
    accept: { types: ['image/*', 'application/pdf'], exts: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif'], noun: 'ocr.app.noun' },
    gate: (batch) => !$('ui').hidden || batch.source !== 'paste', // a paste before the gate has shown the page is not taken
    processAll: async (files) => { await addFiles(files); return files.map((f) => f.name); },
  });
  dropZone = window.SlopDrop.attach($('drop'), {
    intake: 'ocr',
    label: 'ocr.drop.label',
    preview: PREVIEW(),
    sample: { label: 'ocr.drop.sample', files: async () => [await sampleReceipt()] },
  });
  $('read').addEventListener('click', readAll);
  $('prev').addEventListener('click', () => show(state.cur - 1));
  $('next').addEventListener('click', () => show(state.cur + 1));
  $('pages').addEventListener('change', (e) => show(parseInt(e.target.value, 10)));
  $('boxes').addEventListener('change', () => paint());
  $('text').addEventListener('input', () => { const p = state.pages[state.cur]; if (p) { p.text = $('text').value; p.edited = true; } });
  choice.button($('lang'), () => { if (state.pages.some((p) => p.done)) again(); });
  $('lang').before(choice.engineSelect(() => { if (state.pages.some((p) => p.done)) again(); }));   // Text recognition engine
  $('dlTxt').addEventListener('click', () => saveBlob(stem() + '.txt', new Blob([plainText(outPages())], { type: 'text/plain' })));
  $('dlMd').addEventListener('click', () => saveBlob(stem() + '.md', new Blob([markdownText(outPages())], { type: 'text/markdown' })));
  $('dlDocx').addEventListener('click', async () => {
    say(t('ocr.app.making_docx'));
    try {
      saveBlob(stem() + '.docx', await docxFile(outPages(), { title: stem() }));
      say(t('ocr.app.docx_saved'));
    } catch (e) { say(t('ocr.app.docx_failed', { error: e.message })); }
  });
  $('dlPdf').addEventListener('click', exportPdf);
  $('copy').addEventListener('click', async () => {
    say((await copyText(plainText(outPages()))) ? t('ocr.app.copied') : t('ocr.app.copy_blocked'));
  });
  $('clear').addEventListener('click', clearAll);
}
function clearAll() {
  if (state.busy) return;
  state.pages = []; state.cur = 0; state.shown = null;
  $('suggest').replaceChildren();
  $('text').value = '';
  say(t('ocr.app.cleared'));
  refresh();
}

/** For the assistant's commands (ai-commands.js, loaded by SlopCmd.prepare()): the page's own actions and outputs. */
window.SlopOcrPage = { state, addFiles, readAll, refresh, show, clearAll, outPages, stem, pdfBlob, say, plainText, markdownText, docxFile };
if (window.SlopCmd) {
  const C = window.SlopCmd, click = (id) => () => { if (!$(id).disabled) $(id).click(); };
  C.init({ app: 'ocr' });
  // built on every call, and again on a language change, so the palette reads the current language
  const cmds = () => [['ocr.read', 'read', 'read'], ['ocr.txt', 'txt', 'dlTxt'], ['ocr.md', 'md', 'dlMd'], ['ocr.docx', 'docx', 'dlDocx'],
    ['ocr.pdf', 'pdf', 'dlPdf'], ['ocr.clear', 'clear', 'clear']].map(([id, k, el]) => ({ id, title: t('ocr.cmd.' + k), group: t('ocr.cmd.group'), keys: [], when: () => !$(el).disabled, run: click(el) }));
  C.register(cmds());
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => C.register(cmds()));
  if (C.provide) C.provide({ prepare: () => import('./ai-commands.js') });
}

wire();
const intro = window.SlopDrop.panel.preview(PREVIEW());
if (intro) $('intro').append(intro);
// a language change: the page list (its "not read yet") in the new language
if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (!$('ui').hidden) refresh(); });
T.gate('ocr', () => {
  $('ui').hidden = false;
  $('intro').hidden = true; // the drop zone shows the same preview now
  refresh();
  if (window.SlopHub) window.SlopHub.register('ocr');
  window.SlopIntake.launch({ to: 'ocr' });
});
