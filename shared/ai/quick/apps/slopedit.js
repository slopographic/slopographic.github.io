/* Slop AI quick prompts for SlopCut (the format: shared/ai/quick/engine.js). Words: prompts.slopedit.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['slopedit'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'captions', when: ['tools'], vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
    { id: 'silences', when: ['tools'], vars: [{ name: 'seconds', kind: 'number', default: 1, min: 0.3, max: 10 }] },
    { id: 'reel', when: ['tools'], vars: [{ name: 'seconds', kind: 'number', default: 30, min: 5, max: 180 }] },
    { id: 'title', when: ['tools'], vars: [{ name: 'wording', kind: 'text', hint: true }, { name: 'seconds', kind: 'number', default: 3, min: 1, max: 20 }] },
    { id: 'music', when: ['tools'] },
    { id: 'chapters', when: ['tools'] },
    { id: 'describe', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'reframe', when: ['tools'], vars: [{ name: 'format', kind: 'choice', options: ['vertical', 'square', 'wide'] }] },
  ] };
})();
