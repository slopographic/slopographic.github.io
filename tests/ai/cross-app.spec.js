/* The owner's session: from another app, the assistant opened Slop Quotes and could only see "Quotes: new quote", read
 * "the Slop Quotes app shares no state" and could not look at the result. Both ways in are checked on the real app:
 * the Slop AI workspace (Quotes in a frame, app_search / app_command / app_state / app_snapshot) and the AI panel that
 * arrives in Quotes (open_in_app: the one tool list built on Quotes' own SlopCmd). The cause was SlopCmd.prepare()
 * remembering an early call made before the app provided its prepare (shared/commands/commands.js).
 * Covers: shared/commands/commands.js, shared/commands/view.js, shared/ai/apptools.js, shared/ai/cmdtools.js,
 *   shared/ai/filetools.js, shared/data/ai-records.js, ai/js/ui/workspace.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, afterEach } = SlopTest;
  const K = SlopAIKit, T = K.tools, W = SlopWorkspace;
  const yes = { confirm: async () => true, permit: async () => true };
  const call = (tools, name, args) => T.dispatch({ name, arguments: args }, tools, yes);
  const wsTools = () => K.appTools.build({ workspace: W, hub: null, open: () => {} });
  const LONG = { timeout: 40000 };
  const frameOf = (id) => document.querySelector(`iframe.ws-frame[title="${W.findApp(id).name}"]`);
  const LINES = [{ description: 'Widget', qty: 2, unit_price: '12.50' }, { description: 'Setup', qty: 1, unit_price: '99' }];
  async function booted() {
    await waitFor(() => { const w = frameOf('quotes').contentWindow; return w.SlopQuotes && w.SlopQuotes.app && w.SlopQuotes.app.booted; }, { timeout: 20000 });
    return frameOf('quotes').contentWindow;
  }

  describe('from the Slop AI workspace', () => {
    afterEach(() => { W.forgetGrants(); W.openIds().forEach((id) => W.close(id)); });

    it('lists the real commands with their arguments, makes a quote, reads it back and shows it', async () => {
      const tools = wsTools();
      expect((await call(tools, 'open_app', { id: 'quotes' })).ok).toBe(true);
      await booted();
      const listed = JSON.parse((await call(tools, 'app_search', { appId: 'quotes' })).result);
      const ids = listed.map((c) => c.id);
      for (const id of ['quotes.ai.create-quote', 'quotes.ai.update-record', 'quotes.ai.create-record', 'quotes.ai.export-quote-pdf']) expect(ids).toContain(id);
      const cq = listed.find((c) => c.id === 'quotes.ai.create-quote');
      expect(cq.args.some((a) => /^customer/.test(a))).toBe(true);
      expect(cq.args.some((a) => /^lines/.test(a))).toBe(true);
      expect(listed.find((c) => c.id === 'quotes.ai.update-record').args.some((a) => /^fields/.test(a))).toBe(true);
      const made = await call(tools, 'app_command', { appId: 'quotes', commandId: 'quotes.ai.create-quote', args: { customer: 'Owner Case AB', lines: LINES } });
      expect(made.ok).toBe(true);
      expect(made.result).toContain('Owner Case AB');
      const st = JSON.parse((await call(tools, 'app_state', { appId: 'quotes' })).result);
      const q = st.state.recent.quotes.find((x) => x.total === '$124.00');
      expect(!!q).toBe(true);
      expect(q.lines.map((l) => l.description)).toEqual(['Widget', 'Setup']);
      expect(st.state.recent.customers.some((c) => c.name === 'Owner Case AB')).toBe(true);
      const shot = await call(tools, 'app_snapshot', { appId: 'quotes' });
      expect(shot.ok).toBe(true);
      expect(shot.media[0].mime).toBe('image/jpeg');
      expect(shot.media[0].data.length).toBeGreaterThan(1000);
    }, LONG);
  });

  describe('the AI panel arriving in Slop Quotes (the one tool list on its own SlopCmd)', () => {
    afterEach(() => { W.openIds().forEach((id) => W.close(id)); });

    it('has create_quote and update_record with schemas, a real app_state and a picture of the result', async () => {
      await W.open('quotes');
      const fw = await booted();
      const env = { cmd: fw.SlopCmd, appId: 'quotes', appName: 'Slop Quotes', look: true, hub: null };
      await fw.SlopCmd.prepare();
      const tools = K.appTools.build(env);
      const names = tools.map((t) => t.name);
      for (const n of ['create_quote', 'update_record', 'create_record', 'export_quote_pdf', 'app_state', 'look_at_canvas']) expect(names).toContain(n);
      expect(Object.keys(tools.find((t) => t.name === 'create_quote').schema.properties)).toContain('lines');
      const listed = JSON.parse((await call(tools, 'list_commands', {})).result);
      expect(listed.find((c) => c.id === 'quotes.ai.update-record').args.length).toBeGreaterThan(1);
      const made = await call(tools, 'create_quote', { customer: 'Panel Case AB', lines: LINES });
      expect(made.ok).toBe(true);
      const id = JSON.parse(made.result.slice(made.result.indexOf('{'))).id;
      fw.location.hash = 'q/' + id;
      await waitFor(() => fw.document.querySelector('.paper') && /Panel Case AB/.test(fw.document.body.textContent), { timeout: 10000 });
      const st = JSON.parse((await call(tools, 'app_state', {})).result);
      expect(st.open.customer).toBe('Panel Case AB');
      expect(st.open.lines.length).toBe(2);
      const pic = await call(tools, 'look_at_canvas', {});
      expect(pic.ok).toBe(true);
      expect(pic.media.length).toBe(1);
    }, LONG);
  });

  describe('SlopCmd.prepare asked before the app provides its prepare', () => {
    it('an early prepare() does not stop the later one from running (the cause of "only new quote")', async () => {
      await W.open('quotes');
      const fw = frameOf('quotes').contentWindow, C = fw.SlopCmd;
      const early = await C.prepare();   // whatever the app has by now
      expect(early === null || early === undefined || typeof early === 'object').toBe(true);
      let ran = 0;
      C.provide({ prepare: () => { ran++; return 'late'; } });
      expect(await C.prepare()).toBe('late');
      await C.prepare();
      expect(ran).toBe(1);   // still remembered once it ran
      W.close('quotes');
    }, LONG);
  });
})();
