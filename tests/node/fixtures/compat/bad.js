/* compat-check fixture: features newer than the target (Safari 16.4), one per line. */
async function stream(res) {
  for await (const chunk of res.body) console.log(chunk);
  const all = await Array.fromAsync([1]);
  const evens = new Map().values().map((x) => x * 2);
  const both = new Set([1]).union(new Set([2]));
  const groups = Object.groupBy([1, 2], (x) => x % 2);
  const { promise } = Promise.withResolvers();
  requestIdleCallback(() => 0);
  return [all, evens, both, groups, promise, await res.bytes(), Uint8Array.fromBase64('AA==')];
}
