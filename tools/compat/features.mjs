// The browser support target and the web features newer than it: the one list tools/compat-check.mjs reads.
// Target: Safari 16.4 on macOS and iOS (March 2023), plus the Chrome, Edge and Firefox of the same time and later. Why
// 16.4: the site's scripts already use regular-expression lookbehind, which is a syntax error before Safari 16.4 (the whole
// script fails, not one feature), and iPhones that cannot update past iOS 16 get 16.x updates. WebGPU, local folders (File
// System Access) and WebMCP are newer, but every page detects them and says what is missing (how-it-works).
// Each feature: id, what (plain words), safari (the first Safari version that has it, null = none yet; from MDN's browser
// compatibility data and caniuse), the fallback to use, and how to find it in code with comments and string contents
// blanked out (re). guard: a regular expression that marks a line as feature-detected (typeof X, X ? … : …), so that line
// passes. Any other use passes only with a "compat-ok: <why or the fallback>" comment on its line or the line above.
// A feature whose safari version is at or below the target is listed for the record and never flagged.
export const TARGET = { safari: 16.4, ios: 16.4, chrome: 112, firefox: 112 };

export const FEATURES = [
  { id: 'stream-async-iteration', what: 'for await over a ReadableStream (a fetch body, Blob.stream(), a CompressionStream)', safari: null,
    fallback: 'SlopCompat.readStream(stream, onChunk) or SlopCompat.streamValues(stream) (shared/compat/stream.js), which use getReader()',
    re: /for\s+await\s*\([^;]*?\bof\s+[\w$.]*?(\.body|\.stream\(\s*\)|\.readable|\.pipeThrough\([^)]*\))\s*\)|\.body\s*\.\s*values\s*\(|\.body\s*\[\s*Symbol\.asyncIterator\s*\]|\bReadableStream\.from\s*\(/ },
  { id: 'iterator-helpers', what: 'iterator helpers (.values().map(), Iterator.from)', safari: 18.4,
    fallback: 'spread the iterator into an array first: [...it].map(…)',
    re: /\.(values|keys|entries)\s*\(\s*\)\s*\.\s*(map|filter|take|drop|flatMap|reduce|toArray|forEach|some|every|find)\s*\(|\bIterator\s*\.\s*(from|concat)\s*\(/ },
  { id: 'set-methods', what: 'Set methods (union, intersection, difference, isSubsetOf…)', safari: 17,
    fallback: 'a filter over one of the sets: new Set([...a].filter((x) => b.has(x)))',
    re: /(\bnew\s+Set\s*\([^()]*\)|\b\w*(?:[sS]et|Ids|ids))\s*\.\s*(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\s*\(/ },
  { id: 'group-by', what: 'Object.groupBy / Map.groupBy', safari: 17.4, fallback: 'a reduce into an object or a Map',
    re: /\b(Object|Map)\s*\.\s*groupBy\s*\(/ },
  { id: 'promise-with-resolvers', what: 'Promise.withResolvers', safari: 17.4, fallback: 'let res; const p = new Promise((r) => { res = r; })',
    re: /\bPromise\s*\.\s*withResolvers\s*\(/ },
  { id: 'promise-try', what: 'Promise.try', safari: 18.2, fallback: 'Promise.resolve().then(fn)', re: /\bPromise\s*\.\s*try\s*\(/ },
  { id: 'body-bytes', what: 'Response.bytes() / Blob.bytes()', safari: 18, fallback: 'new Uint8Array(await res.arrayBuffer())',
    re: /\b(res|resp|response|blob|r)\s*\.\s*bytes\s*\(\s*\)|\)\s*\.\s*bytes\s*\(\s*\)/ },
  { id: 'base64-hex', what: 'Uint8Array.fromBase64 / toBase64 / fromHex / toHex', safari: 18.2, fallback: 'btoa/atob over a binary string',
    re: /\bUint8Array\s*\.\s*from(Base64|Hex)\s*\(|\.\s*to(Base64|Hex)\s*\(\s*\)/ },
  { id: 'url-parse', what: 'URL.parse / URL.canParse', safari: 17, fallback: 'try { new URL(s) } catch', re: /\bURL\s*\.\s*(parse|canParse)\s*\(/ },
  { id: 'regexp-escape', what: 'RegExp.escape', safari: 18.2, fallback: "s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')", re: /\bRegExp\s*\.\s*escape\s*\(/ },
  { id: 'math-sum-precise', what: 'Math.sumPrecise', safari: null, fallback: 'a plain sum', re: /\bMath\s*\.\s*sumPrecise\s*\(/ },
  { id: 'map-upsert', what: 'Map getOrInsert / getOrInsertComputed', safari: null, fallback: 'has() then set()', re: /\.\s*getOrInsert(Computed)?\s*\(/ },
  { id: 'error-is-error', what: 'Error.isError', safari: null, fallback: 'e instanceof Error', re: /\bError\s*\.\s*isError\s*\(/ },
  { id: 'request-idle-callback', what: 'requestIdleCallback (unguarded)', safari: null, fallback: "window.requestIdleCallback ? requestIdleCallback(fn) : setTimeout(fn, 200)",
    re: /\brequestIdleCallback\s*\(/, guard: /typeof\s+(window\.|self\.|globalThis\.|root\.)?requestIdleCallback|\b(window|self|globalThis|root)\.requestIdleCallback\s*(\?|&&)|['"]requestIdleCallback['"]\s+in\b/ },
  { id: 'popover-api', what: 'the Popover API (showPopover, togglePopover)', safari: 17, fallback: 'a positioned element shown with hidden = false',
    re: /\.\s*(showPopover|togglePopover|hidePopover)\s*\(/ },
  { id: 'import-attributes', what: "import attributes (with { type: 'json' })", safari: 17.2, fallback: 'fetch(url).then((r) => r.json())',
    re: /\bimport\b[^;\n]*\b(with|assert)\s*\{\s*type\s*:/ },
  // On the target, listed for the record (never flagged):
  { id: 'array-from-async', what: 'Array.fromAsync', safari: 16.4, re: /\bArray\s*\.\s*fromAsync\s*\(/ },
  { id: 'regexp-lookbehind', what: 'regular-expression lookbehind', safari: 16.4, re: /\(\?<[=!]/ },
  { id: 'change-array-by-copy', what: 'toSorted / toReversed / toSpliced', safari: 16, re: /\.\s*to(Sorted|Reversed|Spliced)\s*\(/ },
  { id: 'find-last', what: 'findLast / findLastIndex', safari: 15.4, re: /\.\s*findLast(Index)?\s*\(/ },
  { id: 'structured-clone', what: 'structuredClone', safari: 15.4, re: /\bstructuredClone\s*\(/ },
  { id: 'array-at', what: 'Array/String .at()', safari: 15.4, re: /\.\s*at\s*\(\s*-/ },
];

/** The features newer than the target: the ones the check flags. */
export const flagged = (target = TARGET) => FEATURES.filter((f) => f.safari == null || f.safari > target.safari);
