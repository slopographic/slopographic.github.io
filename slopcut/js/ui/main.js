/* SlopCut: boot. Feature detection, wiring of panels, restore and Slop Hub launch. */
(function () {
  'use strict';
  const SE = window.SE, A = SE.app;

  /** What this browser can do (WebCodecs, muxers, WebGL, MediaRecorder). */
  function detect() {
    const c = SE.caps = {
      webcodecs: typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function',
      audioEncoder: typeof window.AudioEncoder === 'function',
      decoder: typeof window.VideoDecoder === 'function',
      recorder: typeof window.MediaRecorder === 'function' && !!HTMLCanvasElement.prototype.captureStream,
      webgl: (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch (e) { return false; } })(),
      rvfc: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
      mp4mux: !!window.Mp4Muxer, webmmux: !!window.WebMMuxer
    };
    c.summary = c.webcodecs ? SE.util.t('slopedit.main.webcodecs_available_fast_frame_accurate') : c.recorder ? SE.util.t('slopedit.main.no_webcodecs_export_records_in') : SE.util.t('slopedit.main.this_browser_cannot_encode_video');
    return c;
  }
  async function boot() {
    detect();
    A.init();
    SE.bin.init(A.els.bin);
    if (SE.inspector) SE.inspector.init(A.els.insp);
    if (A.dockInspector) A.dockInspector();   // ui/layout.js: Export at the inspector's foot, the phone sheet
    if (SE.preview) SE.preview.init();
    if (SE.transport) SE.transport.init(A.els.transport);
    if (SE.timeline) SE.timeline.init();
    SE.menus.build();
    await SE.cmd.load();
    const caps = () => { detect(); A.els.statusCaps.textContent = SE.caps.webcodecs ? SE.util.t('slopedit.main.webcodecs') : SE.caps.recorder ? SE.util.t('slopedit.main.webm_recorder') : SE.util.t('slopedit.main.no_encoder'); A.els.statusCaps.title = SE.caps.summary; };
    caps();
    // a language change: the panels draw again (menus, tabs and marked words follow data-i18n; commands: ui/commands.js)
    SE.util.onLang(() => { caps(); SE.bin.render(); if (SE.inspector) SE.inspector.relabel(); if (SE.timeline && SE.timeline.renderHeads) SE.timeline.renderHeads(); SE.emit('change', { label: 'lang' }); });
    if (window.SlopHub && !SE.offline) try { SlopHub.register('slopedit'); } catch (e) { /* ignore */ }
    let restored = false;
    try { restored = await SE.session.restore(); } catch (e) { console.warn(e); }
    if (restored) A.status(SE.util.t('slopedit.main.restored_your_last_project'));
    await SE.viewState.restore(); // ui/view-state.js: the timeline zoom, scroll, tool and phone pane
    await SE.session.launch().catch((e) => console.warn(e));
    if (A.isPhone()) A.setPane(SE.doc.clips.length ? 'timeline' : 'media');
    SE.emit('change', { label: 'boot', history: true });
    SE.emit('layout', {});
    document.body.classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
