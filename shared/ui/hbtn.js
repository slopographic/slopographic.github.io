/* SlopHbtn: keeps a header's shared buttons (shared/ui/hbtn.css) on screen. When the header cannot show everything it
 * holds on one row, it gets the class slop-htight and those buttons drop their labels for their icons; when there is room again,
 * the labels come back. Classic script, no dependencies. Loaded by shell/shell.js, which calls fit() on the header
 * that holds the Apps button.
 * Buttons that yield (data-hbtn-yield="1", "2", ...: Convert… and AI, shell/header.js) give way before anything else:
 * first their labels (class sh-icon-only), in that order, then the buttons themselves (hidden; the Theme menu offers them).
 * Then the header goes tight (icons only), and More free tools (a single-app site's, shared/parent), Theme, the bell, Slop
 * Drive, Tutorial and Apps fold one by one into a More (⋯)
 * menu (SlopMenuButton) before a button marked data-hbtn-keep (AI) goes; it goes last, into More with its label. They never
 * make a header taller than it is without them, so they cannot wrap it onto a new row.
 *   SlopHbtn.anchor(b)    where a menu of b opens (the More button while b is folded into it).
 *   SlopHbtn.fit(host)    watch host (an element): its size and what it holds. Returns host. Safe to call again.
 *   SlopHbtn.check(host)  measure host now. Returns true when it is tight. */
(function (win) {
  'use strict';
  if (win.SlopHbtn) return;
  const TIGHT = 'slop-htight';
  const watched = new WeakSet();

  /** Something inside host is cut off, pushed past an edge, or wrapped onto a new row (a shared button sits below the
   *  header's own controls), or the app's title (h1) is squeezed: it runs past the box that holds it, which
   *  clips it ("Slop Upsca"). */
  function over(host, rows) {
    if (host.scrollWidth > host.clientWidth + 1) return true;
    for (const t of host.querySelectorAll('h1')) {
      const p = t.parentElement, tr = t.getBoundingClientRect();
      if (!tr.width || !p || p === host) continue;
      if (tr.right > p.getBoundingClientRect().right + 1 || t.scrollWidth > t.clientWidth + 1) return true;
    }
    // rows: the header's own last row counts (a header that is two rows of the app's own controls on a phone, PhotoSlop,
    // may hold them on its second; only one below every own row is wrapped); else the first item's row
    const box = host.getBoundingClientRect();
    // the header's end padding is not room: content that runs into it pushes the last button (View) sideways, by an
    // amount that depends on the font, so it counts as full however little it is (layout is exact to 1/64 px)
    const cs = win.getComputedStyle(host);
    const end = box.right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0);
    if (cs.direction !== 'rtl' && [...host.children].some((c) => { const r = c.getBoundingClientRect(); return r.width && r.right > end + 0.05 && !placed(c, host); })) return true;
    const ours = (c) => c.matches('.slop-hbtn, .sh-hdr') || (!!c.querySelector('.slop-hbtn') && ![...c.querySelectorAll(CONTROLS)].some((n) => !n.closest('.slop-hbtn')));
    const own = [...host.children].filter((c) => !ours(c)).map((c) => c.getBoundingClientRect()).filter((r) => r.width && r.height);
    const first = [...host.children].map((c) => c.getBoundingClientRect()).find((r) => r.width && r.height);
    const row = rows && own.length ? Math.max(...own.map((r) => r.bottom)) : first ? first.bottom : box.bottom;
    for (const n of host.querySelectorAll('.slop-hbtn')) {
      const r = n.getBoundingClientRect();
      if (!r.width) continue;
      if (r.right > Math.min(box.right, win.innerWidth) + 1 || r.left < Math.max(box.left, 0) - 1 || r.top >= row - 1) return true;
    }
    return overlap(host);
  }
  /** Two of the header's controls drawn over each other: a group that cannot shrink further spills into its neighbour
   *  without anything scrolling. A control placed over another on purpose (position absolute or fixed, such as a clear
   *  button in a search box) or one inside another does not count. */
  const CONTROLS = 'button, a[href], input, select, textarea, [role="button"]';
  function placed(n, host) {
    for (let e = n; e && e !== host; e = e.parentElement) { const p = win.getComputedStyle(e).position; if (p === 'absolute' || p === 'fixed') return true; }
    return false;
  }
  function overlap(host) {
    const rs = [];
    for (const n of host.querySelectorAll(CONTROLS)) {
      const r = n.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || placed(n, host)) continue;
      rs.push({ n, r });
    }
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.n.contains(b.n) || b.n.contains(a.n)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 1 && y > 1) return true;
    }
    return false;
  }
  /** The yielding buttons, in the order they give way, and how one is shown: 'full', 'icon' or 'hidden'. */
  const yielders = (host) => [...host.querySelectorAll('[data-hbtn-yield]')].sort((a, b) => a.dataset.hbtnYield - b.dataset.hbtnYield);
  function show(b, st) {
    if (b.hidden !== (st === 'hidden')) b.hidden = st === 'hidden';
    if (b.classList.contains('sh-icon-only') !== (st === 'icon')) b.classList.toggle('sh-icon-only', st === 'icon');
  }
  /** Every step, from all labels shown to all gone: [[button, state], ...] for each. */
  function steps(ys) {
    const out = [], st = ys.map(() => 'full');
    out.push(st.slice());
    for (let i = 0; i < ys.length; i++) { st[i] = 'icon'; out.push(st.slice()); }
    for (let i = 0; i < ys.length; i++) { st[i] = 'hidden'; out.push(st.slice()); }
    return out;
  }
  /* The header's other shared buttons fold into a More (⋯) menu, in this order, before a button that stays (data-hbtn-keep:
   * AI) gives up its place; More then lists everything folded or hidden, by its label. */
  const FOLD = ['.sh-parent', '.sh-theme', '.sn-bell', '[data-sdl]', '.sh-tutorial', '.sh-switch'];   // .sh-parent: shared/parent
  // only on a phone: a wide header keeps its old order (AI gives way after Convert…, into the Theme menu; nothing folds)
  const PHONE = '(max-width: 640px)';
  const phone = () => !!(win.matchMedia && win.matchMedia(PHONE).matches);
  const keep = (b) => b.hasAttribute('data-hbtn-keep') && phone();
  /** The buttons that may fold: those shown, or folded by us (never one the app hid itself). */
  function folders(host) {
    const out = [];
    for (const sel of FOLD) for (const b of host.querySelectorAll(sel)) if ((!b.hidden || b.dataset.hbtnFolded) && b.classList.contains('slop-hbtn')) out.push(b);
    return out;
  }
  const labelOf = (b) => b.dataset.hbtnLabel || b.getAttribute('aria-label') || b.title || b.textContent.trim();
  /** The More button of host (made the first time something folds; needs SlopMenuButton, shared/ui/menubutton.js). */
  const SRC = win.document.currentScript && win.document.currentScript.src;
  let mbP = null;
  /** shared/ui/menubutton.js, loaded the first time a header needs its More menu (not before the page's first paint). */
  function loadMenuButton() {
    if (mbP || !SRC) return mbP;
    return (mbP = new Promise((res) => {
      const s = win.document.createElement('script');
      s.src = new URL('menubutton.js', SRC).href; s.onload = s.onerror = res;
      win.document.head.append(s);
    }));
  }
  function moreOf(host, make) {
    let m = host.querySelector(':scope .slop-hmore');
    if (m || !make) return m;
    // its menu's script still on the way: the button is made now and gets its menu when the script comes, so the header
    // takes its folded layout in one step (no every-button frame past the window's edge, no second jump)
    const p = win.SlopMenuButton ? null : loadMenuButton();
    if (!win.SlopMenuButton && !p) return null;   // no way to load it (an inline copy): no More
    const doc = host.ownerDocument;
    m = doc.createElement('button');
    m.type = 'button'; m.className = 'slop-hbtn slop-hmore'; m.hidden = true;
    const I = win.SlopI18n, more = I && I.t('shell.more') !== 'shell.more' ? I.t('shell.more') : 'More';
    m.title = more; m.setAttribute('aria-label', more); m.setAttribute('data-i18n-attr', 'title:shell.more;aria-label:shell.more');
    m.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>';
    const away = () => [...host.querySelectorAll('[data-hbtn-yield], ' + FOLD.join(', '))].filter((b) => b.hidden && (b.dataset.hbtnFolded || b.hasAttribute('data-hbtn-yield')) && b !== m);
    const wire = () => win.SlopMenuButton.attach(m, {
      label: more, search: false,
      items: () => away().map((b, i) => { const ic = b.querySelector('svg'); return { value: String(i), label: labelOf(b), icon: ic ? ic.cloneNode(true) : null }; }),
      onPick: (v) => { const b = away()[+v]; if (b) b.click(); },
    });
    if (p) p.then(() => { if (win.SlopMenuButton) wire(); }); else wire();
    (host.querySelector('.sh-hdr') || host).append(m);
    return m;
  }
  /** One way to lay out the header: tight or not, each yielder's state, how many buttons are folded. */
  function apply(host, ys, fs, tight, states, folded) {
    host.classList.toggle(TIGHT, tight);
    ys.forEach((b, i) => show(b, states[i]));
    fs.forEach((b, i) => { const on = i < folded; if (b.hidden !== on) b.hidden = on; if (on) b.dataset.hbtnFolded = '1'; else delete b.dataset.hbtnFolded; });
    const need = folded > 0 || states.some((st, i) => st === 'hidden' && keep(ys[i]));
    const more = moreOf(host, need);
    if (more) more.hidden = !need;
    return !need || !!more;   // false: buttons went into a More that cannot be made (no menu script)
  }
  /** Tries the layouts from the roomiest down and keeps the first that fits: labels go (Convert…, then AI), Convert… goes,
   *  everything goes tight (icons only), the other buttons fold into More one by one, and last AI goes into More too. */
  function check(host) {
    if (!host || !host.isConnected) return false;
    const ys = yielders(host), fs = folders(host), hidden = ys.map(() => 'hidden');
    apply(host, ys, fs, false, hidden, 0);
    const h0 = host.getBoundingClientRect().height;   // the header without them: they may not make it taller
    let rows = false;
    const fits = () => host.getBoundingClientRect().height <= h0 + 1 && !over(host, rows);
    const plan = steps(ys).slice(0, -1).filter((st) => !st.some((x, i) => x === 'hidden' && keep(ys[i]))).map((st) => [false, st, 0]);
    if (!ys.some(keep)) plan.push([false, hidden, 0]);
    const kept = ys.map((b) => (keep(b) ? 'icon' : 'hidden'));
    plan.push([true, ys.map(() => 'icon'), 0]);
    const folds = phone() ? fs.length : 0;
    for (let k = 1; k < ys.length; k++) plan.push([true, ys.map((b, i) => (i < k ? 'hidden' : 'icon')), 0]);
    for (let k = 0; k <= folds; k++) plan.push([true, kept, k]);
    if (ys.some(keep)) for (let k = 0; k <= folds; k++) plan.push([true, hidden, k]);
    // on the first row if they can be; else on the header's own rows (only where the app's controls take two rows)
    for (rows of [false, true]) for (const [tight, st, k] of plan) { if (apply(host, ys, fs, tight, st, k) && fits()) return tight; }
    // nothing fits: the app's own controls overflow whatever we do; fold nothing (it would not help) and keep AI as an icon
    // when that adds no row, else hide it as before (the Theme menu and the command palette still offer it)
    apply(host, ys, fs, true, kept, 0);
    if (host.getBoundingClientRect().height > h0 + 1) apply(host, ys, fs, true, hidden, 0);
    return true;
  }
  /** Where a menu of b opens: b, or the More button when b is folded into it. */
  function anchor(b) {
    const host = b && b.hidden && b.closest('header, .sh-hdr');
    const m = host && (host.querySelector('.slop-hmore') || (host.closest('header') && host.closest('header').querySelector('.slop-hmore')));
    return m && !m.hidden ? m : b;
  }
  function fit(host) {
    if (!host || watched.has(host)) return host;
    watched.add(host);
    let queued = false;
    const later = () => {
      if (queued) return;
      queued = true;
      (win.requestAnimationFrame || setTimeout)(() => { queued = false; check(host); });
    };
    if (win.ResizeObserver) new win.ResizeObserver(later).observe(host);
    win.addEventListener('resize', later);
    // A button added later (View, Drive) or a label that changes length (a file name, "Saved") can change the fit.
    if (win.MutationObserver) new win.MutationObserver(later).observe(host, { childList: true, subtree: true, characterData: true });
    // A web font that arrives later changes the labels' and the title's widths but not the header's own size.
    const fonts = win.document.fonts;
    if (fonts && fonts.addEventListener) { fonts.addEventListener('loadingdone', later); fonts.ready.then(later); }
    if (phone()) loadMenuButton();   // a phone header usually folds into More: its menu's script on the way now
    check(host);
    return host;
  }

  win.SlopHbtn = { fit, check, anchor };
})(window);
