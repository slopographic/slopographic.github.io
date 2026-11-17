// Every change chaos mode makes to the page is recorded here, so "Restore page" can undo it all.
import { changed } from './state.js';

const J = [];
export const count = () => J.length;
export function record(undo) { J.push(undo); changed(); }
/** Undo everything, newest first. */
export function restoreAll() {
  while (J.length) {
    const undo = J.pop();
    try { undo(); } catch (e) { console.warn('Sloppo restore:', e); }
  }
  changed();
}
/** Remember an element's exact style attribute so it can be put back. */
export function keepStyle(el) {
  const had = el.hasAttribute('style'), v = el.getAttribute('style');
  record(() => (had ? el.setAttribute('style', v) : el.removeAttribute('style')));
}
