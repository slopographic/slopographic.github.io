/* SlopCut: the Layout lane in the Templates tab. A strip over the sequence with one band per layout and a
   marker per switch (add at the playhead, drag, delete). The strip itself is shared/video/lane-view.js; this
   file wires it to the project: every change is one undo step (SE.change). */
(function () {
  'use strict';
  const SE = window.SE, SV = window.SlopVideo, M = SE.model, L = SE.layout, T = SV.templates, G = SV.grid;
  const LANE = SE.laneUI = {};

  /** Layout choices for a switch: the named templates, then the grids 1×1 … 4×4. */
  LANE.layouts = () => T.list.map((t) => [t.id, t.name]).concat(G.specs().map((id) => [id, T.get(id).name]));
  LANE.duration = () => Math.max(10, M.duration(SE.doc));
  /** A new lane element for the current project (rebuilt on each panel render). */
  LANE.element = function () {
    const host = document.createElement('div');
    host.className = 'lane-host';
    const view = SV.laneView.mount(host, {
      label: () => SE.util.t('slopedit.lay.layout_lane'),
      onCommit: (list) => SE.change(SE.util.t('slopedit.lay.layout_switch'), (p) => L.setSwitches(p, list)),
      onSeek: (t) => { if (SE.player) SE.player.seek(t); }
    });
    view.update({ duration: LANE.duration(), switches: SE.doc.segments || [], layouts: LANE.layouts, playhead: SE.player ? SE.player.time : 0 });
    return host;
  };
})();
