/* Speech to text page: audio or the audio track of a video, through Whisper in the inference worker (any installed model:
 * the Language and model dialog, shared/models/chooser.js, the same one as Slop Transcribe). Shows progress; the result is
 * a list of timed segments, exported as .srt and .txt. Detect automatically finds the language with the quick model and
 * reads with the model the person chose (or the preferred model for that language, if installed). ES module. */
import { openModelChooser } from '../../shared/models/chooser.js';
import { createPrefs } from '../../shared/models/prefs.js';
import { speechFamily } from '../../shared/speech/family.js';
import { languageName } from '../../shared/speech/languages.js';

const T = window.SlopAITools, C = window.SlopSpeechModels, M = window.SlopAIManager, $ = (id) => document.getElementById(id);
const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const MAX_SECONDS = 2 * 3600;
const prefs = createPrefs('speech');
let file = null, segments = [], baseName = 'transcript', language = prefs.pinned() || 'auto', model = null, big = null;

const X = window.SlopTranscript;   // the transcript formats (aitools/transcript.js), shared with Slop Transcribe
const clock = X.clock;
const installed = async (id) => /^(installed|update|bundled)$/.test(await M.status(id));
function label() {
  const id = model || (language !== 'auto' && prefs.preferred(language)) || C.QUICK;
  $('model').textContent = `${language === 'auto' ? t('aitools.speech.auto') : languageName(language)} · ${C.byId(id).name} ▾`;
}
/** The model for a language: the one chosen in the dialog if it fits, else the preferred one if installed, else the quick one. */
async function modelFor(lang) {
  if (model && C.fits(C.byId(model), lang)) return model;
  const p = prefs.preferred(lang);
  return p && C.fits(C.byId(p), lang) && (await installed(p)) ? p : C.QUICK;
}

async function run() {
  $('run').disabled = true; $('srt').disabled = $('txt').disabled = true;
  const prog = $('prog'); prog.hidden = false; prog.value = 0; $('msg').textContent = '';
  try {
    $('msg').textContent = t('aitools.speech.decoding');
    const samples = await T.audioSamples(file);
    if (samples.length / 16000 > MAX_SECONDS) throw new Error(t('aitools.speech.too_long'));
    if (samples.length < 16000 / 2) throw new Error(t('aitools.speech.too_short'));
    await T.ensure(C.QUICK, (s) => ($('msg').textContent = s));
    let lang = language;
    if (lang === 'auto') lang = (await T.call('detect', { model: C.QUICK, samples: samples.slice(0, 30 * 16000) })).languages[0].code;
    const use = await modelFor(lang);
    if (use !== C.QUICK && big && big !== use) await T.release(big);
    if (use !== C.QUICK) big = use;
    await T.ensure(use, (s) => ($('msg').textContent = s));
    const r = await T.call('transcribe', { model: use, samples, language: lang }, {
      transfer: [samples.buffer],
      onProgress: (p) => { prog.value = p.total ? p.done / p.total : 0; $('msg').textContent = t('aitools.speech.progress', { done: clock(p.done), total: clock(p.total) }); },
    });
    segments = r.segments;
    $('out').value = X.txt(segments, { times: true });
    const any = segments.length > 0;
    $('srt').disabled = $('txt').disabled = !any;
    $('msg').textContent = any ? t('aitools.speech.done', { n: segments.length, language: languageName(r.language), model: C.byId(use).name }) : t('aitools.speech.none');
  } catch (e) {
    $('msg').textContent = t('aitools.speech.failed', { error: e.message });
  } finally { $('run').disabled = false; prog.hidden = true; }
}
function pick(f) {
  if (!f) return;
  if (!/^(audio|video)\//.test(f.type)) { $('msg').textContent = t('aitools.speech.choose'); return; }
  file = f; segments = []; baseName = f.name.replace(/\.[^.]+$/, '') || 'transcript';
  if (!prefs.pinned()) { language = 'auto'; label(); }   // each new file is detected afresh unless a language is pinned
  $('fileName').textContent = f.name + ' · ' + window.SlopAIModels.formatSize(f.size);
  $('out').value = ''; $('run').disabled = false;
}
$('model').addEventListener('click', async () => openModelChooser({
  family: speechFamily(C), language, model: model || await modelFor(language), pinned: !!prefs.pinned(), installer: M, ui: window.SlopUI, storageHref: '../../settings/#storage',
  onChoose: (c) => { language = c.language; model = c.model; if (c.pin) prefs.pin(language); else if (prefs.pinned() !== language) prefs.pin(null); label(); },
}));
// the one way in (aitools/intake.js): a drop on the box, choose a file, a paste, a launch
const intake = T.intake('ai-speech', { accept: { types: ['audio/*', 'video/*'], exts: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.mp4', '.m4v', '.mov', '.webm', '.mkv'], noun: 'aitools.speech.noun' }, read: (f) => pick(f) });
$('run').addEventListener('click', run);
$('srt').addEventListener('click', () => T.download(baseName + '.srt', X.srt(segments), 'application/x-subrip'));
$('txt').addEventListener('click', () => T.download(baseName + '.txt', X.txt(segments), 'text/plain'));
label();
if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(label);   // the model button follows a language change
T.gate('speech', () => { $('ui').hidden = false; intake.launch(); });
