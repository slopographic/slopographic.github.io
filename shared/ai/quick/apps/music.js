/* Slop AI quick prompts for Slop Music (the format: shared/ai/quick/engine.js). Words: prompts.music.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['music'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'playlist', when: ['tools'], vars: [{ name: 'mood', kind: 'text', hint: true }] },
    { id: 'tags', when: ['tools'] },
    { id: 'duplicates', when: ['tools'] },
    { id: 'shuffle', when: ['tools'], vars: [{ name: 'mood', kind: 'text', hint: true }] },
    { id: 'stats', when: ['tools'] },
    { id: 'sort', when: ['tools'] },
  ] };
})();
