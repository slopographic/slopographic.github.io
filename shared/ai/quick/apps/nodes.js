/* Slop AI quick prompts for Slopnodes (the format: shared/ai/quick/engine.js). Words: prompts.nodes.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['nodes'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'build', when: ['tools'], vars: [{ name: 'goal', kind: 'text', hint: true }] },
    { id: 'explain', when: ['tools'] },
    { id: 'check', when: ['tools'] },
    { id: 'what_if', when: ['tools'], vars: [{ name: 'change', kind: 'text', hint: true }] },
    { id: 'tidy', when: ['tools'] },
    { id: 'add', when: ['tools'], vars: [{ name: 'goal', kind: 'text', hint: true }] },
  ] };
})();
