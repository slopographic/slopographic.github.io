// Every app in shared/apps.js has its own icon (a Sloppo badge holding a distinct glyph). Run: node tests/run.mjs app-icons
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (file, win) => vm.runInNewContext(readFileSync(path.join(ROOT, file), 'utf8'), { window: win });

const win = {};
load('shared/apps.js', win);
load('shared/app-icons.js', win);
const apps = JSON.parse(JSON.stringify(win.SLOP_ALL_APPS || win.SLOP_APPS)); // copy out of the vm realm; with any app a brand profile hides
const icons = { ...win.SLOP_ICONS };

test('every app id in shared/apps.js has an icon entry', () => {
  assert.ok(apps.length > 30, 'registry looks empty');
  const missing = apps.map((a) => a.id).filter((id) => typeof icons[id] !== 'string' || !icons[id].trim());
  assert.deepEqual(missing, []);
});

test('no icon entry is left behind for an app that is no longer in the registry', () => {
  const ids = new Set(apps.map((a) => a.id));
  assert.deepEqual(Object.keys(icons).filter((k) => !ids.has(k)), []);
});

test('every glyph is distinct from every other one', () => {
  const seen = new Map();
  for (const [id, markup] of Object.entries(icons)) {
    const key = markup.replace(/\s+/g, ' ').trim();
    assert.ok(!seen.has(key), `${id} repeats the glyph of ${seen.get(key)}`);
    seen.set(key, id);
  }
});

test('glyphs are stroke-only line art with no colour of their own', () => {
  for (const [id, markup] of Object.entries(icons)) {
    assert.doesNotMatch(markup, /\b(fill|stroke|style|color)=/i, `${id} sets its own paint`);
    assert.match(markup, /<(path|rect|circle|ellipse|line|polyline|polygon)\b/, `${id} has no shapes`);
  }
});

test('the shared badge builder wraps any glyph in a lime Sloppo tile, with the glyph in ink', () => {
  const badge = win.SLOP_ICON_BADGE(icons.time);
  assert.match(badge, /^<rect x="2" y="2" width="44" height="44" rx="12" fill="#d4ff3a"\/>/);
  assert.ok(badge.includes(icons.time), 'glyph is inside the badge');
  assert.match(badge, /stroke="#0b1300"/);
  assert.match(win.SLOP_ICON_BADGE(icons.time, '#ff5a3a'), /fill="#ff5a3a"/);
});
