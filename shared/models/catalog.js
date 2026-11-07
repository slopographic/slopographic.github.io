/* Slopographic on-device models: one family of models (speech today; OCR next), ranked for a language. Pure (no DOM, no
 * storage), so Node tests load it (module.exports); the browser gets window.SlopModelCatalog. Classic script, loaded before
 * a family's model list (aitools/speech-models.js). See shared/models/HANDOFF.md.
 *   create({ family, models, quick }) -> { family, MODELS, QUICK, byId, fits, rank, recommended, bytesOf }
 *   words(object, { prop: getter }) -> the object, with those props read when used (the family's words)
 *   models: index entries (aitools/model-registry.js shape: id, name, licence, files ...) plus
 *     maker, note, languages ('*' = every language of the family, or a list of codes), speed and accuracy (1 to 5),
 *     only (true: trained on its languages alone, e.g. Whisper base.en; the badge says "English only")
 *   quick: the id of the small fast model, always listed last as the fast option (Whisper tiny).
 * rank(language) -> [{ model, badges }], best first: models made for the language, then the all-language ones by accuracy,
 * the quick model last. 'auto' (not known yet): the all-language models only. Badges: 'recommended' (the first, if not the
 * quick model), 'made-for' or 'only' (a model for some languages), 'fastest' (the quick model). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopModelCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function create({ family, models, quick }) {
    const MODELS = models.slice();
    const byId = (id) => MODELS.find((m) => m.id === id) || null;
    const fits = (m, lang) => !!m && (m.languages === '*' || (!!lang && lang !== 'auto' && m.languages.includes(lang)));
    const group = (m) => (m.id === quick ? 3 : m.languages === '*' ? 2 : 0);
    function rank(language) {
      const lang = language || 'auto';
      const list = MODELS.filter((m) => fits(m, lang)).sort((a, b) => group(a) - group(b) || b.accuracy - a.accuracy || b.speed - a.speed);
      return list.map((m, i) => {
        const badges = [];
        if (i === 0 && m.id !== quick) badges.push('recommended');
        if (m.languages !== '*') badges.push(m.only ? 'only' : 'made-for');
        if (m.id === quick) badges.push('fastest');
        return { model: m, badges };
      });
    }
    /** The model to suggest for better accuracy in a language (null when only the quick model fits). */
    function recommended(language) {
      const r = rank(language).find((x) => x.model.id !== quick);
      return r ? r.model : null;
    }
    const bytesOf = (m) => m.files.reduce((n, f) => n + f.size, 0);
    return { family, MODELS, QUICK: quick, byId, fits, rank, recommended, bytesOf };
  }

  /** Defines getters (enumerable, like plain fields) on an object: a family's words (name, note ...) read when shown, so
   *  they follow the page's language (SlopI18n). */
  function words(o, getters) {
    for (const p in getters) Object.defineProperty(o, p, { enumerable: true, configurable: true, get: getters[p] });
    return o;
  }

  return { create, words };
});
