/* Slop AI quick prompts for the vector editor (the format: shared/ai/quick/engine.js). Words: prompts.vector.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['vector'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'logo', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }, { name: 'style', kind: 'choice', options: ['minimal', 'geometric', 'playful', 'vintage'] }] },
    { id: 'icon', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'tidy', when: ['tools'] },
    { id: 'recolor', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 4, min: 2, max: 8 }] },
    { id: 'pattern', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'diagram', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'badge', when: ['tools'], vars: [{ name: 'wording', kind: 'text', hint: true }] },
    { id: 'formats' },
  ] };
})();
