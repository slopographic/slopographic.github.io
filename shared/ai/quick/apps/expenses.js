/* Slop AI quick prompts for Slop Expenses (the format: shared/ai/quick/engine.js). Words: prompts.expenses.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['expenses'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'categorize', when: ['tools'] },
    { id: 'summary', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'from_text', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'missing', when: ['tools'] },
    { id: 'vat', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'unusual', when: ['tools'] },
  ] };
})();
