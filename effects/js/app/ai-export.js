// Slop Effects for the assistant: the exports behind export_frame and save_project (ai-commands.js). A frame is drawn
// by draw.drawFrame, the same function as the preview and the render, at the composition size. The project is the same
// .effects.json file as File > Save to Slop Drive (project.toFile); a project already on Slop Drive is written back to
// its file. Each goes to Slop Drive (the app's folder), a download, or both. Classic script: window.SlopEffects.aiExport.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const safe = (s) => String(s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled';

  /** Builds the exports for the app's state S. */
  function create(S) {
    /** Puts blob on Slop Drive (id: write back to that file) and/or downloads it, by to. Returns the parts done and the id. */
    async function deliver(blob, name, to, meta, id) {
      const out = [];
      let driveId = '';
      if (to !== 'download') {
        const H = g.SlopHub;
        if (!H) throw new Error('Slop Drive is not available on this page');
        driveId = await H.put(blob, { id: id || undefined, name, from: 'effects', app: 'effects', meta });   // a new file lands in the app's folder
        out.push(`saved ${name} to Slop Drive (id ${driveId})`);
      }
      if (to !== 'drive') { g.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
      return { text: out.join(' and '), driveId };
    }

    /** One frame as a PNG: at a time (seconds; the playhead when not given). a: { time, name, to }. */
    async function exportFrame(a) {
      const doc = S.doc, comp = doc.comp;
      const t = ns.core.snap(comp, Math.min(comp.duration, Math.max(0, Number.isFinite(a.time) ? a.time : S.playhead)));
      const c = document.createElement('canvas');
      c.width = comp.width; c.height = comp.height;
      await ns.media.prepare(doc, t);
      ns.draw.drawFrame(c.getContext('2d'), doc, t, { media: ns.media });
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
      const name = `${safe(a.name || doc.name)}-${String(Math.round(t * comp.fps)).padStart(4, '0')}.png`;
      const r = await deliver(blob, name, a.to, { kind: 'effects-frame' });
      return `Frame at ${t} s (${comp.width}×${comp.height}): ${r.text}.`;
    }

    /** The project file (layers, keys, effects, composition; media by name). a: { to }. */
    async function saveProject(a) {
      const doc = S.doc;
      const blob = new Blob([ns.project.toFile(doc)], { type: 'application/json' });
      const name = ns.io.fileName(doc);
      const H = g.SlopHub;
      const known = a.to !== 'download' && S.file.driveId && H && (await H.get(S.file.driveId)) ? S.file.driveId : '';
      const r = await deliver(blob, name, a.to, { kind: 'effects' }, known);
      if (r.driveId) S.setFile({ name: doc.name, driveId: r.driveId });
      return `Project “${doc.name}”: ${r.text}.`;
    }

    return { deliver, exportFrame, saveProject };
  }

  ns.aiExport = { create };
})(typeof window !== 'undefined' ? window : globalThis);
