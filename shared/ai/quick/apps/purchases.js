/* Slop AI quick prompts for Slop Purchases (the format: shared/ai/quick/engine.js). Words: prompts.purchases.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['purchases'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'reorder', when: ['tools'] },
    { id: 'open', when: ['tools'] },
    { id: 'supplier_mail', when: ['tools'], vars: [{ name: 'supplier', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'due', when: ['tools'] },
    { id: 'spend', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'compare', when: ['tools'] },
  ] };
})();
