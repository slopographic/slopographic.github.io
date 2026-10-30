/* PhotoSlop for the assistant: the on-device AI tools as operations (remove background → a layer mask, upscale 2× or
 * 4×, denoise). They reuse the engines the site already has: shared/cutout (U²-Netp, bundled), Slop Upscale's tiled
 * FSRCNN pipeline (upscale/js/, bundled) and the AI Tools denoise filters (aitools/denoise/filters.js, no model).
 * Their code loads only when first used, after the shared first-use notice (shared/firstrun/notice.js) has named
 * what is downloaded and its real size. One history step each. Loaded on demand with ai-ops.js. */
'use strict';

const AI_RUNTIME = { name: 'ONNX Runtime (WebAssembly)', bytes: 14239897 }; // i18n-ignore: a product name   // vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm
const aiScriptsLoaded = new Map();
function aiScript(src) {
  if (!aiScriptsLoaded.has(src)) aiScriptsLoaded.set(src, new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = () => { aiScriptsLoaded.delete(src); rej(new Error('Could not load ' + src + ' (offline?)')); };
    document.head.append(s);
  }));
  return aiScriptsLoaded.get(src);
}
const aiScripts = (list) => list.reduce((p, s) => p.then(() => aiScript(s)), Promise.resolve());
/** The shared first-use notice for one model, once per model. Resolves, or throws when the person says no. */
async function aiNotice(key, title, downloads) {
  if (!window.SlopFirstRun) await aiScript('../shared/firstrun/notice.js');
  const ok = await SlopFirstRun.once('photoslop-ai-' + key, { title, lines: [tr('photoslop.ai.notice_local')], downloads });
  if (!ok) throw new Error(tr('photoslop.ai.notice_cancelled'));
}

/** Remove background: the subject of the active layer becomes its mask (mode 'mask'), or the rest is erased ('delete'). */
async function aiRemoveBackground(a) {
  await aiSettle();
  const L = aiLayer();
  if (!window.SlopCutout) throw new Error('The background remover is not on this page');
  const bytes = (window.SlopCutoutModels && SlopCutoutModels.MODELS && SlopCutoutModels.MODELS.fast.bytes) || 4574105;
  await aiNotice('cutout', tr('photoslop.ai.notice_cutout'), [{ name: tr('photoslop.ai.model_subject'), bytes }, AI_RUNTIME]);
  const src = mkCanvas(D.w, D.h), g = cx(src);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, D.w, D.h);
  g.drawImage(bakedLayer(L).canvas, L.x, L.y);
  toast(tr('photoslop.ai.finding_subject'));
  const r = await SlopCutout.removeBackground(src, { model: 'fast' });
  const m = mkCanvas(D.w, D.h), img = new ImageData(D.w, D.h);
  for (let i = 0; i < D.w * D.h; i++) img.data[i * 4 + 3] = r.mask[i];
  cx(m).putImageData(img, 0, 0);
  const LL = D.layers.find((l) => l.id === L.id) || L;
  if (a.mode === 'delete') {
    const c = mkCanvas(D.w, D.h), cg = cx(c);
    cg.drawImage(LL.canvas, LL.x, LL.y); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(m, 0, 0);
    setLayerProps(LL.id, { canvas: c, x: 0, y: 0, text: null, shape: null, mask: null }, tr('photoslop.ai.step_remove_bg'));
    return 'Erased the background of “' + LL.name + '”.'; // i18n-ignore: the reply to the assistant (API)
  }
  setLayerProps(LL.id, { mask: { canvas: m, x: 0, y: 0, def: false, enabled: true } }, tr('photoslop.ai.step_remove_bg'));
  return 'The background of “' + LL.name + '” is hidden by a layer mask (paint the mask white to bring parts back).'; // i18n-ignore: the assistant's commands, their docs and replies are API
}

/** Upscale the whole document 2× or 4× with the bundled FSRCNN model (Slop Upscale's tiled pipeline), layer by layer. */
async function aiUpscale(a) {
  await aiSettle();
  const s = Number(a.scale) === 4 ? 4 : 2, id = 'fsrcnn-x' + s;
  await aiScripts(['../upscale/js/core/tiling.js', '../upscale/js/core/lanczos.js', '../upscale/js/core/models.js', '../upscale/js/engine/engine.js', '../upscale/js/engine/pipeline.js']);
  const why = SlopUpscalePipeline.check(D.w, D.h, s);
  if (why) throw new Error(why);
  await aiNotice('upscale', tr('photoslop.ai.notice_upscale', { n: String(s) }), [{ name: tr('photoslop.ai.model_upscale', { n: String(s) }), bytes: SlopUpscaleModels.get(id).bytes }, AI_RUNTIME]);
  toast(tr('photoslop.ai.upscaling', { n: String(s) }));
  const layers = [];
  for (const L of D.layers) {
    let L2;
    if (L.text) { const t = scaleTextModel(L.text, s, s), r = renderTextCanvas(t); L2 = Object.assign({}, L, { canvas: r.canvas, x: r.x, y: r.y, text: t }); }
    else L2 = Object.assign({}, L, { canvas: await SlopUpscalePipeline.run(L.canvas, { scale: s, model: id }), x: L.x * s, y: L.y * s, shape: null });
    if (L.mask) L2.mask = Object.assign({}, L.mask, { canvas: resampleCanvas(L.mask.canvas, L.mask.canvas.width * s, L.mask.canvas.height * s), x: L.mask.x * s, y: L.mask.y * s });
    layers.push(L2);
  }
  D.layers = layers; D.w *= s; D.h *= s; D.sel = null;
  remapGuides((g) => ({ o: g.o, pos: g.pos * s }));
  commit(tr('photoslop.ai.step_upscale', { n: String(s) }));
  fitView();
  return `The image is now ${D.w} × ${D.h} px.`; // i18n-ignore: the assistant's commands, their docs and replies are API
}

/** The AI Tools edge-keeping filter (aitools/denoise/filters.js, bilateral) on a canvas: a new canvas. Also used by
 *  Auto retouch's denoise (js/retouch/enhance.js). strength: light | medium | strong. */
async function aiDenoiseCanvas(c, strength) {
  await aiScript('../aitools/denoise/filters.js');
  const [r, sr] = { light: [2, 18], medium: [3, 30], strong: [4, 48] }[strength] || [3, 30];
  const w = c.width, hh = c.height, d = cxr(c).getImageData(0, 0, w, hh);
  const out = mkCanvas(w, hh);
  cx(out).putImageData(new ImageData(SlopAIFilters.bilateral(d.data, w, hh, r, sr), w, hh), 0, 0);
  return out;
}
/** Denoise the active layer (or the selection) with the AI Tools edge-keeping filter. */
async function aiDenoise(a) {
  await aiSettle();
  aiLayer();
  const out = await aiDenoiseCanvas(activeLayer().canvas, a.strength);
  await aiOneStep(tr('photoslop.ai.step_denoise'), () => applyToLayer(tr('photoslop.ai.step_denoise'), () => out));
  return `Denoised “${activeLayer().name}” (${a.strength}).`; // i18n-ignore: the assistant's commands, their docs and replies are API
}
