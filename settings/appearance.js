/* Settings: the Appearance section. One radio per theme, each with a preview swatch. A choice applies at once on this page
 * and is stored through SlopTheme, which mirrors it into every app's own theme key. Classic script. Needs
 * shared/theme/theme.js (and shared/profile/profile.js), shared/i18n/i18n.js and settings/say.js loaded first. The names
 * follow a language switch (Light and Dark are keys; Classic 98 and Slopographic Lime are names). */
(function () {
  'use strict';
  var T = window.SlopTheme;
  var host = document.getElementById('theme-options');
  var note = document.getElementById('theme-note');
  var I = window.SlopI18n, Say = window.SlopSettingsSay;
  if (!T || !host) return;
  var NAMED = { light: 'settings.theme.light', dark: 'settings.theme.dark' };   // the plain themes' names are words (a profile's "<brand> Light" keeps its own)

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  /** A small preview of one theme's tokens. System shows the light half and the dark half. */
  function paint(box, t) {
    var tk = t.tokens;
    box.style.setProperty('--sw-bg', tk.background);
    box.style.setProperty('--sw-surface', tk.surface);
    box.style.setProperty('--sw-text', tk.text);
    box.style.setProperty('--sw-accent', tk.accent);
    box.style.setProperty('--sw-border', tk.border);
  }
  function swatch(choice) {
    var box = el('span', 'theme-swatch');
    box.setAttribute('aria-hidden', 'true');
    if (choice.id === T.SYSTEM) {
      var lightHalf = el('span', 'theme-half'), darkHalf = el('span', 'theme-half');
      paint(lightHalf, T.THEMES[0]);
      paint(darkHalf, T.THEMES[1]);
      box.appendChild(lightHalf);
      box.appendChild(darkHalf);
      return box;
    }
    paint(box, choice.theme);
    box.appendChild(el('span', 'theme-panel'));
    box.appendChild(el('span', 'theme-dot'));
    box.appendChild(el('span', 'theme-aa', 'Aa'));
    return box;
  }
  /** The choices in the current language: System first, then each theme. */
  function choices() {
    return [{ id: T.SYSTEM, name: I.t('shell.theme_system'), hint: I.t('settings.theme.system_hint') }].concat(T.THEMES.map(function (th) {
      return { id: th.id, name: NAMED[th.id] && !th.branded ? I.t(NAMED[th.id]) : th.name, theme: th, hint: I.t(th.scheme === 'dark' ? 'settings.theme.dark' : 'settings.theme.light') };
    }));
  }

  function sync() {
    var cur = T.get();
    host.querySelectorAll('input[name="theme"]').forEach(function (input) { input.checked = input.value === cur; });
  }
  function render() {
    host.textContent = '';
    choices().forEach(function (c) {
      var id = 'theme-' + c.id;
      var input = el('input');
      input.type = 'radio';
      input.name = 'theme';
      input.id = id;
      input.value = c.id;
      input.addEventListener('change', function () {
        var r = T.set(c.id);
        sync();
        if (r.ok) Say.key(note, 'settings.theme.saved', { name: c.name }); else Say.text(note, r.error);
      });
      var label = el('label', 'theme-opt');
      label.htmlFor = id;
      label.appendChild(input);
      label.appendChild(swatch(c));
      var text = el('span', 'theme-text');
      text.appendChild(el('span', 'theme-name', c.name));
      text.appendChild(el('span', 'theme-hint', c.hint));
      label.appendChild(text);
      host.appendChild(label);
    });
    sync();
  }
  render();
  I.on(render);   // the names and hints follow a language switch
})();
