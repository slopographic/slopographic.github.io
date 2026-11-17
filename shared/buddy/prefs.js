// The buddy's switches, kept in localStorage under "slop.buddy":
//   { global: bool|undefined, apps: { <appId>: bool }, btn: { right, bottom }, tips: bool }
export const PREFS_KEY = 'slop.buddy';
export function getPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return Object.assign({ apps: {} }, p, { apps: p.apps || {} }); }
  catch (e) { return { apps: {} }; }
}
export function setPrefs(patch) {
  const p = Object.assign(getPrefs(), patch);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  return p;
}
/** Is the buddy on for this app? Per-app choice, else the last choice made in any app, else the page default. */
export function isOn(app, fallback) {
  const p = getPrefs();
  if (typeof p.apps[app] === 'boolean') return p.apps[app];
  if (app !== 'home' && typeof p.global === 'boolean') return p.global;
  return !!fallback;
}
export function remember(app, on) {
  const p = getPrefs();
  p.apps[app] = on;
  return setPrefs(app === 'home' ? { apps: p.apps } : { apps: p.apps, global: on });
}
