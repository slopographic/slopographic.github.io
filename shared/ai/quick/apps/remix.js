/* Slop AI quick prompts for Reel Remix (the format: shared/ai/quick/engine.js). Words: prompts.remix.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['remix'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'new_mix', when: ['tools'], vars: [{ name: 'seconds', kind: 'number', default: 30, min: 5, max: 300 }] },
    { id: 'mood', when: ['tools'], vars: [{ name: 'mood', kind: 'choice', options: ['calm', 'energetic', 'dreamy', 'funny'] }] },
    { id: 'beat', when: ['tools'] },
    { id: 'best', when: ['tools'] },
    { id: 'caption', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'to_editor', when: ['tools'] },
  ] };
})();
