/* Slop AI quick prompts for Slop Compare (the format: shared/ai/quick/engine.js). Words: prompts.diff.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['diff'] = { skip: ['quiz'], prompts: [
    { id: 'explain', when: ['tools'] },
    { id: 'what_matters', when: ['tools'] },
    { id: 'changelog', when: ['tools'] },
    { id: 'terms', when: ['tools'] },
    { id: 'message', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'code_review', when: ['tools'] },
  ] };
})();
