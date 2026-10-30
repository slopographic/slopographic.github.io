/* Slop AI Tools OCR engine (classic script for infer.worker.js). PP-OCRv4 mobile, run with ONNX Runtime:
 * 1. detection (DB): the page is scaled so its long side is at most 960 px and both sides are multiples of 32;
 *    the probability map is thresholded, connected blobs become boxes, and boxes on one text line are merged.
 * 2. recognition (CRNN + CTC): each line is cut from the full-resolution page, scaled to height 48 and read
 *    greedily. Each recognition model has its own dictionary (one character per line; index 0 is the CTC blank, the last
 *    index is a space): vendor/models/ppocr_keys_v1.txt for the bundled Chinese and English model, and the dictionary next to
 *    each script's model on the cdn (aitools/ocr-models.js). The detector is the same for every script.
 * 3. Arabic-script lines come out of the recogniser in visual order (right to left as drawn); logicalOrder turns them
 *    into the order they are typed, and rows of right-to-left lines read right to left.
 * Exposes self.SlopAIOcr.run(session pair, chars, page, progress). */
(function (root) {
  'use strict';
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
  /** PaddleOCR's models were trained on OpenCV BGR images, so the channels go in B, G, R order. */
  const BGR = [2, 1, 0];

  /** Scaled RGBA of the page with sides at most 960 and multiples of 32. */
  function fitDet(bitmap, w, h) {
    const k = Math.min(1, 960 / Math.max(w, h));
    const dw = Math.max(32, Math.round((w * k) / 32) * 32), dh = Math.max(32, Math.round((h * k) / 32) * 32);
    const c = new OffscreenCanvas(dw, dh), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0, dw, dh);
    return { w: dw, h: dh, data: g.getImageData(0, 0, dw, dh).data };
  }
  /** NCHW float tensor data from RGBA, ImageNet-normalised. */
  function toDetInput(img) {
    const { w, h, data } = img, out = new Float32Array(3 * w * h), n = w * h;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c * n + i] = (data[i * 4 + BGR[c]] / 255 - MEAN[c]) / STD[c];
    return out;
  }
  /** Connected blobs (4-neighbour) of the thresholded map as boxes in map pixels, with mean probability. */
  function blobs(prob, w, h, thr = 0.3) {
    const seen = new Uint8Array(w * h), out = [], stack = [];
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || prob[s] <= thr) continue;
      let x0 = w, y0 = h, x1 = -1, y1 = -1, sum = 0, cnt = 0;
      stack.push(s); seen[s] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        sum += prob[p]; cnt++;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) if (q >= 0 && !seen[q] && prob[q] > thr) { seen[q] = 1; stack.push(q); }
      }
      if (cnt < 12) continue;
      // DB unclip: the map marks the core of each glyph band, so grow the box by area × 1.6 / perimeter.
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, d = Math.round((bw * bh * 1.6) / (2 * (bw + bh)));
      out.push({ x0: Math.max(0, x0 - d), y0: Math.max(0, y0 - d), x1: Math.min(w - 1, x1 + d), y1: Math.min(h - 1, y1 + d), score: sum / cnt });
    }
    return out;
  }
  /** Merges boxes that sit on the same line (vertical overlap over half, small horizontal gap). */
  function mergeLines(boxes) {
    const sorted = boxes.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const lines = [];
    for (const b of sorted) {
      const hgt = b.y1 - b.y0 + 1;
      const l = lines.find((L) => {
        const ov = Math.min(L.y1, b.y1) - Math.max(L.y0, b.y0) + 1;
        // the gap on either side (negative when they overlap): Arabic words come out of the map right to left, and a
        // word whose box starts left of the line's must join it as well
        const gap = Math.max(b.x0 - L.x1, L.x0 - b.x1);
        return ov > 0.5 * Math.min(hgt, L.y1 - L.y0 + 1) && gap < 1.5 * hgt;
      });
      if (!l) lines.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, n: 1, score: b.score });
      else { l.x0 = Math.min(l.x0, b.x0); l.y0 = Math.min(l.y0, b.y0); l.x1 = Math.max(l.x1, b.x1); l.y1 = Math.max(l.y1, b.y1); l.score = (l.score * l.n + b.score) / (l.n + 1); l.n++; }
    }
    return lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  }
  /** Scales map-space boxes back to page pixels with a small margin. */
  function toPage(lines, sx, sy, W, H) {
    return lines.map((l) => {
      const pad = Math.max(2, Math.round((l.y1 - l.y0) * 0.2));
      return { x0: Math.max(0, Math.floor(l.x0 * sx) - pad), y0: Math.max(0, Math.floor(l.y0 * sy) - pad), x1: Math.min(W - 1, Math.ceil((l.x1 + 1) * sx) + pad), y1: Math.min(H - 1, Math.ceil((l.y1 + 1) * sy) + pad), score: l.score };
    });
  }
  /** Crops one line from the full-resolution page, scales it to height 48 and makes the recogniser input. */
  function toRecInput(page, box) {
    const cw = box.x1 - box.x0 + 1, ch = box.y1 - box.y0 + 1;
    const tw = Math.max(8, Math.min(1600, Math.round((48 * cw) / ch)));
    const c = new OffscreenCanvas(tw, 48), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(page.bitmap, box.x0, box.y0, cw, ch, 0, 0, tw, 48);
    const d = g.getImageData(0, 0, tw, 48).data, out = new Float32Array(3 * 48 * tw), n = 48 * tw;
    for (let i = 0; i < n; i++) for (let c2 = 0; c2 < 3; c2++) out[c2 * n + i] = (d[i * 4 + BGR[c2]] / 255 - 0.5) / 0.5;
    return { data: out, w: tw };
  }
  /** CTC greedy decode: argmax per step, drop blanks and repeats. Returns { text, score }. */
  function ctc(logits, T, C, chars) {
    let text = '', last = 0, sum = 0, cnt = 0;
    for (let t = 0; t < T; t++) {
      let best = 0, bv = -Infinity;
      const o = t * C;
      for (let c = 0; c < C; c++) if (logits[o + c] > bv) { bv = logits[o + c]; best = c; }
      if (best !== 0 && best !== last) { text += chars[best] || ''; sum += bv; cnt++; }
      last = best;
    }
    return { text, score: cnt ? sum / cnt : 0 };
  }

  /**
   * Runs OCR. models: { det, rec } sessions; chars: the dictionary as an array (blank and space added here).
   * page: { bitmap, data (RGBA), w, h }. Resolves to lines in reading order: [{ text, score, box: {x, y, w, h} }], with
   * .skipped: how many found lines read as nothing.
   */
  async function run(models, chars, page, progress) {
    const ort = await root.SlopAIOrt.get();
    progress({ stage: 'detect', done: 0, total: 1 });
    const det = fitDet(page.bitmap, page.w, page.h);
    const dIn = new ort.Tensor('float32', toDetInput(det), [1, 3, det.h, det.w]);
    const dOut = await models.det.run({ [models.det.inputNames[0]]: dIn });
    const map = dOut[models.det.outputNames[0]].data;
    const lines = toPage(mergeLines(blobs(map, det.w, det.h)), page.w / det.w, page.h / det.h, page.w, page.h);
    progress({ stage: 'detect', done: 1, total: 1 });
    const C = chars.length, out = [];
    let skipped = 0;
    for (let i = 0; i < lines.length; i++) {
      progress({ stage: 'read', done: i, total: lines.length });
      const r = toRecInput(page, lines[i]);
      const rIn = new ort.Tensor('float32', r.data, [1, 3, 48, r.w]);
      const rOut = await models.rec.run({ [models.rec.inputNames[0]]: rIn });
      const t = rOut[models.rec.outputNames[0]], dims = t.dims;
      if (dims[2] !== C) throw new Error(`The dictionary has ${C} symbols but the model outputs ${dims[2]} classes.`);
      const res = ctc(t.data, dims[1], dims[2], chars);
      res.text = logicalOrder(res.text);
      if (res.text.trim()) out.push({ text: res.text, score: res.score, box: { x: lines[i].x0, y: lines[i].y0, w: lines[i].x1 - lines[i].x0 + 1, h: lines[i].y1 - lines[i].y0 + 1 } });
      else skipped++;
    }
    progress({ stage: 'read', done: lines.length, total: lines.length });
    const ordered = readingOrder(out);
    ordered.skipped = skipped;   // lines found but read as nothing: a script this model has no letters for (shared/ocr/suggest.js)
    return ordered;
  }
  /** Lines in reading order: rows top to bottom (pieces whose boxes overlap by over half the smaller height share a
   * row, as a receipt's item and its price do), each row left to right. Sorting by top edge alone let a price whose box
   * starts a pixel higher come before its item. */
  function readingOrder(lines) {
    const rows = [];
    for (const l of lines.slice().sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
      const b = l.box;
      const row = rows.find((r) => Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y) > 0.5 * Math.min(r.h, b.h));
      if (row) row.items.push(l); else rows.push({ y: b.y, h: b.h, items: [l] });
    }
    return rows.flatMap((r) => {
      const rtl = r.items.filter((l) => RTL.test(l.text)).length * 2 > r.items.length;
      return r.items.sort((a, b) => (rtl ? b.box.x - a.box.x : a.box.x - b.box.x));
    });
  }
  /** Right-to-left letters: Hebrew, Arabic, Syriac, Thaana, NKo and the Arabic presentation forms. */
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  /** A line read in visual order into typed (logical) order, as PaddleOCR does for its Arabic models: runs of Latin
   *  letters, digits and number punctuation keep their order, everything is then reversed. Lines with no right-to-left
   *  letter come back unchanged. (A run's spaces at its ends are kept apart from it: "2026 ةنس" is "سنة 2026".) */
  function logicalOrder(text) {
    if (!RTL.test(text)) return text;
    const out = [];
    let run = '';
    // a run's spaces at either end belong between it and the right-to-left words, so they move with the reversal
    const flush = () => { if (!run) return; const m = /^(\s*)(.*?)(\s*)$/.exec(run); out.push(m[1], m[2], m[3]); run = ''; };
    for (const c of text) {
      if (/[a-zA-Z0-9 :*./%+-]/.test(c)) { run += c; continue; }
      flush();
      out.push(c);
    }
    flush();
    return out.reverse().join('').trim();
  }

  root.SlopAIOcr = { run, fitDet, blobs, mergeLines, ctc, toDetInput, readingOrder, logicalOrder };
})(self);
