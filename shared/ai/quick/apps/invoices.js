/* Slop AI quick prompts for Slop Invoices (the format: shared/ai/quick/engine.js). Words: prompts.invoices.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['invoices'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'overdue', when: ['tools'] },
    { id: 'reminder', when: ['tools'], vars: [{ name: 'client', kind: 'text', hint: true }, { name: 'level', kind: 'choice', options: ['gentle', 'firm', 'final'] }] },
    { id: 'new_invoice', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'cashflow', when: ['tools'] },
    { id: 'thanks', when: ['tools'], vars: [{ name: 'client', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'period', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'slow_payers', when: ['tools'] },
    { id: 'credit', when: ['tools'], vars: [{ name: 'invoice', kind: 'text', hint: true }] },
  ] };
})();
