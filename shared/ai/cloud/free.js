/* SlopAIKit cloud free: which providers and models cost nothing, read from the catalog's `free` field (cloud/catalog/*.js,
 * the one source; the field is documented in catalog/main.js). Classic script, no DOM; adds SlopAIKit.cloud.free =
 *   tier(p) → p.free when it is a real free offer ('free' | 'free-models' | 'free-trial'), else null
 *   label(p) → the badge text: 'Free', 'Free models' or 'Free trial' ('' when none)
 *   priced(raw) → true when an entry of an OpenAI-style model list is free: OpenRouter's id ending in ':free', or a
 *     pricing object whose every number is 0 (cloud/compat.js sets m.free from it)
 *   model(p, m) → true (free), false (not free) or null (not known): m.free from the list, else the entry's free.models
 *     ('all', or ids and patterns), else null; a server on this computer is always free
 *   known(p, list) → true when some model of the list is known to be free (the model search then offers "only free")
 *   others(p) → the names of other free providers that can use tools, to suggest when this one is busy
 *   rate(p, model, secs) → the plain words added to a rate-limit error (cloud/net.js): its free limits, when to retry,
 *     and where else to go (another free provider, or a model on this device)
 *   wait(secs) → "about 40 seconds" / "about 3 minutes" / "about 2 hours". */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const TIERS = { free: 'ui.ai.cloud.tier_free', 'free-models': 'ui.ai.cloud.tier_free_models', 'free-trial': 'ui.ai.cloud.tier_free_trial' };   // the badge's key

  const tier = (p) => (p && p.free && TIERS[p.free.tier] ? p.free : null);
  const label = (p) => { const f = tier(p); return f ? T(TIERS[f.tier]) : ''; };

  function priced(raw) {
    if (!raw) return false;
    if (/:free$/.test(String(raw.id || ''))) return true;
    const pr = raw.pricing;
    if (!pr || typeof pr !== 'object') return false;
    const nums = Object.values(pr).filter((v) => (typeof v === 'string' || typeof v === 'number') && v !== '' && !Number.isNaN(Number(v)));
    return nums.length > 0 && nums.every((v) => Number(v) === 0) && pr.prompt != null && pr.completion != null;
  }

  function model(p, m) {
    if (!p || !m) return null;
    if (p.local) return true;
    if (typeof m.free === 'boolean') return m.free;
    const f = tier(p), list = f && f.models;
    if (!list) return f && f.tier === 'free-models' ? /:free$/.test(String(m.id || '')) : null;   // OpenRouter, by id alone
    if (list === 'all') return true;
    const id = String(m.id || '');
    return list.some((x) => (x instanceof RegExp ? x.test(id) : x === id));
  }
  const known = (p, list) => (list || []).some((m) => model(p, m) === true) && !p.local;

  function others(p) {
    return (C.providers || []).filter((x) => x !== p && x.id !== (p && p.id) && x.usable && x.chat && !x.local && x.caps.tools && tier(x) && x.free.tier !== 'free-trial')
      .sort((a, b) => (a.free.rank || 9) - (b.free.rank || 9)).map((x) => x.short);
  }

  function wait(secs) {
    const s = Math.max(1, Math.round(Number(secs) || 0));
    if (s < 90) return T('ui.ai.cloud.wait_s', { n: s });
    if (s < 90 * 60) return T('ui.ai.cloud.wait_m', { n: Math.round(s / 60) });
    return T('ui.ai.cloud.wait_h', { n: Math.round(s / 3600) });
  }

  /** The words after "too many requests": only for a provider with a free offer (and, at OpenRouter, a free model). */
  function rate(p, modelId, secs) {
    const f = tier(p);
    if (!f) return '';
    if (f.tier === 'free-models' && modelId && model(p, { id: modelId }) === false) return '';
    const out = [];
    if (f.limits) out.push(T('ui.ai.cloud.rate_limits', { name: p.short, limits: f.limits }));
    if (secs) out.push(T('ui.ai.cloud.rate_retry', { wait: wait(secs) }));
    else out.push(f.reset ? T('ui.ai.cloud.rate_reset', { reset: f.reset }) : T('ui.ai.cloud.err_rate_wait'));
    const alt = others(p).slice(0, 2), I = window.SlopI18n;
    out.push(alt.length ? T('ui.ai.cloud.rate_switch_alt', { names: I && I.list ? I.list(alt, { type: 'disjunction' }) : alt.join(' / ') }) : T('ui.ai.cloud.rate_switch'));
    return out.join(' ');
  }

  C.free = { tier, label, priced, model, known, others, rate, wait, TIERS };
})();
