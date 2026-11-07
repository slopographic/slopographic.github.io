/* Slop Recorder: the pure parts of a recording's plan, Node-tested (tests/node/recorder-core.test.mjs). Classic script:
 * SlopRec.plan; also a CommonJS module.
 *   SOURCES, FORMATS, CORNERS        the choices the panel and the assistant offer
 *   clean(opts)                      the settings with every value checked (unknown values fall back to the defaults)
 *   formatsFor(source)               the save formats for a source (no GIF for sound only; WAV only for sound)
 *   needs(opts)                      { display, camera, mic, systemAudio }: what to ask the browser for
 *   pipRect(w, h, cw, ch, corner, size)   where the webcam goes on a w × h picture: { x, y, w, h } (size: % of the width)
 *   clampTrim(start, end, duration)  { start, end } in seconds, inside the recording, at least MIN_LEN long
 *   isTrimmed(t, duration)           true when the range leaves something out
 *   ffmpegArgs(format, trim, o)      (inName, outName) → the ffmpeg arguments for MP4, GIF or a WebM re-encode of the range
 *   pickMime(isTypeSupported, audioOnly)   the first recording type the browser writes, '' when none
 *   fileName(date, ext), clock(ms), seconds(s)   'Recording 2026-10-24 21-05-09.webm', '01:02:03', '1:02.5' */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopRec = root.SlopRec || {}).plan = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SOURCES = [['screen', 'Screen, window or tab'], ['camera', 'Webcam'], ['pip', 'Screen + webcam'], ['mic', 'Microphone only']];
  const FORMATS = [['webm', 'WebM (no conversion)'], ['mp4', 'MP4 (H.264)'], ['gif', 'GIF (no sound)'], ['wav', 'WAV (sound)']];
  const CORNERS = [['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tl', 'Top left']];
  const COUNTDOWNS = [0, 3, 5, 10];
  const MIN_LEN = 0.1;
  const DEFAULTS = { source: 'screen', systemAudio: true, mic: true, countdown: 3, format: 'webm', corner: 'br', pipSize: 25, gifWidth: 640, gifFps: 10 };
  const has = (list, v) => list.some(([k]) => k === v);
  const num = (v, lo, hi, d) => { const n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };

  function formatsFor(source) {
    return source === 'mic' ? ['webm', 'wav'] : ['webm', 'mp4', 'gif'];
  }
  function clean(o = {}) {
    const d = DEFAULTS, source = has(SOURCES, o.source) ? o.source : d.source;
    const fmts = formatsFor(source), format = fmts.includes(o.format) ? o.format : fmts[0];
    return {
      source, format,
      systemAudio: o.systemAudio == null ? d.systemAudio : !!o.systemAudio,
      mic: o.mic == null ? d.mic : !!o.mic,
      countdown: COUNTDOWNS.includes(Number(o.countdown)) ? Number(o.countdown) : d.countdown,
      corner: has(CORNERS, o.corner) ? o.corner : d.corner,
      pipSize: num(o.pipSize, 10, 50, d.pipSize),
      gifWidth: num(o.gifWidth, 160, 1920, d.gifWidth),
      gifFps: num(o.gifFps, 2, 30, d.gifFps),
    };
  }
  function needs(o) {
    const c = clean(o), display = c.source === 'screen' || c.source === 'pip';
    return { display, camera: c.source === 'camera' || c.source === 'pip', mic: c.source === 'mic' || c.mic, systemAudio: display && c.systemAudio };
  }
  function pipRect(w, h, cw, ch, corner = 'br', size = 25) {
    const bw = Math.round((w * Math.min(50, Math.max(10, size))) / 100), bh = Math.round((bw * (ch || 9)) / (cw || 16));
    const m = Math.round(Math.min(w, h) * 0.03);
    return { x: corner[1] === 'l' ? m : w - bw - m, y: corner[0] === 't' ? m : h - bh - m, w: bw, h: bh };
  }
  function clampTrim(start, end, duration) {
    const d = Math.max(0, Number(duration) || 0);
    let s = Math.min(Math.max(0, Number(start) || 0), d), e = end == null || end === '' ? d : Math.min(Math.max(0, Number(end)), d);
    if (!isFinite(e)) e = d;
    if (e - s < MIN_LEN) { if (s + MIN_LEN <= d) e = s + MIN_LEN; else { e = d; s = Math.max(0, d - MIN_LEN); } }
    return { start: Math.round(s * 1000) / 1000, end: Math.round(e * 1000) / 1000 };
  }
  const isTrimmed = (t, duration) => !!t && (t.start > 0.005 || t.end < Number(duration) - 0.005);
  /** ffmpeg arguments: the range is cut after the input (frame-accurate: the picture is encoded again). */
  function ffmpegArgs(format, trim, o = {}) {
    const c = clean(Object.assign({}, o, { format })), cut = trim ? ['-ss', String(trim.start), '-t', String(Math.max(MIN_LEN, trim.end - trim.start))] : [];
    if (format === 'gif') return (i, out) => ['-i', i, ...cut, '-vf', `fps=${c.gifFps},scale=${c.gifWidth}:-2:flags=lanczos`, '-loop', '0', out];
    if (format === 'mp4') return (i, out) => ['-i', i, ...cut, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out];
    return (i, out) => ['-i', i, ...cut, '-c:v', 'libvpx', '-b:v', '2M', '-c:a', 'libvorbis', '-b:a', '128k', out];
  }
  const VIDEO_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
  const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  function pickMime(isTypeSupported, audioOnly = false) {
    const ok = (t) => { try { return !!isTypeSupported(t); } catch (e) { return false; } };
    return (audioOnly ? AUDIO_TYPES : VIDEO_TYPES).find(ok) || '';
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const fileName = (d, ext) => `Recording ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}.${ext}`;
  function clock(ms) {
    const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    return `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`;
  }
  function seconds(s) {
    const t = Math.max(0, Math.round((Number(s) || 0) * 10) / 10), m = Math.floor(t / 60), r = (t - m * 60).toFixed(1);
    return `${m}:${r.padStart(4, '0')}`;
  }
  /** The extension and MIME type of a recorded type ('video/webm;codecs=vp9' → webm). */
  const extOf = (mime) => (/mp4/.test(mime) ? (/^audio/.test(mime) ? 'm4a' : 'mp4') : /ogg/.test(mime) ? 'ogg' : 'webm');
  return { SOURCES, FORMATS, CORNERS, COUNTDOWNS, DEFAULTS, MIN_LEN, clean, formatsFor, needs, pipRect, clampTrim, isTrimmed, ffmpegArgs, pickMime, fileName, clock, seconds, extOf };
});
