/* SlopAIKit cloud meter: what a connected AI costs, in plain words, and the one-time notice before the first request.
 * Classic script; adds SlopAIKit.cloud.meter.
 *   add(usage) → the totals of this visit { input, output, tokens, cost (null when the price is not known), replies }
 *   total() · reset() · over(cap) → true when this visit used cap tokens or more (cap 0 = no cap)
 *   line(usage) → '1,234 tokens · about $0.02'      detail([usage per turn]) → 'This request used N tokens (M cached): …', a line a turn      totalLine(cap) → 'This visit: 5,678 tokens · about $0.05 (cap 200,000)'
 *   capText(cap) → the sentence the loop stops with
 *   notice(provider, model) → Promise<bool>: before the first request to a provider, once per browser (localStorage
 *        'slop-firstrun:ai-cloud:<id>'): what goes to the provider, that files go only when the person allows each one,
 *        and that the provider charges their account. Cancel = nothing is sent.
 * "This visit" is the tab: the totals live in sessionStorage, so a reload keeps them and a new tab starts at zero. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const KEY = 'slop-ai.cloud.visit', SEEN = 'slop-firstrun:ai-cloud:';
  const zero = () => ({ input: 0, output: 0, cacheRead: 0, tokens: 0, cost: 0, known: true, replies: 0 });
  let t = (() => { try { return Object.assign(zero(), JSON.parse(sessionStorage.getItem(KEY)) || {}); } catch (e) { return zero(); } })();
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { /* storage blocked: memory only */ } };
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const n = (x) => (window.SlopI18n ? SlopI18n.num(Math.round(x)) : String(Math.round(x)));
  /** 'about $0.42', or 'less than $0.01' (a cent is the smallest step people read). */
  const money2 = (c) => (window.SlopI18n ? SlopI18n.num(c, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : c.toFixed(2));   // 0.42 / 0,42
  const money = (c) => (c == null ? '' : c < 0.005 ? T('ui.ai.cloud.money_lt') : T('ui.ai.cloud.money_about', { amount: money2(c) }));

  function add(u) {
    if (!u) return total();
    t.input += u.input || 0; t.output += u.output || 0; t.cacheRead += u.cacheRead || 0; t.tokens = t.input + t.output; t.replies++;
    if (u.cost == null) t.known = false; else t.cost += u.cost;
    keep();
    return total();
  }
  const total = () => Object.assign({}, t, { cost: t.known ? t.cost : null });
  const reset = () => { t = zero(); keep(); };
  const over = (cap) => !!cap && cap > 0 && t.tokens >= cap;
  function line(u) {
    const tok = (u.input || 0) + (u.output || 0);
    return T('ui.ai.cloud.tokens', { n: tok, count: n(tok) }) + (u.cacheRead ? ' ' + T('ui.ai.cloud.from_cache', { count: n(u.cacheRead) }) : '') + (u.cost != null ? ` · ${money(u.cost)}` : '');
  }
  /** The hover text of a request's line: its total, how much came from the cache, and each model turn. */
  function detail(list) {
    const sum = (k) => list.reduce((a, u) => a + (u[k] || 0), 0), inp = sum('input'), out = sum('output'), hit = sum('cacheRead'), wrote = sum('cacheWrite');
    const head = T(wrote ? 'ui.ai.cloud.detail_head_w' : 'ui.ai.cloud.detail_head', { total: n(inp + out), hit: n(hit), inp: n(inp), out: n(out), wrote: n(wrote), n: list.length });
    return [head, ...list.map((u, i) => T('ui.ai.cloud.detail_turn', { i: i + 1, inp: n(u.input || 0), hit: n(u.cacheRead || 0), out: n(u.output || 0) }))].join('\n');
  }
  function totalLine(cap) {
    const x = total();
    return T('ui.ai.cloud.visit', { count: n(x.tokens) }) + (x.cost != null ? ` · ${money(x.cost)}` : ' · ' + T('ui.ai.cloud.price_unknown')) + (cap ? ' ' + T('ui.ai.cloud.cap_of', { count: n(cap) }) : '');
  }
  const capText = (cap) => T('ui.ai.cloud.cap_stop', { count: n(cap) });

  function seen(id) { try { return localStorage.getItem(SEEN + id) === '1'; } catch (e) { return false; } }
  function lines(p) {
    const v = { who: p.who, address: p.base || T('ui.ai.cloud.the_address') };
    if (p.local) return [T('ui.ai.cloud.notice_local_1', v), T('ui.ai.cloud.notice_local_2')];
    return [1, 2, 3, 4].map((i) => T('ui.ai.cloud.notice_' + i, v));
  }
  function notice(p) {
    if (seen(p.id)) return Promise.resolve(true);
    const remember = () => { try { localStorage.setItem(SEEN + p.id, '1'); } catch (e) { /* the notice shows again next time */ } };
    if (!window.SlopUI || !SlopUI.dialog) { const ok = window.confirm(lines(p).join('\n\n')); if (ok) remember(); return Promise.resolve(ok); }
    return new Promise((resolve) => {
      const body = document.createElement('div');
      for (const s of lines(p)) { const el = document.createElement('p'); el.className = 'sui-p'; el.textContent = s; body.append(el); }
      let done = false;
      const finish = (ok) => { if (done) return; done = true; if (ok) remember(); resolve(ok); };
      SlopUI.dialog({ title: p.local ? T('ui.ai.cloud.notice_title_local', { name: p.short }) : T('ui.ai.cloud.notice_title', { who: p.who }), body, cls: 'sap-notice',
        buttons: [{ label: T('menu.cancel'), act: () => finish(false) }, { label: T('ui.ai.cloud.continue'), primary: true, act: () => finish(true) }],
        onClose: (ok) => finish(!!ok) });
    });
  }

  C.meter = { add, total, reset, over, line, detail, totalLine, capText, notice, seen, lines, money, money2 };
})();
