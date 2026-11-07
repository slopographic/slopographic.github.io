/* Slop AI quick prompts every app gets (scope 'all'; the format is in quick/engine.js). Words: prompts.all.* in
 * shared/ai/i18n/<code>/base.js. An app leaves some out with skip (its quick/apps/<id>.js): a picture editor skips 'write'. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const L = (K.quickLists = K.quickLists || {});
  const sel = { name: 'selection', kind: 'context' };
  L.all = { prompts: [
    // understand
    { id: 'summarize', group: 'understand', when: ['tools'], vars: [{ name: 'length', kind: 'choice', options: 'length' }] },
    { id: 'summarize_selection', group: 'understand', when: ['selection'], vars: [sel, { name: 'length', kind: 'choice', options: 'length' }] },
    { id: 'key_points', group: 'understand', when: ['selection'], vars: [sel] },
    { id: 'explain', group: 'understand', when: ['selection'], vars: [sel, { name: 'audience', kind: 'choice', options: 'audience' }] },
    { id: 'quiz', group: 'understand', when: ['selection'], vars: [sel, { name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    // write
    { id: 'proofread', group: 'write', when: ['selection'], vars: [sel] },
    { id: 'tone', group: 'write', when: ['selection'], vars: [sel, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'shorten', group: 'write', when: ['selection'], vars: [sel] },
    { id: 'expand', group: 'write', when: ['selection'], vars: [sel] },
    { id: 'simplify', group: 'write', when: ['selection'], vars: [sel] },
    { id: 'bullets', group: 'write', when: ['selection'], vars: [sel] },
    { id: 'titles', group: 'write', when: ['selection'], vars: [sel, { name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    // translate
    { id: 'translate', group: 'translate', when: ['selection'], vars: [sel, { name: 'language', kind: 'choice', options: 'language' }] },
    { id: 'which_language', group: 'translate', when: ['selection'], vars: [sel] },
    // ideas
    { id: 'brainstorm', group: 'ideas', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 10, min: 1, max: 30 }] },
    { id: 'draft', group: 'ideas', vars: [{ name: 'what', kind: 'text', hint: true }, { name: 'tone', kind: 'choice', options: 'tone' }, { name: 'length', kind: 'choice', options: 'length' }] },
    // help
    { id: 'how_to', group: 'help', vars: [{ name: 'task', kind: 'text', hint: true }] },
    { id: 'what_can', group: 'help' },
    { id: 'next_steps', group: 'help', when: ['tools'] },
  ] };
})();
