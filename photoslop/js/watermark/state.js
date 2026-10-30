/* PhotoSlop watermark: each document's watermark (D.wm) and this device's default. The watermark is the site's one spec
 * (shared/watermark/spec.js) and the drawing its one engine (shared/watermark/core.js). Off until the person turns it
 * on, per document: the device default carries the look only, never the switch. D.wm is { on, spec }; the spec holds
 * any logo as a data URL, so it is saved with the file (PSD resource, autosave, Slop Drive). Settings saved before the
 * spec ({ on, cfg }) still open. */
'use strict';

const WM_RES_ID = 8100; // the PSD image resource that holds the settings (psd.js); a private id Photoshop keeps as is
const WM_DEFAULT_MAX = 1048576; // a device default with a logo bigger than this keeps the text layers only
let wmVer = 0; // bumped on every change, so the page preview knows to repaint

/** A saved watermark as a spec: { spec } now, { cfg } (one mark, cfg.logo its picture) from before. null when neither. */
function wmSpecOf(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (saved.spec) return SlopWatermarkSpec.normalize(saved.spec);
  if (saved.cfg) return SlopWatermarkSpec.fromCfg(saved.cfg);
  if (saved.layers || saved.kind || saved.text) return SlopWatermarkSpec.normalize(saved);   // a device default of either age
  return null;
}
/** The look this device uses for a new document. */
function wmDefaults() { return wmSpecOf(store.get('watermark.defaults', null)) || SlopWatermarkSpec.defaults(); }
function wmOn() { return !!(D.wm && D.wm.on); }
/** The document's watermark, made from the device default the first time it is needed (switched off). */
function wmState() { return D.wm || (D.wm = { on: false, spec: wmDefaults() }); }
/** Replaces the document's watermark with a new object (so tab stashes and autosave keep the old one). */
function wmUpdate(patch) { D.wm = Object.assign({}, wmState(), patch); wmChanged(); }
function wmChanged() { wmVer++; D.dirty = true; scheduleAutosave(); dirty(); emit('watermark'); }
function wmSetOn(on) { wmUpdate({ on: !!on }); }
function wmToggle() { wmSetOn(!wmOn()); toast(tr(wmOn() ? 'photoslop.wm.toast_on' : 'photoslop.wm.toast_off')); }
function wmSetSpec(spec) { wmUpdate({ spec: SlopWatermarkSpec.normalize(spec) }); }
/** Keeps the current look as this device's default for new documents (the switch is not kept). */
function wmSaveDefaults() {
  let spec = wmState().spec;
  if (JSON.stringify(spec).length > WM_DEFAULT_MAX) spec = Object.assign({}, spec, { layers: spec.layers.filter((L) => L.kind !== 'logo') });
  store.set('watermark.defaults', spec);
  toast(tr('photoslop.wm.saved_default'));
}
/** Back to the device default look; the switch stays. */
function wmResetStyle() { wmUpdate({ spec: wmDefaults() }); }
/** After a document that carried a watermark is opened (PSD, autosave, Slop Drive): its settings, of either age. */
function adoptWatermark(saved) {
  D.wm = { on: !!saved.on, spec: wmSpecOf(saved) || wmDefaults() };
  wmVer++; dirty(); emit('watermark');
}
// a logo finishing its decode repaints the page view
SlopWatermark.onLogo(() => { wmVer++; dirty(); });
