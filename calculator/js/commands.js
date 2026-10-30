/* Slopculator commands for SlopCmd (the palette, shortcut editor and menu labels). Classic script, loaded after
 * shared/commands/commands.js. Every command calls window.SlopCalcApp, so the palette and the buttons do the same work. */
(function () {
  'use strict';
  const A = () => window.SlopCalcApp;
  const has = (fn) => () => !!(A() && fn());
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function register() {
    if (!window.SlopCmd) return;
    SlopCmd.init({ app: 'calculator' });
    SlopCmd.register([
      { id: 'calc.calculate', title: t('calculator.cmd.calculate'), group: t('calculator.cmd.group'), keys: [], keywords: ['equals', 'enter', 'result'], run: () => A().commit() },
      { id: 'calc.copy', title: t('calculator.app.copy'), group: t('calculator.cmd.group'), keys: ['Mod+Alt+C'], keywords: ['clipboard'], when: has(() => A().copyText() !== null), run: () => A().copyResult() },
      { id: 'calc.save', title: t('calculator.cmd.save'), group: t('menu.file'), keys: ['Mod+Alt+S'], keywords: ['drive', 'note', 'file'], when: has(() => A().copyText() !== null), run: () => A().saveDrive() },
      { id: 'calc.clear', title: t('calculator.cmd.clear'), group: t('calculator.cmd.group'), keys: [], keywords: ['reset', 'empty'], run: () => A().clearInput() },
      { id: 'calc.focus', title: t('calculator.cmd.focus'), group: t('calculator.cmd.group'), keys: ['Mod+Alt+K'], keywords: ['input', 'type'], run: () => A().focus() },
      { id: 'calc.ans', title: t('calculator.cmd.ans'), group: t('ui.mb.insert'), keys: [], keywords: ['previous', 'last'], run: () => A().insert('ans') },
      { id: 'calc.tax', title: t('calculator.cmd.tax'), group: t('ui.mb.insert'), keys: [], keywords: ['vat', 'sales'], run: () => A().insert('tax(') },
      { id: 'calc.discount', title: t('calculator.cmd.discount'), group: t('ui.mb.insert'), keys: [], keywords: ['sale', 'off'], run: () => A().insert('discount(') },
      { id: 'calc.markup', title: t('calculator.cmd.markup'), group: t('ui.mb.insert'), keys: [], keywords: ['margin', 'price'], run: () => A().insert('markup(') },
      { id: 'calc.tape-clear', title: t('calculator.cmd.tape_clear'), group: t('menu.edit'), keys: [], keywords: ['history', 'session'], run: () => A().clearTape() },
      { id: 'calc.rates', title: t('calculator.cmd.rates'), group: t('menu.edit'), keys: [], keywords: ['currency', 'fx', 'manual'], run: () => { const d = document.getElementById('sc-rates'); if (d) { d.open = true; document.getElementById('sc-rate-from').focus(); } } },
    ]);
  }

  /** The assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks. */
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  if (window.SlopCmd && SlopCmd.provide) SlopCmd.provide({ prepare: () => new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: new URL('ai-commands.js', HERE).href });
    s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(s);
  }) });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();
  // registered again on a language change, so the palette reads the new language
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(register);
})();
