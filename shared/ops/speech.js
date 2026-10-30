/* Speech to text without Slop Transcribe's window: the same Whisper engine (Slop AI Tools, aitools/common.js: the same
 * models and downloads as Slop Transcribe and the Speech page) for the headless operations (shared/ops/video.js) and
 * SlopCut's add_captions. ES module.
 *   transcribe(blob, { language, model, signal, progress }) → [{ start, end, text }] (seconds)
 *     language 'auto' finds it from the first 30 s; the quick model (Whisper tiny) is used unless model names an
 *     installed one. The first time, the model download is asked for (the shared first-use notice) and fetched.
 *   prepare({ progress }) loads the engine and asks for the model download when needed (call it in the page the person
 *     sees: a hidden copy of an app then finds the model installed and asks nothing)
 *   A page (a test) may stand in its own engine: globalThis.SlopSpeechEngine = { transcribe(blob, opts) → segments }; a
 *   hidden copy of an app (an iframe) uses its parent's. */
import { scripts, notice, abortable } from './load.js';
import { t } from './i18n.js';

const g = globalThis;
const PARTS = ['shared/cdn/assets.js', 'shared/models/catalog.js', 'aitools/speech-models.js', 'aitools/model-registry.js', 'shared/firstrun/notice.js',
  'aitools/download.js', 'aitools/models.js', 'aitools/common.js', 'aitools/transcript.js'];
const READY = ['bundled', 'installed', 'update'];

async function ensureModel(id, progress) {
  const M = g.SlopAIManager, C = g.SlopSpeechModels;
  if (READY.includes(await M.status(id))) return;
  const m = C.byId ? C.byId(id) : null, bytes = C.bytesOf && m ? C.bytesOf(m) : 0;
  await notice('speech', { title: t('ui.ops.speech.notice_title'), lines: [t('ui.ops.speech.notice_line')],
    downloads: [{ name: (m && m.name) || 'Whisper tiny', bytes }] });
  if (progress) progress(0, t('ui.ops.speech.downloading'));
  await M.install(id, (p) => { if (progress && p && p.total) progress((p.done || p.loaded || 0) / p.total, t('ui.ops.speech.downloading')); });
}

function fake() {
  if (g.SlopSpeechEngine) return g.SlopSpeechEngine;
  try { if (g.parent && g.parent !== g && g.parent.SlopSpeechEngine) return g.parent.SlopSpeechEngine; } catch (e) { /* another origin */ }
  return null;
}
export async function prepare({ progress = null } = {}) {
  if (fake()) return;
  await scripts(PARTS, () => !!(g.SlopAITools && g.SlopTranscript && g.SlopSpeechModels));
  await ensureModel(g.SlopSpeechModels.QUICK || 'whisper-tiny', progress);
}

export async function transcribe(blob, { language = 'auto', model = null, signal = null, progress = null } = {}) {
  if (fake()) return fake().transcribe(blob, { language, model, signal, progress });
  await prepare({ progress });
  const T = g.SlopAITools, C = g.SlopSpeechModels, quick = C.QUICK || 'whisper-tiny';
  const use = model && READY.includes(await g.SlopAIManager.status(model)) ? model : quick;
  abortable(signal);
  if (progress) progress(0, t('ui.ops.speech.reading'));
  const samples = await T.audioSamples(blob);
  if (samples.length < 16000 * 0.5) throw new Error(t('ui.ops.speech.too_little'));
  abortable(signal);
  let lang = language || 'auto';
  if (lang === 'auto') {
    await T.ensure(quick);
    const d = await T.call('detect', { model: quick, samples: samples.slice(0, 30 * 16000) });
    lang = (d && d.languages && d.languages[0] && d.languages[0].code) || 'en';
  }
  await T.ensure(use);
  abortable(signal);
  const r = await T.call('transcribe', { model: use, samples, language: lang }, { transfer: [samples.buffer], onProgress: (p) => { if (progress && p && p.total) progress(p.done / p.total, t('ui.ops.speech.transcribing')); } });
  abortable(signal);
  return (r && r.segments) || [];
}

/** Subtitles text from segments (SlopTranscript, aitools/transcript.js, the one place for the formats). */
export async function formatted(segments, format) {
  await scripts(['aitools/transcript.js'], () => !!g.SlopTranscript);
  const X = g.SlopTranscript;
  return format === 'srt' ? X.srt(segments) : format === 'vtt' ? X.vtt(segments) : X.txt(segments, { times: format === 'txt-times' });
}
