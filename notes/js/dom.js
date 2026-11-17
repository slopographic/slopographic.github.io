/* DOM helpers for Slop Notes. SlopUI.el builds the nodes (text is escaped; on* props become listeners). */
export const $ = (id) => document.getElementById(id);
/** A word in the page's language (shared/i18n): read when the UI is drawn, never kept in a constant. */
export const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
/** Runs fn after a language change, once the new tables are in. */
export const onLang = (fn) => (window.SlopI18n && window.SlopI18n.on ? window.SlopI18n.on(fn) : null);
export const el = (tag, attrs, ...kids) => window.SlopUI.el(tag, attrs, ...kids);
/** Empties a node and returns it. */
export const clear = (node) => { node.replaceChildren(); return node; };
export const dateText = (ms) => {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
