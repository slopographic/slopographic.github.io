/* Slop AI quick prompts for Slop Admin (the format: shared/ai/quick/engine.js). Words: prompts.admin.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['admin'] = { skip: ['quiz', 'titles', 'expand'], prompts: [
    { id: 'profile', when: ['tools'] },
    { id: 'numbering', when: ['tools'] },
    { id: 'backup', when: ['tools'] },
    { id: 'about', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'terms' },
    { id: 'setup', when: ['tools'] },
  ] };
})();
