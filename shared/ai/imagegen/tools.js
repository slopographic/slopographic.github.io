/* SlopAIKit imageTools: generate_image and edit_image for the one tool list (shared/ai/apptools.js adds every set in
 * SlopAIKit.toolSets), so any app's AI panel can make pictures when a picture provider is connected with the person's
 * own key. Classic script; needs imagegen/core.js, run.js, pixels.js.
 *   imageTools.build(env) → [generate_image, edit_image]   (none when no provider can make pictures and the chat model
 *        is on this device; with a chat provider and no picture provider, calling them says how to add one)
 *   imageTools.make(request, { file, target, sink, hub, signal }) → { text, out, images }: one request start to finish
 *   imageTools.deliver(images, { target, name, sink, hub }) → the sentence for the model and the panel
 * Where a picture goes: the page's sink (window.SlopImageSink: PhotoSlop puts it in a new layer or a new document),
 * else Slop Drive (from 'ai'), where every app opens it through the intake (open_app with file).
 * Asking: through the one permission module (shared/ai/permissions.js, kind 'spend-image', never covered by "allow app
 * changes"): the question names the provider, the model, the size and the price per picture when it is known; before()
 * picks the provider first, so the question can say who makes it. The prompt (and for an
 * edit, a copy of the picture) goes to the provider named there, whose terms apply. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = K.imageGen;
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const PERMISSION = { kind: 'spend-image', get title() { return T('ui.ai.img.spend'); } };   // the question's title, read when asked
  const TARGETS = ['layer', 'document', 'drive'];
  const money = (c) => (c == null ? '' : c === 0 ? T('ui.ai.img.free') : c < 0.005 ? T('ui.ai.cloud.money_lt') : T('ui.ai.cloud.money_about', { amount: (window.SlopI18n ? SlopI18n.num(c, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : c.toFixed(2)) }));
  const short = (s, n = 48) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fileName = (prompt, i, n) => 'ai-' + (short(prompt, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'picture') + (n > 1 ? '-' + (i + 1) : '') + '.png';

  /** The request the model asked for, cleaned: unknown values fall back to the last choices. */
  function request(a, edit) {
    const s = G.settings(), cur = G.current || {}, pick = (v, list, d) => (list.includes(String(v)) ? String(v) : d);
    return { prompt: String(a.prompt || '').trim(), provider: a.provider && G.byId(a.provider) ? a.provider : cur.provider, model: a.model || (a.provider && a.provider !== cur.provider ? '' : cur.model),
      aspect: pick(a.aspect, G.ASPECTS, s.aspect || '1:1'), resolution: pick(String(a.resolution || '').toUpperCase(), G.RESOLUTIONS, s.resolution || '1K'),
      quality: pick(a.quality, ['low', 'medium', 'high'], s.quality || 'medium'), style: pick(a.style, Object.keys(G.STYLES), 'none'),
      n: Math.max(1, Math.min(4, Math.round(Number(a.n) || 1))), transparent: a.transparent === true || a.transparent === 'true', edit: !!edit };
  }
  function describe(r) {
    const p = G.byId(r.provider);
    if (!p) return null;
    const m = G.model(p.id, r.model) || { name: r.model || T('ui.ai.img.default_model') }, est = G.estimate(r);
    const px = p.format === 'openai' && !r.edit ? G.size(r.aspect, r.resolution) : null;
    const size = r.edit ? (r.image ? `${r.image.width} × ${r.image.height} px` : T('ui.ai.img.own_shape')) : px ? `${px.w} × ${px.h} px` : `${r.aspect}, ${r.resolution}`;
    const price = est.perImage != null ? T('ui.ai.img.per_picture', { each: money(est.perImage) }) + (est.exact ? '' : ' ' + T('ui.ai.img.estimate')) : T('ui.ai.img.price_before', { why: est.note });
    return { p, m, size, price, est };
  }
  function confirmText(r, sourceWords) {
    const d = describe(r);
    if (!d) return T('ui.ai.img.none_short');
    const v = { n: r.n, name: d.p.short, model: d.m.name || d.m.id, size: d.size, price: d.price, who: d.p.who };
    const what = T(r.edit ? 'ui.ai.img.ask_edit' : 'ui.ai.img.ask_make', v);
    return `${what} ${T((sourceWords ? 'ui.ai.img.goes_copy' : 'ui.ai.img.goes') + (d.p.local ? '_local' : ''), v)}`;
  }

  async function deliver(images, { target, name = 'AI picture', sink = window.SlopImageSink, hub = window.SlopHub, prompt = '' } = {}) {
    if (sink && target !== 'drive' && (sink.targets || TARGETS).includes(target)) return sink.place(images, { target, name });
    if (!hub || !hub.put) throw new Error(T('ui.ai.img.no_drive'));
    const names = [];
    for (let i = 0; i < images.length; i++) { const n = fileName(prompt || name, i, images.length); await hub.put(images[i].blob, { name: n, from: 'ai' }); names.push(n); }
    return `Saved ${names.map((n) => `“${n}”`).join(', ')} to Slop Drive. Any app opens ${names.length > 1 ? 'them' : 'it'} from there (open_app with the file name).`;
  }

  /** The picture an edit starts from: the page's sink (PhotoSlop: the active layer and the selection), a Slop Drive file. */
  async function source(file, env) {
    const sink = env.sink !== undefined ? env.sink : window.SlopImageSink;
    if (sink && sink.source && (!file || /^(open|current|layer|selection|this)$/i.test(String(file)))) return sink.source();
    if (!file) throw new Error(T('ui.ai.img.which_file'));
    const f = await K.appTools.findFile(env.hub !== undefined ? env.hub : window.SlopHub, file);
    if (!/^image\//.test(f.type || f.blob.type || '')) throw new Error(T('ui.ai.img.not_picture', { name: f.name }));
    return { canvas: await createImageBitmap(f.blob), selection: null, name: f.name };
  }

  const SCHEMA = (edit) => ({ type: 'object', required: ['prompt'], properties: Object.assign({
    prompt: { type: 'string', description: edit ? 'what to change, in plain words' : 'what the picture shows, in detail' } },
  edit ? { file: { type: 'string', description: 'Slop Drive picture name, or "layer" for the app’s active layer (its selection is kept as the area to change)' } } : {
    aspect: { type: 'string', enum: G.ASPECTS, description: 'width:height' }, resolution: { type: 'string', enum: G.RESOLUTIONS, description: '1K is about 1 megapixel' },
    style: { type: 'string', enum: Object.keys(G.STYLES) }, n: { type: 'integer', minimum: 1, maximum: 4 }, transparent: { type: 'boolean', description: 'transparent background (PNG)' } },
  { quality: { type: 'string', enum: ['low', 'medium', 'high'] }, target: { type: 'string', enum: TARGETS, description: 'layer or document (in a picture editor), or drive (Slop Drive)' },
    provider: { type: 'string', description: 'who makes it: openai, gemini, openrouter, … (default: the one connected)' }, model: { type: 'string' } }) });

  function tool(edit, env) {
    const sink = env.sink !== undefined ? env.sink : window.SlopImageSink;
    const where = sink ? `By default it arrives as a new layer in ${sink.name || 'this app'}` : 'It is saved to Slop Drive';
    return {
      name: edit ? 'edit_image' : 'generate_image', schema: SCHEMA(edit), permission: PERMISSION,
      params: Object.assign({ prompt: { type: 'string', required: true, description: edit ? 'what to change' : 'what the picture shows' } }, edit ? { file: { type: 'string', description: 'Slop Drive picture, or "layer"' } } : { aspect: { type: 'string', description: G.ASPECTS.join(' | ') } }, { target: { type: 'string', description: TARGETS.join(' | ') } }),
      description: edit ? `Change a picture with an image model at the person’s own provider (prompt + picture → picture; a selection limits the change). ${where}. The person is asked first and sees the price.`
        : `Make a new picture (photo, illustration, painting …) from a prompt with an image model at the person’s own provider. You cannot draw pictures yourself: use this. ${where}. The person is asked first and sees the price.`,
      // It spends money at the provider: tools.dispatch asks through the permission module (kind 'spend-image') after
      // before() has found the provider (a key added after the panel opened counts too), so the price can be shown.
      before: async () => { if (!G.current || !G.byId(G.current.provider)) await G.choose(); },
      confirmTitle: () => PERMISSION.title + '?',
      confirmText: (a) => confirmText(request(a, edit), edit),
      label: (a) => T(edit ? 'ui.ai.img.step_edit' : 'ui.ai.img.step_make', { prompt: short(a.prompt, 40) }),
      run: async (a, runEnv = {}) => {
        if (!G.current || !G.byId(G.current.provider)) await G.choose();
        const r = request(a, edit);
        if (!r.provider) throw new Error(G.noneText());
        const m = await make(r, { file: a.file, target: a.target, sink, hub: env.hub !== undefined ? env.hub : window.SlopHub, env: Object.assign({}, env, runEnv) });
        return m.text;
      },
    };
  }

  /** One request from start to finish (the tools and the "Generate image…" dialog): the source picture for an edit,
   * the provider, the result put back and delivered. → { text (for the model and the panel), out, placed } */
  async function make(r, { file, target, sink = window.SlopImageSink, hub = window.SlopHub, env = {}, signal } = {}) {
    r = Object.assign({}, r);
    if (!r.model) r.model = (G.byId(r.provider).models[0] || {}).id || '';
    let src = null;
    if (r.edit) { src = await source(file, Object.assign({ sink, hub }, env)); Object.assign(r, await G.prepare(src.canvas, { selection: src.selection })); }
    const out = await G.generate(r, { signal });
    const images = src ? await G.putBack(out.images, src, out) : out.images;
    const to = TARGETS.includes(target) ? target : sink ? 'layer' : 'drive';
    const placed = await deliver(images, { target: to, name: (r.edit ? 'AI edit: ' : 'AI: ') + short(r.prompt, 28), sink, hub, prompt: r.prompt });
    const d = describe(out.request) || { size: '' }, n = images.length;
    const text = `${r.edit ? 'Edited' : 'Made'} ${n} picture${n > 1 ? 's' : ''} with ${out.short} ${out.model}${d.size ? ' (' + d.size + ')' : ''}${out.cost != null ? ' · ' + money(out.cost) : ' · cost not reported'}. ${placed}${out.notes.length ? ' Note: ' + out.notes.join('; ') + '.' : ''}`;
    return { text, out, placed, images };
  }

  /** An edit's result in the source's size; with a selection, changed only inside it. */
  G.putBack = async function (images, src, out) {
    const w = src.canvas.width, h = src.canvas.height, back = [];
    for (const im of images) {
      let c = await G.fit(im.blob, w, h);
      if (src.selection) c = G.keepInside(src.canvas, c, src.selection);
      back.push({ blob: await G.toBlob(c), mime: 'image/png', canvas: c });
    }
    return back;
  };
  G.noneText = () => T('ui.ai.img.none_text');

  function build(env = {}) {
    if (G.choose) G.choose().catch(() => null);   // a key added since: offered from the next request on
    if (!(G.available || []).length && !env.look) return [];   // a model on this device and no picture provider: nothing to offer
    return [tool(false, env), tool(true, env)];
  }

  K.imageTools = { build, make, source, deliver, request, confirmText, describe, fileName, PERMISSION, TARGETS, money };
  (K.toolSets = K.toolSets || []).push((env) => build(env));
})();
