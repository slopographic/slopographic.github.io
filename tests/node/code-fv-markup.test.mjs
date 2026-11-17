// Covers: code/js/fv-markup.js
// Covers: code/js/fv-markup-lex.js
// The Formatted view, XML and HTML. Run with: node --test tests/node/code-fv-markup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForView } from '../../code/js/formatview.js';

const xml = (text) => formatForView(text, 'text', 'a.xml');
const html = (text) => formatForView(text, 'html', 'a.html');
const lines = (...l) => l.join('\n');
const good = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.text; };

// ---- XML ----

test('xml: a normal document is indented, and an element with only text stays on one line', () => {
  const src = '<?xml version="1.0" encoding="UTF-8"?>\n<catalog><book id="1"><title>Dune</title><price currency="USD">9.99</price></book><book id="2"><title>Emma</title><price>5</price></book></catalog>';
  assert.equal(good(xml(src)), lines('<?xml version="1.0" encoding="UTF-8"?>', '<catalog>', '  <book id="1">', '    <title>Dune</title>', '    <price currency="USD">9.99</price>',
    '  </book>', '  <book id="2">', '    <title>Emma</title>', '    <price>5</price>', '  </book>', '</catalog>'));
});

test('xml: messy input is tidied (attribute spacing, white space between and inside text)', () => {
  const src = '<root>\n\n   <a   x = "1"\n   y=\'2\' >\n\n  text   with \n  spaces \n </a>\n<b/><c />\n  <d>  </d>\n</root>';
  assert.equal(good(xml(src)), lines('<root>', `  <a x="1" y='2'>text with spaces</a>`, '  <b/>', '  <c />', '  <d></d>', '</root>'));
  assert.equal(good(xml(good(xml(src)))), good(xml(src)), 'formatting twice changes nothing');
});

test('xml: comments, CDATA, processing instructions, doctype, namespaces and entities are kept as written', () => {
  const src = '<!DOCTYPE note [<!ENTITY e "x>y">]><n:note xmlns:n="urn:a"><!-- a < b\n  and > c --><![CDATA[ if (a < b && c > d) ]]><?pi do it?><t>a &amp; b &lt; c</t><u attr="a>b"/></n:note>';
  const out = good(xml(src));
  assert.equal(out, lines('<!DOCTYPE note [<!ENTITY e "x>y">]>', '<n:note xmlns:n="urn:a">', '  <!-- a < b\n  and > c -->', '  <![CDATA[ if (a < b && c > d) ]]>', '  <?pi do it?>',
    '  <t>a &amp; b &lt; c</t>', '  <u attr="a>b"/>', '</n:note>'));
});

test('xml: an element that holds only text and inline elements stays on one line when it is short', () => {
  assert.equal(good(xml('<p>Hello <b>big</b> world, <a href="x">click <i>here</i></a>!</p>')), '<p>Hello <b>big</b> world, <a href="x">click <i>here</i></a>!</p>');
  assert.equal(good(xml('<p>Hello <x>big</x></p>')), lines('<p>', '  Hello', '  <x>big</x>', '</p>'));
  assert.equal(good(xml('<d><span>a</span><span>b</span></d>')), '<d><span>a</span><span>b</span></d>');
  const long = 'word '.repeat(30).trim();
  assert.equal(good(xml(`<p>${long}</p>`)), lines('<p>', '  ' + long, '</p>'));
  assert.equal(good(xml('<p>a<!-- c -->b</p>')), lines('<p>', '  a', '  <!-- c -->', '  b', '</p>'));
});

test('xml: svg style and script content is kept verbatim, case-sensitive names are respected', () => {
  const src = '<svg xmlns="http://www.w3.org/2000/svg"><style>\n  .a { fill: red }\n    .b{x:y}\n</style><Path d="M0 0"/><g><script>if (a < b) { c(); }</script></g></svg>';
  assert.equal(good(xml(src)), lines('<svg xmlns="http://www.w3.org/2000/svg">', '  <style>\n  .a { fill: red }\n    .b{x:y}\n</style>', '  <Path d="M0 0"/>', '  <g>', '    <script>if (a < b) { c(); }</script>', '  </g>', '</svg>'));
});

test('xml: a start tag longer than 100 characters puts each attribute on its own line', () => {
  const attrs = ['id="first-identifier"', 'class="a-long-class-name another-class"', 'data-value="1234567890123456789"', 'title="a title that is long enough"'];
  const tag = '<item ' + attrs.join(' ') + '>';
  assert.ok(tag.length > 100);
  assert.equal(good(xml(`<r>${tag}x</item></r>`)), lines('<r>', '  <item', ...attrs.map((a, i) => '    ' + a + (i === attrs.length - 1 ? '>' : '')), '    x', '  </item>', '</r>'));
  const exact = '<item a="' + 'x'.repeat(100 - 11) + '">';
  assert.equal(exact.length, 100);
  assert.equal(good(xml(exact + '</item>')).split('\n').length, 2, 'exactly 100 characters: the attribute is on the tag line');
  assert.equal(good(xml('<item a="' + 'x'.repeat(100 - 10) + '"></item>')), lines('<item', '  a="' + 'x'.repeat(90) + '">', '</item>'), '101 characters: broken');
});

test('xml: a mismatched end tag is an error with its line and column', () => {
  const r = xml('<a>\n  <b>\n  </a>\n</b>');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'xml');
  assert.deepEqual([r.line, r.col], [3, 3]);
  assert.equal(r.key, 'code.fv.err.mismatched_end');
  assert.deepEqual(r.args, { found: 'a', expected: 'b' });
  assert.match(r.error, /<\/a>.*<\/b>/);
  assert.deepEqual([xml('<a><b></a>').line, xml('<a><b></a>').col], [1, 7]);
});

test('xml: an end tag with nothing open, a missing end tag and a broken tag are errors', () => {
  let r = xml('<a></a>\n</a>');
  assert.deepEqual([r.ok, r.key, r.line, r.col], [false, 'code.fv.err.unexpected_end_tag', 2, 1]);
  r = xml('<a>\n<b>\n<c></c>\n</b>');
  assert.deepEqual([r.ok, r.key, r.line, r.col], [false, 'code.fv.err.missing_end_tag', 1, 1]);
  assert.deepEqual(r.args, { name: 'a' });
  r = xml('<a>\n  <b href="x');
  assert.deepEqual([r.ok, r.key, r.line, r.col], [false, 'code.fv.err.open_start_tag', 2, 3]);
  r = xml('<a></a');
  assert.deepEqual([r.ok, r.key, r.line, r.col], [false, 'code.fv.err.open_end_tag', 1, 4]);
  assert.equal(xml('<br>').ok, false, 'xml has no void elements');
  assert.equal(xml('<A></a>').ok, false, 'xml names are case-sensitive');
});

test('xml: fragments, plain text, an unterminated comment and a stray < are tolerated', () => {
  assert.equal(good(xml('hello')), 'hello');
  assert.equal(good(xml('<a/><b/>')), lines('<a/>', '<b/>'));
  assert.equal(good(xml('')), '');
  assert.equal(good(xml('<a>1 < 2</a>')), '<a>1 < 2</a>');
  assert.equal(html('<a><!-- never closed').ok, true, 'html tolerates an unterminated comment');
  assert.equal(good(html('<!-- never closed')), '<!-- never closed');
  assert.equal(xml('<a><!-- never closed').key, 'code.fv.err.missing_end_tag', 'xml: the comment ate the end tag');
});

// ---- HTML ----

test('html: a normal page is indented', () => {
  const src = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Hi there</title><link rel="stylesheet" href="a.css"></head><body><h1>Title</h1><p>Some <a href="/x">link</a> and <b>bold</b>.</p><ul><li>One</li><li>Two</li></ul></body></html>';
  assert.equal(good(html(src)), lines('<!DOCTYPE html>', '<html lang="en">', '  <head>', '    <meta charset="utf-8">', '    <title>Hi there</title>', '    <link rel="stylesheet" href="a.css">', '  </head>',
    '  <body>', '    <h1>Title</h1>', '    <p>Some <a href="/x">link</a> and <b>bold</b>.</p>', '    <ul>', '      <li>One</li>', '      <li>Two</li>', '    </ul>', '  </body>', '</html>'));
});

test('html: void elements have no end tag, and the way they are written is kept', () => {
  const src = '<div><br><img src="a.png" alt=""><input type=text disabled><hr/><wbr><meta charset=utf-8><link rel=x><source src=a><area><base><col><embed><param><track></div>';
  assert.equal(good(html(src)), lines('<div>', '  <br>', '  <img src="a.png" alt="">', '  <input type=text disabled>', '  <hr/>', '  <wbr>', '  <meta charset=utf-8>', '  <link rel=x>',
    '  <source src=a>', '  <area>', '  <base>', '  <col>', '  <embed>', '  <param>', '  <track>', '</div>'));
});

test('html: pre, textarea, script and style keep their content exactly', () => {
  const pre = '<pre>  a\n    <b>b</b>   c\n</pre>';
  const area = '<textarea name=t>\n  line 1\n\n  line 3  </textarea>';
  const script = '<script>\n  if (a < b && c > d) { go("</p>"); }\n</script>';
  const style = '<style>\n  a > b { color : red }\n</style>';
  const out = good(html(`<div><p>x</p>${pre}${area}${script}${style}<script src="a.js"></script><script>   </script></div>`));
  assert.equal(out, lines('<div>', '  <p>x</p>', '  ' + pre, '  ' + area, '  ' + script, '  ' + style, '  <script src="a.js"></script>', '  <script></script>', '</div>'));
  assert.equal(good(html('<PRE>A</Pre><Script>x</SCRIPT>')), lines('<PRE>A</PRE>', '<Script>x</Script>'));
});

test('html: an element with only text and inline elements stays on one line when short, and breaks when long', () => {
  assert.equal(good(html('<div><span>a</span> <span>b</span></div>')), '<div><span>a</span> <span>b</span></div>');
  assert.equal(good(html('<p>  Text   with\n  <code>code</code>, <em>em</em>, <strong>s</strong>, <small>s</small>, <sub>1</sub><sup>2</sup> <label>l</label> <abbr>a</abbr> <mark>m</mark> <kbd>k</kbd> <time>t</time> </p>')),
    lines('<p>', '  Text with <code>code</code>, <em>em</em>, <strong>s</strong>, <small>s</small>, <sub>1</sub><sup>2</sup> <label>l</label> <abbr>a</abbr> <mark>m</mark> <kbd>k</kbd> <time>t</time>', '</p>'));
  assert.equal(good(html('<p>Hi <b>x</b></p>')), '<p>Hi <b>x</b></p>');
  assert.equal(good(html('<h1>Title</h1>')), '<h1>Title</h1>');
  assert.equal(good(html('<p>' + 'word '.repeat(30).trim() + '</p>')), lines('<p>', '  ' + 'word '.repeat(30).trim(), '</p>'));
  assert.equal(good(html('<div><p>a</p></div>')), lines('<div>', '  <p>a</p>', '</div>'));
  assert.equal(good(html('<p>a<br>b</p>')), lines('<p>', '  a', '  <br>', '  b', '</p>'));
  assert.equal(good(html('<div></div>')), '<div></div>');
});

test('html: a start tag longer than 100 characters puts each attribute on its own line', () => {
  const src = '<a href="https://example.test/a/very/long/path/that/goes/on" class="button button-primary button-large" data-track="click-event" target="_blank">Go</a>';
  assert.equal(good(html(src)), lines('<a', '  href="https://example.test/a/very/long/path/that/goes/on"', '  class="button button-primary button-large"', '  data-track="click-event"', '  target="_blank">', '  Go', '</a>'));
  assert.equal(good(html('<a href="x" class="y">Go</a>')), '<a href="x" class="y">Go</a>');
});

test('html: unbalanced tags are tolerated', () => {
  assert.equal(good(html('<div><p>one<p>two</div></span>')), lines('<div>', '  <p>one', '  <p>two', '</div>', '</span>'));
  assert.equal(good(html('<ul><li>a<li>b<ul><li>c</ul><li>d</ul>')), lines('<ul>', '  <li>a', '  <li>', '    b', '    <ul>', '      <li>c', '    </ul>', '  <li>d', '</ul>'));
  assert.equal(good(html('<table><tr><td>1<td>2<tr><td>3</table>')), lines('<table>', '  <tr>', '    <td>1', '    <td>2', '  <tr>', '    <td>3', '</table>'));
  assert.equal(good(html('<div><span>x')), '<div><span>x');
  assert.equal(good(html('<div><p>x<div>y')), lines('<div>', '  <p>', '    x', '    <div>y'));
  assert.equal(good(html('<b>bold <i>both</b> italic</i>')), lines('<b>bold <i>both</b> italic', '</i>'));
  assert.equal(html('<div>').ok, true);
  assert.equal(html('</div></p>').ok, true);
});

test('html: names are case-insensitive, attributes may be bare or unquoted, and a < in text is text', () => {
  assert.equal(good(html('<DIV CLASS=a ID="b" hidden>1 < 2 &amp; 3 <3</DIV>')), '<DIV CLASS=a ID="b" hidden>1 < 2 &amp; 3 <3</DIV>');
  assert.equal(good(html('a <b>c</b> < d')), 'a <b>c</b> < d');
  assert.equal(good(html('<p title=\'a "q" b\' data-x = "1">x</p>')), '<p title=\'a "q" b\' data-x="1">x</p>');
  assert.equal(good(html('<svg viewBox="0 0 1 1"><path d="M0"/><circle r="1" /></svg>')), lines('<svg viewBox="0 0 1 1">', '  <path d="M0"/>', '  <circle r="1" />', '</svg>'));
});

test('html: comments, conditional comments and doctype are kept', () => {
  const src = '<!doctype html><!-- top --><div><!--[if IE]><p>old</p><![endif]--><!--\n  two\n  lines\n--></div>';
  assert.equal(good(html(src)), lines('<!doctype html>', '<!-- top -->', '<div>', '  <!--[if IE]><p>old</p><![endif]-->', '  <!--\n  two\n  lines\n-->', '</div>'));
});

test('html: minified and messy markup gives the same result as tidy markup', () => {
  const tidy = good(html('<section>\n  <h2>Head</h2>\n  <p>Para <b>x</b></p>\n</section>'));
  assert.equal(good(html('<section><h2>Head</h2><p>Para <b>x</b></p></section>')), tidy);
  assert.equal(good(html('  <section>   <h2>  Head  </h2>\n\n\n<p>\n Para   <b>x</b>\n</p>   </section>  ')), tidy);
  assert.equal(good(html(tidy)), tidy);
});

test('html: a 1 MB page is formatted in under 2 seconds, and deep nesting is refused, not a crash', () => {
  const src = '<div class="x"><p>Hello <b>w</b> there</p><br><ul><li>a<li>b</ul></div>'.repeat(14000);
  const t0 = performance.now();
  const r = html(src);
  assert.ok(performance.now() - t0 < 2000, 'took ' + (performance.now() - t0));
  assert.equal(r.ok, true);
  const x = xml('<r>' + '<item id="1"><name>A b</name></item>'.repeat(27000) + '</r>');
  assert.equal(x.ok, true);
  const deep = html('<div>'.repeat(100000));
  assert.equal(deep.ok, false);
  assert.equal(deep.key, 'code.fv.err.too_deep');
});
