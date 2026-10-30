/* Slopnodes projects in Slop Drive: one file per project (JSON, format 'slopnodes' v1), with meta { type:'nodes',
 * kind:'nodes-project', title, nodes, links, saved }. Save writes a new file, or updates the file the project came from;
 * Open reads one back (the file is chosen in the shared Slop Drive picker, js/app.js). Classic script, needs shared/hub.js (window.SlopHub). Exposes window.SlopNodesProjects. */
(function () {
  'use strict';
  const KIND = 'nodes-project';
  const hub = () => { if (!window.SlopHub) throw new Error('Slop Drive is not available in this browser'); return window.SlopHub; };
  const safe = (s) => String(s || 'Untitled').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'Untitled';

  /** Writes the project. driveId: the file it came from (updated in place), or null for a new file. Returns the file id. */
  async function save(project) {
    const data = { format: 'slopnodes', version: 1, name: project.name, graph: project.graph };
    const body = JSON.stringify(data, null, 2);
    const nodes = project.graph.nodes.length, links = project.graph.links.length;
    return hub().put(new Blob([body], { type: 'application/json' }), {
      name: safe(project.name) + '.slopnodes.json', from: 'nodes', id: project.driveId || undefined,
      meta: { type: 'nodes', kind: KIND, title: project.name, nodes, links, saved: Date.now() },
    });
  }
  /** Reads a project back: { id, name, graph }. Throws a plain message when the file is not a Slopnodes project. */
  async function open(id) {
    const rec = await hub().get(id);
    if (!rec || !rec.blob) throw new Error('That project is no longer in Slop Drive');
    let data = null;
    try { data = JSON.parse(await rec.blob.text()); } catch (e) { data = null; }
    if (!data || data.format !== 'slopnodes' || !data.graph) throw new Error('That file is not a Slopnodes project');
    return { id, name: data.name || rec.name, graph: data.graph };
  }
  window.SlopNodesProjects = { save, open, KIND };
})();
