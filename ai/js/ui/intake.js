/* Slop AI — ui/intake: the one way files come in (shared/intake). Spec 'ai': text files attached to a chat (the attach
 * menu: this computer or Slop Drive; a drop on the messages; a paste; "Send to Slop AI" from another app, ?drive=<id>, and
 * a PWA launch), each to the chat panel it was given for (data.panel) or the Chat tab's. Parts of their own:
 * 'ai.conv' (Import a conversation, Open a chat from Slop Drive: linked to that file), 'ai.model' (a model folder from
 * disk, where the browser has no directory picker) and 'ai.launch' (the Apps list: a file from this computer or Slop
 * Drive opened in another app, through SlopOuttake). Classic script, after ui/chat.js. */
'use strict';
(function (AI) {
  const SI = window.SlopIntake;
  const TEXT = {
    types: ['text/*', 'application/json', 'application/xml', 'application/javascript', 'application/x-sh', 'application/x-yaml', 'application/toml', 'application/sql', 'image/svg+xml'],
    exts: ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.cs', '.php', '.html', '.htm', '.css', '.scss', '.xml', '.svg', '.yml', '.yaml', '.toml', '.ini', '.sql', '.sh', '.log', '.srt', '.vtt'],
    get noun() { return AI.t('ai.intake.noun_text'); },   // read when a file is refused, in the language of that moment
  };
  SI.register({
    id: 'ai', accept: TEXT,
    processAll: async (files, ctx) => {
      const panel = (ctx.data && ctx.data.panel) || AI.chat;
      if (!ctx.data || !ctx.data.panel) { if (AI.tab !== 'chat') AI.setTab('chat'); }
      await panel.addFiles(files);
      return files.map((f) => f.name);
    },
  });
  SI.register({
    id: 'ai.conv', main: false, paste: false, toast: false, limit: 1, accept: { types: ['application/json'], exts: ['.json'], get noun() { return AI.t('ai.intake.noun_conv'); } },
    process: async (f, ctx) => {
      let c;
      try { c = AI.fromJSON(await f.text()); } catch (e) { window.SlopUI.alert(AI.t(ctx.drive ? 'ai.intake.open_failed' : 'ai.intake.import_failed'), e.message || String(e)); throw e; }
      if (ctx.drive) c.driveId = ctx.drive.id; // Save writes back to that Drive file
      await AI.db.put(c, { touch: false });
      AI.setTab(c.kind === 'build' ? 'build' : 'chat');
      if (c.kind === 'build') AI.openBuild(c.id); else AI.openConv(c.id);
      if (!ctx.drive) AI.toast(AI.t('ai.intake.imported', { title: c.title }));
      return c.id;
    },
  });
  SI.register({ id: 'ai.model', main: false, paste: false, toast: false, accept: { any: true, allowEmpty: true, get noun() { return AI.t('ai.intake.noun_file'); } }, processAll: (files) => files.map((f) => f.name) });
  SI.register({
    id: 'ai.launch', main: false, paste: false, toast: false, limit: 1, accept: { any: true, get noun() { return AI.t('ai.intake.noun_file'); } },
    process: async (f, ctx) => {
      const app = ctx.data.app;
      try {
        if (ctx.drive) await window.SlopOuttake.send(app.id, { id: ctx.drive.id, name: f.name, type: f.type, from: 'ai' });
        else await window.SlopOuttake.send(app.id, { get: () => f, name: f.name, type: f.type, from: 'ai' });
      } catch (e) { window.SlopUI.alert(AI.t('ai.intake.open_in_failed', { name: app.name }), e.message || String(e)); throw e; }
      return f.name;
    },
  });

  AI.intake = {
    /** The attach menu of a chat panel. */
    attachFromComputer: (panel) => SI.pick({ to: 'ai', data: { panel }, accept: 'text/*,.md,.json,.csv,.js,.ts,.py,.html,.css,.xml,.svg,.yml,.yaml,.log' }),
    attachFromDrive: (panel) => SI.fromDrive({ to: 'ai', data: { panel }, title: AI.t('ai.intake.attach_drive') }),
    dropOn: (el, panel) => SI.dropTarget(el, { to: 'ai', data: () => ({ panel }) }),
    importConv: () => SI.pick({ to: 'ai.conv', multiple: false, accept: '.json,application/json' }),
    openConvFromDrive: () => SI.fromDrive({ to: 'ai.conv', accept: ['application/json'], title: AI.t('ai.intake.open_drive') }),
    /** A model folder: resolves its files (with their paths in webkitRelativePath), or [] when none was chosen. */
    pickModelFolder: async () => { const r = await SI.pick({ to: 'ai.model', folder: true }); return r.added.map((a) => a.file); },
    openInApp: (app) => SI.pick({ to: 'ai.launch', multiple: false, data: { app }, accept: app.accepts.filter((p) => p !== '*').join(',') }),
    openDriveFileInApp: (app) => SI.fromDrive({ to: 'ai.launch', data: { app }, accept: app.accepts, title: AI.t('ai.intake.open_in', { name: app.name }) }),
    launch: () => SI.launch({ to: 'ai' }),
  };
})(window.AI);
