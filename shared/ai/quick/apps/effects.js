/* Slop AI quick prompts for the motion design app (the format: shared/ai/quick/engine.js). Words: prompts.effects.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['effects'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'title', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'intro', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'lower_third', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }, { name: 'role', kind: 'text', hint: true }] },
    { id: 'loop', when: ['tools'] },
    { id: 'social', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'format', kind: 'choice', options: ['square', 'vertical', 'wide'] }] },
    { id: 'smooth', when: ['tools'] },
    { id: 'explain' },
  ] };
})();
