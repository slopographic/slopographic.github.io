/* Slop AI quick prompts for the photo library (the format: shared/ai/quick/engine.js). Words: prompts.gallery.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['gallery'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'album', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'by_month', when: ['tools'] },
    { id: 'tags', when: ['tools'] },
    { id: 'duplicates', when: ['tools'] },
    { id: 'captions', vars: [{ name: 'topic', kind: 'text', hint: true }, { name: 'n', kind: 'number', default: 5, min: 1, max: 20 }] },
    { id: 'backup' },
  ] };
})();
