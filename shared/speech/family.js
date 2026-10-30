/* Speech to text as a family of the shared model chooser (shared/models/chooser.js): its words, its languages (the 99
 * Whisper languages, shared/speech/languages.js) and its models (aitools/speech-models.js, window.SlopSpeechModels).
 * speechFamily() -> the family object openModelChooser({ family }) takes. See shared/models/HANDOFF.md. */
import { filterLanguages, languageName } from './languages.js';

/** The words (shared/i18n/ui/<code>/models.js), read when the dialog draws them. */
const T = (k) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k) : k);

export function speechFamily(catalog = globalThis.SlopSpeechModels) {
  return {
    id: 'speech',
    get title() { return T('ui.models.title'); },
    get languageStep() { return T('ui.models.speech_step'); },
    get modelStep() { return T('ui.models.step_model'); },
    get usageWords() { return T('ui.models.speech_usage'); },
    get autoName() { return T('ui.models.auto'); },
    catalog,
    languages: { filter: filterLanguages, name: (code) => (code === 'auto' ? T('ui.models.auto') : languageName(code)) },
  };
}
