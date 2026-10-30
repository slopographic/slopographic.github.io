/* Slopnodes state: the nodes and the links between them, as plain data. No DOM here, so the page and the tests share it.
 * A graph is { nodes: [{ id, type, name, expr, x, y }], links: [{ id, from, to }] }.
 *   newGraph(), addNode(g, type, at) → id, removeNode(g, id), rename(g, id, name) → problem|null,
 *   setExpr(g, id, text), setType(g, id, type), connect(g, from, to) → problem|null, disconnect(g, linkId),
 *   reconnect(g, linkId, to) → problem|null, uniqueName(g, type), load(saved) → graph, save(g) → plain data.
 * Classic script with a CommonJS export for the tests. Needs window.SlopCalc.graph (or the same in node). */
(function (root) {
  'use strict';
  // a problem in the page's language when it has the words (shared/i18n), else English (Node, the tests)
  const tr = (k, en) => (root.SlopI18n && root.SlopI18n.has(k) ? root.SlopI18n.t(k) : en);
  const G = () => (root.SlopCalc && root.SlopCalc.graph) || null;
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const byId = (g, id) => g.nodes.find((n) => n.id === id) || null;
  const others = (g, id) => g.nodes.filter((n) => n.id !== id).map((n) => G().cleanName(n.name));

  function newGraph() { return { nodes: [], links: [] }; }

  /** A name nobody has yet, from the type: value1, formula2, output1… */
  function uniqueName(g, type) {
    const base = type === 'output' ? 'result' : type === 'value' ? 'value' : 'formula';
    let k = 1, name = base + k;
    const taken = new Set(g.nodes.map((n) => G().cleanName(n.name)));
    while (taken.has(name)) { k++; name = base + k; }
    return name;
  }
  function addNode(g, type, at) {
    const n = Object.assign(G().newNode(type, at || { x: 40, y: 40 }), { id: uid('n') });
    if (n.type !== 'note') n.name = uniqueName(g, n.type);
    g.nodes.push(n);
    return n.id;
  }
  function removeNode(g, id) {
    g.nodes = g.nodes.filter((n) => n.id !== id);
    g.links = g.links.filter((l) => l.from !== id && l.to !== id);
  }
  function rename(g, id, name) {
    const n = byId(g, id);
    if (!n) return tr('nodes.err.no_node', 'No such node');
    if (n.type === 'note') { n.name = String(name || ''); return null; }
    const problem = G().nameProblem(name, others(g, id));
    if (!problem) n.name = G().cleanName(name);
    return problem;
  }
  function setExpr(g, id, text) { const n = byId(g, id); if (n) n.expr = String(text); }
  function setType(g, id, type) {
    const n = byId(g, id);
    if (!n || !G().TYPES.includes(type)) return;
    n.type = type;
    if (type === 'note') { g.links = g.links.filter((l) => l.from !== id && l.to !== id); }
    else if (!n.name) n.name = uniqueName(g, type);
  }
  /** Would a link from → to close a loop? (to can already reach from through the links.) */
  function reaches(g, start, goal) {
    const seen = new Set([start]), stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === goal) return true;
      for (const l of g.links) if (l.from === cur && !seen.has(l.to)) { seen.add(l.to); stack.push(l.to); }
    }
    return false;
  }
  /** A link from a node's output to another node's input. Returns a problem, or null when it was made. */
  function connect(g, from, to) {
    const a = byId(g, from), b = byId(g, to);
    if (!a || !b) return tr('nodes.err.not_here', 'Those nodes are not on the canvas');
    if (a.type === 'note' || b.type === 'note') return tr('nodes.err.note_wires', 'A note takes no wires');
    if (from === to) return tr('nodes.err.self', 'A node cannot feed itself');
    if (g.links.some((l) => l.from === from && l.to === to)) return tr('nodes.err.already', 'Already connected');
    if (reaches(g, to, from)) return tr('nodes.err.loop', 'That wire would make a loop');
    g.links.push({ id: uid('l'), from, to });
    return null;
  }
  function disconnect(g, linkId) { g.links = g.links.filter((l) => l.id !== linkId); }
  /** Moves the input end of a link to another node. */
  function reconnect(g, linkId, to) {
    const l = g.links.find((m) => m.id === linkId);
    if (!l) return tr('nodes.err.no_wire', 'No such wire');
    const from = l.from;
    disconnect(g, linkId);
    const problem = connect(g, from, to);
    if (problem) { g.links.push(l); return problem; }
    g.links[g.links.length - 1].id = linkId; // the same wire, moved: it keeps its id
    return null;
  }
  function load(saved) {
    const s = saved && Array.isArray(saved.nodes) ? saved : { nodes: [] };
    const nodes = s.nodes.map((n) => Object.assign({ type: 'formula', name: '', expr: '0', x: 40, y: 40 }, n));
    let links = Array.isArray(s.links) ? s.links.filter((l) => nodes.some((n) => n.id === l.from) && nodes.some((n) => n.id === l.to)) : null;
    if (!links) links = G().impliedLinks(nodes).map((l) => ({ id: uid('l'), from: l.from, to: l.to }));
    return { nodes, links };
  }
  function save(g) {
    return { nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, expr: n.expr, x: Math.round(n.x), y: Math.round(n.y) })),
      links: g.links.map((l) => ({ id: l.id, from: l.from, to: l.to })) };
  }

  const M = { newGraph, addNode, removeNode, rename, setExpr, setType, connect, disconnect, reconnect, uniqueName, load, save, reaches };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.SlopNodesModel = M;
})(typeof window !== 'undefined' ? window : globalThis);
