// The shared media lists have one source for their words: shared/i18n/ui/<code>/{video,graphics,presets}.js. The lists
// in shared/video, shared/graphics and shared/presets keep ids only and read their labels through getters, so a language
// change shows at the next read; SlopCut, Reel Remix and Slop Effects no longer keep their own copies of those words.
// Covers: shared/video/seed.js, shared/video/presets.js, shared/video/templates.js, shared/video/timing.js,
// shared/video/audio.js, shared/video/clipset.js, shared/video/effects.js, shared/video/keys.js,
// shared/video/random-edit.js, shared/graphics/icons.js, shared/presets/core.js, shared/presets/builtins-effect.js,
// shared/presets/builtins-motion.js, shared/i18n/ui/en/video.js, shared/i18n/ui/sv/video.js,
// shared/i18n/ui/en/graphics.js, shared/i18n/ui/sv/graphics.js, shared/i18n/ui/en/presets.js,
// shared/i18n/ui/sv/presets.js, slopcut/js/core/fx-random.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { context, plain, ROOT } from './ui-tables-env.mjs';

const VIDEO = ['seed.js', 'presets.js', 'grid.js', 'templates.js', 'layout.js', 'segments.js', 'timing.js', 'locks.js', 'audio.js',
  'clipset.js', 'orient.js', 'effects.js', 'random-edit.js'].map((f) => 'shared/video/' + f);
const MOTION = ['shared/motion/easing.js', 'shared/motion/track.js'];
const FILES = [...MOTION, ...VIDEO, 'shared/video/keys.js', 'shared/graphics/icons.js', 'shared/presets/core.js',
  'shared/presets/builtins-effect.js', 'shared/presets/builtins-motion.js'];
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

/** Every label the shared lists show, as [where, label]. */
function labels(ctx) {
  const SV = ctx.SlopVideo, G = ctx.SlopGraphics, SP = ctx.SlopPresets, out = [];
  const add = (where, rows) => rows.forEach((r) => out.push([where + ':' + r[0], r[1]]));
  add('pace', SV.random.PACES); add('size', SV.presets.choices()); add('timing', SV.timing.MODES); add('vplay', SV.timing.VIDEO);
  add('audio', SV.audio.MODES); add('show', SV.clipset.SHOW); add('edge', SV.clipset.EDGE); add('vmode', SV.clipset.VMODE);
  add('fx', SV.effects.KINDS); add('change', SV.effects.CHANGE); add('ease', SV.keys.EASES); add('anim', SV.keys.ANIMATE);
  add('preset', SV.presets.LIST.map((x) => [x.id, x.name]));
  add('tpl', SV.templates.list.map((x) => [x.id, x.name])); add('tpl_desc', SV.templates.list.map((x) => [x.id, x.desc]));
  const g23 = SV.templates.get('grid-2x3'); add('grid', [[g23.id, g23.name], [g23.id + ' desc', g23.desc], ['none', SV.templates.label(null)]]);
  add('gfx', G.list().map((s) => [s.id, s.name])); add('gfx group', G.list().map((s) => [s.id, s.group])); add('gfx anim', G.ANIMS);
  add('effect type', Object.keys(SP.EFFECT_TYPES).map((k) => [k, SP.EFFECT_TYPES[k].label]));
  add('builtin', SP.builtins().map((b) => [b.id, b.label])); add('builtin desc', SP.builtins().map((b) => [b.id, b.description]));
  return out;
}

test('every id of the shared lists has its words in English and Swedish (no key shows)', () => {
  for (const lang of ['en', 'sv']) {
    for (const [where, label] of labels(context(FILES, lang))) {
      assert.equal(typeof label, 'string', where);
      assert.ok(label && !/^ui\.[a-z_]+\./.test(label), `${lang} ${where}: ${label}`);
    }
  }
});

test('Swedish: the lists read the Swedish the video apps chose', () => {
  const ctx = context(FILES, 'sv'), SV = ctx.SlopVideo;
  const get = (rows, id) => plain(rows).find((r) => r[0] === id)[1];
  assert.equal(get(SV.random.PACES, 'fast'), 'Snabbt (klipp på 0,6–1,4 s)');
  assert.equal(SV.templates.get('pip').name, 'Bild-i-bild');
  assert.equal(SV.templates.get('grid-2x3').name, 'Rutnät 2×3');
  assert.equal(SV.templates.label(null), 'Ingen layout');
  assert.equal(SV.effects.name('grain'), 'Filmkorn');
  assert.equal(get(SV.keys.EASES, 'easeInOut'), 'Mjuk in/ut');
  assert.equal(get(SV.presets.choices(), 'custom'), 'Egen bredd och höjd');
  assert.equal(ctx.SlopGraphics.get('arrow').name, 'Pil');
  assert.equal(get(ctx.SlopGraphics.ANIMS, 'draw'), 'Rita fram');
  assert.equal(ctx.SlopPresets.get('soft-shadow').label, 'Mjuk skugga');
  assert.equal(ctx.SlopPresets.EFFECT_TYPES['drop-shadow'].label, 'Skugga');
});

test('a language change shows at the next read (no label is kept from load time)', () => {
  const ctx = context(FILES, 'en', { langs: ['sv'] }), SV = ctx.SlopVideo;
  assert.equal(SV.templates.get('single').name, 'Single');
  assert.equal(SV.effects.name('zoom'), 'Zoom pulse');
  const tile = SV.presets.LIST[0].name;
  ctx.lang.set('sv');
  assert.equal(SV.templates.get('single').name, 'Enkel');
  assert.equal(SV.effects.name('zoom'), 'Zoompuls');
  assert.notEqual(SV.presets.LIST[0].name, tile);
  assert.equal(ctx.SlopPresets.list({ kind: 'motion' })[0].label, 'Tona in');
});

test('the shared list files carry no English label inline (the en table is the source)', () => {
  const en = context([], 'en').SlopI18n;
  const words = [];
  for (const p of ['video', 'graphics', 'presets']) {
    for (const m of read(`shared/i18n/ui/en/${p}.js`).matchAll(/^\s*'(ui\.[^']+)': '((?:[^'\\]|\\.)*)',$/gm)) if (/^[A-Z0-9]/.test(m[2]) && m[2].length > 2) words.push(m[2]);
  }
  assert.ok(words.length > 100, 'read the en words');
  const files = [...VIDEO, 'shared/video/keys.js', 'shared/video/lane-view.js', 'shared/graphics/icons.js', 'shared/presets/core.js',
    'shared/presets/builtins-effect.js', 'shared/presets/builtins-motion.js', 'shared/presets/ui.js'];
  const ids = { 'shared/presets/core.js': ['Bounce'] }; // EASE_FAMILIES: parts of ease ids (easeOutBounce), not words
  for (const f of files) {
    const src = read(f);
    for (const w of words) if (!(ids[f] || []).includes(w)) assert.ok(!src.includes(`'${w}'`) && !src.includes(`"${w}"`), `${f} still has '${w}'`);
  }
  assert.ok(en.t('ui.video.tpl.single') === 'Single');
});

test('SlopCut, Reel Remix and Slop Effects keep no copy of the shared list words', () => {
  const dup = /'(slopedit\.def\.(tpl|size|gfx|ganim|fxr)|remix\.(pace|preset|timing|video|audio|show|edge|vmode|fx|change|ease|anim|tpl)|effects\.def\.preset)\./;
  for (const app of ['slopcut', 'remix', 'effects']) {
    for (const code of readdirSync(path.join(ROOT, app, 'i18n')).filter((d) => !d.endsWith('.js'))) {
      for (const f of readdirSync(path.join(ROOT, app, 'i18n', code))) {
        const m = dup.exec(read(`${app}/i18n/${code}/${f}`));
        assert.equal(m, null, `${app}/i18n/${code}/${f} has ${m && m[0]}`);
      }
    }
  }
  assert.ok(!existsSync(path.join(ROOT, 'remix/i18n/en/lists.js')), 'remix lists part removed');
  const code = (dir) => readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => read(path.join(dir, f))).join('\n');
  assert.doesNotMatch(code('remix/js'), /RM\.t[nl]\(/, 'remix no longer maps shared lists by id');
  assert.doesNotMatch(code('slopcut/js'), /U\.wl?\('(tpl|size|gfx|ganim|fxr)'/, 'slopcut no longer maps shared lists by id');
});

test('SlopCut: the random effect types read the shared effect words', () => {
  const ctx = context([...MOTION, ...VIDEO, 'slopcut/js/core/fx-random.js'], 'sv');
  assert.equal(plain(ctx.SE.fx.TYPES).find((r) => r[0] === 'colour')[1], 'Färgskiftning');
  assert.equal(ctx.SE.fx.pick(1, 0, ['grain'], 1).type, 'grain');
});

// Covers: shared/presets/io.js
// An import that failed said "not a valid preset" or "the file is larger than 5 MB" in every language.
test('Swedish: a preset import that fails says so in Swedish', async () => {
  const ctx = context([...FILES, 'shared/presets/io.js'], 'sv'), SP = ctx.SlopPresets;
  assert.equal(SP.errorText([]), 'Inte en giltig förinställning.');
  assert.match(SP.errorText([{ path: 'label', message: 'required' }]), /^Inte en giltig förinställning: label: required$/);
  assert.equal(plain((await SP.importFile(null)).errors)[0].message, 'Ingen fil angavs.');
});
