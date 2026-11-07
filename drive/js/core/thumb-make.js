/* Slop Drive — core/thumb-make: makes the thumbnail and its facts for one file. DR.makeThumb(r) → { blob, info }.
 * Images (raster and SVG) are scaled down; PDFs show page 1 (vendored PDF.js); video shows a frame at 1 s; audio shows a
 * waveform from decoded samples; .s3d scenes are rendered offscreen (core/render3d.js) or drawn as a 3D card without WebGL;
 * Slop documents, sheets and slides show their first paragraph, slide text or first cell; text and CSV show their first
 * lines or header. Everything else gets a typed card. A generator that fails falls back to the card and is logged once.
 * DR.makeThumb never rejects. */
'use strict';
(function (DR) {
  const SIZE = 320, PDF_MAX = 60 * 1048576, AUDIO_MAX = 80 * 1048576, DOC_MAX = 20 * 1048576;
  const fit = (w, h, max = SIZE) => { const s = Math.min(1, max / Math.max(w, h, 1)); return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }; };
  const dur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  /** A typed card as { blob, info }. */
  async function cardOf(r, spec = {}, info = {}) {
    return { blob: await DR.drawCard(r, spec), info: Object.assign({ kind: 'card' }, info) };
  }
  async function imageThumb(r) {
    if (DR.isSvg(r)) {
      const url = URL.createObjectURL(r.blob);
      try {
        const img = new Image(); img.src = url; await img.decode();
        const w = img.naturalWidth || SIZE, h = img.naturalHeight || SIZE, d = fit(w, h), c = DR.canvasOf(d.w, d.h);
        c.getContext('2d').drawImage(img, 0, 0, d.w, d.h);
        return { blob: await DR.canvasBlob(c), info: { kind: 'image', w, h } };
      } finally { URL.revokeObjectURL(url); }
    }
    const bmp = await createImageBitmap(r.blob);
    try {
      const d = fit(bmp.width, bmp.height), c = DR.canvasOf(d.w, d.h);
      c.getContext('2d').drawImage(bmp, 0, 0, d.w, d.h);
      return { blob: await DR.canvasBlob(c), info: { kind: 'image', w: bmp.width, h: bmp.height } };
    } finally { bmp.close(); }
  }
  async function pdfThumb(r, blob = r.blob) {
    const doc = await DR.openPdf(blob);
    try {
      const c = await DR.renderPdfPage(doc, 1, SIZE), p1 = (await doc.getPage(1)).getViewport({ scale: 1 });
      return { blob: await DR.canvasBlob(c), info: { kind: 'pdf', pages: doc.numPages, w: Math.round(p1.width), h: Math.round(p1.height), unit: 'pt' } };
    } finally { doc.destroy(); }
  }
  /** An Illustrator file: page 1 of the PDF inside it, or a card when there is none. */
  async function aiThumb(r) {
    const pdf = await DR.aiPdfBlob(r.blob);
    if (!pdf) return cardOf(r, {}, { kind: 'card' });
    return pdfThumb(r, pdf);
  }
  /** A frame one second in (or the last frame of a shorter clip): { c, meta }. */
  function videoFrame(r) {
    return new Promise((res, rej) => {
      const v = document.createElement('video'), url = URL.createObjectURL(r.blob), meta = {};
      let settled = false, timer = 0;
      const end = (err, out) => {
        if (settled) return;
        settled = true; clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load();
        if (err) rej(err); else res(out);
      };
      timer = setTimeout(() => end(new Error('the video did not load in time')), 8000);
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      v.onloadedmetadata = () => {
        Object.assign(meta, { w: v.videoWidth, h: v.videoHeight, duration: v.duration });
        v.currentTime = Math.min(1, Math.max(0, (v.duration || 1) - 0.1));
      };
      v.onseeked = () => {
        try {
          const d = fit(meta.w || SIZE, meta.h || 180), c = DR.canvasOf(d.w, d.h);
          c.getContext('2d').drawImage(v, 0, 0, d.w, d.h);
          end(null, { c, meta: Object.assign({}, meta) });
        } catch (e) { end(e); }
      };
      v.onerror = () => end(new Error('the video could not be read'));
      v.src = url;
    });
  }
  async function videoThumb(r) {
    const { c, meta } = await videoFrame(r);
    return { blob: await DR.canvasBlob(c), info: { kind: 'video', w: meta.w, h: meta.h, duration: meta.duration } };
  }
  async function audioThumb(r) {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const audio = await new Ctx(1, 1, 44100).decodeAudioData(await r.blob.arrayBuffer());
    const N = 1000, ch = audio.numberOfChannels, len = audio.length, step = Math.max(1, Math.floor(len / N));
    const data = [...Array(ch)].map((_, c) => audio.getChannelData(c)), peaks = [];
    for (let i = 0; i < N; i++) {
      let p = 0;
      for (let k = i * step, to = Math.min(len, k + step); k < to; k++) {
        let v = 0;
        for (let c = 0; c < ch; c++) v += Math.abs(data[c][k]);
        p = Math.max(p, v / ch);
      }
      peaks.push(Math.min(1, p));
    }
    const sub = `${dur(audio.duration)} · ${DR.kindLabel(r)}`, card = [];
    for (let i = 0; i < 180; i++) card.push(Math.max(...peaks.slice(Math.floor(i * N / 180), Math.floor((i + 1) * N / 180))));
    const rounded = peaks.map((v) => Math.round(v * 1000) / 1000);
    return cardOf(r, { wave: card, sub, color: DR.kindColor(r) }, { kind: 'audio', duration: audio.duration, channels: ch, rate: audio.sampleRate, peaks: rounded });
  }
  async function threeThumb(r) {
    if (!DR.webgl3d()) return cardOf(r, { big: '3D', sub: DR.t('drive.kind.no_webgl_card') }, { kind: '3d' });
    return { blob: await DR.snapshot3d(r.blob, SIZE, 240), info: { kind: '3d' } };
  }
  const colName = (c) => { let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  /** The first cell (and a few more) of the first sheet of a .stab. */
  function sheetLines(obj) {
    const sh = (obj.sheets || [])[0] || {};
    const cells = (sh.cells || []).filter(([, , rec]) => rec && ((rec.v !== undefined && rec.v !== null && rec.v !== '') || rec.f !== undefined))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return [sh.name, ...cells.slice(0, 6).map(([row, col, rec]) => `${colName(col)}${row + 1}  ${rec.v !== undefined ? rec.v : '=' + rec.f}`)].filter(Boolean);
  }
  /** The first paragraphs of a document (blocks with runs) or slide text (paras with runs), in order. */
  function textLines(obj) {
    const out = [];
    const walk = (n, d) => {
      if (!n || typeof n !== 'object' || out.length >= 6 || d > 60) return;
      if (Array.isArray(n)) { for (const x of n) walk(x, d + 1); return; }
      if (Array.isArray(n.runs)) {
        const t = n.runs.map((x) => (x && (x.text ?? x.t)) || '').join('').replace(/￼/g, '').trim();
        if (t) out.push(t);
        return;
      }
      for (const k of Object.keys(n)) walk(n[k], d + 1);
    };
    walk(obj, 0);
    return out;
  }
  async function docThumb(r) {
    const obj = JSON.parse(await r.blob.text());
    const lines = DR.ext(r.name) === 'stab' ? sheetLines(obj) : textLines(obj);
    return cardOf(r, { lines }, { kind: 'doc', lines });
  }
  async function textThumb(r) {
    const head = await r.blob.slice(0, 4096).text();
    const lines = head.replace(/\r/g, '').split('\n').map((l) => l.replace(/\t/g, '  ')).filter((l) => l.trim()).slice(0, 7);
    return cardOf(r, { lines, mono: true }, { kind: 'text', lines });
  }
  async function csvThumb(r) {
    const sep = DR.sepFor(r), rows = DR.parseRows(await r.blob.slice(0, 16384).text(), { max: 4, sep });
    const header = rows[0] || [], join = (row) => row.join(sep === '\t' ? '  |  ' : '  |  ');
    const lines = [join(header), ...rows.slice(1, 3).map(join)].filter((l) => l.trim());
    return cardOf(r, { lines, mono: true, sub: DR.t('drive.kind.csv_sub', { n: header.length, kind: DR.kindLabel(r) }) }, { kind: 'csv', header, lines });
  }

  /** The thumbnail of a file: { blob, info }. Never rejects. */
  DR.makeThumb = async function (r) {
    const kind = DR.kindOf(r), e = DR.ext(r.name);
    if (!r.size) return cardOf(r, {}, { kind: kind === 'doc' ? 'doc' : 'card' }); // a new, empty file is not an error
    try {
      if (kind === 'image') return await imageThumb(r);
      if (kind === 'pdf' && r.size < PDF_MAX) return await pdfThumb(r);
      if (DR.isAi(r) && r.size < PDF_MAX) return await aiThumb(r);
      if (kind === 'video') return await videoThumb(r);
      if (kind === 'audio' && r.size < AUDIO_MAX) return await audioThumb(r);
      if (kind === 'model' && e === 's3d') return await threeThumb(r);
      if (kind === 'doc' && r.size <= DOC_MAX) return await docThumb(r);
      if (e === 'csv' || e === 'tsv') return await csvThumb(r);
      if (kind === 'text') return await textThumb(r);
    } catch (err) { DR.logThumbError(r, err); }
    try { return await cardOf(r, {}, { kind: kind === 'doc' ? 'doc' : 'card' }); } catch (err) { DR.logThumbError(r, err); return { blob: null, info: {} }; }
  };
})(window.DR);
