/* Slop AI quick prompts for Slop CRM (the format: shared/ai/quick/engine.js). Words: prompts.crm.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['crm'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'follow_ups', when: ['tools'] },
    { id: 'pipeline', when: ['tools'] },
    { id: 'stale', when: ['tools'], vars: [{ name: 'days', kind: 'number', default: 30, min: 7, max: 365 }] },
    { id: 'email', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }, { name: 'goal', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'log_call', when: ['tools'], vars: [{ name: 'details', kind: 'text', long: true, hint: true }] },
    { id: 'won_lost', when: ['tools'] },
  ] };
})();
