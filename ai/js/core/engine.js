/* Slop AI — core/engine: which engine is live, loading models (consent, progress, pause, cancel), cache status.
 * One model at a time (it lives in GPU memory). A model loaded here is shared with other tabs through
 * SlopAI.use() → SlopAIKit.bridge, and if another tab already has one, this tab can borrow it. */
'use strict';
(function (AI) {
  const K = AI.K;
  const FAKE_CACHE = 'slop-ai.fake-cache';
  const fakeCache = { get: () => { try { return JSON.parse(localStorage.getItem(FAKE_CACHE)) || {}; } catch (e) { return {}; } }, set: (o) => { try { localStorage.setItem(FAKE_CACHE, JSON.stringify(o)); } catch (e) { /* blocked */ } } };
  const E = (AI.E = { engine: null, model: null, state: 'idle', progress: 0, text: '', loadingId: null, ctl: null, error: null, remote: null, consented: new Set() });

  E.modelFor = (id) => K.catalog.byId(id) || (id && id.startsWith('local:') ? K.catalog.custom(id, { name: id.slice(6) }) : null);
  E.make = () => (AI.engineKind() === 'fake' ? new K.FakeEngine({ delay: AI.fakeDelay != null ? AI.fakeDelay : 14, loadMs: AI.fakeLoadMs != null ? AI.fakeLoadMs : 900 }) : new K.WebLLMEngine());
  E.isFake = () => AI.engineKind() === 'fake';
  const changed = () => AI.emit('engine', E);
  const friendly = (e) => {
    const m = String((e && e.message) || e);
    if (/failed to fetch|networkerror|load failed|err_/i.test(m)) return AI.t('ai.engine.err_network');
    if (/quota|storage|no space/i.test(m)) return AI.t('ai.engine.err_full');
    if (/device|adapter|webgpu|gpu/i.test(m)) return AI.t('ai.engine.err_gpu', { msg: m });
    return m;
  };

  /** The engine chats go to: the local one, else one borrowed from another tab. */
  E.active = () => (E.engine && E.engine.loaded ? E.engine : E.remote);
  E.ready = () => !!E.active();
  E.label = () => {
    const a = E.active(); if (!a) return null;
    const i = a.info(), m = E.modelFor(i.id);
    let s = m ? m.name : i.name || i.id;
    if (a === E.remote) s = AI.t('ai.engine.other_tab', { name: s });
    return i.kind === 'fake' ? AI.t('ai.engine.demo', { name: s }) : s;
  };

  async function consent(m) {
    if (E.isFake() || m.custom || E.consented.has(m.id)) return true;
    const st = await E.status(m.id);
    if (st.state === 'ready') return true;
    // the shared download notice (shared/ai/picker.js): the same one the side panel shows on every app
    const ok = await K.picker.consent(m, { partial: st.state === 'partial', sizeMB: m.sizeMB * (AI.sys && K.catalog.idFor(m, AI.sys) !== m.id ? 1.35 : 1) });
    if (ok) E.consented.add(m.id);
    return ok;
  }

  /** Load (downloading first if needed). Resolves true when ready, false when cancelled/paused/declined. */
  E.load = async function (id, { skipConsent = false } = {}) {
    const m = E.modelFor(id);
    if (!m) throw new Error('Unknown model ' + id);
    if (E.state === 'loading') { if (E.loadingId === id) return false; E.ctl.abort('switch'); }
    if (!skipConsent && !(await consent(m))) return false;
    const loadId = AI.sys ? K.catalog.idFor(m, AI.sys) : m.id;
    if (E.engine) { await E.engine.unload().catch(() => {}); E.engine = null; window.SlopAI && SlopAI.use(null); }
    const eng = E.make(), ctl = new AbortController();
    Object.assign(E, { state: 'loading', loadingId: id, progress: 0, text: AI.t('ai.engine.starting'), ctl, error: null });
    changed();
    try {
      await eng.load(Object.assign({}, m, { loadId }), (p) => { if (E.ctl !== ctl) return; E.progress = p.progress || 0; E.text = p.text || ''; changed(); }, { signal: ctl.signal });
      if (E.ctl !== ctl) { eng.unload(); return false; }
      if (E.isFake()) { const c = fakeCache.get(); c[id] = Date.now(); fakeCache.set(c); }
      Object.assign(E, { engine: eng, model: m, state: 'ready', loadingId: null, ctl: null, progress: 1, text: '' });
      AI.prefs.lastModel = id; AI.savePrefs();
      if (window.SlopAI) SlopAI.use(eng);
      changed();
      return true;
    } catch (e) {
      if (E.ctl !== ctl) return false;
      const why = ctl.signal.aborted ? ctl.signal.reason : null;
      Object.assign(E, { state: why === 'pause' ? 'paused' : why ? 'idle' : 'error', ctl: null, error: why ? null : friendly(e) });
      if (why !== 'pause') E.loadingId = why === 'cancel' ? null : E.loadingId;
      if (why === 'cancel') await E.remove(id, { quiet: true });
      changed();
      if (!why) AI.toast(AI.t('ai.engine.load_failed', { why: E.error }), 5000);
      return false;
    }
  };
  E.pause = () => { if (E.ctl) E.ctl.abort('pause'); };
  E.cancel = () => { if (E.ctl) E.ctl.abort('cancel'); else if (E.state === 'paused') { const id = E.loadingId; Object.assign(E, { state: 'idle', loadingId: null }); E.remove(id, { quiet: true }).then(changed); } };
  E.unload = async () => { if (E.engine) await E.engine.unload().catch(() => {}); Object.assign(E, { engine: null, model: null, state: 'idle' }); if (window.SlopAI) SlopAI.use(null); changed(); };

  /** { state: 'none' | 'partial' | 'ready', bytes } */
  E.status = async (id) => {
    if (E.isFake()) { const m = E.modelFor(id); return fakeCache.get()[id] ? { state: 'ready', bytes: (m && m.sizeMB || 0) * 1048576 } : { state: 'none', bytes: 0 }; }
    return K.models.status(id);
  };
  E.remove = async (id, { quiet } = {}) => {
    if (E.model && E.model.id === id) await E.unload();
    if (E.isFake()) { const c = fakeCache.get(); delete c[id]; fakeCache.set(c); } else await K.models.remove(id);
    if (!quiet) AI.toast(AI.t('ai.engine.deleted'));
    changed();
  };

  /** Borrow a model from another tab when this one has none. */
  E.watchHosts = function () {
    const pick = () => {
      const h = K.bridge.hosts()[0];
      const had = !!E.remote;
      E.remote = h && !(E.engine && E.engine.loaded) ? new K.RemoteEngine(h.id) : null;
      if (had !== !!E.remote || E.remote) changed();
    };
    K.bridge.onHosts(pick);
    K.bridge.discover(300).then(pick);
  };
})(window.AI);
