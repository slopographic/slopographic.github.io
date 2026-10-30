/* Slop AI quick prompts for Slop Ledger (the format: shared/ai/quick/engine.js). Words: prompts.ledger.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['ledger'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'entry', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'pnl', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'trial', when: ['tools'] },
    { id: 'vat', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'account', when: ['tools'], vars: [{ name: 'account', kind: 'text', hint: true }] },
    { id: 'year_end', when: ['tools'] },
  ] };
})();
