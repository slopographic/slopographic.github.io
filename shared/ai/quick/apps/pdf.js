/* Slop AI quick prompts for Slop PDF (the format: shared/ai/quick/engine.js). Words: prompts.pdf.* in shared/ai/i18n/<code>/office.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['pdf'] = { skip: [], prompts: [
    { id: 'page_by_page', when: ['tools'] },
    { id: 'key_dates', when: ['tools'] },
    { id: 'fine_print', when: ['tools'] },
    { id: 'fill_form', when: ['tools'] },
    { id: 'extract', when: ['tools'], vars: [{ name: 'pages', kind: 'text', hint: true }] },
    { id: 'stamp', when: ['tools'], vars: [{ name: 'stamp', kind: 'text', hint: true }] },
    { id: 'fix_rotation', when: ['tools'] },
    { id: 'compress', when: ['tools'] },
  ] };
})();
