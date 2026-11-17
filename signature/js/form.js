/* Slop Signature, the form: drawn from the model's FIELDS (one fieldset per group) plus the style controls (template,
 * colour, font, picture size, round picture) and a picture from this device (made small and kept in the signature).
 * Classic script. SlopSignature.form = { mount(host, state, onChange), fill(state), read() -> state }. */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  const M = NS.model, UI = g.SlopUI, el = UI.el;
  const FONTS = M.FONTS;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const inputs = {};
  let changed = () => {};

  /** A picture from this device, drawn at most 240 px wide as PNG, as a data address the signature carries. */
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 240 / Math.max(im.naturalWidth, 1)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/png'));
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error(t('signature.pic.bad'))); };
      im.src = url;
    });
  }

  function fieldFor(f) {
    const attrs = { id: 'sg-' + f.key, class: 'sui-input', maxlength: f.max, placeholder: f.placeholder ? t('signature.ph.' + f.key) : '', autocomplete: 'off', oninput: () => changed() };
    const input = f.type === 'textarea' ? el('textarea', Object.assign({ rows: 3 }, attrs)) : el('input', Object.assign({ type: f.type === 'url' ? 'text' : f.type, inputmode: f.type === 'url' ? 'url' : undefined }, attrs));
    inputs[f.key] = input;
    return UI.field(t('signature.f.' + f.key), input);
  }
  function pictureExtras() {
    const msg = el('p', { class: 'sg-note', role: 'status' });
    // The picture is the page's one way in for files (shared/intake, spec 'signature'): the button, a pasted picture, a
    // picture dropped on the email or this box (app.js) and one another app sent (Open in, ?drive=). Each is drawn to PNG.
    if (!window.SlopIntake.spec('signature')) {
      window.SlopIntake.register({ id: 'signature', limit: 1, toast: false, accept: { types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'], get noun() { return t('signature.pic.noun'); } },
        process: async (f) => {
          try { inputs.image.value = await shrink(f); msg.textContent = t('signature.pic.kept', { name: f.name }); changed(); } catch (e) { msg.textContent = e.message; throw e; }
          return f.name;
        } });
    }
    const pick = () => window.SlopIntake.pick({ to: 'signature', multiple: false, accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml' });
    inputs.imageSize = el('input', { id: 'sg-imageSize', type: 'range', min: 32, max: 160, step: 4, oninput: () => changed() });
    inputs.round = el('input', { id: 'sg-round', type: 'checkbox', onchange: () => changed() });
    return [el('div', { class: 'sg-row' }, el('button', { type: 'button', class: 'sui-btn', id: 'sgUpload', onclick: pick }, t('signature.pic.use'))),
    msg, UI.field(t('signature.pic.size'), inputs.imageSize), el('label', { class: 'sg-check' }, inputs.round, ' ' + t('signature.pic.round'))];
  }
  function styleBox() {
    const group = el('div', { class: 'sg-tpls', role: 'radiogroup', 'aria-label': t('signature.style.template'), id: 'sgTemplates' });
    for (const [id] of NS.templates.LIST) {
      group.append(el('button', { type: 'button', role: 'radio', class: 'sg-tpl', 'data-tpl': id, 'aria-checked': 'false',
        onclick: () => { inputs.template.value = id; changed(); } }, t('signature.tpl.' + id)));
    }
    inputs.template = { value: 'classic' };
    inputs.accent = el('input', { id: 'sg-accent', type: 'color', oninput: () => changed() });
    inputs.font = UI.select(FONTS, FONTS[0][0]);
    inputs.font.id = 'sg-font'; inputs.font.addEventListener('change', () => changed());
    return el('fieldset', { class: 'sg-group' }, el('legend', null, t('signature.style.style')), group,
    el('div', { class: 'sg-row' }, UI.field(t('signature.style.colour'), inputs.accent), UI.field(t('signature.style.font'), inputs.font)));
  }

  function mount(host, state, onChange) {
    changed = onChange || changed;
    const sets = M.GROUPS.map(([id]) => el('fieldset', { class: 'sg-group', 'data-group': id }, el('legend', null, t('signature.g.' + id)),
      ...M.FIELDS.filter((f) => f.group === id).map(fieldFor), ...(id === 'picture' ? pictureExtras() : [])));
    host.replaceChildren(styleBox(), ...sets);
    fill(state);
  }
  function fill(state) {
    const s = Object.assign(M.blank(), state || {});
    for (const f of M.FIELDS) inputs[f.key].value = s[f.key] || '';
    inputs.template.value = s.template; inputs.accent.value = s.accent; inputs.font.value = s.font;
    inputs.imageSize.value = s.imageSize; inputs.round.checked = !!s.round;
    mark();
  }
  /** The chosen template's button shows as chosen. */
  function mark() {
    for (const b of document.querySelectorAll('#sgTemplates .sg-tpl')) b.setAttribute('aria-checked', String(b.dataset.tpl === inputs.template.value));
  }
  function read() {
    const s = {};
    for (const f of M.FIELDS) s[f.key] = inputs[f.key].value;
    Object.assign(s, { template: inputs.template.value, accent: inputs.accent.value, font: inputs.font.value, imageSize: Number(inputs.imageSize.value), round: inputs.round.checked });
    mark();
    return s;
  }

  NS.form = { mount, fill, read, FONTS };
})(typeof window !== 'undefined' ? window : globalThis);
