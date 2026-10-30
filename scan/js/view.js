/* Slop Scan: the view of one page. Two modes on one stage: Result (the flat page in its look, as it goes into the PDF)
 * and Corners (the photo with its corners to drag, js/editor.js). Above it: back to the pages (phones), the mode, the
 * page's place and the turn buttons; under the corners: Find edges again and Whole photo. A page whose edges were not
 * found opens on its corners, with a note. Classic script; window.SlopScan.view: wire(), paint(), mode(m), page(). */
(function (g) {
  'use strict';
  const S = g.SlopScan, $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let mode = 'result', shown = null, timer = 0;

  function setMode(m) {
    mode = m === 'corners' ? 'corners' : 'result';
    $('sc-mode-result').setAttribute('aria-pressed', String(mode === 'result'));
    $('sc-mode-corners').setAttribute('aria-pressed', String(mode === 'corners'));
    $('sc-crop').hidden = mode !== 'corners';
    $('sc-result-box').hidden = mode !== 'result';
    $('sc-corner-tools').hidden = mode !== 'corners';
    paint(true);
  }
  /** Draws the page shown: the editor's photo, or the result (drawn after the current frame, so a slider stays smooth). */
  function paint(now) {
    const p = S.pages.current();
    $('sc-work').hidden = !p;
    $('sc-empty').hidden = !!p;
    if (!p) { shown = null; return; }
    const n = S.pages.size(), i = S.pages.index(p.id);
    $('sc-pos').textContent = t('scan.view.page_of', { n: i + 1, total: n });
    $('sc-note').textContent = p.found ? (p.auto ? t('scan.view.auto_turned') : '') : t('scan.view.not_found');
    if (mode === 'corners') {
      if (!shown || shown.id !== p.id || shown.photo !== p.photo || shown.mode !== 'corners') S.editor.show(p);
      shown = { id: p.id, photo: p.photo, v: p.v, mode };
      return;
    }
    if (shown && shown.id === p.id && shown.v === p.v && shown.mode === 'result') return;
    clearTimeout(timer);
    const draw = () => {
      const c = S.render.render(p, S.render.PREVIEW), out = $('sc-result');
      out.width = c.width; out.height = c.height;
      out.getContext('2d').drawImage(c, 0, 0);
      out.setAttribute('aria-label', t('scan.view.result_label', { n: S.pages.index(p.id) + 1 }));
      shown = { id: p.id, photo: p.photo, v: p.v, mode };
      $('sc-result-box').classList.remove('is-busy');
    };
    $('sc-result-box').classList.add('is-busy');
    if (now) draw(); else timer = setTimeout(draw, 30);
  }
  function turn(by) { const p = S.pages.current(); if (p) S.pages.set(p.id, { turn: (p.turn || 0) + by, auto: false }); }
  function again() {
    const p = S.pages.current();
    if (!p) return;
    const d = S.render.detect(p.photo);
    S.pages.set(p.id, { quad: d.quad, found: d.found });
    if (mode === 'corners') S.editor.show(S.pages.current());
    g.SlopUI.toast(d.found ? t('scan.view.edges_found') : t('scan.view.not_found'));
  }
  function whole() {
    const p = S.pages.current();
    if (!p) return;
    S.pages.set(p.id, { quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], found: true });
    S.editor.show(S.pages.current());
  }
  function step(by) {
    const all = S.pages.all(), i = S.pages.index((S.pages.current() || {}).id) + by;
    if (all[i]) S.pages.select(all[i].id);
  }
  function wire() {
    S.editor.mount($('sc-crop'));
    $('sc-mode-result').addEventListener('click', () => setMode('result'));
    $('sc-mode-corners').addEventListener('click', () => setMode('corners'));
    $('sc-rot-l').addEventListener('click', () => turn(-1));
    $('sc-rot-r').addEventListener('click', () => turn(1));
    $('sc-prev').addEventListener('click', () => step(-1));
    $('sc-next').addEventListener('click', () => step(1));
    $('sc-detect').addEventListener('click', again);
    $('sc-whole').addEventListener('click', whole);
    $('sc-corners-done').addEventListener('click', () => setMode('result'));
    $('sc-back').addEventListener('click', () => S.app.frame().showList());
    S.pages.on((e) => {
      if (e.type === 'add' && !e.page.found) setMode('corners');
      else if (e.type === 'select' || e.type === 'add') setMode(e.page && !e.page.found ? 'corners' : mode);
      else paint(e.type !== 'set');
    });
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { shown = null; paint(true); });
  }
  S.view = { wire, paint, mode: (m) => (m ? setMode(m) : mode) };
})(window);
