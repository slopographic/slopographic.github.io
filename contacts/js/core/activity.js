/* Slop Contacts: the notes of a customer. The shared record keeps one text field. Lines that start with
 * "[YYYY-MM-DD] " are dated notes (the Activity section); other lines are the plain notes. Same format as the CRM.
 * Pure functions. Adds SlopContacts.activity. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const HEAD = /^\[(\d{4}-\d{2}-\d{2})\] ?(.*)$/;

  /** Splits notes into { plain, activity: [{ date, text }] } in stored order. */
  function split(notes) {
    const plain = [], activity = [];
    for (const line of String(notes || '').replace(/\r\n?/g, '\n').split('\n')) {
      const m = HEAD.exec(line);
      if (m) activity.push({ date: m[1], text: m[2] });
      else if (activity.length) activity[activity.length - 1].text += `\n${line}`;
      else plain.push(line);
    }
    return { plain: plain.join('\n').trim(), activity: activity.map((a) => ({ date: a.date, text: a.text.trim() })).filter((a) => a.text) };
  }

  /** The stored text from plain notes and dated notes. A dated note is one line, so it is never read as plain text. */
  function join(plain, activity) {
    const lines = String(plain || '').trim() ? [String(plain).trim()] : [];
    for (const a of activity || []) lines.push(`[${a.date}] ${String(a.text || '').replace(/\s*\n\s*/g, ' ').trim()}`);
    return lines.join('\n');
  }

  /** Dated notes, newest first. */
  const newestFirst = (list) => list.slice().sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  SC.activity = { split, join, newestFirst };
})();
