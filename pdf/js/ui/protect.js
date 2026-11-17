/* Slop PDF — the Download PDF dialog with its "Protect with a password" section (File ▸ Protect with password…, the
   command palette, File ▸ Export as ▸ PDF with a password…, and "Keep the password" on a file that had one). The password
   is added after the document is built and checked (ui/exports.js A.download, shared/pdf-crypto: AES-256). The fields are
   emptied as soon as the download starts, and the password is never put in the status line, a toast, the console,
   storage or the session. A.protect(preset) -> Promise<bytes | null>; preset { on, print, copy, edit }. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, h = U.h, t = U.t;

  /** What a protected original allowed, as the dialog's checkboxes (shared/pdf-crypto inspect().permissions). */
  A.protectPreset = function (security) {
    var p = (security && security.permissions) || {};
    return { on: true, print: p.print !== false, copy: p.copy !== false, edit: p.modify !== false };
  };
  /** The first open file that had a password (its security, never the password), or null. */
  A.hadPassword = function () {
    var out = null;
    E.files.forEach(function (f) { if (!out && f.security && f.security.encrypted) out = f; });
    return out;
  };

  A.protect = function (preset) {
    if (!E.state.pages.length) return Promise.resolve(null);
    preset = Object.assign({ on: true, print: true, copy: true, edit: true }, preset || {});
    var C = SlopUI.check;
    var on = C(t('pdf.act.protect_title'), preset.on), print = C(t('pdf.act.allow_print'), preset.print);
    var copy = C(t('pdf.act.allow_copy'), preset.copy), edit = C(t('pdf.act.allow_edit'), preset.edit);
    var pw = h('input', { class: 'sui-input', type: 'password', name: 'pw', autocomplete: 'new-password', 'aria-label': t('pdf.act.password') });
    var pw2 = h('input', { class: 'sui-input', type: 'password', name: 'confirm', autocomplete: 'new-password', 'aria-label': t('pdf.act.pw_confirm_label') });
    var err = h('p', { class: 'sui-p sp-err', role: 'alert', hidden: true });
    var fields = h('div', { class: 'pp-protect-fields' }, SlopUI.field(t('pdf.act.password'), pw), SlopUI.field(t('pdf.act.pw_confirm'), pw2), print.el, copy.el, edit.el,
      h('p', { class: 'pp-note' }, t('pdf.act.protect_note')));
    function sync() { fields.hidden = !on.input.checked; pw.disabled = pw2.disabled = !on.input.checked; }
    on.input.addEventListener('change', sync); sync();
    function forget() { pw.value = ''; pw2.value = ''; }
    var body = h('div', { class: 'pp-protect' },
      h('h3', null, t('pdf.act.protect_title')), on.el, fields, err,
      h('p', { class: 'sui-p' }, t('pdf.act.protect_local')));
    return new Promise(function (resolve) {
      var go = null;
      SlopUI.dialog({ title: t('pdf.act.download_pdf'), cls: 'sui-narrow', body: body, buttons: [{ label: t('menu.cancel') }, { label: t('ui.download'), primary: true, act: function () {
        if (on.input.checked) {
          var msg = !pw.value ? t('pdf.act.pw_type') : pw.value !== pw2.value ? t('pdf.act.pw_mismatch') : '';
          if (msg) { err.textContent = msg; err.hidden = false; pw2.value = ''; (pw.value ? pw2 : pw).focus(); return false; }
          go = { protect: { pw: pw.value, print: print.input.checked, copy: copy.input.checked, edit: edit.input.checked } };
        } else go = {};
        forget();
      } }], onClose: function (ok) {
        forget();
        if (!ok || !go) { resolve(null); return; }
        var o = go; go = null;
        Promise.resolve(A.download(o)).then(resolve, function () { resolve(null); });
      } });
    });
  };
})();
