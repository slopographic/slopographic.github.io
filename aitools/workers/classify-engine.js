/* Slop AI Tools tag engine (classic script for infer.worker.js): MobileNetV3 Large 100 (ImageNet, ONNX).
 * Preprocessing as timm does for this model: short side to 256, centre crop 224, ImageNet mean and std, RGB.
 * Exposes self.SlopAITags = { classify(session, labels, rgba, w, h) } → top labels with probabilities. */
(function (root) {
  'use strict';
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

  /** Centre crop of the RGBA image at 224×224 after a 256 short-side resize, as NCHW floats. */
  function prepare(bitmap, w, h) {
    const k = 256 / Math.min(w, h), rw = Math.round(w * k), rh = Math.round(h * k);
    const c = new OffscreenCanvas(rw, rh), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0, rw, rh);
    const sx = Math.round((rw - 224) / 2), sy = Math.round((rh - 224) / 2);
    const d = g.getImageData(sx, sy, 224, 224).data, n = 224 * 224, out = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) out[ch * n + i] = (d[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    return out;
  }
  /**
   * Top-k labels for one image. Resolves [{ label, p }] with probabilities summing to one over the classes.
   * label is the first name of the ImageNet synset, lower case (for example "tabby").
   */
  async function classify(session, labels, bitmap, w, h, k = 8) {
    const ort = await root.SlopAIOrt.get();
    const input = new ort.Tensor('float32', prepare(bitmap, w, h), [1, 3, 224, 224]);
    const out = await session.run({ [session.inputNames[0]]: input });
    const t = out[session.outputNames[0]].data;
    let mx = -Infinity;
    for (const v of t) if (v > mx) mx = v;
    let sum = 0;
    const e = new Float64Array(t.length);
    for (let i = 0; i < t.length; i++) { e[i] = Math.exp(t[i] - mx); sum += e[i]; }
    const order = Array.from(e.keys()).sort((a, b) => e[b] - e[a]).slice(0, k);
    return order.map((i) => ({ label: String(labels[i] || 'class ' + i).split(',')[0].trim().toLowerCase(), p: e[i] / sum }));
  }

  root.SlopAITags = { classify, prepare };
})(self);
