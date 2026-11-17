/* Slop Contacts: read vCard 2.1, 3.0 and 4.0 (.vcf). Handles folded lines, quoted-printable (2.1),
 * escaped characters, several TEL/EMAIL/ADR with TYPE, Apple itemN.X-ABLabel, CATEGORIES as groups and PHOTO
 * (base64 JPEG or PNG, or a URL kept as text).
 * Versions 2.1, 3.0 and 4.0 are read the same way (4.0 has no ENCODING/CHARSET, and its TEL and EMAIL values may be
 * tel: and mailto: URIs, which are stripped).
 * Classic script. Adds SlopContacts.vcard.read(text, opts) -> contacts (normalised). */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text;

  /** Apple's built-in labels (_$!<Mobile>!$_ and friends) to vCard types. */
  const APPLE = { mobile: 'CELL', iphone: 'CELL', home: 'HOME', work: 'WORK', main: 'MAIN', fax: 'FAX', homefax: 'HOME,FAX',
    workfax: 'WORK,FAX', pager: 'PAGER', other: 'OTHER' };
  /** Apple label text to types. Custom labels become one type made of their letters and digits. */
  function labelTypes(label) {
    const m = /^_\$!<(.*)>!\$_$/.exec(String(label).trim());
    const name = m ? m[1] : String(label).trim();
    const key = name.toLowerCase().replace(/[\s\-]/g, '');
    if (APPLE[key]) return APPLE[key].split(',');
    const t = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return t ? [t] : [];
  }
  /** Parameter values that describe the encoding or are noise, not a type. */
  const NOISE = new Set(['PREF', 'INTERNET', 'VOICE']);
  const isQP = (params) => (params.ENCODING || []).some((e) => /QUOTED-PRINTABLE/i.test(e));
  const charsetOf = (params) => (params.CHARSET || [])[0] || '';

  /** One physical-to-logical pass: lines that start with a space or tab continue the previous line. */
  function logicalLines(text) {
    const phys = String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/), out = [];
    for (const p of phys) {
      if (/^[ \t]/.test(p) && out.length) out[out.length - 1] += p.slice(1);
      else out.push(p);
    }
    return out;
  }
  /** Keeps a parameter value under its name. Only TYPE values are types; PREF, LANGUAGE and the rest are kept apart. */
  function addParam(params, key, val) {
    (params[key] = params[key] || []).push(val);
  }
  /** "group.NAME;PARAM=V,W;BARE:value" to { group, name, params, value }. */
  function parseLine(line) {
    const idx = line.indexOf(':');
    if (idx < 0) return null;
    const head = line.slice(0, idx), value = line.slice(idx + 1), parts = head.split(';');
    let name = parts.shift(), group = '';
    const dot = name.lastIndexOf('.');
    if (dot >= 0) { group = name.slice(0, dot).toLowerCase(); name = name.slice(dot + 1); }
    const params = {};
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq < 0) {
        const bare = p.trim().toUpperCase();
        if (bare === 'QUOTED-PRINTABLE' || bare === 'BASE64' || bare === '8BIT') addParam(params, 'ENCODING', bare);
        else if (bare === 'UTF-8' || /^(ISO|WINDOWS|CP)/.test(bare)) addParam(params, 'CHARSET', bare);
        else addParam(params, 'TYPE', p.trim());
      } else {
        const key = p.slice(0, eq).toUpperCase();
        for (const v of p.slice(eq + 1).split(',')) addParam(params, key, v.replace(/^"|"$/g, ''));
      }
    }
    return { group, name: name.toUpperCase(), params, value };
  }
  const cleanTypes = (a) => T.uniq((a || []).flatMap((t) => String(t).split(',')).map((t) => t.trim().toUpperCase()).filter((t) => t && !NOISE.has(t)));

  /** Read the value of a property as text, decoded from quoted-printable when needed. */
  function propValue(p) { return isQP(p.params) ? T.qpDecode(p.value, charsetOf(p.params)) : p.value; }

  /** Build a contact from its property records (one BEGIN:VCARD … END:VCARD block). */
  function contactFrom(props, opts = {}) {
    const c = SC.model.blank(), labels = {};
    for (const p of props) if (p.name === 'X-ABLABEL' && p.group) labels[p.group] = propValue(p);
    const typesOf = (p) => { const t = cleanTypes(p.params.TYPE); return t.length || !labels[p.group] ? t : labelTypes(labels[p.group]); };
    for (const p of props) {
      const raw = propValue(p), u = T.unescVal(raw);
      switch (p.name) {
        case 'N': {
          const f = T.splitUnescaped(raw, ';').map(T.unescVal);
          c.name = { family: f[0] || '', given: f[1] || '', additional: f[2] || '', prefix: f[3] || '', suffix: f[4] || '' };
          break;
        }
        case 'FN': if (!c.fn) c.fn = u; break;
        case 'ORG': { const f = T.splitUnescaped(raw, ';').map(T.unescVal); c.org = f[0] || ''; c.dept = f[1] || ''; break; }
        case 'TITLE': c.title = u; break;
        case 'TEL': c.phones.push({ value: u.replace(/^tel:/i, ''), types: typesOf(p) }); break;
        case 'EMAIL': c.emails.push({ value: u.replace(/^mailto:/i, ''), types: typesOf(p) }); break;
        case 'ADR': {
          const f = T.splitUnescaped(raw, ';').map(T.unescVal);
          c.adr.push({ types: typesOf(p), po: f[0], ext: f[1], street: f[2], locality: f[3], region: f[4], postal: f[5], country: f[6] });
          break;
        }
        case 'BDAY': c.bday = SC.model.normBday(u); break;
        case 'URL': if (!c.url) c.url = u; break;
        case 'NOTE': c.note = c.note ? c.note + '\n' + u : u; break;
        case 'CATEGORIES': c.groups.push(...T.splitUnescaped(raw, ',').map(T.unescVal)); break;
        case 'UID': if (u.trim()) c.id = u.trim(); break;
        // Slop Contacts' own properties (core/bundle.js writes them; other apps ignore them)
        case 'X-SLOP-ID': if (u.trim()) c.id = u.trim(); break;
        case 'X-SLOP-GROUP': if (u.trim()) c.groups.push(u.trim()); break;
        case 'X-SLOP-STAGE': c.stage = u.trim(); break;
        case 'X-SLOP-FOLLOWUP': c.followUp = u.trim(); break;
        case 'X-SLOP-TAGS': c.tagIds = [...(c.tagIds || []), ...T.splitUnescaped(raw, ',').map(T.unescVal).map((t) => t.trim()).filter(Boolean)]; break;
        case 'PHOTO': if (!c.photo && opts.photos !== false) c.photo = SC.photo.fromVcard(p.value, p.params); break;
        default: break;
      }
    }
    return c;
  }

  /** Parse every vCard in the text. Returns an array of normalised contacts (empty cards are skipped).
   *  opts.photos false skips PHOTO properties (the import dialog does this). */
  function read(text, opts = {}) {
    const lines = logicalLines(text), out = [];
    let cur = null;
    const flush = () => { const c = contactFrom(cur, opts); if (SC.model.hasContent(c)) out.push(SC.model.normalise(c)); cur = null; };
    for (let i = 0; i < lines.length; i++) {
      const p = parseLine(lines[i]);
      if (!p) continue;
      if (isQP(p.params)) while (p.value.endsWith('=') && i + 1 < lines.length) p.value = p.value.slice(0, -1) + lines[++i];
      if (p.name === 'BEGIN' && /^VCARD$/i.test(p.value.trim())) { cur = []; continue; }
      if (p.name === 'END' && cur) { flush(); continue; }
      if (cur) cur.push(p);
    }
    if (cur && cur.length) flush();
    return out;
  }

  SC.vcard = Object.assign(SC.vcard || {}, { read, labelTypes });
})();
