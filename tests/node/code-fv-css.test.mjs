// Covers: code/js/fv-css.js
// The Formatted view, CSS (also SCSS and Less). Run with: node --test tests/node/code-fv-css.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForView } from '../../code/js/formatview.js';

const css = (text, name = 'a.css') => { const r = formatForView(text, 'css', name); assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };
const lines = (...l) => l.join('\n');

test('css: a normal stylesheet has one declaration per line and a blank line between top-level rules', () => {
  const src = 'a { color: red; margin: 0 auto }\nb, c > d { background: url(x.png) no-repeat }';
  assert.equal(css(src), lines('a {', '  color: red;', '  margin: 0 auto;', '}', '', 'b,', 'c > d {', '  background: url(x.png) no-repeat;', '}'));
  assert.equal(css(css(src)), css(src), 'formatting twice changes nothing');
});

test('css: minified input works, nested at-rules are indented', () => {
  const src = 'a{color:red;margin:0}@media (min-width:600px){.x,.y{display:none}.z{top:0}@supports (display:grid){.g{display:grid}}}@font-face{font-family:F;src:url(f.woff2)}';
  assert.equal(css(src), lines('a {', '  color: red;', '  margin: 0;', '}', '', '@media (min-width:600px) {', '  .x,', '  .y {', '    display: none;', '  }', '  .z {', '    top: 0;', '  }',
    '  @supports (display:grid) {', '    .g {', '      display: grid;', '    }', '  }', '}', '', '@font-face {', '  font-family: F;', '  src: url(f.woff2);', '}'));
});

test('css: spaces after commas and colons, !important, empty rules and statements', () => {
  assert.equal(css('a{margin:0 auto!important;font-family:a,b ,  c;color:rgba(0,0,0,.5);background:URL( "a b.png" )}'),
    lines('a {', '  margin: 0 auto !important;', '  font-family: a, b, c;', '  color: rgba(0, 0, 0, .5);', '  background: URL( "a b.png" );', '}'));
  assert.equal(css('a{}b { }'), lines('a {}', '', 'b {}'));
  assert.equal(css('@charset "utf-8";@import url("x.css") screen;a{b:c}'), lines('@charset "utf-8";', '@import url("x.css") screen;', '', 'a {', '  b: c;', '}'));
  assert.equal(css('a{color:red;;;margin:0}'), lines('a {', '  color: red;', '  margin: 0;', '}'));
  assert.equal(css('@keyframes k{from{top:0}50%,60%{top:5px}to{top:9px}}'), lines('@keyframes k {', '  from {', '    top: 0;', '  }', '  50%,', '  60% {', '    top: 5px;', '  }', '  to {', '    top: 9px;', '  }', '}'));
});

test('css: a ; { } or comment marker inside a string, url(...) or comment does not split', () => {
  const src = 'a::after{content:"a;b{c}d";x:\'}\'}\n.d{background:url(data:image/png;base64,AAA;BBB{}) no-repeat}\n[href$=";"],[title="{"]{y:z}\n/* ; { } */b{c:d/* ; */;e:f}\n.e{content:"\\";{"}';
  assert.equal(css(src), lines('a::after {', '  content: "a;b{c}d";', "  x: '}';", '}', '', '.d {', '  background: url(data:image/png;base64,AAA;BBB{}) no-repeat;', '}', '',
    '[href$=";"],', '[title="{"] {', '  y: z;', '}', '', '/* ; { } */', 'b {', '  c: d/* ; */;', '  e: f;', '}', '', '.e {', '  content: "\\";{";', '}'));
});

test('css: the text of every string, url and comment is kept exactly', () => {
  const src = '@import "a;b.css";a{background:url( x;y.png ) , url(\'q{.png\');content:"  two  spaces ;  {";font:12px/1 "A  B",\'C ;D\'}/* keep   this ; { */ /*x*/b{c:d}';
  const out = css(src);
  for (const piece of ['"a;b.css"', 'url( x;y.png )', "url('q{.png')", '"  two  spaces ;  {"', '"A  B"', "'C ;D'", '/* keep   this ; { */', '/*x*/']) assert.ok(out.includes(piece), piece + '\n' + out);
});

test('css: comments get their own line, a multi-line comment is kept as written', () => {
  assert.equal(css('/* top */a{/* in */color:red;/* after */margin:0}/*end*/'), lines('/* top */', 'a {', '  /* in */', '  color: red;', '  /* after */', '  margin: 0;', '}', '', '/*end*/'));
  assert.equal(css('a{\n  /*\n   * two\n   * lines\n   */\n  b:c\n}'), lines('a {', '  /*', '   * two', '   * lines', '   */', '  b: c;', '}'));
});

test('scss and less: // comments, nesting, variables, interpolation and mixins', () => {
  const scss = '$a:1px;// the size\n.a{ &:hover{color:RED!important} .b{x:y} #{$sel}-c{d:e} @include m($p, $q){f:g} }\n// last';
  assert.equal(css(scss, 'a.scss'), lines('$a: 1px;', '// the size', '.a {', '  &:hover {', '    color: RED !important;', '  }', '  .b {', '    x: y;', '  }', '  #{$sel}-c {', '    d: e;', '  }',
    '  @include m($p, $q) {', '    f: g;', '  }', '}', '', '// last'));
  const less = '@c:#fff;.m(@a;@b){x:@a}.n{.m(1;2);color:@c;url:~"http://x/y"}';
  assert.equal(css(less, 'a.less'), lines('@c: #fff;', '', '.m(@a;@b) {', '  x: @a;', '}', '', '.n {', '  .m(1;2);', '  color: @c;', '  url: ~"http://x/y";', '}'));
  assert.equal(css('a{b:url(http://x.test/y.png)}', 'a.scss'), lines('a {', '  b: url(http://x.test/y.png);', '}'), 'a // inside url(...) is not a comment');
  assert.equal(css('a{b:c}\n// not a comment here', 'a.css').includes('// not'), true);
});

test('css: odd input does not fail: unbalanced braces, an unterminated string or comment, no braces at all', () => {
  assert.equal(css('a{b:c}}d{e:f'), lines('a {', '  b: c;', '}', '', '}', '', 'd {', '  e: f;'));
  assert.equal(css('a{content:"x'), lines('a {', '  content: "x;'));
  assert.equal(css('a{b:c} /* never ends'), lines('a {', '  b: c;', '}', '', '/* never ends'));
  assert.equal(css('color:red'), 'color: red;');
  assert.equal(css(''), '');
  assert.equal(css('   \n  '), '');
  assert.equal(css('a{b:(c;d)}'), lines('a {', '  b: (c;d);', '}'));
});

test('css: a 1 MB stylesheet is formatted in under 2 seconds', () => {
  const rule = '.a-b > c:hover,d{color:red;margin:0 auto;background:url(data:x;y);content:"a;{"}';
  const src = rule.repeat(Math.ceil(1000000 / rule.length));
  const t0 = performance.now();
  const r = formatForView(src, 'css', 'big.css');
  assert.ok(performance.now() - t0 < 2000, 'took ' + (performance.now() - t0));
  assert.equal(r.ok, true);
  assert.ok(r.text.startsWith('.a-b > c:hover,\nd {\n  color: red;'));
});
