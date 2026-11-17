/* Slop Resize for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), so the Slop AI panel
 * can resize with real values ("make these 800 px wide WebP at 70%" → set_size, set_output_format, resize_all).
 * Loaded on demand by SlopCmd.prepare() (commands.js), never on first paint; also provides the state summary and the
 * settings checkpoint. The commands are hidden from the palette (rs.mode.*, rs.fill.*, rs.run already list the same
 * things). Like commands.js, each setting is written to the panel's own control with a 'change' event, so the panel
 * shows exactly what the assistant chose.
 *   rs.ai.set-size           tool set_size           mode, width, height, percent, long_edge, target_kb, fill, keep_ratio, background
 *   rs.ai.set-output-format  tool set_output_format  format, quality
 *   rs.ai.resize-all         tool resize_all         (none) runs the queue and waits for it */
(function (g) {
  'use strict';
  const NS = g.SlopResize, Cmd = g.SlopCmd;
  if (!NS || !Cmd || !Cmd.register || NS.aiCommands) return;
  NS.aiCommands = true;
  const $ = (id) => document.getElementById(id);
  const FORMATS = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
  const FORMAT_OF = (mime) => Object.keys(FORMATS).find((k) => FORMATS[k] === mime) || mime;
  const N = (name, min, max, description) => ({ name, type: 'number', min, max, integer: true, description });
  const E = (name, values, description) => ({ name, type: 'enum', values, description });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function setField(id, value) {
    const e = $(id);
    if (!e) return;
    if (e.type === 'checkbox') e.checked = !!value; else e.value = String(value);
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const busy = () => NS.queue.busy();
  const hasItems = () => NS.queue.items().some((i) => i.src);
  const notBusy = () => { if (busy()) throw new Error('A resize is running; wait for it or cancel it first'); };

  /* ---------- set_size ---------- */
  const SIZE_ARGS = [
    E('mode', NS.size.MODES, 'size = width × height box, scale = percent, long = long edge, bytes = file size limit (pictures); inferred from the other arguments when left out'),
    N('width', 0, 16384, 'px, for mode size or bytes; 0 follows the picture'),
    N('height', 0, 16384, 'px, for mode size or bytes; 0 follows the picture'),
    N('percent', 1, 400, '% of the original, for mode scale'),
    N('long_edge', 1, 16384, 'px, for mode long'),
    N('target_kb', 1, 100000, 'maximum file size in KB, for mode bytes'),
    E('fill', NS.size.FILLS, 'fit = letterbox, cover = crop, stretch, within = fit inside without padding'),
    { name: 'keep_ratio', type: 'boolean', description: 'keep the aspect ratio' },
    { name: 'background', type: 'color', description: 'colour behind a letterboxed picture; "transparent" for none' },
  ];
  function setSize(a) {
    notBusy();
    a = a || {};
    let mode = a.mode;
    if (!mode) mode = a.target_kb != null ? 'bytes' : a.percent != null ? 'scale' : a.long_edge != null ? 'long' : (a.width != null || a.height != null) ? 'size' : null;
    if (!mode && a.fill == null && a.keep_ratio == null && a.background == null) throw new Error('Nothing to change: give a mode, width, height, percent, long_edge, target_kb, fill or background');
    if (mode) setField('rs-mode', mode);
    if (a.width != null || a.height != null) setField('rs-preset', '');   // a typed box is a custom size
    if (a.keep_ratio != null) setField('rs-keep', a.keep_ratio);
    if (a.fill != null) setField('rs-fill', a.fill);
    if (a.width != null) setField('rs-w', a.width);
    if (a.height != null) setField('rs-h', a.height);
    const one = a.width != null && a.height == null ? 'rs-w' : a.height != null && a.width == null ? 'rs-h' : '';
    if (one) $(one).dispatchEvent(new Event('input', { bubbles: true }));   // the aspect lock derives the other side
    if (a.percent != null) setField('rs-scale', a.percent);
    if (a.long_edge != null) setField('rs-long', a.long_edge);
    if (a.target_kb != null) setField('rs-kb', a.target_kb);
    if (a.background != null) {
      const clear = /^#[0-9a-f]{6}00$/i.test(a.background);
      if (!clear) setField('rs-bg', a.background.slice(0, 7));
      setField('rs-transparent', clear);
    }
    return 'Size: ' + describeSize(NS.settings.read()) + '.';
  }
  function describeSize(s) {
    const box = `${s.w || 'auto'} × ${s.h || 'auto'} px, ${s.fill}`;
    if (s.mode === 'scale') return `${s.scale}% of the original`;
    if (s.mode === 'long') return `long edge ${s.long} px`;
    if (s.mode === 'bytes') return `at most ${s.maxKB} KB` + (s.w || s.h ? `, box ${box}` : '');
    return box;
  }

  /* ---------- set_output_format ---------- */
  const FORMAT_ARGS = [
    E('format', Object.keys(FORMATS), 'picture format of the copies'),
    N('quality', 30, 100, '% for JPEG, WebP and AVIF (PNG ignores it)'),
  ];
  function setFormat(a) {
    notBusy();
    a = a || {};
    if (a.format == null && a.quality == null) throw new Error('Nothing to change: give format or quality');
    if (a.format != null) {
      const opt = [...$('rs-mime').options].find((o) => o.value === FORMATS[a.format]);
      if (!opt || opt.disabled) throw new Error(`This browser cannot write ${a.format.toUpperCase()} pictures`);
      setField('rs-mime', opt.value);
    }
    if (a.quality != null) setField('rs-quality', a.quality);
    const s = NS.settings.read(), f = NS.format.byMime(s.mime);
    return `Output: ${f ? f.label : s.mime}` + (f && f.lossy ? `, quality ${s.quality}%` : '') + '.';
  }

  /* ---------- resize_all ---------- */
  async function resizeAll() {
    notBusy();
    if (!hasItems()) throw new Error('The list has no pictures or videos to resize; open some first');
    await NS.app.run();
    const items = NS.queue.items().filter((i) => i.src), done = items.filter((i) => i.status === 'done');
    const failed = items.filter((i) => i.status === 'error'), cancelled = items.filter((i) => i.status === 'cancelled');
    if (!done.length) throw new Error('Nothing was resized' + (failed.length ? ': ' + failed[0].err : ''));
    const shown = done.slice(0, 5).map((i) => `${i.outName} (${i.out.w} × ${i.out.h}, ${NS.format.bytes(i.out.size)})`);
    return `Resized ${plural(done.length, 'file', 'files')}: ${shown.join('; ')}${done.length > 5 ? '; …' : ''}.`
      + (failed.length ? ` ${failed.length} failed (${failed[0].name}: ${failed[0].err}).` : '')
      + (cancelled.length ? ` ${cancelled.length} cancelled.` : '');
  }

  /* ---------- state and checkpoint ---------- */
  function state() {
    const s = NS.settings.read(), items = NS.queue.items();
    return {
      app: 'resize', busy: busy(),
      files: items.slice(0, 30).map((i) => {
        const o = { name: i.name, kind: i.kind, status: i.status, bytes: i.file ? i.file.size : 0 };
        if (i.src) { o.width = i.src.w; o.height = i.src.h; }
        if (i.out) o.output = { name: i.outName, width: i.out.w, height: i.out.h, bytes: i.out.size, format: i.out.ext };
        if (i.err) o.error = i.err;
        return o;
      }),
      more_files: Math.max(0, items.length - 30),
      settings: {
        mode: s.mode, width: s.w, height: s.h, percent: s.scale, long_edge: s.long, target_kb: s.maxKB,
        fill: s.fill, keep_ratio: s.keepRatio, background: s.bg, format: FORMAT_OF(s.mime), quality: s.quality,
        size_preset: $('rs-preset') ? $('rs-preset').value : '',
      },
    };
  }
  /** Puts the panel back as it was. Results already made stay. */
  function checkpoint() {
    const snap = NS.settings.read(), preset = $('rs-preset') ? $('rs-preset').value : '';
    return () => {
      NS.settings.write(snap);
      if ($('rs-preset')) $('rs-preset').value = preset;
      $('rs-panel').dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
  }

  const base = { group: 'AI', hidden: true };
  Cmd.register([
    Object.assign({ id: 'rs.ai.set-size', tool: 'set_size', title: 'Set the output size', destructive: false, args: SIZE_ARGS, run: setSize,
      description: 'Choose how the copies are sized: a width × height box, a percentage, a long edge, or a file size limit.' }, base),
    Object.assign({ id: 'rs.ai.set-output-format', tool: 'set_output_format', title: 'Set the output format', destructive: false, args: FORMAT_ARGS, run: setFormat,
      description: 'Choose the picture format (JPEG, PNG, WebP, AVIF) and quality of the copies.' }, base),
    Object.assign({ id: 'rs.ai.resize-all', tool: 'resize_all', title: 'Resize all', destructive: false, args: [], run: resizeAll, when: hasItems,
      why: 'The list has no pictures or videos to resize', description: 'Resize every file in the list with the current settings and wait until done. Originals are kept.' }, base),
  ]);
  Cmd.provide({ state, checkpoint });
})(typeof window !== 'undefined' ? window : globalThis);
