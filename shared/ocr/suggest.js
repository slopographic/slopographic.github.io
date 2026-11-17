/* Text recognition (OCR): after a first read with the model in use (the quick bundled one when the person has not chosen a
 * language), says whether another model would read the text better, the way Slop Transcribe gives a quick transcript first
 * and then offers a better model. Pure (no DOM), so Node tests run it.
 * suggestModel(lines, { model, catalog, locale }) -> null, or { language, model, script, reason }
 *   lines: the engine's [{ text, score, box: { w, h } }]; model: the id used; catalog: window.SlopOcrModels (or the
 *   catalog of the engine chosen, shared/ocr/choose.js);
 *   locale: the browser's language as an OCR code (shared/ocr/languages.js fromLocale), or null; skipped: the lines the
 *   engine found but read as nothing (the worker's result.skipped).
 *   reason: 'script' (the text is in a script another model reads: Korean letters, kana, Arabic ...),
 *           'accents' (Latin text read by the Chinese and English model, which drops å, ä, ö and other accents),
 *           'unclear' (many lines came out empty or unsure: likely a script this model does not read).
 *   language: the language to offer in the chooser (the browser's when it uses that script), or null (choose one);
 *   model: the model to offer, or null when the script is not known. */

const SCRIPT_OF = [
  ['korean', /[가-힯ᄀ-ᇿ㄰-㆏]/g, 'ko'],
  ['cjk', /[぀-ヿ]/g, 'ja'],
  ['arabic', /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g, 'ar'],
  ['devanagari', /[ऀ-ॿ]/g, 'hi'],
  ['cyrillic', /[Ѐ-ӿ]/g, 'ru'],
  ['greek', /[Ͱ-Ͽ]/g, 'el'],
  ['thai', /[฀-๿]/g, 'th'],
  ['tamil', /[஀-௿]/g, 'ta'],
  ['telugu', /[ఀ-౿]/g, 'te'],
  ['han', /[一-鿿]/g, 'zh'],
  ['latin', /[A-Za-zÀ-ÖØ-öø-ɏ]/g, 'en'],
];
const ACCENT = /[À-ÖØ-öø-ɏ]/g;
const count = (text, re) => (text.match(re) || []).length;

/** Pure: letters of each script in the text, most first: [{ script, n, language }]. */
export function scriptsIn(text) {
  return SCRIPT_OF.map(([script, re, language]) => ({ script, n: count(text, re), language })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n);
}

/** Pure: true when a line came out empty or far shorter than its box (a line of letters this model has no symbols for). */
export function unread(line) {
  const t = String(line.text || '').replace(/\s+/g, ''), b = line.box || {};
  const expect = b.h > 0 ? b.w / b.h : 0;   // about one letter per box height, or more
  return !t || (expect >= 3 && t.length < expect * 0.3);
}

export function suggestModel(lines, { model, catalog, locale = null, skipped = 0 } = {}) {
  const C = catalog, used = C.byId(model);
  if (!used || !lines) return null;
  const has = (script) => used.scripts.includes(script);
  const best = (script) => C.modelOfScript(script);
  const offer = (script, fallback, reason) => {
    // the browser language's own model when that language is in this script (Tesseract has one per language), else the script's
    const own = locale && C.scriptOf(locale).includes(script) ? C.modelFor(locale) : null;
    const m = (own && own.id !== C.QUICK && own.scripts.includes(script) ? own : null) || best(script);
    if (!m || m.id === model) return null;
    const language = locale && m.languages.includes(locale) ? locale : fallback;
    return { language, model: m.id, script, reason };
  };
  const text = lines.map((l) => l.text || '').join('\n');
  const scripts = scriptsIn(text);
  const top = scripts[0];
  // kana anywhere means Japanese, even among many kanji
  if (scripts.some((s) => s.script === 'cjk' && s.n >= 2) && !has('cjk')) return offer('cjk', 'ja', 'script');
  if (top && top.script !== 'latin' && top.script !== 'han' && !has(top.script)) return offer(top.script, top.language, 'script');
  const found = lines.length + skipped, bad = found ? (lines.filter(unread).length + skipped) / found : 0;
  const scored = lines.filter((l) => String(l.text || '').trim());
  const score = scored.length ? scored.reduce((n, l) => n + (l.score || 0), 0) / scored.length : 0;
  if (found && (bad >= 0.3 || score < 0.85)) {
    const own = locale ? C.modelFor(locale) : null;
    if (own && own.id !== model && own.id !== C.QUICK) return { language: locale, model: own.id, script: C.scriptOf(locale)[0], reason: 'unclear' };
    return { language: null, model: null, script: null, reason: 'unclear' };
  }
  if (has('han') && top && top.script === 'latin') {
    const accents = count(text, ACCENT);
    const latinLocale = locale && locale !== 'en' && C.SCRIPTS.latin.languages.includes(locale);
    if (accents > 0 || latinLocale) return offer('latin', latinLocale ? locale : null, 'accents');
  }
  return null;
}
