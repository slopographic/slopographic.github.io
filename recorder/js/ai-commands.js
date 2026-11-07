/* Slop Recorder for the assistant: SlopCmd commands with argument schemas (the AI panel, Ctrl+K, macros and WebMCP), loaded
 * by SlopCmd.prepare() (commands.js). The work is the page's own (SlopRec.app, settings, view, save), so the assistant and
 * the buttons do the same thing.
 *   new_recording      the settings for the next recording (source, sound, countdown, webcam corner, format); drops one not saved
 *   start_recording    starts it. The screen needs a click in the browser: when it is refused, say "press Record"
 *   pause_recording, resume_recording, stop_recording
 *   add_recording      a recording from Slop Drive (name or id), to trim or save in another format
 *   trim_recording     the part to keep, in seconds
 *   set_format         WebM, MP4, GIF or WAV (and the GIF's width and frame rate)
 *   export_recording   download it, save it to Slop Drive, or both */
(function () {
  'use strict';
  const C = window.SlopCmd, R = window.SlopRec;
  if (!C || C.get('recorder.ai.new-recording')) return;
  const A = R.app, P = R.plan;
  const add = C.aiAdder('recorder');   // shared/commands/commands.js
  const SETTINGS = [
    { name: 'source', type: 'enum', options: P.SOURCES, description: 'what to record' },
    { name: 'systemAudio', type: 'boolean', description: 'the sound of the shared screen or tab, where the browser allows it' },
    { name: 'mic', type: 'boolean', description: 'the microphone too' },
    { name: 'countdown', type: 'enum', values: P.COUNTDOWNS.map(String), description: 'seconds to count down before recording' },
    { name: 'corner', type: 'enum', options: P.CORNERS, description: 'where the webcam sits (Screen + webcam)' },
    { name: 'pipSize', type: 'number', min: 10, max: 50, integer: true, description: 'the webcam picture, % of the width' },
    { name: 'format', type: 'enum', values: ['webm', 'mp4', 'gif', 'wav'], description: 'the file to save' },
  ];
  const summary = () => {
    const s = R.settings.get(), src = P.SOURCES.find(([v]) => v === s.source)[1];
    return `${src}${s.source !== 'mic' && s.mic ? ' with the microphone' : ''}, countdown ${s.countdown} s, saved as ${R.settings.format().toUpperCase()}.`;
  };
  const need = () => { if (!A.recording()) throw new Error('There is no recording: record one or add_recording first'); };
  const pick = (a) => { const o = {}; for (const k of Object.keys(a || {})) if (a[k] !== undefined && a[k] !== '') o[k] = a[k]; return o; };

  C.register([
    add('new_recording', 'Set up a new recording', SETTINGS.map((x) => Object.assign({}, x)), (a) => {
      if (['recording', 'paused', 'countdown'].includes(A.state())) throw new Error('A recording is going on; stop it first');
      if (A.recording()) A.discard();
      R.settings.set(pick(a));
      return 'Ready to record: ' + summary();
    }, { destructive: true, description: 'Choose what the next recording takes (screen, webcam, both, or the microphone) and how it is saved. A recording not saved is dropped.' }),
    add('start_recording', 'Start recording', [], async () => {
      try { await A.record(); } catch (e) { throw new Error(e.message + (R.settings.get().source === 'screen' || R.settings.get().source === 'pip' ? ' The browser lets only the person start a screen recording: ask them to press Record.' : '')); }
      return A.state() === 'countdown' ? `Counting down ${R.settings.get().countdown} seconds, then recording.` : 'Recording.';
    }),
    add('pause_recording', 'Pause the recording', [], () => { A.pause(); return 'Paused.'; }),
    add('resume_recording', 'Resume the recording', [], () => { A.resume(); return 'Recording again.'; }),
    add('stop_recording', 'Stop the recording', [], async () => { const r = await A.stop(); return `Stopped: ${P.seconds(r.ms / 1000)} recorded.`; }),
    add('add_recording', 'Open a recording from Slop Drive', [{ name: 'file', type: 'string', required: true, maxLength: 300, description: 'Slop Drive name or id' }], async (a) => {
      const r = await window.SlopCmdSources.driveFile(a.file);
      await A.openFile(new File([r.blob], r.name, { type: r.type || r.blob.type || '' }));
      return `Opened ${r.name} (${P.seconds(A.recording().ms / 1000)}).`;
    }),
    add('trim_recording', 'Trim the recording', [{ name: 'start', type: 'number', min: 0, max: 36000, step: 0.1, description: 'seconds from the start' },
      { name: 'end', type: 'number', min: 0, max: 36000, step: 0.1, description: 'seconds from the start (empty: to the end)' }], (a) => {
      need();
      const t = R.view.setTrim(a.start == null ? 0 : a.start, a.end == null ? R.view.duration() : a.end);
      return `Keeping ${P.seconds(t.start)} to ${P.seconds(t.end)}.`;
    }),
    add('set_format', 'Choose the file format', [{ name: 'format', type: 'enum', values: ['webm', 'mp4', 'gif', 'wav'], required: true },
      { name: 'gifWidth', type: 'number', min: 160, max: 1920, integer: true }, { name: 'gifFps', type: 'number', min: 2, max: 30, integer: true }], (a) => {
      const rec = A.recording(), ok = P.formatsFor(rec && rec.audioOnly ? 'mic' : R.settings.get().source);
      if (!ok.includes(a.format)) throw new Error(`This recording saves as ${ok.join(' or ')}`);
      R.settings.set(pick(a));
      if (rec) R.settings.formatsFor(rec.audioOnly);
      document.getElementById('rc-format').value = a.format;
      R.save.stale(); A.refresh();
      return `Saved as ${a.format.toUpperCase()}.`;
    }),
    add('export_recording', 'Save the recording', [{ name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }], async (a) => {
      need();
      const out = [];
      if (a.to !== 'download') { const r = await R.save.toDrive(); out.push(`Saved ${r.name} to Slop Drive (id ${r.id})`); }
      if (a.to !== 'drive') { const f = await R.save.download(); out.push(`downloaded ${f.name}`); }
      return out.join(' and ') + '.';
    }, { description: 'The recording, trimmed and in the chosen format, to Slop Drive and/or a download. MP4 and GIF use the video engine (a one-time download).' }),
  ]);
  C.provide({ state: () => {
    const rec = A.recording(), s = A.session();
    return { app: 'Slop Recorder', state: A.state(), settings: R.settings.get(), format: R.settings.format(), elapsedMs: s ? Math.round(s.elapsed()) : 0,
      recording: rec ? { seconds: Math.round(rec.ms) / 1000, soundOnly: !!rec.audioOnly, trim: R.view.trim() } : null };
  }, checkpoint: () => () => true });
})();
