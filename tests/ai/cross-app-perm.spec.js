/* AI permissions when the assistant drives another app (the Slop AI workspace): "Allow everything" asks nothing at all,
 * not for running commands there (kind 'control'), changes, deleting, or sending a picture; "Ask each time" asks once
 * per app with kind 'control', and "Always allow" is remembered for that app.
 * Covers: shared/ai/permissions.js, shared/ai/apptools.js, shared/ai/tools.js, ai/js/ui/chat.js */
(function () {
  'use strict';
  const { describe, it, expect, afterEach, beforeEach } = SlopTest;
  const K = SlopAIKit, T = K.tools, W = SlopWorkspace, P = SlopAIPermissions;
  const LONG = { timeout: 40000 };
  /** The Slop AI chat's env (ai/js/ui/chat.js): permit through the one module; every question asked is recorded. */
  function env(asked) {
    return { confirm: async (t) => { asked.push('confirm: ' + t); return true; }, permit: (req) => P.ask(Object.assign({ app: 'ai', appName: 'Slop AI' }, req)) };
  }
  const tools = () => K.appTools.build({ workspace: W, hub: null, open: () => {} });
  const reset = () => { for (const r of P.rules()) P.removeRule(r.kind, r.app); for (const k of Object.keys(localStorage)) if (/^slop-ai\.permissions/.test(k)) localStorage.removeItem(k); for (const k of Object.keys(sessionStorage)) if (/^slop-ai\.permissions/.test(k)) sessionStorage.removeItem(k); };

  describe('permissions for driving another app', () => {
    let asked, prompt, wconfirm;
    beforeEach(() => {
      reset(); asked = []; prompt = P.prompt; wconfirm = window.confirm;
      P.prompt = async (req) => { asked.push(`${req.kind}: ${req.app}`); return 'once'; };
      window.confirm = (t) => { asked.push('window.confirm: ' + t); return true; };
    });
    afterEach(() => { P.prompt = prompt; window.confirm = wconfirm; reset(); W.forgetGrants(); W.openIds().forEach((id) => W.close(id)); });

    it('"Allow everything": commands, changes, deleting and a picture of another app ask nothing', async () => {
      P.setMode('all');
      const e = env(asked), ts = tools();
      await T.dispatch({ name: 'open_app', arguments: { id: 'drive' } }, ts, e);
      for (const id of ['drive.selectAll', 'drive.emptyTrash']) await T.dispatch({ name: 'app_command', arguments: { appId: 'drive', commandId: id } }, ts, e);
      const shot = await T.dispatch({ name: 'app_snapshot', arguments: { appId: 'drive' } }, ts, e);
      expect(shot.ok).toBe(true);
      expect(asked).toEqual([]);
      expect(document.querySelector('.sui-dlg, .sap-perm-dlg')).toBe(null);
    }, LONG);

    it('"Ask each time": the question is asked once for the app, as kind control; "always" is remembered for it', async () => {
      P.setMode('ask');
      const e = env(asked), ts = tools();
      await T.dispatch({ name: 'open_app', arguments: { id: 'drive' } }, ts, e);
      await T.dispatch({ name: 'app_command', arguments: { appId: 'drive', commandId: 'drive.selectAll' } }, ts, e);
      await T.dispatch({ name: 'app_command', arguments: { appId: 'drive', commandId: 'drive.selectAll' } }, ts, e);
      expect(asked).toEqual(['control: drive']);
      W.forgetGrants(); asked.length = 0;
      P.prompt = async (req) => { asked.push(`${req.kind}: ${req.app}`); return 'always'; };
      await T.dispatch({ name: 'app_command', arguments: { appId: 'drive', commandId: 'drive.selectAll' } }, ts, e);
      W.forgetGrants();
      await T.dispatch({ name: 'app_command', arguments: { appId: 'drive', commandId: 'drive.selectAll' } }, ts, e);
      expect(asked).toEqual(['control: drive']);
      expect(P.rules().some((r) => r.kind === 'control' && r.app === 'drive')).toBe(true);
    }, LONG);

    it('"Allow app changes" still asks before driving another app and before deleting there', async () => {
      P.setMode('changes');
      const e = env(asked), ts = tools();
      await T.dispatch({ name: 'open_app', arguments: { id: 'drive' } }, ts, e);
      await T.dispatch({ name: 'app_command', arguments: { appId: 'drive', commandId: 'drive.emptyTrash' } }, ts, e);
      expect(asked).toEqual(['delete: drive', 'control: drive']);
    }, LONG);
  });
})();
