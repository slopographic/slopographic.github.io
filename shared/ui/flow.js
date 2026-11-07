/* SlopFlow: "this becomes that", drawn as two file tiles joined by an arrow: PDF → DOCX. The one picture of a conversion
 * for every app (the Convert hub cards, each converter page, the Convert dialog, an app's export). The arrow draws itself
 * when the pair changes, marches while the work runs (with a progress fill), and the target tile ticks when it is done.
 * Classic script that also works as a side-effect ES-module import (import '../../shared/ui/flow.js'); sets window.SlopFlow.
 * Its styles are injected once (#sflow-style), so a page needs only this file. Motion stops under prefers-reduced-motion.
 *   const f = SlopFlow.create({ from: 'pdf', to: 'docx', size: 'lg' | 'md' | 'sm', label })   from may be a list of kinds
 *   f.el                           the element (role img; aria-label "PDF to DOCX", or label)
 *   f.set({ from, to, label })     a new pair; the arrow draws again when it changed
 *   f.state('idle' | 'run' | 'done' | 'error');  f.progress(0..1)
 *   f.onTo(fn, label?)            the target tile becomes a button with a ▾: fn(tile) on click (pick another format)
 *   Labels (create/set label, onTo label) may be i18n keys or functions: the spoken names follow a language change.
 *   SlopFlow.tile(kind, { size })  one tile on its own (a format picker's option)
 *   SlopFlow.family('docx') -> 'doc'   the colour family of a kind (pdf, doc, sheet, slide, image, video, audio, text, code, archive, file)
 *   SlopFlow.tag('jpeg') -> 'JPG'      the short name on a tile */
(function (g) {
  'use strict';
  if (g.SlopFlow) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const FAMILY = {
    pdf: ['pdf'], doc: ['docx', 'doc', 'odt', 'rtf', 'epub', 'word'], sheet: ['xlsx', 'xls', 'ods', 'csv', 'tsv', 'excel'],
    slide: ['pptx', 'ppt', 'odp', 'key'], image: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg', 'ico', 'tif', 'tiff', 'avif', 'heic', 'image', 'images'],
    video: ['mp4', 'webm', 'mov', 'mkv', 'video'], audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'audio'],
    text: ['txt', 'md', 'markdown', 'text', 'eml', 'vcf', 'vcard', 'ics'], code: ['html', 'htm', 'json', 'xml', 'yaml', 'css', 'js', 'base64', 'url'],
    archive: ['zip', 'tar', 'gz', '7z'],
  };
  const BY = {};
  for (const [fam, list] of Object.entries(FAMILY)) for (const k of list) BY[k] = fam;
  const NAME = { jpeg: 'JPG', markdown: 'MD', htm: 'HTML', vcard: 'VCF', tiff: 'TIF', images: 'IMAGES' };
  /** A plural ('PDFs') takes its singular's family. */
  const family = (k) => { const s = String(k || '').toLowerCase(); return BY[s] || BY[s.replace(/s$/, '')] || 'file'; };
  /** A kind id ('jpeg') is shown by its short name ('JPG'); a label someone already wrote ('PDFs') is shown as written. */
  const tag = (k) => { const r = String(k || ''), s = r.toLowerCase(); return r !== s ? r : NAME[s] || (s ? s.toUpperCase() : 'FILE'); };
  const list = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean);

  const CSS = `
.sflow{--sflow-w:46px;display:inline-flex;align-items:center;gap:10px;max-width:100%;vertical-align:middle;font:inherit}
.sflow[data-size=lg]{--sflow-w:68px;gap:16px}.sflow[data-size=sm]{--sflow-w:34px;gap:6px}
.sflow-tile{position:relative;flex:none;display:grid;place-items:end center;width:var(--sflow-w);aspect-ratio:4/5;padding-bottom:calc(var(--sflow-w)*.14);box-sizing:border-box;
 border-radius:calc(var(--sflow-w)*.12) calc(var(--sflow-w)*.3) calc(var(--sflow-w)*.12) calc(var(--sflow-w)*.12);background:var(--sflow-c);color:#fff;
 font-weight:800;font-size:calc(var(--sflow-w)*.24);letter-spacing:.02em;line-height:1;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.18)}
.sflow-tile::before{content:"";position:absolute;top:0;right:0;width:30%;height:24%;border-radius:0 calc(var(--sflow-w)*.3) 0 calc(var(--sflow-w)*.08);background:linear-gradient(225deg,transparent 50%,rgba(255,255,255,.45) 50%)}
.sflow-tile::after{content:"";position:absolute;left:18%;right:18%;top:30%;height:22%;background:repeating-linear-gradient(180deg,rgba(255,255,255,.55) 0 2px,transparent 2px 5px);opacity:.8}
.sflow-tile b{position:relative;z-index:1;max-width:100%;overflow:hidden;text-overflow:clip;white-space:nowrap;padding:0 2px}
.sflow-more{position:absolute;z-index:2;right:-6px;top:-6px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:var(--sl-text,#222);color:var(--sl-surface,#fff);font-size:11px;font-weight:700;display:grid;place-items:center}
.sflow-track{position:relative;flex:1 1 auto;min-width:calc(var(--sflow-w)*.9);max-width:calc(var(--sflow-w)*3);height:4px;border-radius:2px;
 background:repeating-linear-gradient(90deg,color-mix(in srgb,currentColor 45%,transparent) 0 8px,transparent 8px 14px);transform-origin:left center}
.sflow-track::after{content:"";position:absolute;right:-2px;top:50%;width:10px;height:10px;border:solid color-mix(in srgb,currentColor 70%,transparent);border-width:3px 3px 0 0;transform:translateY(-50%) rotate(45deg)}
.sflow-fill{position:absolute;left:0;top:0;bottom:0;width:calc(var(--sflow-p,0)*100%);border-radius:2px;background:var(--sl-accent,#4f6c00);transition:width .25s}
.sflow-dot{position:absolute;top:50%;left:0;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--sl-accent,#4f6c00);opacity:0}
.sflow-to{transition:transform .2s}
.sflow-mark{position:absolute;z-index:2;right:-7px;bottom:-7px;width:20px;height:20px;border-radius:50%;display:none;place-items:center;font-size:12px;font-weight:800;color:#fff;box-shadow:0 0 0 2px var(--sl-surface,#fff)}
.sflow[data-state=done] .sflow-to .sflow-mark{display:grid;background:#2e8540}.sflow[data-state=done] .sflow-to .sflow-mark::before{content:"\\2713"}
.sflow[data-state=error] .sflow-to .sflow-mark{display:grid;background:#c62828}.sflow[data-state=error] .sflow-to .sflow-mark::before{content:"!"}
.sflow-more[hidden]{display:none}
.sflow-pick{cursor:pointer}.sflow-pick:focus-visible{outline:3px solid var(--sl-accent,#4f6c00);outline-offset:3px}
.sflow-caret{position:absolute;z-index:3;left:-8px;bottom:-8px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:var(--sl-text,#222);color:var(--sl-surface,#fff);font-size:12px;font-weight:700;box-shadow:0 0 0 2px var(--sl-surface,#fff)}
.sflow-pick:hover{transform:translateY(-2px)}
.sflow[data-state=error] .sflow-track{background:repeating-linear-gradient(90deg,#c62828 0 8px,transparent 8px 14px)}
.sflow[data-state=done] .sflow-fill{width:100%}
.sflow-tile[data-family=pdf]{--sflow-c:#d93025}.sflow-tile[data-family=doc]{--sflow-c:#2b5bd7}.sflow-tile[data-family=sheet]{--sflow-c:#187a33}
.sflow-tile[data-family=slide]{--sflow-c:#b85200}.sflow-tile[data-family=image]{--sflow-c:#8e44ad}.sflow-tile[data-family=video]{--sflow-c:#c2185b}
.sflow-tile[data-family=audio]{--sflow-c:#00796b}.sflow-tile[data-family=text]{--sflow-c:#5f6368}.sflow-tile[data-family=code]{--sflow-c:#37474f}
.sflow-tile[data-family=archive]{--sflow-c:#8d6e63}.sflow-tile[data-family=file]{--sflow-c:#757575}
@media (prefers-reduced-motion:no-preference){
 .sflow.sflow-intro .sflow-from{animation:sflow-in .35s ease-out both}
 .sflow.sflow-intro .sflow-track{animation:sflow-draw .45s .15s ease-out both}
 .sflow.sflow-intro .sflow-to{animation:sflow-pop .4s .5s cubic-bezier(.3,1.6,.6,1) both}
 .sflow[data-state=run] .sflow-track{animation:sflow-march .6s linear infinite}
 .sflow[data-state=run] .sflow-dot{animation:sflow-travel 1.1s ease-in-out infinite}
 .sflow[data-state=run] .sflow-from{animation:sflow-pulse 1.1s ease-in-out infinite}
 .sflow[data-state=done] .sflow-to{animation:sflow-pop .4s cubic-bezier(.3,1.6,.6,1)}
}
@keyframes sflow-in{from{opacity:0;transform:translateX(-8px)}}
@keyframes sflow-draw{from{transform:scaleX(0)}}
@keyframes sflow-pop{from{opacity:0;transform:scale(.6)}}
@keyframes sflow-march{to{background-position:14px 0}}
@keyframes sflow-travel{0%{left:0;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:100%;opacity:0}}
@keyframes sflow-pulse{50%{transform:translateY(-2px)}}`;

  function style() {
    const doc = g.document;
    if (!doc || doc.getElementById('sflow-style')) return;
    const s = doc.createElement('style');
    s.id = 'sflow-style';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }
  function tile(cls) {
    const t = g.document.createElement('span');
    t.className = 'sflow-tile ' + cls;
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = '<b></b><span class="sflow-more" hidden></span><span class="sflow-mark"></span>';
    return t;
  }
  function paintTile(t, kinds) {
    const k = kinds[0];
    t.dataset.family = family(k);
    t.querySelector('b').textContent = tag(k);
    const more = t.querySelector('.sflow-more');
    more.hidden = kinds.length < 2;
    more.textContent = '+' + (kinds.length - 1);
  }

  /** A label given to create/set/onTo: an i18n key (translated, again on a language change), a function, or text. */
  const lab = (v) => { const I = g.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };
  /** The pictures made so far (weakly held): their spoken names follow a language change (shared/i18n). */
  const live = new Set();
  if (g.SlopI18n && g.SlopI18n.on && g.WeakRef) g.SlopI18n.on(() => { for (const r of live) { const a = r.deref(); if (a) a.words(); else live.delete(r); } });

  function create(opts) {
    style();
    const el = g.document.createElement('span');
    el.className = 'sflow';
    el.setAttribute('role', 'img');
    el.dataset.size = (opts && opts.size) || 'md';
    el.dataset.state = 'idle';
    const from = tile('sflow-from'), to = tile('sflow-to');
    const track = g.document.createElement('span');
    track.className = 'sflow-track';
    track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<span class="sflow-fill"></span><span class="sflow-dot"></span>';
    el.append(from, track, to);
    let key = '', cur = {}, pick = null;   // pick: the target tile's label once it is a button (onTo)
    const api = {
      el,
      set(o) {
        const f = list(o.from), t = list(o.to);
        cur = o;
        paintTile(from, f.length ? f : ['file']);
        paintTile(to, t.length ? t : ['file']);
        api.words();
        const k = f.join() + '>' + t.join();
        if (k !== key) {   // a new pair starts idle and draws its arrow again (the class goes off and back on a fresh frame)
          key = k;
          api.state('idle');
          el.classList.remove('sflow-intro');
          void el.offsetWidth;
          el.classList.add('sflow-intro');
        }
        return api;
      },
      /** The spoken names in the current language (called again on a language change). */
      words() {
        const f = list(cur.from), t = list(cur.to);
        el.setAttribute('aria-label', cur.label ? lab(cur.label) : tr('ui.flow.from_to', '{from} to {to}', { from: f.map(tag).join(', ') || tr('ui.flow.file', 'File'), to: t.map(tag).join(', ') || tr('ui.flow.file_lc', 'file') }));
        if (pick) to.setAttribute('aria-label', pick.label ? lab(pick.label) : tr('ui.flow.pick', 'Choose the format to make'));
        return api;
      },
      state(s) { el.dataset.state = s; if (s === 'idle') api.progress(0); return api; },
      progress(p) { el.style.setProperty('--sflow-p', String(Math.max(0, Math.min(1, Number(p) || 0)))); return api; },
      /** Makes the target tile a button (a small ▾ says it can be changed): fn(tile) on click, Enter or Space. */
      onTo(fn, label) {
        to.removeAttribute('aria-hidden');
        Object.assign(to, { tabIndex: 0 });
        to.setAttribute('role', 'button');
        pick = { label };
        api.words();
        to.classList.add('sflow-pick');
        if (!to.querySelector('.sflow-caret')) { const c = g.document.createElement('span'); c.className = 'sflow-caret'; c.textContent = '\u25BE'; c.setAttribute('aria-hidden', 'true'); to.append(c); }
        const go = (e) => { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); fn(to); };
        to.addEventListener('click', go); to.addEventListener('keydown', go);
        return api;
      },
    };
    el.slopFlow = api;   // the element keeps its words alive while it is on the page (live holds them weakly)
    if (g.WeakRef) live.add(new g.WeakRef(api));
    return api.set(opts || {});
  }

  /** One file tile on its own, the same look as the picture's ('PDF', 'XLSX'): a format picker's option, say. */
  function solo(kind, opts) {
    style();
    const el = g.document.createElement('span');
    el.className = 'sflow sflow-solo';
    el.dataset.size = (opts && opts.size) || 'sm';
    el.setAttribute('aria-hidden', 'true');
    const t = tile('');
    paintTile(t, [kind || 'file']);
    el.append(t);
    return el;
  }

  g.SlopFlow = { create, tile: solo, family, tag, FAMILY };
})(typeof window !== 'undefined' ? window : globalThis);
