/* Slop Paint, part 07: primary and secondary colours and the palette.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, PALETTE, S, h, status } = P;

/* =====================================================================
 * Colors
 * ===================================================================== */
function setColor(which, hex) {
  if (which === 2) S.secondary = hex; else S.primary = hex;
  $('#ccFg').style.background = S.primary;
  $('#ccBg').style.background = S.secondary;
  if (P.st.text) P.styleTextBox();
  if (P.st.sel && P.st.sel.canvas && S.transparent) P.renderFloating();
}
function renderPalette() {
  const pal = $('#palette');
  pal.textContent = '';
  PALETTE.forEach((c, i) => {
    let touchPrev = null; // the primary colour before a finger pressed this swatch
    const b = h('button', { class: 'sw', type: 'button', 'aria-label': P.t('paint-classic.app.swatch', { color: c }), title: P.t('paint-classic.app.swatch_tip'), style: { background: c } });
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const prev = S.primary;
      setColor(0, PALETTE[i]);
      touchPrev = e.pointerType === 'touch' || e.pointerType === 'pen' ? prev : null;
    });
    b.addEventListener('pointerup', () => { setTimeout(() => { touchPrev = null; }, 0); });
    b.addEventListener('click', e => { if (e.detail === 0) setColor(0, PALETTE[i]); });
    b.addEventListener('dblclick', () => editSwatch(i));
    // A long press is a right-click (shared/input sends contextmenu): the swatch menu opens (ctx.js, with Set as
    // Secondary Color), and the press does not leave the colour as primary.
    b.addEventListener('contextmenu', e => { e.preventDefault(); if (touchPrev != null) { setColor(0, touchPrev); touchPrev = null; } });
    pal.append(b);
  });
}
async function editSwatch(i) {
  const res = await P.editColorsDialog(PALETTE[i]);
  if (!res) return;
  PALETTE[i] = res;
  renderPalette();
  setColor(0, res);
}

Object.assign(P, { editSwatch, renderPalette, setColor });
})();
