/* Slop AI quick prompts for Slop Quotes (the format: shared/ai/quick/engine.js). Words: prompts.quotes.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['quotes'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'from_text', when: ['tools'], vars: [{ name: 'details', kind: 'text', long: true, hint: true }] },
    { id: 'follow_up', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'expiring', when: ['tools'] },
    { id: 'win_rate', when: ['tools'] },
    { id: 'terms', when: ['tools'] },
    { id: 'to_order', when: ['tools'] },
  ] };
})();
