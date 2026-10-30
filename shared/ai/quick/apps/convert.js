/* Slop AI quick prompts for File convert (the format: shared/ai/quick/engine.js). Words: prompts.convert.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['convert'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'which_format', vars: [{ name: 'goal', kind: 'text', hint: true }] },
    { id: 'to_pdf', when: ['tools'] },
    { id: 'web_images', when: ['tools'] },
    { id: 'data', when: ['tools'], vars: [{ name: 'format', kind: 'choice', options: ['csv', 'xlsx', 'json'] }] },
    { id: 'check', when: ['tools'] },
    { id: 'batch', when: ['tools'], vars: [{ name: 'format', kind: 'choice', options: ['csv', 'xlsx', 'json'] }] },
  ] };
})();
