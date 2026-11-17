// Covers: code/js/formatview.js
// Covers: code/js/fv-util.js
// Covers: code/js/fv-messages.js
// Covers: code/js/fv-json.js
// The Formatted view: the entry point and dispatch (canFormat, formatForView), and the JSON and JSON Lines formatters.
// Run with: node --test tests/node/code-formatview.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canFormat, formatForView, MAX_CHARS } from '../../code/js/formatview.js';

const fv = formatForView;
/** The formatted text of an input that must format. */
const good = (text, lang, name) => { const r = fv(text, lang, name); assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };
const lines = (...l) => l.join('\n');

test('canFormat decides by language id first, then by file extension', () => {
  assert.equal(canFormat('json', 'a.txt'), 'json');
  assert.equal(canFormat('html', 'a.txt'), 'html');
  assert.equal(canFormat('css', 'a.txt'), 'css');
  assert.equal(canFormat('javascript', 'a.txt'), 'js');
  assert.equal(canFormat('typescript', 'a.txt'), 'js');
  assert.equal(canFormat('html', 'logo.svg'), 'html', 'the language id wins over the extension');
  const byExt = {
    json: ['a.json', 'a.geojson', 'a.webmanifest', 'a.har', 'A.JSON'],
    jsonl: ['a.jsonl', 'a.ndjson'],
    xml: ['a.xml', 'a.svg', 'a.xsd', 'a.xsl', 'a.xslt', 'a.rss', 'a.atom', 'a.plist', 'a.kml', 'a.gpx', 'a.xhtml', 'a.csproj', 'a.resx', 'a.config', 'a.wsdl', 'a.fo'],
    css: ['a.scss', 'a.less', 'a.css'],
    sql: ['a.sql'], csv: ['a.csv', 'a.CSV'], tsv: ['a.tsv'],
    js: ['a.mjs', 'a.cjs', 'a.jsx', 'a.tsx', 'a.mts', 'a.js', 'a.ts'],
    html: ['a.html', 'a.htm'],
  };
  for (const [kind, names] of Object.entries(byExt)) for (const n of names) assert.equal(canFormat('text', n), kind, n);
});

test('canFormat gives null for anything else', () => {
  for (const [lang, name] of [['python', 'a.py'], ['markdown', 'a.md'], ['text', 'a.txt'], ['text', 'README'], ['text', ''], [undefined, undefined],
    ['text', '.json'], ['text', 'json'], ['text', 'a.constructor'], ['constructor', 'a.toString'], [null, 'archive.tar.gz']]) {
    assert.equal(canFormat(lang, name), null, `${lang} ${name}`);
  }
});

test('formatForView: the result shape, for a kind that formats, one that does not, and one that fails', () => {
  assert.deepEqual(fv('[1]', 'json', 'a.json'), { ok: true, text: '[1]', kind: 'json' });
  const no = fv('x = 1', 'python', 'a.py');
  assert.equal(no.ok, false);
  assert.equal(typeof no.error, 'string');
  const bad = fv('{"a":1,}', 'json', 'a.json');
  assert.equal(bad.ok, false);
  assert.equal(bad.kind, 'json');
  assert.equal(bad.line, 1);
  assert.equal(bad.col, 8);
  assert.equal(bad.key, 'code.fv.err.trailing_comma', 'an error carries the i18n key the pane translates');
});

test('formatForView never throws, whatever it is given, and is deterministic', () => {
  for (const lang of ['json', 'html', 'css', 'javascript', 'typescript']) {
    for (const input of [undefined, null, 0, 42, {}, [], '', ' ', '\u0000', '<', '{', '"', "'", '`', '/*', '(((', '}}}', '\uFEFF', '\r', '\r\n\r\n', '\\', '--', '$$']) {
      const a = fv(input, lang, 'x'), b = fv(input, lang, 'x');
      assert.deepEqual(a, b);
      assert.equal(typeof a.ok, 'boolean');
    }
  }
  for (const name of ['a.xml', 'a.sql', 'a.csv', 'a.tsv', 'a.jsonl', 'a.scss']) {
    for (const input of ['', '"', "'", '<', '<a', '</', '<!--', '<![CDATA[', '/*', '(', ')', '$$', '$a$', '{', '}', '--', ',,,', '"a', '\uFEFF']) {
      const r = fv(input, 'text', name);
      assert.equal(typeof r.ok, 'boolean', `${name} ${JSON.stringify(input)}`);
      assert.deepEqual(r, fv(input, 'text', name));
    }
  }
});

test('input over 2,000,000 characters is too large; exactly that many is formatted', () => {
  const r = fv('x'.repeat(MAX_CHARS + 1), 'json', 'a.json');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'too large');
  assert.equal(r.key, 'code.fv.err.too_large');
  assert.equal(fv(' '.repeat(MAX_CHARS + 1), 'text', 'a.csv').error, 'too large');
  assert.equal(MAX_CHARS, 2000000);
  assert.equal(fv('1' + ' '.repeat(MAX_CHARS - 1), 'json').ok, true);
});

test('a byte-order mark is ignored, and CRLF and CR line breaks count like the editor counts them', () => {
  assert.equal(good('\uFEFF{"a":1}', 'json'), '{\n  "a": 1\n}');
  const r = fv('{\r\n  "a": 1,\r\n}', 'json');
  assert.equal(r.ok, false);
  assert.deepEqual([r.line, r.col], [3, 1]);
  assert.equal(fv('{\r  "a": 1,\r}', 'json').line, 3);
});

// ---- JSON ----

test('json: a normal document is printed with two-space indents and key order kept', () => {
  const out = good('{"b":1,"a":{"x":[],"y":{}},"c":[{"d":true},null]}', 'json');
  assert.equal(out, lines('{', '  "b": 1,', '  "a": {', '    "x": [],', '    "y": {}', '  },', '  "c": [', '    {', '      "d": true', '    },', '    null', '  ]', '}'));
});

test('json: messy and minified input gives the same result as tidy input', () => {
  const tidy = good('{\n  "name": "x",\n  "list": [1, 2, 3],\n  "o": {\n    "k": "v"\n  }\n}', 'json');
  const messy = good('  {"name"  :"x"\n,\t"list":[ 1,2 ,\n3 ]  ,"o":{"k"\n:\n"v"}}  \n\n', 'json');
  assert.equal(messy, tidy);
  assert.equal(good(tidy, 'json'), tidy, 'formatting twice changes nothing');
  assert.equal(good('"just a string"', 'json'), '"just a string"');
  assert.equal(good('  42 ', 'json'), '42');
  assert.equal(good('', 'json'), '');
  assert.equal(good(' \n ', 'json'), '');
});

test('json: big integers and number spellings survive exactly, strings keep their escapes', () => {
  const src = '{"id":12345678901234567890,"p":1.0,"e":1e5,"E":-0.50E+3,"z":-0,"tiny":0.000000000000000000001,"s":"a\\u00e9\\n\\"q\\" \\/ \\\\","u":"\\ud83d\\ude00 é 😀"}';
  const out = good(src, 'json');
  for (const piece of ['12345678901234567890', '1.0,', '1e5,', '-0.50E+3', '"z": -0,', '0.000000000000000000001', '"a\\u00e9\\n\\"q\\" \\/ \\\\"', '"\\ud83d\\ude00 é 😀"']) {
    assert.ok(out.includes(piece), piece + '\n' + out);
  }
  assert.deepEqual(JSON.parse(out), JSON.parse(src));
});

test('json: duplicate keys are kept, in order', () => {
  assert.equal(good('{"a":1,"a":2,"b":3,"a":4}', 'json'), lines('{', '  "a": 1,', '  "a": 2,', '  "b": 3,', '  "a": 4', '}'));
});

test('json: short arrays of primitives stay on one line, others break', () => {
  assert.equal(good('[1,2,3]', 'json'), '[1, 2, 3]');
  assert.equal(good('[true,false,null,"a",1.5,-2,"b","c"]', 'json'), '[true, false, null, "a", 1.5, -2, "b", "c"]');
  assert.equal(good('[1,2,3,4,5,6,7,8,9]', 'json'), lines('[', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => '  ' + n + (i < 8 ? ',' : '')), ']'), 'nine items break');
  assert.equal(good('[[1,2],[3,4]]', 'json'), lines('[', '  [1, 2],', '  [3, 4]', ']'));
  assert.equal(good('[{"a":1}]', 'json'), lines('[', '  {', '    "a": 1', '  }', ']'));
  assert.equal(good('{"k": [ ]}', 'json'), lines('{', '  "k": []', '}'));
  // 60 characters fit, 61 do not: [ + 4 strings of 13 characters + 3 separators of 2 + ]
  const four = (w) => ['"' + 'a'.repeat(w - 2) + '"', ...Array(3).fill('"' + 'b'.repeat(11) + '"')];
  assert.equal(good('[' + four(13).join(',') + ']', 'json').split('\n').length, 1);
  assert.equal(good('[' + four(14).join(',') + ']', 'json').split('\n').length, 6);
});

test('json: the output parses to the same data as the input', () => {
  const data = { a: [1, [2, [3, { b: null }]], 'x'], c: { d: { e: {} } }, f: [], g: 'é\n"', h: [1.5, 2e10, 'long string '.repeat(10), true] };
  assert.deepEqual(JSON.parse(good(JSON.stringify(data), 'json')), data);
  assert.deepEqual(JSON.parse(good(JSON.stringify(data, null, 4), 'json')), data);
});

test('json: errors say what is wrong, with the line and column of the problem', () => {
  const cases = [
    ['{"a":1,}', 'trailing_comma', 1, 8],
    ['{\n  "a": 1,\n}', 'trailing_comma', 3, 1],
    ['[1,2,]', 'trailing_comma', 1, 6],
    ['{"a":', 'unexpected_end', 1, 6],
    ['[1, 2', 'unexpected_end', 1, 6],
    ['{"a" 1}', 'expected_colon', 1, 6],
    ['{"a":1 "b":2}', 'expected_comma_object', 1, 8],
    ['[1 2]', 'expected_comma_array', 1, 4],
    ['{1:2}', 'expected_key', 1, 2],
    ["{'a':1}", 'single_quote', 1, 2],
    ['{"a":1} {"b":2}', 'extra_text', 1, 9],
    ['{"a": 01}', 'invalid_number', 1, 7],
    ['[1.]', 'invalid_number', 1, 2],
    ['[+1]', 'unexpected_char', 1, 2],
    ['{"a": tru}', 'unexpected_word', 1, 7],
    ['{"a": NaN}', 'unexpected_word', 1, 7],
    ['{\n  "a": "x\n}', 'unterminated_string', 2, 8],
    ['{"a": "\\x"}', 'bad_escape', 1, 8],
    ['{"a": "\\u12G4"}', 'bad_unicode', 1, 8],
    ['{"a": "tab\there"}', 'control_char', 1, 11],
    ['{"a": 1} // note', 'comment', 1, 10],
    ['{"a":}', 'expected_value', 1, 6],
    [']', 'expected_value', 1, 1],
  ];
  for (const [src, id, line, col] of cases) {
    const r = fv(src, 'json');
    assert.equal(r.ok, false, src);
    assert.equal(r.key, 'code.fv.err.' + id, src + ' ' + JSON.stringify(r));
    assert.deepEqual([r.line, r.col], [line, col], src);
    assert.ok(r.error && r.error.length < 80, src);
  }
});

test('json: very deep nesting is refused, not a crash', () => {
  const r = fv('['.repeat(100000), 'json');
  assert.equal(r.ok, false);
  assert.equal(r.key, 'code.fv.err.too_deep');
  const ok = fv('['.repeat(150) + ']'.repeat(150), 'json');
  assert.equal(ok.ok, true);
});

// ---- JSON Lines ----

test('jsonl: each non-empty line is a record, pretty-printed, with a blank line between records', () => {
  const out = good('{"a":1}\n\n   \n{"b":[1,2],"c":{"d":"x"}}\r\n[1,2]\n', 'text', 'log.jsonl');
  assert.equal(out, lines('{', '  "a": 1', '}', '', '{', '  "b": [1, 2],', '  "c": {', '    "d": "x"', '  }', '}', '', '[1, 2]'));
  assert.equal(good('{"a":1}', 'text', 'x.ndjson'), lines('{', '  "a": 1', '}'));
  assert.equal(good('\n\n', 'text', 'x.jsonl'), '');
  assert.equal(good('12345678901234567890\n1.0\n"s"', 'text', 'x.jsonl'), '12345678901234567890\n\n1.0\n\n"s"');
});

test('jsonl: a bad line is an error with its line number', () => {
  const r = fv('{"a":1}\n{"b":1,}\n{"c":3}', 'text', 'x.jsonl');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'jsonl');
  assert.equal(r.line, 2);
  assert.equal(r.col, 8);
  assert.equal(r.key, 'code.fv.err.trailing_comma');
  assert.equal(fv('{"a":1}\n\n\n{"b":', 'text', 'x.jsonl').line, 4);
  assert.equal(fv('{\n  "a": 1\n}', 'text', 'x.jsonl').line, 1, 'a record that spans lines is not valid JSON Lines');
});

// ---- size and speed ----

test('a 1 MB JSON input is formatted in under 2 seconds', () => {
  const row = '{"id":12345,"name":"abc def","tags":["x","y"],"v":1.50,"n":null,"o":{"k":[1,2,3]}},';
  const src = '[' + row.repeat(Math.ceil(1000000 / row.length)).slice(0, -1) + ']';
  assert.ok(src.length >= 1000000);
  const t0 = performance.now();
  const r = fv(src, 'json', 'big.json');
  assert.ok(performance.now() - t0 < 2000, 'took ' + (performance.now() - t0));
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(r.text).length, JSON.parse(src).length);
});

test('a 1 MB JSON Lines input is formatted in under 2 seconds', () => {
  const src = '{"id":12345,"name":"abc def","tags":["x","y"]}\n'.repeat(21000);
  const t0 = performance.now();
  const r = fv(src, 'text', 'big.jsonl');
  assert.ok(performance.now() - t0 < 2000);
  assert.equal(r.ok, true);
});

// ---- display only ----

test('the formatters touch nothing outside their input: only formatters and format.js are imported, no DOM, storage or editor', async () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'code', 'js');
  const files = (await readdir(dir)).filter((f) => f === 'formatview.js' || f.startsWith('fv-'));
  assert.ok(files.length >= 9, files.join(' '));
  for (const f of files) {
    const src = (await readFile(path.join(dir, f), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/import[^'"]*['"]([^'"]+)['"]/g)) assert.match(m[1], /^\.\/(fv-[\w-]+|formatview|format)\.js$/, `${f} imports ${m[1]}`);
    assert.doesNotMatch(src, /\b(document|window|localStorage|sessionStorage|indexedDB|dispatch|SlopDrive|navigator)\b/, f);
  }
  assert.equal(typeof globalThis.window, 'undefined');
});
