/* SlopFaces recogniser: one embedding per face, so faces can be grouped by who they look alike. Model: SFace
 * (OpenCV Zoo, face_recognition_sface_2021dec.onnx, Apache-2.0, vendor/face/). It runs on the face the detector found,
 * aligned on its five landmarks (a similarity transform onto the 112 x 112 template OpenCV uses), and returns a
 * 128-value vector of unit length. Cosine distance between two vectors is 1 - dot. Nothing leaves the device.
 * The file is checked by sha256 before it is used. Without it the faces are still counted, with no embeddings.
 * Classic script; adds to window.SlopFaces: runtime(), recognizer, embedFaces(), setEmbedder(), recogniserReady(). */
(function (g) {
  'use strict';
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/preview.js
  const F = (g.SlopFaces = g.SlopFaces || {});
  const RECOG = Object.freeze({
    id: 'sface-2021dec', file: 'face_recognition_sface_2021dec.onnx', bytes: 38696353, licence: 'Apache-2.0',
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
  });
  const SIZE = 112, DIM = 128;
  const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
  F.RECOG = RECOG;
  F.EMBED_DIM = DIM;
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

  /** The ONNX Runtime Web module, configured for one WebAssembly thread (no proxy). Shared with the detector. */
  let ortP = null;
  F.runtime = function () {
    if (!ortP) ortP = import(new URL('onnxruntime-web/ort.wasm.min.mjs', F.VENDOR).href).then((ort) => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { mjs: new URL('onnxruntime-web/ort-wasm-simd-threaded.mjs', F.VENDOR).href, wasm: new URL('onnxruntime-web/ort-wasm-simd-threaded.wasm', F.VENDOR).href };
      ort.env.logLevel = 'error';
      return ort;
    }, (e) => { ortP = null; throw e; });
    return ortP;
  };

  /** Least-squares similarity transform (scale, rotation, shift) from the five landmarks onto the template:
   * x' = a x - b y + tx, y' = b x + a y + ty. Solved through the normal equations of the 10 x 4 system. */
  function similarity(src) {
    const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v = [0, 0, 0, 0];
    src.forEach(([x, y], i) => {
      const X = TEMPLATE[i][0], Y = TEMPLATE[i][1];
      for (const [row, t] of [[[x, -y, 1, 0], X], [[y, x, 0, 1], Y]]) {
        for (let r = 0; r < 4; r++) { v[r] += row[r] * t; for (let c = 0; c < 4; c++) M[r][c] += row[r] * row[c]; }
      }
    });
    const sol = solve(M, v);
    return sol ? { a: sol[0], b: sol[1], tx: sol[2], ty: sol[3] } : null;
  }
  /** Gaussian elimination for a small dense system; null when singular. */
  function solve(M, v) {
    const m = M.map((r, i) => [...r, v[i]]), k = m.length;
    for (let c = 0; c < k; c++) {
      let p = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      if (Math.abs(m[p][c]) < 1e-12) return null;
      [m[c], m[p]] = [m[p], m[c]];
      for (let r = 0; r < k; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let j = c; j <= k; j++) m[r][j] -= f * m[c][j]; }
    }
    return m.map((r, i) => r[k] / r[i]);
  }

  /** The recogniser's session, loaded once: the file is fetched and checked by sha256 before it is opened. */
  let sessionP = null;
  async function session() {
    if (!sessionP) sessionP = (async () => {
      const res = await fetch(new URL('face/' + RECOG.file, F.VENDOR).href);
      if (!res.ok) throw new Error(tr('ui.faces.recog_missing', { status: String(res.status) }));
      const bytes = await res.arrayBuffer();
      if (!g.crypto || !g.crypto.subtle) throw new Error(tr('ui.faces.model_check'));
      if (hex(await g.crypto.subtle.digest('SHA-256', bytes)) !== RECOG.sha256) throw new Error(tr('ui.faces.recog_sum'));
      const ort = await F.runtime();
      const s = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return { s, ort, input: s.inputNames[0], output: s.outputNames[0] };
    })().catch((e) => { sessionP = null; throw e; });
    return sessionP;
  }

  /** One face's embedding: unit length, DIM values, or null when the face has no landmarks. source: an ImageBitmap, canvas
   * or image. Throws when the model is missing or fails (the caller keeps nothing in that case). */
  F.recognizer = {
    async embed(source, face) {
      if (!face || !face.kps || face.kps.length !== 5) return null;
      const T = similarity(face.kps);
      if (!T) return null;
      const c = document.createElement('canvas');
      c.width = SIZE; c.height = SIZE;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.setTransform(T.a, T.b, -T.b, T.a, T.tx, T.ty);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0);
      const px = ctx.getImageData(0, 0, SIZE, SIZE).data, plane = SIZE * SIZE, t = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) { t[i] = px[i * 4]; t[plane + i] = px[i * 4 + 1]; t[2 * plane + i] = px[i * 4 + 2]; }
      const { s, ort, input, output } = await session();
      const out = await s.run({ [input]: new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]) });
      const v = Array.from(out[output].data).slice(0, DIM);
      const norm = Math.sqrt(v.reduce((n, x) => n + x * x, 0)) || 1;
      return v.map((x) => Math.round((x / norm) * 1e6) / 1e6);
    },
  };
  /** The embedder analyse() uses. Tests replace it with setEmbedder(fn). */
  let embedder = null, custom = false;
  F.setEmbedder = (fn) => { custom = !!fn; embedder = fn || null; };
  const embedOne = (source, face) => (embedder ? embedder(source, face) : F.recognizer.embed(source, face));
  /** Whether faces can get embeddings now (the model is installed and checks out, or a test embedder is set). */
  F.recogniserReady = async function () {
    if (custom) return true;
    try { await session(); return true; } catch (e) { return false; }
  };
  /** Adds emb to each face (null when it has no landmarks). rec: 1 when every face was embedded, 0 when the recogniser
   * could not run (the faces are kept without embeddings; they count, but are not grouped, and are checked again later). */
  F.embedFaces = async function (source, faces) {
    try {
      const out = [];
      for (const f of faces) out.push(Object.assign({}, f, { emb: await embedOne(source, f) }));
      return { faces: out, rec: 1 };
    } catch (e) {
      F.lastRecError = (e && e.message) || String(e);
      return { faces: faces.map((f) => Object.assign({}, f, { emb: null })), rec: 0 };
    }
  };
  /** Cosine distance between two embeddings: 0 for the same direction, up to 2. */
  F.cosineDistance = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? 1 - dot / Math.sqrt(na * nb) : 1;
  };
  F.similarity = similarity;
  F.TEMPLATE = TEMPLATE;
})(typeof window !== 'undefined' ? window : globalThis);
