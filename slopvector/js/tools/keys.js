/* SlopVector — tools: keyboard shortcuts and clipboard events */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  var TOOL_KEYS = $.TOOL_KEYS;

  /* ================= keyboard ================= */
  var CODE_KEYS = { Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Quote: "'", Semicolon: ';', Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Backquote: '`', IntlBackslash: '\\', NumpadAdd: '=', NumpadSubtract: '-' };
  function keyName(e) {
    if (/^Key[A-Z]$/.test(e.code)) { var k = (e.key || '').toLowerCase(); return /^[a-z]$/.test(k) ? k : e.code.slice(3).toLowerCase(); }
    if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
    if (/^Numpad\d$/.test(e.code)) return e.code.slice(6);
    if (CODE_KEYS[e.code]) return CODE_KEYS[e.code];
    return (e.key || '').toLowerCase();
  }
  SV.comboOf = function (e) {
    var k = keyName(e);
    return (e.ctrlKey || e.metaKey ? 'mod+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey ? 'shift+' : '') + k;
  };
  function isTyping(t) { return (!!window.SlopTyping && window.SlopTyping.isTyping(t, { controls: true })); }   // shared/input/typing.js
  var pasteTimer = null;
  function onKeyDown(e) {
    var t = e.target;
    if (SV.ui && SV.ui.handleGlobalKey && SV.ui.handleGlobalKey(e)) return;
    if (t === D.textEditor) {
      if (e.key === 'Escape') { e.preventDefault(); SV.commitTextEdit({ toSelect: true }); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); SV.commitTextEdit({ toSelect: true }); }
      return;
    }
    if (isTyping(t)) { if (e.key === 'Escape' && t.blur) t.blur(); return; }
    if (S.editing) SV.commitTextEdit();
    var combo = SV.comboOf(e);
    if (e.key === ' ' || e.code === 'Space') { if (!S.spaceHand) { S.spaceHand = true; SV.updateCursor(); } e.preventDefault(); return; }
    // clipboard: let native events fire
    if (combo === 'mod+c' || combo === 'mod+x') { if (combo === 'mod+c') C.copy(); else C.cut(); return; }
    if (combo === 'mod+v') {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(function () { pasteTimer = null; if (!SV.buffer.pasteIfNewer()) C.paste(); }, 80);
      return;
    }
    // With SlopCmd (ui/commands.js) every other shortcut is a customizable command; only context keys remain here.
    if (SV.cmdOn && !/^(Escape|Enter|ArrowUp|ArrowDown)$/.test(e.key)) return;
    var act = !SV.cmdOn && SV.keymap && SV.keymap[combo];
    if (act) {
      e.preventDefault();
      SV.runAction(act);
      return;
    }
    if (S.op && S.op.kind === 'shape' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      var d = e.key === 'ArrowUp' ? 1 : -1;
      if (S.op.tool === 'polygon') S.shape.sides = SV.clamp(S.shape.sides + d, 3, 64);
      if (S.op.tool === 'star') S.shape.points = SV.clamp(S.shape.points + d, 2, 64);
      SV.updateShapeOp(); return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (e.ctrlKey || e.metaKey || SV.cmdOn) return;
      e.preventDefault();
      var inc = S.prefs.keyInc * (e.shiftKey ? 10 : 1);
      C.nudge(e.key === 'ArrowLeft' ? -inc : e.key === 'ArrowRight' ? inc : 0, e.key === 'ArrowUp' ? -inc : e.key === 'ArrowDown' ? inc : 0);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); C.deleteSel(); return; }
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return;   // an open panels drawer (SlopSheet) took it
      if (S.pen) { SV.finishPen(); return; }
      if (S.op) { SV.revert(); S.op = null; S.marquee = null; S.readout = null; SV.requestRender(true); return; }
      if (SV.ui && SV.ui.closeMenus && SV.ui.closeMenus()) return;
      SV.deselect(); return;
    }
    if (e.key === 'Enter') {
      if (S.pen) { e.preventDefault(); SV.finishPen(); return; }
      if (S.tool === 'select' && S.sel.length) { e.preventDefault(); SV.ui.transformDialog('move'); return; }
      return;
    }
    if (e.key === 'Tab') { if (t === document.body || t === D.stage || !t) { e.preventDefault(); SV.runAction('window.togglePanels'); } return; }
    if (e.key === 'F1') { e.preventDefault(); SV.runAction('help.shortcuts'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = keyName(e), kc = (e.shiftKey ? 'shift+' : '') + k;
    if (TOOL_KEYS[kc]) { e.preventDefault(); SV.setTool(TOOL_KEYS[kc]); return; }
    if (kc === 'x') { S.focus = S.focus === 'fill' ? 'stroke' : 'fill'; SV.requestRender(true); return; }
    if (kc === 'shift+x') { SV.swapFillStroke(); return; }
    if (kc === 'd') { SV.defaultFillStroke(); return; }
    if (kc === '/') { e.preventDefault(); SV.applyStyle(S.focus, null); return; }
    if (kc === ',') { var cp = SV.currentPaint(S.focus); SV.applyStyle(S.focus, typeof cp === 'string' ? cp : (cp && cp.stops ? cp.stops[0].c : '#d4ff3a')); return; }
    if (kc === '.') { var gp = SV.currentPaint(S.focus); SV.applyStyle(S.focus, gp && typeof gp === 'object' ? gp : SV.defaultGradient(gp)); return; }
  }
  function onKeyUp(e) {
    if (e.key === ' ' || e.code === 'Space') { S.spaceHand = false; SV.updateCursor(); }
    if (e.key === 'Alt') SV.updateCursor(false);
  }
  SV.bindKeys = function () {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { S.spaceHand = false; });
    document.addEventListener('copy', function (e) {
      if (isTyping(e.target) || S.editing) return;
      if (!S.sel.length || !S.clipText) return;
      try { e.clipboardData.setData('text/plain', S.clipText); e.clipboardData.setData('image/svg+xml', S.clipText); e.preventDefault(); } catch (er) { /* ignore */ }
    });
    document.addEventListener('cut', function (e) {
      if (isTyping(e.target) || S.editing) return;
      if (!S.clipText) return;
      try { e.clipboardData.setData('text/plain', S.clipText); e.preventDefault(); } catch (er) { /* ignore */ }
    });
    // A pasted picture is the intake's (io/intake.js), which takes it first; this is the app's clipboard and pasted text.
    document.addEventListener('paste', function (e) { // intake-ok: the app's own clipboard copies, SVG text and text
      if (e.defaultPrevented || isTyping(e.target) || S.editing) return;
      clearTimeout(pasteTimer); pasteTimer = null;
      e.preventDefault();
      var dt = e.clipboardData, files = dt ? Array.from(dt.files || []) : [];
      if (SV.buffer.pasteIfNewer()) return;
      if (files.length) { C.paste(); return; }
      var txt = dt ? dt.getData('text/plain') : '';
      if (!txt || (S.clipboard && txt === S.clipText)) { C.paste(); return; }
      if (/<svg[\s>]/i.test(txt)) { SV.io.importSVGText(txt, { place: true }); return; }
      if (txt.trim()) {
        if (!SV.canDraw()) return;
        var r = D.stage.getBoundingClientRect(), c = SV.toDoc(r.width / 2, r.height / 2);
        var o = SV.mk.text(c.x, c.y, txt.slice(0, 2000), clone(S.font), SV.newStyle('text'));
        SV.insertObj(o); SV.select([o.id]); SV.commit('paste text');
      }
    });
  };
})();
