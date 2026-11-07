// Node tests for the random template generator. Run: node --test shared/templates/generate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTemplate, newSeed, CHOICES, FONT_PAIRS, SCHEMES } from './generate.js';
import { checkDoc } from './check.js';
import { FAMILIES } from '../../docs/js/fonts/registry.js';
import { normalizeDoc } from '../../docs/js/model/doc.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => `seed-${i}`);
const FAMILY_NAMES = new Set(FAMILIES.map((f) => f.name));

test('the same seed gives identical JSON, whatever was generated before it', () => {
  const a = JSON.stringify(generateTemplate('harbour-7'));
  for (const s of ['x', 'y', 'z']) generateTemplate(s);
  const b = JSON.stringify(generateTemplate('harbour-7'));
  assert.equal(a, b);
  assert.equal(JSON.stringify(generateTemplate('')), JSON.stringify(generateTemplate('')));
});

test('the seed is recorded in the document and the result, and can be recreated from it', () => {
  const t = generateTemplate('recreate-me');
  assert.equal(t.seed, 'recreate-me');
  assert.equal(t.doc.meta.template.seed, 'recreate-me');
  assert.deepEqual(generateTemplate(t.doc.meta.template.seed).doc, t.doc);
});

test('different seeds give different schemes and designs', () => {
  const schemes = new Set(SEEDS.map((s) => generateTemplate(s).vars.scheme));
  assert.ok(schemes.size >= 6, `only ${schemes.size} schemes in 300 seeds`);
  const a = generateTemplate('alpha'), b = generateTemplate('beta');
  assert.notEqual(JSON.stringify(a.doc), JSON.stringify(b.doc));
  const bySeed = new Set(SEEDS.slice(0, 40).map((s) => JSON.stringify(generateTemplate(s).doc)));
  assert.equal(bySeed.size, 40, 'every seed gives its own document');
});

test('every generated document validates against the Docs schema', () => {
  for (const s of SEEDS) {
    const { doc } = generateTemplate(s);
    const errs = checkDoc(doc);
    assert.deepEqual(errs, [], `seed ${s}`);
    assert.deepEqual(normalizeDoc(doc), doc, `normalizeDoc changes seed ${s}`);
  }
});

test('the validator rejects a broken document', () => {
  const good = generateTemplate('check').doc;
  const bad = structuredClone(good);
  bad.blocks[0].style = 'NoSuchStyle';
  bad.blocks[0].runs = [{ text: 'x', size: 120 }];
  bad.blocks.push({ type: 'p', id: bad.blocks[0].id, style: 'Normal', props: {}, runs: [] });
  const errs = checkDoc(bad);
  assert.ok(errs.some((e) => /NoSuchStyle/.test(e) || /style/.test(e)), errs.join('; '));
  assert.ok(errs.some((e) => /120 is not 6\.\.96/.test(e)), errs.join('; '));
  assert.ok(errs.some((e) => /used twice/.test(e)), errs.join('; '));
});

test('every style choice is from its allowed list', () => {
  const seen = {};
  for (const s of SEEDS) {
    const { vars, doc } = generateTemplate(s);
    for (const key of Object.keys(CHOICES)) {
      assert.ok(CHOICES[key].includes(vars[key]), `${key} = ${vars[key]} seed ${s}`);
      (seen[key] = seen[key] || new Set()).add(vars[key]);
    }
    assert.ok(SCHEMES.some((x) => x.id === vars.scheme), `scheme ${vars.scheme}`);
    assert.ok(FONT_PAIRS.some((p) => p.heading === vars.fonts[0] && p.body === vars.fonts[1]), `fonts ${vars.fonts}`);
    for (const name of ['H1', 'H2', 'Normal', 'Title', 'Subtitle']) {
      const f = doc.styles[name] && doc.styles[name].r && doc.styles[name].r.font;
      if (f) assert.ok(FAMILY_NAMES.has(f), `${name} font ${f}`);
    }
    assert.ok(doc.section.margin.top === doc.section.margin.left, 'margins are even');
    assert.ok(['Letter', 'A4'].includes(doc.section.size), 'page size');
  }
  for (const key of ['kind', 'layout', 'heading', 'table', 'margins', 'scale', 'paper', 'header', 'footer']) {
    assert.equal(seen[key].size, CHOICES[key].length, `every ${key} choice appears in 300 seeds`);
  }
});

test('the new-seed helper gives six base-36 characters from the supplied random source', () => {
  assert.equal(newSeed(() => 0), '000000');
  assert.match(newSeed(), /^[0-9a-z]{6}$/);
  assert.equal(newSeed(() => 0.5), newSeed(() => 0.5));
});
