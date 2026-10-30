// The rules every font spec keeps, checked before a family is built into a site (tools/whitelabel/font.mjs) and by the
// tests; tools/fonts/build.py applies the same two rules when it builds (MARK_ONLY there).
//  1. Only a plain brand mark goes into a font: every Private Use Area entry says "kind": "mark". A font is OFL software,
//     and a glyph in it is OFL too; a mascot is all-rights-reserved art (LICENSE-ART) and never goes into one.
//  2. No entry or drawing is named after a mascot: the spec's own "mascots" list and the profile's mascot name.
// Node only. Tests: tests/node/whitelabel-font.test.mjs, tests/node/brand-font.test.mjs.

/** Problems with a spec's Private Use Area: [] when it holds only brand marks. mascots: extra names to refuse. */
export function specProblems(spec, mascots = []) {
  const names = [...(spec.mascots || []), ...mascots].filter(Boolean).map((n) => n.toLowerCase());
  const errs = [];
  const named = (v) => { const s = String(v || '').toLowerCase(); return s && names.find((n) => s.includes(n) || (s.length > 2 && n.includes(s))); };
  for (const [key, e] of Object.entries(spec.pua || {})) {
    if (e.kind !== 'mark') errs.push(`pua.${key}: only a brand mark goes into a font ("kind": "mark"); a mascot is all-rights-reserved art, never OFL`);
    for (const s of [key, e.name, e.drawing]) {
      const n = named(s);
      if (n) errs.push(`pua.${key}: "${s}" is the mascot ${n}, which never goes into a font`);
    }
  }
  for (const key of Object.keys(spec.drawings || {})) {
    const n = named(key);
    if (n) errs.push(`drawings.${key}: a drawing of the mascot ${n} has no place in a font spec`);
  }
  return errs;
}
