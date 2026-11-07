/* SlopIsolate batch test helpers (window.BT): the real app in a frame, generated photos (a subject on a busy background),
 * drops through the real drop zone, and the full-resolution mask of an item. */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const BT = window.BT = {};

  /** Boot the app in a frame. opts.model: the app's model to start with; opts.workers: the engine pool size. */
  BT.open = async function ({ model = 'fast', workers = 2 } = {}) {
    try {
      localStorage.setItem('slop-firstrun:slopisolate', '1');
      localStorage.setItem('slop-cutout.model', JSON.stringify(model));
    } catch (e) { /* private window */ }
    if (BT.frame) BT.frame.remove();
    const f = BT.frame = document.createElement('iframe');
    f.style.cssText = 'width:1200px;height:800px;border:0;display:block';
    const loaded = new Promise((res) => f.addEventListener('load', res, { once: true }));
    f.src = '../../slopisolate/index.html?t=' + Date.now();
    document.body.append(f);
    await loaded;
    const W = f.contentWindow;
    await waitFor(() => W.CO && W.CO.process && W.CO.files && W.CO.files.drop, { timeout: 15000 });
    W.SlopCutout.configure({ workers });
    return W;
  };
  BT.W = () => BT.frame.contentWindow;
  BT.CO = () => BT.W().CO;

  /** A photo-like PNG: gradient, confetti rectangles, and a yellow subject (circle or triangle) with an ink outline. */
  BT.photo = async function (seed, W = 480, H = 360, shape = 'circle') {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let s = seed >>> 0;
    const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#a37');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 50; i++) { g.globalAlpha = 0.6; g.fillStyle = `hsl(${r() * 360},70%,${30 + r() * 40}%)`; g.fillRect(r() * W, r() * H, 10 + r() * W / 6, 10 + r() * H / 6); }
    g.globalAlpha = 1; g.fillStyle = '#f5d142'; g.strokeStyle = '#111'; g.lineWidth = 5; g.beginPath();
    if (shape === 'circle') g.arc(W / 2, H / 2, Math.min(W, H) * 0.3, 0, Math.PI * 2);
    else { g.moveTo(W / 2, H * 0.15); g.lineTo(W * 0.8, H * 0.85); g.lineTo(W * 0.2, H * 0.85); g.closePath(); }
    g.fill(); g.stroke();
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return new (BT.W().File)([blob], `photo-${seed}.png`, { type: 'image/png' });
  };
  /** A file that says it is a PNG but is not one (its cut-out fails). */
  BT.broken = () => new (BT.W().File)([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'broken.png', { type: 'image/png' });

  /** Drop files on the workspace, as a person does (the real drop zone, SlopDrop). */
  BT.drop = function (files, target = '#workspace') {
    const W = BT.W(), dt = new W.DataTransfer();
    for (const f of files) dt.items.add(f);
    W.document.querySelector(target).dispatchEvent(new W.DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  };
  const S = () => BT.CO().state;
  /** Wait until n items are in and none is queued or working. */
  BT.settled = (n, timeout = 240000) => waitFor(() => S().items.length === n && S().items.every((it) => it.status === 'done' || it.status === 'error'), { timeout, step: 50 });
  /** Pick a model in the Model panel (what a person does). */
  BT.pick = function (id) {
    const r = BT.W().document.querySelector(`input[name=cutout-model][value=${id}]`);
    r.checked = true;
    r.dispatchEvent(new (BT.W().Event)('change', { bubbles: true }));
  };
  /** The full-resolution final mask of a finished item (a fresh worker job, freed after). */
  BT.mask = async function (it) {
    const P = BT.CO().process, act = await P.build(it);
    try { return act.mask.slice(); } finally { if (act.bitmap && act.bitmap.close) act.bitmap.close(); BT.W().SlopCutout.release(act.jobId); }
  };
  /** Mean and largest absolute difference of two masks (0..255). */
  BT.diff = function (a, b) {
    if (a.length !== b.length) return { mean: Infinity, max: 255 };
    let sum = 0, max = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > max) max = d; }
    return { mean: sum / a.length, max };
  };
  /** Remove every item from the app (the queue's remove). */
  BT.clear = function () { for (const it of S().items.slice()) BT.CO().process.remove(it); };
})();
