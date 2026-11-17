/* Slop Press — the one way files come in (shared/intake, spec 'press'). A drop on the stage or the zone, the zone's Choose
   files, File ▸ Open (Ctrl+O), File ▸ Place (Ctrl+D), Place Image into Frame, Open / Place from Slop Drive, a pasted
   picture, ?drive=<id> (another app's Send to…) and a PWA launch all call SlopIntake.take and reach the one reader below.
   The mode says what happens: 'new' opens the file as a document (a .slpress project, or a new document around a picture,
   text or PDF); otherwise the file is placed in the open document (in the frame under the drop point, data.frame, or a new
   frame). A project file always opens. Classic script, after io/place.js and io/project.js. */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state;
  var IN = PR.intake = {};
  var SI = function () { return window.SlopIntake; };
  IN.RULES = {
    types: ['image/*', 'text/*', 'application/pdf', 'font/*', 'application/x-font-ttf', 'application/font-sfnt', 'application/x-slop-press', 'application/json', 'application/zip'],
    exts: ['.slpress', '.json', '.txt', '.md', '.csv', '.pdf', '.ttf', '.otf'],
    get noun() { return PR.util.t('press.io.intake_noun'); },
  };
  var DRIVE_OPEN = ['application/x-slop-press', 'application/zip', 'application/json', 'image/*', 'text/*', 'application/pdf', 'application/octet-stream'];
  var DRIVE_PLACE = ['image/*', 'text/*', 'application/pdf'];
  var OPEN_ACCEPT = '.slpress,.json,image/*,.txt,.md,application/pdf';
  var PLACE_ACCEPT = 'image/*,.txt,.md,application/pdf,.ttf,.otf';

  var isProject = function (f) { return /\.(slpress|json)$/i.test(f.name || '') || /slop-press|zip/.test(f.type || ''); };
  /** The frame under a drop point that a picture goes into (and the spread under it becomes the active one). */
  function frameAt(f, at) {
    if (!at || !PR.view.canvas) return null;
    var V = PR.view, r = V.canvas.getBoundingClientRect(), w = V.toWorld(at.x - r.left, at.y - r.top), hit = PR.tools.hit(w.x, w.y);
    var s = V.surfaceAt(w.x, w.y); if (s) PR.selectTool.activate(s);
    return hit && /image|rect|ellipse/.test(hit.it.type) && /^image\//.test(f.type) ? hit.it : null;
  }
  /** The one reader: open (mode 'new', or a project file) or place. A Slop Drive project stays linked: Save writes back to it. */
  function read(f, ctx) {
    if (ctx.mode === 'new' || isProject(f)) {
      return PR.io.openAny(f).then(function () { if (ctx.drive && isProject(f)) S.driveId = ctx.drive.id; return f.name; });
    }
    var frame = (ctx.data && ctx.data.frame) || frameAt(f, ctx.at);
    return PR.place.files([f], { frame: frame }).then(function () { return f.name; });
  }
  IN.register = function () {
    if (!SI()) return;
    SI().register({ id: 'press', accept: IN.RULES, driveAccept: DRIVE_OPEN, process: read });
  };
  /** File ▸ Open… (Ctrl+O): one file, opened as a document. */
  IN.open = function () { return SI().pick({ to: 'press', mode: 'new', multiple: false, accept: OPEN_ACCEPT }); };
  /** File ▸ Place… (into `frame` when given: one picture). */
  IN.place = function (frame) { return SI().pick({ to: 'press', mode: 'add', multiple: !frame, accept: PLACE_ACCEPT, data: { frame: frame || null } }); };
  IN.openFromDrive = function () { return SI().fromDrive({ to: 'press', mode: 'new', title: PR.util.t('press.io.open_drive_title') }); };
  IN.placeFromDrive = function () { return SI().fromDrive({ to: 'press', mode: 'add', accept: DRIVE_PLACE, title: PR.util.t('press.io.place_drive_title') }); };
  /** What the page was opened with (?drive=<id>, a PWA launch): opened as a document. Resolves true when something opened. */
  IN.launch = function () {
    if (!SI() || !SI().launch) return Promise.resolve(false);
    return SI().launch({ to: 'press', mode: 'new' }).then(function (r) { return !!(r && r.added && r.added.length); });
  };
  /** The drop zone (the zone's strip and the whole stage). */
  IN.attachDrop = function (zone, stage) {
    if (window.SlopDrop) window.SlopDrop.attach(zone, { intake: 'press', compact: true, targets: [stage] });
  };
  IN.register();
})();
