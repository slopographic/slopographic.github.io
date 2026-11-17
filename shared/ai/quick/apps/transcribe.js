/* Slop AI quick prompts for Slop Transcribe (the format: shared/ai/quick/engine.js). Words: prompts.transcribe.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['transcribe'] = { skip: [], prompts: [
    { id: 'summary', when: ['tools'], vars: [{ name: 'length', kind: 'choice', options: 'length' }] },
    { id: 'minutes', when: ['tools'] },
    { id: 'chapters', when: ['tools'] },
    { id: 'clean', when: ['tools'] },
    { id: 'quotes', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    { id: 'translate_all', when: ['tools'], vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
    { id: 'article', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
  ] };
})();
