/* Slop Upscale for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), through the page's
 * own controller (main.js open, run, clear) and output (output.js download, saveDrive). Loaded on demand by
 * commands.js; the files come from Slop Drive or this site through window.SlopCmdSources (shared/commands/sources.js).
 * add_file opens the file with the intake's own reader (main.js open): it joins the list and becomes the open item.
 *   up.ai.new-upscale     new_upscale     (none)                                   destructive: drops a result not saved
 *   up.ai.add-file        add_file        file | url
 *   up.ai.set-upscale     set_upscale     scale 2|4, model fast|quality|lanczos, format, quality, fps
 *   up.ai.upscale         upscale         (none) runs and waits
 *   up.ai.save-result     save_result     to drive|download|both */
(function (g) {
  'use strict';
  const U = g.SlopUpscale, Cmd = g.SlopCmd;
  if (!U || !Cmd || !Cmd.register || U.aiCommands) return;
  U.aiCommands = true;
  const $ = (id) => document.getElementById(id), S = () => U.app.S;
  const notBusy = () => { if (S().busy) throw new Error('An upscale is running; wait for it or cancel it first'); };
  const field = (id, v) => { const e = $(id); e.value = String(v); e.dispatchEvent(new Event(e.type === 'range' ? 'input' : 'change', { bubbles: true })); };

  async function addFile(a) {
    notBusy();
    const src = g.SlopCmdSources;
    if (!a.file && !a.url) throw new Error('Give file (a Slop Drive name or id) or url (a picture on this site)');
    const r = a.file ? await src.driveFile(a.file) : await src.siteFile(a.url);
    const ok = await U.app.open(new File([r.blob], r.name, { type: r.type || r.blob.type || '' }), { drive: r.id || null });
    if (!ok || !S().item) throw new Error(`${r.name} could not be opened (Slop Upscale takes one picture or a short video)`);
    const it = S().item;
    return `Opened ${it.name} (${it.w} × ${it.h} px); it becomes ${it.w * S().scale} × ${it.h * S().scale} px at ${S().scale}×.`;
  }
  function setUpscale(a) {
    notBusy();
    if (a.model === 'quality' && Number(a.scale || S().scale) !== 4) throw new Error('The Quality model is 4× only: give scale 4');   // checked before anything changes
    if (a.scale) $('up-scale-' + a.scale).click();
    if (a.model) {
      field('up-model', a.model);
    }
    if (a.format) { const o = [...$('up-format').options].find((x) => x.value === a.format); if (o && o.disabled) throw new Error(`${a.format} is not available in this browser`); field('up-format', a.format); }
    if (a.quality != null) field('up-quality', a.quality);
    if (a.fps != null) field('up-fps', a.fps);
    if (a.scale && S().scale !== Number(a.scale)) $('up-scale-' + a.scale).click();   // a model change may have reset it
    return `Upscale ${S().scale}× with ${S().model}, saved as ${S().format}${S().format === 'png' ? '' : ` at ${Math.round(S().quality * 100)}%`}.`;
  }
  async function upscale() {
    notBusy();
    const it = S().item;
    if (!it) throw new Error('Nothing is open: use add_file first');
    await U.controller.run();
    if (!it.out) throw new Error($('up-status').textContent || 'The upscale did not finish');
    const w = it.out.canvas ? it.out.canvas.width : it.out.w, h = it.out.canvas ? it.out.canvas.height : it.out.h;
    return `${$('up-status').textContent} The result is ${w} × ${h} px.`;
  }
  async function saveResult(a) {
    notBusy();
    const it = S().item;
    if (!it || !it.out) throw new Error('There is no result yet: run upscale first');
    const out = [];
    if (a.to !== 'download') {
      it.drive = null;
      await U.output.saveDrive();
      if (!it.drive) throw new Error($('up-status').textContent || 'Could not save to Slop Drive');
      out.push(`Saved ${U.output.resultName()} to the Slop Upscale folder in Slop Drive (id ${it.drive})`);
    }
    if (a.to !== 'drive') { await U.output.download(); out.push(`downloaded ${U.output.resultName()}`); }
    return out.join(' and ') + '.';
  }
  function state() {
    const it = S().item;
    return { app: 'Slop Upscale', busy: S().busy, scale: S().scale, model: S().model, format: S().format, quality: S().quality,
      file: it ? { name: it.name, kind: it.kind, width: it.w, height: it.h, result: it.out ? (it.out.canvas ? { width: it.out.canvas.width, height: it.out.canvas.height } : { width: it.out.w, height: it.out.h }) : null, saved: it.drive || null } : null,
      status: $('up-status').textContent };
  }
  function checkpoint() {
    const snap = { scale: S().scale, model: S().model, format: S().format };
    return () => { if (S().busy) return false; $('up-scale-' + snap.scale).click(); field('up-model', snap.model); field('up-format', snap.format); return true; };
  }

  const base = { group: 'AI', hidden: true };
  Cmd.register([
    Object.assign({ id: 'up.ai.new-upscale', tool: 'new_upscale', title: 'Start over', destructive: true, args: [],
      run: () => { notBusy(); U.controller.clear(); return 'Cleared: open a new picture with add_file.'; }, description: 'Close the open picture and its result (a result not saved is dropped).' }, base),
    Object.assign({ id: 'up.ai.add-file', tool: 'add_file', title: 'Open a picture or video', destructive: false,
      args: [{ name: 'file', type: 'string', maxLength: 300, description: 'a Slop Drive file name or id' }, { name: 'url', type: 'string', maxLength: 500, description: 'or a picture on this site' }],
      run: addFile, description: 'Open one picture or short video from Slop Drive to upscale.' }, base),
    Object.assign({ id: 'up.ai.set-upscale', tool: 'set_upscale', title: 'Upscale settings', destructive: false,
      args: [{ name: 'scale', type: 'enum', values: ['2', '4'] }, { name: 'model', type: 'enum', options: [['fast', 'Fast (bundled)'], ['quality', 'Quality (4× only, once installed)'], ['lanczos', 'Lanczos (no AI)']] },
        { name: 'format', type: 'enum', values: ['png', 'jpeg', 'webp', 'avif'] }, { name: 'quality', type: 'number', min: 40, max: 100, integer: true, description: '% for JPEG, WebP, AVIF' },
        { name: 'fps', type: 'number', min: 1, max: 60, integer: true, description: 'video frames per second' }],
      run: setUpscale, description: 'Choose 2× or 4×, the model and the output format.' }, base),
    Object.assign({ id: 'up.ai.upscale', tool: 'upscale', title: 'Upscale', destructive: false, args: [], run: upscale, description: 'Upscale the open picture or video and wait until it is done.' }, base),
    Object.assign({ id: 'up.ai.save-result', tool: 'save_result', title: 'Save the result', destructive: false,
      args: [{ name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' }],
      run: saveResult, description: 'Save the bigger copy to Slop Drive and/or download it.' }, base),
  ]);
  Cmd.provide({ state, checkpoint });
})(typeof window !== 'undefined' ? window : globalThis);
