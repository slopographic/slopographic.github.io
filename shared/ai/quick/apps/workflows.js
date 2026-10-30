/* Slop AI quick prompts for Slop Workflows (the format: shared/ai/quick/engine.js). Words: prompts.workflows.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['workflows'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'build', when: ['tools'], vars: [{ name: 'goal', kind: 'text', hint: true }] },
    { id: 'explain', when: ['tools'] },
    { id: 'improve', when: ['tools'] },
    { id: 'ideas', vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'run', when: ['tools'] },
    { id: 'fix', when: ['tools'] },
  ] };
})();
