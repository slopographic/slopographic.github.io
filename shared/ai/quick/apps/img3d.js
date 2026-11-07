/* Slop AI quick prompts for the picture-to-3D app (the format: shared/ai/quick/engine.js). Words: prompts.img3d.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['img3d'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'make', when: ['tools'] },
    { id: 'depth', when: ['tools'] },
    { id: 'relief', when: ['tools'] },
    { id: 'print3d', when: ['tools'] },
    { id: 'export', when: ['tools'], vars: [{ name: 'format', kind: 'choice', options: ['glb', 'stl', 'obj'] }] },
    { id: 'best' },
  ] };
})();
