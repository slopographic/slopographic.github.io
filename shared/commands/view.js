/* SlopCmd view: what any page shows, for the assistant, when the app shares nothing of its own (SlopCmd.provide({ state,
 * snapshot })). Classic script, loaded on demand by shared/commands/commands.js (SlopCmd.state() and SlopCmd.snapshot()
 * without a provider) and by the AI tools; sets SlopCmd._parts.view (and window.SlopView where there is no SlopCmd).
 *   state(root?)            → a compact summary of the work area: { app, title, view (the selected tab), dialog, headings,
 *                             fields [{ label, value }], tables [{ rows, head, first }], lists, selection, from: 'page' }
 *   snapshot(root?)         → Promise<Blob|canvas>: the picture the app hands to Convert when it has one (its open
 *                             picture), else draw(root)
 *   draw(root?, opts?)      → Promise<canvas>: a picture of the work area (the DOM drawn as an SVG foreignObject, its
 *                             canvases, pictures and form values copied in; nothing is fetched from other sites)
 *   root()                  → the work area: [data-ai-view], else main, #app, .app, else body. The AI panel (.sap), the
 *                             menu bar, the shell's header and anything [data-ai-skip] are left out of both. */
(function (g) {
  'use strict';
  const SKIP = '.sap, .ssh-panel, script, style, link, noscript, template, [data-ai-skip], .sh-header, .slop-menubar, .sui-toast';
  const MAX_NODES = 4000, MAX_H = 6000;
  const text = (s, n = 80) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const skipped = (el) => !!(el.closest && el.closest(SKIP));
  const own = (root, sel) => [...root.querySelectorAll(sel)].filter((el) => !skipped(el) && visible(el));

  function root() {
    const d = g.document;
    return d.querySelector('[data-ai-view]') || d.querySelector('main') || d.getElementById('app') || d.querySelector('.app') || d.body;
  }
  function labelOf(el) {
    if (el.labels && el.labels[0]) return text(el.labels[0].textContent, 60);
    const by = el.getAttribute('aria-labelledby'), lab = by && g.document.getElementById(by);
    return text((lab && lab.textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id, 60);
  }
  function valueOf(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (el.tagName === 'SELECT') return text(el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent : el.value);
    if (el.isContentEditable) return text(el.textContent, 160);
    return text(el.value, 160);
  }
  function table(t) {
    const rows = [...t.rows], head = rows.length && rows[0].querySelector('th') ? [...rows.shift().cells].map((c) => text(c.textContent, 30)) : [];
    return { rows: rows.length, head, first: rows.slice(0, 5).map((r) => [...r.cells].map((c) => text(c.textContent, 40))) };
  }

  function state(at) {
    const r = at || root(), C = g.SlopCmd;
    const out = { app: (C && C.app && C.app !== 'default' ? C.app : '') || text(g.document.title.split(/[|–—]/)[0], 60), title: text(g.document.title, 100), from: 'page' };
    const tab = own(g.document, '[role="tab"][aria-selected="true"]')[0];
    if (tab) out.view = text(tab.textContent, 40);
    const dlg = [...g.document.querySelectorAll('[role="dialog"], dialog[open]')].filter(visible).pop();
    if (dlg) out.dialog = text((dlg.querySelector('h1, h2, h3, .sui-title') || dlg).textContent, 80);
    const heads = own(r, 'h1, h2, h3').map((h) => text(h.textContent, 80)).filter(Boolean);
    if (heads.length) out.headings = [...new Set(heads)].slice(0, 10);
    const fields = own(r, 'input:not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"]), select, textarea, [contenteditable="true"]')
      .map((el) => ({ label: labelOf(el), value: valueOf(el) })).filter((f) => f.label || (f.value !== '' && f.value != null));
    if (fields.length) out.fields = fields.slice(0, 30);
    const tables = own(r, 'table').map(table).filter((t) => t.rows);
    if (tables.length) out.tables = tables.slice(0, 4);
    const lists = own(r, '[role="listbox"], [role="grid"], [role="list"], ul.list, ol').map((l) => {
      const items = [...l.children].filter(visible);
      return { items: items.length, first: items.slice(0, 6).map((i) => text(i.textContent, 60)) };
    }).filter((l) => l.items);
    if (lists.length) out.lists = lists.slice(0, 4);
    const sel = g.getSelection && String(g.getSelection() || '');
    if (sel) out.selection = text(sel, 200);
    const media = own(r, 'canvas, img, video, svg').filter((m) => m.offsetWidth > 120 && m.offsetHeight > 80);
    if (media.length) out.pictures = media.slice(0, 6).map((m) => ({ kind: m.tagName.toLowerCase(), width: m.offsetWidth, height: m.offsetHeight, name: text(m.getAttribute('alt') || m.getAttribute('aria-label') || '', 40) || undefined }));
    return out;
  }

  /** A same-origin picture as a data: URL (a canvas, an <img>, a video frame); null when it cannot be read. */
  function dataUrl(src, w, h) {
    try {
      if (src.tagName === 'CANVAS') return src.toDataURL('image/png');
      const c = g.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    } catch (e) { return null; }   // another site's picture taints the canvas: left out
  }
  const NS_HTML = 'http://www.w3.org/1999/xhtml';
  /** The element as a detached copy with its computed style inline, so the copy looks the same inside an SVG picture. */
  function copy(el, budget) {
    if (budget.n-- <= 0) return null;
    if (el.nodeType === 3) return g.document.createTextNode(el.nodeValue);
    if (el.nodeType !== 1 || (el.matches && el.matches(SKIP))) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return null;
    const tag = el.tagName;
    let out;
    if (tag === 'CANVAS' || tag === 'IMG' || tag === 'VIDEO') {
      const w = el.offsetWidth || el.width || 1, h = el.offsetHeight || el.height || 1;
      const src = tag === 'IMG' && /^data:/.test(el.currentSrc || el.src) ? el.currentSrc || el.src : dataUrl(el, tag === 'CANVAS' ? el.width : el.naturalWidth || el.videoWidth || w, tag === 'CANVAS' ? el.height : el.naturalHeight || el.videoHeight || h);
      out = g.document.createElementNS(NS_HTML, src ? 'img' : 'div');
      if (src) out.setAttribute('src', src);
    } else if (tag === 'IFRAME') out = g.document.createElementNS(NS_HTML, 'div');
    else if (el instanceof g.SVGElement) { out = el.cloneNode(true); out.setAttribute('width', el.getBoundingClientRect().width); out.setAttribute('height', el.getBoundingClientRect().height); }
    else {
      out = g.document.createElementNS(NS_HTML, tag.toLowerCase());
      if (tag === 'INPUT') { out.setAttribute('type', el.type); if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) out.setAttribute('checked', ''); } else out.setAttribute('value', el.value); }
      for (const k of el.childNodes) {
        if (tag === 'TEXTAREA') break;
        const c = copy(k, budget);
        if (c) out.append(c);
      }
      if (tag === 'TEXTAREA') out.textContent = el.value;
      if (tag === 'SELECT') for (const [i, o] of [...out.children].entries()) if (el.options[i] && el.options[i].selected) o.setAttribute('selected', '');
    }
    let css = '';
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i], v = cs.getPropertyValue(p);
      if (/url\(/.test(v) && !/url\("?data:/.test(v)) continue;   // nothing from elsewhere: only data: pictures stay
      css += `${p}:${v};`;
    }
    if (el instanceof g.SVGElement) css = `width:${el.getBoundingClientRect().width}px;height:${el.getBoundingClientRect().height}px;`;
    out.setAttribute('style', css + (tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO' ? `width:${el.offsetWidth}px;height:${el.offsetHeight}px;` : ''));
    return out;
  }

  /** A picture of the work area (or of root): a canvas at most opts.max px wide (1600), the page's own colours behind it. */
  async function snapshot(at, opts = {}) {
    const r = at || root(), box = r.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(Math.max(box.width, r === g.document.body ? g.innerWidth : 0)));
    const h = Math.max(1, Math.min(MAX_H, Math.ceil(r === g.document.body ? Math.max(box.height, g.innerHeight) : Math.max(box.height, r.scrollHeight))));
    const body = copy(r, { n: MAX_NODES });
    if (!body) throw new Error('There is nothing to show here yet');
    body.style.margin = '0';
    const wrap = g.document.createElementNS(NS_HTML, 'div');
    wrap.setAttribute('style', `width:${w}px;height:${h}px;overflow:hidden;background:${getComputedStyle(g.document.body).backgroundColor || '#fff'}`);
    wrap.append(body);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${new XMLSerializer().serializeToString(wrap)}</foreignObject></svg>`;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The page could not be drawn')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const k = Math.min(1, (opts.max || 1600) / w), c = g.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /** The picture the app hands to the Convert dialog (shared/convert/provided.js, the same event), when it is one. */
  async function openPicture() {
    const offers = [];
    g.dispatchEvent(new CustomEvent('slop:convert-files', { detail: { provide: (x) => offers.push(x) } }));
    for (const x of offers) {
      try {
        for (const f of [].concat((await (typeof x === 'function' ? x() : x)) || [])) {
          const b = f && (f.blob || f), name = (f && f.name) || '';
          if (b instanceof Blob && (/^image\/(png|jpe?g|webp|gif|bmp|avif|svg)/.test(b.type) || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(name))) return b;
        }
      } catch (e) { /* that app could not hand it over: the page is drawn instead */ }
    }
    return null;
  }
  /** The work as a picture: the open picture the app would hand to Convert, else the work area drawn. */
  async function work(at) { return (at ? null : await openPicture()) || snapshot(at); }

  const api = { state, snapshot: work, draw: snapshot, root };
  if (g.SlopCmd && g.SlopCmd._parts) g.SlopCmd._parts.view = api;
  g.SlopView = api;
})(window);
