/* Slop AI quick prompts for Slop Tables (the format: shared/ai/quick/engine.js). Words: prompts.tables.* in
 * shared/ai/i18n/<code>/office.js. Context from the app (tables/js/ui/ai-commands.js context()): document, sheet, range,
 * selection (the selected cells as tab-separated text). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L.tables = { skip: ['expand', 'quiz', 'titles'], prompts: [
    { id: 'formula', vars: [{ name: 'goal', kind: 'text', hint: true }] },
    { id: 'explain_formula', when: ['tools'] },
    { id: 'insights', when: ['tools'] },
    { id: 'chart', when: ['tools'], vars: [{ name: 'chart', kind: 'choice', options: ['bar', 'line', 'pie', 'scatter'] }] },
    { id: 'clean', when: ['tools'] },
    { id: 'group_by', when: ['tools'], vars: [{ name: 'column', kind: 'text', hint: true }] },
    { id: 'new_column', when: ['tools'], vars: [{ name: 'goal', kind: 'text', hint: true }] },
    { id: 'sample', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 20, min: 3, max: 200 }] },
    { id: 'describe_range', when: ['selection'], vars: [{ name: 'range', kind: 'context' }, { name: 'selection', kind: 'context' }] },
  ] };
})();
