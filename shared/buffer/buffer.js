/* SlopBuffer: the one copy-and-drop buffer shared by the apps. Holds the last copied item (see formats.js for the record).
 *   SlopBuffer.put(input, { system })  store an item: memory, IndexedDB, other tabs, and the system clipboard. Resolves the record.
 *   SlopBuffer.get()                   the current record, or null (synchronous, from memory)
 *   SlopBuffer.ready                   resolves once the stored item has been read (after a reload)
 *   SlopBuffer.onChange(fn)            fn(record) on every change, local or from another tab. Returns an unsubscribe.
 *   SlopBuffer.clear()                 empties it everywhere
 *   SlopBuffer.bindDrop(el, fn)        el accepts a dropped buffer; fn(record, { x, y }) runs on drop (client coordinates)
 *   SlopBuffer.makeDraggable(el)       el starts a buffer drag when the user drags it
 * Other tabs are told through BroadcastChannel('slop-buffer'). Classic script. Needs formats.js, store.js, clipboard.js first. */
(function (g) {
  'use strict';
  var B = g.SlopBuffer = g.SlopBuffer || {};
  var TYPE = 'application/x-slop-buffer';
  var current = null, listeners = [], chan = null;

  B.DRAG_TYPE = TYPE;

  function notify(rec) {
    listeners.slice().forEach(function (fn) { try { fn(rec); } catch (e) { /* one listener must not stop the others */ } });
  }
  function post(msg) { if (chan) { try { chan.postMessage(msg); } catch (e) { /* closed channel */ } } }

  /** Reads the stored item into memory. A different item from another tab, or the same one, is taken as it is stored. */
  B.reload = function () {
    return B.store.read().then(function (rec) {
      var changed = !!rec !== !!current || (rec && current && rec.t !== current.t);
      current = rec;
      if (changed) notify(rec);
      return rec;
    });
  };

  B.ready = B.reload();

  B.get = function () { return current; };

  B.put = function (input, opts) {
    var rec;
    try { rec = B.record(input); } catch (e) { return Promise.reject(e); }
    current = rec;
    if (!opts || opts.system !== false) B.writeSystem(rec); // started now, so the copy keeps its user gesture
    notify(rec);
    return B.store.write(rec).then(function (ok) { if (ok) post({ type: 'put', t: rec.t }); return rec; });
  };

  B.clear = function () {
    current = null;
    notify(null);
    return B.store.clear().then(function (ok) { if (ok) post({ type: 'clear' }); return ok; });
  };

  B.onChange = function (fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  };

  /** Drag and drop. The dragged item is only a marker: the drop reads the record from memory. */
  function accepts(e) { return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], TYPE) >= 0); }
  B.bindDrop = function (el, fn) {
    el.addEventListener('dragenter', function (e) { if (accepts(e)) { e.preventDefault(); } });
    el.addEventListener('dragover', function (e) {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('buffer-over');
    });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('buffer-over'); });
    el.addEventListener('drop', function (e) {
      el.classList.remove('buffer-over');
      if (!accepts(e)) return;
      e.preventDefault();
      if (current) fn(current, { x: e.clientX, y: e.clientY });
    });
  };

  B.makeDraggable = function (el) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', function (e) {
      if (!current || !e.dataTransfer) { e.preventDefault(); return; }
      e.dataTransfer.setData(TYPE, String(current.t));
      e.dataTransfer.effectAllowed = 'copy';
    });
  };

  /** Keeps this tab's copy in step with the stored item and with other tabs. */
  if (typeof g.BroadcastChannel === 'function') {
    try {
      chan = new g.BroadcastChannel('slop-buffer');
      chan.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.type === 'put' && (!current || current.t !== m.t)) B.reload();
        if (m.type === 'clear') B.reload();
      };
    } catch (e) { chan = null; }
  }
})(window);
