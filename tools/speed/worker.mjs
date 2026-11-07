// One Lighthouse in its own Node process. Lighthouse keeps global state (its timing marks), so two runs at once in one
// process break each other: tools/speed/run.mjs --jobs=k forks k of these, each with its own Chrome (tools/speed/measure.mjs).
//   const lh = openWorker(); await lh.run(url, preset); await lh.close();   the same interface as openLighthouse()
// Forked with an IPC channel: it gets { id, url, preset } and answers { id, result } or { id, error }.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);

/** A forked worker. run(url, preset) resolves the numbers or rejects with Lighthouse's error (or after timeout ms, which
 * ends the worker); alive() is false once it has ended; close() ends it. */
export function openWorker({ timeout = 240000 } = {}) {
  const child = fork(SELF, ['--child'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const waiting = new Map();
  let next = 0, gone = null;
  child.on('message', ({ id, result, error }) => {
    const w = waiting.get(id);
    waiting.delete(id);
    if (w) (error ? w.reject(new Error(error)) : w.resolve(result));
  });
  child.on('exit', (code) => {
    gone = new Error(`speed worker exited (${code})`);
    for (const w of waiting.values()) w.reject(gone);
    waiting.clear();
  });
  return {
    run(url, preset) {
      if (gone) return Promise.reject(gone);
      const id = ++next;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { reject(new Error(`lighthouse ${url} ${preset}: no answer in ${timeout / 1000} s`)); child.kill('SIGKILL'); }, timeout);
        const done = (f) => (v) => { clearTimeout(timer); f(v); };
        waiting.set(id, { resolve: done(resolve), reject: done(reject) });
        child.send({ id, url, preset });
      });
    },
    alive: () => !gone,
    close() {
      if (gone) return Promise.resolve();
      return new Promise((r) => { child.once('exit', r); child.send({ close: true }); });
    },
  };
}

function child() {
  process.on('uncaughtException', (e) => { console.error('speed worker:', e.message); process.exit(1); });
  // Listening at once: a message sent while Lighthouse still loads waits in the queue instead of being lost.
  const ready = import('./measure.mjs').then(({ openLighthouse }) => openLighthouse());
  let queue = ready;
  // The parent gone (killed, crashed): close Chrome and end, rather than linger.
  process.on('disconnect', () => { ready.then((lh) => lh.close()).finally(() => process.exit(0)); });
  process.on('message', (m) => {
    queue = queue.then(async () => {
      const lh = await ready;
      if (m.close) { await lh.close(); process.exit(0); }
      try { process.send({ id: m.id, result: await lh.run(m.url, m.preset) }); } catch (e) { process.send({ id: m.id, error: e.message }); }
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF && process.argv[2] === '--child') child();
