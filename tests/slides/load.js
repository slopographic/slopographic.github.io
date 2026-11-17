/* Loads Slop Slides' scripts (from slides/js/manifest.js) and its English words (slides/i18n) into a test page, then the fonts. */
window.loadSlides = async function (groups) {
  const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); });
  await add('../../slides/js/manifest.js');
  // the app's words (slides/i18n): the scripts read them through SS.util.t
  if (!window.SlopI18n) { await add('../../shared/i18n/i18n.js'); await add('../../slides/i18n/index.js'); await window.SlopI18n.ready(); }
  const M = window.SS_MANIFEST;
  for (const g of groups || ['core', 'render', 'anim', 'io']) for (const p of M[g]) await add('../../' + p);
  await window.SS.fonts.load();
  return window.SS;
};
