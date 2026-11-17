// The word rule of the content checks, in one place: a forbidden term counts wherever it occurs, inside a longer word
// too, unless that whole word is one of the allowed words (keep). The white-label leak scan (tools/whitelabel/scan.mjs,
// with its own keep list) and the repository content check (check.mjs, with the keep list of its rules) both use it.
// Plain string functions. Tests: tests/node/content-check.test.mjs, tests/node/whitelabel-scan.test.mjs.

/** The matches of the terms in one string: [{ term, index, word }]. terms and keep are lower case; the string is matched
 * without regard to ASCII case, and index is the match's position in it. word: the whole word the term is part of
 * (letters to the left; to the right, letters of the match's own case, so a camelCase word ends where the next part
 * starts: termX). A match whose whole word is in keep is skipped. */
export function findWords(s, terms, keep = []) {
  const out = [];
  const lower = s.replace(/[A-Z]+/g, (c) => c.toLowerCase());   // ASCII only: the same length, so indices match s
  for (const t of terms) {
    if (!t) continue;
    let i = -1;
    while ((i = lower.indexOf(t, i + 1)) >= 0) {
      let a = i, b = i + t.length;
      const m = s.slice(i, i + t.length), head = m === m.toUpperCase() ? /[A-Z]/ : m[0] === m[0].toUpperCase() ? null : /[a-z]/;
      while (head && a > 0 && head.test(s[a - 1])) a--;
      const tail = m === m.toUpperCase() ? /[A-Z]/ : /[a-z]/;
      while (b < s.length && tail.test(s[b])) b++;
      const word = s.slice(a, b);
      if (keep.includes(word.toLowerCase())) continue;
      out.push({ term: t, index: i, word });
    }
  }
  return out;
}
