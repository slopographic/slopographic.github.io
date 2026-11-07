/* Slop Contacts: phone numbers (E.164 with a default country code) and the keys used to find duplicates.
 * Classic script. Adds SlopContacts.phone. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text;
  const digits = (s) => String(s || '').replace(/\D/g, '');

  /** Digits of a country code: '+44' and '44' give '44'; '' gives ''. */
  const ccDigits = (cc) => digits(cc).slice(0, 3);

  /** A phone as E.164 (+ and up to 15 digits). With no default country code the number is kept as typed.
   *  A national number has its trunk 0 removed and the country code added. A number that already starts
   *  with the country code (and is long enough) is taken as international. */
  function toE164(value, cc) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const compact = raw.replace(/[\s\-().\/]/g, '');
    if (compact[0] === '+') return '+' + digits(compact);
    const cd = ccDigits(cc);
    if (!cd) return raw;
    if (compact.startsWith('00')) return '+' + digits(compact).slice(2);
    let national = digits(compact);
    if (national.startsWith(cd) && national.length >= cd.length + 8) return '+' + national;
    if (national[0] === '0') national = national.slice(1);
    const out = '+' + cd + national;
    return national.length >= 4 && out.length - 1 <= 15 ? out : raw;
  }

  /** Apply toE164 to every phone of a contact-like object (returns a new list). */
  const phonesToE164 = (phones, cc) => (phones || []).map((p) => ({ value: toE164(p.value, cc), types: p.types || [] }));

  /** Duplicate keys. A phone compares by its digits (after E.164 with cc); an email by its lowercase text. */
  function phoneKey(value, cc) {
    const d = digits(toE164(value, cc));
    return d.length >= 6 ? 'p:' + d : null;
  }
  function emailKey(value) {
    const t = T.tidy(value).toLowerCase();
    return t.includes('@') ? 'e:' + t : null;
  }
  /** Name plus organisation: both must be present. */
  function nameOrgKey(c) {
    const name = T.tidy(SC.model.composed(c) || c.fn).toLowerCase();
    const org = T.tidy(c.org).toLowerCase();
    return name && org ? 'n:' + name + '|' + org : null;
  }

  SC.phone = { digits, ccDigits, toE164, phonesToE164, phoneKey, emailKey, nameOrgKey };
})();
