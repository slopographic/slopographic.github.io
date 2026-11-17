/* Slop Signature, the templates: a cleaned state (model.clean) as the HTML a mail program keeps, and as plain text. Mail
 * programs drop <style> and most layout, so every template is tables with inline styles, links in the accent colour,
 * text social links (icon images need hosting and are often blocked) and a "bulletproof" button for the line to click.
 * Pure; classic script. Sets SlopSignature.templates = { LIST, html(s), text(s) }. */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  const M = NS.model, esc = M.esc;
  const LIST = [['classic', 'Classic'], ['side', 'Picture beside'], ['compact', 'Compact'], ['banner', 'Banner']];   // i18n-ignore: the mail programs' own names, and the templates' words stamped into the signature
  const GREY = '#5f6368', FAINT = '#6b7079', INK = '#202124';

  const a = (url, text, colour) => `<a href="${esc(url)}" style="color:${colour};text-decoration:none">${esc(text)}</a>`;
  /** The person: name, then job title and department, then the company. */
  function who(s, o = {}) {
    const role = [s.title, s.department].filter(Boolean).map(esc).join(', ');
    return [s.name ? `<div style="font-size:${o.big || 16}px;font-weight:bold;color:${o.ink || INK}">${esc(s.name)}</div>` : '',
      role ? `<div style="font-size:13px;color:${o.grey || GREY}">${role}</div>` : '',
      s.company ? `<div style="font-size:13px;font-weight:bold;color:${o.companyColour || s.accent}">${esc(s.company)}</div>` : ''].join('');
  }
  /** The ways to reach them, one line each: a label in the accent colour, then the link. */
  function reach(s, sep) {
    const items = [];
    const tel = M.href('tel', s.phone), mob = M.href('tel', s.mobile), mail = M.href('email', s.email);
    if (s.phone) items.push(['Phone', tel ? a(tel, s.phone, INK) : esc(s.phone)]);
    if (s.mobile) items.push(['Mobile', mob ? a(mob, s.mobile, INK) : esc(s.mobile)]);
    if (s.email) items.push(['Email', mail ? a(mail, s.email, INK) : esc(s.email)]);
    if (s.website) items.push(['Web', s.websiteHref ? a(s.websiteHref, s.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''), INK) : esc(s.website)]);
    if (s.address) items.push(['', `<span style="color:${GREY}">${esc(s.address)}</span>`]);
    const one = ([label, v]) => (label ? `<span style="color:${s.accent};font-weight:bold">${label}</span>&nbsp;${v}` : v);
    if (sep) return items.length ? `<div style="font-size:13px;color:${INK}">${items.map(one).join(sep)}</div>` : '';
    return items.map((it) => `<div style="font-size:13px;line-height:20px;color:${INK}">${one(it)}</div>`).join('');
  }
  const socials = (s, colour) => (s.socials.length ? `<div style="font-size:13px;padding-top:6px">${s.socials.map((x) => a(x.url, x.label, colour || s.accent)).join(`<span style="color:${FAINT}">&nbsp;&middot;&nbsp;</span>`)}</div>` : '');
  function picture(s) {
    if (!s.imageHref) return '';
    const r = s.round ? 'border-radius:50%;' : '';
    return `<img src="${esc(s.imageHref)}" width="${s.imageSize}" alt="${esc(s.company || s.name || 'Logo')}" style="display:block;width:${s.imageSize}px;height:auto;border:0;${r}">`;
  }
  /** The line to click, as a coloured button made of a table cell (it survives Outlook). */
  function cta(s) {
    if (!s.cta) return '';
    const inner = s.ctaHref ? `<a href="${esc(s.ctaHref)}" style="color:#ffffff;text-decoration:none;font-weight:bold">${esc(s.cta)}</a>` : `<span style="color:#ffffff;font-weight:bold">${esc(s.cta)}</span>`;
    return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:10px"><tr><td style="background:${s.accent};border-radius:4px;padding:7px 14px;font-size:13px">${inner}</td></tr></table>`;
  }
  const legal = (s) => (s.legal ? `<div style="font-size:11px;line-height:15px;color:${FAINT};padding-top:10px;max-width:520px">${esc(s.legal).replace(/\n/g, '<br>')}</div>` : '');
  const table = (s, rows) => `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:${s.font};border-collapse:collapse">${rows}</table>`;

  const BUILD = {
    classic: (s) => table(s, `<tr><td style="padding:0 0 8px">${who(s)}</td></tr>` +
      `<tr><td style="border-top:2px solid ${s.accent};padding:8px 0 0">${reach(s)}${socials(s)}</td></tr>` +
      (s.imageHref ? `<tr><td style="padding:10px 0 0">${picture(s)}</td></tr>` : '') + `<tr><td>${cta(s)}${legal(s)}</td></tr>`),
    side: (s) => table(s, `<tr>${s.imageHref ? `<td valign="top" style="padding:0 14px 0 0">${picture(s)}</td>` : ''}` +
      `<td valign="top" style="border-left:3px solid ${s.accent};padding:0 0 0 14px">${who(s)}<div style="height:6px"></div>${reach(s)}${socials(s)}${cta(s)}</td></tr>` +
      (s.legal ? `<tr><td colspan="2">${legal(s)}</td></tr>` : '')),
    compact: (s) => table(s, `<tr><td style="font-size:13px;color:${INK}"><b>${esc(s.name)}</b>${[s.title, s.company].filter(Boolean).map((x) => ` <span style="color:${FAINT}">|</span> ${esc(x)}`).join('')}</td></tr>` +
      `<tr><td style="padding-top:2px">${reach(s, `<span style="color:${FAINT}">&nbsp;&nbsp;</span>`)}${socials(s)}</td></tr>` + `<tr><td>${cta(s)}${legal(s)}</td></tr>`),
    banner: (s) => table(s, `<tr><td style="background:${s.accent};padding:10px 14px">${who(s, { ink: '#ffffff', grey: '#ffffff', companyColour: '#ffffff', big: 17 })}</td>` +
      (s.imageHref ? `<td style="background:${s.accent};padding:8px 14px" align="right">${picture(s)}</td>` : '') + '</tr>' +
      `<tr><td colspan="2" style="padding:10px 14px 0">${reach(s)}${socials(s)}${cta(s)}${legal(s)}</td></tr>`),
  };
  /** The signature as HTML for a mail program; '' while there is nothing to show. */
  function html(s) {
    if (!s.name && !s.company && !s.email && !s.phone) return '';
    return BUILD[s.template](s);
  }
  /** The plain-text signature (for mail sent as plain text), starting with the usual "-- " line. */
  function text(s) {
    const role = [s.title, s.department].filter(Boolean).join(', ');
    const lines = [s.name, role, s.company, s.phone && `Phone ${s.phone}`, s.mobile && `Mobile ${s.mobile}`, s.email && `Email ${s.email}`,   // i18n-ignore: the mail programs' own names, and the templates' words stamped into the signature
      s.website && `Web ${s.website}`, s.address, ...s.socials.map((x) => `${x.label} ${x.url}`), s.cta && (s.ctaHref ? `${s.cta}: ${s.ctaHref}` : s.cta), s.legal && `\n${s.legal}`].filter(Boolean);   // i18n-ignore: the mail programs' own names, and the templates' words stamped into the signature
    return lines.length ? '-- \n' + lines.join('\n') : '';
  }

  NS.templates = { LIST, html, text };
})(typeof window !== 'undefined' ? window : globalThis);
