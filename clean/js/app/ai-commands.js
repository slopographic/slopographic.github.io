/* SlopClean for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (main.js). Through the app's own controller (CL.app) and intake:
 *   new_batch       empty the list to start again (results not saved are dropped)
 *   add_files       Slop Drive files or pictures on this site, through SlopIntake.take (as a drop would)
 *   set_options     what to remove: a preset, then categories to remove or keep (the "What to remove" panel)
 *   remove_file     take one picture off the list
 *   export_cleaned  the cleaned copies to Slop Drive (the SlopClean folder) and/or a download (one file or a zip)
 * state() says what is open and what was found and removed; the checkpoint puts the list and the choices back. */
(function () {
  'use strict';
  const C = window.SlopCmd, CL = window.CL;
  if (!C || !CL || !CL.app || C.get('cl.ai.new-batch')) return;
  const S = () => CL.app.state, K = () => window.SlopClean;
  const CATS = K().CATS.map((c) => c.id);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const list = [];
  const add = C.aiAdder('cl', list);   // shared/commands/commands.js
  const ready = () => S().items.filter((x) => x.out);
  const blobOf = (it) => new Blob([it.out.bytes], { type: it.out.mime });
  const find = (q) => {
    const s = String(q).toLowerCase(), items = S().items;
    const it = items.find((x) => x.id === q) || items.find((x) => x.name.toLowerCase() === s) || items.find((x) => x.name.toLowerCase().includes(s));
    if (!it) throw new Error(`No picture “${q}” on the list. The list has: ${items.map((x) => x.name).join(', ') || 'nothing'}.`);
    return it;
  };

  add('new_batch', 'Start a new batch', [], () => {
    const n = S().items.length;
    S().items = [];
    CL.app.render();
    return `Emptied the list (${plural(n, 'picture')} removed; the originals in Slop Drive stay). Use add_files next.`;
  }, { destructive: true, description: 'Empty the list of pictures to start a new batch. Cleaned copies not saved or downloaded are dropped.' });

  add('add_files', 'Add pictures', [
    { name: 'files', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'Slop Drive file names or ids (JPEG, PNG, WebP or TIFF)' },
    { name: 'urls', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'or addresses of pictures on this site' },
  ], async (a) => {
    const src = window.SlopCmdSources, files = [];
    for (const q of a.files || []) files.push(await src.driveFile(q));   // a Drive record: intake keeps it as file.slopDrive (Replace original)
    for (const u of a.urls || []) { const r = await src.siteFile(u); files.push(new File([r.blob], r.name, { type: r.blob.type || '' })); }
    if (!files.length) throw new Error('Give files (Slop Drive names or ids) or urls (pictures on this site)');
    const before = S().items.length;
    await window.SlopIntake.take(files, { source: 'drive', to: 'clean', mode: 'add' });
    const added = S().items.slice(before), bad = added.filter((x) => x.error);
    if (!added.length) throw new Error('SlopClean did not take those files (it takes JPEG, PNG, WebP and TIFF pictures)');
    const found = added.reduce((n, x) => n + x.findings.length, 0);
    return `Added ${plural(added.length - bad.length, 'picture')} (${plural(found, 'metadata item')} found) and cleaned them with the current choices`
      + (bad.length ? `; ${bad.length} could not be cleaned (${bad[0].name}: ${bad[0].error})` : '') + '.';
  }, { description: 'Add pictures from Slop Drive (or this site) to the list. They are cleaned right away with the current choices.' });

  const CAT_ITEMS = { type: 'string', enum: CATS };
  add('set_options', 'Choose what to remove', [
    { name: 'preset', type: 'enum', options: [['keep', 'keep the current choices'], ['defaults', 'the defaults (all personal data; keep colour profile and DPI)'], ['everything', 'remove everything, colour profile and DPI too'], ['location', 'remove only the GPS location']], default: 'keep', description: 'start from these choices' },
    { name: 'remove', type: 'array', maxItems: CATS.length, items: CAT_ITEMS, description: 'categories to remove: ' + CATS.join(', ') },
    { name: 'keep', type: 'array', maxItems: CATS.length, items: CAT_ITEMS, description: 'categories to keep' },
  ], async (a) => {
    let r = Object.assign({}, S().remove);
    if (a.preset === 'defaults') r = K().resolve({});
    if (a.preset === 'everything') r = Object.fromEntries(CATS.map((c) => [c, true]));
    if (a.preset === 'location') r = Object.fromEntries(CATS.map((c) => [c, c === 'location']));
    const bad = [].concat(a.remove || [], a.keep || []).filter((c) => !CATS.includes(c));
    if (bad.length) throw new Error(`Unknown categor${bad.length === 1 ? 'y' : 'ies'} ${bad.join(', ')}. Use: ${CATS.join(', ')}`);
    for (const c of a.remove || []) r[c] = true;
    for (const c of a.keep || []) r[c] = false;
    S().remove = r;
    await CL.app.runClean();
    const on = CATS.filter((c) => r[c]);
    return `Removing ${on.length ? on.join(', ') : 'nothing'}; keeping ${CATS.filter((c) => !r[c]).join(', ') || 'nothing'}. ${plural(ready().length, 'picture')} cleaned again.`;
  }, { description: 'Choose which kinds of metadata to remove from every picture on the list; the pictures are cleaned again.' });

  add('remove_file', 'Take a picture off the list', [{ name: 'name', type: 'string', required: true, maxLength: 300, description: 'the picture name (or a part of it)' }], (a) => {
    const it = find(a.name);
    S().items = S().items.filter((x) => x !== it);
    CL.app.render();
    return `Took ${it.name} off the list (${plural(S().items.length, 'picture')} left).`;
  }, { description: 'Take one picture off the list. Its original is not touched.' });

  add('export_cleaned', 'Export the cleaned pictures', [
    { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },
    { name: 'name', type: 'string', maxLength: 300, description: 'only these pictures (a name or a part of it); default all' },
  ], async (a) => {
    const items = (a.name ? [find(a.name)] : S().items).filter((x) => x.out);
    if (!items.length) throw new Error('Nothing is cleaned yet: add pictures with add_files first');
    const out = [];
    if (a.to !== 'download') {
      const H = window.SlopHub, folderId = await H.appFolderId('clean'), names = [];
      for (const it of items) { const n = CL.io.copyName(it.name); await H.put(blobOf(it), { name: n, from: 'clean', folderId }); names.push(n); }
      out.push(`saved ${plural(items.length, 'cleaned copy', 'cleaned copies')} to the SlopClean folder in Slop Drive (${names.slice(0, 5).join(', ')})`);
    }
    if (a.to !== 'drive') {
      if (items.length === 1) { window.SlopUI.download(blobOf(items[0]), CL.io.copyName(items[0].name)); out.push(`downloaded ${CL.io.copyName(items[0].name)}`); }
      else {
        const zip = await window.SlopZip.zip(items.map((x) => ({ name: CL.io.copyName(x.name), data: blobOf(x), time: Date.now() })));
        window.SlopUI.download(zip, 'slop-clean.zip'); out.push(`downloaded slop-clean.zip (${items.length} pictures)`);
      }
    }
    return out.join(' and ').replace(/^./, (c) => c.toUpperCase()) + '. The originals are untouched.';
  }, { description: 'Save the cleaned copies to Slop Drive (other apps can open them there) and/or download them (a zip for more than one).' });

  function state() {
    const s = S(), labels = Object.fromEntries(K().CATS.map((c) => [c.id, c.label]));
    return {
      app: 'SlopClean',
      remove: CATS.filter((c) => s.remove[c]), keep: CATS.filter((c) => !s.remove[c]), categories: labels,
      pictures: s.items.slice(0, 50).map((x) => ({
        name: x.name, format: x.label || null, bytes: x.size, fromDrive: !!x.driveId, found: K().summary(x.findings),
        removed: x.out ? x.findings.length - x.out.after.length : 0, left: x.out ? x.out.after.map((f) => f.label).slice(0, 20) : null,
        error: x.error || undefined,
      })),
      total: s.items.length, cleaned: ready().length,
    };
  }
  /** The list and the choices as they are now: the rollback puts them back and cleans again. */
  function checkpoint() {
    const items = S().items.slice(), remove = Object.assign({}, S().remove);
    return () => { S().items = items; S().remove = remove; CL.app.runClean(); return true; };
  }
  C.register(list);
  C.provide({ state, checkpoint });
})();
