/* Slop AI quick prompts for Slop Drive (the format: shared/ai/quick/engine.js). Words: prompts.drive.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['drive'] = { skip: ['write', 'translate', 'understand'], prompts: [
    { id: 'find', when: ['tools'], vars: [{ name: 'query', kind: 'text', hint: true }] },
    { id: 'recent', when: ['tools'], vars: [{ name: 'days', kind: 'number', default: 7, min: 1, max: 365 }] },
    { id: 'largest', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 10, min: 1, max: 50 }] },
    { id: 'duplicates', when: ['tools'] },
    { id: 'folders', when: ['tools'] },
    { id: 'rename', when: ['tools'] },
    { id: 'read_file', when: ['tools'], vars: [{ name: 'file', kind: 'text', hint: true }] },
  ] };
})();
