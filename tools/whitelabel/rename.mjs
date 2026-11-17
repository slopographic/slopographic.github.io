// The white-label renamer: pure text functions the build (tools/whitelabel/build.mjs) runs over every text file and
// every path of the site, so a profile's copy carries none of the source brand's names. Three passes, in this order:
//   1. urls(text)    the source site's links (its origin, its GitHub account, its mail domain) become the profile's
//   2. phrases(text) visible names in prose ("Slop Drive", "PhotoSlop", the brand name) become the profile's plain ones;
//                    a name written as code (window.SlopClean, new PhotoSlop) is left to pass 3
//   3. tokens(text)  every remaining identifier, key, class, comment word and file name with the brand stem is renamed
//                    through the profile's rename map, keeping its case: SlopUI -> TlbxUI, SLOP_APPS -> TLBX_APPS
// Passes 1 and 2 are profile content (one way). Pass 3 is a bijection: reverseTokens() undoes it exactly, because the
// map's targets never occur in the source (checkMap() proves it for a given tree). tools/whitelabel/import.mjs uses the
// reverse to bring a change made in a mirror back here.
// English words that contain the stem (slope, sloped, sloppy...) are never touched: see KEEP.
// Node only. Tests: tests/node/whitelabel-rename.test.mjs.

/** English words that contain the brand stem. The renamer skips them and the scan allows them. */
export const KEEP = ['slope', 'slopes', 'sloped', 'sloping', 'sloppy', 'sloppily', 'sloppiness'];
const KEEP_RE = new RegExp(`^(?:${KEEP.join('|')})$`, 'i');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pass 1. map: { origin: 'https://tools.example.com', github: 'example', repo: 'example/tools', mail: 'example.com' }.
 * The site's own repository becomes the mirror's (repo); the other repositories of the account keep their names. */
export function urls(text, map) {
  const host = map.origin.replace(/^https?:\/\//, '');
  const re = (s) => s.replace(/[./]/g, (c) => '\\' + c);   // the same address inside a regular expression
  return text
    .replace(/https?:\\\/\\\/(?:www\\\.)?slopographic\\\.com/g, re(map.origin))
    .replace(/@slopographic\\\.com/g, '@' + re(map.mail))
    .replace(/github\\\.com\\\/slopographic\\\/apps\b/g, 'github\\.com\\/' + re(map.repo || `${map.github}/apps`))
    .replace(/(githubusercontent\\\.com|github\\\.com|gh)\\\/slopographic\\\//g, (m, a) => `${a}\\/${re(map.github)}\\/`)
    .replace(/(https?):\/\/(www\.)?slopographic\.(?:com|github\.io)/g, (m, s, w) => `${s}://${w || ''}${host}`)   // scheme and www kept
    .replace(/wss:\/\/mcp\.slopographic\.com/g, `wss://mcp.${host}`)
    .replace(/github\.com\/slopographic\/apps\b/g, `github.com/${map.repo || map.github + '/apps'}`)
    .replace(/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net\/gh|github\.com)\/slopographic\b/g, `$1/${map.github}`)
    .replace(/github:slopographic\//g, `github:${map.github}/`)
    .replace(/(?<![\w./-])slopographic\/apps\b/g, map.repo || `${map.github}/apps`)
    .replace(/(?<![\w./-])slopographic\/(cdn|claude-plugin)\b/g, `${map.github}/$1`)
    .replace(/slopographic\/slopographic\.github\.io/g, `${map.github}/${map.github}.github.io`)
    .replace(/https:\/\/[\w.-]*\b(?:x\.com|patreon\.com|reddit\.com|tiktok\.com)\/[^\s"'<>)]*[Ss]lopographic[^\s"'<>)]*/g, map.origin + '/')
    .replace(/https:\/\/slopographic\.gumroad\.com[^\s"'<>)]*/g, map.origin + '/')
    .replace(/@slopographic\.com\b/g, '@' + map.mail)
    .replace(/340656300\+slopographic@users\.noreply\.github\.com/g, `${map.github}@users.noreply.github.com`)
    .replace(/\bslopographic\.(?:com|github\.io)\b/g, host);
}

/** Pass 2. pairs: [[from, to], ...]; longer names first so "Slop Drive Trash" wins over "Slop Drive". A name is prose when
 * it is not glued to code: no identifier character, dot, dash, slash or @ before it; no identifier character, dash or @
 * after it; not followed by .name, ( or [ (a property or a call) or an assignment; and not after `new `.
 * Two last rules: a leftover "Slop " before a capitalised word is dropped ("Slop Hub" -> "Hub"), and "Slop" before a
 * lower-case word becomes the profile's brand word ("the Slop apps" -> "the Acme apps"). */
export function phraseRules(pairs, brandWord) {
  const rules = [...pairs].filter(([f]) => f).sort((a, b) => b[0].length - a[0].length)
    .map(([from, to]) => {
      // a name of several words may follow a slash (a regular expression); any name may follow an escape (\n)
      const glue = from.includes(' ') ? '[\\w$.\\-@]' : '[\\w$.\\-/@]';
      const before = /^\w/.test(from) ? `(?:(?<!${glue})|(?<=\\\\[ntr]))(?<!\\bnew )` : '';
      const after = /\w$/.test(from) ? '(?![\\w$\\-@])(?!\\.[A-Za-z_$])(?![(\\[])(?!\\s*=[^=>])' : '';
      return [new RegExp(before + escRe(from) + after, 'g'), to];
    });
  rules.push([/(?:(?<![\w$.\-/@])|(?<=\\[ntr]))Slop (?=[A-Z0-9])/g, '']);
  if (brandWord) rules.push([/(?<![\w$.\-/@])Slop(?= [a-z]|['’]s\b)/g, brandWord]);
  return rules;
}
export function phrases(text, rules) {
  for (const [re, to] of rules) text = text.replace(re, to);
  return text;
}

/* The case forms a name can take, and the same form of another name. */
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const low1 = (s) => s[0].toLowerCase() + s.slice(1);
function forms(lower, camel) {
  const out = [lower, lower.toUpperCase(), cap(lower)];
  if (camel) out.push(camel, low1(camel));
  return out;
}

/** The rename map of a profile, as ordered [source, target] string pairs (every case form), plus the path forms.
 * map: { stem: ['slop', 'tlbx'], compounds: [{ from: 'photoslop', to: 'imageeditor', fromCamel: 'PhotoSlop',
 *        toCamel: 'ImageEditor', path: 'image-editor' }, ...] } */
export function mapPairs(map) {
  const pairs = [], paths = [];
  const add = (a, b) => { const fa = forms(...a), fb = forms(...b); fa.forEach((f, i) => { if (!pairs.some(([x]) => x === f)) pairs.push([f, fb[i]]); }); };
  for (const c of map.compounds) {
    add([c.from, c.fromCamel], [c.to, c.toCamel || (c.fromCamel ? cap(c.to) : null)]);
    if (c.path) paths.push([c.from, c.path]);
  }
  add([map.stem[0]], [map.stem[1]]);
  return { pairs, paths };
}

function compile(pairs, paths, keep) {
  const all = [...pairs].sort((a, b) => b[0].length - a[0].length);
  const to = new Map(all);
  const pathTo = new Map(paths);
  const alt = [...new Set([...paths.map((p) => p[0]), ...all.map((p) => p[0])])].sort((a, b) => b.length - a.length).map(escRe).join('|');
  return { re: new RegExp(alt, 'g'), to, pathTo, keep };
}
/** Pass 3 rules (forward) and their inverse. */
export function tokenRules(map) {
  const { pairs, paths } = mapPairs(map);
  return compile(pairs, paths, map.stem[0]);
}
export function reverseRules(map) {
  const { pairs, paths } = mapPairs(map);
  return compile(pairs.map(([a, b]) => [b, a]), paths.map(([a, b]) => [b, a]), null);
}

/** The word around offset i in s (letters only), to check it against KEEP. */
function wordAt(s, i, len) {
  let a = i, b = i + len;
  const m = s.slice(i, i + len);   // the word is one camel hump: slopeX, getSlope and SLOPE_X stop at the case change
  const head = m === m.toUpperCase() ? /[A-Z]/ : m[0] === m[0].toUpperCase() ? null : /[a-z]/;
  while (head && a > 0 && head.test(s[a - 1])) a--;
  const tail = s.slice(i, i + len) === s.slice(i, i + len).toUpperCase() ? /[A-Z]/ : /[a-z]/;   // SLOPE stays SLOPE
  while (b < s.length && tail.test(s[b])) b++;
  return s.slice(a, b);
}

/** Runs a rule set over a text. A lower-case compound followed by a slash takes its path form (a folder name). */
export function tokens(text, rules) {
  rules.re.lastIndex = 0;
  return text.replace(rules.re, (m, off, s) => {
    if (rules.keep && m.toLowerCase() === rules.keep && KEEP_RE.test(wordAt(s, off, m.length))) return m;
    if (rules.pathTo.has(m) && s[off + m.length] === '/') return rules.pathTo.get(m);
    if (rules.to.has(m)) return rules.to.get(m);
    return m;
  });
}
export const reverseTokens = tokens;

/** One path (posix, relative): folder names take the path form, file names the token form. */
export function renamePath(p, rules) {
  const segs = p.split('/');
  return segs.map((seg, i) => (i < segs.length - 1 && rules.pathTo.has(seg) ? rules.pathTo.get(seg) : tokens(seg, rules))).join('/');
}

/** All three passes, as the build runs them on one text file. */
export function renameText(text, ctx) {
  let t = urls(text, ctx.urls);
  t = phrases(t, ctx.phraseRules);
  return tokens(t, ctx.tokenRules);
}

/** The map's targets that already occur in a text (case-sensitive, every form): each one would make the reverse
 * ambiguous, so the build refuses the map. Returns [target, count] pairs. */
export function collisions(text, map) {
  const { pairs, paths } = mapPairs(map);
  const out = [];
  for (const t of new Set([...pairs.map((p) => p[1]), ...paths.map((p) => p[1])])) {
    let n = 0, i = -1;
    while ((i = text.indexOf(t, i + 1)) >= 0) n++;
    if (n) out.push([t, n]);
  }
  return out;
}
