// Slopnodes state (nodes/js/model.js): links, loops, names, types, and older saved graphs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadCalc } from './calc-env.mjs';

globalThis.SlopCalc = await loadCalc();
const M = createRequire(import.meta.url)('../../nodes/js/model.js');

test('a link runs from an output to an input; a loop and a self link are refused', () => {
  const g = M.newGraph();
  const a = M.addNode(g, 'value', { x: 0, y: 0 }), b = M.addNode(g, 'formula', { x: 0, y: 0 }), c = M.addNode(g, 'formula', { x: 0, y: 0 });
  assert.equal(M.connect(g, a, b), null);
  assert.equal(M.connect(g, b, c), null);
  assert.match(M.connect(g, c, a), /loop/);
  assert.match(M.connect(g, a, a), /feed itself/);
  assert.match(M.connect(g, a, b), /Already connected/);
});

test('names are unique and checked; a value gets a value name, a formula a formula name', () => {
  const g = M.newGraph();
  const a = M.addNode(g, 'value', { x: 0, y: 0 }), b = M.addNode(g, 'value', { x: 0, y: 0 });
  assert.notEqual(g.nodes[0].name, g.nodes[1].name);
  assert.match(M.rename(g, b, g.nodes[0].name), /already/);
  assert.equal(M.rename(g, b, 'price'), null);
  assert.match(M.rename(g, b, 'pi'), /built in/);
  assert.ok(M.addNode(g, 'formula', { x: 0, y: 0 }));
  assert.match(g.nodes[2].name, /^formula/);
});

test('a note takes no wires, and turning a node into a note drops its wires', () => {
  const g = M.newGraph();
  const a = M.addNode(g, 'value', { x: 0, y: 0 }), b = M.addNode(g, 'formula', { x: 0, y: 0 });
  M.connect(g, a, b);
  M.setType(g, b, 'note');
  assert.equal(g.links.length, 0);
  assert.match(M.connect(g, a, b), /note/);
});

test('reconnect moves the input end of a wire; a move that makes a loop is refused and the wire stays put', () => {
  const g = M.newGraph();
  const a = M.addNode(g, 'value', { x: 0, y: 0 }), b = M.addNode(g, 'formula', { x: 0, y: 0 }), c = M.addNode(g, 'formula', { x: 0, y: 0 });
  M.connect(g, a, b);
  M.connect(g, b, c);
  const ab = g.links.find((l) => l.from === a);
  assert.equal(M.reconnect(g, ab.id, c), null);           // a -> c instead
  assert.equal(g.links.find((l) => l.id === ab.id).to, c, 'the same wire, now to c');
  const bc = g.links.find((l) => l.from === b);            // b -> c
  assert.equal(M.reconnect(g, bc.id, a), null);            // b -> a: no loop now that a -> b is gone
  M.reconnect(g, ab.id, b);                                 // a -> b again would close a -> b -> a
  assert.equal(g.links.length, 2);
});

test('a loop made by a move is refused and the wire stays where it was', () => {
  const g = M.newGraph();
  const a = M.addNode(g, 'value', { x: 0, y: 0 }), b = M.addNode(g, 'formula', { x: 0, y: 0 });
  M.connect(g, a, b);
  const ab = g.links[0];
  assert.match(M.reconnect(g, ab.id, a), /feed itself/);
  assert.equal(g.links[0].to, b);
});

test('an older saved graph (no links) gets its links from the names it uses', () => {
  const g = M.load({ nodes: [{ id: 'a', name: 'price', expr: '5', x: 0, y: 0 }, { id: 'b', name: 'twice', expr: 'price * 2', x: 0, y: 0 }] });
  assert.equal(g.links.length, 1);
  assert.equal(g.links[0].from, 'a');
  assert.equal(g.links[0].to, 'b');
});

test('save and load keep nodes and links', () => {
  const g = M.newGraph();
  const a = M.addNode(g, 'value', { x: 3, y: 4 }), b = M.addNode(g, 'output', { x: 9, y: 9 });
  M.connect(g, a, b);
  const back = M.load(JSON.parse(JSON.stringify(M.save(g))));
  assert.equal(back.nodes.length, 2);
  assert.equal(back.links.length, 1);
  assert.equal(back.nodes.find((n) => n.id === b).type, 'output');
});
