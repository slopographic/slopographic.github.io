/* Slop PDF — the URL sections (shared/router) and the view modes (shared/viewmode).
 *   ?tool=<rail tool id>    the tool open in the rail (organize, edit, sign, redact, ...). Default: organize.
 *   ?panel=layers|history   the sidebar dock section to open; the sidebar is shown too.
 * A tool or dock section the person picks is written to the URL (a replace, not a new history entry). Nothing is written
 * before the app is ready, so the link's own values are not replaced during boot. Ctrl+Shift+F cycles the view mode and
 * Ctrl+Shift+L shows hidden regions (shared/viewmode, registered in ui/app.js). Classic script: after js/ui/view-state.js. The other URL parameters (?drive=, ...) are kept as they are. */
(function () {
  'use strict';
  var SP = window.SP, A = SP.app, S = A._, D = SP.dock;
  var PANELS = ['layers', 'history'];
  var TOOLS = S.RAIL.map(function (t) { return t[0]; });
  function ready() { return document.documentElement.classList.contains('ready'); }
  // Did the link name a real rail tool? A ?tool= that is not one (an old or mistyped link) is ignored, as if the link had
  // no ?tool=: the view the person left (a restored tab) is kept, not replaced by the default.
  function namedTool() { return R.has('tool') && TOOLS.indexOf(String(SlopUrlState.get('tool', ''))) >= 0; }

  var linkTool = null, viewing = 0;   // the link's ?tool= and "a view or the link is being applied" (see below)
  var R = SlopRoute.register('pdf', {
    ready: ready,
    params: {
      tool: { values: TOOLS, def: 'organize' },
      panel: { values: PANELS, def: '' },
    },
    apply: function (s) {
      if (namedTool() && s.tool !== A.tool) { viewing++; try { A.setTool(s.tool); } finally { viewing--; } }
      if (R.has('panel') && s.panel) {
        if (A.togglePanel) A.togglePanel(true);
        if (D && D.setOpen) D.setOpen(s.panel, true);
      }
    },
  });

  // The tool picked by the person (any caller of A.setTool, boot included) goes to the URL once the app is ready.
  // A link's tool (?tool=) outlives the stored tabs: a tab that finishes loading after the page is ready brings back its
  // own view, and the link's tool is put back over it, until the person picks a tool themselves. The saved view applied
  // at boot (ui/view-state.js) goes through A.applyView too, so the link's tool is on screen before the page is ready.
  linkTool = namedTool() ? R.get('tool') : null;
  if (linkTool) A.tool = linkTool;   // A.bootRest opens A.tool: the link's tool is the first one wired, with no flash of Organize
  var setTool = A.setTool;
  A.setTool = function (t) {
    setTool.apply(this, arguments);
    if (R && ready()) { if (!viewing) linkTool = null; R.set({ tool: A.tool }); }
  };
  var applyView = A.applyView;
  if (applyView) A.applyView = function (v) {
    viewing++;
    try { applyView.apply(this, arguments); } finally { viewing--; }
    if (linkTool && A.tool !== linkTool) { viewing++; try { A.setTool(linkTool); } finally { viewing--; } }
  };
  // A dock section the person opens or closes. The URL names the section last opened.
  if (D) D.onToggle = function (id, open) {
    if (!R || !ready()) return;
    if (open) R.set({ panel: id });
    else if (R.get('panel') === id) R.set({ panel: '' });
  };
  // The view modes (SlopViewMode) are registered by ui/app.js, before the first paint.
})();
