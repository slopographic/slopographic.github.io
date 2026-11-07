/* QR SLOP: reads encoded text back into a kind and its form values, the reverse of payload.js. Pure, no DOM.
 * parse(text) → { type, values }. It always returns one: text that matches no kind is a plain text form.
 * The Raw tab uses it, so an edit to the encoded text fills the form when the kind allows it. Needs payload.js first.
 * Classic script; exposes window.QRParse. */
(function (g) {
  'use strict';
  if (g.QRParse) return;

  /** Undoes the escapes of Wi-Fi values: \ ; , : and " each lose their backslash. */
  const unWifi = (s) => String(s).replace(/\\(.)/g, '$1');
  /** Undoes the escapes of vCard and iCalendar text: \n is a line break; \\ \; \, are the characters. */
  const unText = (s) => String(s).replace(/\\([\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));
  /** Splits on the semicolons that are not escaped. */
  const splitSemi = (s) => String(s).split(/(?<!\\);/);
  /** A query string: key=value pairs, percent-decoded, with CRLF folded to LF. */
  function query(q) {
    const out = {};
    for (const part of String(q || '').split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = decodeURIComponent(i < 0 ? part : part.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(part.slice(i + 1));
      out[k] = v.replace(/\r\n/g, '\n');
    }
    return out;
  }

  function wifi(text) {
    const values = { ssid: '', security: 'WPA', password: '', hidden: false };
    for (const tok of splitSemi(text.slice(5))) {
      if (!tok) continue;
      const key = tok[0], val = tok.slice(2);
      if (key === 'S') values.ssid = unWifi(val);
      else if (key === 'T') values.security = unWifi(val);
      else if (key === 'P') values.password = unWifi(val);
      else if (key === 'H') values.hidden = unWifi(val) === 'true';
    }
    return { type: 'wifi', values };
  }

  function vcard(text) {
    const v = { first: '', last: '', org: '', title: '', phone: '', email: '', url: '', street: '', city: '', postal: '', country: '' };
    for (const line of text.split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const name = line.slice(0, i).split(';')[0].toUpperCase();
      const val = line.slice(i + 1);
      if (name === 'N') { const p = splitSemi(val); v.last = unText(p[0] || ''); v.first = unText(p[1] || ''); }
      else if (name === 'ORG') v.org = unText(splitSemi(val)[0] || '');
      else if (name === 'TITLE') v.title = unText(val);
      else if (name === 'TEL') v.phone = unText(val);
      else if (name === 'EMAIL') v.email = unText(val);
      else if (name === 'URL') v.url = unText(val);
      else if (name === 'ADR') { const p = splitSemi(val); v.street = unText(p[2] || ''); v.city = unText(p[3] || ''); v.postal = unText(p[5] || ''); v.country = unText(p[6] || ''); }
    }
    return { type: 'vcard', values: v };
  }

  /** iCalendar local time (20260314T093000) as a datetime-local value (2026-03-14T09:30). Empty when it is not one. */
  function fromIcs(s) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(String(s || '').trim());
    return m ? m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] : '';
  }
  function calendar(text) {
    const v = { title: '', location: '', start: '', end: '' };
    for (const line of text.split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const name = line.slice(0, i).split(';')[0].toUpperCase();
      const val = line.slice(i + 1);
      if (name === 'SUMMARY') v.title = unText(val);
      else if (name === 'LOCATION') v.location = unText(val);
      else if (name === 'DTSTART') v.start = fromIcs(val);
      else if (name === 'DTEND') v.end = fromIcs(val);
    }
    return { type: 'event', values: v };
  }

  function mailto(text) {
    const body = text.slice(7), q = body.indexOf('?');
    const qs = query(q < 0 ? '' : body.slice(q + 1));
    return { type: 'email', values: { to: decodeURIComponent(q < 0 ? body : body.slice(0, q)), subject: qs.subject || '', body: qs.body || '' } };
  }

  function sms(text) {
    const body = text.slice(4), q = body.indexOf('?');
    const qs = query(q < 0 ? '' : body.slice(q + 1));
    return { type: 'sms', values: { number: q < 0 ? body : body.slice(0, q), message: qs.body || '' } };
  }

  function geo(text) {
    const [lat = '', lng = ''] = text.slice(4).split(/[?;]/)[0].split(',');
    return { type: 'geo', values: { lat, lng } };
  }

  /** Returns the kind and values for a text. A text that matches no kind is a plain text form. */
  function parse(text) {
    const t = String(text == null ? '' : text);
    if (/^WIFI:/i.test(t)) return wifi(t);
    if (/^BEGIN:VCARD/i.test(t)) return vcard(t);
    if (/^BEGIN:VCALENDAR/i.test(t)) return calendar(t);
    if (/^mailto:/i.test(t)) return mailto(t);
    if (/^sms:/i.test(t)) return sms(t);
    if (/^tel:/i.test(t)) return { type: 'phone', values: { number: t.slice(4) } };
    if (/^geo:/i.test(t)) return geo(t);
    if (/^https?:\/\/\S+$/i.test(t)) return { type: 'url', values: { url: t } };
    return { type: 'text', values: { text: t } };
  }

  g.QRParse = Object.freeze({ parse, fromIcs });
})(typeof window !== 'undefined' ? window : globalThis);
