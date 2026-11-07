/* Slop Signature, the logo maker's controls, in the Picture box: the letters (the company's initials to start with) or a
 * short name, the shape, a preview in the signature's colour, Another look (a new seed: the style, typeface and mark),
 * Use this logo (drawn to PNG and kept inside the signature) and Download logo (the PNG, to put on a website for Gmail).
 * The drawing is js/logo.js. Classic script, after form.js and logo.js; app.js mounts it.
 * Sets SlopSignature.logoUI = { mount(fieldset), use(o) -> Promise<{ seed, text, kind, shape }>, options() }. */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  const UI = g.SlopUI, el = UI.el, L = NS.logo;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const ui = {};
  let seed = '1', touched = false;

  const colour = () => NS.model.clean(NS.app ? NS.app.state : {}).accent;
  /** What the controls say now. */
  function options() {
    return { text: ui.text.value.trim() || L.initials(NS.app ? NS.app.state.company || NS.app.state.name : ''), kind: ui.kind.value, shape: ui.shape.value, colour: colour(), seed };
  }
  function draw() {
    if (!ui.preview) return;
    ui.preview.innerHTML = L.svg(options());   // logo.js escapes the text
    ui.seed.textContent = t('signature.logo.seed', { seed: String(seed) });
  }
  /** The company's initials (or its name for a wordmark), until the person types their own. */
  function suggest() {
    if (touched || !NS.app) return;
    const s = NS.app.state, words = String(s.company || s.name || '').replace(/\s+(Ltd|AB|HB|Inc|LLC|& Co)\.?$/i, '');
    ui.text.value = ui.kind.value === 'wordmark' ? words.slice(0, 24) : L.initials(words);
  }

  /** Draws the logo, keeps it inside the signature and redraws. o: { text, kind, shape, seed, colour } (the controls fill
   *  in what is missing). Resolves the options used. */
  async function use(o) {
    o = Object.assign(options(), Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== '')));
    if (o.seed != null) seed = String(o.seed);
    if (ui.text) {
      if (o.text) { ui.text.value = o.text; touched = true; }
      ui.kind.value = o.kind === 'wordmark' ? 'wordmark' : 'monogram';
      if (o.shape) ui.shape.value = o.shape;
      draw();
    }
    const png = await L.png(o);
    const s = Object.assign({}, NS.app.state, { image: png });
    if (o.kind === 'wordmark') s.imageSize = Math.max(Number(s.imageSize) || 0, 140);
    NS.form.fill(s); NS.app.render();
    NS.app.say(t('signature.logo.kept'));
    return { seed, text: o.text, kind: o.kind, shape: o.shape };
  }
  async function download() {
    const png = await L.png(options(), 480), bin = atob(png.split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    const stem = (NS.app.state.company || 'logo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
    UI.download(blob, `${stem}-logo.png`);
  }

  function mount(host) {
    if (!host || (ui.box && host.contains(ui.box))) return;   // again after a language change: the form was drawn anew
    ui.text = el('input', { id: 'sgLogoText', class: 'sui-input', maxlength: 24, autocomplete: 'off', placeholder: 'NW', oninput: () => { touched = true; draw(); } });
    ui.kind = UI.select([['monogram', t('signature.logo.initials')], ['wordmark', t('signature.logo.name')]], 'monogram');
    ui.kind.id = 'sgLogoKind'; ui.kind.addEventListener('change', () => { touched = false; suggest(); draw(); });
    ui.shape = UI.select(L.SHAPES.map(([id]) => [id, t('signature.shape.' + id)]), 'circle');
    ui.shape.id = 'sgLogoShape'; ui.shape.addEventListener('change', draw);
    ui.preview = el('div', { class: 'sg-logo-preview', id: 'sgLogoPreview', role: 'img', 'aria-label': t('signature.logo.preview') });
    ui.seed = el('span', { class: 'sg-note', id: 'sgLogoSeed' });
    const another = el('button', { type: 'button', class: 'sui-btn', id: 'sgLogoAgain', onclick: () => { seed = g.SlopSample.newSeed(); draw(); } }, t('signature.logo.again'));
    const useBtn = el('button', { type: 'button', class: 'sui-btn sui-primary', id: 'sgLogoUse', onclick: () => use().catch((e) => NS.app.say(e.message)) }, t('signature.logo.use'));
    const dl = el('button', { type: 'button', class: 'sui-btn', id: 'sgLogoDownload', onclick: () => download().catch((e) => NS.app.say(e.message)) }, t('signature.logo.download'));
    ui.box = el('details', { class: 'sg-logo', id: 'sgLogo' }, el('summary', null, t('signature.logo.make')),
    el('div', { class: 'sg-row' }, UI.field(t('signature.logo.letters'), ui.text), UI.field(t('signature.logo.kind'), ui.kind), UI.field(t('signature.logo.shape'), ui.shape)),
      el('div', { class: 'sg-logo-row' }, ui.preview, el('div', { class: 'sg-logo-acts' }, another, ui.seed)),
      el('div', { class: 'sg-row' }, useBtn, dl));
    ui.box.addEventListener('toggle', () => { if (ui.box.open) { suggest(); draw(); } });
    host.append(ui.box);
    if (!seed || seed === '1') seed = g.SlopSample.newSeed();
    }

  NS.logoUI = { mount, use, options, draw };
})(typeof window !== 'undefined' ? window : globalThis);
