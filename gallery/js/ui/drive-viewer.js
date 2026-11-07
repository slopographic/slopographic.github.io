/* Slop Gallery — ui/drive-viewer: the viewer for the Drive source's images and videos. An image is SlopPreview (the same
 * component as the library viewer and Slop Drive); a video plays in a native player. ← → step through the images and
 * videos on screen, Escape closes, and "Open in app" hands the file to its app. The blob URL is revoked when the viewer
 * moves on or closes. Exposes window.SlopGallery.driveViewer.open(list, index), .close(). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const H = () => window.SlopHub;
  let root = null, items = [], i = 0, url = null, pv = null, token = 0, opener = null;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const viewable = (it) => it.kind === 'image' || it.kind === 'video';

  function build() {
    root = document.createElement('div');
    root.className = 'viewer dviewer';
    root.hidden = true;
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('gallery.drive.viewer'));
    root.setAttribute('data-i18n-attr', 'aria-label:gallery.drive.viewer');
    root.innerHTML = `
      <div class="v-top">
        <button type="button" class="v-btn" data-act="close" aria-label="${t('gallery.viewer.close')}" title="${t('gallery.viewer.close_tip')}" data-i18n-attr="aria-label:gallery.viewer.close;title:gallery.viewer.close_tip">×</button>
        <span class="v-count" aria-live="polite"></span>
      </div>
      <div class="v-stage"><button type="button" class="v-nav prev" data-act="prev" aria-label="${t('gallery.drive.prev')}" data-i18n-attr="aria-label:gallery.drive.prev">‹</button>
        <div class="v-pic"></div>
        <button type="button" class="v-nav next" data-act="next" aria-label="${t('gallery.drive.next')}" data-i18n-attr="aria-label:gallery.drive.next">›</button></div>
      <div class="v-foot"><button type="button" class="v-btn" data-act="app" title="${t('gallery.drive.open_app_tip')}" data-i18n-attr="title:gallery.drive.open_app_tip" data-i18n="gallery.drive.open_app">${t('gallery.drive.open_app')}</button></div>`;
    document.body.append(root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
  }

  /** Takes the current picture off the page and frees its URL. */
  function release() {
    const old = pv;
    pv = null; // the preview's onClose sees this and does nothing
    if (old) old.close();
    if (url) URL.revokeObjectURL(url);
    url = null;
    root.querySelector('.v-pic').replaceChildren();
  }
  async function show(n) {
    if (!items.length) return;
    i = (n + items.length) % items.length;
    const item = items[i], my = ++token;
    release();
    root.querySelector('.v-count').textContent = `${i + 1} / ${items.length} · ${item.name}`;
    const rec = await H().get(item.id);
    if (my !== token) return;
    const pic = root.querySelector('.v-pic');
    if (!rec || !rec.blob) { pic.textContent = t('gallery.drive.gone_view'); return; }
    url = URL.createObjectURL(rec.blob);
    if (item.kind === 'video') {
      const v = document.createElement('video');
      v.className = 'dv-video';
      v.controls = true;
      v.playsInline = true;
      v.src = url;
      v.setAttribute('aria-label', item.name);
      pic.append(v);
    } else {
      pv = window.SlopPreview.create({
        kind: 'image', blobUrl: url, title: item.name, chrome: false,
        onPrev: () => show(i - 1), onNext: () => show(i + 1),
        onClose: () => { if (pv) close(); },
      });
      pic.append(pv.el);
    }
  }

  function open(list, index = 0) {
    if (!root) build();
    const shown = (list || []).filter(viewable);
    const at = shown.indexOf((list || [])[index]);
    if (!shown.length) return;
    items = shown;
    opener = document.activeElement;
    root.hidden = false;
    show(at < 0 ? 0 : at);
    root.focus({ preventScroll: true });
  }
  function close() {
    if (!root || root.hidden) return;
    token++;
    release();
    root.hidden = true;
    if (opener && opener.isConnected) try { opener.focus({ preventScroll: true }); } catch (e) { /* gone */ }
  }

  const ACT = {
    close: () => close(), prev: () => show(i - 1), next: () => show(i + 1),
    app: () => { if (items[i]) G.driveOpen.inApp(items[i]); },
  };
  function onClick(e) { const b = e.target.closest('[data-act]'); if (b && ACT[b.dataset.act]) { e.stopPropagation(); ACT[b.dataset.act](); } }
  function onKey(e) {
    if (e.target.closest && e.target.closest('input, select')) { if (e.key !== 'Escape') return; }
    const map = { Escape: close, ArrowLeft: () => show(i - 1), ArrowRight: () => show(i + 1) };
    if (!map[e.key]) return;
    e.preventDefault(); e.stopPropagation();
    map[e.key]();
  }

  G.driveViewer = { open, close };
})();
