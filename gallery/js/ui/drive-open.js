/* Slop Gallery — ui/drive-open: what opening a Drive file does here.
 *  image, video     → the Gallery viewer for Drive files (ui/drive-viewer.js)
 *  audio            → the audio strip under the grid, which plays the file in place
 *  model3d          → Slop 3D (SlopHub.sendTo, the file's Drive id)
 *  document, code   → the app that takes the file, by the Drive's rule: the registry's accepts (SlopHub.appsAccepting), a
 *                     specific MIME pattern before a wildcard, tools never (so a .js file goes to the app that takes text/*).
 *  archive, other   → the same app rule; if no app takes the file, a note says so.
 * Apps open the file from Slop Drive by id (SlopHub.sendTo), so nothing is copied. sendTo runs before any await, so the
 * new tab opens inside the click. Exposes window.SlopGallery.driveOpen. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const H = () => window.SlopHub;
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  let audio = null, audioUrl = null;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  /** The app for a MIME type, by the registry rule. Returns null when no app takes it. */
  function appFor(type) {
    const h = H();
    if (!h || !type) return null;
    const score = (a) => Math.max(0, ...(a.accepts || []).filter((p) => h.matches(type, p)).map((p) => (p.includes('*') ? 1 : 2)));
    const best = h.appsAccepting(type).filter((a) => !a.tool).map((a) => [a, score(a)]).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1])[0];
    return best ? best[0] : null;
  }
  function sendToApp(appId, item, note) {
    H().sendTo(appId, null, item.name, { id: item.id }); // synchronous until its first await: the tab opens inside the click
    H().touch(item.id);
    if (note) toast(note);
  }
  /** Opens a file in the app that takes it. */
  function inApp(item) {
    if (!item || !H()) return;
    const app = appFor(item.type);
    if (!app) {
      const ext = window.SlopKinds.extOf(item.name);
      toast(ext ? t('gallery.drive.no_app', { ext }) : t('gallery.drive.no_app_kind'));
      return;
    }
    sendToApp(app.id, item, t('gallery.drive.opened_in', { app: app.name }));
  }
  function inThreeD(item) { if (H()) sendToApp('3d', item, t('gallery.drive.opened_3d')); }

  function strip() {
    if (!audio) {
      audio = { root: document.getElementById('astrip'), name: document.getElementById('astripName'), el: document.getElementById('astripAudio') };
      document.getElementById('astripClose').addEventListener('click', stop);
    }
    return audio;
  }
  /** Stops the audio strip and frees its blob URL. */
  function stop() {
    const s = strip();
    s.el.pause();
    s.el.removeAttribute('src');
    s.el.load();
    s.root.hidden = true;
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  }
  async function playAudio(item) {
    const rec = await H().get(item.id);
    if (!rec || !rec.blob) { toast(t('gallery.drive.gone')); return; }
    stop();
    const s = strip();
    audioUrl = URL.createObjectURL(rec.blob);
    s.name.textContent = item.name;
    s.el.src = audioUrl;
    s.root.hidden = false;
    H().touch(item.id);
    s.el.play().catch(() => { /* the browser wants a press on play; the controls are there */ });
  }

  /** Opens one Drive item. list and index: the files on screen, so the viewer can step through them. */
  function open(item, list, index) {
    if (!item) return;
    if (item.kind === 'image' || item.kind === 'video') return G.driveViewer.open(list || [item], Math.max(0, (list || []).indexOf(item)));
    if (item.kind === 'audio') return playAudio(item);
    if (item.kind === 'model3d') return inThreeD(item);
    return inApp(item);
  }

  G.driveOpen = { open, inApp, playAudio, stop };
})();
