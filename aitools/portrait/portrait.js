/* Portrait blur page: the person is found by the MODNet model that Slop Isolate uses (shared/cutout, run in its
 * worker). The mask is computed once per picture (the picture itself: compose.js); the strength slider only re-composites, so it moves instantly.
 * Background = the picture blurred; foreground = the picture through the mask. */
(function () {
  'use strict';
  const T = window.SlopAITools, $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  let picture = null, mask = null, maskW = 0, maskH = 0, fileName = 'portrait';

  /** Composites the result for the current strength and paints it on the preview. */
  function render() {
    if (!picture || !mask) return;
    const w = picture.w, h = picture.h, s = +$('strength').value;
    $('sv').textContent = String(s);
    const out = window.SlopAIPortrait.compose(picture.bitmap, w, h, { mask, maskW, maskH }, s);   // compose.js
    const view = $('view'), vw = Math.min(w, 1200), vh = Math.round((h * vw) / w);
    view.width = vw; view.height = vh;
    view.getContext('2d').drawImage(out, 0, 0, vw, vh);
    view._full = out;
  }
  async function segment() {
    $('msg').textContent = t('aitools.portrait.finding');
    try {
      const r = await window.SlopCutout.removeBackground(picture.file, { model: 'portrait', keep: false, onProgress: (p) => { if (p && p.phase) $('msg').textContent = p.phase === 'model' ? t('aitools.portrait.loading') : p.phase === 'infer' ? t('aitools.portrait.finding') : t('ui.working'); } });
      mask = r.mask; maskW = r.width; maskH = r.height;
      $('strength').disabled = false; $('dl').disabled = false;
      $('msg').textContent = t('aitools.portrait.drag');
      render();
    } catch (e) { $('msg').textContent = t('aitools.portrait.failed', { error: e.message }); }
  }
  async function pick(f) {
    if (!f || !/^image\//.test(f.type)) { $('msg').textContent = t('aitools.page.choose_image'); return; }
    try {
      const img = await T.image(f);
      picture = { file: f, bitmap: img.bitmap, w: img.w, h: img.h };
      fileName = f.name.replace(/\.[^.]+$/, '') || 'portrait';
      mask = null;
      $('ui').hidden = false;
      await segment();
    } catch (e) { $('msg').textContent = t('aitools.page.unreadable'); }
  }
  // the one way in (aitools/intake.js): a drop on the box, choose a file, a paste, a launch
  const intake = T.intake('ai-portrait', { accept: { types: ['image/*'], exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'], noun: 'aitools.page.an_image' }, read: (f) => pick(f) });
  $('strength').addEventListener('input', render);
  $('dl').addEventListener('click', () => { const v = $('view')._full; if (v) v.toBlob((b) => T.download(fileName + '-blur.png', b, 'image/png')); });
  T.gate('portrait', () => { $('ui').hidden = false; intake.launch(); });
})();
