// The SEO copy stays true to the apps: no phrase the code has made untrue (the denylist below, one reason per entry),
// and the creative comparisons keep a row for AI. Reads every copy source: the round-ups (our tool, the verdict, the
// questions), the task pages, the guides, the app and landing copy, and the How it works page.
// Covers: shared/seo/ai-copy.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { ROUNDUPS } = await load('shared/seo/roundups/index.mjs');
const { TASKS } = await load('shared/seo/tasks/index.mjs');
const { GUIDES } = await load('shared/seo/guides/index.mjs');
const { APPS, ABOUT, LANDING } = await load('shared/seo/copy.mjs');
const { AI } = await load('shared/seo/ai-copy.mjs');

/** The phrases the code has made untrue. apps: only that app's copy (else all of it); why: what in the code says so. */
const STALE = [
  { re: /no generative AI/i, why: 'Generate Image… and Edit with AI… (shared/ai/imagegen, photoslop/js/app/imagegen.js), and generate_image in every app\'s AI panel' },
  { re: /\bno AI tools\b|\bhas no AI\b|without AI\b/i, why: 'every app page has the AI button (shell/header.js, shared/ai/panel.js)' },
  { re: /no content-aware fill that removes an object/i, apps: ['photoslop'], why: 'Edit with AI… changes only the selection, with the person\'s own key' },
  { re: /does not have yet:[^.]*RAW files/i, apps: ['photoslop'], why: 'camera RAW opens in the Develop dialog (photoslop RAW support)' },
  { re: /(generat\w*|edit with AI|image model)[^.]{0,80}(runs? (on|in) (your|this) (device|browser|computer)|nothing is uploaded)/i, why: 'pictures by AI need the person\'s own key: the request goes to that provider (shared/ai/imagegen)' },
  { re: /pictures only|no PDFs or videos/i, apps: ['watermark'], why: 'Slop Watermark does pictures, videos and PDFs (shared/watermark/apply.js)' },
  { re: /capped at 8000 pixels|-90° to 90°|still PNG/i, apps: ['watermark'], why: 'shared/watermark: 16,384 px, rotation -180° to 180°, animated GIFs keep every frame' },
  { re: /no auto captions/i, apps: ['slopedit'], why: 'SlopCut\'s Add captions… transcribes on the device (slopcut/js/ai/cmd-text.js)' },
  { re: /no batches|one picture at a time/i, apps: ['upscale'], why: 'Slop Upscale runs several files in turn and zips them (upscale/js/app/main.js)' },
  { re: /old (words|line) (are|is) covered (with a box|and new text)/i, apps: ['pdf'], why: 'Slop PDF takes old text out of the content stream (pdf/js/editor/text-strip.js); covers are the fallback' },
  { re: /no sort, filter/i, apps: ['tables'], why: 'Slop Tables sorts and filters through its AI commands (tables/js/ui/ai-commands.js)' },
];

const texts = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(texts) : v && typeof v === 'object' ? Object.values(v).flatMap(texts) : []);
/** [{ app, where, text }] for every piece of copy. */
function copy() {
  const out = [], add = (app, where, v) => texts(v).forEach((text) => out.push({ app, where, text }));
  for (const r of ROUNDUPS) {
    const ours = r.tools.find((t) => t.ours);
    add(r.app, `best/${r.slug} (our tool)`, [ours.bestFor, ours.summary, ours.cells, ours.pros, ours.cons]);
    add(r.app, `best/${r.slug} (verdict, questions)`, [r.verdict && r.verdict[0], r.faq]);
  }
  for (const t of TASKS) add(t.app, `${t.app}/${t.slug}`, t);
  for (const g of GUIDES) add(g.app, `${g.app}/${g.slug}`, g);
  for (const [id, v] of Object.entries({ ...APPS })) add(id, `copy APPS.${id}`, v);
  for (const [id, v] of Object.entries(ABOUT)) add(id, `copy ABOUT.${id}`, v);
  for (const [id, v] of Object.entries(LANDING)) add(id, `copy LANDING.${id}`, v);
  const how = readFileSync(path.join(ROOT, 'how-it-works/index.html'), 'utf8').replace(/<[^>]+>/g, ' ');
  add('how-it-works', 'how-it-works/index.html', how);
  return out;
}

test('every denylist entry says why, and no copy says what the code has made untrue', () => {
  for (const s of STALE) assert.ok(s.why && s.why.length > 20, `${s.re}: give the reason`);
  const bad = [];
  for (const c of copy()) for (const s of STALE) {
    if (s.apps && !s.apps.includes(c.app)) continue;
    const m = c.text.match(s.re);
    if (m) bad.push(`${c.where}: "${m[0]}" (${s.why})`);
  }
  assert.deepEqual(bad, []);
});

test('the denylist catches what it is for', () => {
  const hit = (app, text) => STALE.some((s) => (!s.apps || s.apps.includes(app)) && s.re.test(text));
  assert.ok(hit('photoslop', 'No generative AI or one-click object removal'));
  assert.ok(hit('photoslop', 'Generate Image… runs on your device'));
  assert.ok(hit('watermark', 'Pictures only: no PDFs or videos here'));
  assert.ok(!hit('cutout', 'The AI runs in your browser; pictures are never uploaded'));
  assert.ok(!hit('photoslop', AI.images) && !hit('photoslop', AI.how) && !hit('photoslop', AI.pro));
});

const CREATIVE = ['photoslop', 'vector', 'cutout', 'upscale', 'slopedit', 'press', 'effects'];
test('the creative comparisons have an AI row, and our app is not marked as having no AI where it has the AI button', () => {
  for (const app of CREATIVE) {
    const r = ROUNDUPS.find((x) => x.app === app);
    assert.ok(r && r.matrix, `${app}: a comparison with a table`);
    const rows = r.matrix.filter((m) => /\bAI\b/.test(m.feature));
    assert.ok(rows.length, `${app}: a row about AI in ${r.slug}`);
    const assistant = r.matrix.find((m) => m.feature === AI.row || m.feature === 'AI tools');
    if (assistant) assert.notEqual(assistant.values[0], 'no', `${app}: ${assistant.feature} is not "no" for us`);
  }
  const photo = ROUNDUPS.find((x) => x.app === 'photoslop').matrix.find((m) => /Generative fill/.test(m.feature));
  assert.equal(photo && photo.values[0], AI.imagesShort, 'PhotoSlop: generative fill needs the person\'s key');
});
