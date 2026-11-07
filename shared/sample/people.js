/* SlopSample, people: a person, a company, an address, ways to reach them, and colours that read well. Pure; after rng.js
 * and the language files. Each takes a seed (any text) or a generator from SlopSample.rng, and o.locale ('en', 'sv').
 *   person(seed, o)   -> { first, last, name, title, department }
 *   company(seed, o)  -> { name, short, domain, website }                (domain ends in .example)
 *   address(seed, o)  -> { street, city, postcode, line, phonePrefix }
 *   identity(seed, o) -> the person at the company with { email, phone, mobile, website, address, linkedin, cta, legal }
 *   colour(seed, o)   -> '#rrggbb' that reads on white (contrast 4.5 or more; o.min for another floor)
 *   contrast(a, b)    -> the WCAG contrast ratio of two '#rrggbb' colours
 *   slug(text)        -> 'asa-ostlund' from 'Åsa Östlund' (for addresses) */
(function (g) {
  'use strict';
  const NS = g.SlopSample;
  if (!NS || !NS.rng || NS.person) return;
  const R = (s) => (s && typeof s === 'object' && typeof s.next === 'function' ? s : NS.rng(s == null ? '' : s));
  const L = (o) => NS.locale(o && o.locale);

  const FOLD = { å: 'a', ä: 'a', ö: 'o', é: 'e', è: 'e', ü: 'u', æ: 'ae', ø: 'o', ß: 'ss' };
  /** Lower-case ASCII words joined by sep (default '-'): what an e-mail or a web address can hold. */
  const slug = (t, sep = '-') => String(t || '').toLowerCase().replace(/[åäöéèüæøß]/g, (c) => FOLD[c]).replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');

  function person(seed, o) {
    const r = R(seed), w = L(o);
    const first = r.pick(w.first), last = r.pick(w.last), [title, department] = r.pick(w.titles);
    return { first, last, name: `${first} ${last}`, title, department };
  }
  function company(seed, o) {
    const r = R(seed), w = L(o);
    const a = r.pick(w.companyA), b = r.pick(w.companyB), form = r.pick(w.companyForm);
    const short = `${a} ${b}`;
    const domain = `${slug(a, '')}${r.chance(0.5) ? slug(b, '') : ''}.example`;
    return { name: form ? `${short} ${form}` : short, short, domain, website: domain };
  }
  function address(seed, o) {
    const r = R(seed), w = L(o);
    const [city, area, phonePrefix] = r.pick(w.cities), street = r.pick(w.streets), no = r.int(1, 120);
    const postcode = w.postcode(r, area);
    return { street: `${street} ${no}`, city, postcode, line: w.address(no, street, city, postcode), phonePrefix };
  }
  /** A whole person to put in a signature or a contact card: one generator per part, so the parts stay put. */
  function identity(seed, o) {
    const r = R(seed), w = L(o);
    const p = person(r.fork('person'), o), c = company(r.fork('company'), o), a = address(r.fork('address'), o), x = r.fork('reach');
    const local = x.chance(0.7) ? slug(p.first, '') : `${slug(p.first, '')}.${slug(p.last, '')}`;
    return Object.assign(p, {
      company: c.name, companyShort: c.short, domain: c.domain, website: c.website, address: a.line, city: a.city,
      email: `${local}@${c.domain}`, phone: w.phone(x, a.phonePrefix), mobile: x.chance(0.5) ? w.mobile(x) : '',
      linkedin: `linkedin.com/in/${slug(p.name)}`, cta: x.pick(w.cta), legal: w.legal(c.name, x),
    });
  }

  /* ---------- colours ---------- */
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function hsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  /** A clear colour (any hue, well saturated) darkened just enough to read on white: links, a button, a logo. */
  function colour(seed, o) {
    const r = R(seed), min = (o && o.min) || 4.5, bg = (o && o.on) || '#ffffff';
    const h = r.int(0, 359), s = r.float(0.55, 0.85);
    let l = r.float(0.38, 0.5), c = hsl(h, s, l);
    while (contrast(c, bg) < min && l > 0.05) { l -= 0.02; c = hsl(h, s, l); }
    return c;
  }

  Object.assign(NS, { slug, person, company, address, identity, colour, contrast, hsl });
})(typeof window !== 'undefined' ? window : globalThis);
