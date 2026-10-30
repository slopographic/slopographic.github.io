/* Slop Transcribe: a voice recording from the microphone, made in the browser (MediaRecorder) and handed to the queue as a
 * file like any other. Nothing leaves the device. The browser asks for the microphone the first time.
 *   const r = createRecorder({ onTick(seconds), media })   media: navigator.mediaDevices (the tests pass a fake)
 *   await r.start()  -> resolves once recording, rejects with a plain reason (no microphone, permission refused)
 *   await r.stop()   -> a File "Recording 2026-10-24 10.32.webm"; r.cancel() drops it; r.recording */
import { tr } from './words.js';

const pad = (v) => String(v).padStart(2, '0');

/** Pure: the file name of a recording made at a date. */
export function recordingName(d, ext = 'webm') {
  return `Recording ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${ext}`;
}
/** Pure: the reason to show for a getUserMedia failure. */
export function micReason(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return tr('transcribe.mic.blocked', 'The microphone is blocked for this page. Allow it in the browser’s site settings, then try again.');
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return tr('transcribe.mic.none', 'No microphone was found.');
  if (n === 'NotReadableError') return tr('transcribe.mic.busy', 'The microphone is in use by another app.');
  return e && e.message ? tr('transcribe.mic.failed_why', 'The microphone could not be started: {error}', { error: e.message }) : tr('transcribe.mic.failed', 'The microphone could not be started.');
}

export function createRecorder({ onTick = () => {}, media = globalThis.navigator && globalThis.navigator.mediaDevices, Recorder = globalThis.MediaRecorder } = {}) {
  let rec = null, stream = null, chunks = [], timer = 0, began = 0;
  const release = () => { clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; rec = null; };

  async function start() {
    if (rec) return;
    if (!media || !media.getUserMedia || !Recorder) throw new Error('This browser cannot record audio.');
    try { stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { throw new Error(micReason(e)); }
    chunks = [];
    rec = new Recorder(stream);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000);
    began = Date.now();
    onTick(0);
    timer = setInterval(() => onTick((Date.now() - began) / 1000), 500);
  }
  function stop() {
    if (!rec) return Promise.resolve(null);
    const r = rec;
    return new Promise((resolve) => {
      r.onstop = () => {
        const type = (r.mimeType || 'audio/webm').split(';')[0];
        const ext = /ogg/.test(type) ? 'ogg' : /mp4|aac/.test(type) ? 'm4a' : 'webm';
        const blob = new Blob(chunks, { type });
        release();
        resolve(new File([blob], recordingName(new Date(began), ext), { type }));
      };
      r.stop();
    });
  }
  function cancel() { if (rec) { rec.onstop = null; try { rec.stop(); } catch (e) { /* already stopped */ } } release(); }

  return { start, stop, cancel, get recording() { return !!rec; } };
}
