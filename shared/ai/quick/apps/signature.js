/* Slop AI quick prompts for the email signature maker (the format: shared/ai/quick/engine.js). Words: prompts.signature.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['signature'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'make', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }, { name: 'role', kind: 'text', hint: true }] },
    { id: 'restyle', when: ['tools'], vars: [{ name: 'style', kind: 'choice', options: ['minimal', 'corporate', 'creative', 'friendly'] }] },
    { id: 'logo', when: ['tools'] },
    { id: 'check', when: ['tools'] },
    { id: 'taglines', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 5, min: 1, max: 15 }] },
    { id: 'disclaimer', vars: [{ name: 'language', kind: 'choice', options: 'language' }] },
    { id: 'install', vars: [{ name: 'client', kind: 'choice', options: ['gmail', 'outlook', 'apple'] }] },
  ] };
})();
