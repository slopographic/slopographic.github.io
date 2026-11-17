/* SlopBuffer tray: a small chip that shows what the buffer holds and can be dragged onto an app's canvas.
 * It is hidden while the buffer is empty. SlopBuffer.tray(host) adds it to host (default: the body) and returns it.
 * Also adds the one style rule for drop targets (.buffer-over). Classic script; needs buffer.js first. */
(function (g) {
  'use strict';
  var B = g.SlopBuffer;
  var styled = false;

  function style() {
    if (styled || !g.document) return;
    styled = true;
    var s = g.document.createElement('style');
    s.textContent = '.sbuf-tray{position:fixed;left:12px;bottom:12px;z-index:60;font:12px/1.2 system-ui,sans-serif;padding:5px 11px;border-radius:999px;border:1px solid rgba(127,127,127,.5);background:Canvas;color:CanvasText;cursor:grab;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sbuf-tray[hidden]{display:none}.buffer-over{outline:2px dashed #4a8cff;outline-offset:-2px}';
    g.document.head.appendChild(s);
  }
  /** The tray's words (ui.buffer.*): the kind of what is held, read when it is painted. */
  var KINDS = ['vector', 'image', 'text', 'table', 'clip'];
  function tr(k, v) { var I = g.SlopI18n; return I ? I.t(k, v) : k; }

  B.tray = function (host) {
    style();
    var el = g.document.createElement('button');
    el.type = 'button';
    el.className = 'sbuf-tray';
    el.hidden = true;
    B.makeDraggable(el);
    var last = null;
    function paint(rec) {
      last = rec;
      el.setAttribute('aria-label', tr('ui.buffer.aria'));
      el.hidden = !rec;
      if (!rec) return;
      var kind = KINDS.indexOf(rec.kind) >= 0 ? tr('ui.buffer.kind_' + rec.kind) : rec.kind;
      el.textContent = tr('ui.buffer.label', { kind: kind, source: rec.source });
      el.title = tr('ui.buffer.tip');
    }
    B.onChange(paint);
    B.ready.then(paint);
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(function () { paint(last); });
    (host || g.document.body).appendChild(el);
    return el;
  };
})(window);
