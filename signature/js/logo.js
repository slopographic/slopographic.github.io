/* Slop Signature, the logo maker: a monogram (initials) or a short wordmark drawn as SVG, in a shape (circle, rounded
 * square, square or none), in the signature's accent colour, with seeded variations (fill, outline or tint; the typeface;
 * a small mark). Mail programs do not show SVG, so png() draws it into a PNG (SlopBuffer.rasterize, shared/buffer). Pure but
 * for png(); classic script, after shared/sample/rng.js and people.js (the seeded generator and the contrast check).
 * Sets SlopSignature.logo = { SHAPES, initials(text), options(o), svg(o), png(o, width) }.
 *   o: { text, kind: 'monogram' | 'wordmark', shape, colour: '#rrggbb', seed }   (options fills in the rest from the seed) */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  const X = g.SlopSample;
  const SHAPES = [['circle', 'Circle'], ['rounded', 'Rounded square'], ['square', 'Square'], ['none', 'No shape']];   // i18n-ignore: SVG markup and the assistant's shape names
  const FACES = ['Arial, Helvetica, sans-serif', 'Georgia, serif', "'Trebuchet MS', sans-serif", 'Verdana, Geneva, sans-serif', "'Times New Roman', serif"];
  const STYLES = ['fill', 'fill', 'outline', 'tint'];
  const SMALL = /^(ab|hb|kb|ltd|llc|inc|plc|co|gmbh|oy|as|the|and|och|&)$/i;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** "Harbour Studio Ltd" -> "HS", "Northwind" -> "N", "Anna-Karin Lund" -> "AL": the first letters of the first two words
   *  that are not a company form. */
  function initials(text) {
    const words = String(text || '').split(/[\s\-_/.]+/).filter((w) => w && !SMALL.test(w) && /\p{L}|\d/u.test(w));
    return words.slice(0, 2).map((w) => (w.match(/\p{L}|\d/u) || [''])[0].toUpperCase()).join('') || '?';
  }
  const COLOUR = /^#[0-9a-f]{6}$/i;
  /** The options with everything the seed decides: the style, the typeface, the mark, the letter spacing. */
  function options(o) {
    const r = X.rng(`logo:${o.seed == null ? '' : o.seed}`), kind = o.kind === 'wordmark' ? 'wordmark' : 'monogram';
    const text = String(o.text || '').trim().slice(0, kind === 'wordmark' ? 24 : 3) || '?';
    const shape = SHAPES.some((s) => s[0] === o.shape) ? o.shape : r.pick(['circle', 'rounded', 'square']);
    return { kind, text, shape, colour: COLOUR.test(o.colour || '') ? o.colour : X.colour(r.fork('colour')),
      style: shape === 'none' ? 'plain' : o.style || r.pick(STYLES), face: o.face || r.pick(FACES), mark: o.mark || r.pick(['none', 'none', 'dot', 'bar']),
      spacing: r.pick([0, 0, 1, 2]), seed: o.seed };
  }
  /** Light tint of a colour (mixed with white), for the tint style's ground. */
  const tint = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k + 255 * (1 - k)).toString(16).padStart(2, '0')).join('');

  function svg(input) {
    const o = options(input), c = o.colour;
    const ink = o.style === 'fill' ? (X.contrast(c, '#ffffff') >= 3 ? '#ffffff' : '#111111') : c;
    const ground = o.style === 'fill' ? c : o.style === 'tint' ? tint(c, 0.14) : o.style === 'outline' ? '#ffffff' : 'none';
    const mono = o.kind === 'monogram', W = mono ? 160 : Math.min(560, 120 + 30 * o.text.length), H = mono ? 160 : 120;
    const sw = o.style === 'outline' ? 8 : 0, inset = sw / 2;
    let back = '';
    if (o.shape === 'circle' && mono) back = `<circle cx="80" cy="80" r="${80 - inset}"`;   // i18n-ignore: SVG markup and the assistant's shape names
    else if (o.shape !== 'none') back = `<rect x="${inset}" y="${inset}" width="${W - sw}" height="${H - sw}" rx="${o.shape === 'rounded' || (o.shape === 'circle' && !mono) ? (mono ? 34 : H / 2) - inset : 0}"`;   // i18n-ignore: SVG markup and the assistant's shape names
    if (back) back += ` fill="${ground}"${sw ? ` stroke="${c}" stroke-width="${sw}"` : ''}/>`;
    const n = o.text.length, size = mono ? (n === 1 ? 92 : n === 2 ? 70 : 54) : 56;
    const fit = mono ? Math.min(118, 46 * n) : W - 64;   // the text is stretched or squeezed to this width (textLength)
    const y = mono ? 80 + size * 0.35 : H / 2 + size * 0.35;
    const text = `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${esc(o.face)}" font-size="${size}" font-weight="bold" fill="${ink}"` +   // i18n-ignore: SVG markup and the assistant's shape names
      `${o.spacing ? ` letter-spacing="${o.spacing}"` : ''} textLength="${fit}" lengthAdjust="spacingAndGlyphs">${esc(o.text)}</text>`;
    const mark = o.mark === 'dot' ? `<circle cx="${mono ? 128 : W - 22}" cy="${mono ? 34 : 24}" r="${mono ? 9 : 8}" fill="${ink}"/>`
      : o.mark === 'bar' ? `<rect x="${W / 2 - (mono ? 26 : fit / 4)}" y="${y + (mono ? 14 : 12)}" width="${mono ? 52 : fit / 2}" height="6" rx="3" fill="${ink}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${back}${text}${mark}</svg>`;
  }
  /** The logo as a PNG data address at most width px wide (240: crisp at the signature's sizes, small enough to carry). */
  async function png(o, width = 240) {
    const s = svg(o), m = /width="(\d+)" height="(\d+)"/.exec(s), w = Math.min(width, +m[1] * 2), h = Math.round((w * +m[2]) / +m[1]);
    const canvas = await g.SlopBuffer.rasterize(s, w, h);
    return canvas.toDataURL('image/png');
  }

  NS.logo = { SHAPES, FACES, initials, options, svg, png };
})(typeof window !== 'undefined' ? window : globalThis);
