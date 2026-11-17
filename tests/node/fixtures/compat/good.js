/* compat-check fixture: code that passes. The names below only appear in comments and strings:
   for await (const chunk of res.body), Promise.withResolvers(), new Set().union(b). */
async function read(res, onChunk) {
  await SlopCompat.readStream(res.body, onChunk);
  const msg = 'use Promise.withResolvers() or for await (const c of res.body) elsewhere';
  const tpl = `Object.groupBy(${msg.length}) is newer`;
  const re = /for await \(x of res\.body\)/;
  // compat-ok: guarded by the typeof test on the line below, with a setTimeout fallback
  const later = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 200);
  const idle = window.requestIdleCallback ? requestIdleCallback(() => 0) : 0;
  if (typeof Promise.withResolvers === 'function') Promise.withResolvers(); // compat-ok: feature-detected on this line
  const sorted = [3, 1].toSorted(), last = [1, 2].findLast((x) => x), copy = structuredClone({ a: 1 }), all = await Array.fromAsync([1]);
  const box = O.union(objs), diff = C.difference(a, b), split = s.split(/(?<=-)/);
  for await (const piece of SlopAI.stream('hi')) void piece;
  return [msg, tpl, re, later, idle, sorted, last, copy, all, box, diff, split];
}
