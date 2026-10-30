/* A card's route, when its target is a route (core/chain.js): the formats as a row of tiles with arrows, SIE → CSV → JSON.
 * Each tile in the middle is a menu button (shared/ui/menubutton.js) to pass through another format that joins the same
 * ends; "Then…" at the end adds a step from what the route makes, and × removes the last step. A one-step target shows only
 * Then… (thenButton), beside its Convert to. On a page for one route, the tiles still switch but nothing is added or removed.
 *   routeRow({ kind, key, finalOpts, name, fixed, onRoute(key, fmt) })   -> div.cv-route
 *   thenButton({ kind, key, finalOpts, name, onRoute })                  -> button.cv-route-then, or null when nothing fits */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';
import { tileOf } from './file-row.js';
import { kindsOf, stepsOf, middleChoices, thenChoices, dropLast, TAG } from '../core/chain.js';
import { CONVERSIONS, groupLabel } from '../core/catalog.js';
import '../../../shared/ui/menubutton.js';   // window.SlopMenuButton

const arrow = () => h('span', { class: 'cv-route-arrow', 'aria-hidden': 'true' }, '→');
const via = (key, i) => stepsOf(key).slice(i, i + 2).map((s) => s.conv.label).join(tr('convert.row.then_join'));   // the two steps a middle tile joins

/** The tile in the middle (after step i): a button with the format, opening the formats the route could pass through. */
function middle({ kind, key, i, kinds, name, onRoute }) {
  const alts = middleChoices(kind, key, i);
  const b = h('button', { type: 'button', class: 'cv-route-mid', 'data-step': i + 1,
    'aria-label': tr('convert.row.mid_change', { n: i + 1, kind: TAG(kinds[i + 1]) }) }, tileOf(kinds[i + 1]), h('span', { class: 'cv-to-caret', 'aria-hidden': 'true' }, '▾'));
  if (alts.length < 2) { b.disabled = true; b.setAttribute('aria-label', tr('convert.row.mid', { n: i + 1, kind: TAG(kinds[i + 1]) })); return b; }
  b.menu = window.SlopMenuButton.attach(b, {
    label: tr('convert.row.through', { name }),
    items: () => alts.map((a) => ({ value: a.key, label: `${TAG(a.kind)} · ${via(a.key, i)}`, icon: tileOf(a.kind), checked: a.current, keywords: [a.kind] })),
    onPick: (k) => { if (k !== key) onRoute(k, ''); },
  });
  return b;
}

export function thenButton({ kind, key, finalOpts = null, name, onRoute, cls = '' }) {
  const list = thenChoices(kind, key, { finalOpts });
  if (!list.length) return null;
  const kinds = kindsOf(kind, key, CONVERSIONS, finalOpts) || [], end = TAG(kinds[kinds.length - 1]);
  const b = h('button', { type: 'button', class: 'cv-btn cv-small cv-route-then ' + cls, 'aria-label': tr('convert.row.then_tip', { kind: end, name }) }, tr('convert.row.then'));
  b.menu = window.SlopMenuButton.attach(b, {
    label: tr('convert.row.then_to', { kind: end }),
    items: () => {
      const out = [], groups = new Map();
      for (const x of list) { const g = groupLabel(x.conv.group); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); }
      for (const [g, xs] of groups) {
        if (groups.size > 1) out.push({ heading: g });
        for (const x of xs) out.push({ value: x.key, label: x.conv.label, icon: tileOf(x.conv.ext || 'file'), keywords: [...(x.conv.keywords || []), x.conv.ext || ''] });
      }
      return out;
    },
    onPick: (k) => onRoute(k, ''),
  });
  return b;
}

export function routeRow({ kind, key, finalOpts = null, name, fixed = false, onRoute }) {
  const kinds = kindsOf(kind, key, CONVERSIONS, finalOpts) || [kind];
  const parts = [tileOf(kinds[0])];
  for (let i = 0; i < kinds.length - 1; i++) {
    parts.push(arrow());
    parts.push(i < kinds.length - 2 ? middle({ kind, key, i, kinds, name, onRoute }) : h('span', { class: 'cv-route-end' }, tileOf(kinds[i + 1])));
  }
  if (!fixed) {
    const then = thenButton({ kind, key, finalOpts, name, onRoute });
    if (then) parts.push(then);
    const steps = stepsOf(key), last = steps[steps.length - 1];
    const x = h('button', { type: 'button', class: 'cv-btn cv-small cv-route-x', 'aria-label': tr('convert.row.drop_step_name', { name: last ? last.conv.label : '' }), title: tr('convert.row.drop_step') }, '×');
    x.addEventListener('click', () => { const d = dropLast(key); onRoute(d.key, d.fmt); });
    parts.push(x);
  }
  return h('div', { class: 'cv-route', role: 'group', 'aria-label': tr('convert.row.route', { kinds: kinds.map(TAG).join(tr('convert.row.to_join')) }) }, ...parts);
}
