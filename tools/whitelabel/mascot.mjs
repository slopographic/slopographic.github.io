// A profile's own mascot: "mascot": { "overlay": "<folder>", "name": "...", "files": [...], "icon": true, "holder"?: "...",
// "trademarks"?: [...], "size"?: { "desktop": <px tall>, "phone": <px tall> }, "roam"?: true | "float" | "hop" } (holder:
// who owns the character when it is not legal.holder; trademarks: the names that owner claims, default the mascot's name;
// size and roam: how big the slot draws it and whether it roams the page, shared/mascot/slot.js). The overlay
// folder (relative to the profiles folder; kept with the profile, outside this repository for real brands) holds the
// mascot's ES modules, which the build copies to brand/mascot/ for the mascot slot (shared/mascot/slot.js; the contract
// is described there). Every file of the folder must be in "files" and every listed file must exist: LICENSE-ART lists
// them, so the licence never misses one. With "icon" (default on), the favicon, the header mark and the app icons are
// drawn by the overlay's icon.js: the small drawing at 16 and 24 px, the full one from 32 px.
// Node only. Tests: tests/node/whitelabel-mascot-slot.test.mjs.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where the overlay lands in a build. */
export const DEST = 'brand/mascot';
/** The modules every overlay has (slot.js loads them by these names). */
export const REQUIRED = ['mascot.js', 'icon.js'];
/** The build's files drawn from the overlay's icon (they are the character's art too). */
export const ICON_FILES = ['brand/mark.svg', 'brand/logo.svg', 'favicon.svg', 'favicon.ico', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'og-share.png'];

/** The roaming styles of the mascot slot (shared/mascot/roam.js); true is the first. */
export const ROAM = ['float', 'hop'];
/** The slot's profile markers (shared/mascot/slot.js OPTIONS): the size on a desktop and a phone, the roaming style.
 * Undefined (no overlay, or the field unset) keeps the source's literal: the default size, no roaming. */
export function slotMarkers(p) {
  const m = hasOverlay(p) ? p.mascot : {}, size = m.size || {};
  return { mascotDesktop: size.desktop, mascotPhone: size.phone, mascotRoam: m.roam === true ? ROAM[0] : m.roam || undefined };
}

export const hasOverlay = (p) => !!(p.mascot && typeof p.mascot === 'object' && p.mascot.overlay);
const iconOn = (p) => hasOverlay(p) && p.mascot.icon !== false;

/** Problems with a profile's mascot field (validate() in profile.mjs adds them to its own). */
export function mascotProblems(m) {
  if (typeof m === 'boolean') return [];
  if (!m || typeof m !== 'object') return ['mascot: true, false or { overlay, name, files }'];
  const errs = [];
  if (typeof m.overlay !== 'string' || !m.overlay.trim()) errs.push('mascot.overlay: the overlay folder, relative to the profiles folder');
  if (typeof m.name !== 'string' || !m.name.trim()) errs.push("mascot.name: the mascot's name (LICENSE-ART, TRADEMARKS)");
  if (!Array.isArray(m.files) || !m.files.length || !m.files.every((f) => typeof f === 'string' && /^[\w.-]+(\/[\w.-]+)*$/.test(f))) errs.push('mascot.files: every file of the overlay, relative to it');
  if (m.icon !== undefined && typeof m.icon !== 'boolean') errs.push('mascot.icon: true or false');
  if (m.holder !== undefined && (typeof m.holder !== 'string' || !m.holder.trim())) errs.push("mascot.holder: the character's owner");
  if (m.trademarks !== undefined && !(Array.isArray(m.trademarks) && m.trademarks.every((t) => typeof t === 'string' && t.trim()))) errs.push('mascot.trademarks: the names its owner claims');
  const px = (v) => v === undefined || (Number.isInteger(v) && v >= 32 && v <= 360);
  if (m.size !== undefined && !(m.size && typeof m.size === 'object' && !Array.isArray(m.size) && Object.keys(m.size).every((k) => k === 'desktop' || k === 'phone') && px(m.size.desktop) && px(m.size.phone))) errs.push('mascot.size: { desktop, phone }, whole px tall (32 to 360)');
  if (m.roam !== undefined && !(typeof m.roam === 'boolean' || ROAM.includes(m.roam))) errs.push(`mascot.roam: true, false or ${ROAM.map((r) => `"${r}"`).join(' or ')}`);
  return errs;
}

/** The overlay folder of a profile (absolute), or null. */
export const overlayDir = (profilesDir, p) => (hasOverlay(p) ? path.resolve(profilesDir, p.mascot.overlay) : null);

/** Every file below dir, relative, sorted. */
export function filesIn(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesIn(dir, r)); else out.push(r);
  }
  return out.sort();
}

/** Problems with the overlay folder against the profile's list (missing folder, required modules, unlisted or missing files). */
export function overlayProblems(dir, p) {
  if (!dir) return [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [`mascot.overlay: no folder ${dir}`];
  const have = filesIn(dir), listed = p.mascot.files || [];
  const errs = REQUIRED.filter((f) => !have.includes(f)).map((f) => `mascot overlay: no ${f}`);
  for (const f of have) if (!listed.includes(f)) errs.push(`mascot.files: ${f} is in the overlay but not listed (LICENSE-ART would miss it)`);
  for (const f of listed) if (!have.includes(f)) errs.push(`mascot.files: ${f} is listed but not in the overlay`);
  return errs;
}

/** The overlay's icon drawings, rendered by its icon.js in a child Node process: { full, small } SVG markup. */
export function overlayIcons(dir) {
  const url = pathToFileURL(path.join(dir, 'icon.js')).href;
  const code = `import(${JSON.stringify(url)}).then((m) => process.stdout.write(JSON.stringify({ full: m.svg(64, false), small: m.svg(16, true) })))`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }));
}

/** The build's paths of the character's files: the overlay as copied, then the icons drawn from it. */
export function artFiles(p) {
  if (!hasOverlay(p)) return [];
  return p.mascot.files.map((f) => `${DEST}/${f}`).concat(iconOn(p) ? ICON_FILES : []);
}

const quoted = (names) => names.map((n) => `"${n}"`).join(', ');
/** Who owns the character: mascot.holder, else the profile's legal holder. */
export const artHolder = (p) => (hasOverlay(p) && p.mascot.holder) || p.legal.holder;

/** Scan allowances for a character owned by someone else than the site: its owner's name may stand in the character's own
 * files and the notices (and nowhere else). Reported by the scan like every allowance. */
export function artAllow(p) {
  if (!hasOverlay(p) || !p.mascot.holder || p.mascot.holder === p.legal.holder) return [];
  const term = p.mascot.holder.toLowerCase(), why = `the ${p.mascot.name} character belongs to ${p.mascot.holder} (its copyright and trademark lines)`;
  return p.mascot.files.map((f) => `${DEST}/${f}`).concat(['LICENSE-ART', 'NOTICE.md', 'TRADEMARKS.md']).map((file) => ({ file, term, why }));
}
/** The names a profile claims: legal.trademarks, else its product name. */
export const marks = (p) => (p.legal && Array.isArray(p.legal.trademarks) && p.legal.trademarks.length ? p.legal.trademarks : [p.name]);

/** LICENSE-ART: the character's files, all rights reserved, outside the MIT License. */
export function licenseArt(p) {
  const holder = artHolder(p), year = p.legal.year, n = p.mascot.name;
  return `${n} artwork licence

Copyright (c) ${year} ${holder}. All rights reserved.

The ${n} character - its drawings, 3D model, expressions, animations and icons - is the property of ${holder}. The files
listed below are not covered by the MIT License in LICENSE. You may not copy, modify or redistribute them, alone or as
part of a copy or fork of this repository, without written permission from ${holder}. A fork must remove them and use
its own mascot.

Files:
${artFiles(p).map((f) => `  ${f}`).join('\n')}
`;
}

/** The NOTICE.md item about the character (empty without an overlay). */
export const artNotice = (p) => (hasOverlay(p)
  ? `3. The ${p.mascot.name} character. Its art, 3D model, animations and icons (the files listed in [\`LICENSE-ART\`](LICENSE-ART))
   are copyright ${p.legal.year} ${artHolder(p)}, all rights reserved. The MIT License does not cover them.\n` : '');

/** The TRADEMARKS.md text: the names, their logos and the character design, each with its owner. */
export function artTrademarks(p) {
  const holder = p.legal.holder, names = marks(p), logos = names.length > 1 ? 'their logos' : 'its logo';
  let what = `${quoted(names)} and ${logos} belong to ${holder}.`, owners = holder;
  if (hasOverlay(p)) {
    const ah = artHolder(p), am = p.mascot.trademarks || [p.mascot.name], design = `their logos and the ${p.mascot.name} character design`;
    if (ah === holder) what = `${quoted([...new Set(names.concat(am))])}, ${design} are trademarks of ${holder}.`;
    else { what += ` ${quoted(am)}, ${design} are trademarks of ${ah}.`; owners = `${holder} or ${ah}`; }
  }
  const fork = hasOverlay(p) ? 'a different name, logo and mascot' : 'a different name and logo';
  return `${what} The code is MIT (see \`LICENSE\`), but the MIT License grants no trademark rights to the names, the logos${hasOverlay(p) ? ' or the character' : ''}.
You may refer to the product by name, link to it and write about it. A copy or fork you publish must use ${fork}, and
must not suggest that ${owners} made or endorses it.`;
}
