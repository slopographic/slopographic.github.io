/* Reel Remix: auto remix. When a batch of uploads has finished (SlopDrop's done runs after its last file, so the clips
   are decoded and in the bin), the batch's clips are pending. After a short wait, with the banner showing the count and
   Cancel, a remix runs by itself with the current settings. Any plan takes the pending clips, so clips that have been
   remixed never trigger again. The switch is kept in localStorage (try/catch; this page's memory when storage is blocked).
   Exposes RM.auto, RM.prefs and RM.pendingCount. */
(function () {
  'use strict';
  const RM = window.RM, $ = (id) => document.getElementById(id);
  const KEY = 'slop.remix.prefs', WAIT_MS = 1200;
  let timer = null, memo = null;

  RM.prefs = {
    get() {
      try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return Object.assign({ auto: true }, v); } catch (e) { /* blocked or corrupt: use the memory */ }
      return Object.assign({ auto: true }, memo);
    },
    set(patch) {
      const next = Object.assign(RM.prefs.get(), patch);
      memo = next;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* not kept across visits */ }
      return next;
    }
  };
  /** Clips waiting for a remix: added in a batch and still in the bin. */
  RM.pendingCount = () => RM.state.pending.filter((id) => RM.state.items.some((x) => x.id === id)).length;

  function show(text) { $('rm-auto-text').textContent = text; $('rm-auto').hidden = false; }
  function hide() { $('rm-auto').hidden = true; }
  /** Stop the wait. quiet: no status line (the switch was turned off, or a plan made it moot). */
  function cancel(quiet) {
    if (timer) { clearTimeout(timer); timer = null; }
    hide();
    if (!quiet && RM.say) RM.say(RM.t('remix.auto.cancelled'));
  }
  /** Show the banner and start the wait (one wait at a time; a later batch joins it). */
  function start() {
    if (!RM.auto.enabled() || !RM.pendingCount()) { cancel(true); return; }
    const n = RM.media().length;
    show(RM.t('remix.auto.remixing', { n }));
    if (!timer) timer = setTimeout(run, WAIT_MS);
  }
  function run() {
    timer = null; hide();
    if (RM.auto.enabled() && RM.pendingCount()) RM.remixNow(false);
  }

  RM.auto = {
    enabled: () => RM.prefs.get().auto !== false,
    setEnabled(on) {
      RM.prefs.set({ auto: !!on });
      if (!on) cancel(true);
      if (RM.fab) RM.fab.refresh();
      return !!on;
    },
    /** SlopDrop's done for a batch: its added clips become pending, and the wait starts once the page has finished the batch. */
    batchDone(sum) {
      const ids = ((sum && sum.added) || []).map((a) => a.value).filter(Boolean);
      if (!ids.length) return;
      for (const id of ids) if (!RM.state.pending.includes(id)) RM.state.pending.push(id);
      if (RM.fab) RM.fab.refresh();
      setTimeout(start, 0); // a plan made in the same batch (a filled clip) clears the pending list first
    },
    cancel: () => cancel(false)
  };

  $('rm-auto-cancel').addEventListener('click', () => RM.auto.cancel());
  // Any plan (a manual Remix, Randomise, Reshuffle) ends a wait that has not run yet: its clips are in that plan.
  RM.onPlan(() => { if (timer) { clearTimeout(timer); timer = null; } hide(); });
})();
