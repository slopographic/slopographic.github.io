/* Slop Press — command registry. Every menu item, tool and style command is one command:
   { id, title, group, keys:['Mod+S'], run(), when(), checked(), keywords }.
   Commands are registered with the shared SlopCmd palette/keymap (shared/commands/) when it is present;
   until then a small built-in dispatcher handles the same key bindings. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util;
  var A = PR.actions = { defs: {}, order: [], bound: false };
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  function script(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = new URL(src, HERE).href; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); }; document.head.append(s);
    });
  }
  /** The assistant's commands with arguments (ai-build.js, ai-commands.js, shared/commands/sources.js), loaded when SlopCmd.prepare() asks. */
  A.prepareAI = function () {
    if (PR.aiPress && PR.aiPress.loaded) return Promise.resolve();
    return (window.SlopCmdSources ? Promise.resolve() : script('../../../shared/commands/sources.js'))
      .then(function () { return script('ai-build.js'); }).then(function () { return script('ai-commands.js'); }).then(function () { PR.aiPress.loaded = true; });
  };

  /** title and group are keys ('press.cmd.file_new', 'menu.file') or functions: read in the current language on every use. */
  var KEY = /^(press|menu|ui)\.[a-z0-9_.]+$/;
  function words(c) {
    ['title', 'group'].forEach(function (f) {
      var v = c[f];
      if (typeof v !== 'function' && !(typeof v === 'string' && KEY.test(v))) return;
      Object.defineProperty(c, f, { enumerable: true, configurable: true, get: typeof v === 'function' ? v : function () { return U.t(v); } });
    });
  }
  A.register = function (list) {
    [].concat(list).forEach(function (c) {
      if (!c || !c.id) return;
      words(c);
      if (!A.defs[c.id]) A.order.push(c.id);
      A.defs[c.id] = c;
    });
    if (A.bound && window.SlopCmd) toSlopCmd(list);
  };
  A.unregister = function (id) {
    delete A.defs[id]; A.order = A.order.filter(function (x) { return x !== id; });
    if (A.bound && window.SlopCmd && window.SlopCmd.unregister) window.SlopCmd.unregister(id);
  };
  A.get = function (id) { return A.defs[id]; };
  A.enabled = function (id) { var c = A.defs[id]; try { return !!c && (!c.when || !!c.when()); } catch (e) { return false; } };
  A.checked = function (id) { var c = A.defs[id]; try { return !!(c && c.checked && c.checked()); } catch (e) { return false; } };
  A.run = function (id, ctx) {
    var c = A.defs[id];
    if (!c) return false;
    if (!A.enabled(id)) return false;
    try { var r = c.run(ctx || {}); PR.emit('action', id); return r === undefined ? true : r; } catch (e) { console.error(e); U.toast(U.t('press.app.went_wrong', { error: e.message })); return false; }
  };

  /* ---------- key labels ---------- */
  function label(k) {
    if (!k) return '';
    return k.split(' ').map(function (chord) {
      return chord.split('+').map(function (p) {
        var m = { Mod: U.IS_MAC ? '⌘' : 'Ctrl', Shift: U.IS_MAC ? '⇧' : 'Shift', Alt: U.IS_MAC ? '⌥' : 'Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Delete: 'Del', Backspace: '⌫', Escape: 'Esc', PageUp: 'PgUp', PageDown: 'PgDn' }[p];
        return m || p;
      }).join(U.IS_MAC ? '' : '+');
    }).join(' ');
  }
  A.keyFor = function (id) {
    if (A.bound && window.SlopCmd && window.SlopCmd.keyFor) { try { var k = window.SlopCmd.keyFor(OWN[id] || id); if (k != null) return k; } catch (e) { /* fall back */ } }
    var c = A.defs[id]; return c && c.keys && c.keys.length ? label(c.keys[0]) : '';
  };

  /* ---------- SlopCmd ---------- */
  // the palette and keymap commands belong to SlopCmd itself
  var OWN = { 'help.search': 'cmd.palette', 'help.shortcuts': 'cmd.keymap' };
  function toSlopCmd(list) {
    try {
      window.SlopCmd.register([].concat(list).filter(function (c) { return c && !OWN[c.id]; }).map(function (c) {
        return { id: c.id, title: c.title, group: c.group, keys: c.keys || [], keywords: c.keywords, icon: c.icon,
          when: function () { return A.enabled(c.id); }, checked: c.checked ? function () { return A.checked(c.id); } : undefined,
          run: function () { return A.run(c.id); } };
      }));
    } catch (e) { console.warn('SlopCmd register failed', e); }
  }
  /** Hands every command to SlopCmd (if loaded). Safe to call more than once. */
  A.bindSlopCmd = function () {
    if (A.bound || !window.SlopCmd || !window.SlopCmd.register) return false;
    try { if (window.SlopCmd.init) window.SlopCmd.init({ app: 'press' }); } catch (e) { /* already initialised */ }
    A.bound = true;
    if (window.SlopCmd.provide) window.SlopCmd.provide({ prepare: A.prepareAI });
    toSlopCmd(A.order.map(function (id) { return A.defs[id]; }));
    if (window.SlopCmd.on) window.SlopCmd.on('change', function () { PR.emit('keys'); });
    PR.emit('keys');
    return true;
  };
  /** Loads shared/commands/ on demand when the page did not include it. */
  // a language change: the palette and the shortcut list read the titles again
  U.onLang(function () { if (A.bound && window.SlopCmd) toSlopCmd(A.order.map(function (id) { return A.defs[id]; })); PR.emit('keys'); });
  A.loadSlopCmd = function () {
    if (window.SlopCmd) return Promise.resolve(A.bindSlopCmd());
    if (!window.SlopHub || !window.SlopHub.loadScript || location.protocol === 'file:') return Promise.resolve(false);
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('shared/commands/commands.css', window.SlopHub.ROOT).href;
    return window.SlopHub.loadScript('shared/commands/commands.js').then(function () { document.head.append(css); return A.bindSlopCmd(); }).catch(function () { return false; });
  };
  A.palette = function () {
    if (window.SlopCmd && window.SlopCmd.open) { A.bindSlopCmd(); return window.SlopCmd.open(); }
    if (PR.ui && PR.ui.miniPalette) return PR.ui.miniPalette();
  };
  A.keymap = function () {
    if (window.SlopCmd && window.SlopCmd.openKeymap) { A.bindSlopCmd(); return window.SlopCmd.openKeymap(); }
    if (PR.ui && PR.ui.shortcutList) return PR.ui.shortcutList();
  };

  /* ---------- built-in dispatcher (only while SlopCmd is absent) ---------- */
  var CODES = { Period: '.', Comma: ',', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backslash: '\\', Slash: '/', Backquote: '`' };
  function eventKey(e) {
    var k = e.key, mod = e.ctrlKey || e.metaKey;
    if (/^(Shift|Alt|Control|Meta)$/.test(k)) return null;
    if (k === ' ') k = 'Space';
    // with modifiers, use the physical key (Shift/Alt change e.key: '>' for Shift+., '–' for Alt+- on a Mac)
    if (e.code && (e.shiftKey || e.altKey || mod)) {
      if (CODES[e.code]) k = CODES[e.code];
      else if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
      else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
    }
    if (k.length === 1) k = k.toUpperCase();
    var parts = [];
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (mod) parts.push('Mod');
    parts.push(k);
    return parts.join('+');
  }
  function norm(b) { var p = b.split('+'), k = p.pop(); if (k.length === 1) k = k.toUpperCase(); return p.sort().concat(k).join('+'); }
  A.match = function (e) {
    var ek = eventKey(e); if (!ek) return null;
    var nk = norm(ek);
    for (var i = 0; i < A.order.length; i++) {
      var c = A.defs[A.order[i]];
      if (c && c.keys && c.keys.some(function (k) { return norm(k) === nk; })) return c;
    }
    return null;
  };
  document.addEventListener('keydown', function (e) {
    if (A.bound) return; // SlopCmd dispatches
    if (e.defaultPrevented) return;
    if (window.SlopUI && window.SlopUI.openDialogs > 0) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.sui-menu')) return;
    var c = A.match(e); if (!c) return;
    var mod = e.ctrlKey || e.metaKey;
    if (window.SlopTyping && window.SlopTyping.yields(e)) return;   // a field keeps its keys, Ctrl+A/C/V/Z too (shared/input/typing.js)
    if (!A.enabled(c.id)) { if (mod) e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation();
    A.run(c.id);
  }, true);
  A.label = label;
})();
