/* Slop AI quick prompts for Slop Sheets (the format: shared/ai/quick/engine.js). Words: prompts.sheetview.* in shared/ai/i18n/<code>/office2.js. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['sheetview'] = { skip: ['quiz', 'expand', 'titles'], prompts: [
    { id: 'describe', when: ['tools'] },
    { id: 'column_stats', when: ['tools'], vars: [{ name: 'column', kind: 'text', hint: true }] },
    { id: 'find_rows', when: ['tools'], vars: [{ name: 'condition', kind: 'text', hint: true }] },
    { id: 'check_data', when: ['tools'] },
    { id: 'chart_idea', when: ['tools'] },
    { id: 'formulas', when: ['tools'] },
  ] };
})();
