/* Slop AI quick prompts for Slop Reports (the format: shared/ai/quick/engine.js). Words: prompts.reports.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['reports'] = { skip: ['quiz', 'expand'], prompts: [
    { id: 'month', when: ['tools'] },
    { id: 'top_customers', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 5, min: 1, max: 50 }] },
    { id: 'costs', when: ['tools'] },
    { id: 'trend', when: ['tools'] },
    { id: 'unpaid', when: ['tools'] },
    { id: 'update', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
  ] };
})();
