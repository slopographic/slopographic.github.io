/* Reel Remix: Randomise, Undo randomise and the seed in the URL. Randomise takes a seed (the one typed into the Seed field
   when the person has typed one since the last plan, otherwise a new one) and derives its whole choice from that seed:
   the order (the plan), Random length within the current Min and Max (timing "random"), each photo's Enter and Exit (the
   transition choices), and the effect layer (one of the five effects, with a random change). The same seed and clips
   give the same result. Undo puts back the result from before the last Randomise (one step). The seed is in the URL as
   ?rm.seed=... (SlopUrlState). Exposes RM.randomise and RM.undoRandomise. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, S = SV.seed, FX = SV.effects, CS = SV.clipset;
  const $ = (id) => document.getElementById(id);
  const SALT = 0x52414e44;
  const KEEP = ['seed', 'timing', 'photo', 'effect', 'lane', 'keys', 'pending'];
  const EFFECTS = FX.KINDS.map((k) => k[0]).filter((k) => k !== 'none' && k !== 'random');
  let before = null, seedTyped = false;

  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  const copy = (v) => JSON.parse(JSON.stringify(v));

  /** The seed for a Randomise: the typed seed when the person has typed one, else a new random seed. */
  function nextSeed() {
    const text = $('rm-seed').value;
    return seedTyped && text.trim() ? S.parse(text) : S.make();
  }
  /** The random choices of one seed (the same seed gives the same choices). */
  function choices(seed) {
    const rng = S.rng((seed ^ SALT) >>> 0), st = RM.state;
    const edges = CS.EDGE.map((e) => e[0]);
    const kind = pick(rng, EFFECTS), change = pick(rng, FX.CHANGE.map((c) => c[0]));
    return {
      enter: pick(rng, edges), exit: pick(rng, edges),
      effect: FX.norm(Object.assign({}, st.effect, { kind, change, intensity: st.effect.intensity > 0 ? st.effect.intensity : FX.DEFAULT.intensity }))
    };
  }
  function snapshot() {
    const st = RM.state, s = { plan: st.plan };
    for (const k of KEEP) s[k] = copy(st[k]);
    return s;
  }
  /** The controls that Randomise and Undo change, set from the state (syncUI covers the rest). */
  function showControls() {
    const st = RM.state;
    $('rm-penter').value = st.photo.enter; $('rm-pexit').value = st.photo.exit;
    RM.syncUI(); RM.panel.sync();
  }
  function refreshUndo() { const b = $('rm-undo'); if (b) b.disabled = !before; }
  function writeUrl(seed) {
    try { if (window.SlopUrlState) window.SlopUrlState.scope('rm').set({ seed: S.hex(seed) }); } catch (e) { /* no history here: the seed still shows */ }
  }
  function readUrlSeed() {
    try {
      const raw = window.SlopUrlState ? String(window.SlopUrlState.scope('rm').get('seed', '')).trim() : '';
      if (!/^[0-9a-f]{1,8}$/i.test(raw)) return;
      RM.state.seed = S.parse(raw);
      $('rm-seed').value = S.hex(RM.state.seed);
    } catch (e) { /* a bad link keeps the new seed */ }
  }

  /** Randomise: a seed, its choices, and a new plan with them. Returns the plan, or null with no clips. */
  RM.randomise = function () {
    const st = RM.state;
    if (!RM.media().length) { if (RM.say) RM.say(RM.t('remix.ui.add_first')); return null; }
    const prev = snapshot(), seed = nextSeed(), c = choices(seed);
    Object.assign(st, { seed, timing: 'random', effect: c.effect });
    st.photo = Object.assign({}, st.photo, { enter: c.enter, exit: c.exit });
    $('rm-seed').value = S.hex(seed);
    seedTyped = false;
    showControls();
    const plan = RM.remixNow(false);
    if (!plan) return null;
    before = prev;
    refreshUndo();
    RM.say(RM.t('remix.rand.done', { seed: S.hex(plan.seed) }));
    return plan;
  };
  /** Undo the last Randomise: its previous plan, seed and options come back. One step. */
  RM.undoRandomise = function () {
    if (!before) return false;
    const st = RM.state, s = before;
    before = null;
    for (const k of KEEP) st[k] = s[k];
    st.plan = s.plan;
    showControls();
    RM.fab.refresh(); refreshUndo(); writeUrl(st.seed);
    RM.say(RM.t('remix.rand.undone', { seed: S.hex(st.seed) }));
    return true;
  };

  function init() {
    $('rm-seed').addEventListener('input', () => { seedTyped = true; });
    $('rm-randomise').addEventListener('click', () => RM.randomise());
    $('rm-undo').addEventListener('click', () => RM.undoRandomise());
    RM.onPlan((plan) => { seedTyped = false; writeUrl(plan.seed); });
    readUrlSeed();
    refreshUndo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
