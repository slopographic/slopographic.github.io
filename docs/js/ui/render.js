/* Slop Docs — ui/render: draws the laid-out pages as absolutely placed text: one span per font run of a fragment
 * (layout/runs.js), at the x the layout gave it, in exactly the face the layout measured (a language face for Arabic,
 * Chinese… has its own CSS name) — the same runs the PDF writes. A right-to-left run is a dir="rtl" span. Geometry
 * (caret, hit-testing, selection) is ui/geom.js. Classic script; window.SlopDocs.R. */
(function () {
  'use strict';
  const S = window.SlopDocs, R = (S.R = {});
  const E = () => window.SlopDocEngine;
  const pagesEl = () => document.getElementById('pages');
  /** Pixels per point on screen (the page is 1pt = 4/3 px at 100%). */
  R.k = () => (4 / 3) * S.zoom;

  function el(tag, cls, css) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (css) Object.assign(n.style, css);
    return n;
  }
  function addFrag(page, it, f, k) {
    const runs = E().fragRuns(f);
    if (!runs.length) return;
    const st = f.st, m = st.m || {}, own = `${E().cssFamily(E().familyOf(m.font))}, Arimo, Arial, sans-serif`;
    const deco = [m.u ? 'underline' : '', m.s ? 'line-through' : ''].filter(Boolean).join(' ');
    for (const r of runs) {
      const lang = r.face && r.face.lang, vm = E().vmetrics(r.face || st.face, st.size);
      const s = el('span', 't', {
        left: (it.x + f.x + r.dx) * k + 'px',
        top: (it.y + it.line.baseline - vm.asc + (st.dy || 0)) * k + 'px',
        fontFamily: lang ? `"${r.face.css}"` : own,
        fontSize: st.size * k + 'px',
        lineHeight: (vm.asc + vm.desc) * k + 'px',
        fontWeight: lang ? '400' : m.b ? '700' : '400',
        fontStyle: !lang && m.i ? 'italic' : 'normal',
      });
      // a shaped right-to-left run is drawn by the browser (dir="rtl"); other right-to-left text (spaces and brackets
      // between Arabic words, Hebrew in a font of your own) is put in drawing order here, as the PDF does
      if (r.rtl && lang) { s.dir = 'rtl'; s.textContent = r.text; }
      else if (r.rtl) { s.textContent = E().visualChars(r.text, true).join(''); s.style.unicodeBidi = 'bidi-override'; s.style.direction = 'ltr'; }
      else s.textContent = r.text;
      if (!lang) { s.style.fontKerning = 'none'; s.style.fontVariantLigatures = 'none'; } // widths are the plain advances
      if (m.color) s.style.color = m.color;
      if (deco) s.style.textDecoration = deco;
      if (m.hl) s.style.background = m.hl;
      page.append(s);
    }
  }
  function addItem(page, it, k) {
    if (it.kind === 'rect') page.append(el('div', 'r', { left: it.x * k + 'px', top: it.y * k + 'px', width: it.w * k + 'px', height: it.h * k + 'px', background: it.fill }));
    else if (it.kind === 'rule') {
      const x = Math.min(it.x1, it.x2), y = Math.min(it.y1, it.y2);
      page.append(el('div', 'r', { left: x * k + 'px', top: y * k + 'px', width: Math.max(Math.abs(it.x2 - it.x1), it.w) * k + 'px', height: Math.max(Math.abs(it.y2 - it.y1), it.w) * k + 'px', background: it.color || '#000' }));
    } else if (it.kind === 'img' && /^data:image\//.test(it.src || '')) {
      const img = el('img', 'r', { left: it.x * k + 'px', top: it.y * k + 'px', width: it.w * k + 'px', height: it.h * k + 'px' });
      img.src = it.src; img.alt = '';
      page.append(img);
    }
  }

  /** One laid-out page as a DOM element at k px per point. sels and caret are the page view's overlays (optional).
   * The Random template preview draws its first page with this too. */
  R.pageEl = function (pg, pi, k, sels = [], caret = null) {
    const page = el('div', 'page', { width: pg.w * k + 'px', height: pg.h * k + 'px' });
    page.dataset.pi = pi;
    for (const s of sels) if (s.pi === pi) page.append(el('div', 'sel-r', { left: s.x * k + 'px', top: s.y * k + 'px', width: s.w * k + 'px', height: s.h * k + 'px' }));
    for (const it of pg.items) {
      if (it.kind === 'line') for (const f of it.line.frags) addFrag(page, it, f, k);
      else addItem(page, it, k);
    }
    if (caret && caret.pi === pi) page.append(el('div', 'caret', { left: caret.x * k - 1 + 'px', top: caret.top * k + 'px', height: caret.h * k + 'px' }));
    return page;
  };

  /** Redraw every page, the selection and the caret. */
  R.render = function () {
    const host = pagesEl();
    if (!host || !S.layout) return;
    const k = R.k();
    const sels = R.segments(), caret = R.caretBox(S.sel.f);
    const pages = S.layout.pages.map((pg, pi) => R.pageEl(pg, pi, k, sels, caret));
    host.replaceChildren(...pages);
    R.placeIme();
  };
  /** Keep the hidden text input beside the caret, so IME popups and mobile keyboards appear there. */
  R.placeIme = function () {
    const c = document.querySelector('.caret'), ime = document.getElementById('ime');
    if (!c || !ime) return;
    const r = c.getBoundingClientRect();
    ime.style.left = Math.round(r.left) + 'px';
    ime.style.top = Math.round(r.top) + 'px';
  };
  R.reveal = function () {
    const c = document.querySelector('.caret');
    if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  /** 1-based page number of the caret, and the page count. */
  R.pageInfo = function () {
    const c = R.caretBox(S.sel.f);
    return { page: c ? c.pi + 1 : 1, of: S.layout ? S.layout.pages.length : 1 };
  };

  S.on('layout', () => { R.buildLines(); R.render(); S.emit('view'); });
  S.on('sel', () => { R.render(); R.reveal(); S.emit('view'); });
  S.on('doc', () => { R.buildLines(); R.render(); S.emit('view'); });
  window.addEventListener('resize', () => R.placeIme());
})();
