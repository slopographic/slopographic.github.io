/* Slop AI quick prompts for Checksum (the format: shared/ai/quick/engine.js). Words: prompts.checksum.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['checksum'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'verify', when: ['tools'], vars: [{ name: 'hash', kind: 'text', hint: true }] },
    { id: 'explain' },
    { id: 'which', vars: [{ name: 'goal', kind: 'text', hint: true }] },
    { id: 'list', when: ['tools'] },
    { id: 'mismatch' },
  ] };
})();
