/* SlopIsolate — Send to PhotoSlop. Two results. "Send back" returns the mask of an image PhotoSlop sent here
 * (Layer ▸ Isolate Subject): PhotoSlop makes it that layer's mask. "Send to PhotoSlop as a new layer" sends the
 * cut-out itself (PNG with alpha). Both go over the Slop Hub bus to the PhotoSlop tab that is waiting for them.
 * If no tab answers, the mask is saved to Slop Drive as a grey PNG and the cut-out opens in a new PhotoSlop tab. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, P = CO.process, C = CO.compose, t = U.t;
  const SEND = CO.send = {};
  const ACK_MS = 3000;
  const hub = () => (document.documentElement.dataset.offline ? null : window.SlopHub || null);
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  const ready = (it) => !!it && it.status === 'done';

  /** The finished record of an item: the active one, or a fresh job released after fn. */
  async function withRecord(it, fn) {
    const mine = !!P.active && P.active.item === it;
    const rec = mine ? P.active : await P.build(it);
    try { return await fn(rec); }
    finally { if (!mine) Promise.resolve(SlopCutout.release(rec.jobId)).catch(() => {}); }
  }
  /** Post a message on the bus and wait for the matching reply (null after ACK_MS: nobody answered). */
  function ask(type, ackType, data) {
    return new Promise((res) => {
      let timer = 0;
      const off = hub().on(ackType, (d) => { if (d && d.requestId === data.requestId) { clearTimeout(timer); off(); res(d); } });
      timer = setTimeout(() => { off(); res(null); }, ACK_MS);
      hub().emit(type, data);
    });
  }

  /** Send back the mask of a PhotoSlop-launched image (it becomes that layer's mask in PhotoSlop). */
  SEND.mask = async function (it = S.current()) {
    if (!hub()) return toast(t('cutout.act.no_drive'));
    if (!ready(it)) return toast(t('cutout.send.wait'));
    if (!it.request) return toast(t('cutout.send.not_photoslop'));
    await withRecord(it, async (rec) => {
      const { requestId } = it.request;
      const ack = await ask('slopisolate:mask', 'photoslop:mask-ack', { requestId, w: rec.w, h: rec.h, mask: rec.mask.slice() });
      if (ack && ack.ok) return toast(t('cutout.send.mask_sent'));
      if (ack) return toast(ack.error || t('cutout.send.mask_refused'));
      // Nobody is waiting for it (PhotoSlop was closed): keep the mask as a grey PNG in Slop Drive.
      const px = new ImageData(window.SlopMaskTransfer.toGrey(rec.mask), rec.w, rec.h);
      const blob = await SlopCutout.toBlob(px, 'image/png');
      await hub().put(blob, { name: U.baseName(it.name) + '-mask.png', from: 'cutout' });
      toast(t('cutout.send.mask_drive'));
    });
  };

  /** Send the cut-out (PNG with alpha) to PhotoSlop as a new layer, or open it in a new PhotoSlop tab. */
  SEND.layer = async function (it = S.current()) {
    if (!hub()) return toast(t('cutout.act.no_drive'));
    if (!ready(it)) return toast(t('cutout.send.wait'));
    await withRecord(it, async (rec) => {
      const blob = await U.blobOf(C.cutCanvas(rec), 'image/png');
      const name = U.baseName(it.name) + '-cutout.png';
      if (it.request) {
        const ack = await ask('slopisolate:layer', 'photoslop:layer-ack', { requestId: it.request.requestId, blob, name });
        if (ack && ack.ok) return toast(t('cutout.send.layer_added'));
        if (ack) return toast(ack.error || t('cutout.send.layer_refused'));
      }
      await hub().sendTo('photoslop', blob, name);
      toast(t('cutout.send.opened'));
    });
  };

  /** The top-bar button: "Send back to PhotoSlop", shown for images that came from PhotoSlop. */
  SEND.init = function () {
    const btn = U.$('#btnSendBack');
    if (!btn) return;
    const label = () => U.btnIcon(btn, 'send', t('cutout.app.send_back'));
    label();
    U.onLang(label);
    btn.addEventListener('click', () => SEND.mask());
    const sync = () => {
      const it = S.current();
      btn.hidden = !hub() || !(it && it.request);
      btn.disabled = !ready(it);
    };
    ['activeItem', 'item', 'list'].forEach((ev) => CO.on(ev, sync));
    sync();
  };
})();
