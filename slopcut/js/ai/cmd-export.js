/* SlopCut commands with arguments (SE.ai): export and look. export_video renders with the app's own WebCodecs export
   (io/encode.js) with progress and Cancel (and the caller's AbortSignal), then saves to Slop Drive and/or downloads.
   look_at_frame renders one frame (render/preview.js frameCanvas) as a small JPEG for a model that can see: it is a
   "sends" command, so the AI panel asks every time (shared/ai/cmdtools.js, the one permission hook). */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, AI = SE.ai, U = SE.util, SV = window.SlopVideo;

  /** Render the project (or its in/out range) to a video file. Resolves { blob, info, name }. */
  AI.render = async function (o = {}, ctx = {}) {
    const p = SE.doc;
    if (!p.clips.length) throw new Error('The timeline is empty: add clips first.');
    if (!SE.caps || !SE.caps.webcodecs) throw new Error('This browser has no WebCodecs video encoder, so it cannot export here. Try Chrome, Edge or a recent Safari.');
    const size = o.width && o.height ? SV.presets.clamp(o.width, o.height) : o.aspect ? SV.presets.aspectSize(o.aspect) : { w: p.w, h: p.h };
    // the export size is the sequence size (as the dialog does); titles and positions follow it
    if (size.w !== p.w || size.h !== p.h) { SE.change('Export size', (d) => AI.resize(d, size)); SE.emit('settings', {}); }
    const r = SE.exportDialog.range(o.range === 'io' ? 'io' : 'all');
    const job = AI.job('Exporting video', ctx);
    try {
      const out = await SE.encode.run({ format: o.format || 'mp4', w: size.w, h: size.h, fps: Number(o.fps) || p.fps, quality: o.quality || 'high', audio: o.audio !== false, a: r.a, b: r.b,
        progress: (f, m) => job.set(f, m), signal: job.signal });
      const ext = out.blob.type.includes('mp4') ? 'mp4' : 'webm';
      out.name = (String(o.name || '').trim() || U.baseName(p.name)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(mp4|webm)$/i, '') + '.' + ext;
      out.info.duration = AI.t(r.b - r.a);
      AI.last = out;
      return out;
    } finally { job.close(); }
  };

  AI.def([
    { id: 'cut.export', tool: 'export_video', title: 'Export video to Slop Drive…', group: 'File', prefill: () => ({ width: SE.doc.w, height: SE.doc.h }),
      description: 'Render the edit to MP4 or WebM on this device (WebCodecs; long edits take a while and report progress; Stop cancels). The file is saved to Slop Drive (save_to_drive) and/or downloaded. Returns the Slop Drive file id, size, length and codec.',
      args: [{ name: 'format', type: 'enum', values: ['mp4', 'webm'], default: 'mp4' }, { name: 'aspect', type: 'enum', values: SV.edl.ASPECTS, description: 'a standard size; default the sequence size' },
        { name: 'width', type: 'number', min: 16, max: 7680, integer: true }, { name: 'height', type: 'number', min: 16, max: 4320, integer: true },
        { name: 'fps', type: 'number', min: 1, max: 60, integer: true, description: 'frames per second' }, { name: 'quality', type: 'enum', values: ['low', 'medium', 'high', 'max'], default: 'high' },
        { name: 'range', type: 'enum', values: ['all', 'io'], default: 'all', description: 'all, or the in/out range' }, { name: 'audio', type: 'boolean', default: true },
        { name: 'name', type: 'string', maxLength: 120, description: 'file name (default the project name)' },
        { name: 'save_to_drive', type: 'boolean', default: true }, { name: 'download', type: 'boolean', default: false }],
      run: async (a, ctx) => {
        let out;
        try { out = await AI.render(a, ctx); } catch (e) { if (e && e.name === 'AbortError') throw new Error('The export was cancelled.'); throw e; }
        const res = { name: out.name, size: out.blob.size, width: out.info.w, height: out.info.h, fps: out.info.fps, duration: out.info.duration, codec: out.info.codec, audio: out.info.audio };
        if (a.save_to_drive && window.SlopHub && !SE.offline) { res.file = await SlopHub.put(out.blob, { name: out.name, from: 'slopedit' }); res.saved = 'Slop Drive'; }
        if (a.download || !res.file) { SlopUI.download(out.blob, out.name); res.downloaded = true; }
        SE.app.status('Exported ' + out.name);
        return res;
      } },
    { id: 'cut.look', tool: 'look_at_frame', title: 'Look at a frame…', group: 'View', sends: true, macro: false, prefill: () => ({ time: AI.t(AI.now()) }),
      description: 'See the edit at a time: a small JPEG of the frame as it will be exported (titles, transitions, colour included). The person is asked each time, because a copy goes to the AI provider.',
      args: [{ name: 'time', type: 'number', min: 0, max: 86400, required: true, description: 'timeline seconds' }, { name: 'max_size', type: 'number', min: 64, max: 1024, default: 768, integer: true, description: 'longest side in px' }],
      run: async (a) => {
        const p = SE.doc, t = Math.min(AI.frame(a.time), Math.max(0, M.duration(p) - 1 / p.fps));
        const full = await SE.preview.frameCanvas(t), k = Math.min(1, a.max_size / Math.max(p.w, p.h));
        const c = U.canvas(p.w * k, p.h * k);
        c.getContext('2d').drawImage(full, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
        return { text: `The frame at ${t} s (${c.width}×${c.height} of ${p.w}×${p.h}).`, media: [{ mime: 'image/jpeg', data, name: `frame-${t}s.jpg` }] };
      } },
  ]);
})();
