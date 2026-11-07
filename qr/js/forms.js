/* QR SLOP: the form for each kind of code. FIELDS lists the inputs of each type; draw() builds them with SlopUI's controls
 * and reports every change through onInput(key, value). Classic script; exposes window.QRForms. */
(function (g) {
  'use strict';
  if (g.QRForms) return;

  // label is a key in qr/i18n (en/forms.js); placeholders other than the text one are sample data, the same in every language
  const F = (k, label, extra = {}) => Object.assign({ k, label, kind: 'text' }, extra);
  const PHONE = '+1 555 010 0100';
  const SECURITY = [['WPA', 'WPA / WPA2'], ['WEP', 'WEP'], ['nopass', 'qr.field.sec_none']];
  const FIELDS = {
    text: [F('text', 'qr.field.text', { kind: 'textarea', ph: 'qr.field.text_ph' })],
    url: [F('url', 'qr.field.url', { kind: 'url', ph: 'https://example.com' })],
    email: [F('to', 'qr.field.to', { kind: 'email', ph: 'name@example.com' }), F('subject', 'qr.field.subject'), F('body', 'qr.field.message', { kind: 'textarea' })],
    phone: [F('number', 'qr.field.number', { kind: 'tel', ph: PHONE })],
    sms: [F('number', 'qr.field.number', { kind: 'tel', ph: PHONE }), F('message', 'qr.field.message_opt', { kind: 'textarea' })],
    wifi: [
      F('ssid', 'qr.field.ssid'),
      F('security', 'qr.field.security', { kind: 'select', def: 'WPA', options: SECURITY }),
      F('password', 'qr.field.password', { kind: 'password' }),
      F('hidden', 'qr.field.hidden', { kind: 'check' }),
    ],
    vcard: [
      F('first', 'qr.field.first'), F('last', 'qr.field.last'), F('org', 'qr.field.org'), F('title', 'qr.field.job'),
      F('phone', 'qr.field.phone', { kind: 'tel' }), F('email', 'qr.field.email', { kind: 'email' }), F('url', 'qr.field.website', { kind: 'url' }),
      F('street', 'qr.field.street'), F('city', 'qr.field.city'), F('postal', 'qr.field.postal'), F('country', 'qr.field.country'),
    ],
    geo: [F('lat', 'qr.field.lat', { kind: 'number', ph: '48.8584' }), F('lng', 'qr.field.lng', { kind: 'number', ph: '2.2945' })],
    event: [
      F('title', 'qr.field.title'), F('location', 'qr.field.location'),
      F('start', 'qr.field.start', { kind: 'datetime-local' }), F('end', 'qr.field.end', { kind: 'datetime-local' }),
    ],
  };
  /** A key's words in the current language; anything that is not a qr.* key (sample data, WPA) is shown as it is. */
  const t = (s) => (/^qr\.[a-z_]+\.[a-z_]+$/.test(s) && g.SlopI18n ? g.SlopI18n.t(s) : s);

  /** The value a field shows when nothing is stored yet. */
  function initial(f, values) {
    if (values[f.k] !== undefined) return values[f.k];
    if (f.def !== undefined) return f.def;
    return f.kind === 'check' ? false : '';
  }

  /** Draws the fields of one type into host. values is the stored object for that type; it is filled in as the person types. */
  function draw(host, type, values, onInput) {
    const E = g.SlopUI.el;
    host.replaceChildren();
    for (const f of FIELDS[type] || []) {
      const cur = initial(f, values);
      if (f.kind === 'check') {
        const c = g.SlopUI.check(t(f.label), cur);
        c.input.addEventListener('change', () => onInput(f.k, c.input.checked));
        host.append(c.el);
        continue;
      }
      let input;
      if (f.kind === 'select') input = g.SlopUI.select(f.options.map(([v, l]) => [v, t(l)]), cur);
      else if (f.kind === 'textarea') input = E('textarea', { class: 'sui-input', rows: 3, placeholder: t(f.ph || ''), spellcheck: 'false' });
      else input = E('input', { class: 'sui-input', type: f.kind, placeholder: t(f.ph || ''), autocomplete: 'off', spellcheck: 'false' });
      input.value = cur;
      input.addEventListener(f.kind === 'select' ? 'change' : 'input', () => onInput(f.k, input.value));
      host.append(g.SlopUI.field(t(f.label), input));
    }
  }

  g.QRForms = Object.freeze({ FIELDS, draw });
})(typeof window !== 'undefined' ? window : globalThis);
