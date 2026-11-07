/* Slop AI quick prompts for Serial counter (the format: shared/ai/quick/engine.js). Words: prompts.serials.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['serials'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'summary', when: ['tools'] },
    { id: 'unsure', when: ['tools'] },
    { id: 'missing', when: ['tools'] },
    { id: 'add', when: ['tools'], vars: [{ name: 'numbers', kind: 'text', hint: true }] },
    { id: 'compare', when: ['tools'], vars: [{ name: 'numbers', kind: 'text', long: true, hint: true }] },
    { id: 'pattern', when: ['tools'] },
  ] };
})();
