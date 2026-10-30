/* Slopculator exchange rates. A rate is a factor: 1 unit of FROM = factor units of TO.
 * Order: a manual rate the person entered (localStorage 'slopcalc.rates'), then the rates in Slop Ledger's data
 * (shared/data/fx.js through window.SlopData, read on demand), else none. Classic script. Exposes window.SlopCalcRates:
 *   factor(from, to)        → number, or undefined (synchronous; for the evaluator)
 *   fetch(from, to, today)  → Promise<boolean>: looks up Slop Ledger's rate and remembers it; false when there is none
 *   manual()                → the manual rates [{ from, to, factor }]
 *   setManual(from, to, f)  → stores a manual rate and its inverse; returns false for a bad rate
 *   removeManual(from, to)  → forgets a manual rate pair
 *   ledgerReady()           → true when window.SlopData.fx is loaded */
(function (g) {
  'use strict';
  const KEY = 'slopcalc.rates';
  const keep = g.SlopCalcKeep;
  const cache = new Map(); // 'FROM>TO' → factor from Slop Ledger
  let manualRows = keep.read(KEY, []);
  const save = () => keep.write(KEY, manualRows);
  const pairKey = (a, b) => `${a}>${b}`;

  function manualFactor(from, to) {
    const direct = manualRows.find((r) => r.from === from && r.to === to);
    if (direct) return direct.factor;
    const back = manualRows.find((r) => r.from === to && r.to === from);
    return back ? 1 / back.factor : undefined;
  }
  function factor(from, to) {
    if (from === to) return 1;
    const m = manualFactor(from, to);
    if (m !== undefined) return m;
    return cache.get(pairKey(from, to));
  }
  const ledgerReady = () => !!(g.SlopData && g.SlopData.fx && g.SlopData.fx.rateOn);
  async function fetchRate(from, to, today) {
    if (!ledgerReady()) return false;
    try {
      const r = await g.SlopData.fx.rateOn(from, to, today);
      if (!r || !r.ok) return false;
      const f = Number(r.value.rate) / g.SlopData.fx.ONE; // the stored rate is scaled by 1,000,000
      if (!(f > 0)) return false;
      cache.set(pairKey(from, to), f);
      return true;
    } catch (e) { return false; }
  }
  function setManual(from, to, f) {
    const n = Number(f);
    if (!(n > 0) || !Number.isFinite(n) || from === to) return false;
    manualRows = manualRows.filter((r) => !((r.from === from && r.to === to) || (r.from === to && r.to === from)));
    manualRows.push({ from, to, factor: n, at: Date.now() });
    save();
    return true;
  }
  function removeManual(from, to) {
    manualRows = manualRows.filter((r) => !((r.from === from && r.to === to) || (r.from === to && r.to === from)));
    save();
  }

  g.SlopCalcRates = Object.freeze({
    factor, fetch: fetchRate, manual: () => manualRows.slice(), setManual, removeManual, ledgerReady,
  });
})(typeof window !== 'undefined' ? window : globalThis);
