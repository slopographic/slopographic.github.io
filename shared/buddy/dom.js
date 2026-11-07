// Page surgery helpers for chaos mode. Every change is recorded in the journal so it can be undone.
import { record, keepStyle } from './journal.js';

const holes = new WeakMap();   // element -> mask layers
const geo = new WeakMap();     // element -> [{ x, y, r }] hole circles, for physics
const wrapped = new WeakMap(); // heading -> letter spans
export const eaten = new WeakSet();

/** Cut round holes out of an element with CSS masks. holes: [{ x, y, r }] in the element's own px. */
export function punch(el, list) {
  const mine = holes.get(el) || [];
  const layers = list.map(({ x, y, r }) => `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, transparent ${r.toFixed(1)}px, #000 ${(r + 0.8).toFixed(1)}px)`);
  keepStyle(el);
  const circles = geo.get(el) || [];
  mine.push(...layers);
  circles.push(...list.map(({ x, y, r }) => ({ x, y, r })));
  holes.set(el, mine);
  geo.set(el, circles);
  record(() => { mine.length -= layers.length; circles.length -= list.length; });
  el.style.setProperty('mask-image', mine.join(', '));
  el.style.setProperty('-webkit-mask-image', mine.join(', '));
  el.style.setProperty('mask-composite', mine.map(() => 'intersect').join(', '));
}
export const holeCount = (el) => (holes.get(el) || []).length;
export const holesOf = (el) => geo.get(el) || [];
export const isEaten = (span) => eaten.has(span);

/** Wrap each letter of an element in a span (once), recording how to unwrap it. */
export function letters(el) {
  if (wrapped.has(el)) return wrapped.get(el);
  const texts = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) texts.push(walk.currentNode);
  const spans = [], swaps = [];
  for (const tn of texts) {
    const nodes = [];
    for (const part of tn.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { nodes.push(document.createTextNode(part)); continue; }
      for (const c of Array.from(part)) {
        const s = document.createElement('span');
        s.className = 'sloppo-ch';
        s.textContent = c;
        nodes.push(s);
        spans.push(s);
      }
    }
    if (!nodes.length) continue;
    tn.replaceWith(...nodes);
    swaps.push([tn, nodes]);
  }
  wrapped.set(el, spans);
  record(() => {
    for (const [tn, nodes] of swaps.reverse()) { nodes[0].before(tn); nodes.forEach((n) => n.remove()); }
    wrapped.delete(el);
  });
  return spans;
}
export const uneaten = (el) => (wrapped.has(el) ? wrapped.get(el).filter((s) => !eaten.has(s)) : null);

/** A copy of a letter span, absolutely placed over it in the mascot layer. Hides the original. */
export function lift(span, layer) {
  const r = span.getBoundingClientRect(), cs = getComputedStyle(span);
  const fl = document.createElement('span');
  fl.className = 'sloppo-letter';
  fl.setAttribute('aria-hidden', 'true');
  fl.textContent = span.textContent;
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'letterSpacing', 'color']) fl.style[k] = cs[k];
  Object.assign(fl.style, { left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', lineHeight: r.height + 'px' });
  span.style.visibility = 'hidden';
  eaten.add(span);
  layer.append(fl);
  return { fl, cx: r.left + scrollX + r.width / 2, cy: r.top + scrollY + r.height / 2 };
}

/** An overlay in the mascot layer that Restore page removes. */
export function overlay(layer, cls, x, y, html) {
  const n = document.createElement('div');
  n.className = cls;
  n.setAttribute('aria-hidden', 'true');
  Object.assign(n.style, { left: x + 'px', top: y + 'px' });
  if (html) n.innerHTML = html;
  layer.append(n);
  record(() => n.remove());
  return n;
}
