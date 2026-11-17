/* Slop AI quick prompts for Slop HTML to PDF (the format: shared/ai/quick/engine.js). Words: prompts.html2pdf.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['html2pdf'] = { skip: ['quiz'], prompts: [
    { id: 'header', when: ['tools'] },
    { id: 'print_check', when: ['tools'] },
    { id: 'settings', when: ['tools'] },
    { id: 'print_css', when: ['tools'], vars: [{ name: 'level', kind: 'number', default: 2, min: 1, max: 3 }] },
    { id: 'summary', when: ['tools'] },
    { id: 'make_page', vars: [{ name: 'topic', kind: 'text', hint: true }] },
  ] };
})();
