// Covers: code/js/langs-more.js
// Covers: tools/vendor-codemirror.mjs
// The extra languages of Slop Code: the table is well formed, file names and content map to the right language, and every
// entry points at a vendored legacy mode that lang-load.js and both import maps know. The vendor tool's list of modes is
// the same list. Run with: node --test tests/node/code-langs-more.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MORE, moreByName, moreById, sniffLanguage } from '../../code/js/langs-more.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFile(path.join(ROOT, f), 'utf8');
const BUILT_IN = ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'python', 'text'];
/** The extensions lang.js gives the built-in languages, read from its source (it imports CodeMirror, so it cannot load in Node). */
const builtInExts = async () => [...(await read('code/js/lang.js')).matchAll(/exts: \[([^\]]*)\]/g)].flatMap((m) => m[1].match(/[\w+#-]+/g));
const id = (name) => (moreByName(name) || {}).id || null;

test('every entry is complete, with a unique id', () => {
  assert.ok(MORE.length >= 35, 'at least 35 more languages');
  const ids = new Set();
  for (const e of MORE) {
    assert.match(e.id, /^[a-z0-9]+$/, e.id);
    assert.ok(!ids.has(e.id), 'duplicate id ' + e.id);
    ids.add(e.id);
    assert.ok(!BUILT_IN.includes(e.id), e.id + ' is a built-in id');
    for (const k of ['label', 'mime', 'mode', 'exportName', 'ext']) assert.equal(typeof e[k], 'string', `${e.id}.${k}`);
    assert.ok(e.label && e.mime.includes('/') && e.mode && e.exportName, e.id);
    assert.ok(Array.isArray(e.exts) && Array.isArray(e.names), e.id);
    assert.ok(e.exts.length + e.names.length + e.prefixes.length > 0, e.id + ' matches nothing');
    for (const x of e.exts) assert.match(x, /^[a-z0-9+#]+$/, `${e.id} ext ${x}`);
    for (const n of e.names) assert.equal(n, n.toLowerCase(), `${e.id} name ${n} must be lower case`);
  }
});

test('extensions and names are not shared, and never clash with the built-in languages', async () => {
  const builtIn = new Set(await builtInExts());
  assert.ok(builtIn.has('js') && builtIn.has('md') && builtIn.has('txt'), 'read the built-in extensions');
  const seen = new Map();
  for (const e of MORE) {
    for (const x of e.exts) {
      assert.ok(!builtIn.has(x), `${e.id} claims the built-in extension .${x}`);
      assert.ok(!seen.has('ext ' + x), `.${x} is in both ${seen.get('ext ' + x)} and ${e.id}`);
      seen.set('ext ' + x, e.id);
    }
    for (const n of e.names) {
      assert.ok(!seen.has('name ' + n), `${n} is in both ${seen.get('name ' + n)} and ${e.id}`);
      seen.set('name ' + n, e.id);
    }
  }
});

test('moreByName finds a language by extension', () => {
  assert.equal(id('config.yml'), 'yaml');
  assert.equal(id('docker-compose.YAML'), 'yaml');
  assert.equal(id('Cargo.toml'), 'toml');
  assert.equal(id('main.go'), 'go');
  assert.equal(id('lib.rs'), 'rust');
  assert.equal(id('app.rb'), 'ruby');
  assert.equal(id('a.b.c.cpp'), 'cpp');
  assert.equal(id('util.h'), 'c');
  assert.equal(id('Main.java'), 'java');
  assert.equal(id('Program.CS'), 'csharp');
  assert.equal(id('build.gradle'), 'groovy');
  assert.equal(id('schema.sql'), 'sql');
  assert.equal(id('logo.svg'), 'xml');
  assert.equal(id('script.ps1'), 'powershell');
  assert.equal(id('paper.tex'), 'latex');
  assert.equal(id('fix.patch'), 'diff');
  assert.equal(id('/some/dir/run.sh'), 'shell');
  assert.equal(id('C:\\work\\run.sh'), 'shell');
  assert.equal(moreByName('x.yaml').exts.includes('yaml'), true);
});

test('moreByName finds extensionless and special file names', () => {
  assert.equal(id('Dockerfile'), 'dockerfile');
  assert.equal(id('dockerfile'), 'dockerfile');
  assert.equal(id('Containerfile'), 'dockerfile');
  assert.equal(id('Dockerfile.dev'), 'dockerfile');
  assert.equal(id('api.dockerfile'), 'dockerfile');
  assert.equal(id('Makefile'), 'makefile');
  assert.equal(id('GNUmakefile'), 'makefile');
  assert.equal(id('CMakeLists.txt'), 'cmake');
  assert.equal(id('sub/dir/CMakeLists.txt'), 'cmake');
  assert.equal(id('Rakefile'), 'ruby');
  assert.equal(id('Gemfile'), 'ruby');
  assert.equal(id('Vagrantfile'), 'ruby');
  assert.equal(id('Jenkinsfile'), 'groovy');
  assert.equal(id('.bashrc'), 'shell');
  assert.equal(id('.zshrc'), 'shell');
  assert.equal(id('.profile'), 'shell');
  assert.equal(id('.gitconfig'), 'properties');
  assert.equal(id('.editorconfig'), 'properties');
  assert.equal(id('.env'), 'properties');
  assert.equal(id('.env.local'), 'properties');
  assert.equal(id('nginx.conf'), 'nginx');
  assert.equal(id('Pipfile'), 'toml');
});

test('moreByName leaves everything else alone', () => {
  for (const n of ['requirements.txt', 'notes.txt', 'readme.md', 'app.js', 'style.css', 'data.json', 'index.html', 'tool.py',
    'photo.png', 'LICENSE', 'x.unknownext', '', '.', '.gitignore', 'file.', 'envrc']) {
    assert.equal(moreByName(n), null, n);
  }
  assert.equal(moreByName(null), null);
  assert.equal(moreByName(undefined), null);
  assert.equal(moreById('go').label, 'Go');
  assert.equal(moreById('nope'), null);
});

test('sniffLanguage reads a "#!" line', () => {
  assert.equal(sniffLanguage('#!/bin/bash\necho hi\n'), 'shell');
  assert.equal(sniffLanguage('#!/bin/sh\n'), 'shell');
  assert.equal(sniffLanguage('#! /usr/bin/zsh -f\n'), 'shell');
  assert.equal(sniffLanguage('#!/usr/bin/env bash\n'), 'shell');
  assert.equal(sniffLanguage('#!/usr/bin/env python3\nprint(1)\n'), 'python');
  assert.equal(sniffLanguage('#!/usr/bin/python3.11\n'), 'python');
  assert.equal(sniffLanguage('#!/usr/bin/env node\n'), 'javascript');
  assert.equal(sniffLanguage('#!/usr/bin/env -S deno run --allow-read\n'), 'javascript');
  assert.equal(sniffLanguage('#!/usr/bin/env bun\r\nconsole.log(1)'), 'javascript');
  assert.equal(sniffLanguage('#!/usr/bin/env ruby\n'), 'ruby');
  assert.equal(sniffLanguage('#!/usr/bin/perl -w\n'), 'perl');
  assert.equal(sniffLanguage('#!/usr/bin/lua5.4\n'), 'lua');
  assert.equal(sniffLanguage('#!/usr/bin/env FOO=1 bash\n'), 'shell');
  assert.equal(sniffLanguage('\n\n#!/bin/bash\n'), 'shell', 'leading blank lines are skipped');
  assert.equal(sniffLanguage('#!/usr/bin/constructor\n'), null);
  assert.equal(sniffLanguage('#!/usr/bin/env\n'), null);
  assert.equal(sniffLanguage('#!\n'), null);
});

test('sniffLanguage reads XML, HTML, JSON and diffs', () => {
  assert.equal(sniffLanguage('<?xml version="1.0"?>\n<a/>'), 'xml');
  assert.equal(sniffLanguage('\uFEFF<?xml version="1.0"?>'), 'xml');
  assert.equal(sniffLanguage('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'xml');
  assert.equal(sniffLanguage('<!DOCTYPE html>\n<html></html>'), 'html');
  assert.equal(sniffLanguage('  <!doctype HTML><p>x'), 'html');
  assert.equal(sniffLanguage('<html lang="en"><body></body></html>'), 'html');
  assert.equal(sniffLanguage('{"a": [1, 2, {"b": null}]}'), 'json');
  assert.equal(sniffLanguage('  [1, 2, 3]\n'), 'json');
  assert.equal(sniffLanguage('[]'), 'json');
  assert.equal(sniffLanguage('{}'), 'json');
  assert.equal(sniffLanguage('{not json'), null);
  assert.equal(sniffLanguage('[section]\nkey=value\n'), null);
  assert.equal(sniffLanguage('{ a: 1 }'), null, 'JavaScript, not JSON');
  assert.equal(sniffLanguage('diff --git a/x b/x\nindex 1..2\n'), 'diff');
  assert.equal(sniffLanguage('--- a/x.txt\n+++ b/x.txt\n@@ -1 +1 @@\n'), 'diff');
});

test('sniffLanguage gives null for plain text and bad input, and looks at 4 KB at most', () => {
  for (const s of ['', '   \n', 'just some words', 'name: value\n', null, undefined, 42]) assert.equal(sniffLanguage(s), null, String(s));
  // A long JSON file is cut at 4 KB: it still opens like JSON, so it is recognised without parsing the whole text.
  const big = '{"items": [' + Array.from({ length: 2000 }, (_, i) => `{"n": ${i}}`).join(', ') + ']}';
  assert.ok(big.length > 4096);
  assert.equal(sniffLanguage(big), 'json');
  // Something that only appears after 4 KB is never seen.
  assert.equal(sniffLanguage(' '.repeat(5000) + '#!/bin/sh'), null);
  assert.equal(sniffLanguage('x'.repeat(5000) + '\n<?xml version="1.0"?>'), null);
});

test('every id sniffLanguage can return is a known language', () => {
  const known = new Set([...BUILT_IN, ...MORE.map((e) => e.id)]);
  for (const s of ['#!/bin/sh', '#!/usr/bin/python', '#!/usr/bin/node', '#!/usr/bin/ruby', '#!/usr/bin/perl', '#!/usr/bin/lua', '#!/usr/bin/env ts-node',
    '#!/usr/bin/pwsh', '#!/usr/bin/tclsh', '#!/usr/bin/Rscript', '#!/usr/bin/julia', '#!/usr/bin/groovy', '#!/usr/bin/escript', '#!/usr/bin/racket',
    '<?xml?>', '<html>', '{}', 'diff --git a b']) {
    const got = sniffLanguage(s);
    assert.ok(got && known.has(got), `${s} -> ${got}`);
  }
});

test('every entry has a vendored legacy mode, a loader and an import-map entry', async () => {
  const loader = await read('code/js/lang-load.js');
  const manifest = JSON.parse(await read('vendor/codemirror/import-map.json')).imports;
  const html = await read('code/index.html');
  const inline = JSON.parse(html.split('<script type="importmap">')[1].split('</script>')[0]).imports;
  for (const e of MORE) {
    const spec = `@codemirror/legacy-modes/mode/${e.mode}`;
    assert.ok(loader.includes(`import('${spec}')`), `lang-load.js has no import of ${spec}`);
    assert.equal(manifest[spec], `../vendor/codemirror/legacy-${e.mode}.js`, `import-map.json: ${spec}`);
    assert.equal(inline[spec], manifest[spec], `code/index.html: ${spec}`);
    const src = await read(`vendor/codemirror/legacy-${e.mode}.js`);
    assert.ok(new RegExp(`^export (const|function|var|let) ${e.exportName}\\b`, 'm').test(src), `${e.mode} exports no ${e.exportName}`);
  }
  // The modes that import a sibling (dockerfile, rust, wast) find it through the import map, never by a relative path.
  for (const key of Object.keys(manifest).filter((k) => k.startsWith('@codemirror/legacy-modes/'))) {
    const src = await read('vendor/codemirror/' + manifest[key].split('/').pop());
    for (const m of src.matchAll(/^\s*import\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)) {
      assert.ok(manifest[m[1]], `${key} imports ${m[1]}, which the import map lacks`);
    }
  }
});

test('the vendor tool vendors exactly the modes the import map, lang-load.js and langs-more.js use', async () => {
  const tool = await read('tools/vendor-codemirror.mjs');
  const listed = [...tool.split('const MODES = [')[1].split('];')[0].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
  assert.equal(new Set(listed).size, listed.length, 'a mode is listed twice');
  const manifest = JSON.parse(await read('vendor/codemirror/import-map.json')).imports;
  const mapped = Object.keys(manifest).filter((k) => k.startsWith('@codemirror/legacy-modes/mode/')).map((k) => k.split('/').pop());
  assert.deepEqual([...listed].sort(), [...mapped].sort());
  const used = new Set(MORE.map((e) => e.mode));
  for (const m of used) assert.ok(listed.includes(m), `${m} is not vendored by the tool`);
  // The only listed mode no language names is the helper the simple-mode parsers import.
  assert.deepEqual(listed.filter((m) => !used.has(m)), ['simple-mode']);
  assert.match(tool, /@codemirror\/legacy-modes/);
  assert.match(tool, /f !== 'README.md'/, 'the tool keeps the hand-written README.md');
});
