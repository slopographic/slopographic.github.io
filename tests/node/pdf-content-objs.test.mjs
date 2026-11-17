// The objects of a page's content stream (pdf/js/core/content-objs.js) and the rewrites that move, resize, rotate, reorder,
// duplicate, replace and delete them (pdf/js/core/content-move.js): images with their matrix, inline images, forms, nested
// q/Q, marked-content and clipped vector groups; every operator a rewrite does not name stays byte for byte.
// Run with: node --test tests/node/pdf-content-objs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lx = require('../../pdf/js/core/content-lex.js');
const Ob = require('../../pdf/js/core/content-objs.js');
const Mv = require('../../pdf/js/core/content-move.js');

const INFO = { Im1: { kind: 'image', w: 40, h: 20 }, Im2: { kind: 'image', w: 10, h: 10 }, Fm1: { kind: 'form', bbox: [0, 0, 50, 30], matrix: [1, 0, 0, 1, 5, 5] } };
const info = (n) => INFO[n] || null;
const objs = (src, opts) => Ob.objects(src, Lx.lex(src), info, opts);
const r2 = (b) => b.map((v) => Math.round(v * 100) / 100);

// a pdf-lib style picture, a bare one under a shared matrix, an inline image, a form, a marked vector group and a clip group
const PAGE = [
  '0.9 g 0 0 612 792 re f',
  'q 1 0 0 1 100 500 cm 200 0 0 100 0 0 cm /Im1 Do Q',
  'q 2 0 0 2 0 0 cm 30 0 0 30 10 10 cm /Im2 Do 0 0 1 rg 0 0 5 5 re f Q',
  'q 20 0 0 10 300 300 cm BI /W 4 /H 2 /CS /G /BPC 8 ID \x01\x02\x03\x04\x05\x06\x07\x08 EI Q',
  'q 1 0 0 1 400 100 cm /Fm1 Do Q',
  '/OC /L1 BDC q 1 0 0 RG 2 w 50 50 m 150 80 l S Q EMC',
  'q 10 600 100 100 re W n 0 1 0 rg 0 600 200 200 re f Q',
  'BT /F1 12 Tf 72 72 Td (Hello) Tj ET',
].join('\n');

test('finds images with their matrix, an inline image, a form, and vector groups, in paint order', () => {
  const list = objs(PAGE, { page: [0, 0, 612, 792] });
  assert.deepEqual(list.map((o) => o.kind), ['image', 'image', 'inline', 'form', 'vector', 'vector']);
  const [a, b, c, f, v, clip] = list;
  assert.deepEqual(r2(a.box), [100, 500, 300, 600]);
  assert.deepEqual(a.ctm, [200, 0, 0, 100, 100, 500]);
  assert.ok(a.wrap, 'pdf-lib\'s q … cm … Do Q is its wrapper');
  assert.equal(a.w, 40);
  assert.deepEqual(r2(b.box), [20, 20, 80, 80], 'nested matrices: 30×30 at 10,10 inside a 2× scale');
  assert.equal(b.wrap, null, 'a bare Do (other painting in its q … Q) has no wrapper');
  assert.deepEqual([c.w, c.h, c.filter], [4, 2, '']);
  assert.deepEqual(r2(c.box), [300, 300, 320, 310]);
  assert.deepEqual(r2(f.box), [405, 105, 455, 135], 'a form: its BBox through its Matrix and the CTM');
  assert.equal(v.oc, 'L1');
  assert.deepEqual(r2(v.box), [50, 50, 150, 80]);
  assert.equal(clip.group, 'clip');
  assert.equal(list.some((o) => o.kind === 'vector' && o.box[2] >= 612), false, 'the page background is not an object');
});

test('the CTM is restored by Q: an image after a q … Q block is placed in the outer space', () => {
  const src = 'q 1 0 0 1 50 50 cm q 3 0 0 3 0 0 cm Q 10 0 0 10 0 0 cm /Im2 Do Q';
  const [o] = objs(src);
  assert.deepEqual(r2(o.box), [50, 50, 60, 60]);
});

/** The text outside the object's span, which a placement rewrite leaves alone. */
const outside = (src, o) => { const ops = Lx.lex(src), sp = Mv.span(ops, o); return [src.slice(0, sp.s), src.slice(sp.e)]; };

test('moving an image folds the move into its wrapper\'s first cm; the rest of the stream is byte-identical', () => {
  const ops = Lx.lex(PAGE), o = Ob.objects(PAGE, ops, info)[0];
  const out = Mv.transform(PAGE, ops, o, Mv.move(25, -40));
  const [pre, post] = outside(PAGE, o), o2 = objs(out)[0];
  assert.ok(out.startsWith(pre) && out.endsWith(post));
  assert.deepEqual(r2(o2.box), [125, 460, 325, 560]);
  assert.match(out, /q 1 0 0 1 125 460 cm 200 0 0 100 0 0 cm \/Im1 Do Q/);
});

test('scale about the centre and rotate about the centre keep the centre; Shift-style uniform scale keeps the aspect', () => {
  const ops = Lx.lex(PAGE), o = Ob.objects(PAGE, ops, info)[0];
  const s = objs(Mv.transform(PAGE, ops, o, Mv.scaleAbout(0.5, 0.5, 200, 550)))[0];
  assert.deepEqual(r2(s.box), [150, 525, 250, 575]);
  const r = objs(Mv.transform(PAGE, ops, o, Mv.rotateAbout(90, 200, 550)))[0];
  assert.deepEqual(r2(r.box), [150, 450, 250, 650], 'a quarter turn: 100 wide, 200 tall, same centre');
  assert.deepEqual(r2(r.quad[0]), [250, 450], 'the image\'s origin corner turned counter-clockwise about the centre');
});

test('a bare image is wrapped in q X cm … Q in its own space; the shared matrix around it stays', () => {
  const ops = Lx.lex(PAGE), b = Ob.objects(PAGE, ops, info)[1];
  const out = Mv.transform(PAGE, ops, b, Mv.move(10, 0));
  const nb = objs(out)[1];
  assert.deepEqual(r2(nb.box), [30, 20, 90, 80]);
  assert.match(out, /q 2 0 0 2 0 0 cm 30 0 0 30 10 10 cm q 1 0 0 1 0.1666666667 0 cm \/Im2 Do Q 0 0 1 rg/, 'X is in the image\'s own 60 pt space: 10 pt = 1/6');
  const [pre, post] = outside(PAGE, b);
  assert.ok(out.startsWith(pre) && out.endsWith(post));
});

test('a second move of a wrapped object keeps one wrapper', () => {
  let src = PAGE;
  for (let i = 0; i < 3; i++) { const ops = Lx.lex(src); src = Mv.transform(src, ops, Ob.objects(src, ops, info)[1], Mv.move(10, 0)); }
  assert.equal(src.split('/Im2 Do').length, 2);
  assert.equal((src.match(/ Q/g) || []).length, (PAGE.match(/ Q/g) || []).length + 1, 'one q … Q added, then reused');
  assert.deepEqual(r2(objs(src)[1].box), [50, 20, 110, 80]);
});

test('inline images, forms and vector groups move too', () => {
  for (const k of [2, 3, 4]) {
    const ops = Lx.lex(PAGE), o = Ob.objects(PAGE, ops, info)[k];
    const o2 = objs(Mv.transform(PAGE, ops, o, Mv.move(7, 9)))[k];
    assert.deepEqual(r2(o2.box), r2([o.box[0] + 7, o.box[1] + 9, o.box[2] + 7, o.box[3] + 9]), o.kind);
  }
});

test('delete takes the object and its wrapper out, and nothing else', () => {
  const ops = Lx.lex(PAGE), o = Ob.objects(PAGE, ops, info)[0];
  const out = Mv.remove(PAGE, ops, o);
  assert.equal(out, PAGE.replace('q 1 0 0 1 100 500 cm 200 0 0 100 0 0 cm /Im1 Do Q', ''));
  assert.deepEqual(objs(out).map((x) => x.kind), ['image', 'inline', 'form', 'vector', 'vector']);
});

test('duplicate adds a moved copy on top of the original', () => {
  const ops = Lx.lex(PAGE), o = Ob.objects(PAGE, ops, info)[0];
  const l = objs(Mv.duplicate(PAGE, ops, o, Mv.move(10, -10)));
  assert.equal(l.filter((x) => x.name === 'Im1').length, 2);
  assert.deepEqual(r2(l[1].box), [110, 490, 310, 590]);
});

test('bring forward, to front, backward and to back reorder the paint and keep the place', () => {
  const ops = Lx.lex(PAGE), list = Ob.objects(PAGE, ops, info), o = list[0];
  const fwd = objs(Mv.order(PAGE, ops, list, o, 'forward'));
  assert.deepEqual(fwd.slice(0, 2).map((x) => x.name), ['Im2', 'Im1']);
  assert.deepEqual(r2(fwd[1].box), [100, 500, 300, 600]);
  const front = objs(Mv.order(PAGE, ops, list, o, 'front'));
  assert.equal(front[front.length - 1].name, 'Im1');
  assert.deepEqual(r2(front[front.length - 1].box), [100, 500, 300, 600]);
  assert.equal(Mv.order(PAGE, ops, list, o, 'back'), null, 'already at the back');
  const b = list[1], back = objs(Mv.order(PAGE, ops, list, b, 'back'));
  assert.equal(back[0].name, 'Im2');
  assert.deepEqual(r2(back[0].box), [20, 20, 80, 80], 'the 2× matrix it was under is carried along as X');
});

test('replace paints the new image in the old box, fitted to its aspect and centred', () => {
  const ops = Lx.lex(PAGE), o = Ob.objects(PAGE, ops, info)[0];
  const out = Mv.replace(PAGE, ops, o, 'SlopImg1', 1);
  INFO.SlopImg1 = { kind: 'image', w: 50, h: 50 };
  const n = objs(out)[0];
  assert.equal(n.name, 'SlopImg1');
  assert.deepEqual(r2(n.box), [150, 500, 250, 600], 'a square picture in a 200 × 100 box: 100 × 100 in the middle');
  const same = Mv.replace(PAGE, ops, o, 'SlopImg1', 2);
  assert.equal(same, PAGE.replace('/Im1 Do', '/SlopImg1 Do'), 'the same aspect: only the name changes');
  const inl = Ob.objects(PAGE, ops, info)[2];
  assert.ok(!/BI/.test(Mv.replace(PAGE, ops, inl, 'SlopImg1', 2)), 'an inline image becomes an XObject');
});

test('stripMarked drops a layer\'s marked content, nested sequences included, and leaves the rest', () => {
  const src = 'q 1 g /OC /A BDC 0 0 5 5 re f /P <</MCID 1>> BDC 1 1 m 2 2 l S EMC EMC /OC /B BDC 9 9 m 8 8 l S EMC Q';
  const out = Mv.stripMarked(src, Lx.lex(src), ['A']);
  assert.equal(out, 'q 1 g  /OC /B BDC 9 9 m 8 8 l S EMC Q');
  assert.equal(Mv.stripMarked(src, Lx.lex(src), ['Z']), null);
});

test('fitIn and the matrix helpers', () => {
  assert.deepEqual(Mv.fitIn([200, 0, 0, 100, 0, 0], 4).map((v) => +v.toFixed(3)), [1, 0, 0, 0.5, 0, 0.25]);
  const T = Ob.mul(Mv.move(5, 5), Ob.inv(Mv.move(5, 5)));
  assert.deepEqual(T.map((v) => +v.toFixed(6) + 0), [1, 0, 0, 1, 0, 0]);
  assert.equal(Mv.mat([1, 0, 0, 1, 0.123456, -0]), '1 0 0 1 0.123456 0');
});

const Sv = require('../../pdf/js/core/content-svg.js');
test('content-svg: paths in their colours, clipping, forms in place and images through the callback', () => {
  const src = 'q 1 0 0 rg 10 10 100 50 re f Q q 0 0 1 RG 3 w 0 0 m 100 100 l S Q q 0 0 20 20 re W n 0 1 0 rg 0 0 50 50 re f* Q /Fm1 Do q 10 0 0 10 5 5 cm /Im1 Do Q';
  const fm = Lx.lex('0.5 g 0 0 m 1 0 l 1 1 l h f');
  const svg = Sv.toSVG(Lx.lex(src), { box: [0, 0, 200, 100], form: (n) => (n === 'Fm1' ? { ops: fm, matrix: [2, 0, 0, 2, 150, 0] } : null),
    image: (n, m) => (n === 'Im1' ? { href: 'data:image/png;base64,AA', w: 1, h: 1, m } : null) });
  assert.match(svg, /width="200pt" height="100pt"/);
  assert.match(svg, /<path d="M10 10 L110 10 L110 60 L10 60 Z" fill="#ff0000"\/>/);
  assert.match(svg, /stroke="#0000ff" stroke-width="3"/);
  assert.match(svg, /<clipPath id="c1"><path d="M0 0 L20 0 L20 20 L0 20 Z"\/><\/clipPath>/);
  assert.match(svg, /fill="#00ff00" fill-rule="evenodd" clip-path="url\(#c1\)"/);
  assert.match(svg, /<path d="M150 0 L152 0 L152 2 Z" fill="#808080"\/>/, 'the form drawn through its matrix');
  assert.match(svg, /<image href="data:image\/png;base64,AA"[^>]*transform="matrix\(10 0 0 10 5 5\) matrix\(1 0 0 -1 0 1\)"/);
  assert.match(svg, /<g transform="matrix\(1 0 0 -1 0 100\)">/);
  assert.equal(Sv.rgb([0, 0, 0, 1]), '#000000');
  assert.equal(Sv.rgb([0.5]), '#808080');
});
