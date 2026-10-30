/* Slopnodes engine: a graph of formulas joined by links. A node has an id, a name, a type and an expression. A link runs
 * from a source node to a node that uses the source's name in its expression.
 *   types: value, formula and output are worked out; note is text only and is left out of the graph.
 * evaluate(nodes, { links, today, rate }) → { results, order, cycles }
 *   links    [{ from, to }] node ids. When not given, links are read from the names the formulas use (older graphs).
 *   results  Map id → { ok, value, text, error, needs: [names] }
 *   order    ids in the order they were worked out (a node after the nodes it uses)
 *   cycles   Set of ids that depend on themselves (directly or through others)
 * Pure, classic script, after calc.js. Exposes window.SlopCalc.graph. */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const NAME = /^[a-z_][a-z0-9_]*$/;
  const cleanName = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const RESERVED = ns.RESERVED_NAMES || [];
  const TYPES = ['value', 'formula', 'output', 'note'];

  /** The names a formula uses (lower case); a formula that does not tokenise uses none. */
  function namesIn(expr) {
    try { return ns.lexer.tokenize(String(expr || '')).filter((t) => t.type === 'word').map((t) => t.value.toLowerCase()); } catch (e) { return []; }
  }
  /** Why a name cannot be used for a node, or null when it can. */
  function nameProblem(name, others) {
    const n = cleanName(name);
    if (!n) return say('ui.calc.node_name');
    if (!NAME.test(n)) return say('ui.calc.node_name_rule');
    if (RESERVED.includes(n)) return say('ui.calc.node_builtin', { name: n });
    if (others && others.includes(n)) return say('ui.calc.node_taken', { name: n });
    return null;
  }
  /** Links implied by the names: a formula that uses another node's name is linked to it (for graphs saved without links). */
  function impliedLinks(nodes) {
    const byName = new Map();
    for (const n of nodes) { const k = cleanName(n.name); if (k && !byName.has(k)) byName.set(k, n); }
    const links = [];
    for (const n of nodes) for (const name of new Set(namesIn(n.expr))) {
      const src = byName.get(name);
      if (src) links.push({ from: src.id, to: n.id });
    }
    return links;
  }

  function evaluate(nodes, opts) {
    const o = opts || {};
    const live = nodes.filter((n) => TYPES.includes(n.type || 'formula') && n.type !== 'note');
    const byId = new Map(live.map((n) => [n.id, n]));
    const byName = new Map(), dupes = new Set();
    for (const n of live) {
      const name = cleanName(n.name);
      if (!name) continue;
      if (byName.has(name)) dupes.add(n.id); else byName.set(name, n);
    }
    const links = Array.isArray(o.links) ? o.links : impliedLinks(live);
    const sources = new Map(live.map((n) => [n.id, []]));
    for (const l of links) if (byId.has(l.from) && byId.has(l.to)) sources.get(l.to).push(byId.get(l.from));
    for (const n of live) sources.set(n.id, [...new Map(sources.get(n.id).map((s) => [s.id, s])).values()]);

    // Order: depth-first over the sources; meeting a node that is still open means a cycle.
    const state = new Map(), order = [], cycles = new Set();
    const visit = (node, path) => {
      const st = state.get(node.id);
      if (st === 2) return;
      if (st === 1) { for (let k = path.indexOf(node.id); k >= 0 && k < path.length; k++) cycles.add(path[k]); return; }
      state.set(node.id, 1);
      for (const s of sources.get(node.id)) visit(s, path.concat(node.id));
      state.set(node.id, 2);
      order.push(node.id);
    };
    for (const n of live) visit(n, []);

    const results = new Map();
    for (const id of order) {
      const node = byId.get(id), srcs = sources.get(id), needs = srcs.map((s) => cleanName(s.name));
      if (dupes.has(id)) { results.set(id, { ok: false, error: { code: 'name', message: say('ui.calc.node_dupe') }, needs }); continue; }
      if (cycles.has(id)) { results.set(id, { ok: false, error: { code: 'cycle', message: say('ui.calc.cycle') }, needs }); continue; }
      const bad = srcs.find((s) => !results.get(s.id).ok);
      if (bad) { results.set(id, { ok: false, error: { code: 'needs', message: say('ui.calc.waiting', { name: cleanName(bad.name) }) }, needs }); continue; }
      const scope = {};
      for (const s of srcs) scope[cleanName(s.name)] = results.get(s.id).value;
      const expr = String(node.expr || '').trim() || '0';
      if (ns.parseStatement(expr).name) { results.set(id, { ok: false, error: { code: 'syntax', message: say('ui.calc.name_in_box') }, needs }); continue; }
      const r = ns.calc(expr, { today: o.today, rate: o.rate, vars: scope });
      if (r.ok) { results.set(id, { ok: true, value: r.value, text: r.text, needs }); continue; }
      let error = r.error;
      if (error.code === 'name') {
        const loose = namesIn(expr).find((w) => byName.has(w) && !(w in scope));
        if (loose) error = { code: 'link', message: say('ui.calc.connect', { name: loose }) };
      }
      results.set(id, { ok: false, error, needs });
    }
    return { results, order, cycles };
  }

  /** A new node of a type, at a place; the defaults a fresh node starts with. */
  function newNode(type, at) {
    const t = TYPES.includes(type) ? type : 'formula';
    return { type: t, name: '', expr: t === 'note' ? 'Note' : '0', x: at.x, y: at.y };
  }

  ns.graph = { evaluate, namesIn, nameProblem, cleanName, impliedLinks, newNode, TYPES };
})(typeof window !== 'undefined' ? window : globalThis);
