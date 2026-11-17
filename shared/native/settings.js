/* Settings › Files, in the iPhone/iPad app only (SlopNative.files(), shared/native-app.js): where the app's files are (the
 * Files app, device backups) and, in a build with an iCloud container, the switch Keep files in iCloud Drive (moves every
 * file there and back: SlopNativeSync.setICloud, shared/native/files-sync.js, loaded with Slop Drive's hub). On the website
 * the section stays hidden. Classic script after shared/native/words.js; fills <section id="native-files" hidden>.
 * Tests: tests/native/files.test.html. */
(function (g) {
  'use strict';
  const N = g.SlopNative, F = N && N.files ? N.files() : null, box = g.document.getElementById('native-files');
  if (!F || !box) return;
  const W = g.SlopNativeWords, t = (k, v) => W.t(k, v);
  const el = (tag, props, text) => { const n = g.document.createElement(tag); Object.assign(n, props || {}); if (text != null) n.textContent = text; return n; };

  /** Slop Drive's sync (it comes with the hub: shared/hub.js loads it in the app). */
  async function sync() {
    if (!g.SlopHub && g.SlopNativeGlue) await g.SlopNativeGlue.load('/shared/hub.js');
    const H = g.SlopHub;
    return (H && H.nativeSync ? await H.nativeSync : null) || g.SlopNativeSync || null;
  }

  async function draw() {
    await W.ready();
    const info = await F.info().catch(() => ({}));
    box.replaceChildren(el('h2', { id: 'native-files-title' }, t('native.title')), el('p', null, t('native.lede')));
    if (info.container) {
      const row = el('div', { className: 'set-row' }), id = 'native-icloud';
      const label = el('label', { htmlFor: id }, t('native.icloud'));
      const box2 = el('input', { type: 'checkbox', id, checked: !!info.icloudOn, disabled: !info.icloud });
      const note = el('p', { className: 'settings-note', id: 'native-icloud-note' }, info.icloud ? t('native.icloud_note') : t('native.icloud_off'));
      const say = el('p', { className: 'settings-note', role: 'status' });
      say.setAttribute('aria-live', 'polite');
      box2.setAttribute('aria-describedby', note.id);
      box2.addEventListener('change', async () => {
        const on = box2.checked;
        box2.disabled = true;
        say.textContent = t('native.moving');
        try {
          const S = await sync();
          const now = S ? await S.setICloud(on) : await F.setICloud(on);
          box2.checked = !!now.icloudOn;
          say.textContent = t(now.icloudOn ? 'native.moved_icloud' : 'native.moved_device');
        } catch (e) {
          box2.checked = !on;
          say.textContent = t('native.move_failed', { error: String((e && e.message) || e) });
        } finally { box2.disabled = false; }
      });
      const h3 = el('h3');
      h3.appendChild(label);
      const text = el('div');
      text.append(h3, note);
      row.append(text, box2);
      box.append(row, say);
    }
    box.hidden = false;
  }
  draw().catch((e) => console.warn('Settings › Files', e));
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { draw().catch(() => null); });
})(window);
