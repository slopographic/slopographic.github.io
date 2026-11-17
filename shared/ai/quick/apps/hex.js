/* Slop AI quick prompts for Slop Hex (the format: shared/ai/quick/engine.js). Words: prompts.hex.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['hex'] = { skip: ['write', 'translate'], prompts: [
    { id: 'identify', when: ['tools'] },
    { id: 'header', when: ['tools'] },
    { id: 'strings', when: ['tools'] },
    { id: 'find', when: ['tools'], vars: [{ name: 'pattern', kind: 'text', hint: true }] },
    { id: 'decode', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }] },
    { id: 'damaged', when: ['tools'] },
  ] };
})();
