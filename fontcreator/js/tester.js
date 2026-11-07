/* Slop Font: the Type test view. Your text in the font at several sizes, on light or dark, with the real font file: the
 * project is built (core/build.js, OpenType) and loaded with the FontFace API a moment after each change, so what you
 * see is what an installed font or a web page shows, kerning included. A character the font has not got falls back to
 * the browser's own font. Classic script. FC.tester: mount(host), refresh() → Promise (the font loaded), family() → the CSS name. */
(function (g) {
  'use strict';
  const S = () => g.FC.state, t = (k, v) => g.FC.t(k, v);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  let host = null, parts = {}, face = null, n = 0, timer = 0, family = '', stale = true, last = '', built = null;

  async function refresh() {
    clearTimeout(timer); timer = 0;
    const p = S().project(), key = S().snapshot();
    if (key === last && face) return family;
    if (!g.SlopFont.model.stats(p).drawn) { parts.note.textContent = t('fontcreator.test.empty'); return ''; }
    const bytes = g.SlopFont.build.otf(p);
    const name = 'SlopFontTest' + (++n);
    const f = new FontFace(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    try { await f.load(); } catch (e) { parts.note.textContent = t('fontcreator.test.load_failed', { error: e.message }); return ''; }
    document.fonts.add(f);
    if (face) document.fonts.delete(face);
    face = f; family = name; last = key; stale = false;
    host.style.setProperty('--fc-test-font', `"${name}"`);
    built = { font: `${p.info.family} ${p.info.style}`, n: bytes.length };
    parts.note.textContent = t('fontcreator.test.built', built);
    return name;
  }
  function later() { stale = true; if (!host || host.hidden) return; clearTimeout(timer); timer = setTimeout(refresh, 350); }
  function lines() {
    const st = S().settings().tester;
    if (document.activeElement !== parts.text) parts.text.value = st.text;
    if (document.activeElement !== parts.sizes) parts.sizes.value = st.sizes.join(' ');
    parts.out.replaceChildren(...st.sizes.map((s) => el('div', { class: 'fc-test-line' }, el('span', { class: 'fc-test-size' }, s + ' px'),
      el('p', { class: 'fc-test-text', style: `font-size:${s}px`, lang: 'und' }, st.text || ' '))));
    parts.out.classList.toggle('fc-test-dark', !!st.dark);
    parts.dark.setAttribute('aria-pressed', String(!!st.dark));
  }
  function setTester(patch) { S().set({ tester: Object.assign({}, S().settings().tester, patch) }); lines(); }
  function mount(el0) {
    host = el0;
    const mk = g.FC.mark, lab = (k) => mk(el('span', { class: 'sf-lab' }), { text: k });
    const text = mk(el('textarea', { id: 'fc-test-text', rows: '2' }), { 'aria-label': 'fontcreator.test.text_label' });
    const sizes = mk(el('input', { type: 'text', id: 'fc-test-sizes', autocomplete: 'off' }), { 'aria-label': 'fontcreator.test.sizes_label' });
    const dark = mk(el('button', { type: 'button', class: 'sui-btn', id: 'fc-test-dark', 'aria-pressed': 'false' }), { text: 'fontcreator.test.dark' });
    const out = el('div', { class: 'fc-test-out', id: 'fc-test-out' }), note = el('p', { class: 'sf-note', id: 'fc-test-note', 'aria-live': 'polite' });
    parts = { text, sizes, dark, out, note };
    text.value = S().settings().tester.text;
    sizes.value = S().settings().tester.sizes.join(' ');
    text.addEventListener('input', () => setTester({ text: text.value.slice(0, 2000) }));
    sizes.addEventListener('change', () => {
      const list = sizes.value.split(/[\s,]+/).map(Number).filter((v) => v >= 6 && v <= 400).slice(0, 8);
      setTester({ sizes: list.length ? list : [16, 24, 36, 64] });
      sizes.value = S().settings().tester.sizes.join(' ');
    });
    dark.addEventListener('click', () => setTester({ dark: !S().settings().tester.dark }));
    const pangrams = el('div', { class: 'fc-btns' });
    // the sample texts are content (they go into the text box as they are); the button names are words: fontcreator.test.s_<id>
    for (const [id, s] of [['pangram', 'The quick brown fox jumps over the lazy dog.'], ['swedish', 'Flygande bäckasiner söka hwila på mjuka tuvor. Åsa åt ärtor.'], // i18n-ignore
      ['caps', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ÅÄÖ'], ['small', 'abcdefghijklmnopqrstuvwxyz åäö'], ['digits', '0123456789 +−×÷=%'], ['spacing', 'HHOHHOOHOO nnonnoonoo']]) {
      const b = mk(el('button', { type: 'button', class: 'sui-btn' }), { text: 'fontcreator.test.s_' + id });
      b.addEventListener('click', () => { text.value = s; setTester({ text: s }); });
      pangrams.append(b);
    }
    host.append(el('label', { class: 'sf-field' }, lab('fontcreator.test.text'), text), pangrams,
      el('div', { class: 'fc-row' }, el('label', { class: 'sf-field' }, lab('fontcreator.test.sizes'), sizes), dark), note, out);
    g.FC.onLang(() => { if (face && built) parts.note.textContent = t('fontcreator.test.built', built); else if (!host.hidden) refresh(); });   // the note
    lines();
    S().on((e) => { if (e.what !== 'select' && e.what !== 'settings') later(); });
  }
  function show() { lines(); if (stale || !face) return refresh(); return Promise.resolve(family); }
  g.FC.tester = { mount, refresh, show, family: () => family };
})(window);
