/* QR SLOP: the Design tab (colours, gradient, shape, background, quiet zone, size, error correction) and the Logo tab
 * (a picture file, a drop, built-in marks, the logo width). Each control reports to the app through a callback.
 * Classic script; exposes window.QRPanelDesign. */
(function (g) {
  'use strict';
  if (g.QRPanelDesign) return;
  const E = (tag, attrs, ...kids) => g.SlopUI.el(tag, attrs, ...kids);
  const UI = () => g.SlopUI;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** The design controls. st is the style object; change(key, value) on every change. */
  function drawDesign(host, st, change) {
    const fg = E('input', { type: 'color', value: st.fg, 'aria-label': t('qr.design.fg') });
    const fg2 = E('input', { type: 'color', value: st.fg2, 'aria-label': t('qr.design.fg2'), disabled: !st.gradient });
    const grad = UI().check(t('qr.design.gradient'), st.gradient);
    const shape = UI().select([['square', t('qr.design.square')], ['round', t('qr.design.round')]], st.shape);
    const bg = E('input', { type: 'color', value: st.bg, 'aria-label': t('qr.design.bg'), disabled: !!st.transparent });
    const tr = UI().check(t('qr.design.transparent'), st.transparent);
    const quiet = E('input', { type: 'range', min: '0', max: '8', step: '1', value: String(st.quiet), 'aria-label': t('qr.design.quiet') });
    const quietOut = E('output', null, t('qr.design.quiet_n', { n: +st.quiet }));
    const size = UI().number(st.size, 64, 4096, 1);
    size.setAttribute('aria-label', t('qr.design.size_aria'));
    const ec = UI().select([['L', 'L (7%)'], ['M', 'M (15%)'], ['Q', 'Q (25%)'], ['H', 'H (30%)']], st.ec);
    const ecNote = E('p', { class: 'qr-note' });

    const sync = () => {
      fg2.disabled = !st.gradient; bg.disabled = !!st.transparent;
      ec.disabled = !!g.QRState.S.logo.href;
      ec.value = g.QRState.S.logo.href ? 'H' : st.ec;
      ecNote.textContent = g.QRState.S.logo.href ? t('qr.design.ec_logo') : t('qr.design.ec_note');
    };
    fg.addEventListener('input', () => change('fg', fg.value));
    fg2.addEventListener('input', () => change('fg2', fg2.value));
    grad.input.addEventListener('change', () => { st.gradient = grad.input.checked; change('gradient', st.gradient); sync(); });
    shape.addEventListener('change', () => change('shape', shape.value));
    bg.addEventListener('input', () => change('bg', bg.value));
    tr.input.addEventListener('change', () => { st.transparent = tr.input.checked; change('transparent', st.transparent); sync(); });
    quiet.addEventListener('input', () => { quietOut.textContent = t('qr.design.quiet_n', { n: +quiet.value }); change('quiet', +quiet.value); });
    size.addEventListener('input', () => change('size', +size.value));
    ec.addEventListener('change', () => { st.ec = ec.value; change('ec', ec.value); });
    host.replaceChildren(
      E('div', { class: 'qr-grid2' },
        UI().field(t('qr.design.fg'), fg), UI().field(t('qr.design.fg2'), fg2),
        UI().field(t('qr.design.modules'), shape), UI().field(t('qr.design.bg'), bg),
        UI().field(t('qr.design.quiet'), E('span', { class: 'qr-range' }, quiet, quietOut)),
        UI().field(t('qr.design.size'), size), UI().field(t('qr.design.ec'), ec)),
      grad.el, tr.el, ecNote);
    sync();
  }

  /** The logo tab. act = { file(File), mark(id), remove(), width(fraction) }. The current logo, if any, is shown. */
  function drawLogo(host, logo, act) {
    // The box is the intake's (spec 'qr', app.js): a click opens its picker, a drop on it takes the picture.
    const drop = E('div', { class: 'qr-drop', role: 'button', tabindex: '0', 'aria-label': t('qr.logo.drop_aria') },
      E('b', null, t('qr.logo.drop')), E('span', null, t('qr.logo.drop_or')));
    const open = () => g.SlopIntake.pick({ to: 'qr', multiple: false, accept: 'image/*' });
    drop.addEventListener('click', open);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    g.SlopIntake.dropTarget(drop, { to: 'qr' });
    drop.addEventListener('dragenter', () => drop.classList.add('qr-drop-on'));
    drop.addEventListener('dragleave', () => drop.classList.remove('qr-drop-on'));
    const marks = E('div', { class: 'qr-marks', role: 'group', 'aria-label': t('qr.logo.marks') },
      g.QRLogo.marks().map((m) => {
        const name = t('qr.mark.' + m.id);
        const b = E('button', { type: 'button', class: 'qr-mark', 'aria-label': name, title: name, onclick: () => act.mark(m.id) });
        b.innerHTML = m.svg;
        return b;
      }));
    const frac = E('input', { type: 'range', min: '10', max: '22', step: '1', value: String(Math.round(g.QRRender.clampLogo(logo.frac) * 100)), 'aria-label': t('qr.logo.width_aria') });
    const fracOut = E('output', null, Math.round(g.QRRender.clampLogo(logo.frac) * 100) + '%');
    frac.addEventListener('input', () => { fracOut.textContent = frac.value + '%'; act.width(+frac.value / 100); });
    const current = logo.href
      ? E('div', { class: 'qr-logo-now' }, E('img', { src: logo.href, alt: '', width: 44, height: 44 }),
        E('span', null, logo.name || (logo.mark ? t('qr.logo.builtin', { name: t('qr.mark.' + logo.mark) }) : t('qr.logo.logo'))),
        E('button', { type: 'button', class: 'sui-btn', onclick: () => act.remove() }, t('qr.logo.remove')))
      : E('p', { class: 'qr-note' }, t('qr.logo.none'));
    host.replaceChildren(
      E('p', { class: 'qr-note' }, t('qr.logo.intro')),
      drop, E('span', { class: 'qr-label' }, t('qr.logo.marks')), marks, current,
      UI().field(t('qr.logo.width'), E('span', { class: 'qr-range' }, frac, fracOut)),
      E('p', { class: 'qr-note' }, t('qr.logo.advice')));
  }

  g.QRPanelDesign = Object.freeze({ drawDesign, drawLogo });
})(typeof window !== 'undefined' ? window : globalThis);
