/* More subtitle formats read into the cues of subtitles.js, which writes them as SRT or VTT. Pure (no DOM).
 *   parseAss(text) -> cues    Advanced SubStation Alpha and SubStation Alpha (.ass, .ssa): the Dialogue lines of [Events],
 *                             in the field order of its Format line. Italic, bold and underline become <i>, <b>, <u>; the
 *                             other override codes ({\pos(…)}, colours, karaoke) are dropped; \N is a line break. Comment
 *                             lines are left out. Cues are sorted by start time.
 *   parseSbv(text) -> cues    YouTube's SubViewer (.sbv): "0:00:01.000,0:00:03.500" then the text
 *   subsTo(cues, to, { shift }) -> text   SRT or VTT, shifted by seconds */
import { toSrt, toVtt, shiftCues } from './subtitles.js';
import { tr } from './i18n.js';

const ASS_TIME = /^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/;
function assMs(t) {
  const m = ASS_TIME.exec(String(t).trim());
  if (!m) return NaN;
  const frac = m[4] ? Number(m[4].padEnd(3, '0')) : 0;   // centiseconds in ASS ("0:00:01.50" is 1.5 s)
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + frac;
}

/** The text of an ASS Dialogue: override blocks become tags or nothing, \N and \n line breaks, \h a space. */
export function assText(s) {
  const open = [];
  let out = String(s).replace(/\{([^}]*)\}/g, (_, codes) => {
    let tags = '';
    for (const m of codes.matchAll(/\\([ibu])([01])(?![0-9])/g)) {
      const [, t, on] = m;
      if (on === '1' && !open.includes(t)) { open.push(t); tags += `<${t}>`; }
      if (on === '0' && open.includes(t)) { open.splice(open.indexOf(t), 1); tags += `</${t}>`; }
    }
    return tags;
  });
  for (const t of open.reverse()) out += `</${t}>`;
  return out.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ').split('\n').map((l) => l.trim()).join('\n').trim();
}

export function parseAss(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '', format = null;
  const cues = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) { section = line.toLowerCase(); continue; }
    if (section !== '[events]') continue;
    const m = /^(Format|Dialogue)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    if (/^format$/i.test(m[1])) { format = m[2].split(',').map((f) => f.trim().toLowerCase()); continue; }
    const fields = format || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const parts = m[2].split(',');
    const head = parts.slice(0, fields.length - 1), body = parts.slice(fields.length - 1).join(',');
    const at = (k) => head[fields.indexOf(k)];
    const start = assMs(at('start')), end = assMs(at('end'));
    if (!(start >= 0) || !(end >= 0)) continue;
    const t = assText(fields[fields.length - 1] === 'text' ? body : head[fields.indexOf('text')] || body);
    if (t) cues.push({ start, end, text: t, settings: '' });
  }
  if (!cues.length) throw new Error(tr('convert.subs.none_ass'));
  return cues.sort((a, b) => a.start - b.start);
}

const SBV = /^\s*(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,3})\s*,\s*(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,3})\s*$/;
const sbvMs = (h, m, s, f) => ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(String(f).padEnd(3, '0'));

export function parseSbv(text) {
  const blocks = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => SBV.test(l));
    if (i < 0) continue;
    const m = SBV.exec(lines[i]);
    cues.push({ start: sbvMs(m[1], m[2], m[3], m[4]), end: sbvMs(m[5], m[6], m[7], m[8]), text: lines.slice(i + 1).join('\n').trim(), settings: '' });
  }
  if (!cues.length) throw new Error(tr('convert.subs.none_sbv'));
  return cues;
}

export function subsTo(cues, to, { shift = 0 } = {}) {
  const c = shiftCues(cues, Number(shift || 0) * 1000);
  return to === 'vtt' ? toVtt(c) : toSrt(c);
}
