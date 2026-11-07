/* Text recognition (OCR) as a family of the shared model chooser (shared/models/chooser.js): its words, its languages
 * (shared/ocr/languages.js, from the script table in aitools/ocr-models.js) and its models (window.SlopOcrModels).
 * ocrFamily() -> the family object openModelChooser({ family }) takes. See shared/models/HANDOFF.md.
 * Used by Slop OCR, Slop PDF (Recognise text) and AI Tools (OCR), through shared/ocr/choose.js. */
import { ocrLanguages } from './languages.js';

/** The words (shared/i18n/ui/<code>/models.js), read when the dialog draws them. */
const T = (k) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k) : k);

export function ocrFamily(catalog = globalThis.SlopOcrModels) {
  const L = ocrLanguages(catalog);
  return {
    id: 'ocr',
    get title() { return T('ui.models.title'); },
    get languageStep() { return T('ui.models.ocr_step'); },
    get modelStep() { return T('ui.models.step_model'); },
    get usageWords() { return T('ui.models.ocr_usage'); },
    get autoName() { return T('ui.models.auto'); },
    catalog,
    languages: { filter: L.filter, name: L.name },
  };
}
