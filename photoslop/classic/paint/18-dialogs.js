/* Slop Paint, part 18: dialog framework, message boxes, About and Help.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, $$, S, t, applyImage, blackAndWhite, cancelOp, clamp, finishPending, flipH, flipV, h, main, mctx, pushUndo, rotate, savePNG, setCanvasSize, setZoom, stretchSkew, win } = P;

/* =====================================================================
 * Dialogs
 * ===================================================================== */
const xSvg = '<svg viewBox="0 0 8 7" width="8" height="7"><path d="M0 0h2l2 2 2-2h2v1L5 3.5 8 6v1H6L4 5 2 7H0V6l3-2.5L0 1z"/></svg>';
function openDialog({ title, content, buttons, width = 320, init }) {
  return new Promise(resolve => {
    P.closeMenus(); P.closeStart();
    const prevFocus = document.activeElement;
    const back = h('div', { class: 'modal-back' });
    const close = h('button', { class: 'tbtn close', type: 'button', 'aria-label': t('menu.close'), html: xSvg });
    const tb = h('div', { class: 'titlebar' }, h('span', { class: 'ttl', text: title }), close);
    const body = h('div', { class: 'dlg-body' }, content);
    const row = h('div', { class: 'btnrow' });
    const dlg = h('div', { class: 'win dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1', style: { '--w': width + 'px' } }, tb, body, row);
    let defBtn = null;
    const done = v => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      win.classList.remove('inactive');
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      resolve(v);
    };
    for (const b of buttons) {
      const btn = h('button', { class: 'btn' + (b.default ? ' default' : ''), type: 'button', text: b.label });
      btn.addEventListener('click', () => { if (b.validate && !b.validate()) return; done(b.value); });
      if (b.default) defBtn = btn;
      row.append(btn);
    }
    close.addEventListener('click', () => done(null));
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); return; }
      if (e.key === 'Enter' && defBtn && !(e.target instanceof HTMLButtonElement) && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') { e.preventDefault(); defBtn.click(); return; }
      if (e.key === 'Tab') {
        const f = $$('button, input:not([disabled]), select, a[href], [tabindex="0"]', dlg).filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      e.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);
    back.append(dlg);
    document.body.append(back);
    win.classList.add('inactive');
    // center, then make draggable by the title bar
    const place = () => {
      const r = dlg.getBoundingClientRect();
      dlg.style.left = Math.max(6, (innerWidth - r.width) / 2) + 'px';
      dlg.style.top = Math.max(6, (innerHeight - r.height) / 2.4) + 'px';
    };
    place();
    // touch-ok: the title bar has touch-action: none (paint.css .titlebar), so a finger drags the dialog
    tb.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = dlg.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      tb.setPointerCapture(e.pointerId);
      const mv = ev => { dlg.style.left = clamp(ev.clientX - ox, -r.width + 60, innerWidth - 60) + 'px'; dlg.style.top = clamp(ev.clientY - oy, 0, innerHeight - 30) + 'px'; };
      const up = () => { tb.removeEventListener('pointermove', mv); tb.removeEventListener('pointerup', up); tb.removeEventListener('pointercancel', up); };
      tb.addEventListener('pointermove', mv); tb.addEventListener('pointerup', up); tb.addEventListener('pointercancel', up);
    });
    if (init) init(dlg);
    const first = $('input:not([disabled]):not([type=radio]), input[type=radio]:checked, select', body);
    (first || defBtn || dlg).focus({ preventScroll: true });
    if (first && first.select) first.select();
  });
}
const ICON_SVG = {
  warn: '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2L31 29H1z" fill="#ffd400" stroke="#000" stroke-width="1.5"/><rect x="14.5" y="10" width="3" height="11" fill="#000"/><rect x="14.5" y="23" width="3" height="3" fill="#000"/></svg>',
  question: '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 3h24v18H13l-7 7v-7H4z" fill="#fff" stroke="#000" stroke-width="1.5"/><text x="16" y="18" text-anchor="middle" font-family="Times New Roman, serif" font-weight="bold" font-size="15" fill="#0000c0">?</text></svg>',
  info: '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" stroke="#000" stroke-width="1.5"/><rect x="14" y="13" width="4" height="11" fill="#0000c0"/><rect x="14" y="7" width="4" height="4" fill="#0000c0"/></svg>',
  slop: '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2S5 14 5 21a11 11 0 0 0 22 0C27 14 16 2 16 2z" fill="#d4ff3a" stroke="#000" stroke-width="1.5"/><path d="M10.5 21.5a5.5 5.5 0 0 0 4.5 5" fill="none" stroke="#fff" stroke-width="2"/></svg>',
};
/** The words on a message box button; the value stays the English name ('Yes', 'No', 'Cancel'), which callers compare. */
const BTN = { OK: 'menu.ok', Cancel: 'menu.cancel', Yes: 'ui.yes', No: 'ui.no' };
function msgBox(message, buttons = ['OK'], icon = 'info', title = 'Slop Paint') {
  const content = h('div', { class: 'msg-wrap', html: ICON_SVG[icon] || '' }, h('p', { text: message }));
  return openDialog({ title, content, width: 360, buttons: buttons.map((b, i) => ({ label: BTN[b] ? t(BTN[b]) : b, value: b, default: i === 0 })) });
}
/** OK and Cancel, the buttons most dialogs end with ('ok' or null). */
const okCancel = () => [{ label: t('menu.ok'), value: 'ok', default: true }, { label: t('menu.cancel'), value: null }];
async function attributesDialog() {
  const content = h('div', { html: `
    <div class="row"><span>${t('paint-classic.dlg.last_saved')}</span><span>${t('paint-classic.dlg.not_available_slop')}</span></div>
    <div class="row" style="margin-bottom:12px"><span>${t('paint-classic.dlg.size_on_disk')}</span><span>${t('paint-classic.dlg.not_available')}</span></div>
    <div class="field-row" style="margin-bottom:12px">
      <label for="atW">${t('paint-classic.dlg.width')}</label><input id="atW" type="number" min="1" max="6000" value="${S.w}">
      <label for="atH">${t('paint-classic.dlg.height')}</label><input id="atH" type="number" min="1" max="6000" value="${S.h}">
    </div>
    <fieldset><legend>${t('paint-classic.dlg.units')}</legend><div class="row">
      <label class="disabled"><input type="radio" name="atU" disabled>${t('paint-classic.dlg.inches')}</label>
      <label class="disabled"><input type="radio" name="atU" disabled>${t('paint-classic.dlg.cm')}</label>
      <label><input type="radio" name="atU" checked>${t('paint-classic.dlg.pels')}</label></div></fieldset>
    <fieldset><legend>${t('paint-classic.dlg.colors')}</legend><div class="row">
      <label><input type="radio" name="atC" id="atBW">${t('paint-classic.dlg.bw')}</label>
      <label><input type="radio" name="atC" checked>${t('paint-classic.dlg.colors')}</label></div></fieldset>` });
  const r = await openDialog({ title: t('paint-classic.dlg.attributes'), content, width: 300, buttons: [
    { label: t('menu.ok'), value: 'ok', default: true }, { label: t('menu.cancel'), value: null },
    { label: t('paint-classic.dlg.default'), value: 'default' },
  ] });
  if (!r) return;
  if (P.st.op) cancelOp();
  finishPending();
  let w = +$('#atW', content).value, hh = +$('#atH', content).value;
  if (r === 'default') { w = 800; hh = 500; }
  if (!(w >= 1 && hh >= 1)) { msgBox(t('paint-classic.msg.whole_number'), ['OK'], 'warn'); return; }
  w = clamp(Math.round(w), 1, 6000); hh = clamp(Math.round(hh), 1, 6000);
  const bw = $('#atBW', content).checked;
  if (w !== S.w || hh !== S.h || bw) {
    pushUndo();
    if (w !== S.w || hh !== S.h) setCanvasSize(w, hh);
    if (bw) { const o = blackAndWhite(main); mctx.drawImage(o, 0, 0); }
  }
}
async function flipRotateDialog() {
  const content = h('div', { html: `
    <fieldset><legend>${t('paint-classic.dlg.flip_or_rotate')}</legend>
      <div class="row"><label><input type="radio" name="fr" value="h" checked>${t('paint-classic.dlg.flip_h')}</label></div>
      <div class="row"><label><input type="radio" name="fr" value="v">${t('paint-classic.dlg.flip_v')}</label></div>
      <div class="row"><label><input type="radio" name="fr" value="r">${t('paint-classic.dlg.rotate')}</label></div>
      <div class="indent">
        <div class="row"><label><input type="radio" name="deg" value="90" checked>90°</label></div>
        <div class="row"><label><input type="radio" name="deg" value="180">180°</label></div>
        <div class="row"><label><input type="radio" name="deg" value="270">270°</label></div>
      </div>
    </fieldset>` });
  $$('input[name=deg]', content).forEach(i => i.addEventListener('change', () => { $('input[value=r]', content).checked = true; }));
  const r = await openDialog({ title: t('paint-classic.dlg.flip_rotate'), content, width: 260, buttons: okCancel() });
  if (!r) return;
  const m = $('input[name=fr]:checked', content).value, deg = +$('input[name=deg]:checked', content).value;
  applyImage(c => m === 'h' ? flipH(c) : m === 'v' ? flipV(c) : rotate(c, deg));
}
async function stretchSkewDialog() {
  const content = h('div', { html: `
    <fieldset><legend>${t('paint-classic.dlg.stretch')}</legend><div class="field-row">
      <label for="ssH">${t('paint-classic.dlg.horizontal')}</label><span><input id="ssH" type="number" value="100" min="1" max="500"> %</span>
      <label for="ssV">${t('paint-classic.dlg.vertical')}</label><span><input id="ssV" type="number" value="100" min="1" max="500"> %</span></div></fieldset>
    <fieldset><legend>${t('paint-classic.dlg.skew')}</legend><div class="field-row">
      <label for="skH">${t('paint-classic.dlg.horizontal')}</label><span><input id="skH" type="number" value="0" min="-89" max="89"> ${t('paint-classic.dlg.degrees')}</span>
      <label for="skV">${t('paint-classic.dlg.vertical')}</label><span><input id="skV" type="number" value="0" min="-89" max="89"> ${t('paint-classic.dlg.degrees')}</span></div></fieldset>` });
  const r = await openDialog({ title: t('paint-classic.dlg.stretch_skew'), content, width: 290, buttons: okCancel() });
  if (!r) return;
  const v = id => +$(id, content).value || 0;
  const sx = clamp(v('#ssH') || 100, 1, 500), sy = clamp(v('#ssV') || 100, 1, 500), kx = clamp(v('#skH'), -89, 89), ky = clamp(v('#skV'), -89, 89);
  const big = (S.w * sx / 100) * (S.h * sy / 100);
  if (big > 36e6) { msgBox(t('paint-classic.msg.too_big'), ['OK'], 'warn'); return; }
  applyImage(c => stretchSkew(c, sx, sy, kx, ky));
}
async function customZoomDialog() {
  const content = h('div', { html: `<div class="row" style="margin-bottom:10px">${t('paint-classic.dlg.current_zoom', { pct: String(S.zoom * 100) })}</div>
    <fieldset><legend>${t('paint-classic.dlg.zoom_to')}</legend><div class="field-row" style="grid-template-columns:auto auto">
      ${[1, 2, 4, 6, 8].map(z => `<label><input type="radio" name="cz" value="${z}" ${z === S.zoom ? 'checked' : ''}>${z * 100}%</label>`).join('')}
    </div></fieldset>` });
  const r = await openDialog({ title: t('paint-classic.dlg.custom_zoom'), content, width: 240, buttons: okCancel() });
  if (r) setZoom(+$('input[name=cz]:checked', content).value);
}
async function saveAsDialog() {
  const content = h('div', { html: `<div class="field-row" style="grid-template-columns:auto 1fr">
      <label for="saN">${t('paint-classic.dlg.file_name')}</label><input id="saN" type="text" value="${(S.fileName === 'untitled' ? t('paint-classic.app.untitled') : S.fileName).replace(/"/g, '')}" maxlength="80" style="width:100%">
      <label for="saT">${t('paint-classic.dlg.save_type')}</label><select id="saT"><option>${t('paint-classic.dlg.png_type')}</option></select></div>` });
  const r = await openDialog({ title: t('paint-classic.dlg.save_as'), content, width: 360, buttons: [{ label: t('menu.save'), value: 'ok', default: true }, { label: t('menu.cancel'), value: null }] });
  if (!r) return;
  const n = ($('#saN', content).value || 'untitled').replace(/[\\/:*?"<>|]+/g, '').trim() || 'untitled';
  savePNG(n);
}
function aboutDialog() {
  const content = h('div', { class: 'about', html: `
    <div class="logo">${ICON_SVG.slop.replace(/width="32" height="32"/, 'width="56" height="56"')}</div>
    <div>
      <p class="big">Slop Paint</p>
      <p>${t('paint-classic.dlg.about_version')}<br>Copyright © 1998–2026 slopographic.com</p>
      <hr>
      <p>${t('paint-classic.dlg.about_licensed')}</p>
      <hr>
      <p>${t('paint-classic.dlg.about_pixels')}</p>
      <p>${t('paint-classic.dlg.about_memory')}</p>
      <p><a href="../../">slopographic.com</a> · ${t('paint-classic.dlg.about_more')}</p>
    </div>` });
  return openDialog({ title: t('paint-classic.dlg.about'), content, width: 400, buttons: [{ label: t('menu.ok'), value: 'ok', default: true }] });
}
function helpDialog() {
  const content = h('div', { html: `
    <ul class="helplist">
      <li>${t('paint-classic.help.buttons')}</li>
      <li>${t('paint-classic.help.shift')}</li>
      <li>${t('paint-classic.help.curve')}</li>
      <li>${t('paint-classic.help.polygon')}</li>
      <li>${t('paint-classic.help.select')}</li>
      <li>${t('paint-classic.help.clipboard')}</li>
      <li>${t('paint-classic.help.text')}</li>
      <li>${t('paint-classic.help.resize')}</li>
      <li>${t('paint-classic.help.drop')}</li>
      <li>${t('paint-classic.help.undo')}</li>
      <li>${t('paint-classic.help.palette')}</li>
      <li>${t('paint-classic.help.slop')}</li>
    </ul>` });
  return openDialog({ title: t('paint-classic.dlg.help'), content, width: 440, buttons: [{ label: t('menu.ok'), value: 'ok', default: true }] });
}

Object.assign(P, { aboutDialog, attributesDialog, customZoomDialog, flipRotateDialog, helpDialog, msgBox, openDialog, saveAsDialog, stretchSkewDialog });
})();
