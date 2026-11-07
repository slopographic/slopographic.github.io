/* Slop AI quick prompts for Slop Slides (the format: shared/ai/quick/engine.js). Words: prompts.slides.* in shared/ai/i18n/<code>/office.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['slides'] = { skip: ['quiz'], prompts: [
    { id: 'deck', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 8, min: 3, max: 30 }, { name: 'audience', kind: 'choice', options: 'audience' }] },
    { id: 'add_slide', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'speaker_notes', when: ['tools'] },
    { id: 'shorter_bullets', when: ['tools'] },
    { id: 'slide_titles', when: ['tools'] },
    { id: 'story', when: ['tools'] },
    { id: 'questions', when: ['tools'], vars: [{ name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    { id: 'design_check', when: ['tools'] },
  ] };
})();
