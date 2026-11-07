/* Slop AI quick prompts for the picture editor (the format: shared/ai/quick/engine.js). Words: prompts.photoslop.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['photoslop'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'enhance', when: ['tools'] },
    { id: 'look', when: ['tools'], vars: [{ name: 'style', kind: 'choice', options: ['vintage', 'bw', 'warm', 'cool', 'cinematic', 'faded'] }] },
    { id: 'remove_bg', when: ['tools'] },
    { id: 'portrait', when: ['tools'] },
    { id: 'straighten', when: ['tools'] },
    { id: 'resize_for', when: ['tools'], vars: [{ name: 'target', kind: 'choice', options: ['instagram', 'story', 'banner', 'print_a4', 'thumbnail'] }] },
    { id: 'poster', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'caption', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'critique', when: ['tools'] },
  ] };
})();
