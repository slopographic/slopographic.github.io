/* SlopDrop panel: the DOM the module draws. The drop zone (its message, a Choose files button, the progress list),
   the outlines and "Drop to add N files" label shown over each target while a file drag is over the window, and the toast.
   Colours come from the host's slopui tokens (--sui-*) with fallbacks. Attaches to window.SlopDrop.panel. */
(function (root) {
  'use strict';
  const SD = (root.SlopDrop = root.SlopDrop || {});
  const doc = root.document;
  const P = (SD.panel = {});
  // The brand profile's media switch (set at build time): a build without this site's screenshots shows no picture of one.
  const MEDIA = /*profile:media*/true;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  /** The zone's own words (label, hint, steps, picture alt, sample and choose labels): an i18n key, translated and again
   *  on a language change, a function, or plain text (SlopI18n.label). */
  const lab = (v) => { const I = root.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };
  /** Only a key or a function is drawn again on a change: plain text an app gave (and may rewrite itself) is left alone. */
  const live = (v) => typeof v === 'function' || !!(root.SlopI18n && root.SlopI18n.has && root.SlopI18n.has(v));
  /** Draws a word now and, when it is a key or a function, again on a language change (ups). */
  const word = (ups, set, v) => { set(lab(v)); if (live(v)) ups.push(() => set(lab(v))); };
  const CSS = [
    // Colours: the app's own --sui-* tokens when it has them, else mixed from the text colour round the zone (right in any
    // theme, light or dark) and the shared theme's accent (--sl-*, set on every page by shared/theme/theme.js).
    '.sd-zone,.sd-preview,.sd-sample,.sd-hint,.sd-toast,.sd-over,.sd-flash{--sd-accent:var(--sui-accent,var(--accent,var(--sl-accent,#3b5bdb)));--sd-on-accent:var(--sui-accent-ink,var(--accent-ink,var(--sl-on-accent,#fff)))}',
    '.sd-zone,.sd-preview,.sd-sample{--sd-fg:var(--sui-text,currentColor);--sd-muted:var(--sui-muted,color-mix(in srgb,var(--s-fg,var(--sl-text,currentColor)) 72%,transparent));--sd-line:var(--sui-line,color-mix(in srgb,currentColor 22%,transparent));--sd-panel:var(--sui-panel,color-mix(in srgb,currentColor 6%,transparent));--sd-track:var(--sui-track,color-mix(in srgb,currentColor 14%,transparent))}',
    '.sd-zone{display:grid;gap:8px;justify-items:center;text-align:center}',
    '.sd-zone p{color:var(--sd-muted)}',
    '.sd-zone p{margin:0;font-size:13px}',
    '.sd-choose{font:inherit;font-size:13px;padding:7px 12px;border:1px solid var(--sd-line);border-radius:6px;background:var(--sd-panel);color:var(--sd-fg);cursor:pointer}',
    '.sd-choose:focus-visible{outline:2px solid var(--sd-accent);outline-offset:2px}',
    '.sd-list{list-style:none;margin:4px 0 0;padding:0;width:100%;display:grid;gap:6px;text-align:left}',
    '.sd-list:empty{display:none}',
    '.sd-row{display:grid;gap:3px;padding:6px 8px;border:1px solid var(--sd-line);border-radius:6px;font-size:12px;color:var(--sd-fg);background:var(--sd-panel)}',
    '.sd-row-top{display:flex;justify-content:space-between;gap:8px;min-width:0}',
    '.sd-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.sd-size,.sd-msg-row{color:var(--sd-muted);white-space:nowrap}',
    '.sd-bar{height:4px;border-radius:2px;background:var(--sd-track);overflow:hidden;position:relative}',
    '.sd-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--sd-accent);transition:width .15s linear}',
    '.sd-bar.ind i{width:40%;animation:sd-slide 1s linear infinite}',
    '@keyframes sd-slide{from{left:-40%}to{left:100%}}',
    '.sd-row.ready .sd-msg-row{color:var(--sd-accent)}',
    '.sd-row.error{border-color:#c0392b}.sd-row.error .sd-msg-row{color:#c0392b}',
    '.sd-status{font-size:12px;margin:0;min-height:0}',
    '.sd-status:empty{display:none}',
    '.sd-compact{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 12px;text-align:left}',
    '.sd-compact .sd-msg{flex:1 1 180px}',
    '.sd-compact .sd-list,.sd-compact .sd-status{flex-basis:100%}',
    '.sd-hint{position:fixed;z-index:9000;pointer-events:none;box-sizing:border-box;border:2px dashed var(--sd-accent);border-radius:8px;background:color-mix(in srgb,var(--sd-accent) 8%,transparent);display:flex;align-items:center;justify-content:center;padding:6px}',
    '.sd-hint b{background:var(--sd-accent);color:var(--sd-on-accent);font:600 13px/1.3 system-ui,sans-serif;padding:6px 10px;border-radius:6px;max-width:90%;text-align:center}',
    '.sd-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9001;max-width:min(560px,calc(100vw - 32px));background:var(--sui-text,var(--sl-text,#1b1b22));color:var(--sui-panel,var(--sl-background,#fff));font:13px/1.4 system-ui,sans-serif;padding:9px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer}',
    '@media (max-width:900px){.sd-toast{bottom:calc(20px + var(--slop-foot-h,0px))}}',   // above a phone sheet's footer (shared/frame/panel.js)
    '.sd-toast.warn{border-left:4px solid #e0a040}',
    // The preview: what the app makes (a picture) and how (three steps), above the prompt, so an empty page explains itself.
    '.sd-preview{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center;justify-content:center;width:100%;margin:2px 0 6px;text-align:left}',
    '.sd-pic{flex:0 1 300px;min-width:0;max-width:100%}',
    '.sd-pic img{display:block;width:100%;height:auto;max-height:200px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--sd-line);box-shadow:0 4px 14px rgba(0,0,0,.12)}',
    '.sd-steps{flex:0 1 260px;margin:0;padding:0;list-style:none;counter-reset:sd;display:grid;gap:8px;color:var(--sd-fg);font-size:14px}',
    '.sd-steps li{counter-increment:sd;display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start}',
    '.sd-steps li::before{content:counter(sd);display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--sd-accent);color:var(--sd-on-accent);font:700 12px/1 system-ui,sans-serif}',
    '.sd-private{flex:1 1 100%;margin:2px 0 0;font-size:12.5px;text-align:center;color:var(--sd-muted)}',
    '.sd-private a{color:inherit;text-decoration-color:var(--sd-accent);text-decoration-thickness:2px;text-underline-offset:3px}',
    '.sd-zone.sd-has .sd-preview,.sd-zone.sd-has .sd-sample{display:none}',   // once files are in, the zone is just the prompt
    '.sd-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}',
    '.sd-sample{font:inherit;font-size:13px;padding:7px 12px;border:1px solid transparent;border-radius:6px;background:none;color:var(--sd-fg);text-decoration-color:var(--sd-accent);text-decoration-thickness:2px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    '.sd-sample:focus-visible{outline:2px solid var(--sd-accent);outline-offset:2px}',
    '.sd-quiet:not(:has(.sd-list li)):not(:has(.sd-status:not(:empty))){display:none!important}',
    '.sd-over{outline:2px dashed var(--sd-accent);outline-offset:3px}',
    '.sd-flash{animation:sd-flash 1.2s ease-out}',
    '@keyframes sd-flash{from{box-shadow:0 0 0 3px var(--sd-accent)}to{box-shadow:0 0 0 0 transparent}}',
  ].join('\n');

  function style() {
    if (doc.getElementById('sd-style')) return;
    const s = doc.createElement('style');
    s.id = 'sd-style'; s.textContent = CSS;
    doc.head.appendChild(s);
  }
  /** The preview: o.picture is { src, alt } (a picture of the result), { flow: { from, to } } (SlopFlow) or an element;
   *  o.steps is a short list of what to do. Below them, a line says everything stays on the device and links How it
   *  works (o.privacy: false leaves it out). Null when there is neither picture nor steps. */
  P.preview = function (o, ups) {
    const own = !ups;   // drawn on its own (an app's intro): it follows a language change by itself
    ups = ups || [];
    if (!o || (!o.picture && !(o.steps && o.steps.length))) return null;
    const box = doc.createElement('div');
    box.className = 'sd-preview';
    const pic = o.picture;
    if (pic) {
      const fig = doc.createElement('div');
      fig.className = 'sd-pic';
      if (pic.nodeType) fig.append(pic);
      else if (pic.flow && root.SlopFlow) fig.append(root.SlopFlow.create(Object.assign({ size: 'lg' }, pic.flow)).el);
      // a single-file offline build (opened from file://) has no assets folder beside it: the steps say it there
      else if (pic.src && !(root.location && root.location.protocol === 'file:') && (MEDIA || !/assets\/shots\//.test(pic.src))) { const img = doc.createElement('img'); img.src = pic.src; word(ups, (s) => { img.alt = s; }, pic.alt || ''); img.width = 1280; img.height = 800; img.fetchPriority = 'high'; img.decoding = 'async'; fig.append(img); }   // the first view's largest picture: fetched first, never lazy; its size keeps the room
      if (fig.firstChild) box.append(fig);
    }
    if (o.steps && o.steps.length) {
      const ol = doc.createElement('ol');
      ol.className = 'sd-steps'; ol.setAttribute('aria-label', tr('ui.drop.how', 'How it works')); ol.dataset.i18nAttr = 'aria-label:ui.drop.how';
      for (const step of o.steps) { const li = doc.createElement('li'); word(ups, (s) => { li.textContent = s; }, step); ol.append(li); }
      box.append(ol);
    }
    // Every app runs on the device: the preview says so, and links the page that shows how (not from a file:// build).
    if (o.privacy !== false) {
      const note = doc.createElement('p');
      note.className = 'sd-private';
      const words = doc.createElement('span');   // data-i18n: the text follows a language change (shared/i18n)
      words.dataset.i18n = 'ui.drop.private'; words.textContent = tr('ui.drop.private', 'Everything happens in your browser: nothing is uploaded, and your files stay private on this device.');
      note.append(words, ' ');
      if (!(root.location && root.location.protocol === 'file:')) {
        const a = doc.createElement('a');
        a.href = '/how-it-works/'; a.textContent = tr('ui.drop.how', 'How it works'); a.dataset.i18n = 'ui.drop.how';
        note.append(a);
      }
      box.append(note);
    }
    const I = root.SlopI18n;
    if (own && I && I.on) I.on(() => ups.forEach((w) => w()));
    return box;
  };
  /** Replace the zone's content with the module's panel. Returns { list, msg, status, choose, sample, words, off } (the
   *  buttons; sample is null without o.sample; words() draws the words again, off() stops following language changes).
   *  o.preview (not in a compact strip) and o.sample: see drop.js. Every word may be an i18n key (lab above). */
  P.build = function (zone, o) {
    style();
    const ups = [];   // the words, drawn again on a language change
    // a word the app gave (key, function or text), else the shared default, marked so apply() follows a change
    const text = (node, v, key, en) => { if (v) word(ups, (s) => { node.textContent = s; }, v); else { node.textContent = tr(key, en); node.dataset.i18n = key; } };
    const wrap = doc.createElement('div');
    wrap.className = 'sd-zone' + (o.compact ? ' sd-compact' : '');
    const pv = o.compact ? null : P.preview(o.preview, ups);
    if (pv) wrap.append(pv);
    const msg = doc.createElement('p');
    msg.className = 'sd-msg';
    text(msg, o.label, 'ui.drop.label', 'Drop files here or choose files');
    wrap.append(msg);
    if (o.hint && !o.compact) { const h = doc.createElement('p'); text(h, o.hint); wrap.append(h); }
    const choose = doc.createElement('button');
    choose.type = 'button'; choose.className = 'sd-choose';
    text(choose, o.chooseLabel, 'ui.drop.choose', 'Choose files');
    let sample = null;
    if (o.sample && !o.compact) {   // a strip stays a strip: an app with its own empty state puts its button there and calls .sample()
      sample = doc.createElement('button');
      sample.type = 'button'; sample.className = 'sd-sample';
      text(sample, o.sample.label, 'ui.drop.sample', 'Try it with a sample');
      const acts = doc.createElement('div');
      acts.className = 'sd-acts'; acts.append(choose, sample);
      wrap.append(acts);
    } else wrap.append(choose);
    const list = doc.createElement('ul');
    list.className = 'sd-list'; list.setAttribute('aria-label', tr('ui.drop.adding', 'Files being added')); list.dataset.i18nAttr = 'aria-label:ui.drop.adding';
    wrap.append(list);
    const status = doc.createElement('p');
    status.className = 'sd-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    wrap.append(status);
    zone.replaceChildren(wrap);
    const words = () => ups.forEach((w) => w());
    const I = root.SlopI18n, off = I && I.on ? I.on(words) : () => {};
    return { wrap, list, msg, status, choose, sample, words, off };
  };
  /** One file's row in the progress list. state: 'reading' | 'ready' | 'error'. Returns { progress(p), set(state, text) }. */
  P.row = function (list, name, size, text) {
    const li = doc.createElement('li');
    li.className = 'sd-row reading';
    const top = doc.createElement('div'); top.className = 'sd-row-top';
    const nm = doc.createElement('span'); nm.className = 'sd-name'; nm.textContent = name; nm.title = name;
    const sz = doc.createElement('span'); sz.className = 'sd-size'; sz.textContent = size;
    top.append(nm, sz);
    const bar = doc.createElement('div'); bar.className = 'sd-bar ind';
    const fill = doc.createElement('i'); bar.append(fill);
    const msg = doc.createElement('div'); msg.className = 'sd-msg-row'; msg.textContent = text || tr('ui.drop.reading', 'Reading…');
    li.append(top, bar, msg);
    list.append(li);
    return {
      el: li,
      progress(p) {
        if (!(p >= 0 && p <= 1)) return;
        bar.classList.remove('ind');
        fill.style.width = Math.round(p * 100) + '%';
      },
      set(state, t) {
        li.className = 'sd-row ' + state;
        msg.textContent = t;
        bar.hidden = state !== 'reading';
      },
    };
  };
  /** The toast: one at a time, shown for 6 s (click to dismiss). kind 'warn' adds an accent edge. */
  let toastEl = null, toastTimer = 0;
  P.toast = function (text, kind) {
    if (!doc.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = doc.createElement('div');
      toastEl.className = 'sd-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      toastEl.addEventListener('click', () => { toastEl.remove(); toastEl = null; });
      doc.body.append(toastEl);
    }
    toastEl.className = 'sd-toast' + (kind === 'warn' ? ' warn' : '');
    toastEl.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, 6000);
  };
  /** Outline every target and label the first one. Called on each drag move, so the boxes follow the layout. */
  P.showHints = function (targets, label) {
    if (!P.hints) P.hints = [];
    P.hideHints();
    targets.forEach((el, i) => {
      if (!el || !el.getBoundingClientRect) return;
      const box = doc.createElement('div');
      box.className = 'sd-hint';
      if (i === 0 && label) { const b = doc.createElement('b'); b.textContent = label; box.append(b); }
      doc.body.append(box);
      P.hints.push({ box, el });
    });
    P.placeHints();
  };
  P.placeHints = function () {
    for (const h of P.hints || []) {
      const r = h.el.getBoundingClientRect();
      Object.assign(h.box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    }
  };
  P.hideHints = function () {
    for (const h of P.hints || []) h.box.remove();
    P.hints = [];
  };
})(typeof window !== 'undefined' ? window : globalThis);
