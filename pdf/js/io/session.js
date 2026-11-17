/* Slop PDF — session persistence (IndexedDB autosave payload) and closing everything. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;

  /* -------------------------------------------------------- persistence */
  E.serialize = function () {
    return {
      v: 1,
      files: Array.from(E.files.values()).filter(function (f) { return !f.locked; }).map(function (f) { return { id: f.id, name: f.name, bytes: f.bytes, color: f.color, security: f.security || null }; }),
      assets: Array.from(E.assets.values()),
      state: JSON.parse(JSON.stringify(E.state))
    };
  };
  E.restore = async function (data) {
    if (!data || data.v !== 1) return false;
    for (var i = 0; i < data.files.length; i++) {
      var fd = data.files[i];
      try { var rf = await E.registerPdf(fd.bytes instanceof Uint8Array ? fd.bytes : new Uint8Array(fd.bytes), fd.name, null, { id: fd.id, color: fd.color, silent: true }); rf.noLog = true; /* the autosave holds these edits */ if (fd.security) { rf.security = fd.security; rf.decrypted = true; } }
      catch (e) { console.warn('Slop PDF: could not restore', fd.name, e); }
    }
    (data.assets || []).forEach(function (a) { E.assets.set(a.id, a); });
    var st = data.state || E.blankState();
    st.pages = (st.pages || []).filter(function (p) { return p.blank || E.files.has(p.f); });
    E.state = Object.assign(E.blankState(), st);
    E._colorIdx = E.files.size;
    E.resetHistory();
    E.emit('files');
    E.emit('change', { label: U.t('pdf.io.restore'), history: true });
    return true;
  };
  E.closeAll = function () {
    if (SP.editLog) SP.editLog.flush(); // keep this session's edits before the history is cleared
    E.files.forEach(function (f) { try { f.doc.destroy(); } catch (e) { /* ignore */ } });
    E.files.clear(); E.assets.clear(); E.dropCache();
    E.state = E.blankState(); E.resetHistory(); E._colorIdx = 0;
    E.emit('files'); E.emit('change', { label: U.t('pdf.io.close_all'), history: true });
  };
})();
