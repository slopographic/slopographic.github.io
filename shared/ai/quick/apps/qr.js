/* Slop AI quick prompts for the QR code maker (the format: shared/ai/quick/engine.js). Words: prompts.qr.* in
 * shared/ai/i18n/<code>/creative.js and creative2.js. No text selection here: the shared writing prompts are left out. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {}), L = (K.quickLists = K.quickLists || {});
  L['qr'] = { skip: ['understand', 'write', 'translate'], prompts: [
    { id: 'link', when: ['tools'], vars: [{ name: 'link', kind: 'text', hint: true }] },
    { id: 'wifi', when: ['tools'], vars: [{ name: 'network', kind: 'text', hint: true }] },
    { id: 'contact', when: ['tools'], vars: [{ name: 'name', kind: 'text', hint: true }] },
    { id: 'menu', when: ['tools'], vars: [{ name: 'link', kind: 'text', hint: true }] },
    { id: 'style', when: ['tools'] },
    { id: 'tips' },
  ] };
})();
