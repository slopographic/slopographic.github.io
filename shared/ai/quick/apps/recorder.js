/* Slop AI quick prompts for Slop Recorder (the format: shared/ai/quick/engine.js). Words: prompts.recorder.* in shared/ai/i18n/<code>/media*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['recorder'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'script', vars: [{ name: 'task', kind: 'text', hint: true }] },
    { id: 'settings', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'trim', when: ['tools'] },
    { id: 'checklist' },
    { id: 'title', when: ['tools'] },
    { id: 'transcribe', when: ['tools'] },
  ] };
})();
