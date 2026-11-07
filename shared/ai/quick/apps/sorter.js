/* Slop AI quick prompts for the photo sorter (the format: shared/ai/quick/engine.js). Words: prompts.sorter.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['sorter'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'checklist' },
    { id: 'tag_set', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'status', when: ['tools'] },
    { id: 'export_liked', when: ['tools'] },
    { id: 'remove_disliked', when: ['tools'] },
    { id: 'story', vars: [{ name: 'topic', kind: 'text', hint: true }] },
  ] };
})();
