/* Slop Image to 3D: the depth model, just in time. The first-use notice (main.js FIRST_USE) names the download and its
 * size; once the person has agreed to it, the first picture they open downloads the pack through the shared installer
 * (shared/library/install.js, SlopLibraryInstall.install: allowed hosts, byte length and SHA-256 checked, stored in
 * IndexedDB), so they are not sent to Get more first. Once the model has been in this browser (localStorage key HAD),
 * its absence means the person removed it in Get more: it is not downloaded again on its own, and the brightness
 * fallback stays until they add it there. One try per page visit: a
 * failed download (offline) falls back to brightness and says why. Classic script; sets window.SlopImg3D.jit:
 *   decide({ installed, consent, removed, tried }) -> 'have' | 'download' | 'skip'     pure
 *   ensure({ consent, onStatus }) -> Promise<{ ok, installed, reason? }>                 never rejects
 *   noteInstalled(on)                                                                    main.js: the model is (not) here */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const HAD = 'slop-img3d:depth-had';
  let tried = false, pending = null;

  const had = () => { try { return root.localStorage.getItem(HAD) === '1'; } catch (e) { return false; } };
  const setHad = () => { try { root.localStorage.setItem(HAD, '1'); } catch (e) { /* storage blocked */ } };

  /** What to do about the model when a picture is opened. */
  function decide({ installed, consent, removed, tried: t }) {
    if (installed) return 'have';
    if (!consent || removed || t) return 'skip';
    return 'download';
  }

  /** The model's pack from packs.json (through the installer, which validates it), or null. */
  async function packOf() {
    const L = root.SlopLibraryInstall;
    if (!L) return null;
    const m = await L.loadManifest();
    return (m.packs || []).find((p) => p.id === ns.depth.MODEL.id) || null;
  }

  async function run(consent, onStatus) {
    const tr = (k, v, en) => { const I = root.SlopI18n; return I && I.has(k) ? I.t(k, v) : en; };   // English when the tables are missing (tests load this alone)
    const say = (t) => { if (onStatus) onStatus(t); };
    const installed = await ns.depth.installed();
    const what = decide({ installed, consent, removed: had() && !installed, tried });
    if (what === 'have') { setHad(); return { ok: true, installed: true }; }
    if (what === 'skip') return { ok: false, installed: false };
    tried = true;
    try {
      const pack = await packOf();
      if (!pack) throw new Error('the pack list could not be read');
      const size = root.SlopFirstRun ? root.SlopFirstRun.size(pack.size) : '';
      say(size ? tr('img3d.jit.downloading_size', { size }, `Downloading the depth model, ${size}. This happens once; it stays in this browser.`)
        : tr('img3d.jit.downloading', null, 'Downloading the depth model. This happens once; it stays in this browser.'));
      await root.SlopLibraryInstall.install(pack, (t) => say(tr('img3d.jit.progress', { what: t }, 'Depth model: ' + t)));
      setHad();
      return { ok: true, installed: true };
    } catch (e) {
      const error = e && e.message ? e.message : String(e);
      return { ok: false, installed: false, reason: tr('img3d.jit.failed', { error }, 'The depth model could not be downloaded (' + error + '). Using brightness instead; Get more… can add it later.') };
    }
  }
  /** Makes sure the model is here before depth is estimated, downloading it when the person agreed. Calls made while a
   *  download runs share it. */
  function ensure({ consent = false, onStatus } = {}) {
    if (!pending) pending = run(consent, onStatus).finally(() => { pending = null; });
    return pending;
  }

  /** The model is in this browser (Get more added it): remembered, so a later removal is not undone on its own. */
  function noteInstalled(on) { if (on) setHad(); }

  ns.jit = { decide, ensure, noteInstalled, HAD, reset: () => { tried = false; } };
})(typeof window !== 'undefined' ? window : globalThis);
