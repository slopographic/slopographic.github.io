/* DOM helpers for Paste. SlopUI.el builds the nodes (text is escaped; on* props become listeners). */
export const $ = (id) => document.getElementById(id);
export const el = (tag, attrs, ...kids) => window.SlopUI.el(tag, attrs, ...kids);
/** The words in the current language (paste/i18n, shared/i18n); onLang(fn) runs fn after a language change. */
export const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
export const onLang = (fn) => { if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(fn); };
/** Empties a node and returns it. */
export const clear = (node) => { node.replaceChildren(); return node; };
export const dateText = (ms) => {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
