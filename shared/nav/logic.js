/* SlopNav logic: pure decisions with no DOM. What a wheel event does, which key matches which
 * action, and which preset keys clash with the app's own shortcuts. Classic script; sets
 * window.SlopNav.logic. The engine (engine.js) applies these decisions to the canvas. */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});
  const { parseCombo, canonCombo } = N.validate;

  const KEY_ACTIONS = [
    ['fit', 'fitKey'], ['actual', 'actualKey'], ['zoomIn', 'zoomInKeys'], ['zoomOut', 'zoomOutKeys'], ['hand', 'handKey'],
  ];
  /** The binding name each keyboard action reads, for the modal and clash messages. */
  const ACTION_BINDING = { fit: 'fitKey', actual: 'actualKey', zoomIn: 'zoomInKeys', zoomOut: 'zoomOutKeys', hand: 'handKey', clickZoom: 'clickZoomKey' };

  /** Does a wheel choice ('plain', 'ctrl', 'alt', 'shift') match the held modifiers? Exact: no other modifier. */
  function wheelMatches(choice, ev) {
    const ctrl = !!(ev.ctrlKey || ev.metaKey), alt = !!ev.altKey, shift = !!ev.shiftKey;
    switch (choice) {
      case 'plain': return !ctrl && !alt && !shift;
      case 'ctrl': return ctrl && !alt && !shift;
      case 'alt': return alt && !ctrl && !shift;
      case 'shift': return shift && !ctrl && !alt;
      default: return false;
    }
  }
  /** Wheel delta in pixels (lines are 16px, pages 800px, as the browser reports them). */
  const px = (d, mode) => (mode === 1 ? d * 16 : mode === 2 ? d * 800 : d) || 0;

  /**
   * What a wheel event does under a bindings object.
   * Returns { kind: 'zoom', factor, live? } (factor > 0 around the pointer; live marks a trackpad pinch, applied at once), { kind: 'pan', dx, dy } (screen px),
   * or null. Ctrl alone is a trackpad pinch when pinch is 'zoom' and zoomWheel is not ctrl.
   */
  function wheelAction(b, ev) {
    if (!b || !ev) return null;
    const dy = px(ev.deltaY, ev.deltaMode), dx = px(ev.deltaX, ev.deltaMode);
    const ctrlOnly = !!(ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey;
    if (b.zoomWheel !== 'off' && wheelMatches(b.zoomWheel, ev)) {
      // A small ctrl-wheel delta is how browsers report a trackpad pinch: zoom it more gently.
      const trackpad = ctrlOnly && Math.abs(dy) < 50, k = trackpad ? 0.01 : 0.002;
      return { kind: 'zoom', factor: Math.exp(-dy * k), live: trackpad };
    }
    if (b.pinch === 'zoom' && ctrlOnly) return { kind: 'zoom', factor: Math.exp(-dy * 0.01), live: true };
    if (b.panWheel !== 'off' && wheelMatches(b.panWheel, ev)) {
      if (b.panWheel === 'shift') return { kind: 'pan', dx: -(dy || dx), dy: 0 };
      return { kind: 'pan', dx: -dx, dy: -dy };
    }
    return null;
  }

  /** Does a key combo match a keydown or keyup event? Modifiers must match exactly ("=" and "-" ignore Shift). */
  function comboMatches(combo, ev) {
    const p = parseCombo(combo);
    if (!p) return false;
    if (p.mod !== !!(ev.ctrlKey || ev.metaKey) || p.alt !== !!ev.altKey) return false;
    if (p.key !== '=' && p.key !== '-' && p.shift !== !!ev.shiftKey) return false;
    const code = ev.code || '', key = ev.key || '';
    const k = p.key;
    if (k === 'Space') return code === 'Space';
    if (/^[0-9]$/.test(k)) return code === 'Digit' + k || code === 'Numpad' + k;
    if (/^[A-Z]$/.test(k)) return code === 'Key' + k || key.toUpperCase() === k;
    if (k === '=') return code === 'Equal' || code === 'NumpadAdd' || key === '=' || key === '+';
    if (k === '-') return code === 'Minus' || code === 'NumpadSubtract' || key === '-' || key === '_';
    if (k === '[') return code === 'BracketLeft' || key === '[';
    if (k === ']') return code === 'BracketRight' || key === ']';
    return false;
  }

  /** The keyboard action a keydown means under a bindings object, or null. Order: fit, 100%, zoom, hand. */
  function keyAction(b, ev) {
    if (!b || !ev) return null;
    for (const [action, name] of KEY_ACTIONS) {
      const combos = Array.isArray(b[name]) ? b[name] : [b[name]];
      if (combos.some((c) => c && comboMatches(c, ev))) return { action };
    }
    return null;
  }

  /**
   * Preset keys that clash with the app's own shortcuts. shortcuts: [{ combo, title, action? }], where
   * action is the same names keyAction returns. A shortcut that does the same action is not a clash.
   * Returns [{ binding, combo, title }], one per clashing binding.
   */
  function clashes(b, shortcuts) {
    const out = [];
    if (!b || !Array.isArray(shortcuts)) return out;
    const combosOf = (name) => (Array.isArray(b[name]) ? b[name] : [b[name]]).filter(Boolean);
    const pairs = Object.keys(ACTION_BINDING).map((action) => [action, ACTION_BINDING[action]]);
    for (const [action, name] of pairs) {
      for (const combo of combosOf(name)) {
        const c = canonCombo(combo);
        for (const s of shortcuts) {
          if (!s || canonCombo(s.combo) !== c) continue;
          if (s.action === action) continue;
          out.push({ binding: name, action, combo: c, title: s.title || s.combo });
        }
      }
    }
    return out;
  }

  /** Short readable form of a combo for the UI: "Mod+Shift+=" → "Ctrl/⌘+Shift+=". */
  function label(combo) {
    if (!combo) return '';
    return String(combo).replace(/\bMod\b/g, 'Ctrl/⌘').replace(/\bAlt\b/g, 'Alt/⌥').replace(/\bSpace\b/g, 'Space');
  }

  N.logic = { wheelMatches, wheelAction, comboMatches, keyAction, clashes, label, ACTION_BINDING };
})();
