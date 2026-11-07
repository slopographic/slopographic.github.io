/* Slop AI quick prompts for Slop Code (the format: shared/ai/quick/engine.js). Words: prompts.code.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['code'] = { skip: ['quiz', 'titles', 'tone', 'expand', 'simplify'], prompts: [
    { id: 'explain', when: ['tools'] },
    { id: 'review', when: ['tools'] },
    { id: 'comments', when: ['tools'] },
    { id: 'tests', when: ['tools'], vars: [{ name: 'framework', kind: 'text', hint: true }] },
    { id: 'readme', when: ['tools'] },
    { id: 'fix', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }] },
    { id: 'port', when: ['selection'], vars: [{ name: 'selection', kind: 'context' }, { name: 'target', kind: 'choice', options: ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'csharp', 'php'] }] },
    { id: 'regex', vars: [{ name: 'goal', kind: 'text', hint: true }] },
  ] };
})();
