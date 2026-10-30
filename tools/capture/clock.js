/* Virtual clock, injected before any page script (page.addInitScript).
 * Until window.__cap.freeze() the page runs normally. After it, time only moves
 * when the capture script calls __cap.tick(dt): requestAnimationFrame callbacks,
 * performance.now, Date.now and every Web Animation / CSS animation advance by
 * exactly dt, so a slow software GPU still yields a smooth 30 fps clip. */
(() => {
  'use strict';
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  const realPerf = performance.now.bind(performance);
  const realDate = Date.now;
  let frozen = false, vt = 0, dateOff = 0, nextId = 1e6;
  let queue = new Map();
  window.requestAnimationFrame = (cb) => {
    if (!frozen) return realRaf(cb);
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => { if (queue.has(id)) queue.delete(id); else realCancel(id); };
  performance.now = () => (frozen ? vt : realPerf());
  Date.now = () => (frozen ? Math.round(vt + dateOff) : realDate());
  const anims = () => (document.getAnimations ? document.getAnimations() : []);
  window.__cap = {
    get frozen() { return frozen; },
    freeze() {
      if (frozen) return;
      vt = realPerf(); dateOff = realDate() - vt; frozen = true;
      for (const a of anims()) try { if (a.playState === 'running') { a.pause(); a.__capRun = true; } } catch (e) { /* ignore */ }
    },
    /** Advance virtual time by dt seconds and run one frame of callbacks. */
    tick(dt = 1 / 30) {
      vt += dt * 1000;
      for (const a of anims()) {
        try {
          if (a.playState === 'running') { a.pause(); a.__capRun = true; }
          if (a.__capRun && a.playState === 'paused') a.currentTime = (a.currentTime || 0) + dt * 1000;
        } catch (e) { /* ignore */ }
      }
      const cbs = queue; queue = new Map();
      for (const cb of cbs.values()) { try { cb(vt); } catch (e) { console.warn('[cap] frame error', e && e.message); } }
    },
    /** Run n frames without capturing them (warm-up / skip ahead). */
    run(n, dt = 1 / 30) { for (let i = 0; i < n; i++) this.tick(dt); },
  };
})();
