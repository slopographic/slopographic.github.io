/* Slop AI quick prompts for SlopClean (the format: shared/ai/quick/engine.js). Words: prompts.clean.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['clean'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'what_reveals', when: ['tools'] },
    { id: 'remove_all', when: ['tools'] },
    { id: 'keep_date', when: ['tools'] },
    { id: 'risky', when: ['tools'] },
    { id: 'explain' },
  ] };
})();
