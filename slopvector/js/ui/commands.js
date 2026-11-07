/* SlopVector — ui: every action, tool and canvas key as a SlopCmd command (shared/commands), so the
 * Spotlight palette (⌘K) finds them and every shortcut can be rebound. Without SlopCmd the legacy
 * keymap in tools/keys.js keeps working. Context keys (Space, Esc, Enter, clipboard) stay in keys.js. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, D = SV.dom;
  var UI = SV.ui = SV.ui || {};
  var $ = UI._p = UI._p || {};
  var A = $.A, act = $.act;
  function keyLabel() { return $.keyLabel.apply(this, arguments); }
  SV.cmdOn = false;

  var t = SV.t;
  /** The palette groups: the menu titles (keys), read on every registration so they follow a language switch. */
  var GROUPS = { file: 'menu.file', edit: 'menu.edit', object: 'vector.menu.object', arrange: 'vector.menu.object', transform: 'vector.menu.object', compound: 'vector.menu.object', pf: 'vector.menu.object', type: 'vector.menu.type', select: 'vector.menu.select', view: 'menu.view', theme: 'menu.view', window: 'vector.menu.window', help: 'menu.help' };
  // The native copy/cut/paste events carry the clipboard, so those keys stay with keys.js.
  var NATIVE = { 'edit.copy': 1, 'edit.cut': 1, 'edit.paste': 1 };
  var EXTRA = { 'edit.clear': ['Delete', 'Backspace'], 'window.togglePanels': ['Tab'], 'help.shortcuts': ['F1', 'Shift+Mod+/'], 'file.new': ['Mod+N'] };
  /** 'mod+shift+z' → 'Mod+Shift+Z' (SlopCmd syntax). */
  function toCmd(k) { return k.split('+').map(function (p) { return p === 'mod' ? 'Mod' : p === 'alt' ? 'Alt' : p === 'shift' ? 'Shift' : p; }).join('+'); }
  /** Keys go to the text editor, an open SlopUI menu or the colour picker before any shortcut. */
  function free() {
    var a = document.activeElement;
    if (a && a === D.textEditor) return false;
    if (a && a.closest && a.closest('.sui-menu')) return false;
    return !UI.st.picker;
  }
  function gate(fn) { return function () { return free() && (!fn || fn()); }; }

  function actionCommands() {
    return Object.keys(A).map(function (id) {
      var a = A[id];
      var keys = NATIVE[id] ? [] : a.keys.map(toCmd).concat(EXTRA[id] || []);
      return { id: 'sv.' + id, title: a.label, group: t(GROUPS[id.split('.')[0]] || 'vector.cmd.group_other'), keys: keys, keywords: [id.split('.')[0]],
        when: gate(a.enabled), checked: a.checked, run: function () { SV.runAction(id); } };
    });
  }
  function toolCommands() {
    var keysOf = {};
    var TK = SV._tools.TOOL_KEYS;
    Object.keys(TK).forEach(function (k) { (keysOf[TK[k]] = keysOf[TK[k]] || []).push(k.replace(/^shift\+/, 'Shift+').replace(/^([a-z])$/, function (m) { return m.toUpperCase(); }).replace(/\+([a-z])$/, function (m, c) { return '+' + c.toUpperCase(); })); });
    return SV.TOOL_LIST.map(function (tl) {
      return { id: 'sv.tool.' + tl.id, title: t('vector.cmd.tool_title', { name: tl.name }), group: t('vector.cmd.group_tools'), keys: keysOf[tl.id] || [], keywords: ['tool'], when: gate(), checked: function () { return S.tool === tl.id; }, run: function () { SV.setTool(tl.id); } };
    });
  }
  function canvasCommands() {
    var C = SV.cmd, out = [];
    var group = t('vector.cmd.group_canvas');
    function K(id, title, keys, run, when, extra) { out.push(Object.assign({ id: 'sv.' + id, title: title, group: group, keys: keys, run: run, when: gate(when) }, extra || {})); }
    K('focus.toggle', t('vector.cmd.focus_toggle'), [], function () { S.focus = S.focus === 'fill' ? 'stroke' : 'fill'; SV.requestRender(true); });
    K('paint.swap', t('vector.cmd.paint_swap'), ['X', 'Shift+X'], function () { SV.swapFillStroke(); });
    K('paint.default', t('vector.cmd.paint_default'), ['D'], function () { SV.defaultFillStroke(); });
    K('paint.none', t('vector.cmd.paint_none'), ['/'], function () { SV.applyStyle(S.focus, null); });
    K('paint.color', t('vector.cmd.paint_color'), [','], function () { var cp = SV.currentPaint(S.focus); SV.applyStyle(S.focus, typeof cp === 'string' ? cp : (cp && cp.stops ? cp.stops[0].c : '#d4ff3a')); });
    K('paint.gradient', t('vector.cmd.paint_gradient'), ['.'], function () { var gp = SV.currentPaint(S.focus); SV.applyStyle(S.focus, gp && typeof gp === 'object' ? gp : SV.defaultGradient(gp)); });
    var noShapeOp = function () { return !(S.op && S.op.kind === 'shape'); };
    [['left', -1, 0, t('vector.cmd.nudge_left')], ['right', 1, 0, t('vector.cmd.nudge_right')], ['up', 0, -1, t('vector.cmd.nudge_up')], ['down', 0, 1, t('vector.cmd.nudge_down')]].forEach(function (d) {
      var key = 'Arrow' + d[0][0].toUpperCase() + d[0].slice(1);
      K('nudge.' + d[0], d[3], [key], function () { var i = S.prefs.keyInc; C.nudge(d[1] * i, d[2] * i); }, noShapeOp, { repeat: true });
      K('nudge.' + d[0] + '10', t('vector.cmd.nudge_10', { what: d[3] }), ['Shift+' + key], function () { var i = S.prefs.keyInc * 10; C.nudge(d[1] * i, d[2] * i); }, noShapeOp, { repeat: true });
    });
    return out;
  }

  /** The shortcut label for an action in menus: the person's own binding when SlopCmd is active. */
  UI.actKey = function (a) {
    if (a.id === 'help.commands' && SV.cmdOn) return window.SlopCmd.keyFor('cmd.palette');
    if (SV.cmdOn && !NATIVE[a.id]) return window.SlopCmd.keyFor('sv.' + a.id);
    return a.keyText || keyLabel(a.keys[0]);
  };
  act('help.commands', [], function () { if (SV.cmdOn) window.SlopCmd.open(); else SV.runAction('help.shortcuts'); });
  var oldShortcuts = A['help.shortcuts'].run;
  A['help.shortcuts'].run = function () { if (SV.cmdOn) window.SlopCmd.openKeymap(); else oldShortcuts(); };

  /** The assistant's commands with arguments (ai-io.js, then ai-commands.js), loaded when SlopCmd.prepare() asks. */
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  function script(name) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = new URL(name, HERE).href; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + name)); };
      document.head.append(s);
    });
  }
  SV.prepareAI = function () { return SV.ai ? Promise.resolve() : script('ai-io.js').then(function () { return script('ai-commands.js'); }); };

  SV.wireCommands = function () {
    var SC = window.SlopCmd;
    if (!SC || !SC.register) return false;
    // Built on every call (registration and each language change), so titles and groups read the current language.
    function all() { return actionCommands().filter(function (c) { return c.id !== 'sv.help.commands'; }).concat(toolCommands(), canvasCommands()); }
    try {
      SC.init({ app: 'vector' });
      var b = document.getElementById('cmdBtn');
      SV.live(function () {
        SC.register(all());
        if (b) b.title = t('ui.cmd.fab_tip', { key: SC.keyFor('cmd.palette') });
      });
      SV.cmdOn = true;
      if (SC.provide) SC.provide({ prepare: SV.prepareAI });
      if (b) { b.hidden = false; b.addEventListener('click', function () { SC.open(); }); }
    } catch (e) { console.warn(e); SV.cmdOn = false; }
    return SV.cmdOn;
  };
})();
