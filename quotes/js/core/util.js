// Slop Quotes: the quote's own words for refusals and its status names; the rest is SlopBiz (shared/biz/biz.js). Classic
// script, loaded after shared/data and shared/biz/biz.js. Exposes window.SlopQuotes.util. Nothing here stores anything.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopQuotes = g.SlopQuotes || {});

  // The quote's own words where they differ from SlopBiz.PLAIN; the data layer's message follows after a colon.
  // words in the chosen language, read each time a refusal is shown (getters); printed statuses are biz.st.* in the document's language (shared/docs/doc-view.js)
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const PLAIN = { get invalid_transition() { return t('quotes.core.not_allowed'); }, get conflict() { return t('quotes.core.converted'); } };
  const FIELD = { get customerId() { return t('quotes.core.customer'); }, get date() { return t('quotes.core.date'); }, get validUntil() { return t('quotes.core.valid_until'); },
    get lines() { return t('quotes.core.lines'); }, get notes() { return t('quotes.core.notes'); }, get currency() { return t('quotes.core.currency'); }, get status() { return t('quotes.core.status'); } };

  const B = g.SlopBiz;
  /** One readable line for a failed Result, in the words of a quote (SlopBiz.refusal). */
  const refusal = (r) => B.refusal(r, { plain: PLAIN, fields: FIELD });

  NS.util = { PLAIN, FIELD, refusal, settings: B.settings, money: B.money, h: B.h, ok: S.result.ok, fail: S.result.fail };
})(typeof window !== 'undefined' ? window : globalThis);
