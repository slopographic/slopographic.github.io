/* SlopAIKit imageGen dialog: "Generate image…" and "Edit with AI…" for any app (PhotoSlop's Layer menu uses it). Classic
 * script on SlopUI.dialog; needs index.js loaded (await SlopAIKit.imageGenReady) and imageTools (tools.js).
 *   imageGen.dialog({ mode: 'generate' | 'edit', sink, hub, args }) → Promise<{ text, out } | null>
 * The person picks who makes the picture (only providers whose key is in this browser), the model, the size, the
 * quality, a style and how many; the price per picture shows when the provider publishes one. The dialog says which
 * provider receives the prompt (and, for an edit, a copy of the layer) and that its terms apply. Generate is the
 * person's go-ahead, so no second question follows; × or Cancel while it runs stops the request. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = K.imageGen, IT = () => K.imageTools;
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const LABEL = { layer: 'ui.ai.img.to_layer', document: 'ui.ai.img.to_document', drive: 'ui.ai.img.to_drive' };   // where it goes: keys

  async function dialog({ mode = 'generate', sink = window.SlopImageSink, hub = window.SlopHub, args = {} } = {}) {
    const UI = window.SlopUI, el = UI.el, edit = mode === 'edit';
    const list = await G.connected(), cur = (await G.choose(args)) || {}, s = G.settings();
    const body = el('div', { class: 'sig-body' });
    if (!list.length) {
      body.append(el('p', { class: 'sui-p' }, T('ui.ai.img.none_1')), el('p', { class: 'sui-p' }, T('ui.ai.img.none_2')));
      return new Promise((res) => UI.dialog({ title: T(edit ? 'ui.ai.img.title_edit' : 'ui.ai.img.title_make'), body, cls: 'sig-dlg', onClose: () => res(null),
        buttons: [{ label: T('menu.close') }, { label: T('ui.ai.img.open_panel'), primary: true, act: () => { if (window.SlopHeader && SlopHeader.openAI) SlopHeader.openAI(); else if (window.SlopAIPanel) SlopAIPanel.open(); } }] }));
    }
    const prompt = el('textarea', { class: 'sui-input sig-prompt', rows: 4, placeholder: T(edit ? 'ui.ai.img.ph_edit' : 'ui.ai.img.ph_make'), 'aria-label': T(edit ? 'ui.ai.img.what_change' : 'ui.ai.img.prompt'), style: 'width:100%;box-sizing:border-box;margin-bottom:10px' });
    prompt.value = args.prompt || '';
    const provider = UI.select(list.map((p) => [p.id, p.short]), cur.provider);
    const model = UI.select([], '');
    const aspect = UI.select(G.ASPECTS.map((a) => [a, a]), args.aspect || s.aspect);
    const res = UI.select(G.RESOLUTIONS.map((r) => [r, r === '1K' ? T('ui.ai.img.res_1k') : r]), args.resolution || s.resolution);
    const quality = UI.select([['low', T('ui.ai.img.q_low')], ['medium', T('ui.ai.img.q_medium')], ['high', T('ui.ai.img.q_high')]], args.quality || s.quality);
    const style = UI.select(Object.keys(G.STYLES).map((k) => [k, T('ui.ai.img.style_' + k.replace('-', '_'))]), args.style || s.style);
    const count = UI.number(Number(args.n) || 1, 1, 4);
    const clear = UI.check(T('ui.ai.img.transparent'), !!args.transparent);
    const targets = sink ? (sink.targets || ['layer', 'document', 'drive']) : ['drive'];
    const target = UI.select(targets.map((t) => [t, LABEL[t] ? T(LABEL[t]) : t]), targets.includes(args.target) ? args.target : targets[0]);
    const cost = el('p', { class: 'sui-p sig-cost', role: 'status' }), who = el('p', { class: 'sui-p sig-who' }), msg = el('p', { class: 'sui-p sig-msg', role: 'alert' });
    const rows = { aspect: UI.field(T('ui.ai.img.shape'), aspect), quality: UI.field(T('ui.ai.img.quality'), quality), clear: clear.el };
    body.append(...[prompt, UI.field(T('ui.ai.img.made_by'), provider), UI.field(T('ui.ai.cloud.model'), model), edit ? null : rows.aspect, UI.field(T('ui.ai.img.size'), res), rows.quality, UI.field(T('ui.ai.img.style'), style),
      edit ? null : UI.field(T('ui.ai.img.pictures'), count), edit ? null : rows.clear, UI.field(T('ui.ai.img.put_in'), target), cost, who, msg].filter(Boolean));
    let fetched = [];

    const req = () => ({ provider: provider.value, model: model.value, prompt: prompt.value, aspect: aspect.value, resolution: res.value, quality: quality.value, style: style.value,
      n: edit ? 1 : Math.max(1, Math.min(4, Number(count.value) || 1)), transparent: !edit && clear.input.checked, edit });
    function fillModels() {
      const p = G.byId(provider.value), keep = (G.settings().models || {})[p.id] || cur.model;
      let ms = G.models(p.id, fetched.length && p.id === 'openrouter' ? fetched.filter((m) => (edit ? m.edits : m.generates)) : null);
      if (!ms.length) ms = [{ id: keep || '', name: keep || T('ui.ai.img.server_default') }];
      model.textContent = '';
      for (const m of ms) model.append(el('option', { value: m.id }, (m.name || m.id) + (m.note ? ` (${m.note})` : '')));
      if (keep && ms.some((m) => m.id === keep)) model.value = keep;
      rows.quality.hidden = !p.quality; rows.clear.hidden = edit || !p.transparent;
      update();
    }
    function update() {
      const r = req(), p = G.byId(r.provider), d = IT().describe(r), est = G.estimate(r, fetched);
      const sz = d ? ` · ${d.size}` : '';
      cost.textContent = est.perImage != null ? T(r.n > 1 ? 'ui.ai.img.price_n' : 'ui.ai.img.price', { each: IT().money(est.perImage), total: IT().money(est.total), n: r.n, est: est.exact ? '' : ' ' + T('ui.ai.img.estimate'), size: sz })
        : T('ui.ai.img.price_unknown', { why: est.note, size: sz });
      const v = { who: p.who, name: p.short };
      who.textContent = p.local ? T(edit ? 'ui.ai.img.who_local_edit' : 'ui.ai.img.who_local', v)
        : T(edit ? 'ui.ai.img.who_edit' : 'ui.ai.img.who', v) + (p.help ? ' ' + p.help : '') + (edit && !p.mask ? ' ' + T('ui.ai.img.no_mask', v) : '');
    }
    provider.addEventListener('change', () => { fillModels(); if (provider.value === 'openrouter' && !fetched.length) loadRouter(); });
    [model, aspect, res, quality, style, count, clear.input].forEach((x) => x.addEventListener('change', update));
    count.addEventListener('input', update);
    async function loadRouter() { try { fetched = await G.formats.openrouter.models(); fillModels(); } catch (e) { /* the defaults stay */ } }
    fillModels();
    if (provider.value === 'openrouter') loadRouter();

    let ctl = null;
    return new Promise((done) => {
      let result = null;
      UI.dialog({ title: T(edit ? 'ui.ai.img.title_edit' : 'ui.ai.img.title_make'), body, cls: 'sig-dlg',
        onClose: () => { if (ctl) ctl.abort(); done(result); },
        buttons: [{ label: T('menu.cancel') }, { label: T(edit ? 'ui.ai.img.do_edit' : 'ui.ai.img.do_make'), primary: true, act: async () => {
          const r = req();
          if (!r.prompt.trim()) { msg.textContent = T(edit ? 'ui.ai.img.say_change' : 'ui.ai.img.say_show'); prompt.focus(); return false; }
          G.save({ provider: r.provider, models: Object.assign({}, G.settings().models, { [r.provider]: r.model }), aspect: r.aspect, resolution: r.resolution, quality: r.quality, style: r.style });
          msg.textContent = T(edit ? 'ui.ai.img.editing' : 'ui.ai.img.making');
          ctl = new AbortController();
          try { result = await IT().make(r, { target: target.value, sink, hub, signal: ctl.signal }); ctl = null; const o = result.out || {}; UI.toast(T(r.edit ? 'ui.ai.img.done_edit' : 'ui.ai.img.done_make', { n: (result.images || []).length || 1, name: o.short || '', cost: o.cost != null ? IT().money(o.cost) : T('ui.ai.img.cost_unknown') })); return true; } catch (e) {
            ctl = null;
            msg.textContent = (K.cloud && K.cloud.redact ? K.cloud.redact(e && e.message) : e && e.message) || T('ui.ai.img.went_wrong');
            return false;
          }
        } }] });
      setTimeout(() => prompt.focus(), 0);
    });
  }

  G.dialog = dialog;
})();
