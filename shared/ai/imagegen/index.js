/* SlopAIKit imageGen: making pictures with the person's own AI key, for every AI panel and for apps (PhotoSlop's
 * "Generate image…"). One tag, or K.load(['imagegen/index']) from the AI panel:
 *     <script src="(../)shared/ai/imagegen/index.js"></script>      then   await SlopAIKit.imageGenReady
 * It loads what it needs once, in order, from shared/ai/ (the key store and meter of shared/ai/cloud/, then this
 * folder) and asks which providers have a key here (imageGen.connected), so the tool list knows what to offer.
 * Each file is marked like K.load marks its scripts (data-slopai), so the panel never loads one twice. See HANDOFF.md. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  if (K.imageGenReady) return;
  const me = document.currentScript && document.currentScript.src;
  const base = K.base || (me ? new URL('../', me).href : new URL('../shared/ai/', location.href).href);
  const CATALOG = ['main', 'open', 'cloud', 'more', 'local', 'images'].map((g) => 'cloud/catalog/' + g);   // the providers, as data (before providers.js)
  const FILES = ['makers', 'cloud/net', ...CATALOG, 'cloud/providers', 'cloud/keys', 'cloud/meter', 'imagegen/core', 'imagegen/openai', 'imagegen/gemini', 'imagegen/openrouter',
    'imagegen/pixels', 'imagegen/run', 'imagegen/tools', 'imagegen/dialog'];
  const C = () => K.cloud || {};
  /** What each file defines: a file already loaded by K.load (the panel's picker) is not loaded again. */
  const HAS = { makers: () => !!K.makers, 'cloud/net': () => C().call, 'cloud/providers': () => C().byId, 'cloud/keys': () => C().keys, 'cloud/meter': () => C().meter };
  // A catalog file K.load already ran (its tag is there and providers.js, loaded after it in order, is in) is not loaded again.
  for (const n of CATALOG) HAS[n] = () => !!C().byId && !!document.querySelector(`script[data-slopai="${n}"]`);
  const one = (n) => new Promise((res, rej) => {
    if (HAS[n] && HAS[n]()) return res();
    const fail = () => rej(new Error('Could not load shared/ai/' + n + '.js'));
    const old = document.querySelector(`script[data-slopai="${n}"]`);
    if (old) { if (old.dataset.loaded) return res(); old.addEventListener('load', () => res()); old.addEventListener('error', fail); return; }   // still loading
    const s = document.createElement('script'); s.src = base + n + '.js'; s.dataset.slopai = n; s.async = false;
    s.onload = () => { s.dataset.loaded = '1'; res(); }; s.onerror = fail;
    document.head.append(s);
  });
  // all requested at once; async = false runs them in this order (as SlopAIKit.load does)
  K.imageGenReady = Promise.all(FILES.map(one))
    .then(() => K.imageGen.choose().catch(() => null))
    .then(() => K.imageGen);
  K.imageGenReady.catch((e) => console.warn('Slop AI pictures:', e && e.message));
})();
