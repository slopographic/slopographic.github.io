/* SlopIsolate for the assistant: the batch around the look (co.look, ui/macros.js, sets the model and the look).
 * new_batch empties the list, add_images brings Slop Drive pictures in through the app's one way in (SlopIntake.take,
 * like a drop), each image is cut out by the app's own queue (io/process.js, the on-device model after its first-use
 * notice), and save_cutouts waits for the queue, then encodes each picture with the app's export (CO.export.encode) to
 * Slop Drive, or downloads the ZIP (CO.export.all). Classic script, loaded on demand by SlopCmd.prepare()
 * (ui/commands.js); window.SlopCmdSources (shared/commands/sources.js) finds the files.
 *   co.ai.new-batch      new_batch      (none)                         destructive
 *   co.ai.add-images     add_images     files[], urls[]
 *   co.ai.save-cutouts   save_cutouts   to drive|download|both, format png|webp|jpg */
(function () {
  'use strict';
  const CO = window.CO, S = CO && CO.state, Cmd = window.SlopCmd;
  if (!CO || !Cmd || CO.aiCommands) return;
  CO.aiCommands = true;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pending = (it) => it.status === 'queued' || it.status === 'working';

  async function addImages(a) {
    const src = window.SlopCmdSources, files = [];
    for (const q of a.files || []) { const r = await src.driveFile(q); files.push(new File([r.blob], r.name, { type: r.type || r.blob.type || '' })); }
    for (const u of a.urls || []) { const r = await src.siteFile(u); files.push(new File([r.blob], r.name, { type: r.blob.type || '' })); }
    if (!files.length) throw new Error('Give files (Slop Drive names or ids) or urls (pictures on this site)');
    const before = S.items.length;
    await window.SlopIntake.take(files, { source: 'drive', to: 'cutout', mode: 'add' });
    const added = S.items.length - before;
    if (!added) throw new Error('SlopIsolate did not take those files (it takes pictures and short videos)');
    return `Added ${plural(added, 'image', 'images')}; the background is being removed. save_cutouts waits for it.`;
  }
  /** Resolves once no image is queued or working (at most timeout ms). */
  function settled(timeout = 180000) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = () => {
        if (!S.items.some(pending)) return res();
        if (Date.now() - t0 > timeout) return rej(new Error('The cutouts are still running; try again in a moment'));
        setTimeout(tick, 150);
      };
      tick();
    });
  }
  async function saveCutouts(a) {
    if (!S.items.length) throw new Error('The list is empty: add_images first');
    await settled();
    const done = S.items.filter((it) => it.status === 'done' && it.kind !== 'video'), bad = S.items.filter((it) => it.status === 'error');
    if (!done.length) throw new Error('No cutout is ready' + (bad.length ? ': ' + (bad[0].error || 'it failed') : ''));
    const out = [];
    if (a.to !== 'download') {
      const saved = [];
      for (const it of done) {
        const { blob, ext } = await CO.export.encode(it, a.format);
        const name = CO.util.baseName(it.name) + '-cutout.' + ext;
        saved.push(`${name}, id ${await window.SlopCmdSources.put(blob, name, 'slopisolate')}`);
      }
      out.push(`Saved ${plural(saved.length, 'cutout', 'cutouts')} to Slop Drive (${saved.slice(0, 5).join('; ')})`);
    }
    if (a.to !== 'drive') { if (a.format) S.setExport({ format: a.format }); await CO.export.all(); out.push('downloaded slop-cutouts.zip'); }
    return out.join(' and ') + '.' + (bad.length ? ` ${bad.length} failed.` : '');
  }
  function state() {
    const it = S.current();
    return { app: 'SlopIsolate', model: S.model, look: CO.lookArgs ? CO.lookArgs(it) : null,
      images: S.items.slice(0, 40).map((x) => ({ name: x.name, status: x.status, width: x.w, height: x.h, error: x.error || null })), open: it ? it.name : null };
  }

  const base = { group: 'AI', hidden: true };
  Cmd.register([
    Object.assign({ id: 'co.ai.new-batch', tool: 'new_batch', title: 'Start a new batch', destructive: true, args: [],
      run: () => { const n = S.items.length; for (const it of S.items.slice()) CO.process.remove(it); return `Emptied the list (${plural(n, 'image', 'images')} removed).`; },
      description: 'Remove every image from the list to start a new batch (cutouts not saved are dropped).' }, base),
    Object.assign({ id: 'co.ai.add-images', tool: 'add_images', title: 'Add images', destructive: false,
      args: [{ name: 'files', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'Slop Drive file names or ids' },
        { name: 'urls', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'or addresses of pictures on this site' }],
      run: addImages, description: 'Add pictures from Slop Drive; each one gets its background removed on this device.' }, base),
    Object.assign({ id: 'co.ai.save-cutouts', tool: 'save_cutouts', title: 'Save the cutouts', destructive: false,
      args: [{ name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a ZIP download'], ['both', 'both']], default: 'drive' },
        { name: 'format', type: 'enum', values: ['png', 'webp', 'jpg'], description: 'the export format (PNG keeps the see-through background)' }],
      run: saveCutouts, description: 'Wait for the cutouts, then save them to Slop Drive and/or download them as a ZIP.' }, base),
  ]);
  if (Cmd.provide) Cmd.provide({ state });
})();
