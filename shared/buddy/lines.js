// What Sloppo says. One pool per mood; the same line never comes up twice in a row. The words are keys
// (ui.buddy.say.<pool>_<n>, shared/i18n/ui/<code>/buddy2.js), read in the chosen language each time he speaks.
const COUNT = {
  hello: 5, pet: 10, thrown: 6, ouch: 5, annoyed: 5, dizzy: 5, rage: 6, calm: 5, chaos: 4, eat: 5, bite: 4, knock: 5,
  blast: 5, hole: 4, stillmad: 4, shake: 5, woozy: 4, giggle: 4, snack: 4, hug: 3, spit: 4, nopets: 3, calmed: 3,
  power: 3, tipsoff: 2, fall: 6, idle: 8, level: 3, restore: 3, poke: 5, offpage: 3, askcandy: 4, candymade: 3,
  candyyes: 3, repair: 4,
};
/** The keys of each pool: LINES.hello = ['ui.buddy.say.hello_1', …]. */
export const LINES = Object.fromEntries(Object.entries(COUNT).map(([k, n]) => [k, Array.from({ length: n }, (_, i) => `ui.buddy.say.${k}_${i + 1}`)]));

/** A buddy word in the chosen language (shared/i18n/i18n.js). */
export const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
/** A pool's lines as they read now. */
export const pool = (kind) => (LINES[kind] || LINES.idle).map((k) => tr(k));

let last = '';
const lastOf = {};
/** A random line from a pool, never the line said last. */
export function line(kind) {
  const keys = LINES[kind] || LINES.idle;
  const choices = keys.filter((l) => l !== last && l !== lastOf[kind]);
  const l = (choices.length ? choices : keys)[Math.floor(Math.random() * (choices.length || keys.length))];
  last = l;
  lastOf[kind] = l;
  return tr(l);
}
