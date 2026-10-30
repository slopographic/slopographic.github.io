/* Slop AI quick prompts for Slop EML (the format: shared/ai/quick/engine.js). Words: prompts.eml.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['eml'] = { skip: ['quiz'], prompts: [
    { id: 'summary', when: ['tools'] },
    { id: 'reply', when: ['tools'], vars: [{ name: 'tone', kind: 'choice', options: 'tone' }, { name: 'points', kind: 'text', hint: true, long: true }] },
    { id: 'todo', when: ['tools'] },
    { id: 'safe', when: ['tools'] },
    { id: 'attachments', when: ['tools'] },
    { id: 'translate_mail', when: ['tools'], vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
  ] };
})();
