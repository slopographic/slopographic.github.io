/* SlopCut macros (shared/macros) and the hidden copy that works for Slop Workflows and the AI's operations.
   Every SlopCut command with arguments (js/ai/cmd-*.js, build.js) is recorded by the shared recorder; Edit ▸ Macros…
   is in the palette (macro.panel). With ?macro-host=1 this page is the hidden copy (shared/macros/frame.js runInHost):
   it keeps nothing of its own (no autosave, no restore, no Drive launch, its media in memory only: the person's own
   project and stored media are never touched), and window.SlopMacroHost runs steps on files:
     open(file, { media: [File], place })   a new empty project with the file (and the extra media) in the bin; a video,
                                            sound or picture is put on the timeline unless place is false
     save({ format, width, height, aspect, fps, quality, range, audio }, { signal, progress }) → { blob, kind, info }
   Used by shared/ops/video.js (Edit list → video, Reframe, Add captions, Remix to reel). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const HOST = /[?&]macro-host=1(&|$)/.test(location.search);

  if (HOST) {
    // a copy that keeps nothing: memory instead of the app's IndexedDB, no restore, no launch, no hub registration
    const kv = new Map(), media = new Map();
    U.idb = {
      get: async (k) => kv.get(k), set: async (k, v) => { kv.set(k, v); }, del: async (k) => { kv.delete(k); },
      putMedia: async (r) => { media.set(r.id, r); }, getMedia: async (id) => media.get(id), delMedia: async (id) => { media.delete(id); },
      mediaKeys: async () => [...media.keys()], clearMedia: async () => { media.clear(); },
    };
    SE.session.restore = async () => false;
    SE.session.launch = async () => false;
    SE.session.save = async () => {};
    if (window.SlopHub) SlopHub.register = () => {};
    document.documentElement.dataset.macroHost = '1';
  }

  const host = {
    ready: () => new Promise((res) => { const ok = () => document.body.classList.contains('ready'); if (ok()) res(); else { const t = setInterval(() => { if (ok()) { clearInterval(t); res(); } }, 50); } }),
    async open(file, options = {}) {
      SE.media.clear();
      SE.setDoc(M.newProject());
      SE.app.select([]);
      const isData = (f) => /\.(json|slopflow|srt|vtt|txt)$/i.test(f.name || '') || /json|text/.test(f.type || '');
      const extra = [].concat(options.media || []).map((f) => new File([f], f.name || 'media', { type: f.type || '' }));
      const main = isData(file) ? [] : [file];
      const metas = await SE.media.importFiles(main.concat(extra), { from: 'workflow' });
      const first = metas[0];
      if (first && main.length && options.place !== false) {
        if (first.kind === 'video' && first.w && first.h) Object.assign(SE.doc, { w: first.w + (first.w % 2), h: first.h + (first.h % 2) });
        SE.app.appendToTimeline([first]);
      }
      host.data = isData(file) ? file : null;
      return metas.length;
    },
    async save(o = {}, { signal = null, progress = null } = {}) {
      const out = await SE.ai.render(o, { signal, progress });
      return { blob: out.blob, kind: out.blob.type.includes('mp4') ? 'mp4' : 'webm', info: Object.assign({ name: out.name }, out.info) };
    },
  };
  SE.ai.host = host;

  if (window.SlopMacros && window.SlopCmd) {
    const init = () => SlopMacros.init({ app: 'slopedit', label: 'SlopCut', host });
    // after boot registered the commands (SE.cmd.load), so the recorder wraps the real SlopCmd.exec
    if (document.body && document.body.classList.contains('ready')) init();
    else { const t = setInterval(() => { if (document.body && document.body.classList.contains('ready')) { clearInterval(t); init(); } }, 50); }
  }
})();
