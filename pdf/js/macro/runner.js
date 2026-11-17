/* Slop PDF macros — the runner. runMacro(macro, pdfBytes, opts) applies each step to the output of the one before.
   The original bytes are never changed. A failing step stops the run; the log says which step failed and why.
   Resolves { ok, bytes (null when not ok), failed (0-based step index, -1 when none), log: [{ step, ok, warn, message }] }. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  function tr(k, en) { var I = window.SlopI18n; return I && I.has && I.has(k) ? I.t(k) : en; }

  function copyBytes(b) {
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
    throw new Error('The PDF bytes are missing.');
  }

  /** Runs a macro on PDF bytes. opts: { filename (for {filename}), date (Date or YYYY-MM-DD for {date}) }. */
  M.runMacro = async function (macro, bytes, opts) {
    opts = opts || {};
    var problems = M.validateMacro(macro);
    if (problems.length) {
      return { ok: false, bytes: null, failed: -1, log: problems.map(function (p) { return { step: tr('pdf.macro.check', 'Check'), ok: false, warn: false, message: p }; }) };
    }
    var cur = copyBytes(bytes), log = [];
    var ctx = { filename: String(opts.filename || 'document.pdf'), date: opts.date instanceof Date || opts.date == null ? M.isoDate(opts.date) : String(opts.date) };
    await M.pdf.initMetrics();
    for (var i = 0; i < macro.steps.length; i++) {
      var st = M.normalizeStep(macro.steps[i]).step, label = (i + 1) + '. ' + M.stepLabel(st);
      try {
        var r = await M.ops[st.type](cur, st, ctx);
        cur = r.bytes;
        log.push({ step: label, ok: true, warn: !!r.warn, message: r.message });
      } catch (e) {
        log.push({ step: label, ok: false, warn: false, message: (e && e.message) || String(e) });
        return { ok: false, bytes: null, failed: i, log: log };
      }
    }
    return { ok: true, bytes: cur, failed: -1, log: log };
  };
})();
