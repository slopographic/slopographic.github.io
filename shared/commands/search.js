/* SlopCmd part: fuzzy search and ranking for the palette (title, keywords, group, id), recents first,
 * plus the "Go to app…" entries generated from window.SLOP_APPS. */
(function () {
  'use strict';
  const C = window.SlopCmd;
  if (!C || !C._parts || C._parts.search) return;
  /** A word from the shared tables (shared/i18n/ui/<code>.js) in the chosen language. */
  function tr(key, vars) { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; }   // shared/i18n/ui/<code>.js; the key where no table is loaded
  /** A group's name to show: groups are English ids ('Help' stays last); the shared tables have the common ones. */
  const GROUP = { File: 'menu.file', Edit: 'menu.edit', View: 'menu.view', Help: 'menu.help', Commands: 'ui.cmd.commands', 'Go to': 'ui.cmd.go_to', Recent: 'ui.cmd.recent' };
  const groupLabel = (g) => (GROUP[g] ? tr(GROUP[g]) : g);
  const FIELD_WEIGHT = { title: 1, keywords: 0.8, group: 0.55, id: 0.45 };
  const isWordStart = (s, i) => i === 0 || /[\s\-_./:()…]/.test(s[i - 1]) || (s[i - 1] === s[i - 1].toLowerCase() && s[i] !== s[i].toLowerCase());

  /** Score one query token against a string: higher is better, -1 when it does not match.
   *  Substrings beat scattered subsequences; matches at the start or at word starts score more. */
  function score(token, text) {
    const t = String(token || '').toLowerCase(), raw = String(text || ''), s = raw.toLowerCase();
    if (!t) return 0;
    if (!s) return -1;
    const at = s.indexOf(t);
    if (at >= 0) {
      let v = 100 + t.length * 4 - Math.min(at, 30);
      if (at === 0) v += 40; else if (isWordStart(raw, at)) v += 25;
      if (s.length === t.length) v += 30;
      return v;
    }
    // subsequence, preferring word starts (so "nl" finds "New Label")
    let v = 0, j = 0, prev = -2, firstAt = -1, acro = 0;
    for (let i = 0; i < s.length && j < t.length; i++) {
      if (s[i] !== t[j]) continue;
      if (firstAt < 0) firstAt = i;
      v += 2;
      if (i === prev + 1) v += 5;
      if (isWordStart(raw, i)) { v += 8; acro++; }
      prev = i; j++;
    }
    if (j < t.length) return -1;
    if (acro === t.length) v += 100; // every letter starts a word: an acronym
    return v - Math.min(firstAt, 10) - (s.length - t.length) * 0.1;
  }
  /** Best weighted score over an item's fields for one token; -1 when no field matches. */
  function itemScore(token, item) {
    let best = -1;
    const fields = [['title', item.title], ['group', item.group], ['id', item.id]];
    for (const k of item.keywords || []) fields.push(['keywords', k]);
    for (const [f, text] of fields) { const v = score(token, text); if (v >= 0 && v * FIELD_WEIGHT[f] > best) best = v * FIELD_WEIGHT[f]; }
    return best;
  }
  /** Rank items for a query. Every token must match some field. Enabled before disabled; frecency boosts. */
  function rank(query, items, frec = C.frecency) {
    const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const it of items) {
      if (it.hidden) continue;
      let total = 0, ok = true;
      for (const tk of tokens) { const v = itemScore(tk, it); if (v < 0) { ok = false; break; } total += v; }
      if (!ok) continue;
      const f = frec ? frec(it.id) : 0;
      out.push({ it, s: total + Math.min(60, f * 15) });
    }
    out.sort((a, b) => (b.it.enabled !== false) - (a.it.enabled !== false) || b.s - a.s || a.it.title.length - b.it.title.length);
    return out.map((x) => x.it);
  }

  /* ---------- "Go to app…" entries ---------- */
  function siteRoot() { return C.base ? new URL('../../', C.base).href : new URL('/', location.href).href; }
  function appItems() {
    const apps = window.SLOP_APPS || [];
    return apps.filter((a) => a.id !== C.app).map((a) => ({
      id: 'go.' + a.id, title: tr('ui.cmd.go_to_app', { name: a.name }), group: tr('ui.cmd.go_to'), icon: a.kind === 'game' ? '🎮' : a.kind === 'experiment' ? '🧪' : '↗',
      keywords: [a.name, a.kind, a.tagline || '', window.slopAppTagline ? window.slopAppTagline(a) : ''], keys: [], enabled: true, go: a,
    }));
  }
  /** Navigate to another app (a Go to entry). Overridable for tests: SlopCmd._parts.search.navigate = fn. */
  function goTo(a) {
    const url = window.SlopHub && SlopHub.urlOf ? SlopHub.urlOf(a) : new URL(a.path, siteRoot()).href;
    api.navigate(url);
  }

  /** What the palette shows: { sections: [{ title, items }] }. Empty query: recents, then every group. */
  function results(query) {
    const cmds = C.list().filter((c) => !c.hidden);
    const q = String(query || '').trim();
    if (q) {
      const out = [{ title: '', items: rank(q, cmds).slice(0, 50) }];
      for (const p of C.providers()) {
        let got = [];
        try { got = (p.search(q) || []).slice(0, 20); } catch (err) { console.warn(err); }
        if (got.length) out.push({ title: p.title || p.id, items: got.map((r) => ({ id: r.id, title: r.title, group: r.group || '', icon: r.icon || '', keywords: r.keywords || [], keys: [], enabled: true, provided: r.run })) });
      }
      const go = rank(q, appItems()).slice(0, 8);
      if (go.length) out.push({ id: 'go', title: tr('ui.cmd.go_to'), items: go });
      return out;
    }
    const sections = [], byId = new Map(cmds.map((c) => [c.id, c]));
    const rec = C.recent(5).map((id) => byId.get(id)).filter((c) => c && c.enabled);
    if (rec.length) sections.push({ id: 'recent', title: tr('ui.cmd.recent'), items: rec });
    const groups = new Map();
    for (const c of cmds) { const g = c.group || 'Commands'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    const help = groups.get('Help'); groups.delete('Help');
    for (const [g, items] of groups) sections.push({ id: g, title: groupLabel(g), items: items.sort((a, b) => (b.enabled !== false) - (a.enabled !== false)) });
    if (help) sections.push({ id: 'Help', title: groupLabel('Help'), items: help });
    return sections;
  }
  const api = { score, itemScore, rank, results, appItems, goTo, groupLabel, tr, navigate: (url) => { location.href = url; } };
  C._parts.search = api;
})();
