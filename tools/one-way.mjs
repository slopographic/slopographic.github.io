// Rule 4, one way in and one way out: files get into an app only through the shared intake (shared/intake, SlopIntake),
// and out only through the shared outbound builder (shared/intake/outtake.js, SlopOuttake / SlopHub.openIn). In the apps
// that have moved to it (STRICT below), app code may not add its own way:
//   in:  a 'drop' or 'paste' listener, SlopUI.pickFiles, a file <input>, SlopHub.consumeLaunch / ?drive= / launchQueue,
//        SlopHub.pickFromDrive (use SlopIntake.take, pick, fromDrive, launch, dropTarget, or SlopDrop.attach), and a list
//        of Slop Drive files built from SlopHub.list (the one Drive picker is SlopIntake.fromDrive; a library view or a
//        lookup by name that is not a picker says so with intake-ok:)
//   out: a hand-made "Open in …" / "Send to …" list (appsAccepting(...).map, labels built from an app name)
//        (use SlopOuttake.items / menu / button, SlopHub.openIn or sendMenuItems)
// A line that has to stay (a drop that reorders tabs, the app's own clipboard) says why with an "intake-ok:" or
// "outtake-ok:" comment. Add an app's folder to STRICT once it is migrated (shared/intake/HANDOFF.md has the list).
export const STRICT = ['pdf/', 'colors/', 'fontcreator/', 'scan/', 'recorder/', 'photoslop/js/', 'convert/', 'gallery/', 'resize/', 'slopisolate/', 'press/', 'label/', 'upscale/', 'slopcut/index.html', 'slopcut/js/core/', 'slopcut/js/io/', 'slopcut/js/media/', 'slopcut/js/render/', 'slopcut/js/timeline/', 'slopcut/js/ui/', 'slopvector/', 'ocr/', 'aitools/', 'transcribe/', 'music/', 'drive/', 'tables/', 'sheetview/', 'docs/', 'eml/', 'hex/', 'code/', 'slides/', 'workflows/', 'remix/', 'clean/', 'img3d/', 'contacts/', 'checksum/', 'serials/', 'html2pdf/', 'sorter/', 'qr/', 'signature/', 'paste/', 'notes/', 'calendar/', 'effects/', '3d/', 'ai/', 'projects/', 'crm/', 'expenses/', 'inventory/', 'invoices/', 'orders/', 'purchases/', 'quotes/', 'admin/', 'ledger/', 'photoslop/classic/', 'nodes/', 'diff/'];
const EXEMPT = /^(shared\/intake\/|shared\/drop\/|vendor\/|tests\/)|\.min\.js$/;
export const RULES = [
  { re: /addEventListener\(\s*['"](drop|paste)['"]/, why: "a '$1' listener of its own" },
  { re: /\bpickFiles\s*\(/, why: 'SlopUI.pickFiles (use SlopIntake.pick)' },
  { re: /type:\s*['"]file['"]|type="file"|\.type\s*=\s*['"]file['"]/, why: 'a file input of its own (use SlopIntake.pick)' },
  { re: /\bconsumeLaunch\s*\(|searchParams\.get\(\s*['"]drive['"]\s*\)|\blaunchQueue\b/, why: 'its own ?drive= or launch reader (use SlopIntake.launch)' },
  { re: /\bpickFromDrive\s*\(/, why: 'its own Slop Drive picker (use SlopIntake.fromDrive)' },
  { re: /(?:\bSlopHub|\b(?:hub|H|SH|HUB)\(\)|(?<![\w.])(?:hub|H))\.list\(/, why: 'a list of Slop Drive files of its own (the picker is SlopIntake.fromDrive; a library or lookup says intake-ok:)' },
  { re: /appsAccepting\([^)]*\)\s*\.map\(|label:\s*[`'"](?:Open in|Send to) (?:\$\{|['"]\s*\+)/, why: 'a hand-made "Open in" / "Send to" list (use SlopOuttake.items)', out: true },
];
export const strict = (f) => STRICT.some((d) => f.startsWith(d)) && !EXEMPT.test(f) && /\.(m?js|html)$/.test(f);

/** The one-way problems in a file's text: [{ line, why }]. Comment lines and lines marked intake-ok / outtake-ok pass. */
export function oneWayProblems(text) {
  const out = [];
  String(text).split('\n').forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const r of RULES) {
      const m = r.re.exec(l);
      if (!m) continue;
      if (/\b(intake|outtake)-ok:/.test(l)) continue;
      out.push({ line: i + 1, why: r.why.replace('$1', m[1] || '') });
    }
  });
  return out;
}
