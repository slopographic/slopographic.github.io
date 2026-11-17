// Covers: drive/js/ui/empty.js, ai/js/ui/sloppo.js, shared/buddy/boot.js
// The brand profile's mascot switch: with "mascot": false (the marker rewritten as the white-label build does) the
// Drive empty state has no character, the AI top bar hides its button, and the buddy never boots. On, nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f, off) => { const s = readFileSync(path.join(ROOT, f), 'utf8'); return off ? s.replace('/*profile:mascot*/true', '/*profile:mascot*/false') : s; };
const el = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids, hidden: false, addEventListener() {}, append() {} });

function drive(off) {
  const DR = { el, icon: () => '', uploadPicker() {}, newFolder() {}, dest() {}, backupDialog() {} };
  vm.runInNewContext(read('drive/js/ui/empty.js', off), { window: { DR }, document: { baseURI: 'http://x/drive/' }, URL, matchMedia: () => ({ matches: true }), performance, requestAnimationFrame() {}, devicePixelRatio: 1 });
  return DR.emptyState('drive');
}

test('Drive empty state: the character only when the mascot is on', () => {
  assert.equal(drive(false).kids[0].hidden, false);
  assert.equal(drive(true).kids[0].hidden, true);
  assert.match(drive(true).kids[1].kids[0], /is empty/);
});

test('AI top bar: no mascot button when the mascot is off', () => {
  const btn = { hidden: false }, added = [];
  const AI = { K: {}, el: (t, a, txt) => ({ t, txt }), $: () => btn, on() {}, E: { ready: () => false } };
  vm.runInNewContext(read('ai/js/ui/sloppo.js', true), { window: { AI }, document: { head: { append: (x) => added.push(x) }, addEventListener() {} }, matchMedia: () => ({ matches: true }), URL });
  AI.initSloppo();
  assert.equal(btn.hidden, true);
  assert.match(added[0].txt, /hello-sloppo\{display:none\}/);
  assert.equal(AI.paintSloppo(), undefined);
});

test('buddy: boot() returns at once when the mascot is off', () => {
  const src = read('shared/buddy/boot.js', true);
  assert.match(src, /const MASCOT = \/\*profile:mascot\*\/false;/);
  assert.match(src, /const OVERLAY = \/\*profile:mascotOverlay\*\/false;/);                // and no mascot of its own
  assert.match(src, /if \(booted \|\| !\(MASCOT \|\| OVERLAY\)\) return api;/);
});

test('buddy: a profile with its own mascot boots the slot instead of the engine', () => {
  const src = read('shared/buddy/boot.js');
  assert.match(src, /const OVERLAY = \/\*profile:mascotOverlay\*\/false;/);
  assert.match(src, /if \(booted \|\| !\(MASCOT \|\| OVERLAY\)\) return api;/);
  assert.match(src, /OVERLAY \? import\('\.\.\/mascot\/slot\.js'\) : import\('\.\/engine\.js'\)/);
});
