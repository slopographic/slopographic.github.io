// A printable business sheet (a customer statement, a price list): the company block from the settings on the left, the
// title and its dates on the right. Styles in shared/biz/sheet.css (.doc-sheet, its parts, and the print rules that show only
// the sheet). A printed document's words are its document language's (SlopBiz.docLang): the caller passes them (words); the
// stored names and addresses stay as written. Classic script, loaded after biz.js. SlopBiz.sheet = { head(settings, title, meta, words), lines(text) }.
(function (g) {
  'use strict';
  const B = (g.SlopBiz = g.SlopBiz || {});

  /** The non-empty lines of a multi-line text (an address). */
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);

  /** The sheet head: the company (name, address lines, tax number) and the title with its meta lines ('Date 10/24/2026'), in
   *  the words of the document's language (words: SlopBiz.docLang.words; without them the page's, as the ledger's reports). */
  function head(settings, title, meta = [], words) {
    const h = B.h, s = settings || {}, w = words || B.docLang.words(g.SlopI18n ? g.SlopI18n.get() : 'en', s.locale);
    return h('header', { class: 'sheet-head' },
      h('div', null, h('b', { text: s.companyName || w.t('biz.pr.your_company') }), ...lines(s.address).map((x) => h('div', { text: x })),
        s.taxNumber ? h('div', { text: w.t('biz.pr.tax_number', { number: s.taxNumber }) }) : null),
      h('div', { class: 'sheet-title' }, h('h2', { text: title }), ...meta.filter(Boolean).map((x) => h('div', { text: x }))));
  }

  B.sheet = { head, lines };
})(typeof window !== 'undefined' ? window : globalThis);
