// Covers: code/js/fv-js.js
// The Formatted view, JavaScript and TypeScript. Run with: node --test tests/node/code-fv-js.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForView } from '../../code/js/formatview.js';
import { splitLongLines } from '../../code/js/fv-js.js';
import { formatText } from '../../code/js/format.js';

const js = (text, lang = 'javascript') => { const r = formatForView(text, lang, 'a.js'); assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };
const lines = (...l) => l.join('\n');
const pad200 = 'var pad="' + 'p'.repeat(200) + '";';   // makes a line longer than 200 characters

test('js: a source with ordinary lines is indented by format.js and nothing else changes', () => {
  const src = 'function a(x){\nif (x) {\n    return [1,2];\n  }\n\n\n  // note ; { }\nreturn `a\n  ${x}`;   \n}\n';
  assert.equal(js(src), formatText(src, 'javascript').replace(/\n$/, ''));
  assert.equal(js(src), lines('function a(x){', '  if (x) {', '    return [1,2];', '  }', '', '  // note ; { }', '  return `a', '  ${x}`;   ', '}'), 'format.js keeps a line that starts inside a template literal exactly as it is');
  assert.equal(js('if(a){b();}else{c()}'), 'if(a){b();}else{c()}', 'a short one-line source is not split');
  assert.equal(js('const a = 1;\r\nconst b = 2;'), 'const a = 1;\nconst b = 2;');
  assert.equal(js(''), '');
});

test('js: a minified line longer than 200 characters is split at ; { and } and then indented', () => {
  const src = pad200 + 'function f(a,b){var s=a+b;if(s>10){return s}else{return 0}}var o={x:1,y:2};for(var i=0;i<3;i++){g(i)}';
  assert.equal(js(src), lines(pad200, 'function f(a,b){', '  var s=a+b;', '  if(s>10){', '    return s', '  }else{', '    return 0', '  }', '}', 'var o={', '  x:1,y:2', '};',
    'for(var i=0;i<3;i++){', '  g(i)', '}'));
});

test('js: a ; inside for(;;), a string, a template, a regular expression or a comment is never a split point, and the text is never changed', () => {
  const lits = ['"a;b{c}d"', "'}{;'", '`t;${"}"}{`', '`n;${`;{${1}`}}`', '/[;{}/]+;/g', '/* ; { } */', '"\\";{"', '`a\\`;{`'];
  const src = pad200 + 'var a=' + lits[0] + ',b=' + lits[1] + ';var c=' + lits[2] + ';var d=' + lits[3] + ';var e=' + lits[4] + ';' + lits[5] + 'var f=' + lits[6] + ';var g=' + lits[7] + ';for(var i=0;i<3;i++){x()}//;{}\ny();';
  const out = js(src);
  for (const lit of lits) assert.ok(out.includes(lit), lit + '\n' + out);
  assert.ok(out.includes('for(var i=0;i<3;i++){'));
  assert.ok(out.includes('//;{}'));
  assert.equal(splitLongLines(src).replace(/\n/g, ''), src.replace(/\n/g, ''), 'only line breaks are added');
});

test('js: a division is not a regular expression, a regular expression after return or = is', () => {
  const src = pad200 + 'var a=b/c;var d=e/f;if(x){y=a/b/c;z=(p)/2;return /;{/.test(s)}else{w=/}/.exec(q)}';
  const out = splitLongLines(src);
  assert.ok(out.includes('var a=b/c;\n'), out);
  assert.ok(out.includes('y=a/b/c;\n'));
  assert.ok(out.includes('z=(p)/2;\n'));
  assert.ok(out.includes('return /;{/.test(s)\n'));
  assert.ok(out.includes('w=/}/.exec(q)\n'));
});

test('js: only long lines are split, in a mixed file', () => {
  const src = 'var short=1;{a();b()}\n' + pad200 + 'x();y();\nvar tail=2;{c();d()}';
  assert.equal(splitLongLines(src), 'var short=1;{a();b()}\n' + pad200 + '\nx();\ny();\nvar tail=2;{c();d()}');
});

test('js: a long line inside a template literal or after a multi-line comment is handled by line', () => {
  const src = 'var t=`first\n' + 'x;y;{}'.repeat(60) + '\nlast`;var u=1;\n/* a\n b */' + 'a();'.repeat(60);
  const out = splitLongLines(src);
  assert.ok(out.includes('x;y;{}'.repeat(60)), 'the template text is not split');
  assert.ok(out.endsWith('a();\n'.repeat(59) + 'a();'));
});

test('js: typescript is split the same way', () => {
  const src = pad200 + 'interface A{x:number;y:string}type B={a:1};class C{private n:number=1;get v(){return this.n}}enum E{A,B}';
  assert.equal(js(src, 'typescript'), lines(pad200, 'interface A{', '  x:number;', '  y:string', '}', 'type B={', '  a:1', '};', 'class C{', '  private n:number=1;', '  get v(){', '    return this.n', '  }', '}', 'enum E{', '  A,B', '}'));
});

test('js: odd input does not fail: unterminated string, template, comment or regular expression, many braces', () => {
  for (const tail of ['var s="abc', "var s='abc", 'var t=`abc', '/* abc', 'var r=/abc', '{{{{{{{{{{', '}}}}}}}}}}', '((((((', '\\']) {
    const r = formatForView(pad200 + tail + ';{}'.repeat(100), 'javascript', 'a.js');
    assert.equal(r.ok, true, tail);
  }
});

test('js: a 1 MB minified source is split and indented in under 2 seconds', () => {
  const unit = 'function f(a){if(a){return "x;y"}else{for(var i=0;i<3;i++){g(i)}}};';
  const src = unit.repeat(Math.ceil(1000000 / unit.length));
  const t0 = performance.now();
  const r = formatForView(src, 'javascript', 'big.min.js');
  assert.ok(performance.now() - t0 < 2000, 'took ' + (performance.now() - t0));
  assert.equal(r.ok, true);
  assert.ok(r.text.startsWith('function f(a){\n  if(a){\n    return "x;y"\n  }else{'));
});
