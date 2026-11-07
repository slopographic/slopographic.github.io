// Numbering sequences (invoice and order numbers): the prefix and the zero-padding change how new numbers look.
// The next number can only move forward; the schema refuses a lower value. Numbers already issued never change.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const { ok, fail } = S.result;

  /** The sequences, in a fixed order (invoice, then order). */
  async function list() {
    const r = await S.store.list('numbering');
    if (!r.ok) return r;
    const order = ['invoice', 'order'];
    return ok(r.value.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));
  }

  /** Saves one sequence. Returns the stored record. */
  async function save(id, input) {
    const cur = await S.store.get('numbering', id);
    if (!cur.ok) return cur;
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    if (!cur.value) return fail('not_found', t('admin.core.no_seq', { id }));
    const prefix = String(input.prefix ?? '');
    const pad = Number(String(input.pad ?? '').trim());
    const next = Number(String(input.next ?? '').trim());
    if (!Number.isInteger(pad) || pad < 1 || pad > 12) return fail('invalid', t('admin.core.pad'));
    if (!Number.isSafeInteger(next) || next < 1) return fail('invalid', t('admin.core.next'));
    if (next < cur.value.next) return fail('invalid', t('admin.core.forward', { n: String(cur.value.next) }));
    return S.store.put('numbering', { ...cur.value, prefix, pad, next });
  }

  /** What the next number will look like, for the preview. */
  const preview = (seq) => S.numbering.format(seq, seq.next);

  NS.numbering = { list, save, preview };
})(typeof window !== 'undefined' ? window : globalThis);
