/* Slop Paint, part 09: text tool: text boxes, wrapping and the font bar.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, FONTS, FONT_SIZES, S, ctx2d, fontbar, h, hexToRgb, markDirty, mctx, mkCanvas, pushUndo, wrap } = P;

/* =====================================================================
 * Text tool
 * ===================================================================== */
const fontCss = (z = 1) => { const f = S.font; return `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${Math.round(f.size * z)}px ${FONTS[f.family][1]}`; };
const lineH = () => Math.round(S.font.size * 1.25);
function createTextBox(x, y, w, hh) {
  const box = h('div', { class: 'textbox' });
  const ta = h('textarea', { spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': P.t('paint-classic.app.text_aria') });
  box.append(ta);
  box.addEventListener('pointerdown', e => e.stopPropagation());
  ta.addEventListener('input', growText);
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); commitText(); } });
  wrap.append(box);
  P.st.text = { x, y, w, h: hh, box, ta };
  styleTextBox();
  showFontbar();
  setTimeout(() => ta.focus({ preventScroll: true }), 0);
}
function styleTextBox() {
  if (!P.st.text) return;
  const z = S.zoom, { box, ta } = P.st.text;
  Object.assign(box.style, { left: P.st.text.x * z + 'px', top: P.st.text.y * z + 'px', width: P.st.text.w * z + 'px', height: P.st.text.h * z + 'px' });
  ta.style.font = fontCss(z);
  ta.style.lineHeight = lineH() * z + 'px';
  ta.style.color = S.primary;
  ta.style.caretColor = S.primary;
  ta.style.textDecoration = S.font.underline ? 'underline' : 'none';
  ta.style.background = S.textOpaque ? S.secondary : 'transparent';
}
function growText() {
  if (!P.st.text) return;
  const need = Math.ceil(P.st.text.ta.scrollHeight / S.zoom);
  if (need > P.st.text.h) { P.st.text.h = Math.min(need, S.h - P.st.text.y); styleTextBox(); }
}
function wrapLines(x, str, maxW) {
  const out = [];
  for (const para of str.split('\n')) {
    if (!para) { out.push(''); continue; }
    const words = para.split(/(\s+)/);
    let cur = '';
    for (const wd of words) {
      if (!wd) continue;
      const test = cur + wd;
      if (x.measureText(test).width <= maxW || !cur) {
        if (x.measureText(test).width > maxW && !/\s/.test(wd)) {
          // a single word longer than the box: break it by characters
          let part = cur;
          for (const ch of wd) {
            if (x.measureText(part + ch).width > maxW && part) { out.push(part); part = ch; } else part += ch;
          }
          cur = part;
        } else cur = test;
      } else if (/^\s+$/.test(wd)) {
        cur += wd;
      } else {
        out.push(cur.replace(/\s+$/, ''));
        cur = wd;
      }
    }
    out.push(cur);
  }
  return out;
}
function commitText() {
  if (!P.st.text) return;
  const t = P.st.text; P.st.text = null;
  const str = t.ta.value;
  t.box.remove();
  if (!str.trim()) return;
  pushUndo();
  const c = mkCanvas(t.w, t.h), x = ctx2d(c, { willReadFrequently: true });
  x.font = fontCss(1); x.fillStyle = S.primary; x.textBaseline = 'middle';
  const lh = lineH();
  wrapLines(x, str, t.w).forEach((ln, i) => {
    const yy = i * lh + lh / 2;
    x.fillText(ln, 0, yy);
    if (S.font.underline && ln) x.fillRect(0, Math.round(yy + S.font.size * 0.42), Math.ceil(x.measureText(ln).width), Math.max(1, Math.round(S.font.size / 14)));
  });
  // threshold to aliased pixels, like Win98 text rendering
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data, [r, g, b] = hexToRgb(S.primary);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= 100) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } else d[i + 3] = 0;
  }
  x.putImageData(img, 0, 0);
  if (S.textOpaque) { mctx.fillStyle = S.secondary; mctx.fillRect(t.x, t.y, t.w, t.h); }
  mctx.drawImage(c, t.x, t.y);
  markDirty();
}
function showFontbar() { fontbar.hidden = S.fontbarClosed; }
function syncFontbar() {
  $('#fFamily').value = String(S.font.family);
  $('#fSize').value = String(S.font.size);
  $('#fBold').setAttribute('aria-pressed', S.font.bold);
  $('#fItalic').setAttribute('aria-pressed', S.font.italic);
  $('#fUnder').setAttribute('aria-pressed', S.font.underline);
}
function initFontbar() {
  const fam = $('#fFamily'), size = $('#fSize');
  FONTS.forEach(([name], i) => fam.append(h('option', { value: i, text: name })));
  FONT_SIZES.forEach(s => size.append(h('option', { value: s, text: s })));
  const after = () => { styleTextBox(); growText(); if (P.st.text) P.st.text.ta.focus({ preventScroll: true }); };
  fam.addEventListener('change', () => { S.font.family = +fam.value; after(); });
  size.addEventListener('change', () => { S.font.size = +size.value; after(); });
  for (const [id, k] of [['fBold', 'bold'], ['fItalic', 'italic'], ['fUnder', 'underline']]) {
    const b = $('#' + id);
    b.addEventListener('pointerdown', e => e.preventDefault()); // keep textarea focus
    b.addEventListener('click', () => { S.font[k] = !S.font[k]; syncFontbar(); after(); });
  }
  $('#fbClose').addEventListener('click', () => { S.fontbarClosed = true; fontbar.hidden = true; });
  syncFontbar();
}

Object.assign(P, { commitText, createTextBox, initFontbar, lineH, styleTextBox });
})();
