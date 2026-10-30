/* Slopnodes and SlopCmd: the command palette for this page, and the assistant's commands with arguments
 * (ai-commands.js), loaded when the AI panel first asks (SlopCmd.prepare). Classic script, after app.js. */
(function () {
  'use strict';
  const C = window.SlopCmd;
  if (!C || !C.init) return;
  C.init({ app: 'nodes' });
  if (C.provide) C.provide({ prepare: () => (window.SlopNodesAI ? null : new Promise((res, rej) => {
    const el = Object.assign(document.createElement('script'), { src: new URL('js/ai-commands.js', location.href).href });
    el.onload = res; el.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(el);
  })) });
})();
