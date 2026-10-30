/* Slop AI quick prompts for the 3D editor (the format: shared/ai/quick/engine.js). Words: prompts.3d.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['3d'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'scene', when: ['tools'], vars: [{ name: 'topic', kind: 'text', hint: true }] },
    { id: 'object', when: ['tools'], vars: [{ name: 'what', kind: 'text', hint: true }] },
    { id: 'light', when: ['tools'], vars: [{ name: 'light', kind: 'choice', options: ['day', 'sunset', 'studio', 'night'] }] },
    { id: 'materials', when: ['tools'] },
    { id: 'camera', when: ['tools'] },
    { id: 'export', when: ['tools'], vars: [{ name: 'format', kind: 'choice', options: ['glb', 'stl', 'obj'] }] },
  ] };
})();
