/* Slop Press — project files (.slpress): a zip holding document.json, assets/<id>.<ext> and a manifest.
   Also opening files of any supported kind (project, image, text, PDF via place). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, Z = PR.zip, S = PR.state;
  var IO = PR.io = PR.io || {};
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'font/ttf': 'ttf', 'font/otf': 'otf' };

  /** The open document as a .slpress Blob. */
  IO.projectBlob = function (doc) {
    doc = doc || S.doc;
    var d = U.clone(U.assign({}, doc, { assets: null })), files = [], index = {};
    Object.keys(doc.assets).forEach(function (id) {
      var b = U.dataURLToBytes(doc.assets[id]), ext = EXT[b.type] || 'bin', name = 'assets/' + id + '.' + ext;
      index[id] = { file: name, type: b.type };
      files.push({ name: name, data: b.bytes, store: /jpg|png|webp|gif/.test(ext) });
    });
    d.assets = {}; d.assetIndex = index;
    files.unshift({ name: 'mimetype', data: 'application/x-slop-press', store: true },
      { name: 'document.json', data: JSON.stringify(d) },
      { name: 'manifest.json', data: JSON.stringify({ app: 'Slop Press', // i18n-ignore: file format
        format: 1, created: new Date().toISOString(), pages: doc.pages.length, size: doc.size }) });
    return Z.write(files).then(function (b) { return new Blob([b], { type: 'application/x-slop-press' }); });
  };
  /** Parses .slpress bytes (or a bare JSON document) into a document object. */
  IO.parseProject = function (u8) {
    if (u8[0] === 0x7b) return Promise.resolve(JSON.parse(new TextDecoder().decode(u8)));
    return Z.read(u8).then(function (files) {
      if (!files['document.json']) throw new Error('Not a Slop Press file');
      var d = JSON.parse(new TextDecoder().decode(files['document.json'])), idx = d.assetIndex || {};
      d.assets = d.assets || {};
      Object.keys(idx).forEach(function (id) { var f = files[idx[id].file]; if (f) d.assets[id] = U.bytesToDataURL(f, idx[id].type); });
      delete d.assetIndex;
      return d;
    });
  };
  IO.baseName = function () { return (S.fileName || S.doc.name || 'Untitled').replace(/\.slpress$/i, ''); };
  IO.save = function (ask) {
    var go = function (name) {
      S.doc.name = name;
      return IO.projectBlob().then(function (b) {
        window.SlopUI.download(b, name + '.slpress');
        S.fileName = name + '.slpress'; S.dirty = false; PR.emit('commit', 'save'); U.toast(U.t('press.io.saved', { name: name + '.slpress' }));
        return b;
      });
    };
    if (ask || !S.fileName) return window.SlopUI.prompt(U.t('press.io.save_as_title'), U.t('press.io.file_name'), IO.baseName()).then(function (n) { if (n) return go(n.replace(/\.slpress$/i, '')); });
    return go(IO.baseName());
  };
  /** Opens a document object (after fonts and images are ready the view re-lays out by itself). */
  IO.openDoc = function (doc, name) {
    PR.setDoc(doc, { fileName: name || null });
    return PR.fonts.ready(S.doc).then(function () { PR.engine.clear(); PR.touch(); PR.view.fitPage(); });
  };
  IO.openBytes = function (u8, name) {
    return IO.parseProject(u8).then(function (d) { if (name) d.name = d.name || name.replace(/\.slpress$/i, ''); return IO.openDoc(d, name); });
  };
  /** Opens any file: .slpress/.json project, or creates a document around an image / text file. */
  IO.openAny = function (file) {
    var name = file.name || 'Untitled';
    if (/\.(slpress|json)$/i.test(name) || /slop-press|zip/.test(file.type)) return file.arrayBuffer().then(function (b) { return IO.openBytes(new Uint8Array(b), name); }).then(function () { U.toast(U.t('press.io.opened', { name: name })); });
    if (/^image\//.test(file.type) || /^text\//.test(file.type) || /\.(txt|md)$/i.test(name) || file.type === 'application/pdf') {
      var M = PR.model, doc = M.create({ name: name.replace(/\.[^.]+$/, ''), pages: 1, facing: false });
      return IO.openDoc(doc).then(function () { return PR.place.files([file], { fill: true }); });
    }
    U.toast(U.t('press.io.cannot_open', { name: file.type || name }));
    return Promise.resolve();
  };
  /** File ▸ Open…: a source of the one intake (io/intake.js). */
  IO.openFile = function () { return PR.intake.open(); };
})();
