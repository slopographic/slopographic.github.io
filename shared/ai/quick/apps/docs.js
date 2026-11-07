/* Slop AI quick prompts for Slop Docs (the format: shared/ai/quick/engine.js). Words: prompts.docs.* in shared/ai/i18n/<code>/office.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['docs'] = { skip: [], prompts: [
    { id: 'outline', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'continue', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 2, min: 1, max: 10 }] },
    { id: 'headings', when: ['tools', 'document'] },
    { id: 'summary_top', when: ['tools', 'document'] },
    { id: 'check_all', when: ['tools', 'document'] },
    { id: 'letter', when: ['tools'], vars: [{ name: 'recipient', kind: 'text', hint: true }, { name: 'topic', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'meeting_notes', when: ['tools'] },
    { id: 'improve', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }] },
    { id: 'to_table', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }] },
  ] };
})();
