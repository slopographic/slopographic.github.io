/* Slop AI quick prompts for Slop Notes (the format: shared/ai/quick/engine.js). Words: prompts.notes.* in shared/ai/i18n/<code>/office.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['notes'] = { skip: [], prompts: [
    { id: 'todos', when: ['tools'] },
    { id: 'tidy', when: ['tools'] },
    { id: 'new_note', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'flashcards', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 10, min: 1, max: 40 }] },
    { id: 'tags', when: ['tools'] },
    { id: 'notebook_summary', when: ['tools'] },
    { id: 'meeting', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }] },
    { id: 'outline', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }] },
  ] };
})();
