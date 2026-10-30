/* Slopnodes for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), loaded on demand by
 * js/commands.js. Each change goes through SlopNodesApp.edit or replace (app.js), so it is one undo step, and through the
 * graph model's own functions (model.js addNode, rename, setExpr, setType, connect, disconnect, removeNode). Nodes are
 * named by their name (or id). Saving uses projects.js (a Slop Drive project); export writes JSON or the results as CSV
 * through shared/commands/sources.js. Only delete_node is destructive. Sets window.SlopNodesAI. */
(function () {
  'use strict';
  const A = window.SlopNodesApp, M = window.SlopNodesModel, G = window.SlopCalc.graph, C = window.SlopCmd;
  const TYPES = G.TYPES;
  const list = [];
  const add = C.aiAdder('nodes', list);   // shared/commands/commands.js
  const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  let srcP = null;
  const sources = () => (window.SlopCmdSources ? Promise.resolve() : (srcP = srcP || new Promise((res, rej) => {
    const el = Object.assign(document.createElement('script'), { src: new URL('../shared/commands/sources.js', location.href).href });
    el.onload = res; el.onerror = () => { srcP = null; rej(new Error('Could not load sources.js')); }; document.head.append(el);
  })));

  function find(g, q) {
    const s = G.cleanName(String(q || '')), n = g.nodes.find((x) => x.id === q) || g.nodes.find((x) => G.cleanName(x.name) === s);
    if (!n) throw new Error(`No node “${q}” (nodes: ${g.nodes.map((x) => x.name || x.id).join(', ')})`);
    return n;
  }
  const show = (n) => { const r = A.results().get(n.id); return n.type === 'note' ? `note “${n.expr.slice(0, 40)}”` : `${n.name} = ${r ? (r.ok ? r.text : 'error: ' + r.error.message) : '…'}`; };
  /** One node into graph g: type, name, expr, place, and wires from its inputs (names). Throws on a refused name or wire. */
  function put(g, o, at) {
    const id = M.addNode(g, TYPES.includes(o.type) ? o.type : 'formula', { x: o.x ?? at.x, y: o.y ?? at.y });
    if (o.name) { const p = M.rename(g, id, o.name); if (p) throw new Error(`${o.name}: ${p}`); }
    if (o.expr != null) M.setExpr(g, id, String(o.expr));
    for (const from of [].concat(o.inputs || [])) { const p = M.connect(g, find(g, from).id, id); if (p) throw new Error(`${from} → ${o.name || id}: ${p}`); }
    return id;
  }
  const NODE = { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', enum: TYPES }, expr: { type: 'string', description: 'a number, or a formula using other nodes\' names' },
    inputs: { type: 'array', items: { type: 'string' }, description: 'names of the nodes wired into this one' }, x: { type: 'number' }, y: { type: 'number' } } };

  add('new_graph', 'New graph', [Str('name', 'project name', { default: 'Untitled project' })], (a) => { A.replace(M.newGraph(), { driveId: null, name: a.name }); return `Started the empty graph “${a.name}” (Undo brings the old one back).`; },
    { description: 'Start an empty graph (the old one comes back with undo).' });
  add('build_graph', 'Build a graph', [Str('name', 'project name', { default: 'Untitled project' }), { name: 'nodes', type: 'array', required: true, maxItems: 300, items: NODE,
    description: 'in order: [{ name, type value|formula|output|note, expr, inputs: [names] }]' }],
  (a) => {
    const g = M.newGraph();
    a.nodes.forEach((o, i) => put(g, o, { x: 60 + (i % 4) * 240, y: 60 + Math.floor(i / 4) * 160 }));
    A.replace(g, { driveId: null, name: a.name });
    return `Built “${a.name}”: ` + A.graph().nodes.map(show).join('; ') + '.';
  }, { description: 'Make a whole graph in one step: values, formulas that use them, and outputs.' });
  add('add_node', 'Add a node', [{ name: 'type', type: 'enum', values: TYPES, default: 'formula' }, Str('name', 'a name others can use in formulas'), Str('expr', 'number or formula', { maxLength: 2000 }),
    { name: 'inputs', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'names of nodes to wire in' }, { name: 'x', type: 'number', min: -1e5, max: 1e5 }, { name: 'y', type: 'number', min: -1e5, max: 1e5 }],
  (a) => { const n = A.graph().nodes.length; const id = A.edit((g) => put(g, a, { x: 60 + (n % 4) * 240, y: 60 + Math.floor(n / 4) * 160 })); return `Added ${show(find(A.graph(), id))}.`; });
  add('connect', 'Connect nodes', [Str('from', 'node name', { required: true }), Str('to', 'node name', { required: true })], (a) => {
    let problem = null;
    A.edit((g) => { problem = M.connect(g, find(g, a.from).id, find(g, a.to).id); return problem ? false : true; });
    if (problem) throw new Error(problem);
    return `Wired ${a.from} → ${a.to}: ${show(find(A.graph(), a.to))}.`;
  });
  add('disconnect', 'Disconnect nodes', [Str('from', 'node name', { required: true }), Str('to', 'node name', { required: true })], (a) => {
    const g0 = A.graph(), f = find(g0, a.from).id, t = find(g0, a.to).id, l = g0.links.find((x) => x.from === f && x.to === t);
    if (!l) throw new Error(`${a.from} is not wired to ${a.to}`);
    A.edit((g) => M.disconnect(g, l.id));
    return `Removed the wire ${a.from} → ${a.to}.`;
  });
  add('set_node', 'Change a node', [Str('node', 'node name', { required: true }), Str('name', 'new name'), Str('expr', 'new number or formula', { maxLength: 2000 }), { name: 'type', type: 'enum', values: TYPES }],
    (a) => {
      let problem = null, id = null;
      A.edit((g) => {
        const n = find(g, a.node); id = n.id;
        if (a.type) M.setType(g, n.id, a.type);
        if (a.name) problem = M.rename(g, n.id, a.name);
        if (a.expr != null) M.setExpr(g, n.id, a.expr);
        return problem ? false : true;
      });
      if (problem) throw new Error(problem);
      return `Now ${show(find(A.graph(), id))}.`;
    });
  add('delete_node', 'Delete a node', [Str('node', 'node name', { required: true })], (a) => { const n = find(A.graph(), a.node); A.edit((g) => M.removeNode(g, n.id)); return `Deleted ${n.name || 'the note'}.`; },
    { destructive: true });
  add('save_project', 'Save the project to Slop Drive', [Str('name', 'project name; the current one when empty')], async (a) => {
    const name = a.name || A.project().name, id = await A.saveAs(name);
    return `Saved “${name}” to Slop Drive (id ${id}).`;
  });
  add('export_graph', 'Export the graph', [{ name: 'format', type: 'enum', values: ['json', 'csv'], default: 'csv', description: 'csv: each node with its result; json: the graph' },
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  async (a) => {
    const g = A.graph(), base = (A.project().name || 'graph').replace(/[\\/:*?"<>|]+/g, ' ');
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const blob = a.format === 'json' ? new Blob([JSON.stringify({ format: 'slopnodes', version: 1, name: A.project().name, graph: M.save(g) }, null, 2)], { type: 'application/json' })
      : new Blob([['name,type,formula,result', ...g.nodes.filter((n) => n.type !== 'note').map((n) => { const r = A.results().get(n.id); return [n.name, n.type, n.expr, r && r.ok ? r.text : r ? 'error: ' + r.error.message : ''].map(cell).join(','); })].join('\n')], { type: 'text/csv' });
    const name = `${base}.${a.format}`, out = [];
    if (a.to !== 'download') { await sources(); out.push(`Saved ${name} to Slop Drive (id ${await SlopCmdSources.put(blob, name, 'nodes')})`); }
    if (a.to !== 'drive' && window.SlopUI) { SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }, { description: 'Save the graph as JSON or its results as CSV, to Slop Drive and/or a download.' });
  add('undo', 'Undo', [{ name: 'steps', type: 'number', min: 1, max: 20, default: 1, integer: true }], (a) => { for (let i = 0; i < a.steps; i++) A.undo(); return `Undid ${a.steps} step${a.steps === 1 ? '' : 's'}.`; });

  function state() {
    const g = A.graph(), name = (id) => (g.nodes.find((n) => n.id === id) || {}).name;
    return { app: 'Slopnodes', project: A.project().name, nodes: g.nodes.slice(0, 150).map((n) => { const r = A.results().get(n.id); return { id: n.id, name: n.name, type: n.type, expr: n.expr, result: r ? (r.ok ? r.text : 'error: ' + r.error.message) : null }; }),
      wires: g.links.map((l) => `${name(l.from)} → ${name(l.to)}`) };
  }
  function checkpoint() { const snap = JSON.stringify(M.save(A.graph())), pr = Object.assign({}, A.project()); return () => { if (JSON.stringify(M.save(A.graph())) !== snap) A.replace(M.load(JSON.parse(snap)), pr); return true; }; }
  window.SlopNodesAI = { state };
  C.register(list);
  C.provide({ state, checkpoint });
})();
