/* SlopConfigDialog.makeAi: "Make one with AI…". It shows the prompt for the kind. When SlopAI has a local model loaded,
 * "Ask the local AI" fills the reply box; otherwise the person copies the prompt into any assistant and pastes the reply.
 * "Check reply" runs SlopConfig.parseAiReply and lists every problem. Only a reply that checked ok, and is unchanged
 * since, can be applied, and then through SlopConfig.applyValue (validate → apply). Loads after dialog.js. */
(function (g) {
  'use strict';
  const D = g.SlopConfigDialog, C = g.SlopConfig, UI = () => g.SlopUI;
  if (!D || !C || D.makeAi) return;
  const el = (...a) => UI().el(...a);
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/config.js

  function makeAi(o = {}) {
    const app = o.app || C.consts.SHARED_APP;
    const kinds = C.kinds(app);
    if (!kinds.length) { D.showResult({ ok: false, errors: [{ path: '', message: tr('ui.config.ai_no_kinds') }] }); return; }

    const kindSel = UI().select(kinds.map((e) => [e.kind, e.label]), kinds[0].kind);
    const request = el('textarea', { class: 'sui-input', rows: 3, placeholder: tr('ui.config.ai_example') });
    const prompt = el('textarea', { class: 'sui-input', rows: 8, readonly: true, 'aria-label': tr('ui.config.ai_prompt') });
    const reply = el('textarea', { class: 'sui-input', rows: 6, placeholder: tr('ui.config.ai_reply_ph'), 'aria-label': tr('ui.config.ai_reply') });
    const verdict = el('div', { class: 'sui-p', role: 'status', 'aria-live': 'polite' });
    const local = !!(g.SlopAI && g.SlopAI.ready);
    const askBtn = el('button', { class: 'sui-btn', type: 'button', hidden: !local }, tr('ui.config.ai_ask'));
    const copyBtn = el('button', { class: 'sui-btn', type: 'button' }, tr('ui.config.ai_copy'));
    const checkBtn = el('button', { class: 'sui-btn', type: 'button' }, tr('ui.config.ai_check'));
    const applyBtn = el('button', { class: 'sui-btn sui-primary', type: 'button', disabled: true }, tr('ui.config.ai_apply'));
    const notice = local
      ? tr('ui.config.ai_local')
      : tr('ui.config.ai_no_local');

    let checked = null; // { text, result } for the reply that was checked last
    let handle = null;

    const buildText = () => { try { return C.buildPrompt(kindSel.value, app, request.value); } catch (e) { return e.message; } };
    const refresh = () => { prompt.value = buildText(); };
    const setVerdict = (nodes) => verdict.replaceChildren(...nodes);
    const errorList = (errors) => el('ul', { class: 'sui-errors' }, errors.map((e) => el('li', null, e.path ? `${e.path}: ${e.message}` : e.message)));

    function forget() {
      checked = null;
      applyBtn.disabled = true;
    }

    function check() {
      const r = C.parseAiReply(reply.value, { app });
      checked = { text: reply.value, result: r };
      if (r.ok) {
        applyBtn.disabled = false;
        setVerdict([el('p', { class: 'sui-p' }, tr('ui.config.ai_valid', { name: r.value.name, kind: r.value.kind }))]);
      } else {
        applyBtn.disabled = true;
        setVerdict([el('p', { class: 'sui-p' }, tr('ui.config.ai_problems', { n: r.errors.length })), errorList(r.errors)]);
      }
    }

    async function ask() {
      if (!g.SlopAI || !g.SlopAI.ready) return;
      askBtn.disabled = true;
      forget();
      reply.value = '';
      setVerdict([el('p', { class: 'sui-p' }, tr('ui.config.ai_asking'))]);
      try {
        const stream = g.SlopAI.ask(buildText(), { persona: 'plain', temperature: 0.2, max_tokens: 1500 });
        for await (const piece of stream) reply.value += piece;
        setVerdict([el('p', { class: 'sui-p' }, tr('ui.config.ai_received'))]);
      } catch (e) {
        setVerdict([el('p', { class: 'sui-p' }, tr('ui.config.ai_stopped', { err: e.message }))]);
      }
      askBtn.disabled = false;
    }

    async function copy() {
      try { await navigator.clipboard.writeText(prompt.value); note(tr('ui.config.ai_copied')); } catch (e) { prompt.select(); note(tr('ui.config.ai_select')); }
    }

    async function apply() {
      if (!checked || !checked.result.ok || checked.text !== reply.value) { forget(); return; }
      applyBtn.disabled = true;
      const res = await C.applyValue(checked.result.value, { app });
      if (res.ok) { handle && handle.close(); D.showResult(res); } else { D.showResult(res); applyBtn.disabled = false; }
    }

    const note = (msg) => { try { UI().toast(msg); } catch (e) { /* no toast layer */ } };
    kindSel.addEventListener('change', () => { refresh(); forget(); });
    request.addEventListener('input', refresh);
    reply.addEventListener('input', () => { forget(); setVerdict([el('p', { class: 'sui-p' }, tr('ui.config.ai_check_hint'))]); });
    askBtn.addEventListener('click', ask);
    copyBtn.addEventListener('click', copy);
    checkBtn.addEventListener('click', check);
    applyBtn.addEventListener('click', apply);
    refresh();

    const body = el('div', null,
      el('p', { class: 'sui-p' }, notice),
      UI().field(tr('ui.config.kind'), kindSel),
      UI().field(tr('ui.config.ai_want'), request),
      UI().field(tr('ui.config.ai_prompt'), prompt),
      el('div', { class: 'sui-foot' }, copyBtn, askBtn),
      UI().field(tr('ui.config.ai_reply'), reply),
      el('div', { class: 'sui-foot' }, checkBtn, applyBtn),
      verdict);
    handle = UI().dialog({ title: o.title || tr('ui.config.ai_title'), body, cls: 'sui-wide', buttons: [{ label: tr('menu.close') }] });
  }

  D.makeAi = makeAi;
})(typeof window !== 'undefined' ? window : globalThis);
