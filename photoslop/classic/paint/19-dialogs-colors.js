/* Slop Paint, part 19: Edit Colors dialog and the View Bitmap window.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, t, clamp, finishPending, h, hexToRgb, hslToRgb, main, openDialog, rgbHex, rgbToHsl } = P;

const BASIC_COLORS = [
  '#ff8080', '#ffff80', '#80ff80', '#00ff80', '#80ffff', '#0080ff', '#ff80c0', '#ff80ff',
  '#ff0000', '#ffff00', '#80ff00', '#00ff40', '#00ffff', '#0080c0', '#8080c0', '#ff00ff',
  '#804040', '#ff8040', '#00ff00', '#008080', '#004080', '#8080ff', '#800040', '#ff0080',
  '#800000', '#ff8000', '#008000', '#008040', '#0000ff', '#0000a0', '#800080', '#8000ff',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#c0c0c0', '#d4ff3a', '#ffffff',
];
const customColors = Array(16).fill('#ffffff');
let customSlot = 0;
function editColorsDialog(initial) {
  let [r, g, b] = hexToRgb(initial);
  let [hu, sa, lu] = rgbToHsl(r, g, b);
  const SW = 176, SH = 150;
  const content = h('div', { class: 'ec', html: `
    <div class="ec-left">
      <div>${t('paint-classic.ec.basic')}</div><div class="ec-grid" id="ecBasic"></div>
      <div>${t('paint-classic.ec.custom')}</div><div class="ec-grid" id="ecCustom"></div>
      <button class="btn" type="button" disabled style="width:100%">${t('paint-classic.ec.define')}</button>
    </div>
    <div class="ec-right">
      <div class="ec-spec-row">
        <div class="ec-spec" id="ecSpec"><canvas width="${SW}" height="${SH}" aria-label="${t('paint-classic.ec.spectrum')}"></canvas><div class="ec-cross" id="ecCross"></div></div>
        <div class="ec-lumwrap"><div class="ec-lum" id="ecLum"><canvas width="12" height="${SH}" aria-label="${t('paint-classic.ec.lum_aria')}"></canvas></div><div class="ec-arrow" id="ecArrow"></div></div>
      </div>
      <div class="ec-bottom">
        <div><div class="ec-prev"><span id="ecPrev"></span></div><div style="text-align:center;margin-top:2px">${t('paint-classic.ec.solid')}</div></div>
        <div class="ec-fields">
          <label for="ecH">${t('paint-classic.ec.hue')}</label><input id="ecH" type="number" min="0" max="239">
          <label for="ecR">${t('paint-classic.ec.red')}</label><input id="ecR" type="number" min="0" max="255">
          <label for="ecS">${t('paint-classic.ec.sat')}</label><input id="ecS" type="number" min="0" max="240">
          <label for="ecG">${t('paint-classic.ec.green')}</label><input id="ecG" type="number" min="0" max="255">
          <label for="ecL">${t('paint-classic.ec.lum')}</label><input id="ecL" type="number" min="0" max="240">
          <label for="ecB">${t('paint-classic.ec.blue')}</label><input id="ecB" type="number" min="0" max="255">
        </div>
      </div>
      <div class="ec-hex"><label for="ecHex">${t('paint-classic.ec.hex')}</label><input id="ecHex" type="text" maxlength="7"><button class="btn" type="button" id="ecAdd">${t('paint-classic.ec.add')}</button></div>
    </div>` });
  const q = s => $(s, content);
  const specC = q('#ecSpec canvas'), lumC = q('#ecLum canvas');
  // spectrum: hue across, saturation down, at mid luminosity
  {
    const x = specC.getContext('2d'), img = x.createImageData(SW, SH), d = img.data;
    for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
      const [rr, gg, bb] = hslToRgb(i / (SW - 1) * 0.999, 1 - j / (SH - 1), 0.5), k = (j * SW + i) * 4;
      d[k] = rr; d[k + 1] = gg; d[k + 2] = bb; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }
  const lx = lumC.getContext('2d');
  const fillGrid = (el, colors, onpick, cls) => {
    el.textContent = '';
    colors.forEach((c, i) => {
      const bt = h('button', { type: 'button', style: { background: c }, 'aria-label': c, title: c, class: cls && cls(i) ? 'cur' : null });
      bt.addEventListener('click', () => onpick(c, i));
      el.append(bt);
    });
  };
  const sync = (from) => {
    if (from !== 'rgb') [r, g, b] = hslToRgb(hu, sa, lu);
    if (from !== 'hsl') [hu, sa, lu] = rgbToHsl(r, g, b);
    const set = (id, v) => { const el = q(id); if (document.activeElement !== el) el.value = v; };
    set('#ecR', r); set('#ecG', g); set('#ecB', b);
    set('#ecH', Math.round(hu * 239)); set('#ecS', Math.round(sa * 240)); set('#ecL', Math.round(lu * 240));
    set('#ecHex', rgbHex(r, g, b));
    q('#ecPrev').style.background = rgbHex(r, g, b);
    q('#ecCross').style.left = (2 + hu * (SW - 1)) + 'px';
    q('#ecCross').style.top = (2 + (1 - sa) * (SH - 1)) + 'px';
    q('#ecArrow').style.top = (2 + (1 - lu) * (SH - 1)) + 'px';
    for (let j = 0; j < SH; j++) { const [rr, gg, bb] = hslToRgb(hu, sa, 1 - j / (SH - 1)); lx.fillStyle = rgbHex(rr, gg, bb); lx.fillRect(0, j, 12, 1); }
  };
  const pickHex = c => { [r, g, b] = hexToRgb(c); sync('rgb'); };
  fillGrid(q('#ecBasic'), BASIC_COLORS, pickHex);
  const drawCustom = () => fillGrid(q('#ecCustom'), customColors, (c, i) => { customSlot = i; pickHex(c); drawCustom(); }, i => i === customSlot);
  drawCustom();
  // touch-ok: the spectrum and the luminance bar have touch-action: none (paint-forms.css .ec-spec, .ec-lum)
  const drag = (el, fn) => {
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); fn(e);
      const mv = ev => fn(ev);
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  };
  drag(q('#ecSpec'), e => {
    const rc = specC.getBoundingClientRect();
    hu = clamp((e.clientX - rc.left) / (SW - 1), 0, 0.999); sa = clamp(1 - (e.clientY - rc.top) / (SH - 1), 0, 1);
    if (lu <= 0.02 || lu >= 0.98) lu = 0.5;
    sync('hsl');
  });
  drag(q('.ec-lumwrap'), e => { const rc = lumC.getBoundingClientRect(); lu = clamp(1 - (e.clientY - rc.top) / (SH - 1), 0, 1); sync('hsl'); });
  const num = (id, mx) => clamp(Math.round(+q(id).value || 0), 0, mx);
  ['#ecR', '#ecG', '#ecB'].forEach(id => q(id).addEventListener('input', () => { r = num('#ecR', 255); g = num('#ecG', 255); b = num('#ecB', 255); sync('rgb'); }));
  ['#ecH', '#ecS', '#ecL'].forEach(id => q(id).addEventListener('input', () => { hu = num('#ecH', 239) / 239 * 0.999; sa = num('#ecS', 240) / 240; lu = num('#ecL', 240) / 240; sync('hsl'); }));
  q('#ecHex').addEventListener('input', e => { const v = e.target.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) { pickHex(v[0] === '#' ? v : '#' + v); } });
  q('#ecAdd').addEventListener('click', () => { customColors[customSlot] = rgbHex(r, g, b); customSlot = (customSlot + 1) % 16; drawCustom(); });
  sync('rgb');
  return openDialog({ title: t('paint-classic.ec.title'), content, width: 470, buttons: [{ label: t('menu.ok'), value: 'ok', default: true }, { label: t('menu.cancel'), value: null }] })
    .then(v => v ? rgbHex(r, g, b) : null);
}
function viewBitmap() {
  finishPending();
  const img = h('img', { src: main.toDataURL(), alt: t('paint-classic.bmp.alt') });
  const v = h('div', { class: 'viewbmp', tabindex: '-1', role: 'dialog', 'aria-label': t('paint-classic.bmp.aria') }, img);
  const close = () => { v.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { e.preventDefault(); e.stopPropagation(); close(); };
  v.addEventListener('pointerdown', close);
  document.addEventListener('keydown', key, true);
  document.body.append(v); v.focus();
}

Object.assign(P, { editColorsDialog, viewBitmap });
})();
