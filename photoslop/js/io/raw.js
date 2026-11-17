/* PhotoSlop: camera RAW files (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW and the rest SlopRaw knows, shared/raw/).
 * Opening one shows the Develop dialog: the camera's embedded preview at once, then a half-size develop from the LibRaw
 * engine (downloaded once, after the shared first-use notice) that follows the White balance, Exposure and Highlights
 * controls. Open develops the full-size picture (8-bit sRGB, the camera's orientation applied) as one Background layer.
 * "Use embedded preview" opens the camera's JPEG without the engine. Cancel opens nothing (err.code 'cancelled').
 * Reached from readAnyFile (io/formats.js): File ▸ Open, drop, and Slop Drive files stored with an image/* type. */
'use strict';

function rawCancelled() { const e = new Error('Opening was cancelled'); e.code = 'cancelled'; return e; }
// [value, key of photoslop.raw.*]: the labels are read when the dialog opens
const RAW_WB = [['camera', 'wb_camera'], ['auto', 'wb_auto'], ['daylight', 'wb_daylight']];
const RAW_HL = [['clip', 'hl_clip'], ['blend', 'hl_blend'], ['rebuild', 'hl_rebuild']];
const rawT = (k, v) => tr('photoslop.raw.' + k, v);

/** "Canon EOS R5 · ISO 400 · 1/250 s · f/2.8 · 50 mm" from the camera settings. */
function rawMetaLine(m) {
  const sh = m.shutter ? (m.shutter >= 1 ? `${+m.shutter.toFixed(1)} s` : `1/${Math.round(1 / m.shutter)} s`) : '';
  const cam = m.model && m.make && !m.model.toLowerCase().startsWith(m.make.toLowerCase().split(' ')[0]) ? `${m.make} ${m.model}` : m.model || m.make;
  return [cam, m.iso ? `ISO ${m.iso}` : '', sh, m.aperture ? `f/${+m.aperture.toFixed(1)}` : '', m.focal ? `${Math.round(m.focal)} mm` : ''].filter(Boolean).join(' · ');
}

/** Draws a canvas into the dialog's preview canvas, fitted. */
function rawShow(view, src) {
  const k = Math.min(1, 640 / Math.max(src.width, src.height));
  view.width = Math.max(1, Math.round(src.width * k)); view.height = Math.max(1, Math.round(src.height * k));
  const g = view.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, view.width, view.height);
}

/** Opens a RAW file through the Develop dialog. Resolves with a document { w, h, layers }. */
async function readRawFile(f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const kind = SlopRaw.sniff(bytes, f.name), meta = SlopRaw.meta(bytes);
  const embedded = await SlopRaw.previewCanvas(bytes).catch(() => null);
  const opts = { wb: 'camera', exposure: 0, highlights: 'clip' };
  const view = h('canvas', { class: 'raw-view', 'aria-label': rawT('preview') });
  const status = h('p', { class: 'dlg-p raw-status', role: 'status' }, embedded ? rawT('camera_developing') : rawT('developing'));
  const wb = h('select', { 'aria-label': rawT('white_balance') }, RAW_WB.map(([v, k]) => h('option', { value: v }, rawT(k))));
  const ev = h('input', { type: 'range', min: -3, max: 3, step: 0.1, value: 0, 'aria-label': rawT('exposure') }), evn = h('span', { class: 'fp-u' }, '0.0 EV');
  const hl = h('select', { 'aria-label': rawT('highlights') }, RAW_HL.map(([v, k]) => h('option', { value: v }, rawT(k))));
  if (embedded) rawShow(view, embedded.canvas);
  let tok = 0, timer = 0, engineOk = null, closed = false;
  const develop = async () => {
    const my = ++tok;
    status.textContent = rawT('developing');
    try {
      const r = await SlopRaw.decode(bytes, { ...opts, half: true });
      engineOk = true;
      if (my !== tok || closed) return;
      rawShow(view, SlopRaw.toCanvas(r));
      status.textContent = rawT('half_size', { w: r.width * 2, h: r.height * 2 });
    } catch (e) {
      engineOk = false;
      if (my !== tok || closed) return;
      status.textContent = e.code === 'declined' ? rawT('declined') : rawT('engine_failed', { error: e.message });
    }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(develop, 250); };
  wb.addEventListener('change', () => { opts.wb = wb.value; later(); });
  hl.addEventListener('change', () => { opts.highlights = hl.value; later(); });
  ev.addEventListener('input', () => { opts.exposure = +ev.value; evn.textContent = `${opts.exposure >= 0 ? '+' : ''}${opts.exposure.toFixed(1)} EV`; later(); });
  const body = h('div', { class: 'form raw-dev' },
    h('div', { class: 'raw-pane' }, view),
    h('div', { class: 'raw-side' },
      h('p', { class: 'dlg-p mono' }, [kind ? kind.label : rawT('camera_raw'), rawMetaLine(meta)].filter(Boolean).join(' · ')),
      field(rawT('white_balance'), wb), field(rawT('exposure'), ev, evn), field(rawT('highlights'), hl), status));
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => { done = true; closed = true; clearTimeout(timer); fn(); };
    const asDoc = (c) => ({ w: c.width, h: c.height, layers: [{ name: tr('photoslop.layer.background'), canvas: c }] });
    const buttons = [{ label: tr('menu.cancel') }];
    if (embedded) buttons.push({ label: rawT('use_embedded'), act: () => { finish(() => resolve(asDoc(embedded.canvas))); return true; } });
    buttons.push({ label: tr('menu.open'), primary: true, act: async () => {
      if (engineOk === false && !embedded) return false;
      status.textContent = rawT('developing_full');
      try {
        const r = await SlopRaw.decode(bytes, { ...opts, half: false }, (t) => { status.textContent = t; });
        finish(() => resolve(asDoc(SlopRaw.toCanvas(r))));
      } catch (e) {
        if (!embedded) { status.textContent = rawT('develop_failed', { error: e.message }); return false; }
        toast(rawT('opened_embedded'), 4200);
        finish(() => resolve(asDoc(embedded.canvas)));
      }
    } });
    dialog({ title: rawT('develop_title', { name: f.name || rawT('raw_photo') }), body, cls: 'dlg-raw', buttons, onClose: () => { if (!done) finish(() => reject(rawCancelled())); } });
    develop();
  });
}
