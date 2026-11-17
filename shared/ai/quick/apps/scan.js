/* Slop AI quick prompts for Slop Scan (the format: shared/ai/quick/engine.js). Words: prompts.scan.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['scan'] = { skip: ['write', 'translate'], prompts: [
    { id: 'plain', when: ['tools'] },
    { id: 'a4', when: ['tools'] },
    { id: 'order', when: ['tools'] },
    { id: 'searchable', when: ['tools'] },
    { id: 'receipts', when: ['tools'] },
  ] };
})();
