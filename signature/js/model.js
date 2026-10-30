/* Slop Signature, the model: the fields of an email signature, their checks, and the links made from them. Pure; the form
 * (js/form.js) is drawn from FIELDS and the templates (js/templates.js) read the cleaned state. Classic script; the Node
 * tests load it in a vm. Sets SlopSignature.model = { FIELDS, GROUPS, SOCIAL, STYLE, FONTS, blank, clean, problems, esc, href, sample }.
 *   clean(state) -> the same keys, trimmed, with links made absolute (https:// added), colours checked, and
 *                   socials as [{ id, label, url }] for the ones filled in. */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  // The labels here describe the fields to the assistant (shared/commands args, English: API); the form shows the words of
  // the string tables (signature.g.<id>, signature.f.<key>, signature.ph.<key>).
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const GROUPS = [['you', 'You'], ['company', 'Company'], ['contact', 'Contact'], ['picture', 'Picture'], ['links', 'Social links'], ['extra', 'Extras']];   // i18n-ignore: ids (the form reads signature.g.<id>)
  // One row per field: [key, group, label, input type, placeholder, max length].
  const FIELDS = [
    ['name', 'you', 'Name', 'text', 'Alex Morgan', 80], ['title', 'you', 'Job title', 'text', 'Sales manager', 80],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['department', 'you', 'Department', 'text', '', 80],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['company', 'company', 'Company', 'text', 'Northwind Ltd', 80], ['website', 'company', 'Website', 'url', 'northwind.example', 200],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['address', 'company', 'Address', 'text', '12 Harbour Street, Bristol', 160],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['phone', 'contact', 'Phone', 'tel', '+44 117 496 0000', 40], ['mobile', 'contact', 'Mobile', 'tel', '', 40],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['email', 'contact', 'Email', 'email', 'alex@northwind.example', 120],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['image', 'picture', 'Logo or photo (a web address)', 'url', 'https://northwind.example/logo.png', 2000],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['linkedin', 'links', 'LinkedIn', 'url', '', 200], ['x', 'links', 'X (Twitter)', 'url', '', 200], ['instagram', 'links', 'Instagram', 'url', '', 200],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['facebook', 'links', 'Facebook', 'url', '', 200], ['youtube', 'links', 'YouTube', 'url', '', 200], ['github', 'links', 'GitHub', 'url', '', 200],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['cta', 'extra', 'A line to click (book a call, latest offer)', 'text', 'Book a 15-minute call', 80], ['ctaUrl', 'extra', 'Its link', 'url', '', 200],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['legal', 'extra', 'Small print (disclaimer, company number)', 'textarea', '', 600],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
  ].map(([key, group, label, type, placeholder, max]) => ({ key, group, label, type, placeholder, max }));
  const SOCIAL = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', github: 'GitHub' };   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
  // The fonts every mail program has (the form's Font list; the sample picks one).
  const FONTS = [['Arial, Helvetica, sans-serif', 'Arial'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['Verdana, Geneva, sans-serif', 'Verdana'],   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    ['Tahoma, Geneva, sans-serif', 'Tahoma'], ['Georgia, serif', 'Georgia'], ["'Times New Roman', Times, serif", 'Times New Roman'], ["'Trebuchet MS', sans-serif", 'Trebuchet MS']];   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
  const STYLE = { template: 'classic', accent: '#1f6feb', font: 'Arial, Helvetica, sans-serif', imageSize: 72, round: false };

  const blank = () => Object.assign(Object.fromEntries(FIELDS.map((f) => [f.key, ''])), STYLE);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** A link a mail program will follow: https:// added to a bare address; mailto and tel for those kinds; '' if unsafe. */
  function href(kind, v) {
    const str = String(v || '').trim();
    if (!str) return '';
    if (kind === 'email') return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(str) ? 'mailto:' + str : '';
    if (kind === 'tel') { const d = str.replace(/[^\d+]/g, ''); return d.replace(/\+/g, '').length >= 5 ? 'tel:' + d : ''; }
    if (/^https?:\/\//i.test(str)) return /[\s<>"]/.test(str) ? '' : str;
    if (/^[a-z][a-z0-9+.-]*:/i.test(str)) return '';   // javascript:, data: and the like are never links here
    return /^[^\s<>"]+\.[^\s<>"]+$/.test(str) ? 'https://' + str : '';
  }
  const COLOUR = /^#[0-9a-f]{6}$/i;
  function clean(state) {
    const s = Object.assign(blank(), state || {}), out = {};
    for (const f of FIELDS) out[f.key] = String(s[f.key] == null ? '' : s[f.key]).trim().slice(0, f.max);
    out.template = ['classic', 'side', 'compact', 'banner'].includes(s.template) ? s.template : STYLE.template;
    out.accent = COLOUR.test(s.accent) ? s.accent : STYLE.accent;
    out.font = String(s.font || STYLE.font).replace(/[;{}<>"]/g, '');
    out.imageSize = Math.min(160, Math.max(32, Number(s.imageSize) || STYLE.imageSize));
    out.round = !!s.round;
    out.imageHref = /^data:image\/(png|jpeg|gif);base64,/.test(out.image) ? out.image : href('url', out.image);
    out.websiteHref = href('url', out.website);
    out.ctaHref = href('url', out.ctaUrl);
    out.socials = Object.keys(SOCIAL).map((id) => ({ id, label: SOCIAL[id], url: href('url', out[id]) })).filter((x) => x.url);
    return out;
  }
  /** What is wrong with the state, as [{ key, text }]: an address that will not work as a link. */
  function problems(state) {
    const s = Object.assign(blank(), state || {}), out = [];
    for (const f of FIELDS) {
      const v = String(s[f.key] || '').trim();
      if (!v) continue;
      const kind = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : f.type === 'url' ? 'url' : '';
      if (kind && !(f.key === 'image' && /^data:image\//.test(v)) && !href(kind, v)) out.push({ key: f.key, text: t(kind === 'email' ? 'signature.prob.email' : kind === 'tel' ? 'signature.prob.tel' : 'signature.prob.url', { field: t('signature.f.' + f.key) }) });
    }
    if (String(s.ctaUrl || '').trim() && !String(s.cta || '').trim()) out.push({ key: 'cta', text: t('signature.prob.cta') });
    return out;
  }
  /** A filled-in example, for the first visit (the fields keep their own placeholders otherwise). */
  const sample = () => Object.assign(blank(), { name: 'Alex Morgan', title: 'Sales manager', company: 'Northwind Ltd', website: 'northwind.example',   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    address: '12 Harbour Street, Bristol BS1 4RN', phone: '+44 117 496 0000', email: 'alex@northwind.example', linkedin: 'linkedin.com/company/northwind',   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>
    cta: 'Book a 15-minute call', ctaUrl: 'northwind.example/call', legal: 'Northwind Ltd, registered in England and Wales, company number 01234567.' });   // i18n-ignore: the assistant's field descriptions (API); the form reads signature.f.<key>

  NS.model = { FIELDS, GROUPS, SOCIAL, STYLE, FONTS, blank, clean, problems, esc, href, sample };
})(typeof window !== 'undefined' ? window : globalThis);
