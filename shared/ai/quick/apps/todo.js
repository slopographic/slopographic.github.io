/* Slop AI quick prompts for Slop To-do (the format: shared/ai/quick/engine.js). Words: prompts.todo.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['todo'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'today', when: ['tools'] },
    { id: 'break_down', when: ['tools'], vars: [{ name: 'task', kind: 'text', hint: true }] },
    { id: 'prioritize', when: ['tools'] },
    { id: 'overdue', when: ['tools'] },
    { id: 'add_many', when: ['tools'], vars: [{ name: 'details', kind: 'text', long: true, hint: true }] },
    { id: 'review', when: ['tools'] },
  ] };
})();
