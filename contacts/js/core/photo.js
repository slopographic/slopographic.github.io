/* Slop Contacts: contact photos. A photo is one string: a data: URI of a JPEG or PNG (shown in the list and the
 * panel), or an http(s) link kept as text only (never fetched; the avatar shows initials instead). vCard PHOTO is read
 * from base64 (3.0 and 2.1 forms, or a data: URI as in 4.0) and from a URL, and written back the same way, so an
 * import then an export gives the same PHOTO. CSV has no photo column. Classic script. Adds SlopContacts.photo. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const DATA = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
  const LINK = /^https?:\/\/\S{1,2000}$/i;

  /** Keep a photo only when it is a supported data URI or a web link. Anything else becomes ''. */
  function normPhoto(v) {
    const s = String(v == null ? '' : v).trim();
    return DATA.test(s) || LINK.test(s) ? s : '';
  }
  /** True when the photo is an image we can show (a data URI). Links are never shown. */
  const isImage = (p) => DATA.test(String(p || ''));

  /** The photo from a vCard PHOTO property: raw value text and its parameters. Only JPEG and PNG are kept
   *  (the type is read from the base64 header, so a wrong or missing TYPE does not matter). */
  function fromVcard(value, params) {
    const v = String(value || '').trim();
    if (/^data:/i.test(v)) {
      const m = /^data:[^,]*;base64,(.*)$/is.exec(v);
      return m ? fromBase64(m[1]) : '';
    }
    if (LINK.test(v)) return normPhoto(v);
    const enc = ((params && params.ENCODING) || []).some((e) => /^(b|base64)$/i.test(e));
    return enc ? fromBase64(v) : '';
  }
  /** Base64 text (line breaks from folding removed) to a data URI, when the bytes are a PNG or JPEG. */
  function fromBase64(raw) {
    const b64 = String(raw || '').replace(/\s+/g, '');
    if (/^iVBORw0KGgo/.test(b64)) return normPhoto('data:image/png;base64,' + b64);
    if (/^\/9j\//.test(b64)) return normPhoto('data:image/jpeg;base64,' + b64);
    return '';
  }

  /** The PHOTO property for a vCard 3.0 writer: { params, value } (value is not escaped), or null without a photo. */
  function toVcard(photo) {
    const p = normPhoto(photo);
    if (!p) return null;
    const m = /^data:image\/(jpeg|png);base64,(.*)$/.exec(p);
    if (m) return { params: `;ENCODING=b;TYPE=${m[1].toUpperCase()}`, value: m[2] };
    return { params: ';VALUE=uri', value: p };
  }

  /** The letters for an avatar when there is no photo: given and family initials, else the display name. */
  function initials(c) {
    const n = c.name || {};
    const first = (s) => Array.from(String(s || '').trim())[0] || '';
    let s = first(n.given) + first(n.family);
    if (!s) s = String(c.fn || c.org || '?').trim().split(/\s+/).slice(0, 2).map(first).join('');
    return (s || '?').toUpperCase();
  }

  SC.photo = { normPhoto, isImage, fromVcard, toVcard, initials };
})();
