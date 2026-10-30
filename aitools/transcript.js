/* Transcripts: the one place that turns timed speech segments ({ start, end, text } in seconds, from the Whisper engine)
 * into text formats. Used by the AI Tools Speech page and by Slop Transcribe. Pure; classic script that also works in Node.
 * Sets window.SlopTranscript:
 *   stamp(s, sep)        hh:mm:ss,mmm (SRT, sep ',') or hh:mm:ss.mmm (WebVTT, sep '.')
 *   clock(s)             hh:mm:ss, for reading
 *   txt(segs, { times }) one line per segment, with [hh:mm:ss] in front when times is true
 *   srt(segs), vtt(segs) subtitles: numbered SRT cues, or a WEBVTT file
 *   paragraphs(segs, gap) segments joined into paragraphs, a new one after a pause longer than gap seconds (default 2)
 *   docxBlocks(title, segs, { meta, times }) blocks for shared/office/docx.js: a heading, a meta line, the paragraphs
 *   words(text)          the number of words in a text */
(function (root) {
  'use strict';
  const two = (v) => String(v).padStart(2, '0');

  function stamp(s, sep = ',') {
    const ms = Math.max(0, Math.round((Number(s) || 0) * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
    return `${two(h)}:${two(m)}:${two(sec)}${sep}${String(ms % 1000).padStart(3, '0')}`;
  }
  const clock = (s) => stamp(s).slice(0, 8);
  const clean = (segs) => (segs || []).filter((x) => x && String(x.text || '').trim()).map((x) => ({ ...x, text: String(x.text).trim() }));

  function txt(segs, { times = false } = {}) {
    return clean(segs).map((x) => (times ? `[${clock(x.start)}] ${x.text}` : x.text)).join('\n');
  }
  function srt(segs) {
    return clean(segs).map((x, i) => `${i + 1}\n${stamp(x.start)} --> ${stamp(x.end)}\n${x.text}\n`).join('\n');
  }
  function vtt(segs) {
    return 'WEBVTT\n\n' + clean(segs).map((x) => `${stamp(x.start, '.')} --> ${stamp(x.end, '.')}\n${x.text}\n`).join('\n');
  }
  /** Paragraphs of { start, text }: the segments run on until a pause longer than gap seconds. */
  function paragraphs(segs, gap = 2) {
    const out = [];
    for (const x of clean(segs)) {
      const last = out[out.length - 1];
      if (last && x.start - last.end <= gap) { last.text += ' ' + x.text; last.end = x.end; } else out.push({ start: x.start, end: x.end, text: x.text });
    }
    return out;
  }
  function docxBlocks(title, segs, { meta = '', times = false } = {}) {
    const paras = paragraphs(segs);
    return [{ type: 'heading', level: 1, text: title || 'Transcript' }, ...(meta ? [{ type: 'paragraph', runs: [{ text: meta, italic: true }] }] : []),
      ...paras.map((p) => ({ type: 'paragraph', runs: times ? [{ text: `[${clock(p.start)}] `, bold: true }, { text: p.text }] : [{ text: p.text }] }))];
  }
  const words = (text) => (String(text || '').match(/\S+/g) || []).length;

  root.SlopTranscript = { stamp, clock, txt, srt, vtt, paragraphs, docxBlocks, words };
})(typeof window !== 'undefined' ? window : globalThis);
