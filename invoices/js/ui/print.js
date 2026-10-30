// The Print view: the printable invoice sheet, with Print (the browser's print dialog), Export PDF and Back.
(function (g) {
  'use strict';
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const $ = (id) => document.getElementById(id);
  let current = null;

  function mount() {
    $('pBack').addEventListener('click', () => NS.app.go(current ? `i/${current}` : 'list'));
    $('pPrint').addEventListener('click', () => window.print());
    $('pPdf').addEventListener('click', () => current && NS.preview.pdf(current));
  }

  NS.views = NS.views || {};
  NS.views.print = { mount, refresh: () => {}, onShow: (id) => { current = id || null; return NS.preview.show(current); } };
})(typeof window !== 'undefined' ? window : globalThis);
