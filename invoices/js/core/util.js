// Slop Invoices: the invoice's own words for refusals; the rest is SlopBiz (shared/biz/biz.js). Classic script, loaded after
// shared/data and shared/biz/biz.js. Exposes window.SlopInvoices.util. Nothing here stores anything.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});

  // The invoice's own words where they differ from SlopBiz.PLAIN; the data layer's message follows after a colon.
  // words in the chosen language, read each time a refusal is shown (getters)
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const PLAIN = {
    get has_payments() { return t('invoices.core.has_payments'); },
    get overpayment() { return t('invoices.core.overpayment'); },
    get invalid_transition() { return t('invoices.core.not_allowed'); },
    get posting_required() { return t('invoices.core.status_rules'); },
  };
  const FIELD = { get customerId() { return t('invoices.core.customer'); }, get date() { return t('invoices.core.date'); }, get dueDate() { return t('invoices.core.due'); },
    get lines() { return t('invoices.core.lines'); }, get notes() { return t('invoices.core.notes'); }, get currency() { return t('invoices.core.currency'); }, get amount() { return t('invoices.core.amount'); } };

  const B = g.SlopBiz;
  /** One readable line for a failed Result, in the words of an invoice (SlopBiz.refusal, shared/biz/biz.js). */
  const refusal = (r) => B.refusal(r, { plain: PLAIN, fields: FIELD });

  // settings, money and the DOM builder are SlopBiz's (one copy for the business apps)
  /** The status in the page's language (SlopBiz.statusText): an issued invoice with nothing left to pay reads Paid. */
  const statusWord = (status, balance) => B.statusText(status === 'issued' && balance <= 0 ? 'paid' : status);

  NS.util = { PLAIN, FIELD, statusWord, refusal, settings: B.settings, money: B.money, h: B.h, ok: S.result.ok, fail: S.result.fail };
})(typeof window !== 'undefined' ? window : globalThis);
