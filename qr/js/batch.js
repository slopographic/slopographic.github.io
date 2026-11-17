/* QR SLOP: the Batch tab (a secondary tab). Each non-empty line becomes one code, drawn with the current design and logo.
 * Every card has its own SVG and PNG download. At most 100 lines are drawn. Classic script; exposes window.QRBatch. */
(function () {
  'use strict';
  if (window.QRBatch) return;
  const MAX = 100;
  const $ = (id) => document.getElementById(id);
  const E = (tag, attrs, ...kids) => window.SlopUI.el(tag, attrs, ...kids);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  let items = []; // the texts drawn now, in order
  let count = null; // the number of lines read by the last make(), or null before it

  function lines() {
    return $('qr-batch-in').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  /** Reads the textarea and draws one card per line. */
  function make() {
    const all = lines();
    items = all.slice(0, MAX);
    count = all.length;
    note();
    draw();
  }
  /** The line under the button: how many codes, in the current language. */
  function note() {
    const n = count;
    $('qr-batch-note').textContent = !n ? t('qr.app.batch_empty')
      : n > MAX ? t('qr.app.batch_capped', { max: MAX, n }) : t('qr.app.batch_n', { n });
  }

  /** One card: the code (or the reason it failed), the text, and the two downloads. */
  function card(text, n) {
    const app = window.QRApp;
    const art = E('div', { class: 'qr-card-art' });
    let svg = null;
    try { svg = app.svgFor(text); art.innerHTML = svg; } catch (e) { art.textContent = e.message; art.classList.add('qr-card-bad'); }
    const name = 'batch-' + n;
    return E('figure', { class: 'qr-card' },
      art,
      E('figcaption', { class: 'qr-card-cap', title: text }, text),
      E('div', { class: 'qr-card-btns' },
        E('button', { type: 'button', class: 'sui-btn', disabled: !svg, onclick: () => app.saveSvg(svg, name) }, 'SVG'),
        E('button', { type: 'button', class: 'sui-btn', disabled: !svg, onclick: () => app.savePng(svg, name) }, 'PNG')));
  }

  function draw() {
    const grid = $('qr-grid');
    if (!items.length) { grid.replaceChildren(); return; }
    grid.replaceChildren(...items.map((item, i) => card(item, i + 1)));
  }

  /** Shown again when the tab opens, so the cards follow the current design. */
  function refresh() { if (items.length) draw(); }

  function init() {
    $('qr-batch-go').addEventListener('click', make);
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (count !== null) note(); });
  }

  window.QRBatch = { init, make, refresh, items: () => items.slice() };
})();
