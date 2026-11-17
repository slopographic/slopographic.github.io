/* Slop AI quick prompts for the font maker (the format: shared/ai/quick/engine.js). Words: prompts.fontcreator.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['fontcreator'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'handwriting' },
    { id: 'letters', when: ['tools'], vars: [{ name: 'style', kind: 'choice', options: ['rounded', 'geometric', 'handwritten', 'pixel'] }] },
    { id: 'digits', when: ['tools'] },
    { id: 'spacing', when: ['tools'] },
    { id: 'metrics', when: ['tools'] },
    { id: 'name', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'missing', when: ['tools'], vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
  ] };
})();
