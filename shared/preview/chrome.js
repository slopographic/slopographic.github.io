/* SlopPreview — chrome: the stylesheet (injected once), the small DOM pieces of a viewer (header, toolbar,
 * footer) and the file actions (open in a new tab, download, share). Classic script; it adds to window.SlopPreview,
 * which preview.js completes with create(). Colours come from the --sui-* tokens when a page has them.
 * Words: shared/i18n/ui/<code>/preview.js (keys ui.pv.*). The viewer's own words are marked (data-i18n, data-i18n-attr),
 * so a language switch rewrites them in place (SlopI18n.apply). */
(function () {
  'use strict';
  const SP = (window.SlopPreview = window.SlopPreview || {});
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  SP.tr = tr;
  const CSS = [
    '.spv{--spv-fg:var(--sui-fg,var(--fg,#f1ede4));--spv-line:var(--sui-line,var(--line-2,#3d3d3d));',
    'display:flex;flex-direction:column;position:relative;box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;',
    'color:var(--spv-fg);font:13px/1.3 system-ui,sans-serif;outline:none}',
    '.spv *{box-sizing:border-box}',
    '.spv .spv-head,.spv .spv-foot{display:flex;align-items:center;gap:8px;flex:none;padding:6px 8px 6px 12px}',
    '.spv .spv-head{border-bottom:1px solid var(--spv-line);font-weight:600}',
    '.spv .spv-foot{justify-content:flex-end;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--spv-line)}',
    '.spv .spv-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.spv .spv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:none;padding:4px 6px;border-bottom:1px solid var(--spv-line)}',
    '.spv .spv-sp{flex:1}',
    '.spv .spv-b{min-height:28px;min-width:28px;padding:0 9px;border:0;border-radius:6px;background:rgba(127,127,127,.18);color:inherit;font:inherit;font-size:12px;cursor:pointer}',
    '.spv .spv-b:hover,.spv .spv-b:focus-visible{outline:none;background:rgba(127,127,127,.34)}',
    '.spv .spv-pct{min-width:46px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;opacity:.85}',
    '.spv .spv-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.spv .spv-stage.spv-drag{cursor:grabbing}',
    '.spv .spv-stage.spv-static{cursor:default}',
    '.spv .spv-content{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}',
    '.spv .spv-img{display:block;width:100%;height:100%;max-width:none!important;max-height:none!important;pointer-events:none}',
    '.spv .pv-pages{display:flex;flex-direction:column;align-items:center;gap:12px}',
    '.spv .pv-pages canvas{display:block;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35)}',
    '.spv .spv-note{position:absolute;left:0;right:0;bottom:10px;padding:0 12px;text-align:center;font-size:12px;opacity:.75;pointer-events:none}',
    '.spv .spv-note.spv-mid{top:0;bottom:0;display:grid;place-items:center}',
  ].join('');

  SP.GAP = 12; // the space between PDF pages, in CSS px (the layout reads it too)
  SP.injectStyle = function () {
    if (document.getElementById('spv-style')) return;
    const s = document.createElement('style');
    s.id = 'spv-style';
    s.textContent = CSS;
    document.head.append(s);
  };
  SP.el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  /** A button with the words of keys (textKey: its text, or null for a symbol given as text; titleKey: its title and
   *  accessible name), marked so a language switch rewrites them. */
  SP.keyed = function (text, textKey, titleKey, act) {
    const b = SP.button(textKey ? tr(textKey) : text, titleKey ? tr(titleKey) : null, act);
    if (textKey) b.setAttribute('data-i18n', textKey);
    if (titleKey) b.setAttribute('data-i18n-attr', 'title:' + titleKey + ';aria-label:' + titleKey);
    return b;
  };
  /** A button whose accessible name is its title (or its label when there is no title). */
  SP.button = function (label, title, act, cls = 'spv-b') {
    const b = SP.el('button', cls, label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', () => act());
    return b;
  };

  /** File actions. The blob URL is opened in a new window without an opener; the browser's share sheet gets the file. */
  SP.openInTab = function (url) { window.open(url, '_blank', 'noopener'); };
  SP.download = function (url, name) {
    const a = SP.el('a');
    a.href = url;
    a.download = name || 'download';
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
  };
  SP.share = async function (url, name) {
    const blob = await (await fetch(url)).blob();
    const title = name || 'file';
    const data = { title, files: [new File([blob], title, { type: blob.type })] };
    if (navigator.canShare && !navigator.canShare(data)) delete data.files;
    try { await navigator.share(data); } catch (e) { if (!e || e.name !== 'AbortError') throw e; }
  };

  /** The header: the file name and a close button. */
  SP.head = function (title, onClose) {
    const h = SP.el('div', 'spv-head');
    h.append(SP.el('span', 'spv-title', title), SP.keyed('×', null, 'ui.pv.close', onClose));
    return h;
  };
  /** The footer: one button per host action ({ label, act, primary }). */
  SP.foot = function (actions) {
    const f = SP.el('div', 'spv-foot');
    for (const a of actions || []) f.append(SP.button(a.label, null, () => { if (a.act) a.act(); }, 'spv-b' + (a.primary ? ' spv-prim' : '')));
    return f;
  };
  /** The toolbar: zoom out, the percentage readout, zoom in, Fit and 1:1 (when h.zoom), then open in a new tab,
   * download and share (when h.share is a function). Returns { bar, pct }. */
  SP.bar = function (h) {
    const pct = SP.el('span', 'spv-pct', '100%');
    pct.setAttribute('aria-live', 'polite');
    const zoom = h.zoom ? [
      SP.keyed('−', null, 'ui.pv.zoom_out', h.zoomOut), pct, SP.keyed('+', null, 'ui.pv.zoom_in', h.zoomIn),
      SP.keyed('', 'ui.pv.fit', 'ui.pv.fit_tip', h.fit), SP.keyed('1:1', null, 'ui.pv.actual_tip', h.actual),
    ] : [];
    const files = [SP.keyed('', 'ui.pv.open_tab', 'ui.pv.open_tab_tip', h.openTab), SP.keyed('', 'ui.download', 'ui.download', h.download)];
    if (h.share) files.push(SP.keyed('', 'ui.pv.share', 'ui.pv.share', h.share));
    const bar = SP.el('div', 'spv-bar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', tr('ui.pv.bar_aria'));
    bar.setAttribute('data-i18n-attr', 'aria-label:ui.pv.bar_aria');
    bar.append(...zoom, SP.el('span', 'spv-sp'), ...files);
    return { bar, pct };
  };
})();
