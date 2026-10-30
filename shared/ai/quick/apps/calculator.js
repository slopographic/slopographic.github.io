/* Slop AI quick prompts for Slopculator (the format: shared/ai/quick/engine.js). Words: prompts.calculator.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['calculator'] = { skip: ['quiz', 'titles', 'expand', 'understand', 'write', 'translate'], prompts: [
    { id: 'check', when: ['tools'] },
    { id: 'explain', when: ['tools'] },
    { id: 'percent', vars: [{ name: 'problem', kind: 'text', hint: true }] },
    { id: 'loan', vars: [{ name: 'amount', kind: 'number', default: 200000, min: 1, max: 100000000 }, { name: 'rate', kind: 'number', default: 5, min: 0, max: 50 }, { name: 'years', kind: 'number', default: 10, min: 1, max: 50 }] },
    { id: 'dates', vars: [{ name: 'from', kind: 'text', hint: true }, { name: 'to', kind: 'text', hint: true }] },
    { id: 'units', vars: [{ name: 'problem', kind: 'text', hint: true }] },
  ] };
})();
