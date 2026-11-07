/* SlopCut: the watermark module, state and drawing. The open project keeps its watermark in doc.watermark = { on, spec }
   (the site's one watermark spec, shared/watermark/spec.js; saved with the project file, undoable through SE.change). A
   project without it keeps the watermark OFF and takes its look from this device's saved default. A project saved before
   the spec kept one flat mark ({ on, kind, text, ..., logo }): it still opens. The pixels come from the shared engine
   (shared/watermark/core.js); SE.compositor.render calls apply() after the layers are drawn, with the frame's time (a
   layer with a time range shows only then), so the monitor, snapshots and every export (MP4, WebM, GIF, real-time
   recording) get the same frame. Switching the module off: remove its script tags from index.html. Every call site checks
   for SE.watermark first. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, S = window.SlopWatermarkSpec;
  const WM = SE.watermark = {};
  const KEY = 'watermark'; // device default (localStorage key slopedit.watermark)

  /** A stored watermark as a spec: { spec } now, or the flat mark of before. null when it is neither. */
  function specOf(w) {
    if (!w || typeof w !== 'object') return null;
    if (w.spec) return S.normalize(w.spec);
    if (w.layers) return S.normalize(w);
    if ('kind' in w || 'text' in w || 'logo' in w) return S.fromCfg(w);
    return null;
  }
  /** This device's look for new watermarks. */
  WM.deviceDefaults = () => specOf(U.store.get(KEY, null)) || S.defaults();
  /** The watermark of a project: { on, spec }. Off unless the person turned it on. */
  WM.settings = (p = SE.doc) => ({ on: !!(p.watermark && p.watermark.on), spec: specOf(p.watermark) || WM.deviceDefaults() });
  /** Change the watermark of the open project as one undoable step (a drag or typing coalesces by key). */
  WM.set = function (patch, label = U.t('slopedit.bin.watermark'), key = 'wm') {
    SE.change(label, (p) => { const s = WM.settings(p); p.watermark = { on: 'on' in patch ? !!patch.on : s.on, spec: patch.spec ? S.normalize(patch.spec) : s.spec }; }, { key: 'wm:' + key });
  };
  /** Keep the current watermark as this device's default (the on switch stays per project). */
  WM.saveDefaults = function () { U.store.set(KEY, WM.settings().spec); };
  /** Copy this device's default into the open project. */
  WM.useDefaults = function () { WM.set({ spec: WM.deviceDefaults() }, U.t('slopedit.wm.watermark_style'), 'style'); };

  /** Resolves when the logos of a project's watermark (if it is on) are decoded. Export waits for it, like text fonts. */
  WM.ready = async function (p = SE.doc) {
    const s = WM.settings(p);
    if (s.on) await SlopWatermark.ready(s.spec);
  };
  /** Draw the watermark on a frame of w × h at time t (the transform is the identity). Called by the compositor. */
  WM.apply = function (g, w, h, p = SE.doc, t) {
    const s = WM.settings(p);
    if (!s.on || !window.SlopWatermark) return;
    SlopWatermark.draw(g, w, h, s.spec, t == null ? {} : { time: t });
  };
  // a logo that finishes decoding redraws the monitor
  if (window.SlopWatermark) SlopWatermark.onLogo(() => SE.emit('frame', {}));
})();
