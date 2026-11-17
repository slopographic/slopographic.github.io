/* Slop AI quick prompts for Slop Reminders (the format: shared/ai/quick/engine.js). Words: prompts.reminders.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['reminders'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'next', when: ['tools'] },
    { id: 'add', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'missed', when: ['tools'] },
    { id: 'today', when: ['tools'] },
    { id: 'tidy', when: ['tools'] },
  ] };
})();
