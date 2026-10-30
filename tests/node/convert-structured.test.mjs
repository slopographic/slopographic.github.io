// File convert: JSON to and from YAML and TOML, JSON to XML, JSON formatting and its error positions (no browser).
// Run: node --test tests/node/convert-structured.test.mjs
// Covers: convert/js/core/structured.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJson, jsonErrorAt, formatJson, jsonToYaml, yamlToJson, jsonToToml, tomlToJson, jsonToXml, xmlName } from '../../convert/js/core/structured.js';

const DATA = { name: 'Goo', tags: ['a', 'b'], price: 4.5, on: true, nested: { x: 1, when: '2026-10-24', no: 'no' } };

test('JSON errors say where: line, column and the text there', () => {
  assert.equal(jsonErrorAt('{"a": 1,\n "b": }'), 15);
  assert.equal(jsonErrorAt('[1, 2'), 5);
  assert.equal(jsonErrorAt('{"a":1}'), -1);
  assert.throws(() => parseJson('{"a": 1,\n "b": }'), /line 2, column 7, near "}"/);
  assert.throws(() => parseJson('[1, 2'), /near the end of the file/);
  assert.throws(() => parseJson('  '), /empty/);
  assert.deepEqual(parseJson('﻿{"a":[1,"x"]}'), { a: [1, 'x'] });
});

test('format: 2 or 4 spaces, tabs, or minified on one line', () => {
  const t = JSON.stringify(DATA);
  assert.equal(formatJson(t, { indent: 0 }), t);
  assert.equal(formatJson(t, { indent: '4' }), JSON.stringify(DATA, null, 4) + '\n');
  assert.equal(formatJson(t, { indent: 'tab' }).split('\n')[1], '\t"name": "Goo",');
});

test('JSON to YAML and back gives the same data; strings that look like other types stay strings', async () => {
  const y = await jsonToYaml(JSON.stringify(DATA));
  assert.match(y, /^name: Goo\ntags:\n  - a\n  - b\n/);
  assert.match(y, /when: "2026-10-24"/);   // quoted, or YAML would read a date
  assert.match(y, /"no": "no"/);           // quoted, or YAML 1.1 readers take it as false
  assert.deepEqual(JSON.parse(await yamlToJson(y)), DATA);
});

test('YAML to JSON: block scalars, flow lists, anchors and merges, several documents, errors with the line', async () => {
  const j = JSON.parse(await yamlToJson('base: &b\n  a: 1\nchild:\n  <<: *b\n  c: [x, y]\ntext: |\n  one\n  two\n'));
  assert.deepEqual(j, { base: { a: 1 }, child: { a: 1, c: ['x', 'y'] }, text: 'one\ntwo\n' });
  assert.deepEqual(JSON.parse(await yamlToJson('a: 1\n---\nb: 2\n')), [{ a: 1 }, { b: 2 }]);
  assert.equal(await yamlToJson('a: 1\n', { indent: '0' }), '{"a":1}');
  await assert.rejects(yamlToJson('a: [1, 2\nb: 3\n'), /This YAML could not be read: .*line \d+/);
});

test('JSON to TOML and back; nulls are left out and counted; the top must be an object', async () => {
  const r = await jsonToToml(JSON.stringify({ ...DATA, gone: null, list: [1, null, 2], people: [{ n: 'A' }, { n: 'B' }] }));
  assert.equal(r.dropped, 2);
  assert.match(r.text, /^name = "Goo"\n/);
  assert.match(r.text, /\[nested\]\nx = 1\n/);
  assert.match(r.text, /\[\[people\]\]\nn = "A"/);
  assert.deepEqual(JSON.parse(await tomlToJson(r.text)), { ...DATA, list: [1, 2], people: [{ n: 'A' }, { n: 'B' }] });
  await assert.rejects(jsonToToml('[1, 2]'), /must be an object/);
});

test('TOML to JSON: tables, arrays of tables, dates as ISO text, big integers, errors', async () => {
  const j = JSON.parse(await tomlToJson('title = "T"\n[owner]\ndob = 1979-05-27T07:32:00Z\n[[products]]\nname = "Hammer"\nsku = 738594937\n'));
  assert.deepEqual(j, { title: 'T', owner: { dob: '1979-05-27T07:32:00.000Z' }, products: [{ name: 'Hammer', sku: 738594937 }] });
  await assert.rejects(tomlToJson('a = \n'), /This TOML could not be read/);
});

test('JSON to XML: elements, repeated arrays, escaping, names made valid, a root you name, and XML to JSON\'s shape back', () => {
  const x = jsonToXml(JSON.stringify({ 'first name': 'A & B', '1st': [1, 2], empty: null, o: {} }), { root: 'person' });
  assert.equal(x, '<?xml version="1.0" encoding="UTF-8"?>\n<person>\n  <first_name>A &amp; B</first_name>\n  <_1st>1</_1st>\n  <_1st>2</_1st>\n  <empty/>\n  <o/>\n</person>\n');
  assert.equal(jsonToXml('[{"a":1}]'), '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <item>\n    <a>1</a>\n  </item>\n</root>\n');
  const shape = { name: 'note', attributes: { id: '7' }, children: [{ name: 'to', text: 'Tove' }, { name: 'body', text: 'Hi <3' }] };
  assert.equal(jsonToXml(JSON.stringify(shape)), '<?xml version="1.0" encoding="UTF-8"?>\n<note id="7">\n  <to>Tove</to>\n  <body>Hi &lt;3</body>\n</note>\n');
  assert.deepEqual(['ok', 'a b', '9x', 'xmlish'].map(xmlName), ['ok', 'a_b', '_9x', '_xmlish']);
});
