/* PhotoSlop: boot. */
'use strict';

let samplerCtx = null;
const sampler = () => samplerCtx || (samplerCtx = mkCanvas(1, 1).getContext('2d', { willReadFrequently: true }));
function buildStatus() {
  const sb = $('#status');
  const zoom = h('input', { class: 'sb-zoom', type: 'text', 'aria-label': tr('photoslop.status.zoom'), 'data-i18n-attr': 'aria-label:photoslop.status.zoom', spellcheck: 'false' });
  const size = h('span', { class: 'sb-size' }), pos = h('span', { class: 'sb-pos' }), col = h('span', { class: 'sb-col' }), chip = h('i', { class: 'sb-chip' });
  const rot = h('span', { class: 'sb-rot', title: tr('photoslop.status.rotation'), 'data-i18n-attr': 'title:photoslop.status.rotation' });
  const saved = h('span', { id: 'sbSaved', class: 'sb-saved', 'data-i18n': 'photoslop.status.local_only' }, tr('photoslop.status.local_only'));
  sb.append(zoom, size, pos, h('span', { class: 'sb-colwrap' }, chip, col), rot, h('span', { class: 'sb-fill' }), saved);
  const fmtZ = () => (V.zoom * 100 < 10 ? (V.zoom * 100).toFixed(1) : Math.round(V.zoom * 100)) + '%';
  zoom.addEventListener('change', () => { const v = parseFloat(zoom.value); if (v > 0) setZoom(v / 100); zoom.blur(); });
  zoom.addEventListener('keydown', (e) => { if (e.key === 'Enter') zoom.dispatchEvent(new Event('change')); e.stopPropagation(); });
  const sync = () => {
    if (document.activeElement !== zoom) zoom.value = fmtZ();
    size.textContent = tr('photoslop.status.size', { w: String(D.w), h: String(D.h), n: D.layers.length });
    rot.textContent = V.rot ? `∠ ${Math.round(V.rot)}°` : '';
  };
  let colT = 0;
  listeners.add((w) => {
    if (w === 'zoom' || w === 'doc') sync();
    if (w === 'cursor' && V.cursor) {
      const x = Math.floor(V.cursor.x), y = Math.floor(V.cursor.y), inside = x >= 0 && y >= 0 && x < D.w && y < D.h;
      pos.textContent = inside ? `X ${x}  Y ${y}` : '';
      const now = performance.now();
      if (inside && V.comp && now - colT > 60) {
        colT = now;
        // Sample through a 1×1 canvas: reading pixels straight off the composite would make
        // the browser move that big canvas off the GPU, and every brush frame would crawl.
        const sg = sampler(); sg.clearRect(0, 0, 1, 1); sg.drawImage(V.comp, x, y, 1, 1, 0, 0, 1, 1);
        const d = sg.getImageData(0, 0, 1, 1).data;
        col.textContent = d[3] ? `${rgbToHex(d[0], d[1], d[2])}${d[3] < 255 ? ' · ' + Math.round((d[3] / 255) * 100) + '%' : ''}` : tr('photoslop.status.transparent');
        chip.style.background = d[3] ? `rgba(${d[0]},${d[1]},${d[2]},${d[3] / 255})` : 'transparent';
      } else if (!inside) { col.textContent = ''; chip.style.background = 'transparent'; }
    }
    if (w === 'docname' || w === 'history') {
      const t = $('#docTitle'); if (t) t.textContent = (D.name || tr('ui.untitled')) + (D.dirty ? ' •' : '');
      document.title = `${D.name || tr('ui.untitled')}${D.dirty ? ' •' : ''} — ${window.slopAppName ? slopAppName('photoslop') : 'PhotoSlop'}`;   // the app list's name
    }
  });
  sync();
  onLang(sync);
}

/** Phones: the panels (Layers, History…) are a drawer from the right. SlopSheet (shared/ui/sheet.js) does the Layers
 * button, the ×, Escape, a tap outside (on the picture too) and the swipe. */
function wireMobile() {
  window.PS_SHEET = SlopSheet.attach({ root: document.body, panel: $('#panels'), side: 'end', phone: '(max-width: 900px)', toggles: [$('#panelToggle')], label: tr('photoslop.app.panels') });
}

let domLoaded = false; // set by a listener registered while this script parses, so it runs before any other DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', () => { domLoaded = true; }, { once: true });

async function boot() {
  if (!window.SlopTheme) setTheme(store.get('theme', 'pro')); // the shared script has already painted the choice
  initView();
  initBoxTool();
  initGuideInput();
  buildMenubar();
  buildToolbox();
  buildPanels();
  buildStatus();
  wireMobile();
  // The suite rule (shared/frame/HANDOFF.md): Export, the main button, is at the foot of the right-hand panels (the shared
  // footer, shared/frame/panel.js), as well as File ▸ Export As….
  if (window.SlopResizePanel) SlopResizePanel.attach($('#panels'), { app: 'photoslop', id: 'panels', edge: 'start', width: 280, min: 220, max: 560,
    phone: '(max-width: 900px)', cssVar: '--ps-panels-w', target: $('.main'), label: tr('photoslop.app.panels') });   // shared/ui/resize-panel.js
  SlopFramePanel.create($('#panels'), { bare: true })
    .footer([{ el: $('#exportBtn'), run: () => dlgExport() }]);
  $('#viewport').before(buildViewBar()); // the viewport toolbar (view rotation), above the canvas
  $('#themeToggle').addEventListener('click', () => setTheme(theme() === 'pro' ? 'light' : theme() === 'light' ? 'paint' : 'pro'));
  window.PSTopbarFit && PSTopbarFit.mount();
  $('#newBtn').addEventListener('click', () => dlgNew());
  selectTool(TOOL[store.get('tool', 'brush')] ? store.get('tool', 'brush') : 'brush');
  wireCommands();
  onLang(relabelUI);
  $('#cmdBtn').addEventListener('click', () => openCommandPalette());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('keydown', (e) => { pasteInPlace = e.shiftKey; }, true);
  window.addEventListener('blur', () => { V.space = false; V.el.classList.remove('space'); });
  // Every file comes in through the one intake (app/intake.js, shared/intake): a pasted picture or PSD asks Add to the open
  // document or New document there. The intake's paste listener runs first and marks the paste prevented, so onPaste is
  // only the app's own clipboard (and our buffer copies, which the intake leaves alone).
  registerIntake();
  document.addEventListener('paste', onPaste); // intake-ok: the app's own clipboard, not files
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDropFiles); // intake-ok: a picture dragged from a web page (a URL), sent to SlopIntake.take
  bindBufferDrop();
  bindFileDrop();
  window.addEventListener('beforeunload', (e) => { flushAutosave(); if (DOCS.some(docIsDirty)) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && D.dirty) autosave(); });
  listeners.add((w) => { if (w === 'history' && Hist.idx > 0) scheduleAutosave(); });
  await loadBrushPacks();
  const restored = await loadAutosave();
  const launched = await hubBoot().catch((e) => { console.warn(e); return false; });
  if (!restored && !launched) { newBlankTab(); showWelcome(); }
  await restoreView(restored && !launched);
  emit('docname');
  // 'ready' promises the page is fully set up. The boot awaits above can finish while the page is still parsing,
  // before DOMContentLoaded handlers run (the Tour button is mounted there), so wait for them first.
  // A timer tick runs after DOMContentLoaded and all its handlers (the Tour button mounts in one of them).
  await new Promise((r) => (domLoaded ? setTimeout(r, 0) : document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true })));
  document.body.classList.add('ready');
  if (!store.get('welcomed', false)) { store.set('welcomed', true); setTimeout(() => toast(tr('photoslop.app.welcome_toast'), 3600), 400); }
}
/** A language change (SlopI18n's slopi18n event): the parts built once are built again in the new language. The marked
 * elements (data-i18n) are done by SlopI18n.apply(); the panels follow on their own 'doc' redraw. */
function relabelUI() {
  closeMenus();
  buildMenubar();
  labelToolbox();
  buildOptions();
  renderTabs();
  if (CMD_ON) registerCommands();
  if (window.PSTopbarFit) PSTopbarFit.relabel();
  emit('doc'); emit('docname'); emit('tool');
}
boot();
