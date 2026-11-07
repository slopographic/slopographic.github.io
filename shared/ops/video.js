/* Video operations for Slop Workflows and the AI (registry: shared/ops/registry.js). No second video stack: each one
 * runs SlopCut's own commands in its hidden copy (slopcut/?macro-host=1, shared/macros/frame.js runInHost; SlopCut's
 * host is slopcut/js/ai/host.js) and renders with SlopCut's WebCodecs export. Speech is Slop Transcribe's engine
 * (shared/ops/speech.js), run in this page so its download question is seen. Trimming is File convert's "Cut video
 * (trim)" (video-trim), not repeated here.
 *   slopedit.edl          Edit list → video: a JSON edit decision list (shared/video/edl.js) and the media it names
 *   slopedit.reframe      Reframe video: 16:9 → 9:16 (or another aspect), filling the frame around a focus point
 *   slopedit.captions     Add captions to video: from an .srt/.vtt given with it, or transcribed on this device
 *   slopedit.reel         Remix to reel: Reel Remix's random edit of the clips, optionally with captions
 *   transcribe.text       Video or audio → transcript (TXT), SRT or VTT
 * hostSteps(op, options, files) → the SlopCut steps an operation replays (pure; Node tests read it). */
import { register } from './registry.js';
import { stem } from './load.js';
import { t, opt, like } from './i18n.js';

const VIDEO = ['mp4', 'webm', 'mov'], AUDIO = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'opus'], PICS = ['png', 'jpg', 'webp', 'gif'];
const HOST = { app: 'slopedit', url: 'slopcut/?macro-host=1' };
const V = 'ui.ops.video.';
const ASPECT = opt(V + 'aspect', { key: 'aspect', type: 'select', value: 'same', options: ['same', '9:16', '16:9', '1:1', '4:5'] });
const FORMAT = opt(V + 'format', { key: 'format', type: 'select', value: 'mp4', options: [['mp4', 'MP4'], ['webm', 'WebM']] });
const QUALITY = opt(V + 'quality', { key: 'quality', type: 'select', value: 'high', options: ['low', 'medium', 'high', 'max'] });
const WIDTH = opt(V + 'width', { key: 'width', type: 'number', min: 0, max: 7680, value: 0, hint: true });
const HEIGHT = opt(V + 'height', { key: 'height', type: 'number', min: 0, max: 4320, value: 0 });
const FPS = opt(V + 'fps', { key: 'fps', type: 'select', value: 0, options: [0, [24, '24'], [25, '25'], [30, '30'], [60, '60']] });
const LANGUAGE = opt(V + 'language', { key: 'language', type: 'text', value: 'auto', hint: true });
const CAPTIONS = [opt(V + 'captions', { key: 'captions', type: 'select', value: 'none', options: ['none', 'file', 'transcribe'] }), LANGUAGE,
  opt(V + 'caption_size', { key: 'captionSize', type: 'number', min: 1, max: 20, step: 0.5, value: 4.5 }),
  opt(V + 'caption_position', { key: 'captionPosition', type: 'select', value: 'bottom', options: ['bottom', 'lower-third', 'center', 'top'] })];
const VERTICAL = like(ASPECT, { value: '9:16', options: ASPECT.options.slice(1) });
const OUT = [FORMAT, QUALITY, WIDTH, HEIGHT, FPS];

/** The export settings SlopCut's host.save takes. */
export function saveOptions(o = {}) {
  const s = { format: o.format || 'mp4', quality: o.quality || 'high' };
  if (+o.width && +o.height) Object.assign(s, { width: +o.width, height: +o.height });
  else if (o.aspect && o.aspect !== 'same') s.aspect = o.aspect;
  if (+o.fps) s.fps = +o.fps;
  return s;
}
/** The SlopCut steps (command ids and args) an operation replays in the hidden copy. srt: caption text when known. */
export function hostSteps(id, o = {}, { edl = null, srt = null, listen = false } = {}) {
  const steps = [], style = { size: (Number(o.captionSize) || 4.5) / 100, position: o.captionPosition || 'bottom' };
  const caps = srt ? [{ cmd: 'cut.captions', args: Object.assign({ srt }, style) }] : listen ? [{ cmd: 'cut.captions', args: Object.assign({ transcribe: 'timeline', language: o.language || 'auto' }, style) }] : [];
  if (id === 'slopedit.edl') steps.push({ cmd: 'cut.build', args: { edit_list: edl } });
  if (id === 'slopedit.reframe') steps.push({ cmd: 'cut.reframe', args: { aspect: o.aspect && o.aspect !== 'same' ? o.aspect : '9:16', focus_x: Number(o.focus ?? 50) / 100 } });
  if (id === 'slopedit.reel') steps.push({ cmd: 'cut.randomEdit', args: { target: Number(o.target) || 15, pace: o.pace || 'fast', aspect: o.aspect && o.aspect !== 'same' ? o.aspect : '9:16', layout: o.layout || 'none', seed: o.seed || undefined,
    width: +o.width && +o.height ? +o.width : undefined, height: +o.width && +o.height ? +o.height : undefined } });
  return steps.concat(caps).map((s) => ({ cmd: s.cmd, args: JSON.parse(JSON.stringify(s.args)), title: s.cmd }));
}

let frame = null;
const host = async () => (frame = frame || (await import('../macros/frame.js')).runInHost);
const speech = () => import('./speech.js');
const isSubs = (f) => f.kind === 'srt' || f.kind === 'vtt' || /\.(srt|vtt)$/i.test(f.name);
const isEdl = (f) => f.kind === 'json' || /\.json$/i.test(f.name);

/** Run steps in SlopCut's hidden copy on a main file (+ media) and hand the video back. */
async function render(id, main, media, steps, o, ctx = {}) {
  const run = await host();
  const r = await run(HOST, main, steps, Object.assign({ media, place: id !== 'slopedit.edl' && id !== 'slopedit.reel' }, saveOptions(o)), { signal: ctx.signal, progress: ctx.progress, timeout: 60 * 60 * 1000 });
  if (ctx.progress) ctx.progress(1);
  return r;
}
/** Captions: { srt } from the subtitle file given, or { listen } (the hidden SlopCut transcribes the edit's own sound;
 *  the model download is asked for here first, in the page the person sees). */
async function captionsOf(mode, subs, ctx) {
  if (mode === 'file') { if (!subs) throw new Error(t('ui.ops.video.need_subs')); return { srt: await subs.file.text() }; }
  if (mode !== 'transcribe') return {};
  await (await speech()).prepare({ progress: ctx.progress });
  return { listen: true };
}

async function edl(files, o, ctx) {
  const list = files.find(isEdl);
  if (!list) throw new Error(t('ui.ops.video.need_edl'));
  const doc = JSON.parse(await list.file.text()), media = files.filter((f) => f !== list).map((f) => f.file);
  const r = await render('slopedit.edl', list.file, media, hostSteps('slopedit.edl', o, { edl: doc }), o, ctx);
  return [{ name: `${stem(doc.name || list.name)}.${r.kind}`, blob: r.blob, kind: r.kind }];
}
async function onVideo(id, files, o, ctx) {
  const video = files.find((f) => !isSubs(f)), subs = files.find(isSubs);
  if (!video) throw new Error(t('ui.ops.video.need_video'));
  const mode = id !== 'slopedit.captions' ? 'none' : subs && o.captions !== 'transcribe' ? 'file' : 'transcribe';
  const r = await render(id, video.file, [], hostSteps(id, o, await captionsOf(mode, subs, ctx)), o, ctx);
  const tag = { 'slopedit.reframe': o.aspect && o.aspect !== 'same' ? o.aspect.replace(':', 'x') : '9x16', 'slopedit.captions': 'captions' }[id];
  return [{ name: `${stem(video.name)}-${tag}.${r.kind}`, blob: r.blob, kind: r.kind }];
}
async function reel(files, o, ctx) {
  const clips = files.filter((f) => !isSubs(f));
  if (!clips.length) throw new Error(t('ui.ops.video.need_clips'));
  const r = await render('slopedit.reel', clips[0].file, clips.slice(1).map((f) => f.file), hostSteps('slopedit.reel', o, await captionsOf(o.captions, files.find(isSubs), ctx)), o, ctx);
  return [{ name: `reel-${o.seed || 'remix'}.${r.kind}`.replace(/[^\w.-]+/g, '-'), blob: r.blob, kind: r.kind }];
}
async function transcript(files, o, ctx) {
  const f = files[0], S = await speech();
  const segs = await S.transcribe(f.file, { language: o.language || 'auto', signal: ctx.signal, progress: ctx.progress });
  const fmt = o.format || 'srt', text = await S.formatted(segs, fmt), ext = fmt === 'txt-times' ? 'txt' : fmt;
  const type = fmt === 'srt' ? 'application/x-subrip' : fmt === 'vtt' ? 'text/vtt' : 'text/plain';
  return [{ name: `${stem(f.name)}.${ext}`, blob: new Blob([text], { type }), kind: ext }];
}

export const VIDEO_OPS = register([
  { id: 'slopedit.edl', group: 'Video', from: ['json'], with: VIDEO.concat(AUDIO, PICS, ['srt', 'vtt']), ext: 'mp4', mode: 'combine', out: (k, o) => o.format || 'mp4',   // i18n-ignore: a group id (search words), an app name
    keywords: ['edit decision list', 'edl', 'montage', 'assemble', 'video editor', 'slopcut'], options: [ASPECT].concat(OUT), run: edl },
  { id: 'slopedit.reframe', group: 'Video', from: VIDEO, ext: 'mp4', mode: 'each', out: (k, o) => o.format || 'mp4',   // i18n-ignore: a group id (search words), an app name
    keywords: ['vertical', '9:16', 'reel', 'shorts', 'tiktok', 'crop', 'aspect ratio', 'portrait'],
    options: [VERTICAL, opt(V + 'focus', { key: 'focus', type: 'range', min: 0, max: 100, value: 50 })].concat(OUT), run: (f, o, c) => onVideo('slopedit.reframe', f, o, c) },
  { id: 'slopedit.captions', group: 'Video', from: VIDEO, with: ['srt', 'vtt'], ext: 'mp4', mode: 'combine', out: (k, o) => o.format || 'mp4',   // i18n-ignore: a group id (search words), an app name
    keywords: ['subtitles', 'burn in', 'captions', 'srt', 'open captions'], options: CAPTIONS.map((x) => (x.key === 'captions' ? like(x, { value: 'transcribe', options: x.options.slice(1) }) : x)).concat(OUT), run: (f, o, c) => onVideo('slopedit.captions', f, o, c) },
  { id: 'slopedit.reel', group: 'Video', from: VIDEO.concat(PICS), with: ['srt', 'vtt'], ext: 'mp4', mode: 'combine', out: (k, o) => o.format || 'mp4',   // i18n-ignore: a group id (search words), an app name
    keywords: ['reel', 'remix', 'montage', 'highlights', 'shorts', 'random edit', 'tiktok'],
    options: [opt(V + 'target', { key: 'target', type: 'number', min: 1, max: 600, value: 15 }), opt(V + 'pace', { key: 'pace', type: 'select', value: 'fast', options: ['fast', 'medium', 'slow'] }),
      opt(V + 'layout', { key: 'layout', type: 'text', value: 'none', hint: true }), opt(V + 'seed', { key: 'seed', type: 'text', value: '', hint: true }),
      VERTICAL].concat(CAPTIONS, OUT), run: reel },
], { app: 'slopedit', label: 'SlopCut' });   // i18n-ignore: a group id (search words), an app name

export const TRANSCRIBE_OPS = register([
  { id: 'transcribe.text', group: 'Audio and video', from: VIDEO.concat(AUDIO), ext: 'srt', mode: 'each', out: (k, o) => (o.format === 'txt-times' ? 'txt' : o.format || 'srt'),   // i18n-ignore: a group id (search words), an app name
    engine: 'whisper',
    keywords: ['transcribe', 'speech to text', 'subtitles', 'srt', 'captions', 'whisper'],
    options: [opt('ui.ops.transcribe.format', { key: 'format', type: 'select', value: 'srt', options: ['srt', 'vtt', 'txt', 'txt-times'] }), LANGUAGE], run: transcript },
], { app: 'transcribe', label: 'Slop Transcribe' });   // i18n-ignore: a group id (search words), an app name
