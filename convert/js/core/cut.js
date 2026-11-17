/* Cutting a piece out of audio (and the times for cutting video). Pure (no DOM): the channels are Float32Arrays, as
 * audio.js decodes them.
 *   parseClock(text) -> seconds | null     '90', '1:30', '1:02:03.5', '1,5' (a decimal comma); blank is null; throws on
 *                                          anything else
 *   cutRange({ start, end }, duration) -> { from, to }   seconds within the file; a blank end is the end of the file;
 *                                          throws when the piece is empty
 *   cutChannels(channels, rate, { start, end, fadeIn, fadeOut }) -> channels   the piece, with a linear fade in and out */
import { tr } from './i18n.js';
export function parseClock(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!s) return null;
  const m = /^(?:(?:(\d+):)?(\d{1,2}):)?(\d+(?:\.\d*)?|\.\d+)$/.exec(s);
  if (!m) throw new Error(tr('convert.media.not_time', { text: String(text).trim() }));
  if ((m[1] || m[2]) && Number(m[3]) >= 60) throw new Error(tr('convert.media.bad_seconds', { text: String(text).trim() }));
  return (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 + Number(m[3]);
}

const clock = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(s % 1 ? 2 : 0)}`; };

export function cutRange({ start, end } = {}, duration = Infinity) {
  const from = Math.max(0, parseClock(start) ?? 0);
  const asked = parseClock(end);
  const to = Math.min(duration, asked ?? duration);
  if (from >= duration) throw new Error(tr('convert.media.start_after_end', { start: clock(from), end: clock(duration) }));
  if (!(to > from)) throw new Error(tr('convert.media.end_before_start'));
  return { from, to };
}

export function cutChannels(channels, rate, { start, end, fadeIn = 0, fadeOut = 0 } = {}) {
  const frames = channels[0].length;
  const { from, to } = cutRange({ start, end }, frames / rate);
  const a = Math.round(from * rate), b = Math.min(frames, Math.round(to * rate));
  const n = b - a;
  const fi = Math.min(n, Math.round(Math.max(0, Number(fadeIn) || 0) * rate)), fo = Math.min(n, Math.round(Math.max(0, Number(fadeOut) || 0) * rate));
  return channels.map((ch) => {
    const out = ch.slice(a, b);
    for (let i = 0; i < fi; i++) out[i] *= i / fi;
    for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
    return out;
  });
}
