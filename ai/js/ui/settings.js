/* Slop AI — ui/settings: personas (system prompts), the per-chat settings dialog (persona editor, temperature,
 * max tokens, "Control apps" tools) and the tool set for a conversation. */
'use strict';
(function (AI) {
  const K = AI.K, el = AI.el;
  AI.PERSONAS = {
    helper: { name: 'Helpful assistant', system: 'You are Slop AI, a helpful assistant that runs entirely on the user’s own device. Answer clearly and briefly. Use Markdown for lists and code.' }, // i18n-ignore: shown through AI.personaName (ai.persona.*); the prompts are for the model
    sloppo: { name: 'Sloppo', system: (window.SlopAI && SlopAI.SLOPPO) || 'You are Sloppo, a funny jelly slime. SLURP.' }, // i18n-ignore
    coder: { name: 'Code helper', system: 'You are a senior programmer. Give working code in fenced code blocks with the language name, then a short explanation. Prefer simple, dependency-free solutions.' }, // i18n-ignore
    writer: { name: 'Writing coach', system: 'You are a friendly writing coach. Improve the user’s text: keep their voice, make it clearer and shorter, and explain your main changes in a short list.' }, // i18n-ignore
    builder: { name: 'Mini-app builder', hidden: true, system: '' }, // filled by builder-prompts.js; i18n-ignore
    custom: { name: 'Custom…', system: '' }, // i18n-ignore
  };
  /** A persona's shown name (the English in PERSONAS is what the assistant's commands report). 'custom_short': «Custom». */
  AI.personaName = (id) => AI.t('ai.persona.' + id);
  const TOOL_NOTE = 'You are inside slopographic.com, a studio of browser apps. You can open apps, list them and save files to Slop Drive with the tools below.';

  AI.systemFor = function (c) {
    if (!c) return AI.PERSONAS.helper.system;
    let s = c.persona === 'custom' || c.system ? c.system || '' : (AI.PERSONAS[c.persona] || AI.PERSONAS.helper).system;
    if (c.tools) s += '\n\n' + TOOL_NOTE;
    return s.trim();
  };
  AI.toolsFor = function (c) {
    if (!c || !c.tools) return [];
    return K.appTools.build({ appId: 'ai', workspace: window.SlopWorkspace || null, confirm: (t, m) => window.SlopUI.confirm(t, m, AI.t('ai.chat.allow')) });
  };

  /** The settings dialog for conversation c (or the defaults for new chats when c is null). */
  AI.settingsDialog = function (c, { onSave } = {}) {
    const target = c || { persona: AI.prefs.persona, system: null, temperature: AI.prefs.temperature, maxTokens: AI.prefs.maxTokens, tools: AI.prefs.tools };
    const opts = Object.entries(AI.PERSONAS).filter(([, p]) => !p.hidden || target.persona === 'builder').map(([k]) => [k, AI.personaName(k)]);
    const sel = window.SlopUI.select(opts, target.system && target.persona !== 'builder' ? 'custom' : target.persona);
    const ta = el('textarea', { class: 'sui-input persona-text', rows: 7, 'aria-label': AI.t('ai.set.system') });
    const fill = () => { const p = AI.PERSONAS[sel.value]; ta.value = sel.value === 'custom' ? target.system || '' : (target.persona === sel.value && target.system) || p.system; };
    fill();
    sel.onchange = fill;
    ta.oninput = () => { if (sel.value !== 'custom' && ta.value !== AI.PERSONAS[sel.value].system) sel.value = 'custom'; };
    const temp = el('input', { type: 'range', min: 0, max: 1.5, step: 0.05, value: target.temperature, class: 'range', 'aria-label': AI.t('ai.set.temperature') });
    const tempV = el('b', { class: 'mono' }, Number(target.temperature).toFixed(2));
    temp.oninput = () => { tempV.textContent = Number(temp.value).toFixed(2); };
    const max = window.SlopUI.number(target.maxTokens, 16, 8192, 16);
    const tools = window.SlopUI.check(AI.t('ai.set.tools'), target.tools);
    const body = el('div', { class: 'settings' },
      window.SlopUI.field(AI.t('ai.set.persona'), sel), ta,
      el('label', { class: 'sui-field' }, el('span', { class: 'sui-label' }, AI.t('ai.set.temperature')), temp, tempV),
      el('p', { class: 'faint hint' }, AI.t('ai.set.temperature_hint')),
      window.SlopUI.field(AI.t('ai.set.max_tokens'), max, AI.t('ai.set.per_reply')),
      target.persona === 'builder' ? null : tools.el,
      el('p', { class: 'faint hint' }, AI.t(c ? 'ai.set.this_chat' : 'ai.set.defaults_hint')));
    return new Promise((res) => window.SlopUI.dialog({
      title: AI.t(c ? 'ai.set.title_chat' : 'ai.set.title_defaults'), body, cls: 'ai-dlg settings-dlg', onClose: res,
      buttons: [{ label: AI.t('menu.cancel') }, { label: AI.t('menu.save'), primary: true, act: async () => {
        const persona = sel.value, sys = ta.value.trim();
        Object.assign(target, {
          persona: persona === 'custom' ? 'custom' : persona,
          system: persona === 'custom' || sys !== (AI.PERSONAS[persona] || {}).system ? sys : null,
          temperature: Math.max(0, Math.min(2, +temp.value)), maxTokens: Math.max(16, Math.min(8192, Math.round(+max.value) || 1024)),
          tools: target.persona === 'builder' ? false : tools.input.checked,
        });
        if (c) await AI.db.put(c);
        else { Object.assign(AI.prefs, { persona: target.persona, temperature: target.temperature, maxTokens: target.maxTokens, tools: target.tools }); AI.savePrefs(); }
        if (onSave) onSave(target);
      } }],
    }));
  };
})(window.AI);
