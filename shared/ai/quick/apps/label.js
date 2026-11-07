/* Slop AI quick prompts for the label designer (the format: shared/ai/quick/engine.js). Words: prompts.label.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['label'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'product', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'shipping', when: ['tools'] },
    { id: 'price', when: ['tools'], vars: [{ name: 'details', kind: 'text', hint: true }] },
    { id: 'qr', when: ['tools'], vars: [{ name: 'link', kind: 'text', hint: true }] },
    { id: 'merge', when: ['tools'] },
    { id: 'asset', when: ['tools'] },
    { id: 'check', when: ['tools'] },
  ] };
})();
