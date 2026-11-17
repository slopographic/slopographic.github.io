// The shared offline builder (shared/offline/build.js) on two apps: each output is one self-contained HTML file,
// names its app, and keeps no external script or stylesheet and no data-src or data-offline attribute.
// Run with: node --test tests/node/offline-bundle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, SlopOffline } from '../../tools/offline/lib.mjs';

const CASES = [['pdf', 'Slop PDF', 'slop-pdf-build'], ['vector', 'SlopVector', 'slop-vector-build']];

for (const [id, name, marker] of CASES) {
  test(`${id}: one self-contained offline file`, async () => {
    const html = await buildApp(id);
    assert.match(html, /^<!doctype html>/i);
    assert.ok(html.includes(name), `names ${name}`);
    assert.ok(html.includes(`name="${marker}" content="offline"`), 'carries its offline marker');
    // the tags only: an inlined script may hold tag text in a string (shared/i18n/i18n.js writes '<script src=…')
    const tags = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
    assert.equal(/<script\b[^>]*\ssrc=/i.test(tags), false, 'no script src');
    assert.equal(/<link\b[^>]*\brel="stylesheet"/i.test(tags), false, 'no stylesheet link');
    assert.equal(/<(link|script)\b[^>]*\sdata-src=/i.test(tags), false, 'no data-src on a link or script');
    assert.equal(/<(link|script)\b[^>]*\sdata-offline=/i.test(tags), false, 'no data-offline element left');
    assert.equal(/<link\b[^>]*\shref="(?!data:|#)[^"]*"[^>]*\brel="icon"/i.test(html), false, 'icon is inline');
    assert.ok(html.length > 500000, `a full app (${html.length} characters)`);
  });
}

test('inlined code cannot close its own element', () => {
  const M = {
    id: 'escape', entry: 'app/index.html', mode: 'inline', marker: 'escape-build',
    files: ['app/main.js', 'app/main.css'],
  };
  const S = {
    'app/index.html': '<html><head></head><body><script src="main.js"></script><link rel="stylesheet" href="main.css"></body></html>',
    'app/main.js': 'var x = "</script><b>"; var y = "</SCRIPT >";',
    'app/main.css': 'a::after{content:"</style>"}',
  };
  const html = SlopOffline.bundle(M, S);
  assert.ok(html.includes('<script>\nvar x = "<\\/script><b>"; var y = "<\\/SCRIPT >";\n</script>'), 'script body escaped');
  assert.ok(html.includes('<style>\na::after{content:"<\\/style>"}\n</style>'), 'style body escaped');
  assert.ok(html.includes('<meta name="escape-build" content="offline">'), 'marker added');
});

test('a file the page names but the manifest lacks fails the build', () => {
  const M = { id: 'missing', entry: 'app/index.html', mode: 'inline', marker: 'x-build', files: [] };
  const S = { 'app/index.html': '<html><head></head><body><script src="main.js"></script></body></html>' };
  assert.throws(() => SlopOffline.bundle(M, S), /app\/main\.js .* is not in the manifest files/);
});
