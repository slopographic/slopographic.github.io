/* Slop AI quick prompts for Slop Calendar (the format: shared/ai/quick/engine.js). Words: prompts.calendar.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['calendar'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'week', when: ['tools'] },
    { id: 'free_time', when: ['tools'], vars: [{ name: 'minutes', kind: 'number', default: 60, min: 15, max: 480 }] },
    { id: 'add_event', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'conflicts', when: ['tools'] },
    { id: 'agenda', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'busy', when: ['tools'], vars: [{ name: 'period', kind: 'choice', options: 'period' }] },
  ] };
})();
