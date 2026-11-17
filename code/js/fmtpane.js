/* Slop Code: the formatted view. A read-only pane beside the editor that shows a tidy copy of the open file (JSON, XML, HTML, CSS,
 * JavaScript, SQL, CSV...). It is display only: nothing here writes to the document or to the file. The pane follows the text as it
 * is typed (a short pause after each edit) and the tab that is shown. */
import * as docs from './docs.js';
import { t } from './dom.js';
import { newView, readOnlyState, langEffect } from './editor.js';
import { langOf, languageById } from './lang.js';
import { loadMore } from './lang-load.js';
import { formatForView, canFormat } from './formatview.js';
import { getDisplay, setDisplay } from './display.js';
import { helperOn } from './prefs.js';

const $ = (id) => document.getElementById(id);
const toast = (m) => window.SlopUI && window.SlopUI.toast(m);
/** What the pane calls each kind (names of formats are not translated). */
const KIND = { json: 'JSON', jsonl: 'JSON Lines', xml: 'XML', html: 'HTML', css: 'CSS', js: 'JavaScript', sql: 'SQL', csv: 'CSV', tsv: 'TSV' };   // i18n-ignore: a format name, not translated
let pane = null, timer = 0, shown = { id: null, lang: null, text: null, out: '' };

/** The pane's own editor view (null until it has been shown), so Find can open its search panel. */
export const fmtView = () => pane;
export const fmtOn = () => helperOn('fmtview') && getDisplay().fmt;

/** Show or hide the pane (kept per viewer). */
export function toggleFmt() {
  setDisplay(docs.mainView(), { fmt: !getDisplay().fmt });
  if (!helperOn('fmtview')) { toast(t('code.toast.fmtview_off')); return false; }
  syncFmt();
  return fmtOn();
}

/** The formatted text now in the pane (what Copy takes), or '' when there is none. */
export const fmtText = () => shown.out;

/** Copy the formatted text. Returns true when there was something to copy. */
export async function copyFmt() {
  if (!shown.out) { toast(t('code.fmt.none_to_copy')); return false; }
  try { await navigator.clipboard.writeText(shown.out); toast(t('code.fmt.copied')); return true; } catch (e) { toast(t('code.fmt.copy_failed')); return false; }
}

/** Show or hide the pane for the open tab, and bring its text up to date (after a short pause when the text is being typed). */
export function syncFmt() {
  const host = $('cd-fmt'), split = $('cd-split');
  if (!host || !split) return;
  const cur = docs.current();
  const on = fmtOn() && !!cur && cur.kind === 'text' && !cur.preview && !$('cd-editor').hidden;
  host.hidden = !on;
  split.classList.toggle('cd-fmt-open', on);
  if (!on) return;
  clearTimeout(timer);
  timer = setTimeout(() => draw(cur), shown.id === cur.id ? 220 : 0);
}

function note(msg) { const n = $('cd-fmt-note'); n.textContent = msg; n.hidden = !msg; }

/** Put `text` into the pane's read-only editor, keeping the scroll position. `lang` highlights it. */
function put(text, lang) {
  if (!pane) pane = newView($('cd-fmt-body'), readOnlyState(text, lang));
  else {
    const top = pane.scrollDOM.scrollTop;
    pane.setState(readOnlyState(text, lang));
    pane.scrollDOM.scrollTop = top;
  }
  if (lang.more) loadMore(lang.more).then((s) => { if (pane && shown.lang === lang.id && s && !(Array.isArray(s) && !s.length)) pane.dispatch({ effects: langEffect(lang, s) }); });
}

function draw(doc) {
  if (doc !== docs.current() || $('cd-fmt').hidden) return;
  const text = docs.textOf(doc), lang = langOf(doc);
  if (shown.id === doc.id && shown.lang === lang.id && shown.text === text) return; // nothing changed
  const kind = canFormat(lang.id, doc.name);
  $('cd-fmt-title').textContent = kind ? t('code.fmt.title', { kind: KIND[kind] || kind }) : t('code.fmt.title_none');
  if (!kind) { shown = { id: doc.id, lang: lang.id, text, out: '' }; put('', languageById('text')); note(t('code.fmt.none')); return; }
  const r = formatForView(text, lang.id, doc.name);
  if (!r.ok) { // keep the last good text on screen, dimmed by the note, so typing a half-finished line does not blank the pane
    const why = r.key ? t(r.key, r.args) : r.error;
    note(r.line ? t('code.fmt.error_at', { error: why, line: r.line }) : t('code.fmt.error', { error: why }));
    shown = { ...shown, id: doc.id, lang: lang.id, text };
    if (!shown.out) put('', languageById('text'));
    return;
  }
  note('');
  shown = { id: doc.id, lang: lang.id, text, out: r.text };
  put(r.text, kind === 'csv' || kind === 'tsv' ? languageById('text') : lang);
}

/** Wire the pane's own buttons (Copy, Close). */
export function initFmt() {
  const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  on('cd-fmt-copy', () => copyFmt());
  on('cd-fmt-close', () => toggleFmt());
}
