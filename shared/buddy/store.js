// XP, levels and hats. XP lives in localStorage; level = 1 + floor(sqrt(xp / 8)).
const KEY = 'slop.mascot.v1';

/** One new hat per level, in unlock order (drawn in hats.js). */
export const HAT_ORDER = ['sprout', 'party', 'beanie', 'bow', 'headphones', 'cowboy', 'chef', 'pirate', 'tophat',
  'viking', 'wizard', 'ninja', 'knight', 'gradcap', 'propeller', 'catears', 'halo', 'crown'];
/** A hat's name in the chosen language (ui.buddy.hat.<id>, shared/i18n/ui/<code>/buddy.js); no hat reads ui.buddy.hat.none. */
export const hatLabel = (h) => { const I = globalThis.SlopI18n, k = 'ui.buddy.hat.' + (h || 'none'); return !h || HAT_ORDER.includes(h) ? (I ? I.t(k) : k) : h; };

export const levelFor = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 8));
/** XP needed to reach a level. */
export const xpFor = (lv) => 8 * (lv - 1) * (lv - 1);
export const hatsFor = (lv) => HAT_ORDER.slice(0, Math.max(0, lv - 1));
/** He grows a little each level, up to +45%. */
export const scaleFor = (lv) => 1 + Math.min(0.45, (lv - 1) * 0.06);

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    const xp = Math.max(0, Math.floor(+d.xp || 0));
    const hats = hatsFor(levelFor(xp));
    const hat = d.hat === null ? null : hats.includes(d.hat) ? d.hat : hats[hats.length - 1] || null;
    const rage = Math.max(0, Math.min(3, +d.rage || 0));
    return { xp, hat, rage, fav: d.fav || null, hate: d.hate || null, stock: d.stock || {} };
  } catch (e) { return { xp: 0, hat: null, rage: 0, fav: null, hate: null, stock: {} }; }
}
/** Merge fields into the saved state. */
export function save(d) {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY) || '{}');
    localStorage.setItem(KEY, JSON.stringify(Object.assign(cur, d)));
  } catch (e) { /* private mode: progress lasts this visit */ }
}
