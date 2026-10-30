/* Speech to text: every language Whisper (multilingual) can be told to hear. The code is the one in its language token,
 * <|code|>, which aitools/workers/speech-engine.js looks up among the tokenizer's language tokens; note Javanese is "jw"
 * there, not "jv". TABLE holds the English names; a person sees the name in the page's language (SlopI18n.get()) from
 * Intl.DisplayNames, the English one when the browser has no name for it. shownLanguages() is sorted by the shown name with
 * that language's collation; filterLanguages (the search of the Language and model chooser, shared/models/chooser.js,
 * through shared/speech/family.js) finds a language by its shown name, its English name or its code; fillLanguages puts
 * Detect automatically first. Used by Slop Transcribe and AI Tools; shared/ocr/languages.js shows its names the same way. */
const TABLE = {
  en: 'English', zh: 'Chinese', de: 'German', es: 'Spanish', ru: 'Russian', ko: 'Korean', fr: 'French', ja: 'Japanese',
  pt: 'Portuguese', tr: 'Turkish', pl: 'Polish', ca: 'Catalan', nl: 'Dutch', ar: 'Arabic', sv: 'Swedish', it: 'Italian',
  id: 'Indonesian', hi: 'Hindi', fi: 'Finnish', vi: 'Vietnamese', he: 'Hebrew', uk: 'Ukrainian', el: 'Greek', ms: 'Malay',
  cs: 'Czech', ro: 'Romanian', da: 'Danish', hu: 'Hungarian', ta: 'Tamil', no: 'Norwegian', th: 'Thai', ur: 'Urdu',
  hr: 'Croatian', bg: 'Bulgarian', lt: 'Lithuanian', la: 'Latin', mi: 'Maori', ml: 'Malayalam', cy: 'Welsh', sk: 'Slovak',
  te: 'Telugu', fa: 'Persian', lv: 'Latvian', bn: 'Bengali', sr: 'Serbian', az: 'Azerbaijani', sl: 'Slovenian',
  kn: 'Kannada', et: 'Estonian', mk: 'Macedonian', br: 'Breton', eu: 'Basque', is: 'Icelandic', hy: 'Armenian',
  ne: 'Nepali', mn: 'Mongolian', bs: 'Bosnian', kk: 'Kazakh', sq: 'Albanian', sw: 'Swahili', gl: 'Galician',
  mr: 'Marathi', pa: 'Punjabi', si: 'Sinhala', km: 'Khmer', sn: 'Shona', yo: 'Yoruba', so: 'Somali', af: 'Afrikaans',
  oc: 'Occitan', ka: 'Georgian', be: 'Belarusian', tg: 'Tajik', sd: 'Sindhi', gu: 'Gujarati', am: 'Amharic',
  yi: 'Yiddish', lo: 'Lao', uz: 'Uzbek', fo: 'Faroese', ht: 'Haitian Creole', ps: 'Pashto', tk: 'Turkmen',
  nn: 'Nynorsk', mt: 'Maltese', sa: 'Sanskrit', lb: 'Luxembourgish', my: 'Burmese', bo: 'Tibetan', tl: 'Tagalog',
  mg: 'Malagasy', as: 'Assamese', tt: 'Tatar', haw: 'Hawaiian', ln: 'Lingala', ha: 'Hausa', ba: 'Bashkir',
  jw: 'Javanese', su: 'Sundanese',
};

/** [{ code, name }] with the English names, sorted by them: the codes and the English words to search. */
export const LANGUAGES = Object.entries(TABLE).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, 'en'));

const I18N = () => globalThis.SlopI18n;
/** The page's language (SlopI18n.get()), 'en' without the framework. */
export const uiLanguage = () => { const I = I18N(); return (I && I.get && I.get()) || 'en'; };
/** 'Detect automatically' in the page's language (shared/i18n/ui/<code>/models.js). */
export const autoName = () => (I18N() ? I18N().t('ui.models.auto') : 'ui.models.auto');
const INTL = { jw: 'jv' };   // Whisper's code where Intl uses another
const names = new Map();
/** The name of a language code in the page's language, or `english` in English or when Intl.DisplayNames has none. */
export function displayName(code, english, ui = uiLanguage()) {
  if (ui === 'en' || typeof Intl === 'undefined' || !Intl.DisplayNames) return english;
  try {
    let d = names.get(ui);
    if (!d) names.set(ui, (d = new Intl.DisplayNames([ui], { type: 'language', fallback: 'none' })));
    const n = d.of(INTL[code] || code);
    return n && n !== code ? n : english;
  } catch (e) { return english; }
}
/** The same, with a capital first letter, for a list of names (Swedish writes "svenska" in a sentence, "Svenska" in a list). */
export const listName = (code, english, ui = uiLanguage()) => { const n = displayName(code, english, ui); return n.charAt(0).toLocaleUpperCase(ui) + n.slice(1); };

/** The English name for a Whisper code ('' when it is not one). */
export const englishName = (code) => TABLE[code] || '';
/** The name for a Whisper code in the page's language ('auto' is Detect automatically); an unknown code comes back as it is. */
export const languageName = (code) => (code === 'auto' ? autoName() : TABLE[code] ? displayName(code, TABLE[code]) : code || '');

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (t) => fold(t).split(/[\s()-]+/);
/** A language list for a set of codes in the page's language: [{ code, name, en }] sorted by name in that language's order.
 *  englishOf(code): the English name; intl: codes Intl.DisplayNames knows by another one (OCR's zh is zh-Hans). */
export function shownList(codes, englishOf, ui = uiLanguage(), intl = {}) {
  const collator = new Intl.Collator(ui);
  return codes.map((code) => ({ code, name: listName(intl[code] || code, englishOf(code), ui), en: englishOf(code) })).sort((a, b) => collator.compare(a.name, b.name));
}
/** Pure: the languages of a shown list whose name or English name starts a word with the query, or whose code is the query
 *  (case and accents ignored); 'auto' (Detect automatically) first when the query is empty or matches "detect" / "auto". */
export function searchLanguages(list, query) {
  const q = fold(query).trim();
  const starts = (n) => words(n).some((w) => w.startsWith(q)) || fold(n).startsWith(q);
  const out = list.filter((l) => !q || fold(l.code) === q || starts(l.name) || starts(l.en)).map(({ code, name }) => ({ code, name }));
  if (!q || 'detect automatically'.startsWith(q) || 'auto'.startsWith(q) || fold(autoName()).startsWith(q)) out.unshift({ code: 'auto', name: autoName() });
  return out;
}

const shown = new Map();
/** [{ code, name, en }] in the page's language, sorted by name (made once per language). */
export function shownLanguages(ui = uiLanguage()) {
  if (!shown.has(ui)) shown.set(ui, shownList(Object.keys(TABLE), (code) => TABLE[code], ui));
  return shown.get(ui);
}
/** The search of the Language and model chooser, in the page's language. */
export const filterLanguages = (query) => searchLanguages(shownLanguages(), query);

/** Fills a <select> with Detect automatically then every language, keeping its value (or the given one) when it is still offered. */
export function fillLanguages(select, value = select.value || 'auto') {
  const opt = (v, text) => Object.assign(document.createElement('option'), { value: v, textContent: text });
  select.replaceChildren(opt('auto', autoName()), ...shownLanguages().map((l) => opt(l.code, l.name)));
  select.value = value === 'auto' || TABLE[value] ? value : 'auto';
  return select;
}
