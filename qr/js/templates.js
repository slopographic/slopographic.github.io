/* QR SLOP: the template gallery. Each template is a kind, default form values and a name with a short description.
 * Only public link formats are used (wa.me, t.me, instagram.com, x.com and so on); the app makes no network calls, and
 * every placeholder (yourhandle, 15550100100, YOUR_PLACE_ID) is for the person to replace. Pure. Classic script; exposes window.QRTemplates. */
(function (g) {
  'use strict';
  if (g.QRTemplates) return;

  const T = (id, group, name, desc, type, values) => ({ id, group, name, desc, type, values });
  const LIST = [ // the page shows qr.tpl.* (en/forms.js); names and values here are the English source and sample content
    T('wifi-card', 'Business', 'Wi-Fi card', 'Guests join by scanning the code. WPA2 with a password.', 'wifi', // i18n-ignore
      { ssid: 'Guest Wi-Fi', security: 'WPA', password: 'welcome-guest', hidden: false }), // i18n-ignore
    T('contact-card', 'Business', 'Contact card', 'A vCard that saves your name, company and phone to the phone book.', 'vcard', // i18n-ignore
      { first: 'Alex', last: 'Morgan', org: 'Morgan Studio', title: '', phone: '+1 555 010 0100', email: 'hello@example.com', url: 'https://example.com', street: '', city: '', postal: '', country: '' }), // i18n-ignore
    T('email-signature', 'Business', 'Email signature', 'For the end of an email: your name, title, company and website.', 'vcard', // i18n-ignore
      { first: 'Alex', last: 'Morgan', org: 'Example Co', title: 'Head of sales', phone: '+1 555 010 0100', email: 'alex@example.com', url: 'https://example.com', street: '', city: '', postal: '', country: '' }), // i18n-ignore
    T('review-link', 'Business', 'Review link', 'Sends people straight to your review page. Replace YOUR_PLACE_ID.', 'url', // i18n-ignore
      { url: 'https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID' }), // i18n-ignore
    T('restaurant-menu', 'Hospitality', 'Restaurant menu', 'Opens your menu on the table or the door.', 'url', // i18n-ignore
      { url: 'https://example.com/menu' }), // i18n-ignore
    T('event', 'Events', 'Event', 'Adds a timed event to the calendar.', 'event', // i18n-ignore
      { title: 'Open evening', location: 'Main hall', start: '2026-11-14T18:00', end: '2026-11-14T21:00' }), // i18n-ignore
    T('link-in-bio', 'Social', 'Link in bio', 'One page that holds all of your links.', 'url', // i18n-ignore
      { url: 'https://example.com/yourname' }), // i18n-ignore
    T('instagram', 'Social', 'Instagram profile', 'Opens your Instagram profile.', 'url', // i18n-ignore
      { url: 'https://www.instagram.com/yourhandle/' }), // i18n-ignore
    T('x-profile', 'Social', 'X profile', 'Opens your profile on X.', 'url', // i18n-ignore
      { url: 'https://x.com/yourhandle' }), // i18n-ignore
    T('telegram', 'Social', 'Telegram', 'Opens a Telegram chat with you.', 'url', // i18n-ignore
      { url: 'https://t.me/yourhandle' }), // i18n-ignore
    T('whatsapp', 'Social', 'WhatsApp message', 'Opens a WhatsApp chat with a message already typed in.', 'url', // i18n-ignore
      { url: 'https://wa.me/15550100100?text=' + encodeURIComponent("Hi, I'd like to know more.") }), // i18n-ignore
  ];

  const byId = (id) => LIST.find((t) => t.id === id) || null;
  /** A fresh copy of a template's kind and values, so the form can change them without touching the gallery. */
  function copy(id) {
    const t = byId(id);
    return t ? { type: t.type, values: JSON.parse(JSON.stringify(t.values)) } : null;
  }

  g.QRTemplates = Object.freeze({ list: () => LIST.slice(), get: byId, copy });
})(typeof window !== 'undefined' ? window : globalThis);
