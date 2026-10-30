/* Slop AI quick prompts for Slop AI Tools (the format: shared/ai/quick/engine.js). Words: prompts.aitools.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['aitools'] = { skip: ['write'], prompts: [
    { id: 'pick_tool', vars: [{ name: 'task', kind: 'text', hint: true }] },
    { id: 'ocr', when: ['tools'] },
    { id: 'speech', when: ['tools'], vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
    { id: 'denoise', when: ['tools'] },
    { id: 'tags', when: ['tools'] },
    { id: 'portrait', when: ['tools'] },
  ] };
})();
