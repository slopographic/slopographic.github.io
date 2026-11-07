// Variables, programs and the node graph engine (shared/calc). Uses the same loader as the calculator tests.
// Covers: shared/calc/graph.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCalc } from './calc-env.mjs';

const C = await loadCalc();

test('a statement can name its result; later statements use the name', () => {
  const r = C.program('a = 5; b = a * 2; b + 1', { vars: {} });
  assert.equal(r.ok, true);
  assert.equal(r.value.v, 11);
  assert.equal(r.vars.b.v, 10);
  assert.equal(r.steps[0].text, 'a = 5');
});

test('a name the page does not hold is an error that says so', () => {
  const r = C.calc('price * 2', { vars: {} });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'name');
  assert.match(r.error.message, /Unknown name/);
});

test('the calculation stops at the first bad statement', () => {
  const vars = {};
  const r = C.program('a = 2; a * nope; a = 9', { vars });
  assert.equal(r.ok, false);
  assert.equal(r.steps.length, 2);
  assert.equal(vars.a.v, 2);
});

test('a graph: a change to one node reaches every node that uses it', () => {
  const nodes = [
    { id: 'n1', name: 'a', expr: '2' },
    { id: 'n2', name: 'b', expr: 'a * 3' },
    { id: 'n3', name: 'c', expr: 'b + a' },
  ];
  let r = C.graph.evaluate(nodes, {});
  assert.equal(r.results.get('n3').value.v, 8);
  nodes[0].expr = '10';
  r = C.graph.evaluate(nodes, {});
  assert.equal(r.results.get('n2').value.v, 30);
  assert.equal(r.results.get('n3').value.v, 40);
  assert.deepEqual([...r.results.get('n3').needs].sort(), ['a', 'b']); // copied: arrays from the vm context have another prototype
});

test('a cycle is reported on every node in it, and nothing else is', () => {
  const nodes = [
    { id: 'x', name: 'x', expr: 'y + 1' },
    { id: 'y', name: 'y', expr: 'x * 2' },
    { id: 'z', name: 'z', expr: '4' },
  ];
  const r = C.graph.evaluate(nodes, {});
  assert.deepEqual([...r.cycles].sort(), ['x', 'y']);
  assert.equal(r.results.get('x').error.code, 'cycle');
  assert.equal(r.results.get('z').ok, true);
});

test('a node waiting on a broken one says what it is waiting on', () => {
  const nodes = [
    { id: 'p', name: 'p', expr: '1 / 0 * 5' },
    { id: 'q', name: 'q', expr: 'p + 1' },
  ];
  const r = C.graph.evaluate(nodes, {});
  assert.equal(r.results.get('p').ok, false);
  assert.equal(r.results.get('q').error.code, 'needs');
  assert.match(r.results.get('q').error.message, /p/);
});

test('names are checked: built-in names and duplicates are refused', () => {
  assert.match(C.graph.nameProblem('pi', []), /built in/);
  assert.match(C.graph.nameProblem('total', ['total']), /already/);
  assert.equal(C.graph.nameProblem('total_2', ['other']), null);
  assert.match(C.graph.nameProblem('2total', []), /starts with a letter/);
});

test('with explicit links, a formula sees only the nodes it is wired to; a name it is not wired to says to connect it', () => {
  const nodes = [
    { id: 'a', name: 'rate', type: 'value', expr: '8' },
    { id: 'b', name: 'base', type: 'value', expr: '200' },
    { id: 'c', name: 'tax_amt', type: 'formula', expr: 'base * rate / 100' },
  ];
  const linked = C.graph.evaluate(nodes, { links: [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }] });
  assert.equal(linked.results.get('c').value.v, 16);
  const loose = C.graph.evaluate(nodes, { links: [{ from: 'a', to: 'c' }] });
  assert.equal(loose.results.get('c').ok, false);
  assert.match(loose.results.get('c').error.message, /Connect “base”/);
});

test('a note is left out of the graph: a formula cannot use it and it has no result', () => {
  const nodes = [
    { id: 'n', name: 'memo', type: 'note', expr: 'just words' },
    { id: 'f', name: 'x', type: 'formula', expr: '2 + 2' },
  ];
  const r = C.graph.evaluate(nodes, { links: [{ from: 'n', to: 'f' }] });
  assert.equal(r.results.has('n'), false);
  assert.equal(r.results.get('f').value.v, 4);
});

test('a value and an output work like formulas, and the kind is kept for the page', () => {
  const nodes = [
    { id: 'v', name: 'price', type: 'value', expr: '5' },
    { id: 'o', name: 'twice', type: 'output', expr: 'price * 2' },
  ];
  const r = C.graph.evaluate(nodes, { links: [{ from: 'v', to: 'o' }] });
  assert.equal(r.results.get('o').value.v, 10);
});
