/* SlopIntake rules: which files an app takes (from any source: a drop, a pick, a paste, Slop Drive...), why it refuses the
   others, and the words for the result. Pure (no DOM, no fetch). Attaches to window.SlopIntake.rules, and to
   window.SlopDrop.rules for the drop zone (shared/drop). See shared/intake/HANDOFF.md.
   A rule set: { types: ['image/*', 'video/*', 'application/pdf'], exts: ['.heic'], noun: 'a picture or video', maxBytes }.
   any: true takes every type; allowEmpty: true takes zero-byte files.
   types: MIME patterns (type/* or an exact type). exts: used only when the browser gives no type (or octet-stream).
   noun: how a refusal reads, "notes.txt is not <noun>": an i18n key ('sorter.app.a_photo') or a function, read when a file
   is refused (so it follows a language change), or plain text. */
(function (root) {
  'use strict';
  const SI = (root.SlopIntake = root.SlopIntake || {});
  const SD = (root.SlopDrop = root.SlopDrop || {});
  const R = (SI.rules = SD.rules = SI.rules || {});
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }

  /** A noun or label an app gave: an i18n key (read in the current language when used), a function, or text (SlopI18n.label). */
  const lab = (v) => { const I = globalThis.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };

  /** The extension of a file name, lower case, with its dot ('' when none). */
  R.ext = function (name) {
    const m = /\.[^./\\]+$/.exec(String(name || ''));
    return m ? m[0].toLowerCase() : '';
  };
  /** A known MIME type: non-empty and not the generic octet-stream. */
  R.knownType = function (type) {
    const t = String(type || '').toLowerCase();
    return !!t && t !== 'application/octet-stream';
  };
  function matches(type, pattern) {
    const p = pattern.toLowerCase();
    return p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) : type === p;
  }
  /** Is a file of this MIME type taken? Unknown types (no type given) are decided by the extension, see check(). */
  R.typeOk = function (type, rules) {
    const t = String(type || '').toLowerCase();
    return (rules.types || []).some((p) => matches(t, p));
  };
  /** Can a file be taken? Returns { ok: true } or { ok: false, reason } where reason names the file.
   *  file: { name, type, size } (a File works). */
  R.check = function (file, rules) {
    const name = file.name || tr('ui.intake.file', 'file'), size = Number(file.size) || 0;
    const known = R.knownType(file.type);
    const byType = rules.any || (known ? R.typeOk(file.type, rules) : (rules.exts || []).includes(R.ext(name)));
    if (!byType) return { ok: false, reason: tr('ui.intake.not_noun', '{name} is not {noun}', { name, noun: rules.noun ? lab(rules.noun) : tr('ui.intake.supported', 'a supported file') }) };
    if (size === 0 && !rules.allowEmpty) return { ok: false, reason: tr('ui.intake.empty', '{name} is empty', { name }) };
    if (rules.maxBytes && size > rules.maxBytes) return { ok: false, reason: tr('ui.intake.larger', '{name} is larger than {size}', { name, size: R.size(rules.maxBytes) }) };
    return { ok: true };
  };
  /** At drag time only the MIME type is known (no names): false when the type is known and not taken. */
  R.maybeOk = function (type, rules) {
    return !!rules.any || !R.knownType(type) || R.typeOk(type, rules);
  };
  /** The value for an <input accept>: the MIME patterns and the extensions. */
  R.acceptAttr = function (rules) {
    return (rules.types || []).concat(rules.exts || []).join(',');
  };
  /** A byte count for people: 512 B, 3.4 KB, 12 MB, 1.2 GB. */
  R.size = function (n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0) + ' MB';
    return (n / 1073741824).toFixed(1) + ' GB';
  };
  /** The toast text for a batch. summary: { added: [..], skipped: [{ name, reason }] }.
   *  "Added 3 files, 1 skipped: notes.txt is not a picture". Lists at most two reasons. */
  R.describe = function (summary) {
    const n = (summary.added || []).length, bad = summary.skipped || [];
    const head = n ? tr('ui.intake.added', n === 1 ? 'Added {n} file' : 'Added {n} files', { n }) : tr('ui.intake.nothing_added', 'Nothing added');
    if (!bad.length) return n ? head : tr('ui.intake.no_files', 'No files to add');
    const two = bad.slice(0, 2).map((s) => s.reason).join('; ');
    const why = bad.length > 2 ? tr('ui.intake.why_more', '{why} and {n} more', { why: two, n: bad.length - 2 }) : two;
    return n ? tr('ui.intake.skipped', '{head}, {n} skipped: {why}', { head, n: bad.length, why }) : tr('ui.intake.nothing_why', 'Nothing added: {why}', { why });
  };
  /** The words for a drag in progress: "Drop to add 2 files" (with a note when a type is known to be refused). */
  R.dragLabel = function (types, rules) {
    const n = types.length;
    const refused = types.filter((t) => !R.maybeOk(t, rules)).length;
    const label = tr('ui.intake.drop_to_add', n === 1 ? 'Drop to add {n} file' : 'Drop to add {n} files', { n });
    return refused ? tr('ui.intake.refused', '{label} ({n} will be refused)', { label, n: refused }) : label;
  };
})(typeof window !== 'undefined' ? window : globalThis);
