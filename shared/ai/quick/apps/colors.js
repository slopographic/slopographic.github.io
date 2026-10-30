/* Slop AI quick prompts for the colour tool (the format: shared/ai/quick/engine.js). Words: prompts.colors.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['colors'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'mood', when: ['tools'], vars: [{ name: 'mood', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 5, min: 2, max: 12 }] },
    { id: 'brand', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'contrast', when: ['tools'] },
    { id: 'from_picture', when: ['tools'] },
    { id: 'css', when: ['tools'] },
    { id: 'dark', when: ['tools'] },
    { id: 'harmony' },
  ] };
})();
