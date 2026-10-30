/* Audio out of video and audio files: decode the sound in the browser, then write a 16-bit WAV or an MP3.
 * The encoders are pure (they take channel arrays); decodeAudio and loadLame touch the browser. The MP3 encoder is
 * lamejs (LGPL-3.0, vendor/lamejs), loaded on first use. Nothing leaves the device. */
import { tr } from './i18n.js';

const LAME_URL = new URL('../../../vendor/lamejs/lame.min.js', import.meta.url).href;
let lamePending = null;

/** The lamejs namespace, loaded once by injecting its script tag. */
export function loadLame() {
  if (globalThis.lamejs) return Promise.resolve(globalThis.lamejs);
  if (!lamePending) {
    lamePending = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LAME_URL;
      s.onload = () => (globalThis.lamejs ? resolve(globalThis.lamejs) : reject(new Error(tr('convert.media.mp3_not_loaded'))));
      s.onerror = () => { lamePending = null; reject(new Error(tr('convert.media.mp3_load_failed'))); };
      document.head.append(s);
    });
  }
  return lamePending;
}

/** Decodes the sound of a video or audio file to an AudioBuffer. Browsers read the audio track of MP4, WebM, MOV,
 * MP3, WAV, OGG and FLAC; the result is resampled to 44.1 kHz. Throws a plain message when there is no sound. */
export async function decodeAudio(bytes) {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  let buf;
  try {
    // decodeAudioData wants an ArrayBuffer of exactly the file's bytes (a view's buffer may be larger).
    const ab = bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    buf = await ctx.decodeAudioData(ab);
  } catch (e) {
    throw new Error(tr('convert.media.no_track'));
  }
  if (!buf || buf.numberOfChannels === 0 || buf.length === 0) throw new Error(tr('convert.media.no_sound'));
  return buf;
}

/** The channels of an AudioBuffer as Float32Arrays, at most two (stereo, or mono when the source is mono). */
export function channelsOf(buf) {
  const n = Math.min(2, buf.numberOfChannels);
  const out = [];
  for (let c = 0; c < n; c++) out.push(buf.getChannelData(c));
  return out;
}

const clamp16 = (x) => { const s = Math.max(-1, Math.min(1, x)); return s < 0 ? s * 0x8000 : s * 0x7fff; };

/** A 16-bit PCM WAV file (RIFF) for the given Float32 channels, interleaved. */
export function encodeWav(channels, sampleRate) {
  const ch = channels.length, frames = channels[0].length;
  const dataLen = frames * ch * 2;
  const out = new DataView(new ArrayBuffer(44 + dataLen));
  const put = (at, s) => { for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i)); };
  put(0, 'RIFF'); out.setUint32(4, 36 + dataLen, true); put(8, 'WAVE');
  put(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sampleRate, true); out.setUint32(28, sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  put(36, 'data'); out.setUint32(40, dataLen, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) { out.setInt16(at, clamp16(channels[c][i]), true); at += 2; }
  }
  return new Uint8Array(out.buffer);
}

/** An MP3 file for the given channels at a bitrate in kbps, encoded with lamejs. */
export function encodeMp3(lamejs, channels, sampleRate, kbps = 128) {
  const ch = channels.length;
  const enc = new lamejs.Mp3Encoder(ch, sampleRate, kbps);
  const parts = [];
  const block = 1152;
  const pcm = channels.map((x) => Int16Array.from(x, clamp16));
  for (let i = 0; i < pcm[0].length; i += block) {
    const l = pcm[0].subarray(i, i + block);
    const chunk = ch === 2 ? enc.encodeBuffer(l, pcm[1].subarray(i, i + block)) : enc.encodeBuffer(l);
    if (chunk.length) parts.push(chunk);
  }
  const end = enc.flush();
  if (end.length) parts.push(end);
  return new Blob(parts, { type: 'audio/mpeg' });
}
