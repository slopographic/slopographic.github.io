/* Slop Contacts: contact photos in the UI. A file picked for a photo is drawn to a canvas at most 256 px on the long
 * side (smaller pictures keep their size), on white, and stored as a JPEG data URI. Also the avatar markup for the list
 * and the panel (the photo, or initials when there is none or it is only a link), and the photo field of the editor.
 * Adds SlopContacts.photoUi. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const UI = window.SlopUI;
  const el = UI.el;
  const MAX = 256, QUALITY = 0.85;
  const esc = (s) => SC.text.html(s);   // the one HTML escape (core/text.js)
  const tr = (k, v) => SC.tr(k, v);

  /** A picture file to an image element. The object URL is released when it has loaded or failed. */
  function decode(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(tr('contacts.ph.not_pic'))); };
      img.src = url;
    });
  }
  /** A picture file to a JPEG data URI, at most MAX pixels on the long side. */
  async function toJpegDataUri(file) {
    const img = await decode(file);
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error(tr('contacts.ph.no_size'));
    const k = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', QUALITY);
  }

  /** Avatar markup for a list row or the panel. Only a data URI photo is shown; a link is never loaded. */
  function avatarHtml(c, big = false) {
    const inner = SC.photo.isImage(c.photo) ? `<img src="${c.photo}" alt="" loading="lazy" decoding="async">`
      : `<span class="av-init">${esc(SC.photo.initials(c))}</span>`;
    return `<span class="avatar${big ? ' av-big' : ''}" aria-hidden="true">${inner}</span>`;
  }

  /** The photo part of the editor. get() gives the photo string to save ('' for none). */
  function field(c) {
    let photo = c.photo || '';
    const box = el('span', { class: 'avatar av-big' });
    const note = el('span', { class: 'ed-hint ed-photo-note' });
    const choose = el('button', { type: 'button', class: 'sui-btn' }, tr('contacts.ph.choose'));
    const drop = el('button', { type: 'button', class: 'sui-btn' }, tr('contacts.ph.remove'));
    const paint = () => {
      const img = SC.photo.isImage(photo);
      box.replaceChildren(img ? el('img', { src: photo, alt: '' }) : el('span', { class: 'av-init' }, SC.photo.initials(c)));
      note.textContent = !photo ? tr('contacts.ph.none') : img ? tr('contacts.ph.stored') : tr('contacts.ph.link', { url: photo });
      drop.hidden = !photo;
    };
    choose.addEventListener('click', async () => {
      try { const p = await SC.dropImport.pickPhoto(); if (p) { photo = p; paint(); } } catch (e) { UI.toast(e.message || tr('contacts.ph.unread')); }
    });
    drop.addEventListener('click', () => { photo = ''; paint(); });
    paint();
    return { el: el('div', { class: 'ed-photo' }, box, el('div', { class: 'ed-photo-acts' }, choose, drop), note), get: () => photo };
  }

  SC.photoUi = { MAX, toJpegDataUri, avatarHtml, field };
})();
