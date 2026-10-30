/* SlopAIKit imageGen run: one request to make (or edit) pictures with the person's own key. Classic script; needs
 * cloud/net.js, cloud/providers.js, cloud/keys.js, cloud/meter.js, imagegen/core.js and the formats.
 *   connected() → Promise<[{ id, short, who, local }]>: the picture providers this browser has a key for (or a local
 *        server address), refreshed into imageGen.available (sync, for the tool list)
 *   choose(pref) → Promise<{ provider, model } | null>: the last choice, else the AI panel's provider, else the first
 *   generate(req, { signal }) → Promise<{ images: [{ blob, mime }], usage, cost, notes, provider, model, who }>
 *        req: { provider, model, prompt, n, aspect, resolution, quality, style, transparent, image?, mask? }
 *        (image/mask from pixels.js prepare()). Every failure is a CloudError with a plain message: key, rate, money,
 *        refusal (the provider's content rules), cap (this visit's spending cap), model (no picture endpoint), …
 * Each finished request counts toward this visit's totals and the cap (cloud/meter.js), with its cost when known. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = K.imageGen, C = () => K.cloud;
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  G.available = G.available || [];

  async function connected() {
    const s = C().keys.settings(), out = [];
    for (const p of G.providers) {
      if (p.generate) { out.push(p); continue; }
      // a server without a key counts once the person set it up in the AI panel (so a stopped Ollama is not offered)
      const ps = (s.providers || {})[p.id], cp = C().byId(p.id) || {};
      if (p.needsKey ? await C().keys.get(p.id).catch(() => '') : ps && (ps.base || cp.base) && (s.active === p.id || ps.base)) out.push(p);
    }
    G.available = out.map((p) => ({ id: p.id, short: p.short, who: p.who, local: !!p.local }));
    return G.available;
  }
  async function choose(pref = {}) {
    const list = await connected(), s = G.settings(), active = C().keys.settings().active;
    const id = [pref.provider, s.provider, active].find((x) => x && list.some((p) => p.id === x)) || (list[0] && list[0].id);
    if (!id) { G.current = null; return null; }
    const p = G.byId(id), cs = (C().keys.settings().providers || {})[id] || {};
    // the first choice the site offers (shared/ai/makers.js): a hidden model asked for or saved falls back to the next
    const ok = (x) => x && (!K.makers || K.makers.allowed(x, id));
    const model = [pref.model, (s.models || {})[id], (G.models(id)[0] || {}).id, cs.imageModel].find(ok) || '';
    G.current = { provider: id, model };
    return G.current;
  }

  /** The provider's error in words for pictures: content rules, organization verification, no picture endpoint. */
  function plainError(e, p) {
    const CE = C().CloudError;
    if (!(e instanceof CE)) return e;
    const said = `${e.detail || ''} ${e.message || ''}`;
    if ((e.kind === 'request' || e.kind === 'refusal') && /moderation|safety|content.?polic|prohibited|blocked|not allowed|inappropriate/i.test(said)) {
      return new CE('refusal', T('ui.ai.img.err_refused', { who: p.who }), { status: e.status, detail: e.detail });
    }
    if (e.kind === 'key' && /verif/i.test(said)) return new CE('key', T('ui.ai.img.err_verify', { who: p.who }), { status: e.status, detail: e.detail });
    if (e.kind === 'model' && p.format === 'openai' && p.id !== 'openai') return new CE('model', T('ui.ai.img.err_no_images', { who: p.who }), { status: e.status, detail: e.detail });
    return e;
  }

  const blobOf = (b64, mime) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u], { type: mime || 'image/png' }); };

  async function generate(req, { signal } = {}) {
    const p = G.byId(req.provider);
    if (!p) throw new Error(T('ui.ai.img.err_pick'));
    if (p.generate) return p.generate(req, { signal });   // a registered provider (an on-device model) does it all itself
    const cs = C().keys.settings(), CE = C().CloudError;
    if (C().meter.over(cs.cap)) throw new CE('cap', C().meter.capText(cs.cap));
    const key = await C().keys.get(p.id);
    if (p.needsKey && !key) throw new CE('key', T('ui.ai.img.err_connect', { name: p.short }));
    if (!String(req.prompt || '').trim()) throw new Error(T('ui.ai.img.say_show'));
    const cp = C().byId(p.id) || { id: p.id, who: p.who }, base = ((cs.providers || {})[p.id] || {}).base || cp.base || '';
    const F = G.formats[p.format], notes = [];
    let r = Object.assign({ n: 1, aspect: '1:1' }, req, { prompt: G.promptOf(req.prompt, req.style), resolution: String(req.resolution || '1K').toUpperCase() });
    if (r.transparent && !p.transparent) { r.transparent = false; notes.push(`${p.short} cannot make a transparent background`); }
    if (p.format === 'openrouter') {
      const m = (await F.models({ signal }).catch(() => [])).find((x) => x.id === r.model);
      const f = F.fit(r, m); r = f.req; notes.push(...f.notes);
    }
    if (p.format === 'openai' && !r.image && !(r.w && r.h)) Object.assign(r, G.size(r.aspect, r.resolution));
    r.n = Math.max(1, Math.min(p.maxN || 1, Number(r.n) || 1));
    const cfg = { key, base, provider: p }, images = [], usage = { input: 0, output: 0, input_details: null, images: 0, cost: null };
    let left = r.n, text = '';
    while (left > 0) {
      const n = Math.min(left, F.perRequest || 1), { url, init } = F.build(Object.assign({}, r, { n }), cfg);
      init.signal = signal;
      let j;
      try { j = await (await C().call(url, init, { secret: key, provider: cp })).json(); } catch (e) { throw plainError(e, p); }
      const out = F.parse(j, r);
      if (out.failed) throw plainError(new CE('request', C().plain('request', p.who, { detail: C().redact(out.failed, key) }), { detail: C().redact(out.failed, key) }), p);
      text = out.text || text;
      for (const im of out.images) images.push(im.data ? { blob: blobOf(im.data, im.mime), mime: im.mime } : { blob: await (await fetch(im.url, { signal })).blob(), mime: '' });
      const u = out.usage || {};
      usage.input += u.input || 0; usage.output += u.output || 0; usage.images += u.images || out.images.length;
      if (u.input_details) usage.input_details = Object.assign({}, u.input_details);
      if (u.cost != null) usage.cost = (usage.cost || 0) + u.cost;
      if (!out.images.length) break;
      left -= out.images.length >= n ? n : left;
    }
    if (!images.length) {
      const said = !!text;
      throw new CE('refusal', T(said ? 'ui.ai.img.err_none_said' : 'ui.ai.img.err_none', { who: p.who, said: text.slice(0, 200) }));
    }
    const cost = G.costOf(p.id, r.model, usage, r);
    C().meter.add({ input: usage.input, output: usage.output, cost });
    images.forEach((im) => { if (!im.mime) im.mime = im.blob.type || 'image/png'; });
    return { images, usage, cost, notes, provider: p.id, model: r.model, who: p.who, short: p.short, request: r };
  }

  Object.assign(G, { connected, choose, generate, plainError, blobOf });
})();
