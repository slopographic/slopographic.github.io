// Property lists for the iPhone and iPad app's Xcode project (Info.plist, App.entitlements): values written as plist XML
// and keys set in an existing plist, whatever their type. Pure; used by mobile/ios/capacitor.mjs (patch).
//   plistValue(v, depth)     a string, boolean, number, array or object as plist XML (tabs to depth)
//   patchPlist(xml, keys)    the plist with each key set: an existing key's value (any type) is replaced, a new key goes
//                            before the last </dict>
//   plistDoc(keys)           a whole plist document holding keys (an .entitlements file)
// Node only. Tests: tests/node/mobile-ios-files.test.mjs.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** v as plist XML. Nested arrays and dicts are indented with tabs, one level deeper than depth. */
export function plistValue(v, depth = 1) {
  const pad = '\t'.repeat(depth), inner = '\t'.repeat(depth + 1);
  if (typeof v === 'boolean') return v ? '<true/>' : '<false/>';
  if (typeof v === 'number') return Number.isInteger(v) ? `<integer>${v}</integer>` : `<real>${v}</real>`;
  if (Array.isArray(v)) return v.length ? `<array>\n${v.map((x) => inner + plistValue(x, depth + 1)).join('\n')}\n${pad}</array>` : '<array/>';
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    return ks.length ? `<dict>\n${ks.map((k) => `${inner}<key>${esc(k)}</key>\n${inner}${plistValue(v[k], depth + 1)}`).join('\n')}\n${pad}</dict>` : '<dict/>';
  }
  return `<string>${esc(v)}</string>`;
}

/** Where the value element that starts at i ends (after its closing tag), counting nested arrays and dicts. */
function valueEnd(xml, i) {
  const open = /^<(\w+)(\/?)>/.exec(xml.slice(i));
  if (!open) return -1;
  if (open[2]) return i + open[0].length;                     // <true/>, <array/>
  const tag = open[1];
  if (tag !== 'array' && tag !== 'dict') { const c = xml.indexOf(`</${tag}>`, i); return c < 0 ? -1 : c + tag.length + 3; }
  const re = /<(\/?)(array|dict)(\/?)>/g;
  re.lastIndex = i;
  let level = 0, m;
  while ((m = re.exec(xml))) {
    if (m[3]) continue;                                       // an empty <array/> inside
    level += m[1] ? -1 : 1;
    if (level === 0) return m.index + m[0].length;
  }
  return -1;
}

/** The top-level dict's key positions: a key inside a nested dict is never matched. */
function topKey(xml, k) {
  const start = xml.indexOf('<dict>');
  const re = /<key>([^<]*)<\/key>\s*/g;
  re.lastIndex = start + 6;
  let m;
  while ((m = re.exec(xml))) {
    const at = m.index + m[0].length, end = valueEnd(xml, at);
    if (end < 0) return null;
    if (m[1] === esc(k)) return { at, end };
    re.lastIndex = end;
  }
  return null;
}

/** xml with every key in keys set (strings, booleans, numbers, arrays, dicts). */
export function patchPlist(xml, keys) {
  let out = xml;
  for (const [k, v] of Object.entries(keys)) {
    const hit = topKey(out, k), val = plistValue(v, 1);
    if (hit) out = out.slice(0, hit.at) + val + out.slice(hit.end);
    else { const i = out.lastIndexOf('</dict>'); out = `${out.slice(0, i)}\t<key>${esc(k)}</key>\n\t${val}\n${out.slice(i)}`; }
  }
  return out;
}

/** A complete plist document with keys (an .entitlements file). */
export function plistDoc(keys) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + `<plist version="1.0">\n${plistValue(keys, 0)}\n</plist>\n`;
}
