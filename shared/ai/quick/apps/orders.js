/* Slop AI quick prompts for Slop Orders (the format: shared/ai/quick/engine.js). Words: prompts.orders.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['orders'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'open', when: ['tools'] },
    { id: 'new_order', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'top_products', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 10, min: 1, max: 50 }] },
    { id: 'customer', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'status_mail', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'period', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
    { id: 'to_invoice', when: ['tools'] },
  ] };
})();
