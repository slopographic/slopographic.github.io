/* Slop AI quick prompts for Slop Contacts (the format: shared/ai/quick/engine.js). Words: prompts.contacts.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['contacts'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'duplicates', when: ['tools'] },
    { id: 'missing', when: ['tools'] },
    { id: 'from_text', when: ['tools'], vars: [{ name: 'details', kind: 'text', long: true, hint: true }] },
    { id: 'tidy', when: ['tools'] },
    { id: 'find', when: ['tools'], vars: [{ name: 'query', kind: 'text', hint: true }] },
    { id: 'welcome', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'by_company', when: ['tools'] },
  ] };
})();
