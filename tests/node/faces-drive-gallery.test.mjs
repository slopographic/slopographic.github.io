// Face detection core (shared/faces/): the box maths (score threshold, overlap suppression, YuNet decoding) and the
// opt-in gate (detect does nothing and returns [] while the setting is off). No browser and no model: the classic
// scripts run in a vm context with a stub localStorage. Named so that both `node tests/run.mjs drive` and
// `node tests/run.mjs gallery` run it. Run alone: node --test tests/node/faces-drive-gallery.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** A fresh classic-script global with the given files run in order. */
function load(files, { storage = memoryStorage() } = {}) {
  const et = new EventTarget(); // the scripts fire and listen for events on their window
  const sandbox = {
    console, localStorage: storage, CustomEvent,
    addEventListener: (...a) => et.addEventListener(...a),
    dispatchEvent: (e) => et.dispatchEvent(e),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(read(f), sandbox, { filename: f });
  return sandbox;
}
function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const pure = () => load(['shared/faces/decode.js']).SlopFaces;
/** Values made inside the vm context have another Array prototype: copy them before comparing. */
const plain = (v) => JSON.parse(JSON.stringify(v));

describe('box filtering (decode.js)', () => {
  test('iou: identical boxes 1, disjoint 0, half overlap 1/3', () => {
    const F = pure();
    assert.equal(F.iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }), 1);
    assert.equal(F.iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), 0);
    // overlap 5x10 = 50, union 100 + 100 - 50 = 150
    assert.ok(Math.abs(F.iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 }) - 1 / 3) < 1e-12);
  });

  test('score threshold: a box below minScore is dropped, one exactly at it is kept', () => {
    const F = pure();
    const kept = F.filterBoxes([
      { x: 0, y: 0, w: 10, h: 10, score: 0.59 },
      { x: 100, y: 0, w: 10, h: 10, score: 0.6 },
      { x: 200, y: 0, w: 10, h: 10, score: 0.95 },
    ], { minScore: 0.6 });
    assert.deepEqual(plain(kept.map((b) => b.score)), [0.95, 0.6]);
  });

  test('overlap suppression: of two boxes over IoU 0.3, only the more confident survives', () => {
    const F = pure();
    const kept = F.filterBoxes([
      { x: 0, y: 0, w: 10, h: 10, score: 0.8 },
      { x: 1, y: 1, w: 10, h: 10, score: 0.9 }, // IoU about 0.68 with the first
    ], { minScore: 0.6, maxIou: 0.3 });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].score, 0.9);
  });

  test('boxes that barely touch are both kept; most confident first; bad boxes dropped', () => {
    const F = pure();
    const kept = F.filterBoxes([
      { x: 0, y: 0, w: 10, h: 10, score: 0.7 },
      { x: 8, y: 0, w: 10, h: 10, score: 0.8 }, // IoU 2/18, below 0.3
      { x: 50, y: 50, w: 0, h: 10, score: 0.99 }, // no area
      { x: 60, y: 60, w: 10, h: 10, score: NaN }, // no score
      null,
    ], { minScore: 0.6, maxIou: 0.3 });
    assert.deepEqual(plain(kept.map((b) => b.score)), [0.8, 0.7]);
  });

  test('the max count caps the result', () => {
    const F = pure();
    const boxes = Array.from({ length: 10 }, (_, i) => ({ x: i * 50, y: 0, w: 10, h: 10, score: 0.9 - i * 0.01 }));
    assert.equal(F.filterBoxes(boxes, { max: 4 }).length, 4);
  });
});

describe('YuNet decoding (decode.js)', () => {
  const zeros = (n) => new Float32Array(n);
  /** Outputs with one confident anchor: stride 8, row 10, column 20 (anchor 10 * 80 + 20). */
  function oneFace({ score = 0.9, dx = 0, dy = 0, lw = 0, lh = 0 } = {}) {
    const out = {};
    for (const [st, n] of [[8, 6400], [16, 1600], [32, 400]]) {
      out['cls_' + st] = zeros(n); out['obj_' + st] = zeros(n); out['bbox_' + st] = zeros(n * 4); out['kps_' + st] = zeros(n * 10);
    }
    const i = 10 * 80 + 20;
    out.cls_8[i] = score; out.obj_8[i] = score;
    out.bbox_8[i * 4] = dx; out.bbox_8[i * 4 + 1] = dy; out.bbox_8[i * 4 + 2] = lw; out.bbox_8[i * 4 + 3] = lh;
    return out;
  }

  test('scaleFor letterboxes into the 640 square, top-left aligned', () => {
    const F = pure();
    assert.equal(F.INPUT_SIZE, 640);
    assert.equal(F.scaleFor(640, 480), 1);
    assert.equal(F.scaleFor(1280, 640), 0.5);
    assert.equal(F.scaleFor(320, 1280), 0.5);
  });

  test('one confident anchor decodes to one box in source pixels', () => {
    const F = pure();
    const boxes = F.decodeYunet(oneFace(), { scale: 1, minScore: 0.6 });
    assert.equal(boxes.length, 1);
    // cx = (20 + 0) * 8 = 160, cy = (10 + 0) * 8 = 80, w = exp(0) * 8 = 8: top-left (156, 76)
    assert.deepEqual({ x: boxes[0].x, y: boxes[0].y, w: boxes[0].w, h: boxes[0].h }, { x: 156, y: 76, w: 8, h: 8 });
    assert.ok(Math.abs(boxes[0].score - 0.9) < 1e-6);
  });

  test('the box is scaled back to the source image (scale 0.5 doubles the coordinates)', () => {
    const F = pure();
    const [b] = F.decodeYunet(oneFace({ dx: 0.5 }), { scale: 0.5, minScore: 0.6 });
    // cx = (20 + 0.5) * 8 = 164, so x = (164 - 4) / 0.5 = 320; w = 8 / 0.5 = 16
    assert.equal(b.x, 320);
    assert.equal(b.w, 16);
  });

  test('anchors below minScore are not decoded', () => {
    const F = pure();
    assert.equal(F.decodeYunet(oneFace({ score: 0.5 }), { scale: 1, minScore: 0.6 }).length, 0);
  });

  test('a missing output is an error, not a silent empty result', () => {
    const F = pure();
    const out = oneFace();
    delete out.bbox_16;
    assert.throws(() => F.decodeYunet(out, { scale: 1 }), /unexpected output/);
  });
});

describe('opt-in gate (index.js)', () => {
  /** The core with the profile, the copy and the cache (no IndexedDB here, so the cache is in memory). */
  function gated(storage) {
    // the words as a page has them: SlopI18n with the English tables of the shared components (shared/i18n/ui)
    return load(['shared/i18n/i18n.js', 'shared/i18n/ui/en.js', 'shared/i18n/ui/en/preview.js', 'shared/faces/copy.js', 'shared/profile/profile.js', 'shared/profile/app-options.js', 'shared/faces/decode.js', 'shared/faces/cache.js', 'shared/faces/index.js'], { storage });
  }
  const picture = { width: 40, height: 30 };

  test('off by default: enabled() is false and the status says so', () => {
    const F = gated(memoryStorage()).SlopFaces;
    assert.equal(F.enabled(), false);
    assert.equal(F.status(), 'off');
  });

  test('while off, detect() returns [] and never touches the model', async () => {
    const W = gated(memoryStorage());
    const F = W.SlopFaces;
    let calls = 0;
    F.setBackend({ detect: () => { calls++; return [{ x: 1, y: 1, w: 5, h: 5, score: 0.9 }]; } });
    assert.deepEqual(plain(await F.detect(picture)), []);
    assert.equal(calls, 0);
  });

  test('while off, analyse() stores nothing and returns null', async () => {
    const W = gated(memoryStorage());
    const F = W.SlopFaces;
    F.setBackend({ detect: () => [{ x: 1, y: 1, w: 5, h: 5, score: 0.9 }] });
    assert.equal(await F.analyse('drive', 'f1', 1, {}), null);
    assert.equal((await F.cache.all('drive')).size, 0);
  });

  test('turning it on through the setting enables detection; turning it off stops it again', async () => {
    const W = gated(memoryStorage());
    const F = W.SlopFaces;
    let calls = 0;
    F.setBackend({ detect: () => { calls++; return [{ x: 1, y: 1, w: 5, h: 5, score: 0.9 }]; } });
    let changes = 0;
    F.onChange(() => changes++);
    assert.deepEqual(plain(F.setEnabled(true)), { ok: true });
    assert.equal(F.enabled(), true);
    assert.equal(F.status(), 'ready');
    assert.equal((await F.detect(picture)).length, 1);
    assert.equal(calls, 1);
    assert.deepEqual(plain(F.setEnabled(false)), { ok: true });
    assert.equal(F.enabled(), false);
    assert.deepEqual(plain(await F.detect(picture)), []);
    assert.equal(calls, 1, 'no detection after the setting is off');
    assert.equal(changes, 2);
  });

  test('the setting is one stored value in SlopProfile under faces.detect', () => {
    const storage = memoryStorage();
    const W = gated(storage);
    W.SlopFaces.setEnabled(true);
    assert.deepEqual(plain(W.SlopProfile.overrides('faces')), { detect: true });
    W.SlopFaces.setEnabled(false);
    assert.deepEqual(plain(W.SlopProfile.overrides('faces')), {});
  });

  test('a value saved in another tab is read at once', () => {
    const storage = memoryStorage({ 'slop-profile': JSON.stringify({ faces: { detect: true } }) });
    const F = gated(storage).SlopFaces;
    assert.equal(F.enabled(), true);
  });

  test('a stored value that is not a boolean counts as off', () => {
    const storage = memoryStorage({ 'slop-profile': JSON.stringify({ faces: { detect: 'yes' } }) });
    assert.equal(gated(storage).SlopFaces.enabled(), false);
  });

  test('the wording for the dialog and the Profile page is one constant', () => {
    const W = gated(memoryStorage());
    assert.equal(W.SLOP_FACES_COPY.title, 'Find faces on this device?');
    // Profile's switch reads the same keys, when the page draws it (it used to keep the words of load time: no switch)
    const I = W.SlopI18n;
    assert.equal(I.label(W.SLOP_APP_OPTIONS.faces.detect.label), W.SLOP_FACES_COPY.switchLabel);
    assert.ok(I.label(W.SLOP_APP_OPTIONS.faces.detect.help).includes('Nothing is uploaded'));
    assert.equal(I.label(W.SLOP_APP_OPTIONS.faces.threshold.label), 'Same person threshold');
    assert.equal(I.label(W.SLOP_APP_SHARED.drive.faces), 'Face detection');
  });
});
