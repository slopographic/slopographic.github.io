/* PhotoSlop Auto retouch ▸ Remove object. Loaded on first use (js/retouch/boot.js). The area comes from the Remove Object
 * tool (js/retouch/tool.js: a brush stroke or a lasso), the selection, or the command's x, y, width and height.
 *   On this device: the area (grown by a few px, so the object's soft edge goes too) is filled by PatchMatch
 *   (shared/retouch/patchmatch.js, in a Worker: shared/retouch/inpaint-worker.js) from the picture around it, on a copy
 *   at most 360 px across; the fill goes on a new layer, "Remove Object", feathered at its edge. One history step.
 *   With Edit with AI: the area becomes the selection and the shared Edit with AI dialog opens with a prompt to remove
 *   it (the person's own key; Generate there is the go-ahead). For a big area (over 12 % of the picture, or wider than
 *   45 % of it) the tool asks which to use, and says plainly that the AI model usually does better there. */
'use strict';

const RT_BIG = { area: 0.12, side: 0.45 };
let rtWorker = null, rtJob = 0;
const rtJobs = new Map();

/** PatchMatch in the Worker (or on the page when Workers cannot start). → the filled RGBA array. */
function rtInpaint(data, w, hh, hole) {
  const local = () => new Promise((res, rej) => {
    if (window.SlopRetouchPatchMatch) { res(SlopRetouchPatchMatch.inpaint(data, w, hh, hole)); return; }
    const s = document.createElement('script'); s.src = '../shared/retouch/patchmatch.js';
    s.onload = () => res(SlopRetouchPatchMatch.inpaint(data, w, hh, hole)); s.onerror = () => rej(new Error('The fill could not load (offline?)'));
    document.head.append(s);
  });
  try {
    if (!rtWorker) {
      rtWorker = new Worker('../shared/retouch/inpaint-worker.js');
      rtWorker.onmessage = (e) => { const j = rtJobs.get(e.data.id); if (!j || e.data.progress != null) return; rtJobs.delete(e.data.id); if (e.data.error) j.rej(new Error(e.data.error)); else j.res(e.data.data); };
      rtWorker.onerror = (e) => { e.preventDefault(); rtWorker = null; for (const [id, j] of rtJobs) { rtJobs.delete(id); local().then(j.res, j.rej); } };
    }
    const id = ++rtJob;
    return new Promise((res, rej) => { rtJobs.set(id, { res, rej }); rtWorker.postMessage({ id, data, w, h: hh, hole }); });
  } catch (e) { return local(); }
}

/** A mask canvas (document sized, alpha = the area) → { hole (Uint8 0/1), box, count }. */
function rtHoleOf(m) {
  const d = rtPixels(m).data, n = m.width * m.height, hole = new Uint8Array(n);
  let count = 0, x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] > 40) {
    hole[i] = 1; count++;
    const x = i % m.width, y = (i - x) / m.width;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { hole, count, box: count ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}
/** The area grown by r px (blur and threshold, as Select ▸ Expand does), as a new canvas. */
function rtGrow(m, r) {
  const c = copyCanvas(m); blurAlphaCanvas(c, r * 1.4);
  const g = cxr(c), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 18 ? 255 : 0;
  g.putImageData(img, 0, 0);
  return c;
}
const rtIsBig = (H) => H.count / (D.w * D.h) > RT_BIG.area || Math.max(H.box.w / D.w, H.box.h / D.h) > RT_BIG.side;

function rtChooseEngine(H) {
  const pct = Math.round((H.count / (D.w * D.h)) * 100);
  return new Promise((res) => dialog({ title: rtT('big_title'), cls: 'rt-choice',
    body: h('div', null,
      h('p', null, rtT('big_body', { pct: pct ? String(pct) : '<1' })),
      h('p', null, h('strong', null, rtT('edit_with_ai')), ' ' + rtT('big_ai'))),
    buttons: [{ label: tr('menu.cancel'), act: () => res(null) }, { label: rtT('fill_device'), act: () => res('device') }, { label: rtT('edit_ai_key'), primary: true, act: () => res('ai') }],
    onClose: () => res(null) }));
}

async function rtRemoveWithAI(m) {
  D.sel = makeSel(rtGrow(m, 4));
  commit(rtT('step_select_object'));
  return psImageGen('edit', { prompt: 'Remove the object in the selected area. Fill the area with the background around it, matching its texture, light and perspective. Change nothing outside the area.' }); // i18n-ignore: the prompt for the image model
}

async function rtRemoveObject(m, o = {}) {
  await rtSettle();
  if (!activeLayer()) throw new Error(rtT('no_picture_work'));
  const H0 = rtHoleOf(m);
  if (!H0.box) throw new Error(rtT('nothing_marked'));
  let engine = o.engine || 'device';
  if (o.ask && engine === 'device' && rtIsBig(H0)) engine = await rtChooseEngine(H0);
  if (!engine) return '';
  if (engine === 'ai') return rtRemoveWithAI(m);
  const grown = rtGrow(m, 3), H = rtHoleOf(grown), b = H.box, margin = clamp(Math.max(b.w, b.h), 32, 420);
  const cr = { x: Math.max(0, b.x - margin), y: Math.max(0, b.y - margin) };
  cr.w = Math.min(D.w, b.x + b.w + margin) - cr.x; cr.h = Math.min(D.h, b.y + b.h + margin) - cr.y;
  const k = Math.min(1, 360 / Math.max(cr.w, cr.h)), w = Math.max(8, Math.round(cr.w * k)), hh = Math.max(8, Math.round(cr.h * k));
  const src = rtComposite(), small = mkCanvas(w, hh), sg = cx(small), hm = mkCanvas(w, hh), hg = cx(hm);
  sg.imageSmoothingQuality = 'high'; sg.drawImage(src, cr.x, cr.y, cr.w, cr.h, 0, 0, w, hh);
  hg.drawImage(grown, cr.x, cr.y, cr.w, cr.h, 0, 0, w, hh);
  const hd = rtPixels(hm).data, hole = new Uint8Array(w * hh);
  for (let i = 0; i < hole.length; i++) hole[i] = hd[i * 4 + 3] > 20 ? 1 : 0;
  if (o.progress) o.progress(rtT('filling')); else toast(rtT('filling_around'), 1500);
  const filled = await rtInpaint(rtPixels(small).data, w, hh, hole);
  // the fill at full size, shown only inside the (feathered) area
  const out = mkCanvas(cr.w, cr.h), og = cx(out);
  og.imageSmoothingQuality = 'high'; og.drawImage(rtCanvas(filled, w, hh), 0, 0, cr.w, cr.h);
  const edge = copyCanvas(grown); blurAlphaCanvas(edge, 1.5);
  og.globalCompositeOperation = 'destination-in'; og.drawImage(edge, -cr.x, -cr.y);
  rtAddLayers([{ name: nextName('photoslop.layer.remove_object'), canvas: out, x: cr.x, y: cr.y }], rtT('step_remove_object'));
  if (window.SlopMacros && o.note) SlopMacros.note('ps.retouch.remove-object', o.note, 'Remove object'); // i18n-ignore: saved in the macro
  dirty(true);
  return rtT('filled', { w: b.w, h: b.h, x: b.x, y: b.y }) + (rtIsBig(H0) ? ' ' + rtT('big_hint') : '');
}

/** The command: the given area, or the selection. */
async function rtRemoveObjectCmd(a = {}) {
  let m;
  if (a.width && a.height && a.x != null && a.y != null) {
    m = mkCanvas(D.w, D.h);
    const g = cx(m); g.fillStyle = '#000';
    if (a.shape === 'rect') g.fillRect(a.x, a.y, a.width, a.height);
    else { g.beginPath(); g.ellipse(a.x + a.width / 2, a.y + a.height / 2, a.width / 2, a.height / 2, 0, 0, Math.PI * 2); g.fill(); }
  } else if (D.sel) m = D.sel.mask;
  else throw new Error(rtT('select_first'));
  return rtRemoveObject(m, { engine: a.engine || 'device' });
}
