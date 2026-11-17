/* Slop AI quick prompts for Paste (the format: shared/ai/quick/engine.js). Words: prompts.paste.* in shared/ai/i18n/<code>/office.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['paste'] = { skip: ['quiz'], prompts: [
    { id: 'explain', when: ['tools'] },
    { id: 'tidy', when: ['tools'] },
    { id: 'private_data', when: ['tools'] },
    { id: 'log_error', when: ['tools'] },
    { id: 'convert', when: ['tools'], vars: [{ name: 'format', kind: 'choice', options: ['json', 'csv', 'markdown', 'yaml', 'table'] }] },
    { id: 'title', when: ['tools'] },
  ] };
})();
