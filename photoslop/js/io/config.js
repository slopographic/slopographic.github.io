/* PhotoSlop: the shared config kind 'document' for app 'photoslop' (shared/config, HANDOFF.md there). The file holds the
   canvas size and the layer stack (name, visible, locked, opacity, blend mode, position) and, for each layer, the picture it
   holds, named by file (<layer>.png). Pictures are not in the file: after an import the layers are listed as waiting, and
   the person adds the pictures; a picture is placed on the layer with the same file name. Import opens a new tab (the
   open documents are kept). Classic script: uses the globals of core/ and app/tabs.js at call time. Exposes window.PSConfig. */
(function () {
  'use strict';
  const C = window.SlopConfig, D0 = window.SlopConfigDialog, F = C && C.F;
  const APP = 'photoslop';
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const safeFile = (s) => String(s || 'layer').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim().slice(0, 100) || 'layer';

  /** Layers waiting for their picture after an import: { id, file, x, y }. */
  const PS = (window.PSConfig = { waiting: [] });

  async function read() {
    const layers = [];
    for (const L of D.layers) {
      const blob = await canvasToBlob(L.canvas);
      layers.push({
        name: String(L.name || 'Layer').slice(0, 120), // i18n-ignore: written into the config file visible: !!L.visible, locked: !!L.locked,
        opacity: r3(L.opacity), blend: L.blend || 'normal', x: Math.round(L.x || 0), y: Math.round(L.y || 0),
        image: { name: safeFile(L.name) + '.png', size: blob ? blob.size : 0 },
      });
    }
    return { document: { width: D.w, height: D.h }, layers };
  }

  /** Puts a picture onto a waiting layer, matched by file name. Returns true when one was placed. */
  async function place(file) {
    const i = PS.waiting.findIndex((w) => w.file === file.name);
    if (i < 0) return false;
    const w = PS.waiting.splice(i, 1)[0];
    const img = await loadImage(URL.createObjectURL(file));
    const c = mkCanvas(D.w, D.h);
    cx(c).drawImage(img, w.x, w.y);
    patchLayer(w.id, { canvas: c });
    commit(tr('photoslop.io.step_place_picture'));
    return true;
  }

  function askForPictures() {
    if (!PS.waiting.length || !window.SlopUI) return;
    const names = PS.waiting.map((w) => SlopUI.el('li', null, w.file));
    SlopUI.dialog({
      title: tr('photoslop.io.pictures_title'),
      body: SlopUI.el('div', null,
        SlopUI.el('p', { class: 'sui-p' }, tr('photoslop.io.pictures_body')),
        SlopUI.el('ul', { class: 'sui-errors' }, names)),
      buttons: [{ label: tr('photoslop.io.later') }, { label: tr('photoslop.io.add_pictures'), primary: true, act: async () => {
        // the pictures come in the one way (shared/intake): a spec of their own, each placed on its layer
        SlopIntake.register({ id: 'photoslop.layer-pictures', main: false, paste: false, toast: false,
          accept: { types: ['image/*'], noun: 'photoslop.io.noun_picture' }, process: (f) => place(f) });
        await SlopIntake.pick({ to: 'photoslop.layer-pictures' });
        if (PS.waiting.length) askForPictures();
      } }],
    });
  }

  async function apply(data, ctx) {
    const w = data.document.width, h = data.document.height;
    const layers = data.layers.map((l) => ({ name: l.name, visible: l.visible !== false, locked: !!l.locked, opacity: l.opacity == null ? 1 : l.opacity, blend: l.blend || 'normal', x: l.x || 0, y: l.y || 0 }));
    const r = openDocTab(w, h, layers, ctx.name);
    if (r && r.then) await r;
    PS.waiting = data.layers.map((l, i) => ({ id: D.layers[i] && D.layers[i].id, file: l.image ? l.image.name : null, x: l.x || 0, y: l.y || 0 }))
      .filter((x) => x.id && x.file);
    askForPictures();
  }

  if (C && D0 && F) {
    const BLEND = BLENDS.map((b) => b[0]);
    C.registerKind('document', APP, {
      strict: true,
      fields: {
        document: F.obj({
          width: F.int({ min: 1, max: 12000, required: true, desc: 'canvas width in pixels' }), // i18n-ignore: the config schema (files and the assistant)
          height: F.int({ min: 1, max: 12000, required: true, desc: 'canvas height in pixels' }), // i18n-ignore: the config schema (files and the assistant)
        }, { required: true, desc: 'the canvas size' }), // i18n-ignore: the config schema (files and the assistant)
        layers: F.list(F.obj({
          name: F.str({ max: 120, required: true, desc: 'layer name' }), // i18n-ignore: the config schema (files and the assistant)
          visible: F.bool(), locked: F.bool(),
          opacity: F.num({ min: 0, max: 1, desc: '0 to 1' }), // i18n-ignore: the config schema (files and the assistant)
          blend: F.enum(BLEND, { desc: 'blend mode, e.g. normal, multiply, screen' }), // i18n-ignore: the config schema (files and the assistant)
          x: F.int({ min: -12000, max: 12000, desc: 'left edge in pixels' }), // i18n-ignore: the config schema (files and the assistant)
          y: F.int({ min: -12000, max: 12000, desc: 'top edge in pixels' }), // i18n-ignore: the config schema (files and the assistant)
          image: F.obj({
            name: F.str({ max: 200, required: true, desc: 'the picture file name; the file you add is matched by this name' }), // i18n-ignore: the config schema (files and the assistant)
            size: F.int({ min: 0, max: 1e12, required: true, desc: 'file size in bytes' }), // i18n-ignore: the config schema (files and the assistant)
          }, { desc: 'the picture on this layer (not in the file)' }), // i18n-ignore: the config schema (files and the assistant)
        }), { min: 1, max: 200, required: true, desc: 'the layers, bottom first' }), // i18n-ignore: the config schema (files and the assistant)
      },
    }, apply, {
      get label() { return tr('photoslop.io.cfg_document'); }, get description() { return tr('photoslop.io.cfg_document_desc'); },
      read,
    });
    D0.install({ app: APP });
  }
})();
