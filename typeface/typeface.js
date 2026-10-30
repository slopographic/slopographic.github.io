/* The typeface page: the site's type family, from its manifest (shared/fonts/brand/faces.json, written by
 * tools/fonts/build.py). Every style with its weights and italic, each stylistic set and the drip ligature next to the
 * default, the Private Use Area marks, the Latin set, a type tester and the download. Nothing here names the family: a
 * white-label build ships its own manifest and the page shows that family. The faces come from shared/fonts/fonts.css.
 * Classic script. Tests: tests/fonts/brand-font.test.html. */
(function () {
  'use strict';
  const BASE = '../shared/fonts/brand/';
  const SAMPLE = { sans: 'Office and creative software', serif: 'Your files never leave', mono: 'const total = 1_204.50;', cond: 'OFFLINE FIRST' };
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ abcdefghijklmnopqrstuvwxyzåäöéüß 0123456789 .,:;!?¡¿&@#%‰€$£§¶†*()[]{}«»„“”‘’–—';
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (k === 'style') Object.assign(e.style, v); else e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const range = (w) => { const p = String(w).split(/\s+/).map(Number); return [p[0], p[1] || p[0]]; };

  /** One entry per role: { key, family, category, weights: [min, max], italic, stretch }. */
  function roles(m) {
    return Object.entries(m.roles || {}).map(([key, r]) => {
      const faces = m.faces.filter((f) => f.role === key);
      const w = faces.length ? range(faces[0].weight) : [400, 400];
      const stretch = faces[0] && faces[0].stretch ? faces[0].stretch.split(' ')[0] : null;
      return { key, family: r.family, category: r.category, upstream: r.upstream, weights: w, italic: faces.some((f) => f.style === 'italic'), stretch };
    });
  }
  const fontOf = (r, extra) => Object.assign({ fontFamily: `"${r.family}"`, fontStretch: r.stretch || 'normal' }, extra);

  function styles(list) {
    const box = $('tf-styles');
    for (const r of list) {
      const card = el('article', { class: 'tf-style' });
      card.append(el('h3', { style: fontOf(r, { fontWeight: '700' }) }, r.family));
      card.append(el('p', { class: 'tf-meta' }, `${r.category} · weights ${r.weights[0]}–${r.weights[1]}${r.italic ? ' · italic' : ''}${r.stretch ? ` · width ${r.stretch} and up` : ''} · from ${r.upstream}`));
      const row = el('div', { class: 'tf-weights' });
      for (let w = Math.ceil(r.weights[0] / 100) * 100; w <= r.weights[1]; w += 100) {
        row.append(el('span', { title: String(w), style: fontOf(r, { fontWeight: String(w) }) }, 'Aa'));
      }
      card.append(row);
      card.append(el('p', { class: 'tf-line', style: fontOf(r) }, SAMPLE[r.key] || SAMPLE.sans));
      if (r.italic) card.append(el('p', { class: 'tf-line', style: fontOf(r, { fontStyle: 'italic' }) }, SAMPLE[r.key] || SAMPLE.sans));
      box.append(card);
    }
  }

  function features(m, list) {
    const box = $('tf-features');
    for (const f of m.features || []) {
      for (const key of f.roles) {
        const r = list.find((x) => x.key === key);
        if (!r) continue;
        const lig = f.tag === 'dlig' || f.tag === 'liga';
        const text = lig ? (f.texts || []).join(' ') : 'Gaga ijij 3369 0O 1l y K';
        const row = el('div', { class: 'tf-feature', 'data-tag': f.tag, 'data-role': key });
        row.append(el('p', { class: 'tf-meta' }, `${f.tag} · ${f.name} · ${r.family}`));
        row.append(el('span', { class: 'tf-off', style: fontOf(r) }, text));
        row.append(el('span', { class: 'tf-arrow', 'aria-hidden': 'true' }, '→'));
        const on = lig ? { fontVariantLigatures: 'discretionary-ligatures' } : { fontFeatureSettings: `"${f.tag}" 1` };
        row.append(el('span', { class: 'tf-on', style: fontOf(r, on) }, text));
        box.append(row);
      }
    }
  }

  function glyphs(m, list) {
    const pua = $('tf-pua');
    for (const g of m.pua || []) {
      const r = list.find((x) => g.roles.includes(x.key)) || list[0];
      const fig = el('figure', { class: 'tf-mark' });
      fig.append(el('span', { style: fontOf(r) }, String.fromCodePoint(parseInt(g.code, 16))));
      fig.append(el('figcaption', null, `U+${g.code} · ${g.name}`));
      pua.append(fig);
    }
    const r = list.find((x) => x.key === 'sans') || list[0];
    if (r) $('tf-glyphs').append(el('p', { style: fontOf(r) }, GLYPHS));
  }

  function tester(m, list) {
    const role = $('tf-role'), size = $('tf-size'), weight = $('tf-weight'), italic = $('tf-italic'), sets = $('tf-sets'), out = $('tf-sample');
    for (const r of list) role.append(el('option', { value: r.key }, r.family));
    const draw = () => {
      const r = list.find((x) => x.key === role.value) || list[0];
      weight.min = r.weights[0]; weight.max = r.weights[1];
      const tags = [...sets.querySelectorAll('input:checked')].map((i) => i.value);
      Object.assign(out.style, fontOf(r, {
        fontSize: size.value + 'px', fontWeight: weight.value, fontStyle: italic.checked && r.italic ? 'italic' : 'normal',
        fontFeatureSettings: tags.filter((t) => t !== 'dlig').map((t) => `"${t}" 1`).join(', ') || 'normal',
        fontVariantLigatures: tags.includes('dlig') ? 'discretionary-ligatures' : 'normal',
      }));
      italic.disabled = !r.italic;
      for (const l of sets.querySelectorAll('label')) l.hidden = !l.dataset.roles.split(',').includes(r.key);
    };
    for (const f of m.features || []) {
      const lab = el('label', { class: 'tf-check', 'data-roles': f.roles.join(',') });
      const box = el('input', { type: 'checkbox', value: f.tag });
      lab.append(box, ` ${f.tag} ${f.name}`);
      sets.append(lab);
    }
    $('tf-tester').addEventListener('submit', (e) => e.preventDefault());
    $('tf-tester').addEventListener('input', draw);
    draw();
  }

  function head(m, list) {
    const set = (k, fn) => { for (const n of document.querySelectorAll(`[data-tf="${k}"]`)) fn(n); };
    set('family', (n) => { n.textContent = m.family; });
    set('version', (n) => { n.textContent = `Version ${m.version} · ${m.licence.replace('-', ' ')}`; });
    set('download', (n) => { n.href = BASE + m.download; });
    set('licence', (n) => { n.href = BASE + m.licenceFile; });
    set('fontlog', (n) => { n.href = BASE + m.fontlog; });
    set('credits', (n) => { n.textContent = `The fonts: SIL Open Font License 1.1, modified from ${list.map((r) => r.upstream).join(', ')} (their copyright lines are in OFL.txt).`; });
  }

  const ready = fetch(BASE + 'faces.json', { cache: 'no-cache' }).then((r) => r.json()).then((m) => {
    const list = roles(m);
    head(m, list); styles(list); features(m, list); glyphs(m, list); tester(m, list);
    document.documentElement.dataset.typeface = 'ready';
    return m;
  }).catch((e) => { document.documentElement.dataset.typeface = 'error'; throw e; });
  window.SlopTypeface = { ready };
})();
