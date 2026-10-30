/* Slop AI quick prompts for Slop Time (the format: shared/ai/quick/engine.js). Words: prompts.time.* in shared/ai/i18n/<code>/biz*.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['time'] = { skip: ['quiz', 'titles', 'expand', 'understand', 'write', 'translate'], prompts: [
    { id: 'meeting', vars: [{ name: 'cities', kind: 'text', hint: true }] },
    { id: 'time_in', vars: [{ name: 'city', kind: 'text', hint: true }] },
    { id: 'convert', when: ['tools'], vars: [{ name: 'when', kind: 'text', hint: true }] },
    { id: 'add_cities', when: ['tools'], vars: [{ name: 'cities', kind: 'text', hint: true }] },
    { id: 'dst', when: ['tools'] },
    { id: 'overlap', when: ['tools'] },
  ] };
})();
