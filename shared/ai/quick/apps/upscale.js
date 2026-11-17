/* Slop AI quick prompts for the upscaler (the format: shared/ai/quick/engine.js). Words: prompts.upscale.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['upscale'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'upscale', when: ['tools'], vars: [{ name: 'factor', kind: 'choice', options: ['x2', 'x4'] }] },
    { id: 'print', when: ['tools'], vars: [{ name: 'paper', kind: 'choice', options: ['a4', 'a3', 'poster'] }] },
    { id: 'old_photo', when: ['tools'] },
    { id: 'web', when: ['tools'] },
    { id: 'video', when: ['tools'] },
    { id: 'explain' },
  ] };
})();
