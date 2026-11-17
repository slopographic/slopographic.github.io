/* Slop Signature, the random sample: a whole signature from a seed (a person at a company with their phone, e-mail, web
 * address and LinkedIn, a template, a colour that reads on white, a font, often a line to click and small print, and the
 * logo to draw). Every part comes from shared/sample (SlopSample.identity and colour), so the same seed always gives the
 * same signature. Pure; classic script, after model.js, templates.js, logo.js and shared/sample.
 * Sets SlopSignature.sample = { make(seed, locale) -> { seed, state, logo: { kind, shape, text, seed } | null } }. */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  const X = g.SlopSample, M = NS.model;

  function make(seed, locale) {
    const s = X.normSeed(seed), r = X.rng(`signature:${s}`), p = X.identity(r.fork('who'), { locale });
    const look = r.fork('look'), more = r.fork('more');
    const template = look.pick(NS.templates.LIST)[0], accent = X.colour(look.fork('accent')), font = look.pick(M.FONTS)[0];
    const state = Object.assign(M.blank(), {
      name: p.name, title: p.title, department: more.chance(0.3) ? p.department : '', company: p.company, website: p.website,
      address: more.chance(0.7) ? p.address : '', phone: p.phone, mobile: p.mobile, email: p.email,
      linkedin: more.chance(0.6) ? p.linkedin : '', template, accent, font, imageSize: look.pick([56, 64, 72, 80]), round: false,
    });
    if (more.chance(0.5)) { state.cta = p.cta; state.ctaUrl = `${p.website}/${X.slug(p.cta).split('-').slice(0, 2).join('-')}`; }
    if (more.chance(0.4)) state.legal = p.legal;
    const kind = look.chance(0.75) ? 'monogram' : 'wordmark';
    const logo = template === 'compact' ? null : { kind, shape: look.pick(['circle', 'rounded', 'square', kind === 'wordmark' ? 'none' : 'circle']),
      text: kind === 'monogram' ? NS.logo.initials(p.companyShort) : p.companyShort, seed: s };
    if (logo && kind === 'wordmark') state.imageSize = 140;
    return { seed: s, state, logo };
  }

  NS.sample = { make };
})(typeof window !== 'undefined' ? window : globalThis);
