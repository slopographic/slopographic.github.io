// Slop Effects files: a new project, Slop Drive (save and open a project file, kind 'effects', and add media from Drive),
// media from this computer (and relinking a missing one), and the 'effects-project' config kind through shared/config.
// A project references media by name, size and Drive id; the files stay in the media bin. Opening a project reports the
// media it lists that is not in this session, so the person can relink it. Classic script: window.SlopEffects.io.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const P = () => ns.project;
  const M = () => ns.media, T = (k, v) => ns.defs.t(k, v);
  const DEFAULT_COMP = { width: 1920, height: 1080, fps: 30, duration: 5, background: '#000000' };
  const MEDIA_ACCEPT = 'image/*,video/*';
  const fileName = (doc) => `${String(doc.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled'}.effects.json`;

  /** Builds the io actions. S, act, ka, ui: the state, the actions, the key actions, and { toast, dialog }. */
  function create(S, act, ui) {
    const toast = (m) => { if (g.SlopUI) g.SlopUI.toast(m); else ui.toast && ui.toast(m); };
    const UI = () => g.SlopUI;

    /** Kind for a picked file or Drive record, or null with a message. */
    function kindFor(type, name) {
      const k = M().kindOf(type);
      if (!k) toast(T('effects.io.not_media', { name: name || T('effects.io.that_file') }));
      return k;
    }

    /* The one way in (shared/intake, spec 'effects'): Add media (this computer or Slop Drive), Relink media, Open project
       from Slop Drive, a drop on the view, a paste, ?drive=<id> and a PWA launch. A project file opens; mode 'relink'
       (data.mediaId) points a missing media id at the file; any other picture or video is added as a layer. */
    async function read(f, ctx) {
      if (/json/.test(f.type || '') || /\.json$/i.test(f.name || '')) return openProjectFile(f, ctx.drive ? ctx.drive.id : '');
      const kind = kindFor(f.type, f.name);
      if (!kind) throw new Error('is not an image or video');
      if (ctx.mode === 'relink') {
        const entry = await M().add({ id: ctx.data.mediaId, name: f.name, size: f.size, kind }, f);
        S.edit(T('effects.undo.relink'), (d) => ns.layers.addMedia(d, M().info(entry)));
        toast(T('effects.io.relinked', { name: f.name }));
        return f.name;
      }
      const entry = await M().add({ id: act.nextMediaId(), name: f.name, size: f.size, kind, driveId: ctx.drive ? ctx.drive.id : undefined }, f);
      act.addMediaLayer(entry);
      return f.name;
    }
    g.SlopIntake.register({ id: 'effects', accept: { types: ['image/*', 'video/*', 'application/json'], exts: ['.json'], get noun() { return T('effects.io.noun'); } }, process: read });
    const importFromComputer = () => g.SlopIntake.pick({ to: 'effects', accept: MEDIA_ACCEPT });
    const importFromDrive = () => g.SlopIntake.fromDrive({ to: 'effects', accept: ['image/*', 'video/*'], title: T('effects.io.from_drive') });
    /** Relinks a missing media id to a file from this computer (the layers keep their id). */
    const relink = (mediaId) => g.SlopIntake.pick({ to: 'effects', mode: 'relink', data: { mediaId }, multiple: false, accept: MEDIA_ACCEPT });
    const launch = () => g.SlopIntake.launch({ to: 'effects' });

    function newProject() {
      S.replace(ns.core.newDoc({ name: 'Untitled', comp: DEFAULT_COMP }), T('effects.menu.new')); // i18n-ignore: the project's own name
      S.setFile({ name: '', driveId: '' });
    }

    /**
     * Builds a document from project rows, pairing its media with the bin. A matched item takes the bin's id and record;
     * a missing one gets a fresh id (so it cannot point at another file) and is returned in missing.
     */
    function build(data) {
      const doc = P().fromData(data);
      const { map, missing } = M().match(data.media);
      let next = Math.max(0, ...M().list().map((e) => parseInt(String(e.id).replace(/\D/g, ''), 10) || 0), ...data.media.map((m) => parseInt(String(m.id).replace(/\D/g, ''), 10) || 0)) + 1;
      for (const rec of missing) map.set(rec.id, 'm' + next++);
      const fresh = new Map(missing.map((rec) => [rec.id, map.get(rec.id)]));
      doc.media = data.media.map((rec) => {
        const binId = map.get(rec.id);
        if (binId && !fresh.has(rec.id)) return M().info(M().get(binId));
        return { ...rec, id: binId };
      });
      doc.layers.forEach((l) => { if (l.source.mediaId && map.has(l.source.mediaId)) l.source.mediaId = map.get(l.source.mediaId); });
      return { doc, missing: missing.map((rec) => ({ ...rec, id: fresh.get(rec.id) })) };
    }

    /** Lists the media a project needs that is not in this session (its layers keep the slot; relink from the layer panel). */
    function reportMissing(missing) {
      if (!missing.length) return;
      const items = missing.map((m) => { const li = document.createElement('li'); li.textContent = `${m.name} (${m.kind})`; return li; });
      const list = document.createElement('ul');
      list.append(...items);
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = T('effects.io.missing_body');
      body.append(p, list);
      UI().dialog({ title: T('effects.io.missing_title'), body, buttons: [{ label: T('menu.ok'), primary: true }] });
    }

    /** Opens rows from a file or a config. Replaces the document (one undo step). */
    function openRows(data, label, file) {
      const problems = P().problems(data);
      if (problems.length) { toast(T('effects.io.cannot_open', { why: problems[0] })); return false; }
      const { doc, missing } = build(data);
      S.replace(doc, label);
      S.setFile(file || { name: '', driveId: '' });
      toast(T('effects.io.opened', { name: doc.name }));
      reportMissing(missing);
      return true;
    }

    async function saveDrive() {
      const doc = S.doc;
      const blob = new Blob([P().toFile(doc)], { type: 'application/json' });
      const name = fileName(doc);
      const meta = { kind: 'effects' };
      if (S.file.driveId && (await g.SlopHub.get(S.file.driveId))) {
        await g.SlopHub.put(blob, { id: S.file.driveId, name, from: 'effects', app: 'effects', meta });
        S.setFile({ name: doc.name });
        toast(T('effects.io.saved'));
        return;
      }
      const start = await g.SlopHub.appFolderId('effects');
      const folderId = await g.SlopHub.pickFolder({ title: T('effects.io.save_to', { name }), start });
      if (folderId === undefined) return;
      const id = await g.SlopHub.put(blob, { name, from: 'effects', app: 'effects', meta, folderId });
      S.setFile({ name: doc.name, driveId: id });
      toast(T('effects.io.saved'));
    }

    /** A project file (from Slop Drive: driveId, so Save writes back to it). Throws the reason when it cannot be opened. */
    async function openProjectFile(f, driveId) {
      const parsed = P().fromFile(await f.text());
      const check = g.SlopConfig ? P().checkConfig(g.SlopConfig, parsed.data) : { ok: true, errors: [] };
      if (!check.ok) throw new Error(`cannot be opened: ${check.errors[0] ? check.errors[0].path + ' ' + check.errors[0].message : 'the file is not valid'}`);
      if (!openRows(parsed.data, T('effects.undo.open', { name: parsed.name }), { name: parsed.name, driveId })) throw new Error('cannot be opened');
      return f.name;
    }
    const openDrive = () => g.SlopIntake.fromDrive({ to: 'effects', accept: ['application/json'], title: T('effects.io.open_title') });

    /** Registers the effects-project config kind (import and export through shared/config). */
    function registerConfig() {
      const C = g.SlopConfig;
      if (!C || !C.registerKind || C.getKind(P().KIND, P().APP)) return;
      C.registerKind(P().KIND, P().APP, P().kindSchema(C.F), async (data) => {
        const problems = P().problems(data);
        if (problems.length) return { ok: false, message: problems[0] };
        const { doc, missing } = build(data);
        S.replace(doc, T('effects.undo.import'));
        reportMissing(missing);
        return { ok: true };
      }, {
        label: 'Slop Effects project', // i18n-ignore: the config kind (shared/config, API)
        description: 'Layers, keyframes, effects and composition. Media is listed by name, not included.', // i18n-ignore
        read: async () => P().toData(S.doc),
      });
    }

    return { importFromComputer, importFromDrive, relink, launch, newProject, saveDrive, openDrive, openRows, registerConfig, build, toast };
  }

  ns.io = { create, DEFAULT_COMP, fileName };
})(typeof window !== 'undefined' ? window : globalThis);
