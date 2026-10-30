/* SlopNav descriptions: what each binding does, in plain words (in the chosen language), and the choices the modal offers.
 * Classic script; sets window.SlopNav.describe. Option values are strings (a select's value) and
 * parseOption turns them back into the binding's type. */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});
  const { label } = N.logic;
  const say = (k, v) => { const I = window.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/print.js (ui.nav.*)

  const WHEEL_OPTS = () => [['plain', say('ui.nav.opt.plain')], ['ctrl', say('ui.nav.opt.ctrl')], ['alt', say('ui.nav.opt.alt')], ['shift', say('ui.nav.opt.shift')], ['off', say('ui.nav.opt.off')]];
  const COMBO_OPTS = {
    fitKey: ['', 'Mod+0', 'Mod+Shift+0', 'Shift+1', 'Alt+0'],
    actualKey: ['', 'Mod+1', 'Shift+0', 'Alt+1'],
    zoomInKeys: ['', 'Mod+=', 'Alt+=', 'Shift+='],
    zoomOutKeys: ['', 'Mod+-', 'Alt+-', 'Shift+-'],
    handKey: ['', 'H', 'Alt+H'],
    clickZoomKey: ['', 'Mod+Space', 'Alt+Space'],
  };
  const BOOL_OPTS = () => [['true', say('ui.nav.opt.on')], ['false', say('ui.nav.opt.off')]];
  const OPTIONS = {
    zoomWheel: WHEEL_OPTS, panWheel: WHEEL_OPTS,
    spacePan: BOOL_OPTS, middlePan: BOOL_OPTS, touchPan: BOOL_OPTS,
    pinch: () => [['zoom', say('ui.nav.opt.zooms')], ['off', say('ui.nav.opt.off')]],
  };
  // The words, as keys (ui.nav.title.<binding>, ui.nav.does.<binding>.<value>, ui.nav.combo.<binding>), read each time.
  const snake = (name) => name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  const title = (name) => say('ui.nav.title.' + snake(name));
  const WORDED = ['zoomWheel', 'panWheel', 'spacePan', 'middlePan', 'pinch', 'touchPan'];
  const does = (name, v) => say('ui.nav.does.' + snake(name) + '.' + v);
  const comboWords = (name, c) => say('ui.nav.combo.' + snake(name), { key: label(c) });

  /** One line per binding: [{ name, title, text }]. Unset combos say so. */
  function describe(b) {
    return N.validate.KEYS.map((name) => {
      const v = b[name];
      let text;
      if (WORDED.includes(name)) text = does(name, String(v));
      else {
        const combos = (Array.isArray(v) ? v : [v]).filter(Boolean);
        text = combos.length ? combos.map((c) => comboWords(name, c)).join('; ') : say('ui.nav.unbound');
      }
      return { name, title: title(name), text };
    });
  }

  /** The choices for one binding as [value, label] string pairs. `current` is kept even when it is not listed. */
  function optionsFor(name, current) {
    const cur = Array.isArray(current) ? current[0] || '' : current;
    if (OPTIONS[name]) return OPTIONS[name]();
    const list = COMBO_OPTS[name] || [];
    const out = list.map((c) => [c, c ? label(c) : say('ui.nav.unbound')]);
    if (cur && !list.includes(cur)) out.push([cur, label(cur)]);
    return out;
  }
  /** Turns a select's string value back into the binding's type: bools, a one-item list for combos, or a choice. */
  function parseOption(name, str) {
    const s = N.validate.SPEC[name];
    if (!s) return undefined;
    if (s.kind === 'bool') return str === 'true';
    if (s.kind === 'combos') return str ? [str] : [];
    return str;
  }
  /** The select's current string value for a binding. */
  function valueOf(name, v) {
    if (Array.isArray(v)) return v[0] || '';
    return String(v);
  }

  N.describe = { describe, optionsFor, parseOption, valueOf, title };
})();
