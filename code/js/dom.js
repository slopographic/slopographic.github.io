/* Slop Code: a tiny element builder (children may be nodes, strings, numbers, arrays, null or false), and the words. */
/** A word in the page's language (shared/i18n): read when the UI is drawn, never kept in a constant. */
export const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
/** Runs fn after a language change, once the new tables are in. */
export const onLang = (fn) => (window.SlopI18n && window.SlopI18n.on ? window.SlopI18n.on(fn) : null);
export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
}
