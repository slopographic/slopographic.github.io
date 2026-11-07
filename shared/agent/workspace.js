/* SlopAgentWorkspace: the two file tools a page adds for an agent beside the one tool list (shared/ai/apptools.js
 * appTools.build, which has list_files, read_file, save_to_drive, the operations of shared/ai/optools.js and the app's
 * commands): open_file (a Slop Drive file into this app, through SlopIntake.take) and download. Classic script;
 * window.SlopAgentWorkspace. Files are Slop Drive ids or names (list_files), or "open" (what the app has open, the same
 * event the Convert dialog asks, shared/convert/provided.js). Nothing is uploaded.
 *   defs({ app, hub }) → [open_file?, download]   (open_file only where the app registered an intake spec)
 *   file(ref, hub) → Promise<File> */
(function (g) {
  'use strict';
  if (g.SlopAgentWorkspace) return;
  const SCRIPT = document.currentScript;
  const ROOT = SCRIPT && SCRIPT.src ? new URL('../../', SCRIPT.src).href : new URL('/', location.href).href;
  const FILE = { type: 'string', description: 'a Slop Drive file id or name from list_files, or "open" for what this app has open' };

  async function file(ref, hub = g.SlopHub) {
    const q = String(ref || '').trim();
    if (/^(open|current|app(:\d+)?)$/i.test(q)) {
      const { ask } = await import(new URL('shared/convert/provided.js', ROOT).href);
      const { files, app } = await ask();
      if (!files.length) throw new Error(`${app} has nothing open.`);
      return files[Math.min(files.length, Number(q.split(':')[1]) || 1) - 1];
    }
    const r = await g.SlopAIKit.appTools.findFile(hub, q.replace(/^drive:/, ''));
    const f = new File([r.blob], r.name, { type: r.type || r.blob.type || '' });
    f.slopDrive = r;
    return f;
  }

  function defs({ app = 'this app', hub = g.SlopHub } = {}) {
    const list = [
      { name: 'download', description: 'Download a file to this device\'s Downloads folder, as the browser does for any download.',
        inputSchema: { type: 'object', properties: { file: FILE }, required: ['file'] },
        run: async (a) => {
          const f = await file(a.file, hub);
          if (g.SlopUI && g.SlopUI.download) g.SlopUI.download(f, f.name);
          else { const u = URL.createObjectURL(f), l = Object.assign(document.createElement('a'), { href: u, download: f.name }); document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
          return `Downloaded ${f.name}.`;
        } },
    ];
    const I = g.SlopIntake;
    if (I && I.take && I.spec && I.spec()) list.unshift({ name: 'open_file',
      description: `Open a Slop Drive file (id or name from list_files) in ${app}, the same way as opening it from Slop Drive. The app may ask the person whether to add it or start a new document.`,
      inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'a Slop Drive file id or name from list_files' } }, required: ['file'] },
      run: async (a) => {
        const f = await file(a.file, hub), s = await I.take([f.slopDrive || f], { source: f.slopDrive ? 'drive' : 'api' });
        if (s.added && s.added.length) return `Opened ${f.name} in ${app}.`;
        throw new Error(s.skipped && s.skipped.length ? s.skipped[0].reason : `${app} did not open ${f.name}.`);
      } });
    return list;
  }

  g.SlopAgentWorkspace = { defs, file };
})(window);
