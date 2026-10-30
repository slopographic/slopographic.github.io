// Slop Slides: PowerPoint import (slides/js/io/pptx-in*.js) run in Node. Two packages: one written by the app's own
// exporter (slides/js/io/pptx.js), read back into the deck model, and a hand-built one (slides-pptx-fixture.mjs) with a
// theme, master text styles, placeholders, notes, a picture, a table, a chart and a group.
// Covers: slides/js/io/pptx-in-style.js, slides/js/io/pptx-in-text.js, slides/js/io/pptx-in-shape.js, slides/js/io/pptx-in.js, slides/js/io/pptx.js
// Run: node --test tests/node/slides-pptx-in.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSlides, CORE, PPTX, officeLib } from './slides-env.mjs';
import { fixtureEntries, PNG_B64 } from './slides-pptx-fixture.mjs';

const SS = loadSlides(CORE.concat(PPTX));
const lib = await officeLib();
const near = (a, b, d = 0.05) => assert.ok(Math.abs(a - b) <= d, `${a} is not within ${d} of ${b}`);
const plain = (o) => SS.objects.plain(o.text);
const PNG = 'data:image/png;base64,' + PNG_B64;

async function roundTrip(deck) {
  const r = await SS.pptx.write(deck);
  return SS.pptxIn.fromFiles(await lib.readZip(r.blob), lib, { name: 'Round trip.pptx' });
}

test('a deck written by the app comes back with its slides, text, shapes and picture', async () => {
  const d = SS.model.newDeck({ theme: 'paper', title: 'Round' });
  d.slides[0].objects[0].text.paras[0].runs[0].t = 'Quarterly review';
  const s2 = SS.model.addSlide(d, 'title-content');
  s2.objects[0].text.paras[0].runs[0].t = 'Points';
  s2.objects[1].text.paras = [{ runs: [{ t: 'First ' }, { t: 'bold', b: true }, { t: ' and big', size: 40 }], bullet: 'disc' }, { runs: [{ t: 'Second', color: 'accent2', i: true }], bullet: 'disc', level: 1 }];
  s2.objects.push(SS.objects.make('shape', { shape: 'ellipse', x: 600, y: 300, w: 120, h: 80, fill: { type: 'solid', color: 'accent2' }, stroke: { color: '#112233', width: 2 } }));
  s2.objects.push(SS.objects.make('shape', { shape: 'roundRect', radius: 0.2, x: 40, y: 40, w: 100, h: 50, rot: 30 }));
  s2.objects.push(SS.objects.make('shape', { shape: 'arrowLine', x: 100, y: 450, w: 300, h: 40 }));
  s2.objects.push(SS.objects.make('image', { x: 700, y: 20, w: 200, h: 100, media: SS.model.addMedia(d, PNG, 'dot.png'), crop: { l: 0.1, t: 0, r: 0, b: 0.2 } }));
  s2.background = { type: 'solid', colors: ['#334455'] };
  const s3 = SS.model.addSlide(d, 'title-only');
  s3.hidden = true;
  s3.objects[0].text.paras[0].runs[0].t = 'Hidden one';

  const { deck, report } = await roundTrip(d);
  assert.deepEqual(deck.size, { w: 960, h: 540, preset: '16:9' });
  assert.equal(report.slides, 3);
  assert.deepEqual(deck.slides.map((s) => s.hidden), [false, false, true]);
  assert.deepEqual(deck.theme.colors, SS.themes.byId('paper').colors);
  assert.equal(deck.theme.fonts.body, 'Inter Tight');

  const [title] = deck.slides[0].objects;
  assert.equal(plain(title), 'Quarterly review');
  assert.equal(title.style.bold, true);
  assert.equal(title.style.align, 'c');
  near(title.x, d.slides[0].objects[0].x); near(title.w, d.slides[0].objects[0].w);

  const objs = deck.slides[1].objects;
  const body = objs[1];
  assert.equal(plain(body), 'First bold and big\nSecond');
  assert.deepEqual(body.text.paras.map((p) => [p.bullet, p.level || 0]), [['disc', 0], ['disc', 1]]);
  assert.deepEqual(body.text.paras[0].runs.map((r) => [r.b || false, r.size || body.style.size]), [[false, 28], [true, 28], [false, 40]]);
  assert.deepEqual([body.text.paras[1].runs[0].color, body.text.paras[1].runs[0].i], ['accent2', true]);
  assert.equal(body.style.lineHeight, 1.2);

  const ell = objs.find((o) => o.shape === 'ellipse');
  assert.deepEqual([ell.x, ell.y, ell.w, ell.h], [600, 300, 120, 80]);
  assert.deepEqual(ell.fill, { type: 'solid', color: 'accent2' });
  assert.deepEqual([ell.stroke.color, ell.stroke.width], ['#112233', 2]);
  const rr = objs.find((o) => o.shape === 'roundRect');
  assert.deepEqual([rr.radius, rr.rot], [0.2, 30]);
  const line = objs.find((o) => o.shape === 'arrowLine');
  assert.equal(line.stroke.tail, 'arrow');
  const pic = objs.find((o) => o.type === 'image');
  assert.equal(deck.media[pic.media].data, PNG);
  assert.deepEqual(pic.crop, { l: 0.1, t: 0, r: 0, b: 0.2 });
  assert.deepEqual(deck.slides[1].background, { type: 'solid', colors: ['#334455'] });
  assert.equal(plain(deck.slides[2].objects[0]), 'Hidden one');
});

test('the summary is empty when everything came in', async () => {
  const { report } = await roundTrip(SS.model.newDeck());
  assert.equal(SS.pptxIn.summary(report), '');
});

const enc = new TextEncoder();
async function fixture() {
  const png = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
  const blob = await lib.writeZip(fixtureEntries(png).map((e) => ({ path: e.path, data: typeof e.data === 'string' ? enc.encode(e.data) : e.data })));
  return SS.pptxIn.fromFiles(await lib.readZip(blob), lib, { name: 'harbour.pptx' });
}

test('a hand-built package: size, title, theme colours and fonts, master background', async () => {
  const { deck } = await fixture();
  assert.deepEqual(deck.size, { w: 720, h: 540, preset: '4:3' });
  assert.equal(deck.title, 'Harbour report 2026');
  assert.equal(deck.theme.name, 'Harbour');
  assert.deepEqual([deck.theme.colors.bg, deck.theme.colors.text, deck.theme.colors.text2, deck.theme.colors.accent1], ['#fbfaf5', '#101820', '#2b3a55', '#1f77b4']);
  assert.deepEqual([deck.theme.fonts.heading, deck.theme.fonts.body], ['Georgia', 'Arial']);
  assert.deepEqual(deck.theme.background, { type: 'solid', colors: ['bg'] });
  assert.deepEqual(deck.slides[0].background, { type: 'solid', colors: ['#f0f4fa'] });
  assert.equal(deck.slides[1].background, null);
});

test('placeholders take their frame and text styles from the layout and master', async () => {
  const { deck } = await fixture();
  const objs = deck.slides[0].objects;
  assert.equal(objs[0].name, 'Brand bar');        // the master's own shape is drawn first
  assert.deepEqual(objs[0].fill, { type: 'solid', color: 'accent1' });
  const title = objs.find((o) => o.placeholder === 'title');
  assert.equal(plain(title), 'Harbour report');
  assert.deepEqual([title.x, title.y, title.w, title.h], [36, 30, 648, 90]);   // the layout has no frame: the master's
  assert.deepEqual([title.style.size, title.style.bold, title.style.color, title.style.font, title.style.align, title.text.valign], [40, true, 'text2', 'heading', 'c', 'bottom']);
  const body = objs.find((o) => o.placeholder === 'body');
  assert.deepEqual([body.x, body.y, body.w, body.h], [36, 150, 648, 330]);     // the layout's frame wins over the master's
  assert.deepEqual(body.text.paras.map((p) => [p.bullet, p.level || 0]), [['disc', 0], ['dash', 1], ['disc', 0]]);
  assert.equal(body.style.size, 28);
  assert.equal(body.text.paras[1].runs[0].size, 24);
  assert.deepEqual(body.text.paras.map((p) => p.spaceBefore), [undefined, 0, 10]);   // each level has its own spacing
  assert.equal(body.text.inset[0], 0);            // lIns="0" on the master placeholder
});

test('runs keep bold, italic, size, colour, underline, font and link; alignment and autofit come through', async () => {
  const { deck } = await fixture();
  const o = deck.slides[0].objects.find((x) => x.name === 'Mixed runs');
  assert.equal(o.type, 'text');
  assert.deepEqual([o.style.size, o.style.bold, o.style.align, o.text.valign, o.text.autofit], [14, true, 'r', 'middle', 'shrink']);
  const [a, b, c] = o.text.paras[0].runs;
  assert.deepEqual([a.t, b.t, b.i, b.color, b.b], ['Bold ', 'red italic ', true, '#ff0000', false]);
  assert.deepEqual([c.size, c.u, c.font, c.link], [20, true, 'Courier New', 'https://example.com/harbour']);
  assert.match(c.color, /^#[0-9a-f]{6}$/);        // accent2 at 75% luminance is a computed colour, not the slot
  assert.notEqual(c.color, '#ff7f0e');
});

test('shapes, lines, gradients, pictures, tables and groups', async () => {
  const { deck } = await fixture();
  const objs = deck.slides[0].objects, by = (n) => objs.find((o) => o.name === n);
  const badge = by('Badge');
  assert.deepEqual([badge.shape, badge.radius, badge.rot], ['roundRect', 0.25, 30]);
  assert.deepEqual(badge.fill, { type: 'solid', color: 'accent1' });
  assert.deepEqual([badge.stroke.color, badge.stroke.width, badge.stroke.dash], ['#003366', 2, 'dash']);
  assert.equal(badge.style.color, 'bg');          // the style's fontRef lt1 is the background slot
  assert.equal(plain(badge), 'New');
  assert.deepEqual(by('Glow').fill, { type: 'linear', colors: ['#ffffff', 'accent3'], angle: 180 });
  assert.equal(by('Glow').stroke, null);
  const arrow = by('Arrow');
  assert.deepEqual([arrow.shape, arrow.flipV, arrow.stroke.width, arrow.stroke.tail, arrow.stroke.color], ['arrowLine', true, 3, 'arrow', 'text2']);
  const logo = by('Logo');
  assert.equal(logo.type, 'image');
  assert.deepEqual(logo.crop, { l: 0.1, t: 0, r: 0.2, b: 0 });
  assert.match(deck.media[logo.media].data, /^data:image\/png;base64,/);
  const t = by('Table');
  assert.equal(t.type, 'table');
  assert.deepEqual(t.colW, [100, 200]);
  assert.deepEqual(t.cells.map((r) => r.map((c) => SS.objects.plain(c.text))), [['Port', 'Ships'], ['Oslo', '42']]);
  assert.deepEqual([t.header, t.banded, t.style.size, t.cells[1][0].fill], [true, true, 16, '#ffff00']);
  const g = by('Pair');
  assert.equal(g.type, 'group');
  assert.deepEqual([g.x, g.y, g.w, g.h], [200, 460, 100, 40]);
  assert.deepEqual(g.ch, { x: 0, y: 0, w: 200, h: 80 });
  assert.deepEqual(g.children.map((c) => [c.name, c.shape, c.x]), [['Left', 'rect', 0], ['Right', 'rect', 120]]);
});

test('notes, hidden slides, transitions and the report of what was left out', async () => {
  const { deck, report } = await fixture();
  assert.equal(deck.slides[0].notes, 'Remember the numbers.\nThen smile.');
  assert.deepEqual([deck.slides[0].hidden, deck.slides[1].hidden], [false, true]);
  assert.deepEqual(deck.slides[1].transition, { name: 'fade', duration: 1 });
  assert.deepEqual(deck.slides[0].transition.name, 'none');
  assert.deepEqual([report.slides, report.charts, report.approx], [2, 1, 1]);
  assert.equal(SS.pptxIn.summary(report), 'Not imported: 1 chart. 1 shape is drawn as a rectangle (Slop Slides has no such outline).');
});

test('a file that is not a presentation is refused with a reason', async () => {
  const blob = await lib.writeZip([{ path: 'hello.txt', data: 'hi' }]);
  assert.throws(() => SS.pptxIn.fromFiles(new Map(), lib, {}), /not a PowerPoint presentation/);
  await assert.rejects(async () => SS.pptxIn.fromFiles(await lib.readZip(blob), lib, {}), /not a PowerPoint presentation/);
});
