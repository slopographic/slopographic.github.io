/* SlopCutout memory plan: how ONNX Runtime Web is started, so it also runs where WebKit refuses a big shared memory.
 * Why: onnxruntime-web ships only the threaded build (ort-wasm-simd-threaded). Its glue creates
 * new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true }), a 4 GB maximum; a shared memory can never move,
 * so JavaScriptCore reserves the whole maximum up front, and on iOS / iPadOS 16 and 17 that fails at once with
 * "RangeError: Out of memory" (ort: "no available backend found. ERR: [wasm] RangeError: Out of memory"), before any model
 * is read. Measured in Safari on iOS 16.4: shared 64k, 48k and 32k pages fail, 16k fits only while nothing else holds a
 * reservation; a plain (unshared) memory with the same 4 GB maximum always works, as it grows on demand.
 * So where a shared 4 GB memory cannot be made (and always on iOS), the glue and the wasm binary are patched in memory to
 * use a plain one. Threads need a shared memory, but the site has no COOP/COEP, so ORT runs single-threaded anyway.
 * Session creation that still runs out of memory is retried once with the light configuration (WebAssembly, plain
 * memory, one thread) and then with the smallest model; when that fails too the error has code 'low-memory'.
 * Classic script for the worker (importScripts), a page or Node (tests). Sets self.SlopCutoutMemory. */
(function (root) {
  'use strict';
  const LOW = /out of memory|\boom\b|bad_alloc|cannot enlarge memory|could not allocate/i;
  /** Is this error the engine running out of memory (or refusing to reserve it)? */
  function isLowMemory(e) {
    if (!e) return false;
    if (e.code === 'low-memory') return true;
    return LOW.test(String((e && e.message) || e));
  }
  /** Did ORT fail to start or to build a session for another reason? Seen on iOS 16.4: "Can't create a session ...
   *  allocation_planner.cc ... Could not find OrtValue with name" with any memory and optimisation level. A fresh light
   *  start may still work, so these are retried too; when nothing works the error has code 'unavailable'. */
  const ENGINE = /no available backend|can't create a session/i;
  const isEngineFailure = (e) => !!e && (e.code === 'unavailable' || ENGINE.test(String((e && e.message) || e)));
  /** Can this engine make the 4 GB shared memory the threaded glue asks for? Fails fast (nothing is reserved) where it can not. */
  function sharedMemoryOK() {
    try { return !!new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true }); } catch (e) { return false; }
  }

  /** The iOS / iPadOS major version a user agent names: "CPU iPhone OS 16_4 like Mac OS X", or Safari's "Version/16.4"
   *  (an iPad asking for desktop sites); 0 when it names neither (an app's iPad web view: "Macintosh ... (KHTML, like Gecko)"). */
  function iosVersion(ua) {
    const s = String(ua || ''), m = /\bOS (\d+)[_.]\d+[^)]* like Mac OS X/.exec(s) || /\bVersion\/(\d+)\.\d+[^ ]* (?:Mobile\/\S+ )?Safari\//.exec(s);
    return m ? +m[1] : 0;
  }
  /** Has this engine the JavaScript of WebKit 17 (the RegExp v flag, new in Safari 17)? Tells iOS 16 from 17 when the
   *  user agent names no version. */
  function modernEngine() {
    try { return new RegExp('[a]', 'v').test('a'); } catch (e) { return false; }
  }
  /** Can ONNX Runtime Web 1.30 not run here at all? WebKit on iOS / iPadOS before 17 fails every session ("Could not find
   *  OrtValue with name '1000'" from its allocation planner, with any memory, thread or optimisation setting), so the
   *  remover says so at once instead of downloading the model and retrying. env { ios, ua, modern (modernEngine()) }. */
  function tooOldForEngine(env) {
    if (!env || !env.ios) return false;
    const v = iosVersion(env.ua);
    return v ? v < 17 : env.modern === false;
  }

  /** The light configuration: what runs on the smallest devices. */
  const LIGHT = Object.freeze({ backend: 'wasm', sharedMemory: false, numThreads: 1, proxy: false });
  /** env { ios, crossOriginIsolated, sharedMemory (false when sharedMemoryOK() said no), gpu, cores } → the configuration
   *  to start with: WebGPU when there is a usable adapter; the shared memory as shipped unless iOS or the probe says no;
   *  threads only with cross-origin isolation (else 1); the proxy worker never (we already run in a worker). */
  function plan(env) {
    env = env || {};
    const shared = !env.ios && env.sharedMemory !== false;
    const threads = shared && env.crossOriginIsolated ? Math.max(1, Math.min(4, Math.floor((env.cores || 2) / 2))) : 1;
    return { backend: env.gpu ? 'webgpu' : 'wasm', sharedMemory: shared, numThreads: threads, proxy: false };
  }
  const same = (a, b) => a.backend === b.backend && a.sharedMemory === b.sharedMemory && a.numThreads === b.numThreads;
  /** What to try, in order, for a model: the planned configuration, the light one, the light one with the smallest model.
   *  opts.light: the planned one already ran out of memory here, so start light. */
  function attempts(model, env, opts) {
    opts = opts || {};
    const smallest = opts.smallest || 'fast', first = opts.light ? LIGHT : plan(env);
    const list = [{ config: first, model }];
    if (!same(first, LIGHT)) list.push({ config: LIGHT, model });
    if (model !== smallest) list.push({ config: LIGHT, model: smallest });
    return list;
  }
  /** Run make(attempt, index) for each attempt until one works. A low-memory error moves on to the next (onRetry(error,
   *  attempt, index) first), and so does an engine failure (isEngineFailure); any other error stops. Resolves { value,
   *  attempt, index }; when no attempt worked rejects with code 'low-memory' (one ran out of memory) or 'unavailable'. */
  async function withRetry(list, make, onRetry) {
    let last = null, oom = false;
    for (let i = 0; i < list.length; i++) {
      try { return { value: await make(list[i], i), attempt: list[i], index: i }; }
      catch (e) {
        const low = isLowMemory(e);
        if (!low && !isEngineFailure(e)) throw e;
        last = e; oom = oom || low;
        if (onRetry) onRetry(e, list[i], i);
      }
    }
    const err = new Error((oom ? 'Not enough memory for the background remover on this device' : 'The background remover cannot start in this browser') + (last ? ' (' + (last.message || last) + ')' : ''));
    err.code = oom ? 'low-memory' : 'unavailable';
    err.cause = last;
    throw err;
  }

  /** The ORT glue (ort-wasm-simd-threaded[.jsep].mjs) with a plain memory: its own 4 GB shared memory becomes unshared,
   *  its SharedArrayBuffer stand-in (made from a shared memory when the page has none) becomes a class nothing is an
   *  instance of, and the main thread's pthread mailbox skips Atomics.waitAsync (it throws on a plain memory; with one
   *  thread no message ever arrives there). Throws when the glue no longer has what is patched (a new ORT version: check the patterns). */
  function patchGlue(src) {
    let n = 0;
    const out = String(src)
      .replace(/globalThis\.SharedArrayBuffer\?\?\(new WebAssembly\.Memory\(\{initial:0,maximum:0,shared:!0\}\)\)\.buffer\.constructor/, () => { n++; return 'globalThis.SharedArrayBuffer??class{}'; })
      .replace(/new WebAssembly\.Memory\(\{initial:(\d+),maximum:(\d+),shared:!0\}\)/, (m, a, b) => { n++; return 'new WebAssembly.Memory({initial:' + a + ',maximum:' + b + '})'; })
      .replace(/=!Atomics\.waitAsync\|\|/, () => { n++; return '=!0||'; });
    if (n !== 3) throw new Error('SlopCutout: the ONNX Runtime glue changed; the plain-memory patch found ' + n + ' of 3 places');
    return out;
  }

  /** Read an unsigned LEB128 at p: [value, next position]. */
  function leb(b, p) {
    let v = 0, s = 0, x;
    do { x = b[p++]; v += (x & 0x7f) * Math.pow(2, s); s += 7; } while (x & 0x80);
    return [v, p];
  }
  const skipLimits = (b, q) => { const f = b[q++]; q = leb(b, q)[1]; return f & 1 ? leb(b, q)[1] : q; };
  /** A copy of a wasm binary whose imported memories are not shared (the limits flag's shared bit cleared; same length).
   *  Atomic instructions stay valid on a plain memory, and one thread never waits on one. Returns { buffer, patched }. */
  function patchWasm(input) {
    const b = new Uint8Array(input.slice(0));
    if (b[0] !== 0 || b[1] !== 0x61 || b[2] !== 0x73 || b[3] !== 0x6d) throw new Error('Not a WebAssembly binary');
    let p = 8, patched = 0;
    while (p < b.length) {
      const id = b[p++], [size, start] = leb(b, p);
      p = start + size;
      if (id !== 2) continue;   // the import section
      let [n, q] = leb(b, start);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 2; k++) { const [len, r] = leb(b, q); q = r + len; }   // module and field names
        const kind = b[q++];
        if (kind === 0) q = leb(b, q)[1];                  // function: type index
        else if (kind === 1) q = skipLimits(b, q + 1);     // table: reftype + limits
        else if (kind === 2) { if (b[q] & 2) { b[q] &= ~2; patched++; } q = skipLimits(b, q); }   // memory
        else if (kind === 3) q += 2;                       // global: valtype + mutability
        else if (kind === 4) q = leb(b, q + 1)[1];         // tag: attribute + type index
        else throw new Error('Unknown import kind ' + kind);
      }
      break;
    }
    return { buffer: b.buffer, patched };
  }

  root.SlopCutoutMemory = { isLowMemory, isEngineFailure, sharedMemoryOK, iosVersion, modernEngine, tooOldForEngine, plan, attempts, withRetry, patchGlue, patchWasm, LIGHT };
})(typeof self !== 'undefined' ? self : globalThis);
