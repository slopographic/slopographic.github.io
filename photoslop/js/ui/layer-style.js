/* PhotoSlop: the Layer Style dialog, like Photoshop's. A list of sections on the left (Blending Options, the effect
 * pages, Opacity and Fill), the page of the chosen section in the middle and a live preview of the layer on the right.
 * The pages and their controls are in layer-style-pages.js; effects use the FX definitions and controls (FX_BY_ID,
 * paramControl), so the rows and this dialog never disagree. Preview (on by default) shows the edits on the document
 * as they are made. OK writes them as one history step ('Layer Style'). Cancel, Escape and the close button put the
 * layer back as it was, with no history step. */
'use strict';

// the titles: the two pages of their own, and each effect's name (photoslop.filter.<id>) without its «…»
const LS_SECTIONS = ['blend', 'shadow', 'inner-shadow', 'glow', 'stroke', 'overlay', 'gradient', 'opacity'].map((id) => ({ id,
  get title() { return id === 'blend' ? tr('photoslop.lstyle.blending') : id === 'opacity' ? tr('photoslop.lstyle.opacity_fill') : tr('photoslop.filter.' + fKey(id)).replace('…', ''); } }));
/** True when an effect type has its own section here (the others keep their own dialog). */
const lsHasSection = (typeId) => LS_SECTIONS.some((s) => s.id === typeId);
/** A comparable copy of a layer's style: stack, blend, opacity and fill. */
const lsSig = (x) => JSON.stringify([x.fx || [], x.blend, x.opacity, x.fillOp == null ? 1 : x.fillOp]);

/** Opens the dialog for a layer at a section ('blend', 'opacity' or an effect type such as 'shadow'). */
function openLayerStyle(layerId, section = 'blend') {
  const L0 = D.layers.find((l) => l.id === layerId);
  if (!L0) return;
  const orig = { fx: L0.fx || null, blend: L0.blend, opacity: L0.opacity, fillOp: L0.fillOp };
  const w = { fx: fxClone(orig.fx || []), blend: L0.blend, opacity: L0.opacity, fillOp: fillOf(L0) };
  const origSig = lsSig(Object.assign({}, orig, { fx: orig.fx || [] }));
  const origIds = new Set((orig.fx || []).map((e) => e.id));
  // An effect added here and switched off again is not kept: only the effects the layer had, or ones that are on, are written.
  const kept = () => w.fx.filter((e) => e.on !== false || origIds.has(e.id));
  let preview = true, current = section;
  const at = (type) => w.fx.find((e) => e.type === type);

  /** Writes the working style to the layer (no history step). */
  const applyDoc = () => {
    const fx = kept();
    patchLayer(layerId, { fx: fx.length ? fxClone(fx) : null, blend: w.blend, opacity: w.opacity, fillOp: w.fillOp < 1 ? w.fillOp : null });
    emit('doc');
  };
  const restoreDoc = () => { patchLayer(layerId, { fx: orig.fx, blend: orig.blend, opacity: orig.opacity, fillOp: orig.fillOp }); emit('doc'); };

  // The preview: the layer on the document's frame, with the working style (whether or not Preview is on).
  const prev = h('canvas', { class: 'ls-prev', width: 240, height: 180, role: 'img', 'aria-label': tr('photoslop.lstyle.preview_label') });
  const drawPreview = () => {
    const L = D.layers.find((l) => l.id === layerId);
    const g = prev.getContext('2d');
    g.clearRect(0, 0, prev.width, prev.height);
    if (!L) return;
    const sc = Math.min(prev.width / D.w, prev.height / D.h), fx0 = (prev.width - D.w * sc) / 2, fy0 = (prev.height - D.h * sc) / 2;
    g.fillStyle = g.createPattern(checker, 'repeat'); g.fillRect(fx0, fy0, D.w * sc, D.h * sc);
    const out = renderFx(layerSurface(L), kept(), w.fillOp);
    const ow = out.w || out.canvas.width, oh = out.h || out.canvas.height;
    g.save();
    g.globalAlpha = w.opacity * (fxOn({ fx: kept() }) ? 1 : w.fillOp);
    g.globalCompositeOperation = BLEND_OP[w.blend] || 'source-over';
    g.drawImage(out.canvas, 0, 0, ow, oh, fx0 + out.x * sc, fy0 + out.y * sc, ow * sc, oh * sc);
    g.restore();
  };

  const list = h('ul', { class: 'ls-list', role: 'tablist', 'aria-label': tr('photoslop.lstyle.sections'), 'aria-orientation': 'vertical' });
  const main = h('div', { class: 'ls-main' });
  const body = h('div', { class: 'ls-body' }, list, main, h('div', { class: 'ls-side' }, prev, h('p', { class: 'ls-cap' }, tr('photoslop.filter.preview'))));

  /** One change: the document follows it (when Preview is on) and the preview redraws. */
  const changed = () => { if (preview) applyDoc(); drawPreview(); paintList(); };
  function paintList() {
    list.replaceChildren(...LS_SECTIONS.map((s) => {
      const e = at(s.id), on = !!e && e.on !== false, sel = s.id === current;
      const li = h('li', { role: 'tab', tabindex: sel ? '0' : '-1', 'aria-selected': String(sel), class: 'ls-item' + (sel ? ' on' : ''), 'data-section': s.id },
        h('span', { class: 'ls-dot' + (on ? ' on' : ''), 'aria-hidden': 'true' }), h('span', null, s.title));
      li.addEventListener('click', () => show(s.id));
      li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); show(s.id); } });
      return li;
    }));
  }
  function show(id) {
    current = id;
    const page = id === 'blend' ? lsBlendPage(w, changed)
      : id === 'opacity' ? lsOpacityPage(w, changed)
        : lsEffectPage(id, w, L0, changed);
    main.replaceChildren(page);
    paintList();
  }

  let previewBtn = null;
  const syncPreviewBtn = () => { if (previewBtn) { previewBtn.setAttribute('aria-pressed', String(preview)); previewBtn.textContent = tr(preview ? 'photoslop.lstyle.preview_on' : 'photoslop.lstyle.preview_off'); } };
  SlopUI.dialog({
    title: tr('photoslop.lstyle.title_named', { name: L0.name }), cls: 'ls-dialog', body,
    buttons: [
      { label: tr('menu.cancel') },
      { label: tr('photoslop.filter.preview'), act: () => {
        preview = !preview;
        if (preview) applyDoc(); else restoreDoc();
        syncPreviewBtn();
        return false;
      } },
      { label: tr('menu.ok'), primary: true },
    ],
    onClose: (ok) => {
      if (!ok) { restoreDoc(); return; }
      w.fx = kept();
      const changedStyle = lsSig(w) !== origSig;
      applyDoc();
      if (changedStyle) commit(tr('photoslop.lstyle.step')); else emit('doc');
    },
  });
  // The Preview button is the third-from-start button of the foot: find it by its label after the dialog is built.
  const foot = body.closest('.sui-dlg') && body.closest('.sui-dlg').querySelector('.sui-foot');
  previewBtn = foot ? [...foot.querySelectorAll('button')].find((b) => b.textContent === tr('photoslop.filter.preview')) || null : null;
  syncPreviewBtn();
  show(current);
  drawPreview();
}

/** Layer ▸ Layer Style ▸ <effect>: opens that effect's section (or its own dialog for the rest). */
function addStyleEffect(typeId) {
  const L = activeLayer(); if (!L) return;
  if (lsHasSection(typeId)) openLayerStyle(L.id, typeId); else openFxDialog(L.id, null, typeId);
}

