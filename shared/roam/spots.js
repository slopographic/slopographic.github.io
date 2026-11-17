// Where a page mascot may be (DOM): what counts as a control (never covered: the buddy's avoid.js lets clicks through it
// and moves aside; the slot's roaming never rests on one), what counts as content (the roaming mascot stays in the open
// beside it), the areas a page marks off with [data-mascot-avoid], and the spots beside the edges of the page's content
// where a roaming mascot may rest. Coordinates are the viewport's; a box is { l, t, r, b }.
// Tests: tests/buddy/roam.test.html (the slot roaming among them), the buddy's pages (avoid.js).
import { within, overlaps } from './path.js';

/** Controls, and regions full of them (a press there must reach the page). */
export const CONTROLS = 'a[href], button, input, select, textarea, label, summary, [role=button], [role=link], [role=tab], '
  + '[role=menuitem], [role=checkbox], [role=switch], [role=option], [contenteditable="true"], '
  + '[tabindex]:not([tabindex="-1"]), nav, header, footer, form, [role=toolbar], [role=menubar], .buddy-toggle, .sloppo-hud, '
  + '[data-controls]';   // a region whose controls move (the homepage's scrolling strip of app links): free now is not free later
/** Content a roaming mascot keeps off: text, media, dialogs and menus, and the areas a page marks [data-mascot-avoid]. */
export const CONTENT = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, pre, table, img, picture, svg, canvas, video, iframe, '
  + 'figure, dialog[open], [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-mascot-avoid]';

export const isControl = (el) => !!(el && el.closest && el.closest(CONTROLS));
const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
/** Is this element (from elementFromPoint) something the mascot must not cover: a control, content or a no-go area? */
export function blocks(el) {
  if (!el || el === document.documentElement || el === document.body || !el.closest) return false;
  return isControl(el) || !!el.closest(CONTENT) || hasText(el);
}

/** The areas a page marks off ([data-mascot-avoid]), as boxes. */
export function noGo() {
  const out = [];
  for (const el of document.querySelectorAll('[data-mascot-avoid]')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  return out;
}

/** The most room between two sample points (px): a line of text cannot slip between them. */
const STEP = 22;
/** Is the box clear: inside the window, off every no-go area, and nothing that blocks() under any of its sample points?
 * self: the mascot's own element, hidden while sampling (visibility only: nothing moves). */
export function clearBox(box, self, areas = noGo()) {
  if (areas.some((a) => overlaps(box, a, 4))) return false;
  const prev = self ? self.style.visibility : '';
  if (self) self.style.visibility = 'hidden';
  try {
    const nx = Math.max(4, Math.ceil((box.r - box.l) / STEP) + 1), ny = Math.max(4, Math.ceil((box.b - box.t) / STEP) + 1);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = box.l + 2 + ((box.r - box.l - 4) * i) / (nx - 1), y = box.t + 2 + ((box.b - box.t - 4) * j) / (ny - 1);
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        if (blocks(document.elementFromPoint(x, y))) return false;
      }
    }
    return true;
  } finally { if (self) self.style.visibility = prev; }
}

/** What a resting spot may sit beside: headings, sections, cards and the page's perches. */
const EDGES = '[data-perch], h1, h2, h3, main > *, section, article, aside, [class*="card"]';
const GAP = 14;

/** Spots ({ x, y, edge }: the top-left corner of a w x h box) where a roaming mascot may rest, inside bounds: beside the
 * left and right edges of the visible content, perched on its top edge at either end, and a coarse grid of the open
 * window. Unchecked: clearBox() decides. */
export function candidates(w, h, bounds) {
  const out = [], fits = (x, y) => within({ l: x, t: y, r: x + w, b: y + h }, bounds);
  const add = (x, y, edge) => { x = Math.round(x); y = Math.round(y); if (fits(x, y)) out.push({ x, y, edge }); };
  let n = 0;
  for (const el of document.querySelectorAll(EDGES)) {
    if (el.closest('.mascot-slot')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 14 || r.bottom < bounds.t || r.top > bounds.b) continue;
    add(r.right + GAP, r.top, true); add(r.left - GAP - w, r.top, true);
    add(r.right + GAP, r.bottom - h, true); add(r.left - GAP - w, r.bottom - h, true);
    add(r.left, r.top - h - 4, true); add(r.right - w, r.top - h - 4, true);
    if (++n >= 40) break;
  }
  const cols = 5, rows = 4;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    add(bounds.l + ((bounds.r - bounds.l - w) * i) / (cols - 1), bounds.t + ((bounds.b - bounds.t - h) * j) / (rows - 1), false);
  }
  return out;
}

/** Up to max clear spots from a list, in random order (shuffled with rnd), so a pick costs a few probes, not all. */
export function clearSpots(list, w, h, self, max = 8, rnd = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const areas = noGo(), out = [];
  for (const s of a) {
    if (clearBox({ l: s.x, t: s.y, r: s.x + w, b: s.y + h }, self, areas)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
