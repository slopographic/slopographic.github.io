/* QR SLOP: payload builders. Pure functions, no DOM: each turns one form's values into the exact text that is encoded.
 * build(type, values) → { ok: true, text } | { ok: false, error }. Classic script; exposes window.QRPayload.
 * tests/node/qr-payload.test.mjs loads this file in a vm context with window set to the context. */
(function (g) {
  'use strict';
  if (g.QRPayload) return;

  /** The most bytes a QR code holds (byte mode, version 40, level L). The encoder reports a longer text at the level chosen. */
  const MAX_BYTES = 2953;
  const TYPES = ['text', 'url', 'email', 'phone', 'sms', 'wifi', 'vcard', 'geo', 'event'];
  const LABELS = { text: 'Plain text', url: 'URL', email: 'Email', phone: 'Phone call', sms: 'SMS', wifi: 'Wi-Fi', vcard: 'Contact (vCard)', geo: 'Location', event: 'Calendar event' }; // i18n-ignore: English, for scripts; the page shows qr.kind.*

  /** The words for a key (qr/i18n), or the English given when SlopI18n or the key is absent (the node tests load no tables). */
  const tr = (k, en, v) => { const I = g.SlopI18n; return I && I.has && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const str = (v) => (v == null ? '' : String(v));
  const trim = (v) => str(v).trim();
  /** UTF-8 length of a string, counted by code point (no TextEncoder, so the same in a vm context). */
  function byteLength(s) {
    let n = 0;
    for (const ch of str(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
    return n;
  }
  /** Wi-Fi: \ ; , : and " are escaped with a backslash. */
  const wifiEsc = (s) => str(s).replace(/[\\;,:"]/g, '\\$&');
  /** vCard and iCalendar text: \ ; and , are escaped, and a line break becomes \n. */
  const textEsc = (s) => str(s).replace(/\\/g, '\\\\').replace(/[;,]/g, '\\$&').replace(/\r?\n/g, '\\n');
  /** A mailto or sms parameter, percent-encoded; line breaks are sent as CRLF, the form mail clients expect. */
  const param = (s) => encodeURIComponent(str(s).replace(/\r?\n/g, '\r\n'));
  const fail = (error) => ({ ok: false, error });
  const ok = (text) => ({ ok: true, text });

  /** A phone number: a leading + is kept, every other non-digit is dropped. At least 3 digits. */
  function phoneNumber(raw) {
    const s = trim(raw);
    if (!s) return { error: tr('qr.err.phone_empty', 'Enter a phone number.') };
    if (!/^\+?[\d\s().-]+$/.test(s)) return { error: tr('qr.err.phone_chars', 'A phone number has digits, spaces and an optional leading +.') };
    const digits = s.replace(/\D/g, '');
    if (digits.length < 3) return { error: tr('qr.err.phone_short', 'Enter a complete phone number.') };
    return { number: (s[0] === '+' ? '+' : '') + digits };
  }

  function url(v) {
    let u = trim(v.url);
    if (!u) return fail(tr('qr.err.url_empty', 'Enter a web address.'));
    if (/\s/.test(u)) return fail(tr('qr.err.url_spaces', 'A web address cannot contain spaces.'));
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    return ok(u);
  }

  function email(v) {
    const to = trim(v.to);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(tr('qr.err.email_to', 'Enter an email address to send to.'));
    const q = [];
    if (trim(v.subject)) q.push('subject=' + param(v.subject));
    if (str(v.body).trim()) q.push('body=' + param(v.body));
    return ok('mailto:' + to + (q.length ? '?' + q.join('&') : ''));
  }

  function phone(v) {
    const p = phoneNumber(v.number);
    return p.error ? fail(p.error) : ok('tel:' + p.number);
  }

  function sms(v) {
    const p = phoneNumber(v.number);
    if (p.error) return fail(p.error);
    const body = str(v.message).trim();
    return ok('sms:' + p.number + (body ? '?body=' + param(body) : ''));
  }

  /** Wi-Fi password rules: WPA and WPA2 take 8 to 63 characters; WEP takes 5 or 13 characters, or 10 or 26 hex digits. */
  function wifiPasswordError(sec, pw) {
    if (sec === 'WPA') return pw.length < 8 || pw.length > 63 ? tr('qr.err.wpa', 'A WPA password is 8 to 63 characters.') : '';
    if (sec === 'WEP') {
      const ok5 = pw.length === 5 || pw.length === 13;
      const hex = (pw.length === 10 || pw.length === 26) && /^[0-9a-f]+$/i.test(pw);
      return ok5 || hex ? '' : tr('qr.err.wep', 'A WEP key is 5 or 13 characters, or 10 or 26 hex digits.');
    }
    return '';
  }

  function wifi(v) {
    const ssid = str(v.ssid);
    const sec = str(v.security) || 'WPA';
    const pw = str(v.password);
    if (!ssid.trim()) return fail(tr('qr.err.ssid_empty', 'Enter the network name.'));
    if (byteLength(ssid) > 32) return fail(tr('qr.err.ssid_long', 'A network name is at most 32 bytes.'));
    if (!['WPA', 'WEP', 'nopass'].includes(sec)) return fail(tr('qr.err.security', 'Choose WPA, WEP or no password.'));
    if (sec !== 'nopass') {
      if (!pw) return fail(tr('qr.err.password', 'Enter the password, or choose no password.'));
      const err = wifiPasswordError(sec, pw);
      if (err) return fail(err);
    }
    return ok('WIFI:T:' + sec + ';S:' + wifiEsc(ssid) + ';' + (sec !== 'nopass' ? 'P:' + wifiEsc(pw) + ';' : '') + 'H:' + (v.hidden ? 'true' : 'false') + ';;');
  }

  function vcard(v) {
    const first = trim(v.first), last = trim(v.last), org = trim(v.org);
    if (!first && !last && !org) return fail(tr('qr.err.vcard_name', 'Enter a name or an organisation.'));
    const email = trim(v.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(tr('qr.err.vcard_email', 'The contact email needs an @ and a domain.'));
    const full = [first, last].filter(Boolean).join(' ') || org;
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + textEsc(last) + ';' + textEsc(first) + ';;;', 'FN:' + textEsc(full)];
    if (org) lines.push('ORG:' + textEsc(org));
    if (trim(v.title)) lines.push('TITLE:' + textEsc(trim(v.title)));
    if (trim(v.phone)) lines.push('TEL;TYPE=CELL:' + trim(v.phone));
    if (email) lines.push('EMAIL;TYPE=INTERNET:' + email);
    if (trim(v.url)) lines.push('URL:' + trim(v.url));
    const adr = [trim(v.street), trim(v.city), trim(v.postal), trim(v.country)];
    if (adr.some(Boolean)) lines.push('ADR;TYPE=WORK:;;' + textEsc(adr[0]) + ';' + textEsc(adr[1]) + ';;' + textEsc(adr[2]) + ';' + textEsc(adr[3]));
    lines.push('END:VCARD');
    return ok(lines.join('\n'));
  }

  /** Six decimal places at most, without trailing zeros. */
  const coord = (n) => Number(n).toFixed(6).replace(/\.?0+$/, '');
  function geo(v) {
    const la = trim(v.lat), lo = trim(v.lng);
    if (!la || !lo) return fail(tr('qr.err.geo_both', 'Enter both latitude and longitude.'));
    const lat = Number(la), lng = Number(lo);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return fail(tr('qr.err.lat', 'Latitude is between -90 and 90.'));
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return fail(tr('qr.err.lng', 'Longitude is between -180 and 180.'));
    return ok('geo:' + coord(lat) + ',' + coord(lng));
  }

  /** A datetime-local value (2026-03-14T09:30) as iCalendar local time (20260314T093000). Null when it is not one. */
  function icsTime(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trim(s));
    return m ? m[1] + m[2] + m[3] + 'T' + m[4] + m[5] + (m[6] || '00') : null;
  }
  function event(v) {
    const title = trim(v.title);
    if (!title) return fail(tr('qr.err.event_title', 'Enter a title.'));
    const start = icsTime(v.start);
    if (!start) return fail(tr('qr.err.event_start', 'Enter the start date and time.'));
    const endRaw = trim(v.end);
    const end = endRaw ? icsTime(endRaw) : null;
    if (endRaw && !end) return fail(tr('qr.err.event_end', 'The end date and time is not valid.'));
    if (end && end < start) return fail(tr('qr.err.event_order', 'The event ends before it starts.'));
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slopographic//QR SLOP//EN', 'BEGIN:VEVENT', 'SUMMARY:' + textEsc(title), 'DTSTART:' + start];
    if (end) lines.push('DTEND:' + end);
    if (trim(v.location)) lines.push('LOCATION:' + textEsc(trim(v.location)));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return ok(lines.join('\n'));
  }

  const BUILDERS = {
    text: (v) => (str(v.text).trim() ? ok(str(v.text)) : fail(tr('qr.err.text_empty', 'Enter some text.'))),
    url, email, phone, sms, wifi, vcard, geo, event,
  };

  /** Turns a form's values into the text to encode. Also checks the byte limit. */
  function build(type, values) {
    const fn = BUILDERS[type];
    if (!fn) return fail(tr('qr.err.kind', 'Choose a kind of code.'));
    const r = fn(values || {});
    if (!r.ok) return r;
    if (byteLength(r.text) > MAX_BYTES) return fail(tr('qr.err.too_long', 'That is too long for one QR code ({max} bytes at most).', { max: String(MAX_BYTES) }));
    return r;
  }

  g.QRPayload = Object.freeze({ TYPES, LABELS, MAX_BYTES, build, byteLength, wifiEsc, textEsc, param, coord, icsTime });
})(typeof window !== 'undefined' ? window : globalThis);
