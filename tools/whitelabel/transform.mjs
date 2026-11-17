// One text file of the site, turned into its white-label copy, and back: the steps build.mjs runs on every text file
// (forward) and the steps import.mjs runs on a change made in a mirror (back). Every step keeps the line count, so a
// line of a mirror file is the image of the same line of the source file (where the build did not regenerate it).
// Node only. Tests: tests/node/whitelabel-import.test.mjs, tests/node/whitelabel-roundtrip.test.mjs.
import { urls, phraseRules, phrases, tokenRules, reverseRules, tokens, renamePath } from './rename.mjs';
import { phrasePairs } from './profile.mjs';
import { markerValues, applyMarkers } from './emit.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { remapColors, paletteFile, colorKeys, TEST_FILE } from './palette.mjs';
import { ENV } from './history-git.mjs';   // without a git hook's GIT_DIR, which would list the hook's repository

/** Everything the steps need for one profile and its rename map. */
export function context(root, p, map) {
  const pairs = phrasePairs(root, p), values = markerValues(p), rules = tokenRules(map);
  // the app ids a marker names are renamed like the registry's own (a source id never reaches a build)
  for (const k of ['hideApps', 'mainApp']) values[k] = JSON.parse(tokens(JSON.stringify(values[k]), rules));
  values.seoLenient = true;   // renamed copy: its SEO lengths only warn, wherever its SEO writer runs (tools/seo/head.mjs)
  return {
    root, profile: p, map, pairs,
    urls: { origin: p.origin, github: p.github, repo: p.publish && p.publish.repo, mail: p.mailDomain || p.cname },
    phraseRules: phraseRules(pairs, p.brandWord || p.name),
    tokenRules: rules, reverseRules: reverseRules(map), values,
  };
}

/** The profile's content steps (one way): links, visible names. Their result is what the token pass renames. */
export const profileText = (text, ctx) => phrases(urls(text, ctx.urls), ctx.phraseRules);

/** The colours the site's own files use (every palette file outside tests/ that git lists), read once per context. */
export function siteColors(ctx) {
  if (ctx._siteColors) return ctx._siteColors;
  let files = [];
  try { files = execFileSync('git', ['ls-files', '-z'], { cwd: ctx.root, encoding: 'utf8', maxBuffer: 1 << 28, env: ENV }).split('\0'); } catch (e) { /* not a checkout: no site colours */ }
  files = files.filter((f) => f && paletteFile(f) && !TEST_FILE.test(f) && existsSync(path.join(ctx.root, f)));
  ctx._siteColors = colorKeys(files.map((f) => readFileSync(path.join(ctx.root, f), 'utf8')));
  return ctx._siteColors;
}
/** The palette step of one file: a test file moves only the site's own colours (palette.mjs TEST_FILE). */
const palette = (t, ctx, dest) => remapColors(t, ctx.profile.palette, TEST_FILE.test(dest) ? siteColors(ctx) : null);

/** The whole forward step for one file (dest: its path in the copy, for the palette rule). */
export function forward(text, ctx, dest) {
  let t = tokens(profileText(text, ctx), ctx.tokenRules);
  if (ctx.profile.palette && paletteFile(dest)) t = palette(t, ctx, dest);
  // markers after the palette: the profile's own colours (its theme tokens) are written as the profile gives them
  return applyMarkers(t, ctx.values).replace(/brand\/logo(?:-128)?\.webp/g, 'brand/mark.svg');
}

/** A source path in the copy, and a copy path back in the source. */
export const forwardPath = (file, ctx) => renamePath(file, ctx.tokenRules);
export const backPath = (file, ctx) => renamePath(file, ctx.reverseRules);

/** Lines that hold the profile's own words cannot be turned back by rule (the source said something else there). */
export function profileWords(ctx) {
  const p = ctx.profile, host = p.origin.replace(/^https:\/\//, '');
  return [p.name, host, ...(p.brandTerms || [])].filter(Boolean);
}

/** One line of a mirror file, back in source terms. old: the source lines the mirror's old lines came from (the same
 * place), used to put a source word back where the profile's step replaced it (a name, a link, a marker value, a colour).
 * Returns { line, sure }: sure when the forward step of the result gives the mirror line back exactly. */
export function backLine(mirrorLine, old, ctx, dest) {
  const fwd = (s) => forward(s, ctx, dest);
  let line = tokens(mirrorLine, ctx.reverseRules);
  const oldText = old.join('\n');
  const pairs = sourcePairs(oldText, ctx, dest).filter(([src, dst]) => dst && src !== dst && !oldText.includes(dst));
  for (const [src, dst] of pairs.sort((a, b) => b[1].length - a[1].length)) {
    if (!line.includes(dst)) continue;
    const next = line.split(dst).join(src);
    if (fwd(next) === mirrorLine) line = next;
  }
  return { line, sure: fwd(line) === mirrorLine };
}

/** [source text, what the profile's steps made of it] for everything in the old lines that the steps change. */
function sourcePairs(oldText, ctx, dest) {
  const out = ctx.pairs.filter(([src]) => oldText.includes(src));
  for (const m of oldText.matchAll(/https?:\/\/[^\s"'<>)]+/g)) out.push([m[0], urls(m[0], ctx.urls)]);
  for (const m of oldText.matchAll(/\/\*profile:\w+\*\/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|true|false|null|-?\d+|\[\]|\{\})/g)) out.push([m[0], applyMarkers(m[0], ctx.values)]);
  for (const m of oldText.matchAll(/brand\/logo(?:-128)?\.webp/g)) out.push([m[0], 'brand/mark.svg']);
  if (ctx.profile.palette && paletteFile(dest)) {
    for (const m of oldText.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g)) out.push([m[0], palette(m[0], ctx, dest)]);
  }
  return out;
}
