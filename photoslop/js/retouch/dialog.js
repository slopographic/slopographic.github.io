/* PhotoSlop: Filter ▸ Auto Retouch… (also Image ▸ Auto Retouch…). One dialog for the automatic fixes, with a live
 * before/after split view (js/retouch/dialog-view.js) on a copy of the picture at most 640 px across:
 *   Auto enhance      on by default: strength, the switches (levels, white balance, exposure, shadows and highlights,
 *                     vibrance), sharpen, denoise and Straighten (offered with the detected tilt, off until ticked)
 *   Portrait retouch  on when a face is found: smoothing, blemishes, red-eye, teeth and eyes; face detection (the shared
 *                     opt-in, shared/faces) and the subject model are asked for only when the person ticks them
 *   Remove an object… closes the dialog and picks the Remove Object tool.
 * Apply runs the same commands as Ctrl+K, the AI panel and macros (rtAutoEnhance, rtPortrait) as ONE history step,
 * "Auto Retouch", and a recording macro gets them as its steps. On a phone the dialog is a bottom sheet (css/retouch.css). */
'use strict';

const RT_PREFS = { enhance: true, a: { strength: 100, levels: true, white_balance: true, exposure: true, shadows_highlights: true, vibrance: true, sharpen: 25, denoise: 'none', straighten: false },
  p: { smoothing: 45, blemishes: true, red_eye: true, teeth: 0, eyes: 0, faces: 'auto', subject: false } };

async function rtOpenDialog(tab) {
  await rtSettle();
  if (!activeLayer()) { toast(rtT('no_picture')); return; }
  const src = rtComposite(), sm = rtSmall(src, 640), small = sm.canvas, k = sm.k;
  const st = { enhance: tab !== 'portrait' && RT_PREFS.enhance, portrait: tab === 'portrait', a: Object.assign({}, RT_PREFS.a), p: Object.assign({}, RT_PREFS.p) };
  const values = rtEnhanceValues(src), tilt = rtTilt(src), canTilt = !!(tilt && Math.abs(tilt.angle) >= 0.2 && tilt.confidence >= 0.3);
  const ctx = { faces: null, subject: undefined, note: '' };
  const view = rtSplitView(small), status = h('p', { class: 'rt-status', role: 'status' });
  let token = 0, timer = 0;

  async function faceInfo(ask) {
    if (ctx.faces && !ask) return;
    const r = await rtFaces(src, st.p.faces === 'off' ? 'off' : ask ? 'ask' : 'auto');
    ctx.faces = r.faces; ctx.note = r.note; ctx.off = !!r.off;
    faceNote.textContent = r.faces.length ? rtT('faces_found', { n: r.faces.length }) : ctx.off ? rtT('faces_off') : rtT('no_face');
    faceBtn.hidden = !ctx.off || st.p.faces === 'off';
  }
  async function render() {
    const my = ++token;
    status.textContent = rtT('rendering');
    await new Promise((r) => setTimeout(r, 0));
    try {
      let out = small;
      if (st.enhance) out = await rtEnhanceCanvas(small, rtEnhanceParams(values, st.a), st.a.denoise);
      if (my !== token) return;
      if (st.portrait) {
        await faceInfo(false);
        if (st.p.subject && ctx.subject === undefined) ctx.subject = await rtSubject(src);
        if (my !== token) return;
        const faces = (ctx.faces || []).map((f) => ({ x: f.x * k, y: f.y * k, w: f.w * k, h: f.h * k, kps: f.kps && f.kps.map(([x, y]) => [x * k, y * k]) }));
        const sub = st.p.subject && ctx.subject ? rtScaleMask(ctx.subject, D.w, D.h, sm.w, sm.h) : null;
        const r = rtPortraitLayers(out, st.p, { faces, subject: sub, k });
        const c = copyCanvas(out), g = cx(c);
        for (const L of r.layers) { const t = copyCanvas(L.canvas), tg = cx(t); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(L.mask, 0, 0); g.drawImage(t, 0, 0); }
        out = c;
        status.textContent = r.info.skin ? rtT('skin_spots', { n: r.info.spots }) : rtT('no_skin');
      } else status.textContent = '';
      if (my === token) view.setAfter(out);
    } catch (e) { console.warn(e); status.textContent = e.message; }
  }
  const changed = () => { clearTimeout(timer); timer = setTimeout(render, 140); };

  const A = st.a, P = st.p;
  const enhanceOn = rtCheck(rtT('auto_enhance'), st, 'enhance', () => { enhanceBox.classList.toggle('rt-off', !st.enhance); changed(); });
  const enhanceBox = h('div', { class: 'rt-group' + (st.enhance ? '' : ' rt-off') },
    rtRange(rtT('strength'), A, 'strength', 0, 100, ' %', changed),
    h('div', { class: 'rt-checks' }, rtCheck(rtT('levels'), A, 'levels', changed), rtCheck(rtT('white_balance'), A, 'white_balance', changed),
      rtCheck(rtT('exposure'), A, 'exposure', changed), rtCheck(rtT('shadows_highlights'), A, 'shadows_highlights', changed), rtCheck(rtT('vibrance'), A, 'vibrance', changed)),
    rtRange(rtT('sharpen'), A, 'sharpen', 0, 100, ' %', changed),
    rtSelect(rtT('denoise'), A, 'denoise', [['none', rtT('denoise_off')], ['light', rtT('denoise_light')], ['medium', rtT('denoise_medium')], ['strong', rtT('denoise_strong')]], changed),
    canTilt ? rtCheck(rtT(tilt.kind === 'horizon' ? 'tilt_horizon' : 'tilt_verticals', { deg: String(Math.abs(tilt.angle)) }), A, 'straighten', () => {})
      : h('p', { class: 'rt-hint' }, rtT('tilt_level')));
  if (!canTilt) A.straighten = false;
  const faceNote = h('p', { class: 'rt-hint' }, rtT('looking_faces'));
  const faceBtn = h('button', { type: 'button', class: 'sui-btn rt-faces', hidden: true, onclick: async () => { await faceInfo(true); changed(); } }, rtT('find_faces'));
  const portraitOn = rtCheck(rtT('portrait'), st, 'portrait', () => { portraitBox.classList.toggle('rt-off', !st.portrait); changed(); });
  const portraitBox = h('div', { class: 'rt-group' + (st.portrait ? '' : ' rt-off') },
    rtRange(rtT('smoothing'), P, 'smoothing', 0, 100, ' %', changed),
    h('div', { class: 'rt-checks' }, rtCheck(rtT('heal_blemishes'), P, 'blemishes', changed), rtCheck(rtT('red_eye'), P, 'red_eye', changed),
      rtCheck(rtT('only_person'), P, 'subject', changed)),
    rtRange(rtT('whiten_teeth'), P, 'teeth', 0, 100, ' %', changed), rtRange(rtT('whiten_eyes'), P, 'eyes', 0, 100, ' %', changed),
    faceNote, faceBtn);
  const removeBtn = h('button', { type: 'button', class: 'sui-btn rt-remove', onclick: () => { dlg.close(false); selectTool('remove'); toast(rtT('brush_over')); } }, rtT('remove_an_object'));
  const body = h('div', { class: 'rt-body' }, view.el,
    h('div', { class: 'rt-controls' }, h('section', { class: 'rt-sec' }, enhanceOn, enhanceBox), h('section', { class: 'rt-sec' }, portraitOn, portraitBox),
      h('div', { class: 'rt-row rt-more' }, removeBtn, h('span', { class: 'rt-hint' }, rtT('on_device'))), status));

  const dlg = dialog({ title: rtT('title'), body, cls: 'rt-dlg', buttons: [{ label: tr('menu.cancel') }, { label: tr('ui.apply'), primary: true, act: () => {
    if (!st.enhance && !st.portrait) { status.textContent = rtT('turn_on_first'); return false; }
    return undefined;
  } }], onClose: async (ok) => {
    token++; clearTimeout(timer);
    Object.assign(RT_PREFS, { enhance: st.enhance }); Object.assign(RT_PREFS.a, st.a, { straighten: false }); Object.assign(RT_PREFS.p, st.p);
    if (!ok) return;
    document.body.classList.add('busy');
    try {
      await rtPrepareAI();
      const both = st.enhance && st.portrait;
      const msgs = await aiOneStep(both ? rtT('title') : '', async () => {
        const out = [];
        if (st.enhance) out.push(await rtAutoEnhance(Object.assign({}, st.a, { fromDialog: true })));
        if (st.portrait) out.push(await rtPortrait(Object.assign({}, st.p, { fromDialog: true, facesFound: ctx.faces || undefined, subjectMask: st.p.subject ? ctx.subject || null : null })));
        return out;
      });
      toast(msgs.map((m) => m.split('. ')[0]).join(' · '), 4000);
    } catch (e) { console.warn(e); toast(rtT('failed', { error: e.message })); }
    document.body.classList.remove('busy');
  } });
  faceInfo(false).then(() => { if (!st.portrait && ctx.faces && ctx.faces.length && tab !== 'enhance') { st.portrait = true; portraitOn.querySelector('input').checked = true; portraitBox.classList.remove('rt-off'); } changed(); });
  render();
  return dlg;
}
