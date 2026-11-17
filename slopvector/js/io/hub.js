/* SlopVector — Slop Hub integration: Save to Slop Drive, "Send to" other apps (SlopOuttake); files come in through the
   intake (io/intake.js: Open / Place from Slop Drive, ?drive= launches).
   Uses window.SlopHub (../shared/hub.js) and window.SLOP_APPS (../shared/apps.js). */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, IO = SV.io = SV.io || {};
  var HUB = SV.hub = {};
  HUB.linked = null; // id of the Slop Drive record this document was opened from or saved to
  // Any new document (New, Open, recovery, sample) is no longer linked to the previous Drive file.
  var loadDoc = SV.loadDoc;
  SV.loadDoc = function () { HUB.linked = null; return loadDoc.apply(this, arguments); };

  HUB.available = function () { return !!window.SlopHub; };
  // Sending opens another app at its site path, which only exists when served (not from file://).
  HUB.canSend = function () { return HUB.available() && location.protocol !== 'file:'; };
  // Open / Place from Slop Drive and ?drive= are sources of the one intake (io/intake.js), which links a Drive document.
  HUB.openFromDrive = function () { return SV.intake.openFromDrive(); };
  HUB.placeFromDrive = function () { return SV.intake.placeFromDrive(); };

  /* ---------- saving to Slop Drive ---------- */
  // Save writes back to the linked Drive file; the first save asks for a folder and links to the new file.
  HUB.saveBlob = function (blob, name) {
    var H = window.SlopHub;
    if (!HUB.linked) return H.saveToDrive(blob, name, { from: 'vector' }).then(function (id) { if (id) HUB.linked = id; return id; });
    var id = HUB.linked;
    return H.update(id, { blob: blob, name: name, type: blob.type }).then(function (rec) {
      return rec ? id : H.put(blob, { id: id, name: name, from: 'vector' });
    });
  };
  // File ▸ Save: to Slop Drive when available, otherwise the classic SVG download.
  HUB.save = function () {
    if (!HUB.available()) return IO.saveSVG();
    var name = IO.baseName() + '.svg';
    return HUB.saveBlob(HUB.svgBlob(), name).then(function (id) {
      if (!id) return;
      SV.markSaved(); SV.scheduleAutosave(); SV.toast(SV.t('vector.msg.saved_drive', { file: name }));
    }).catch(function (e) { SV.toast(SV.t('vector.msg.save_failed', { error: String(e && e.message || e) }), 'warn'); });
  };

  /* ---------- sending ---------- */
  HUB.svgBlob = function () { return new Blob([IO.exportSVG({ metadata: true })], { type: 'image/svg+xml' }); };
  HUB.pngBlob = function () {
    return IO.rasterize(2, null).then(function (c) { return new Promise(function (res) { c.toBlob(res, 'image/png'); }); });
  };
  // Items for File ▸ Send to (the one builder, SlopOuttake): the document as SVG to every app that takes it (and Slop
  // Workflows), then as PNG to the apps that take pictures.
  HUB.sendItems = function () {
    if (!HUB.available() || !window.SlopOuttake) return [{ label: SV.t('vector.hub.unavailable'), disabled: true }];
    var name = function () { return IO.baseName(); }, O = window.SlopOuttake;
    var svg = O.items({ get: function () { return HUB.svgBlob(); }, name: function () { return name() + '.svg'; }, type: 'image/svg+xml', from: 'vector', verb: 'ui.outtake.send_to', folder: false });
    var png = O.items({ get: function () { return HUB.pngBlob(); }, name: function () { return name() + '.png'; }, type: 'image/png', from: 'vector', verb: 'vector.hub.send_png_to', folder: false })
      .filter(function (it) { return it.plain; }); // the workflow items are there once, with the SVG
    var items = svg.concat(svg.length && png.length ? ['-'] : [], png);
    if (!HUB.canSend()) items = items.map(function (it) { return it === '-' ? it : { label: it.label, disabled: true, title: SV.t('vector.hub.send_site') }; });
    return items.length ? items : [{ label: SV.t('vector.hub.no_apps'), disabled: true }];
  };

  /* ---------- boot ---------- */
  HUB.init = function () {
    if (HUB.available()) { try { window.SlopHub.register('vector'); } catch (e) { /* bus unavailable */ } }
    return SV.intake.launch().catch(function () { return null; });
  };
})();
