/* PhotoSlop and AI pictures: where a picture made with the person's own key goes, and what an edit starts from.
 * Loaded on first use by psImageGen() (js/app/commands.js), with the shared module shared/ai/imagegen/ (the providers,
 * the dialog, generate_image / edit_image for the AI panel). window.SlopImageSink (set at boot in commands.js) forwards
 * here. One history step per picture.
 *   psImageSink.place(images, { target: 'layer' | 'document', name }) → the sentence for the panel
 *       layer: a new layer above the active one, the picture fitted inside the document and centred (an edit's
 *       result is already the document's size and lands exactly on it); document: a new tab the picture's size
 *   psImageSink.source() → { canvas (the active layer in document space), selection (D.sel's mask or null), name }
 *   psImageGenOpen(mode, args) → the shared "Generate image…" / "Edit with AI…" dialog */
'use strict';

async function psGenSettle() { if (TE.el) await endTypeEdit(); if (TRANSFORM.active) commitTransform(); }

const psImageSink = {
  app: 'photoslop', name: 'PhotoSlop', targets: ['layer', 'document', 'drive'], // i18n-ignore: replies to the assistant (API) and the app name
  async place(images, { target = 'layer', name = 'AI picture' } = {}) { // i18n-ignore: the default layer name is the document's
    await psGenSettle();
    const names = [];
    for (let i = 0; i < images.length; i++) {
      const bmp = await createImageBitmap(images[i].blob), nm = (images.length > 1 ? `${name} ${i + 1}` : name).slice(0, 80);
      if (target === 'document' || !D.layers) {
        const c = mkCanvas(bmp.width, bmp.height); cx(c).drawImage(bmp, 0, 0);
        openDocTab(bmp.width, bmp.height, [{ name: nm, canvas: c }], nm);
      } else {
        const k = Math.min(1, D.w / bmp.width, D.h / bmp.height), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
        const c = mkCanvas(w, h); cx(c).drawImage(bmp, 0, 0, w, h);
        addLayer({ name: nm, canvas: c, x: Math.round((D.w - w) / 2), y: Math.round((D.h - h) / 2) }, tr('photoslop.gen.step_generate'));
      }
      if (bmp.close) bmp.close();
      names.push(nm);
    }
    const list = names.map((n) => `“${n}”`).join(', ');
    return target === 'document' ? `Opened ${list} as a new document.` : `Added ${list} as a new layer.`; // i18n-ignore: replies to the assistant (API) and the app name
  },
  async source() {
    await psGenSettle();
    const L = activeLayer();
    if (!L) throw new Error(tr('photoslop.gen.no_layer'));
    const c = mkCanvas(D.w, D.h), b = bakedLayer(L);
    cx(c).drawImage(b.canvas, b.x, b.y);
    return { canvas: c, selection: D.sel ? D.sel.mask : null, name: L.name };
  },
};

async function psImageGenOpen(mode = 'generate', args = {}) {
  const r = await SlopAIKit.imageGen.dialog({ mode, sink: window.SlopImageSink || psImageSink, args: args || {} });
  if (r) fitView();
  return r ? r.text : 'Closed without making a picture.'; // i18n-ignore: replies to the assistant (API) and the app name
}
