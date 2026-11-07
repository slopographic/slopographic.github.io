/* QR SLOP test helpers: load the real app in the iframe of tests/qr/qr.test.html, and drive it with the clicks, keys and
 * input events a person makes. Classic script, loaded after tests/harness.js. Exposes window.QRT. */
// Covers: qr/js/app.js, qr/index.html, shared/ui/tabs.js
(function () {
  'use strict';
  const { waitFor, sleep } = SlopTest;
  const f = document.getElementById('app');
  const W = () => f.contentWindow;
  const q = (sel) => W().document.querySelector(sel);
  const qa = (sel) => [...W().document.querySelectorAll(sel)];
  const SRC = '../../qr/index.html';
  const ev = (name, init) => new (W().Event)(name, Object.assign({ bubbles: true }, init));

  /** Load the app fresh, and wait until its boot has run (body.ready). */
  async function open() {
    f.src = 'about:blank';
    await waitFor(() => f.contentWindow && f.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    f.src = SRC;
    await waitFor(() => { const w = f.contentWindow; return w && w.location.pathname.endsWith('/qr/index.html') && w.document.body && w.document.body.classList.contains('ready'); }, { timeout: 20000 });
    f.style.width = '1280px';
    await sleep(60);
    return W();
  }
  /** Types into a field the way the person does: set the value, then fire input. */
  function type(el, value) { el.value = value; el.dispatchEvent(ev('input')); }
  /** A form field in a panel, by its label text. */
  function field(label, host = '#qr-form') {
    const lab = qa(host + ' label.sui-field').find((l) => l.querySelector('.sui-label') && l.querySelector('.sui-label').textContent === label);
    return lab && lab.querySelector('input, textarea, select');
  }
  const tabBtn = (k) => q('#qr-tab-' + k);
  const clickTab = (k) => tabBtn(k).click();
  const chip = (kind) => q(`.qr-chip[data-kind="${kind}"]`);
  /** Decodes a PNG blob into RGBA pixels, through this page's own canvas. */
  async function pixels(blob) {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const cx = cv.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: cx.getImageData(0, 0, bmp.width, bmp.height).data };
  }
  window.QRT = { f, W, q, qa, ev, open, type, field, tabBtn, clickTab, chip, pixels };
})();
