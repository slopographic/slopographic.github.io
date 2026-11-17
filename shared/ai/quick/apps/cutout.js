/* Slop AI quick prompts for the background remover (the format: shared/ai/quick/engine.js). Words: prompts.cutout.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['cutout'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'remove_all', when: ['tools'] },
    { id: 'on_color', when: ['tools'], vars: [{ name: 'color', kind: 'choice', options: ['white', 'grey', 'black'] }] },
    { id: 'products', when: ['tools'] },
    { id: 'check', when: ['tools'] },
    { id: 'tips' },
    { id: 'ideas', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 8, min: 1, max: 20 }] },
  ] };
})();
