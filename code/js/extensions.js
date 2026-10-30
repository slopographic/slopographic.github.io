/* Slop Code: the Extensions panel. Built-in helpers only, nothing is downloaded: a formatter, a language mode
 * switcher and snippets. Each is a toggle, kept per viewer (slop-code.extensions). The actions here are also
 * commands in the palette. */
import * as docs from './docs.js';
import { el, t } from './dom.js';
import { env, toast, setStatus } from './ui.js';
import { HELPER_IDS, helperOn, setHelperOn } from './prefs.js';
import { formatText } from './format.js';
import { langOf, languageById, langLabel } from './lang.js';
import { setLanguage } from './editor.js';
import { askLanguage } from './dialogs.js';

// each helper's words are keys (code.ext.*), read when the list is drawn
const INFO = {
  formatter: { title: 'code.ext.formatter', desc: 'code.ext.formatter_desc', button: 'code.ext.formatter_btn' },
  languageMode: { title: 'code.ext.lang', desc: 'code.ext.lang_desc', button: 'code.ext.lang_btn' },
  snippets: { title: 'code.ext.snippets', desc: 'code.ext.snippets_desc' },
};

/** Format the open file with the formatter. Returns true when it ran. */
export function formatDoc() {
  const d = docs.current(), view = env.view;
  if (!d || !view) { toast(t('code.toast.open_first')); return false; }
  if (d.kind !== 'text') { toast(t('code.toast.not_edited')); return false; }
  if (!helperOn('formatter')) { toast(t('code.toast.formatter_off')); return false; }
  const before = view.state.doc.toString();
  let out;
  try { out = formatText(before, langOf(d).id); } catch (e) { toast(e.message); return false; }
  if (out === before) { toast(t('code.toast.already_formatted')); return true; }
  view.dispatch({ changes: { from: 0, to: before.length, insert: out }, selection: { anchor: Math.min(view.state.selection.main.head, out.length) } });
  toast(t('code.toast.formatted'));
  return true;
}

/** Ask for a language and apply it to the open file. Returns true when the language changed. */
export async function chooseLanguage() {
  const d = docs.current(), view = env.view;
  if (!d || !view) { toast(t('code.toast.open_first')); return false; }
  if (d.kind !== 'text') { toast(t('code.toast.not_edited')); return false; }
  if (!helperOn('languageMode')) { toast(t('code.toast.lang_off')); return false; }
  const id = await askLanguage(langOf(d).id);
  if (!id) return false;
  const lang = languageById(id);
  d.langId = id;
  setLanguage(view, lang);
  setStatus();
  toast(t('code.toast.language', { name: langLabel(lang) }));
  return true;
}

const ACTIONS = { formatter: formatDoc, languageMode: chooseLanguage };

/** Draw the helper list into `host`: a title, a description, an optional button, and an On/Off switch. */
export function renderExtensions(host) {
  if (!host) return;
  host.replaceChildren(...HELPER_IDS.map((id) => {
    const info = INFO[id];
    const state = el('span', { class: 'cd-switch-txt' }, helperOn(id) ? t('code.ext.on') : t('code.ext.off'));
    const box = el('input', { type: 'checkbox', role: 'switch', id: 'cd-ext-' + id, 'aria-describedby': 'cd-ext-desc-' + id,
      onchange: (e) => { setHelperOn(id, e.target.checked); state.textContent = e.target.checked ? t('code.ext.on') : t('code.ext.off'); setStatus(); } });
    box.checked = helperOn(id);
    return el('li', { class: 'cd-ext' },
      el('div', { class: 'cd-ext-main' },
        el('label', { class: 'cd-ext-name', for: 'cd-ext-' + id }, t(info.title)),
        el('p', { class: 'cd-ext-desc', id: 'cd-ext-desc-' + id }, t(info.desc)),
        info.button ? el('button', { type: 'button', class: 'sui-btn cd-mini', onclick: () => ACTIONS[id]() }, t(info.button)) : null),
      el('label', { class: 'cd-switch' }, box, state));
  }));
}
