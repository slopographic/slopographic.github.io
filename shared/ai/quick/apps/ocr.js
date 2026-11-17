/* Slop AI quick prompts for Slop OCR (the format: shared/ai/quick/engine.js). Words: prompts.ocr.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['ocr'] = { skip: [], prompts: [
    { id: 'fix_reading', when: ['tools'] },
    { id: 'to_table', when: ['tools'] },
    { id: 'receipt', when: ['tools'] },
    { id: 'fields', when: ['tools'] },
    { id: 'summary', when: ['tools'], vars: [{ name: 'length', kind: 'choice', options: 'length' }] },
    { id: 'translate_read', when: ['tools'], vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
  ] };
})();
