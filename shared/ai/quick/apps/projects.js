/* Slop AI quick prompts for Slop Projects (the format: shared/ai/quick/engine.js). Words: prompts.projects.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['projects'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'plan', when: ['tools'], vars: [{ name: 'goal', kind: 'text', hint: true }, { name: 'weeks', kind: 'number', default: 8, min: 1, max: 104 }] },
    { id: 'status', when: ['tools'] },
    { id: 'late', when: ['tools'] },
    { id: 'risks', when: ['tools'] },
    { id: 'add_tasks', when: ['tools'], vars: [{ name: 'details', kind: 'text', long: true, hint: true }] },
    { id: 'next_week', when: ['tools'] },
    { id: 'retro', when: ['tools'] },
  ] };
})();
