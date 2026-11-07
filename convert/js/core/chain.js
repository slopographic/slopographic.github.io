/* Routes: conversions done one after the other (SIE → CSV → JSON). The catalog is the graph: every kind is a node, and each
 * conversion is an edge from each kind it takes to the kind it makes (outKind; a conversion with a Format option, PDF to
 * images, is one edge per format). Pure: no DOM.
 * A route is written as a key: its steps joined by '>', a step being a conversion id, with '@<kind>' when its Format option is
 * fixed by the route ('pdf-to-images@jpg>to-webp'). A plain conversion id is a one-step route.
 * The best route to a kind: the fewest engine downloads (ffmpeg) it would need, then the fewest steps, then the least loss
 * (chain-flags.js: lossy, cost), then catalog order. Found routes never use encoding, archive or same-kind conversions, a
 * conversion that takes any file, or a kind twice (no round trips), and are at most MAX_STEPS long.
 *   stepsOf(key, convs)                    [{ id, fmt, conv, key }]
 *   kindsOf(source, key, convs, finalOpts) the kinds along the route: [source, ..., final] (null when a step does not fit)
 *   validRoute(source, key, convs)         true when every step takes the kind before it
 *   routesFrom(source, { convs, max })     every found route from a kind: [{ key, kinds, score }], best first
 *   moreRoutes(source, opts)               the best route to each kind no single conversion makes, best first
 *   routeTo(source, want, opts)            the key that makes `want` (a conversion id, a kind, or a key) from source, or ''
 *   middleChoices(source, key, i, opts)    the other kinds the route could pass through after step i: [{ kind, key, current }]
 *   thenChoices(source, key, opts)         conversions that could be added at the end: [{ conv, key }] (none back to a kind
 *                                          already on the route, no encoding, none that keeps the kind)
 *   dropLast(key)                          { key, fmt }: the route without its last step (fmt: the new last step's fixed format)
 *   routeLabel(source, key, convs)         'JSON · via CSV'; stepLabel(kinds, i) 'Step 1 · SIE → CSV' */
import { tr } from './i18n.js';
import { CONVERSIONS } from './catalog.js';

export const MAX_STEPS = 3;   // a found route
export const MAX_MANUAL = 4;  // with steps added by hand (Then…)
export const isRoute = (key) => typeof key === 'string' && key.includes('>');
export const TAG = (k) => ({ jpeg: 'JPG', camt053: 'CAMT.053' }[k] || String(k || 'file').toUpperCase());

const byId = (convs) => (id) => convs.find((c) => c.id === id);
const formatOpt = (c) => c.options.find((o) => o.key === 'format' && o.type === 'select');
const canDo = (c) => { try { return !c.available || c.available(); } catch (e) { return false; } };
const accepts = (c, kind) => c.from.includes(kind) || c.from.includes('*');

export function stepsOf(key, convs = CONVERSIONS) {
  const find = byId(convs);
  return String(key || '').split('>').filter(Boolean).map((s) => { const [id, fmt = ''] = s.split('@'); return { id, fmt, conv: find(id), key: s }; });
}
const joinSteps = (steps) => steps.map((s) => s.key || (s.fmt ? `${s.id}@${s.fmt}` : s.id)).join('>');
/** The kind a step makes: its fixed format, else (the last step) its options' format, else its output. */
function makes(step, opts = null) {
  const f = formatOpt(step.conv);
  return step.fmt || (f && opts && typeof opts.format === 'string' && opts.format) || (f && String(f.value)) || step.conv.ext || 'file';
}

export function kindsOf(source, key, convs = CONVERSIONS, finalOpts = null) {
  const steps = stepsOf(key, convs), kinds = [source];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.conv || !accepts(s.conv, kinds[i]) || (s.fmt && !(formatOpt(s.conv)?.options || []).some(([v]) => String(v) === s.fmt))) return null;
    kinds.push(makes(s, i === steps.length - 1 ? finalOpts : null));
  }
  return steps.length ? kinds : null;
}
export const validRoute = (source, key, convs = CONVERSIONS) => !!kindsOf(source, key, convs);

/** The route edges out of a kind: [{ step: { id, fmt, conv, key }, to, cost, engine }]. first: the route's first step. */
function edgesFrom(kind, convs, first) {
  const out = [];
  convs.forEach((c, order) => {
    if (c.chain === false || (c.chain === 'first' && !first) || c.with || c.from.includes('*') || !c.ext || /^(Encoding|Archives)$/.test(c.group || '')) return;
    if (!c.from.includes(kind) || (kind === 'txt' && c.from.length > 1) || !canDo(c)) return;   // 'txt' beside a real kind is a fallback for a misnamed file
    const f = formatOpt(c), cost = c.cost ?? (c.lossy ? 1 : 0), engine = c.engine || '';
    const fmts = f ? f.options.map(([v]) => String(v)) : [''];
    for (const v of fmts) {
      const to = v || c.ext, fmt = v && v !== String(f.value) ? v : '';
      if (to !== kind) out.push({ step: { id: c.id, fmt, conv: c, key: fmt ? `${c.id}@${fmt}` : c.id }, to, cost, engine, order });
    }
  });
  return out;
}

/** Lower is better: [engines to download, steps, loss, catalog order of each step]. */
function score(edges) {
  return [new Set(edges.map((e) => e.engine).filter(Boolean)).size, edges.length, edges.reduce((n, e) => n + e.cost, 0), ...edges.map((e) => e.order)];
}
function better(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] ?? -1, y = b[i] ?? -1; if (x !== y) return x < y; }
  return false;
}

const memo = new Map();
export function routesFrom(source, { convs = CONVERSIONS, max = MAX_STEPS } = {}) {
  const mk = `${source}|${max}`;
  if (convs === CONVERSIONS && memo.has(mk)) return memo.get(mk);
  const found = [];
  const walk = (kind, edges, seen) => {
    if (edges.length >= max) return;
    for (const e of edgesFrom(kind, convs, !edges.length)) {
      if (seen.includes(e.to)) continue;
      const path = [...edges, e], kinds = [...seen, e.to];
      found.push({ key: joinSteps(path.map((x) => x.step)), kinds, score: score(path), edges: path });
      walk(e.to, path, kinds);
    }
  };
  walk(source, [], [source]);
  found.sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
  if (convs === CONVERSIONS) memo.set(mk, found);
  return found;
}

/** Kinds a single conversion makes from this kind (any conversion the menu lists, Format option values included). */
function directKinds(source, convs) {
  const set = new Set();
  for (const c of convs.filter((x) => accepts(x, source) && canDo(x))) {
    const f = formatOpt(c);
    if (f) for (const [v] of f.options) set.add(String(v));
    set.add(c.ext || 'file');
  }
  return set;
}

export function moreRoutes(source, opts = {}) {
  const convs = opts.convs || CONVERSIONS, direct = directKinds(source, convs), seen = new Set(), out = [];
  for (const r of routesFrom(source, opts)) {
    const k = r.kinds[r.kinds.length - 1];
    if (r.edges.length < 2 || direct.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function routeTo(source, want, opts = {}) {
  const convs = opts.convs || CONVERSIONS;
  if (!want) return '';
  if (isRoute(want)) return validRoute(source, want, convs) ? want : routeTo(source, stepsOf(want, convs).pop().id, opts);
  const conv = convs.find((c) => c.id === want);
  if (conv) {
    if (accepts(conv, source) && canDo(conv)) return want;
    const r = routesFrom(source, opts).find((x) => x.edges[x.edges.length - 1].step.id === want);
    return r ? r.key : '';
  }
  const one = convs.find((c) => accepts(c, source) && !c.from.includes('*') && canDo(c) && c.ext === want && !formatOpt(c));
  if (one) return one.id;
  const r = routesFrom(source, opts).find((x) => x.kinds[x.kinds.length - 1] === want);
  return r ? r.key : '';
}

export function middleChoices(source, key, i, opts = {}) {
  const convs = opts.convs || CONVERSIONS, steps = stepsOf(key, convs), kinds = kindsOf(source, key, convs);
  if (!kinds || i < 0 || i >= steps.length - 1) return [];
  const before = kinds[i], after = kinds[i + 2], others = kinds.filter((_, k) => k !== i + 1), next = steps[i + 1];
  const best = new Map();
  for (const e1 of edgesFrom(before, convs, i === 0)) {
    if (others.includes(e1.to)) continue;
    for (const e2 of edgesFrom(e1.to, convs, false)) {
      if (e2.to !== after && !(i + 1 === steps.length - 1 && e2.step.id === next.id)) continue;
      const sc = [...score([e1, e2]), e2.step.id === next.id ? 0 : 1];
      const prev = best.get(e1.to);
      if (!prev || better(sc, prev.sc)) best.set(e1.to, { sc, steps: [e1.step, e2.step] });
    }
  }
  const cur = kinds[i + 1];
  const list = [...best.entries()].map(([kind, b]) => ({ kind, key: joinSteps([...steps.slice(0, i), ...b.steps, ...steps.slice(i + 2)]), sc: b.sc }));
  list.sort((a, b) => (better(a.sc, b.sc) ? -1 : 1));
  const out = list.filter((x) => x.kind !== cur).map(({ kind, key: k }) => ({ kind, key: k, current: false }));
  return [{ kind: cur, key, current: true }, ...out];
}

export function thenChoices(source, key, opts = {}) {
  const convs = opts.convs || CONVERSIONS, steps = stepsOf(key, convs), kinds = kindsOf(source, key, convs, opts.finalOpts || null);
  if (!kinds || steps.length >= (opts.max || MAX_MANUAL)) return [];
  const last = steps[steps.length - 1], end = kinds[kinds.length - 1];
  const f = formatOpt(last.conv), fixed = f && end !== String(f.value) ? `${last.id}@${end}` : last.id;
  const head = joinSteps([...steps.slice(0, -1), { key: fixed }]);
  return convs.filter((c) => c.from.includes(end) && !(end === 'txt' && c.from.length > 1) && !c.from.includes('*') && !c.with && c.chain !== 'first' && c.chain !== false && c.group !== 'Encoding' &&   // i18n-ignore: group ids
      !kinds.includes(c.ext) && canDo(c) && !steps.some((s) => s.id === c.id))
    .map((c) => ({ conv: c, key: `${head}>${c.id}` }));
}

export function dropLast(key) {
  const parts = String(key).split('>');
  parts.pop();
  const [id, fmt = ''] = (parts.pop() || '').split('@');
  return { key: [...parts, id].join('>'), fmt };
}

export function routeLabel(source, key, convs = CONVERSIONS) {
  const kinds = kindsOf(source, key, convs) || [];
  if (kinds.length < 3) return '';
  return tr('convert.chain.via', { to: TAG(kinds[kinds.length - 1]), steps: kinds.slice(1, -1).map(TAG).join(', ') });
}
export const stepLabel = (kinds, i) => tr('convert.chain.step', { i: String(i + 1), from: TAG(kinds[i]), to: TAG(kinds[i + 1]) });
