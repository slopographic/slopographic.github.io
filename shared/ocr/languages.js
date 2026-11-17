/* Text recognition (OCR): the languages the OCR models read, for the Language and model chooser (shared/models/chooser.js,
 * through shared/ocr/family.js) and the pages that run OCR (Slop OCR, Slop PDF, AI Tools). The codes come from the one table
 * of script groups in aitools/ocr-models.js (SCRIPTS); the names are the site's language names (shared/speech/languages.js:
 * in the page's language from Intl.DisplayNames, English when it has none), with the English names of the few that Whisper
 * has no token for (traditional Chinese, Kyrgyz, Kurdish, Uyghur, Irish) added here.
 * ocrLanguages(models = window.SlopOcrModels) -> { LANGUAGES, name(code), filter(query), fromLocale(tag) } */
import { languageName, englishName, displayName, autoName, shownList, searchLanguages, uiLanguage } from '../speech/languages.js';

const EXTRA = { 'zh-Hant': 'Chinese (traditional)', zh: 'Chinese (simplified)', ky: 'Kyrgyz', ku: 'Kurdish', ug: 'Uyghur', ga: 'Irish' };
const INTL = { zh: 'zh-Hans' };   // OCR's zh is simplified Chinese
export { autoName };

const english = (code) => EXTRA[code] || englishName(code);
/** The name for a code in the page's language ('auto' is Detect automatically). */
export const ocrLanguageName = (code) => (code === 'auto' ? autoName() : EXTRA[code] ? displayName(INTL[code] || code, EXTRA[code]) : languageName(code));

export function ocrLanguages(models = globalThis.SlopOcrModels) {
  const lists = new Map();
  /** [{ code, name, en }] in the page's language, sorted by name in its order (made once per language). */
  const shown = (ui = uiLanguage()) => {
    if (!lists.has(ui)) lists.set(ui, shownList(models.CODES, english, ui, INTL));
    return lists.get(ui);
  };
  /** Pure: the languages whose shown or English name starts a word with the query, or whose code is the query (case and
   *  accents ignored), sorted by name; 'auto' first when the query is empty or matches "detect" / "auto". */
  const filter = (query) => searchLanguages(shown(), query);
  /** The OCR language for a browser locale ('sv-SE' -> 'sv', 'zh-TW' -> 'zh-Hant', 'nb' -> 'no'), or null. */
  function fromLocale(tag) {
    const t = String(tag || '').toLowerCase();
    if (!t) return null;
    if (/^zh-(tw|hk|mo|hant)/.test(t)) return 'zh-Hant';
    const base = t.split('-')[0], code = base === 'nb' ? 'no' : base === 'jv' ? 'jw' : base;
    return models.CODES.includes(code) ? code : null;
  }
  return { get LANGUAGES() { return shown().map(({ code, name }) => ({ code, name })); }, name: ocrLanguageName, filter, fromLocale };
}
