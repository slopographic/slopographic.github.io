/* Slop Contacts: write vCard 3.0 for iOS and Android. VERSION:3.0, CRLF line ends, UTF-8, every physical line
 * folded to at most 75 octets, text escaped (\ ; , and newlines), N and FN always, TEL/EMAIL with TYPE=,
 * ADR, ORG, TITLE, BDAY as YYYY-MM-DD, CATEGORIES, PHOTO (base64 or a URL), plus NOTE, URL and UID so that a read
 * gives the same data back.
 * Classic script. Adds SlopContacts.vcard.write(contacts, version) -> string (version '3.0' or '4.0'). */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text;
  const esc = T.escVal;
  const typeParam = (types) => {
    const t = (types || []).map((x) => String(x).toUpperCase().replace(/[^A-Z0-9-]/g, '')).filter(Boolean);
    return t.length ? ';TYPE=' + t.join(',') : '';
  };

  /** One contact as vCard lines (CRLF-joined, with a final CRLF). version is '3.0' (default) or '4.0'. In 4.0 a photo
   *  is a URI value (a data URI or a link), since the 3.0 ENCODING=b form is not valid there.
   *  opts.slop (the Drive bundle, core/bundle.js): no PHOTO, CATEGORIES or UID; the caller's opts.extra lines are added
   *  before END:VCARD instead (its X-SLOP properties). */
  function one(c, version = '3.0', opts = {}) {
    const out = [], put = (s) => out.push(T.fold(s));
    const n = c.name || {}, v4 = version === '4.0', slop = !!opts.slop;
    out.push('BEGIN:VCARD', 'VERSION:' + (v4 ? '4.0' : '3.0'));
    put(`N:${[n.family, n.given, n.additional, n.prefix, n.suffix].map(esc).join(';')}`);
    put(`FN:${esc(c.fn || SC.model.displayName(c))}`);
    if (c.org || c.dept) put(`ORG:${esc(c.org)};${esc(c.dept)}`);
    if (c.title) put(`TITLE:${esc(c.title)}`);
    for (const p of c.phones || []) put(`TEL${typeParam(p.types)}:${esc(p.value)}`);
    for (const e of c.emails || []) put(`EMAIL${typeParam(e.types)}:${esc(e.value)}`);
    for (const a of c.adr || []) put(`ADR${typeParam(a.types)}:${[a.po, a.ext, a.street, a.locality, a.region, a.postal, a.country].map(esc).join(';')}`);
    if (!slop && v4) { const p = SC.photo.normPhoto(c.photo); if (p) put(`PHOTO;VALUE=uri:${p}`); }
    else if (!slop) { const ph = SC.photo.toVcard(c.photo); if (ph) put(`PHOTO${ph.params}:${ph.value}`); }
    if (c.bday) put(`BDAY:${c.bday}`);
    if (c.url) put(`URL:${esc(c.url)}`);
    if (c.note) put(`NOTE:${esc(c.note)}`);
    if (!slop && (c.groups || []).length) put(`CATEGORIES:${c.groups.map(esc).join(',')}`);
    if (!slop && c.id) put(`UID:${esc(c.id)}`);
    for (const x of opts.extra || []) put(x);
    out.push('END:VCARD');
    return out.join('\r\n') + '\r\n';
  }

  /** Many contacts as one .vcf string (each card is complete, so concatenation is valid). */
  function write(contacts, version = '3.0') {
    return (contacts || []).map((c) => one(SC.model.normalise(c), version)).join('');
  }

  SC.vcard = Object.assign(SC.vcard || {}, { write, one });
})();
