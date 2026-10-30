/* Slop AI quick prompts for Slop Press (the format: shared/ai/quick/engine.js). Words: prompts.press.* in shared/ai/i18n/<code>/office.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['press'] = { skip: ['quiz', 'which_language'], prompts: [
    { id: 'flyer', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'poster', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'newsletter', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 2, min: 1, max: 12 }] },
    { id: 'headlines', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    { id: 'body_copy', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'words', kind: 'number', default: 150, min: 20, max: 1000 }, { name: 'tone', kind: 'choice', options: 'tone' }] },
    { id: 'fit_text', when: ['tools'] },
    { id: 'preflight', when: ['tools'] },
  ] };
})();
