/* Slop AI workspace: registry apps open in frames, websites open in a new tab only, and the assistant's tools reach a
 * framed app only through its SlopCmd registry (ids, guarded by permission and destructive confirmations). */
(function () {
  'use strict';
  const { describe, it, expect, afterEach } = SlopTest;
  const K = SlopAIKit, T = K.tools, W = SlopWorkspace;
  const tools = () => K.appTools.build({ workspace: W, hub: null, open: () => {} });
  const call = (name, args, env) => T.dispatch({ name, arguments: args }, tools(), env);
  /** An environment that records every question asked; answer(title) decides. */
  const env = (answer = () => true) => { const asked = []; return { asked, confirm: async (title) => { asked.push(title); return answer(title); } }; };
  const frameOf = (id) => document.querySelector(`iframe.ws-frame[title="${W.findApp(id).name}"]`);
  const LONG = { timeout: 20000 };

  describe('workspace: frames and websites', () => {
    afterEach(() => { W.openIds().forEach((id) => W.close(id)); });

    it('opening an app frame loads the registry path', async () => {
      const r = await call('open_app', { id: 'drive' }, env());
      expect(r.ok).toBe(true);
      expect(r.result).toContain('Slop Drive is open beside the chat');
      const f = frameOf('drive');
      expect(f.getAttribute('src')).toBe(location.origin + '/drive/');
      expect(f.hidden).toBe(false);
      expect(W.isOpen('drive')).toBe(true);
      expect((await W.open('drive')).drivable).toBe(true); // a second open focuses the same frame
      expect(document.querySelectorAll('iframe.ws-frame').length).toBe(1);
    }, LONG);

    it('an external website opens in a new tab and is never framed', async () => {
      const calls = [];
      const real = window.open;
      window.open = (...a) => { calls.push(a); return null; };
      try {
        const r = await call('open_app', { id: 'https://example.com/page' }, env());
        expect(r.ok).toBe(true);
        expect(calls).toEqual([['https://example.com/page', '_blank', 'noopener,noreferrer']]);
        expect([...document.querySelectorAll('iframe')].some((f) => /example\.com/.test(f.src))).toBe(false);
        expect(W.openIds()).toEqual([]);
        expect(W.openUrl('https://example.org/')).toContain('example.org');
        expect(calls.length).toBe(2);
        expect(() => W.openUrl('javascript:alert(1)')).toThrow(/Only http/);
      } finally { window.open = real; }
    });

    it('unknown apps are rejected, and so are experiments that are not apps', async () => {
      const r = await call('open_app', { id: 'nope' }, env());
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/No app "nope"/);
      const c = await call('app_command', { appId: 'nope', commandId: 'x' }, env());
      expect(c.error).toMatch(/No app "nope"/);
      await expect(W.open('paint-classic')).rejects(/cannot be opened beside the chat/);
    });

    it('the open_app reply says whether the framed app can be driven (its SlopCmd registry)', async () => {
      const r = await call('open_app', { id: 'contacts' }, env());
      expect(r.ok).toBe(true);
      expect(r.result).toContain('Slop Contacts is open beside the chat');
      expect(r.result.includes('app_command')).toBe(!!frameOf('contacts').contentWindow.SlopCmd);
    }, LONG);

    it('a command on an app that is not open is refused, with the next step', async () => {
      const r = await call('app_command', { appId: 'pdf', commandId: 'pdf.x' }, env());
      expect(r.error).toMatch(/not open\. Call open_app/);
    });
  });

  describe('workspace: app_command, app_search and app_state', () => {
    afterEach(() => { W.forgetGrants(); W.openIds().forEach((id) => W.close(id)); });

    it('app_command runs a real command on a framed app and returns its result', async () => {
      await W.open('drive');
      const ran = [];
      const off = frameOf('drive').contentWindow.SlopCmd.on('run', (e) => ran.push(e));
      try {
        const e = env();
        const r = await call('app_command', { appId: 'drive', commandId: 'drive.selectAll' }, e);
        expect(r.ok).toBe(true);
        expect(r.result).toBe('Ran “Select all” in Slop Drive.');
        expect(ran.map((x) => x.id)).toEqual(['drive.selectAll']);
        expect(ran[0].source).toBe('ai');
        expect(e.asked).toEqual(['Let Slop AI run commands in Slop Drive?']);
      } finally { off(); }
    }, LONG);

    it('the first command asks once per app per session, and a no is not remembered as yes', async () => {
      await W.open('drive');
      const e = env();
      await call('app_command', { appId: 'drive', commandId: 'drive.selectAll' }, e);
      await call('app_command', { appId: 'drive', commandId: 'drive.selectAll' }, e);
      expect(e.asked.length).toBe(1);
      expect(W.granted('drive')).toBe(true);
      W.forgetGrants();
      const no = await call('app_command', { appId: 'drive', commandId: 'drive.selectAll' }, env(() => false));
      expect(no.ok).toBe(false);
      expect(no.error).toMatch(/did not allow/);
      expect(W.granted('drive')).toBe(false);
    }, LONG);

    it('an unknown command returns the error with the nearest ids', async () => {
      await W.open('drive');
      W.grant('drive');
      const r = await call('app_command', { appId: 'drive', commandId: 'drive.selectal' }, env());
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/No command "drive\.selectal"/);
      expect(r.error).toContain('drive.selectAll');
    }, LONG);

    it('a destructive command asks again every time, and a no means it does not run', async () => {
      await W.open('drive');
      W.grant('drive');
      const ran = [];
      const off = frameOf('drive').contentWindow.SlopCmd.on('run', (x) => ran.push(x.id));
      try {
        const e = env((title) => !/^Allow this action/.test(title));
        const a = await call('app_command', { appId: 'drive', commandId: 'drive.emptyTrash' }, e);
        const b = await call('app_command', { appId: 'drive', commandId: 'drive.emptyTrash' }, e);
        expect(a.ok).toBe(false);
        expect(b.ok).toBe(false);
        expect(e.asked.filter((t) => /^Allow this action/.test(t)).length).toBe(2);
        expect(ran).toEqual([]);
      } finally { off(); }
    }, LONG);

    it('app_search finds commands by words, and app_state says what it knows', async () => {
      await W.open('drive');
      const found = await call('app_search', { appId: 'drive', query: 'trash' }, env());
      const hits = JSON.parse(found.result);
      expect(hits.some((h) => h.id === 'drive.emptyTrash')).toBe(true);
      const st = JSON.parse((await call('app_state', { appId: 'drive' }, env())).result);
      expect(st.app).toBe('Slop Drive');
      expect(st.drivable).toBe(true);
      // Slop Drive shares its state now (drive/js/ui/ai-commands.js, SlopCmd.provide({ state }), wip/ai-create)
      expect(st.state.app).toBe('Slop Drive');
      expect(Array.isArray(st.state.newKinds)).toBe(true);
    }, LONG);

    it('a frame without a command registry errors after the wait, not forever', async () => {
      await W.open('drive');
      W.configure({ timeout: 300 });
      try {
        delete frameOf('drive').contentWindow.SlopCmd;
        await expect(W.commands('drive')).rejects(/has no command registry/);
        const r = await call('app_command', { appId: 'drive', commandId: 'drive.selectAll' }, env());
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/no command registry/);
      } finally { W.configure({ timeout: 5000 }); }
    }, LONG);
  });
})();
