// Customer notes. The shared customer record has one text field, so dated notes are stored as lines
// "[YYYY-MM-DD] text". A line that does not start with a date continues the note above it; text before any
// date is an undated note (for example a note imported from Slop Contacts). Pure functions, no storage.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const HEAD = /^\[(\d{4}-\d{2}-\d{2})\] ?(.*)$/;

  /** The notes in the text, in stored order: [{ date: 'YYYY-MM-DD' | '', text }]. */
  function parse(text) {
    const out = [];
    for (const line of String(text || '').split('\n')) {
      const m = HEAD.exec(line);
      if (m) out.push({ date: m[1], text: m[2] });
      else if (!out.length) out.push({ date: '', text: line });
      else out[out.length - 1].text += `\n${line}`;
    }
    return out.map((n) => ({ date: n.date, text: n.text.trim() })).filter((n) => n.text || n.date);
  }

  /** Appends one dated note. A note is kept on one line so that it can never be read as a new dated note. */
  function append(text, date, note) {
    const one = String(note || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!one) return String(text || '');
    const line = `[${date}] ${one}`;
    const base = String(text || '').replace(/\s+$/, '');
    return base ? `${base}\n${line}` : line;
  }

  /** Notes newest first; undated notes last. */
  function newestFirst(list) {
    return list.slice().sort((a, b) => (a.date === b.date ? 0 : !a.date ? 1 : !b.date ? -1 : a.date < b.date ? 1 : -1));
  }

  NS.notes = { parse, append, newestFirst };
})(typeof window !== 'undefined' ? window : globalThis);
