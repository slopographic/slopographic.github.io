/* Slop AI quick prompts for Slop Paint Classic (the format: shared/ai/quick/engine.js). Words: prompts.paint_classic.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['paint-classic'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'idea', vars: [{ name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    { id: 'draw', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'colors', vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'how', vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'frame', when: ['tools'] },
  ] };
})();
