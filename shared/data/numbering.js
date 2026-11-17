// Gapless document numbers (INV-0001, ORD-0001). A sequence is a record in the 'numbering' store.
// A number is taken inside the same transaction as the document it belongs to, so a failed save
// rolls the counter back too: no gaps, and no duplicates across tabs (IndexedDB serialises writers).
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;

  /** "INV-" + zero-padded number. Numbers wider than the padding are kept whole. */
  function format(seq, n) {
    return `${seq.prefix || ''}${String(n).padStart(seq.pad || 4, '0')}`;
  }

  /** Pure: takes the next number from a sequence record. Returns the number and the advanced record. */
  function take(seq) {
    return { n: seq.next, seq: { ...seq, next: seq.next + 1 } };
  }

  /** Splits "INV-0007" into { prefix: 'INV-', n: 7 }. Null when there is no number at the end. */
  function parse(text) {
    const m = /^(.*?)(\d+)$/.exec(String(text || ''));
    return m ? { prefix: m[1], n: Number(m[2]) } : null;
  }

  /** Inside a store transaction (tx = the api passed to store.transact): takes the next number of a sequence. */
  async function allocate(tx, name) {
    const r = await tx.get('numbering', name);
    if (!r.ok) return r;
    if (!r.value) return fail('not_found', say('ui.data.err.no_sequence', { name }));
    const t = take(r.value);
    const w = await tx.put('numbering', t.seq);
    if (!w.ok) return w;
    return ok(format(r.value, t.n));
  }

  /** Takes the next number in its own transaction. */
  const next = (name) => ns.store.transact((tx) => allocate(tx, name));

  /** The number the next document would get, without taking it. */
  async function peek(name) {
    const r = await ns.store.get('numbering', name);
    if (!r.ok || !r.value) return r.ok ? fail('not_found', say('ui.data.err.no_sequence', { name })) : r;
    return ok(format(r.value, r.value.next));
  }

  ns.numbering = { format, take, parse, allocate, next, peek };
})(typeof window !== 'undefined' ? window : globalThis);
