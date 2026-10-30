// Sample mascot overlay for the made-up "Acme Tools" profile (brand/profiles/sample.json): its flat icon. Sample art for
// tests, MIT like the rest of this repository. The overlay contract: shared/mascot/slot.js. No DOM: the white-label build
// also runs this in Node to draw the favicon and the app icons (tools/whitelabel/mascot.mjs).
// Tests: tests/node/whitelabel-mascot-slot.test.mjs, tests/buddy/slot.test.html.
export const name = 'Acme Bot';

/** The icon at size px. small (16 and 24 px): no antenna, bigger eyes. */
export function svg(size, small) {
  const head = '<rect x="10" y="16" width="44" height="38" rx="12" fill="#4338ca"/>';
  if (small) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${name}">`
      + `<rect x="4" y="8" width="56" height="50" rx="14" fill="#4338ca"/><circle cx="23" cy="32" r="7" fill="#fff"/><circle cx="41" cy="32" r="7" fill="#fff"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${name}">`
    + `<line x1="32" y1="6" x2="32" y2="16" stroke="#4338ca" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="6" r="4" fill="#f59e0b"/>${head}`
    + `<circle cx="24" cy="33" r="5" fill="#fff"/><circle cx="40" cy="33" r="5" fill="#fff"/><circle cx="25" cy="34" r="2.4" fill="#111827"/><circle cx="41" cy="34" r="2.4" fill="#111827"/>`
    + '<path d="M25 44 q7 5 14 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
}
