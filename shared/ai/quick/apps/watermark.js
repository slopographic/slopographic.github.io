/* Slop AI quick prompts for the watermarker (the format: shared/ai/quick/engine.js). Words: prompts.watermark.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['watermark'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'text', when: ['tools'], vars: [{ name: 'wording', kind: 'text', hint: true }] },
    { id: 'proof', when: ['tools'] },
    { id: 'logo', when: ['tools'] },
    { id: 'position', when: ['tools'], vars: [{ name: 'corner', kind: 'choice', options: ['br', 'bl', 'tr', 'tl', 'center', 'tile'] }] },
    { id: 'confidential', when: ['tools'] },
    { id: 'advice' },
  ] };
})();
