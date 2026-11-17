// Scan view: the keyboard-wedge field (always on), the camera mode (when the browser can), the action and quantity
// settings that both modes share, the last-scan panel, and the scan log with its right-click menu.
// Scans run one at a time, in order, through a queue, so two codes never race for the same stock.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const { h } = U;
  const $ = (id) => document.getElementById(id);
  const HOLD_MS = 2000; // a result stays on screen at least this long, so a missed read is noticed
  const LOG_MAX = 200;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const ACTION = () => ({ receive: t('inventory.sc.receive'), sell: t('inventory.sc.sell'), count: t('inventory.sc.count'), lookup: t('inventory.sc.lookup') });
  const STATUS = () => ({ received: t('inventory.sc.received'), sold: t('inventory.sc.sold'), counted: t('inventory.sc.counted'), found: t('inventory.sc.found'), refused: t('inventory.sc.refused'),
    unknown: t('inventory.sc.unknown'), rejected: t('inventory.sc.rejected'), undone: t('inventory.sc.undone'), ignored: t('inventory.sc.ignored') });
  const SOURCE = () => ({ scanner: t('inventory.sc.scanner'), keyboard: t('inventory.sc.typed'), camera: t('inventory.sc.camera') });
  const st = { mode: 'keyboard', log: [], camera: null, queue: Promise.resolve(), shownAt: 0, pending: null, holdTimer: 0, detach: null };

  const focusInput = () => {
    if (st.mode === 'keyboard' && !(UI && UI.openDialogs > 0)) $('scanInput').focus({ preventScroll: true });
  };

  /** Runs a job after every scan already queued. Errors are logged, never thrown into the UI. */
  function enqueue(job) {
    st.queue = st.queue.then(job).catch((err) => console.error(err));
    return st.queue;
  }

  /** The action settings as the scan pipeline takes them. */
  const options = () => ({ action: $('scanAction').value, qty: U.wholeOf($('scanQty').value), location: U.cleanLocation($('scanLoc').value) });

  /** Scans one code: logs it, then shows it (held for HOLD_MS). */
  function handle(code, source) {
    return enqueue(async () => {
      const entry = await NS.scan.scan(code, { ...options(), source });
      st.log.unshift(entry);
      if (st.log.length > LOG_MAX) st.log.length = LOG_MAX;
      showResult(entry);
      renderLog();
      focusInput();
    });
  }

  /** Shows an entry now, or when the last one has been on screen for HOLD_MS. The newest entry wins. */
  function showResult(entry) {
    st.pending = entry;
    const wait = st.shownAt + HOLD_MS - Date.now();
    if (wait <= 0) return paint();
    if (!st.holdTimer) st.holdTimer = setTimeout(() => { st.holdTimer = 0; paint(); }, wait);
    return undefined;
  }

  function paint() {
    st.shownAt = Date.now();
    if (st.pending) renderResult(st.pending);
  }

  function stockLine(e) {
    if (e.onHandBefore === null || e.onHandBefore === undefined) return '';
    const loc = e.location;
    if (e.onHandAfter !== null && e.onHandAfter !== undefined && e.onHandAfter !== e.onHandBefore) {
      return t('inventory.sc.on_hand_change', { before: e.onHandBefore, after: e.onHandAfter, loc });
    }
    return t('inventory.sc.on_hand', { n: e.onHandBefore, loc });
  }

  function renderResult(e) {
    const parts = [
      h('div', { class: 'res-head' },
        h('span', { class: `pill s-${e.status}`, text: STATUS()[e.status] || e.status }),
        h('span', { class: 'mono code', text: e.code || t('inventory.sc.empty') }),   // i18n-ignore: CSS class names
        h('span', { class: 'sub', text: `${SOURCE()[e.source] || e.source} · ${ACTION()[e.action] || e.action}` })),
    ];
    if (e.productId) parts.push(h('p', { class: 'res-prod' }, h('b', { text: e.name }), h('span', { class: 'mono sub', text: ` ${e.sku}` })));   // i18n-ignore: CSS class names
    if (e.productId) parts.push(h('p', { class: 'res-stock', text: stockLine(e) }));
    parts.push(h('p', { class: 'res-msg', text: e.message }));
    if (e.status === 'unknown') parts.push(unknownActions(e));
    $('scanResult').replaceChildren(...parts);
  }

  /** Create a product for an unknown code, or link its EAN to an existing product that has none. */
  function unknownActions(e) {
    const digits = S.barcode.normalizeEan(e.code);
    if (!e.canCreate) {
      return h('div', { class: 'res-actions' }, h('button', { type: 'button', class: 'btn primary', text: t('inventory.sc.create_sku'), onclick: () => createFor(e, { sku: e.code }) }));   // i18n-ignore: CSS class names
    }
    const pick = h('select', { class: 'sui-input', 'aria-label': t('inventory.sc.existing') }, h('option', { value: '', text: t('inventory.sc.choose') }));
    S.store.list('products').then((r) => {
      for (const p of (r.ok ? r.value : []).filter((x) => !x.ean).sort((a, b) => a.name.localeCompare(b.name))) {
        pick.append(h('option', { value: p.id, text: `${p.name} (${p.sku})` }));
      }
    });
    return h('div', { class: 'res-actions' },
      h('button', { type: 'button', class: 'btn primary', text: t('inventory.sc.create_ean'), onclick: () => createFor(e, { ean: digits, sku: digits }) }),   // i18n-ignore: CSS class names
      h('div', { class: 'link-row' }, pick,
        h('button', { type: 'button', class: 'btn', text: t('inventory.sc.link'), onclick: () => linkFor(e, pick.value) })));
  }

  /** Opens the product form (the products view's panel) prefilled; once saved, Scan shows again and the same code is
   *  scanned again so the action applies. */
  function createFor(e, prefill) {
    NS.productForm.open({ ...prefill, back: 'scan', onSaved: () => handle(e.code, e.source) });
  }

  async function linkFor(e, productId) {
    if (!productId) { UI.toast(t('inventory.sc.choose_first')); return; }
    const r = await S.store.get('products', productId);
    if (!r.ok || !r.value) { UI.toast(r.ok ? t('inventory.pr.gone') : U.refusal(r)); return; }
    if (r.value.ean) { UI.alert(t('inventory.sc.has_ean'), t('inventory.sc.has_ean_body', { name: r.value.name, ean: r.value.ean })); return; }
    const saved = await NS.products.save({ ...r.value, ean: S.barcode.normalizeEan(e.code) });
    if (!saved.ok) { UI.alert(t('inventory.sc.not_linked'), U.refusal(saved)); return; }
    UI.toast(t('inventory.sc.linked', { name: r.value.name }));
    handle(e.code, e.source);
  }

  function renderLog() {
    const list = $('scanLog');
    list.replaceChildren(...st.log.map((e) => h('li', { class: `log-row s-${e.status}`, dataset: { id: e.id }, tabindex: 0 },
      h('span', { class: 'mono sub', text: U.stamp(e.at) }),   // i18n-ignore: CSS class names
      h('span', { class: 'mono', text: e.code || t('inventory.sc.empty') }),
      h('span', { class: 'lname', text: e.name || '—' }),
      h('span', { class: 'pill s-' + e.status, text: STATUS()[e.status] || e.status }),
      h('span', { class: 'sub lmsg', text: e.message }))));   // i18n-ignore: CSS class names
    $('scanLogEmpty').hidden = st.log.length > 0;
  }

  function undoLast() {
    return enqueue(async () => {
      const r = await NS.scan.undoLast(st.log);
      if (!r.ok) { UI.toast(r.message); return; }
      UI.toast(t('inventory.sc.undone_toast'));
      showResult(r.value);
      renderLog();
    });
  }

  function undoEntry(entry) {
    return enqueue(async () => {
      const r = await NS.scan.undo(entry);
      if (!r.ok) { UI.alert(t('inventory.sc.not_undone'), r.message); return; }
      showResult(entry);
      renderLog();
    });
  }

  /** Camera on or off. Keyboard mode always works; camera mode says why it cannot start, when it cannot. */
  function setMode(mode) {
    st.mode = mode === 'camera' ? 'camera' : 'keyboard';
    $('modeKeyboard').setAttribute('aria-pressed', String(st.mode === 'keyboard'));
    $('modeCamera').setAttribute('aria-pressed', String(st.mode === 'camera'));
    const box = $('cameraBox');
    if (st.mode === 'camera') {
      box.hidden = false;
      if (!st.camera) {
        st.camera = NS.camera.createCamera({ video: $('cam'), onCode: (code, o) => handle(code, o.source), onStatus: (msg) => { $('camMsg').textContent = msg; } });
      }
      st.camera.start();
    } else {
      if (st.camera) st.camera.stop();
      box.hidden = true;
      focusInput();
    }
  }

  function mount() {
    st.detach = NS.wedge.attachWedge($('scanInput'), (text, o) => handle(text, o.source));
    $('modeKeyboard').addEventListener('click', () => setMode('keyboard'));
    $('modeCamera').addEventListener('click', () => setMode('camera'));
    $('scanUndo').addEventListener('click', undoLast);
    const log = $('scanLog');
    log.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.id) undoOrNone(e.target.dataset.id); });
    if (g.SlopCtx) {
      SlopCtx.bind(log, (target) => {
        const row = target && target.closest ? target.closest('[data-id]') : null;
        const entry = row ? st.log.find((x) => x.id === row.dataset.id) : null;
        if (!entry) return null;
        const canUndo = NS.scan.UNDOABLE.includes(entry.status);
        return [
          entry.productId ? { label: t('inventory.pr.edit'), act: () => NS.views.products.openEdit(entry.productId) } : null,
          entry.productId ? { label: t('inventory.pr.moves'), act: () => NS.app.show('stock', entry.productId) } : null,
          canUndo ? { label: t('inventory.sc.undo'), act: () => undoEntry(entry) } : null,
          '-',
          { label: t('inventory.sc.remove'), act: () => { st.log = st.log.filter((x) => x !== entry); renderLog(); } },
        ];
      });
    }
    $('scanResult').replaceChildren(h('p', { class: 'empty', text: t('inventory.page.nothing') }));
    renderLog();
  }

  /** Enter on a focused log row undoes it when it can be undone. */
  function undoOrNone(id) {
    const entry = st.log.find((x) => x.id === id);
    if (entry && NS.scan.UNDOABLE.includes(entry.status)) undoEntry(entry);
  }

  NS.scanView = {
    handle, setMode, undoLast, mode: () => st.mode, log: () => st.log,
  };
  NS.views = NS.views || {};
  NS.views.scan = { mount, refresh: () => renderLog(), onShow: () => focusInput() };
})(typeof window !== 'undefined' ? window : globalThis);
