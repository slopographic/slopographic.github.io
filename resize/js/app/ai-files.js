/* Slop Resize for the assistant: the files around a run. new_batch (empties the list), add_files (Slop Drive files or
 * pictures on this site, through the app's one way in, SlopIntake.take, like a drop or Open from Slop Drive) and
 * save_results (the app's own Save to Slop Drive and Download all). Loaded on demand after ai-commands.js by
 * SlopCmd.prepare() (commands.js); window.SlopCmdSources (shared/commands/sources.js) finds the files.
 *   rs.ai.new-batch      tool new_batch      (none)                 destructive: the results not saved are dropped
 *   rs.ai.add-files      tool add_files      files[], urls[]
 *   rs.ai.save-results   tool save_results   to: drive | download | both */
(function (g) {
  'use strict';
  const NS = g.SlopResize, Cmd = g.SlopCmd;
  if (!NS || !Cmd || !Cmd.register || NS.aiFiles) return;
  NS.aiFiles = true;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const notBusy = () => { if (NS.queue.busy()) throw new Error('A resize is running; wait for it or cancel it first'); };

  /** Drive names or ids and same-site addresses → Files, then the app's own intake (as a drop would). */
  async function addFiles(a) {
    notBusy();
    const S = g.SlopCmdSources, files = [];
    for (const q of a.files || []) { const r = await S.driveFile(q); files.push(new File([r.blob], r.name, { type: r.type || r.blob.type || '' })); }
    for (const u of a.urls || []) { const r = await S.siteFile(u); files.push(new File([r.blob], r.name, { type: r.blob.type || '' })); }
    if (!files.length) throw new Error('Give files (Slop Drive names or ids) or urls (pictures on this site)');
    const before = NS.queue.items().length;
    await g.SlopIntake.take(files, { source: 'drive', to: 'resize', mode: 'add' });
    const added = NS.queue.items().slice(before), bad = added.filter((i) => i.status === 'error');
    if (!added.length) throw new Error('Slop Resize did not take those files (it takes pictures and videos)');
    return `Added ${plural(added.length - bad.length, 'file', 'files')} to the list` + (bad.length ? `; ${bad.length} could not be read (${bad[0].name}: ${bad[0].err})` : '') + '.';
  }
  async function saveResults(a) {
    notBusy();
    const done = NS.queue.items().filter((i) => i.status === 'done');
    if (!done.length) throw new Error('Nothing is resized yet: run resize_all first');
    const out = [];
    if (a.to !== 'download') {
      await NS.app.saveAll();
      const saved = done.filter((i) => i.drive);
      if (!saved.length) throw new Error('The results could not be saved to Slop Drive');
      out.push(`saved ${plural(saved.length, 'result', 'results')} to the Slop Resize folder in Slop Drive (${saved.slice(0, 5).map((i) => i.outName).join(', ')})`);
    }
    if (a.to !== 'drive') { await NS.app.downloadAll(); out.push(done.length === 1 ? `downloaded ${done[0].outName}` : `downloaded a ZIP of ${done.length} results`); }
    return out.join(' and ').replace(/^./, (c) => c.toUpperCase()) + '.';
  }

  const base = { group: 'AI', hidden: true };
  Cmd.register([
    Object.assign({ id: 'rs.ai.new-batch', tool: 'new_batch', title: 'Start a new batch', destructive: true, args: [],
      run: () => { notBusy(); const n = NS.queue.items().length; NS.queue.clear(); return `Emptied the list (${plural(n, 'file', 'files')} removed; originals and saved results stay).`; },
      description: 'Empty the list to start a new batch. Results not saved or downloaded are dropped.' }, base),
    Object.assign({ id: 'rs.ai.add-files', tool: 'add_files', title: 'Add files', destructive: false,
      args: [{ name: 'files', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'Slop Drive file names or ids' },
        { name: 'urls', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'or addresses of pictures on this site' }],
      run: addFiles, description: 'Add pictures or videos from Slop Drive to the list.' }, base),
    Object.assign({ id: 'rs.ai.save-results', tool: 'save_results', title: 'Save the results', destructive: false,
      args: [{ name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' }],
      run: saveResults, description: 'Save the resized copies to Slop Drive (other apps can open them there) and/or download them.' }, base),
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
