/* Subtitles: SubRip (.srt) and WebVTT (.vtt), both ways, with the timing shifted when asked. Pure (no DOM).
 *   parseSubs(text) -> [{ start, end, text, settings }]   times in milliseconds; reads SRT and VTT alike (a comma or a dot
 *                                                       before the milliseconds, hours optional), so a mislabelled file
 *                                                       still reads. VTT cue settings (align:start …) are kept; NOTE,
 *                                                       STYLE and REGION blocks are not cues and are left out.
 *   toSrt(cues) / toVtt(cues) -> text                  SRT numbers the cues from 1; VTT starts with WEBVTT
 *   shiftCues(cues, ms) -> cues                        later (+) or earlier (−); a cue pushed before 0:00 is cut at 0, and
 *                                                       one that would end before 0:00 is dropped
 *   fmtTime(ms, sep) -> '00:01:02,345' (sep ',') or '00:01:02.345' (sep '.') */
import { tr } from './i18n.js';
const TIME = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ARROW = new RegExp(`^\\s*${TIME.source}\\s*-->\\s*${TIME.source}(.*)$`);

const ms = (h, m, s, f) => ((Number(h || 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(String(f).padEnd(3, '0'));

export function fmtTime(t, sep = ',') {
  const v = Math.max(0, Math.round(t));
  const h = Math.floor(v / 3600000), m = Math.floor(v / 60000) % 60, s = Math.floor(v / 1000) % 60, f = v % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`;
}

export function parseSubs(text) {
  const blocks = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
    const at = lines.findIndex((l) => ARROW.test(l));
    if (at < 0) continue;   // the WEBVTT header, a NOTE, STYLE or REGION block, or stray text
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const m = ARROW.exec(lines[at]);
    const start = ms(m[1], m[2], m[3], m[4]), end = ms(m[5], m[6], m[7], m[8]);
    cues.push({ start, end, text: lines.slice(at + 1).join('\n').trim(), settings: (m[9] || '').trim() });
  }
  if (!cues.length) throw new Error(tr('convert.subs.none_srt'));
  return cues;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${fmtTime(c.start, ',')} --> ${fmtTime(c.end, ',')}\n${c.text}\n`).join('\n');
}
export function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map((c) => `${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}${c.settings ? ' ' + c.settings : ''}\n${c.text}\n`).join('\n');
}

export function shiftCues(cues, by) {
  const d = Math.round(Number(by) || 0);
  if (!d) return cues;
  return cues.filter((c) => c.end + d > 0).map((c) => ({ ...c, start: Math.max(0, c.start + d), end: c.end + d }));
}

/** SRT or VTT text from either, shifted by `shift` seconds. */
export function convertSubs(text, to, { shift = 0 } = {}) {
  const cues = shiftCues(parseSubs(text), Number(shift || 0) * 1000);
  return to === 'vtt' ? toVtt(cues) : toSrt(cues);
}
