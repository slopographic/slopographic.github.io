/* Slop AI quick prompts for the resizer (the format: shared/ai/quick/engine.js). Words: prompts.resize.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['resize'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'social', when: ['tools'], vars: [{ name: 'target', kind: 'choice', options: ['instagram', 'story', 'facebook', 'linkedin', 'youtube'] }] },
    { id: 'limit', when: ['tools'], vars: [{ name: 'kb', kind: 'number', default: 500, min: 20, max: 20000 }] },
    { id: 'email', when: ['tools'] },
    { id: 'website', when: ['tools'] },
    { id: 'percent', when: ['tools'], vars: [{ name: 'percent', kind: 'number', default: 50, min: 1, max: 400 }] },
    { id: 'which', vars: [{ name: 'topic', kind: 'text', hint: true }] },
  ] };
})();
