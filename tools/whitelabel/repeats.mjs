// Mapping artefacts: a word written twice in a row that the source did not repeat. The plain names map a source name to a
// common word, so "your Slop Drive files" can become "your Files files" (Slop Drive -> Files); a profile's own `copy`
// then words the sentence again. The build compares each text file before and after the rename and reports every
// repeated pair the rename made (more of "files files" than the source had), with the line it is on.
//   repeatCounts(text)          Map 'files files' (lower case) -> how often a word directly follows itself
//   newRepeats(src, out, file)  [{ file, pair, line }] for each pair the rename added, one per line it is on
//   repeatReport(list, max)     the lines a build prints
// Node only. Tests: tests/node/whitelabel-repeats.test.mjs.

/** A word (letters, two or more) right after the same word, across spaces or one line break; any case. */
const RE = /(?<![\p{L}\p{N}_'’-])(\p{L}{2,})(?:[ \t ]+|[ \t]*\r?\n[ \t]*)\1(?![\p{L}\p{N}_'’-])/giu;

/** Words a sentence may repeat on purpose in every language the site has ("that that" is rare but right). Short on purpose:
 * a pair the source already repeats is never reported anyway. */
const FINE = new Set(['that that', 'had had', 'is is']);

export function repeatCounts(text) {
  const out = new Map();
  if (!text || text.length > 4e6) return out;
  for (const m of text.matchAll(RE)) {
    const pair = m[0].toLowerCase().replace(/\s+/g, ' ');
    if (FINE.has(pair)) continue;
    out.set(pair, (out.get(pair) || 0) + 1);
  }
  return out;
}

/** The repeated pairs out has more of than src (the rename made them), each with the trimmed line it is on (once per line). */
export function newRepeats(src, out, file = '') {
  const before = repeatCounts(src), after = repeatCounts(out), found = [];
  for (const [pair, n] of after) {
    if (n <= (before.get(pair) || 0)) continue;
    const seen = new Set();
    for (const line of out.split('\n')) {
      const hits = [...line.matchAll(RE)].map((m) => m[0].toLowerCase().replace(/\s+/g, ' '));
      if (!hits.includes(pair) || seen.has(line)) continue;
      seen.add(line);
      const at = line.toLowerCase().indexOf(pair.split(' ')[0] + ' ');
      found.push({ file, pair, line: line.slice(Math.max(0, at - 60), at + pair.length + 60).trim() });
    }
    if (!seen.size) found.push({ file, pair, line: '' });   // the pair spans a line break
  }
  return found;
}

export function repeatReport(list, max = 40) {
  if (!list.length) return 'repeated words: none made by the rename';
  const lines = [`repeated words: ${list.length} made by the rename (word the sentence again in the profile's copy)`];
  for (const r of list.slice(0, max)) lines.push(`  ${r.file}: "${r.pair}"  ${r.line}`);
  if (list.length > max) lines.push(`  … and ${list.length - max} more`);
  return lines.join('\n');
}
