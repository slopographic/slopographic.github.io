// The ad slot list (shared/ads/slots.json): ids unique, every slot named, unit IDs numeric or empty, and every
// data-slop-ad placeholder on a page names a slot that exists. Run: node tests/run.mjs ads
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const list = JSON.parse(readFileSync(path.join(ROOT, 'shared', 'ads', 'slots.json'), 'utf8'));

test('slots.json has a slots array', () => {
  assert.ok(Array.isArray(list.slots), 'slots must be an array');
  assert.ok(list.slots.length >= 3, 'the three named slots are present');
});

test('slot ids are unique and well formed', () => {
  const ids = list.slots.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`);
  for (const id of ids) assert.match(id, /^[a-z0-9-]{1,40}$/, `bad id ${id}`);
});

test('every slot has a name, a unit ID (numeric or empty) and a size', () => {
  for (const s of list.slots) {
    assert.ok(typeof s.name === 'string' && s.name.trim() !== '', `slot ${s.id} has no name`);
    assert.ok(s.unit === '' || /^\d{6,20}$/.test(s.unit), `slot ${s.id} unit must be numeric or empty`);
    assert.ok(Number.isInteger(s.width) && s.width > 0, `slot ${s.id} needs a width`);
    assert.ok(Number.isInteger(s.height) && s.height > 0, `slot ${s.id} needs a height`);
  }
});

test('the named slots exist', () => {
  const ids = list.slots.map((s) => s.id);
  for (const id of ['home-footer', 'convert-sidebar', 'about-footer']) assert.ok(ids.includes(id), `missing ${id}`);
});

test('every data-slop-ad placeholder on a page names a known slot', () => {
  const known = new Set(list.slots.map((s) => s.id));
  const pages = ['index.html', 'convert/index.html'];
  for (const d of readdirSync(path.join(ROOT, 'convert'))) pages.push(path.join('convert', d, 'index.html'));
  for (const d of readdirSync(ROOT)) pages.push(path.join(d, 'about', 'index.html'));
  let found = 0;
  for (const p of pages) {
    const f = path.join(ROOT, p);
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/data-slop-ad="([^"]+)"/g)) {
      found++;
      assert.ok(known.has(m[1]), `${p} uses unknown slot ${m[1]}`);
    }
  }
  assert.ok(found > 0, 'no placeholders found');
});
