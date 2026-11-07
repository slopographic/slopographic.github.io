/* Slop Code: per-viewer preferences in localStorage, each in a versioned envelope { v: 1, data }. Every read and
 * write is in try/catch: when storage is blocked or full, the defaults apply and nothing is kept. Keys:
 * slop-code.layout (sidebar width and collapsed sections) and slop-code.extensions (the helper toggles). */
const PREFIX = 'slop-code.';
const V = 1;

/** The data saved under `name`, or `fallback` when there is none, the version differs, or storage fails. */
export function readPref(name, fallback) {
  try {
    const env = JSON.parse(localStorage.getItem(PREFIX + name) || 'null');
    if (env && env.v === V && env.data && typeof env.data === 'object') return env.data;
  } catch (e) { /* defaults below */ }
  return fallback;
}

/** Save `data` under `name`. Returns false when it could not be kept. */
export function writePref(name, data) {
  try { localStorage.setItem(PREFIX + name, JSON.stringify({ v: V, data })); return true; } catch (e) { return false; }
}

/* The built-in helpers (Extensions panel). Each is on by default. */
export const HELPER_IDS = ['formatter', 'languageMode', 'snippets'];
const helpers = Object.fromEntries(HELPER_IDS.map((id) => [id, true]));
const saved = readPref('extensions', {});
for (const id of HELPER_IDS) if (typeof saved[id] === 'boolean') helpers[id] = saved[id];

export const helperOn = (id) => !!helpers[id];
export function setHelperOn(id, on) {
  if (!HELPER_IDS.includes(id)) return;
  helpers[id] = !!on;
  writePref('extensions', { ...helpers });
}
