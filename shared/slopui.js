/* SlopUI: the shared dialog / toast / menu kit for Slopographic apps (PhotoSlop, SlopVector, Slop PDF).
 * Classic script, no dependencies. Exposes window.SlopUI.
 * Theming: set --sui-* custom properties (see slopui.css); it falls back to each app's own tokens. */
(function () {
  'use strict';
  if (window.SlopUI) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let open = 0, z = 1000;
  const stack = [];

  /**
   * dialog({ title, body, buttons: [{ label, primary, danger, act }], cls, onClose, modal = true, dock })
   * body: Node or string. act() may return false (or a Promise of false) to keep the dialog open.
   * dock: 'right' places a non-blocking tool dialog at the side (for live previews).
   * Returns { box, close(ok) }.
   */
  function dialog(o) {
    const back = el('div', { class: 'sui-back' + (o.modal === false || o.dock ? ' sui-modeless' : '') + (o.dock ? ' sui-dock-' + o.dock : '') });
    const box = el('div', { class: 'sui-dlg ' + (o.cls || ''), role: 'dialog', 'aria-modal': o.modal === false ? 'false' : 'true', 'aria-label': o.title || tr('ui.dlg.dialog', 'Dialog') });
    const closeBtn = el('button', { class: 'sui-x', type: 'button', 'aria-label': tr('menu.close', 'Close') }, '×');
    const head = el('div', { class: 'sui-head' }, el('span', { class: 'sui-title' }, o.title || ''), closeBtn);
    const body = el('div', { class: 'sui-body' }, typeof o.body === 'string' ? el('p', { class: 'sui-p' }, o.body) : o.body);
    const foot = el('div', { class: 'sui-foot' });
    box.append(head, body);
    if (o.buttons && o.buttons.length) box.append(foot);
    back.append(box);
    back.style.zIndex = String(++z);
    const prevFocus = document.activeElement;
    document.body.append(back);
    open++; stack.push(back);
    let closed = false;
    function close(ok) {
      if (closed) return; closed = true; open--;
      stack.splice(stack.indexOf(back), 1);
      back.classList.add('sui-out');
      setTimeout(() => back.remove(), 140);
      if (o.onClose) o.onClose(!!ok);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    closeBtn.addEventListener('click', () => close(false));
    for (const b of o.buttons || []) {
      const btn = el('button', { type: 'button', class: 'sui-btn' + (b.primary ? ' sui-primary' : '') + (b.danger ? ' sui-danger' : '') }, b.label);
      btn.addEventListener('click', async () => {
        if (b.act) { btn.disabled = true; let r; try { r = await b.act(); } finally { btn.disabled = false; } if (r === false) return; }
        close(!!b.primary);
      });
      foot.append(btn);
    }
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !e.target.closest('select')) {
        const p = foot.querySelector('.sui-primary'); if (p) { e.preventDefault(); e.stopPropagation(); p.click(); }
      } else if (e.key === 'Tab') {
        // keep focus inside the dialog
        const f = [...box.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      e.stopPropagation();
    });
    if (o.modal !== false && !o.dock) back.addEventListener('pointerdown', (e) => { if (e.target === back && o.dismissable) close(false); });
    // drag by the header
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = box.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ } // touch-ok: .sui-head has touch-action: none (slopui.css)
      const mv = (ev) => { box.classList.add('sui-moved'); box.style.left = clamp(ev.clientX - sx, 0, innerWidth - 60) + 'px'; box.style.top = clamp(ev.clientY - sy, 0, innerHeight - 40) + 'px'; };
      head.addEventListener('pointermove', mv);
      head.addEventListener('pointerup', () => head.removeEventListener('pointermove', mv), { once: true });
    });
    requestAnimationFrame(() => {
      const f = box.querySelector('[autofocus]') || box.querySelector('input:not([type=checkbox]):not([type=range]):not([type=color]), select, textarea') || foot.querySelector('.sui-primary') || closeBtn;
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } if (f.select && f.tagName === 'INPUT') f.select(); }
    });
    return { box, body, close };
  }
  const alert = (title, msg, ok = tr('menu.ok', 'OK')) => new Promise((res) => dialog({ title, body: msg, buttons: [{ label: ok, primary: true }], onClose: () => res() }));
  const confirm = (title, msg, ok = tr('menu.ok', 'OK'), { danger = false, cancel = tr('menu.cancel', 'Cancel') } = {}) => new Promise((res) => dialog({ title, body: msg, buttons: [{ label: cancel }, { label: ok, primary: true, danger }], onClose: (r) => res(r) }));
  function prompt(title, label, value = '', { ok = tr('menu.ok', 'OK'), placeholder = '', multiline = false } = {}) {
    return new Promise((res) => {
      const input = multiline ? el('textarea', { class: 'sui-input', rows: 4, placeholder }) : el('input', { class: 'sui-input', type: 'text', placeholder });
      input.value = value;
      let out = null;
      dialog({ title, body: field(label, input), buttons: [{ label: tr('menu.cancel', 'Cancel') }, { label: ok, primary: true, act: () => { out = input.value; } }], onClose: (r) => res(r ? out : null) });
    });
  }
  /** A labelled row for forms: field('Width', input, 'px'). */
  function field(label, input, unit) { return el('label', { class: 'sui-field' }, el('span', { class: 'sui-label' }, label), input, unit ? el('span', { class: 'sui-unit' }, unit) : null); }
  function number(value, min, max, step = 1) { return el('input', { class: 'sui-input', type: 'number', value, min, max, step, inputmode: 'decimal' }); }
  function select(options, value) { return el('select', { class: 'sui-input' }, options.map(([v, l]) => el('option', { value: v, selected: String(v) === String(value) }, l))); }
  function check(label, checked) { const c = el('input', { type: 'checkbox', checked: !!checked }); return { el: el('label', { class: 'sui-check' }, c, el('span', null, label)), input: c }; }

  /* ---------- toast ---------- */
  let toastEl = null, toastT = 0;
  /** action (optional): { label, run } adds a button to the toast, e.g. { label: 'Retry', run: retry }. */
  function toast(msg, ms = 2400, action = null) {
    if (!toastEl) { toastEl = el('div', { class: 'sui-toast', role: 'status', 'aria-live': 'polite' }); document.body.append(toastEl); }
    toastEl.replaceChildren(document.createTextNode(msg));
    if (action) toastEl.append(' ', el('button', { type: 'button', class: 'sui-toast-act', onclick: () => { toastEl.classList.remove('sui-show'); action.run(); } }, action.label));
    toastEl.classList.add('sui-show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('sui-show'), action ? Math.max(ms, 10000) : ms);
  }

  /* ---------- context menu ---------- */
  // items: [{ label, key, act, disabled, check, sub: [...] } | '-']
  // A submenu opens beside its row: to the right of the menu, or to the left when there is no room (mirrored on a
  // right-to-left page: <html dir="rtl">, Arabic and Hebrew, opens left first and the arrow points left).
  // It opens on hover after a short delay, or at once on click, Enter or ArrowRight (ArrowLeft in RTL). Escape or
  // ArrowLeft (ArrowRight in RTL) closes it. On a narrow screen (phones) it opens in place, as an indented list.
  const SUB_DELAY = 180;
  let menuEl = null;
  let menuReturn = null; // the element that had focus before the menu opened: focus goes back to it on close
  let subTimer = 0;
  function closeMenu() {
    clearTimeout(subTimer);
    document.querySelectorAll('.sui-menu').forEach((m) => m.remove());
    menuEl = null;
    const back = menuReturn; menuReturn = null;
    if (back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function keyLabel(k) { return isMac ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : k; }
  const narrow = () => innerWidth <= 640;
  const rtl = () => document.documentElement.getAttribute('dir') === 'rtl';
  const subKeys = () => (rtl() ? { open: 'ArrowLeft', close: 'ArrowRight' } : { open: 'ArrowRight', close: 'ArrowLeft' });
  /** Puts a flyout beside its row: right of the parent menu, left when there is no room, inside the viewport. */
  function placeFlyout(sub, row) {
    const pr = row.closest('.sui-menu, .menu').getBoundingClientRect(), rr = row.getBoundingClientRect();
    const w = sub.offsetWidth, h = sub.offsetHeight;
    let x = rtl() ? pr.left - w - 2 : pr.right + 2;
    if (rtl() ? x < 4 : x + w > innerWidth - 4) x = rtl() ? pr.right + 2 : pr.left - w - 2;
    sub.style.left = clamp(x, 4, innerWidth - w - 4) + 'px';
    sub.style.top = clamp(rr.top - 4, 4, innerHeight - h - 4) + 'px';
  }
  /** Removes the flyouts deeper than a level, except one (keep). */
  function closeDeeper(level, keep) { document.querySelectorAll('.sui-menu').forEach((mm) => { if (+mm.dataset.level > level && mm !== keep) mm.remove(); }); }
  function focusFirst(m) { const f = m.querySelector('.sui-row:not([disabled])'); if (f) f.focus({ preventScroll: true }); }
  /** Closes one flyout (and any deeper), focusing the row that opened it. */
  function closeFlyout(m) {
    closeDeeper(+m.dataset.level - 1);
    const row = m.ownerRow;
    if (row) { row.subEl = null; row.setAttribute('aria-expanded', 'false'); if (row.isConnected) { try { row.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  }
  function openFlyout(row, items, level, focus) {
    closeDeeper(level, row.subEl);
    if (!(row.subEl && row.subEl.isConnected)) {
      const sub = makeMenu(items, level + 1);
      sub.ownerRow = row;
      sub.style.zIndex = String(++z);
      document.body.append(sub);
      placeFlyout(sub, row);
      row.subEl = sub;
    }
    row.setAttribute('aria-expanded', 'true');
    if (focus) focusFirst(row.subEl);
  }
  /** Phone: the submenu's rows open in place under their parent row. */
  function toggleInline(row, items, level) {
    const wasOpen = row.classList.contains('sui-open');
    row.closest('.sui-menu').querySelectorAll('.sui-row.sui-open').forEach(collapseInline);
    if (wasOpen) return;
    const grp = el('div', { class: 'sui-inline' });
    fill(grp, items, level);
    row.after(grp);
    row.classList.add('sui-open'); row.setAttribute('aria-expanded', 'true');
    row.inlineEl = grp;
  }
  function collapseInline(row) {
    row.classList.remove('sui-open'); row.setAttribute('aria-expanded', 'false');
    if (row.inlineEl) { row.inlineEl.remove(); row.inlineEl = null; }
  }
  function subRow(row, items, level) {
    row.addEventListener('pointerenter', (e) => {
      clearTimeout(subTimer);
      if (e.pointerType === 'touch' || narrow() || (row.subEl && row.subEl.isConnected)) return;
      subTimer = setTimeout(() => openFlyout(row, items, level, false), SUB_DELAY);
    });
    row.addEventListener('click', () => { clearTimeout(subTimer); if (narrow()) toggleInline(row, items, level); else openFlyout(row, items, level, false); });
    row.addEventListener('keydown', (e) => {
      if (e.key !== subKeys().open && e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation(); clearTimeout(subTimer);
      if (narrow()) { if (!row.classList.contains('sui-open')) toggleInline(row, items, level); if (row.inlineEl) focusFirst(row.inlineEl); }
      else openFlyout(row, items, level, true);
    });
  }
  function fill(host, items, level) {
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { host.append(el('div', { class: 'sui-sep', role: 'separator' })); continue; }
      const row = el('button', { class: 'sui-row' + (it.sub ? ' sui-has-sub' : ''), type: 'button', role: 'check' in it ? (it.radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem', 'aria-checked': 'check' in it ? String(!!it.check) : null, disabled: !!it.disabled, 'aria-haspopup': it.sub ? 'menu' : null, 'aria-expanded': it.sub ? 'false' : null },
        el('span', { class: 'sui-chk' }, it.check ? '✓' : ''), el('span', { class: 'sui-lbl' }, it.label), el('span', { class: 'sui-key' }, it.sub ? (rtl() ? '◂' : '▸') : it.key ? keyLabel(it.key) : ''));
      if (it.sub) subRow(row, it.sub, level);
      else {
        row.addEventListener('pointerenter', () => { clearTimeout(subTimer); closeDeeper(level); });
        row.addEventListener('click', () => { closeMenu(); if (!it.disabled && it.act) it.act(); });
      }
      host.append(row);
    }
  }
  function makeMenu(items, level) {
    const m = el('div', { class: 'sui-menu', role: 'menu' });
    m.dataset.level = level;
    fill(m, items, level);
    m.addEventListener('keydown', (e) => {
      const cur = document.activeElement, rows = [...m.querySelectorAll('.sui-row:not([disabled])')], i = rows.indexOf(cur);
      if (e.key === 'ArrowDown') { e.preventDefault(); (rows[i + 1] || rows[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (rows[i - 1] || rows[rows.length - 1]).focus(); }
      else if (e.key === subKeys().close || e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        const grp = cur && cur.closest ? cur.closest('.sui-inline') : null;
        if (grp) { const p = grp.previousElementSibling; collapseInline(p); p.focus({ preventScroll: true }); }
        else if (+m.dataset.level > 0) closeFlyout(m);
        else if (e.key === 'Escape') closeMenu();
      }
    });
    return m;
  }
  function menu(items, x, y) {
    closeMenu();
    const m = makeMenu(items, 0);
    m.style.zIndex = String(++z);
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = clamp(x, 4, innerWidth - r.width - 4) + 'px';
    m.style.top = clamp(y, 4, innerHeight - r.height - 4) + 'px';
    menuEl = m;
    menuReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    focusFirst(m);
    return m;
  }
  document.addEventListener('pointerdown', (e) => { if (menuEl && !e.target.closest('.sui-menu')) closeMenu(); }, true);

  /* ---------- file picking ---------- */
  /** Opens the file dialog once. Resolves with the chosen files, or [] when the dialog is cancelled (the cancel event),
   *  so a caller that awaits it (a dialog button, for one) is never left waiting. A fresh input each time, removed at
   *  once, so the same file can be chosen again. capture ('environment' or 'user'): a phone opens its camera at once. */
  function pickFiles({ accept = '', multiple = false, capture = '' } = {}) {
    return new Promise((res) => {
      const i = el('input', { type: 'file', accept, multiple, style: 'position:fixed;left:-9999px' });
      if (capture) i.setAttribute('capture', capture);
      let done = false;
      const finish = (files) => { if (done) return; done = true; i.remove(); res(files); };
      i.addEventListener('change', () => finish([...i.files]), { once: true });
      i.addEventListener('cancel', () => finish([]), { once: true });
      document.body.append(i);
      i.click();
    });
  }
  function download(blob, name) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  window.SlopUI = { tr, el, dialog, alert, confirm, prompt, field, number, select, check, toast, menu, closeMenu, placeFlyout, narrow, pickFiles, download, get openDialogs() { return open; } };
})();
