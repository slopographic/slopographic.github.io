/* SlopDocTabs: the document tab strip that every document app shares. Classic script, no network, no storage.
 * SlopDocTabs.mount(hostEl, adapter, opts) -> api. The adapter contract and the steps to use it are in HANDOFF.md.
 * Each tab keeps its own doc object. Switching calls adapter.deactivate(old) and then adapter.activate(new).
 * Rename: double-click a tab (or F2 on the active tab) edits the name in place; SlopDocTabs.rename(tabId, name) does it from code.
 * Each tab also keeps its original file name (set when a file is opened); a rename never changes it.
 * Load order: tabs.js, drive.js, session.js (drive and session attach themselves to window.SlopDocTabs). */
(function () {
  'use strict';
  const NS = window.SlopDocTabs || (window.SlopDocTabs = {});
  if (NS.mount) return;
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }   // shared/i18n/ui/en.js, else the English

  let seq = 0;
  /** A tab id, unique across reloads too: session.js names the stored content with it. */
  const newId = () => 't' + Date.now().toString(36) + '-' + (seq++).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const MAX_NAME = 120;
  const mounts = new Set(); // every mounted strip, so SlopDocTabs.rename(tabId) finds the tab

  /** A DOM element from a tag, attributes (false, null and undefined are skipped, true is a bare attribute) and children. */
  function make(d, tag, attrs, kids) {
    const n = d.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : String(v));
    n.append(...(kids || []).filter(Boolean));
    return n;
  }
  function defaultConfirm(title, msg, ok) {
    if (window.SlopUI && SlopUI.confirm) return SlopUI.confirm(title, msg, ok, { danger: true });
    return Promise.resolve(window.confirm(msg));
  }
  function defaultToast(msg) { if (window.SlopUI && SlopUI.toast) SlopUI.toast(msg, 3200); }

  /** mount(hostEl, adapter, opts): opts = { appId, confirm(title, msg, ok) -> Promise<bool>, toast(msg), keys: true }. */
  function mount(host, adapter, opts = {}) {
    if (!host || !adapter) throw new Error('SlopDocTabs.mount needs a host element and an adapter');
    const d = host.ownerDocument, win = d.defaultView;
    const confirmFn = opts.confirm || defaultConfirm, toastFn = opts.toast || defaultToast;
    const tabs = []; // { id, doc, driveId, name (a display name set by a rename, else null), orig (original file name, else null) }
    const listeners = new Set();
    let cur = null, dragId = null, menuOpen = false, edit = null; // edit = { id, value, input } while a tab name is being typed

    // the tabs' tablist (a tab needs one as its parent), named by the host's label
    const hostKey = (/(?:^|;)\s*aria-label:([\w.-]+)/.exec(host.getAttribute('data-i18n-attr') || '') || [])[1];   // a marked host label: its key, kept
    const hostLabel = hostKey && win.SlopI18n ? win.SlopI18n.t(hostKey) : host.getAttribute('aria-label');
    const strip = make(d, 'div', { class: 'sl-doctabs-strip', role: 'tablist', 'aria-label': hostLabel || tr('ui.tabs.open_docs', 'Open documents'), 'data-i18n-attr': hostKey ? 'aria-label:' + hostKey : hostLabel ? null : 'aria-label:ui.tabs.open_docs' });
    const plus = make(d, 'button', { type: 'button', class: 'sl-doctabs-new', title: tr('ui.tabs.new_tip', 'New document (Ctrl+T)'), 'aria-label': tr('ui.new_document', 'New document'), 'data-i18n-attr': 'title:ui.tabs.new_tip;aria-label:ui.new_document' }, ['+']);
    const more = make(d, 'button', { type: 'button', class: 'sl-doctabs-more', title: tr('ui.tabs.all', 'All open documents'), 'aria-label': tr('ui.tabs.all', 'All open documents'), 'data-i18n-attr': 'title:ui.tabs.all;aria-label:ui.tabs.all', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, ['⋯']);
    const menu = make(d, 'div', { class: 'sl-doctabs-menu', role: 'menu' });
    more.hidden = true; menu.hidden = true;
    host.classList.add('sl-doctabs');
    host.append(strip, plus, more, menu);

    const call = (name, ...a) => (typeof adapter[name] === 'function' ? adapter[name](...a) : undefined);
    const find = (doc) => tabs.find((t) => t.doc === doc) || null;
    const titleOf = (t) => t.name || call('title', t.doc) || tr('ui.untitled', 'Untitled');
    const dirtyOf = (t) => !!call('dirty', t.doc);
    const emit = (why, t, other) => { for (const fn of [...listeners]) { try { fn(why, t, api, other); } catch (e) { console.warn(e); } } };

    const offLang = window.SlopI18n && SlopI18n.on ? SlopI18n.on(() => { if (!edit) render(); }) : null;   // the tabs' words after a language change
    function checkOverflow() {
      more.hidden = !(tabs.length > 1 && strip.scrollWidth > strip.clientWidth + 1);
      if (more.hidden) setMenu(false);
    }
    function render() {
      strip.replaceChildren(...tabs.map(tabEl));
      const act = strip.querySelector('.sl-doctab[aria-selected="true"]');
      if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      checkOverflow();
      if (menuOpen) renderMenu();
    }
    function tabEl(t) {
      const on = t === cur, name = titleOf(t);
      const x = make(d, 'button', { type: 'button', class: 'sl-doctab-x', title: tr('ui.tabs.close_tip', 'Close (Ctrl+W)'), 'aria-label': tr('ui.close_name', 'Close {name}', { name }) }, ['×']);
      x.addEventListener('click', (e) => { e.stopPropagation(); close(t.doc); });
      const editing = edit && edit.id === t.id;
      const label = editing ? editor(t) : make(d, 'span', { class: 'sl-doctab-name' }, [name]);
      const n = make(d, 'div', { class: 'sl-doctab' + (on ? ' active' : ''), role: 'tab', 'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1', title: t.orig ? name + '\n' + tr('ui.tabs.orig_name', 'Original name: {name}', { name: t.orig }) : name, draggable: 'true', 'data-id': t.id }, [
        label,
        dirtyOf(t) ? make(d, 'i', { class: 'sl-doctab-dot', 'aria-label': tr('ui.tabs.unsaved', 'unsaved changes') }) : null,
        x,
      ]);
      n.addEventListener('click', (e) => { if (e.button === 0 && !e.target.closest('.sl-doctab-x')) activate(t.doc); });
      n.addEventListener('dblclick', (e) => { if (!e.target.closest('.sl-doctab-x')) startEdit(t); });
      n.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); close(t.doc); } });
      n.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } });
      n.addEventListener('dragstart', (e) => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-sl-doctab', t.id); });
      n.addEventListener('dragend', () => { dragId = null; });
      n.addEventListener('dragover', (e) => { if (dragId) e.preventDefault(); });
      n.addEventListener('drop', (e) => { // intake-ok: a tab moved along the strip, not a file
        if (!dragId) return;
        e.preventDefault();
        const r = n.getBoundingClientRect(), at = tabs.findIndex((x2) => x2.id === t.id);
        reorder(dragId, at + (e.clientX > r.left + r.width / 2 ? 1 : 0));
        dragId = null;
      });
      return n;
    }

    /* ----- rename in place ----- */
    /** The text field that replaces a tab's name. Enter or blur saves, Escape cancels. */
    function editor(t) {
      const inp = make(d, 'input', { type: 'text', class: 'sl-doctab-edit', maxlength: MAX_NAME, 'aria-label': tr('ui.tabs.doc_name', 'Document name'), autocomplete: 'off', spellcheck: 'false' });
      inp.value = edit.value;
      edit.input = inp;
      inp.addEventListener('input', () => { edit.value = inp.value; });
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation(); // the tab's arrow keys and the strip's shortcuts do not run while typing
        if (e.key === 'Enter') { e.preventDefault(); endEdit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
      });
      inp.addEventListener('blur', () => endEdit(true));
      inp.addEventListener('click', (e) => e.stopPropagation());
      inp.addEventListener('dblclick', (e) => e.stopPropagation());
      inp.addEventListener('dragstart', (e) => e.preventDefault());
      return inp;
    }
    function startEdit(t) {
      if (!t || (edit && edit.id === t.id)) return;
      if (edit) endEdit(true);
      edit = { id: t.id, value: titleOf(t), input: null };
      render();
      if (edit && edit.input) { edit.input.focus(); edit.input.select(); }
    }
    function endEdit(commit) {
      const e = edit;
      if (!e) return; // already ended (the blur after Enter, for one)
      edit = null;
      const t = tabs.find((x) => x.id === e.id);
      if (commit && t) renameTab(t, e.value); else render();
    }
    /** Set a tab's display name (the original file name is not touched). Empty names are refused and the old name is kept.
     * The Drive file, when the tab is linked to one, is renamed to match, keeping its extension. Resolves true when renamed. */
    async function renameTab(t, raw) {
      const name = String(raw == null ? '' : raw).trim().slice(0, MAX_NAME).trim();
      if (!name) { toastFn(tr('ui.tabs.need_name', 'A document needs a name, so the old name was kept.')); render(); return false; }
      if (name === titleOf(t)) { render(); return true; }
      t.name = name;
      changed(t.doc); // redraws the tab and tells the session to save the new name
      if (t.driveId) {
        const H = window.SlopHub;
        const fileName = NS.drive ? NS.drive.fileName(api, t.doc) : name;
        const out = H ? await Promise.resolve().then(() => H.update(t.driveId, { name: fileName })).catch(() => null) : null;
        if (!out) toastFn(tr('ui.tabs.renamed', 'Renamed to {name}. The Drive copy still has the old name.', { name }));
      }
      return true;
    }

    function reorder(id, to) {
      const from = tabs.findIndex((t) => t.id === id);
      if (from < 0) return;
      const [t] = tabs.splice(from, 1);
      if (from < to) to--;
      tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, t);
      render(); emit('reorder', t);
    }

    /** Make t the active tab: the old one is deactivated first, then the new one is activated. */
    function switchTo(t) {
      const old = cur;
      if (old) call('deactivate', old.doc);
      cur = t;
      call('activate', t.doc);
      render();
      emit('activate', t, old);
    }
    function activate(doc) {
      const t = find(doc);
      if (t && t !== cur) switchTo(t);
    }
    function step(dir) {
      if (tabs.length < 2 || !cur) return;
      const i = tabs.indexOf(cur);
      activate(tabs[(i + dir + tabs.length) % tabs.length].doc);
    }

    /** Open a document as a tab. opts: { id, driveId, origName, name, activate = true, append = false }.
     * origName is the file's original name (kept as is); name is a display name set by an earlier rename. */
    function openDoc(doc, o = {}) {
      const t = { id: o.id || newId(), doc, driveId: o.driveId || null, name: o.name || null, orig: o.origName || null };
      tabs.splice(o.append || !cur ? tabs.length : tabs.indexOf(cur) + 1, 0, t);
      if (o.activate === false && cur) { render(); emit('open', t); return t; }
      switchTo(t);
      emit('open', t);
      return t;
    }
    function newTab() { return openDoc(adapter.newDoc()); }

    /** Close a tab (the active one by default). A dirty tab asks first. The last tab closed leaves a blank one. */
    async function close(doc = cur && cur.doc) {
      const t = doc && find(doc);
      if (!t) return true;
      if (dirtyOf(t) && !(await confirmFn(tr('ui.tabs.close_q', 'Close document?'), tr('ui.tabs.close_body', '“{name}” has changes you haven\'t saved. Close it anyway?', { name: titleOf(t) }), tr('menu.close', 'Close')))) return false;
      const i = tabs.indexOf(t), wasCur = t === cur;
      tabs.splice(i, 1);
      if (wasCur) { cur = null; call('deactivate', t.doc); }
      emit('close', t);
      if (!tabs.length) openDoc(adapter.newDoc());
      else if (wasCur) switchTo(tabs[Math.min(i, tabs.length - 1)]);
      else render();
      return true;
    }

    /** The app calls this after an edit (or a rename): the tab title and dirty dot are redrawn and the session saves. */
    function changed(doc) {
      const t = find(doc);
      if (!t) return;
      render();
      emit('content', t);
    }

    /* ----- overflow menu: every tab in a list, for when the strip is full ----- */
    function renderMenu() {
      menu.replaceChildren(...tabs.map((t) => make(d, 'button', { type: 'button', role: 'menuitemradio', 'aria-checked': t === cur ? 'true' : 'false', class: 'sl-doctabs-item' + (t === cur ? ' active' : '') }, [titleOf(t), dirtyOf(t) ? ' ●' : ''])));
      menu.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => { setMenu(false); activate(tabs[i].doc); }));
    }
    function setMenu(open) {
      menuOpen = open;
      menu.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
      if (open) renderMenu();
    }

    /* ----- wiring ----- */
    const onClick = (e) => {
      if (menuOpen && !menu.contains(e.target) && e.target !== more) setMenu(false);
    };
    const onKey = (e) => {
      if (edit) return; // typing a name: the field handles its own keys
      if (e.key === 'Escape' && menuOpen) { setMenu(false); return; }
      const a = d.activeElement;
      if (e.key === 'F2' && cur && (!a || a === d.body || strip.contains(a)) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(cur); return; }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Tab') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (k === 'w' && !e.shiftKey) { e.preventDefault(); close(); }
      else if (k === 't' && !e.shiftKey) { e.preventDefault(); newTab(); }
    };
    plus.addEventListener('click', () => newTab());
    more.addEventListener('click', () => setMenu(!menuOpen));
    d.addEventListener('pointerdown', onClick, true);
    if (opts.keys !== false) d.addEventListener('keydown', onKey, true);
    win.addEventListener('resize', checkOverflow);

    const api = {
      appId: opts.appId || null,
      adapter,
      newTab, openDoc, activate, close, changed, step, reorder,
      current: () => (cur ? cur.doc : null),
      /** Snapshot of the strip, in order: [{ id, doc, title, dirty, active, driveId, name, original }].
       * title is the display name; name is the renamed name (null when the adapter's title is used); original is the file name. */
      tabs: () => tabs.map((t) => ({ id: t.id, doc: t.doc, title: titleOf(t), dirty: dirtyOf(t), active: t === cur, driveId: t.driveId, name: t.name, original: t.orig })),
      tabOf: (doc) => { const t = find(doc); return t ? t.id : null; },
      driveIdOf: (doc) => { const t = find(doc); return t ? t.driveId : null; },
      /** The display name of a doc (the renamed name, else the adapter's title). */
      nameOf: (doc) => { const t = find(doc); return t ? titleOf(t) : (call('title', doc) || tr('ui.untitled', 'Untitled')); },
      /** The original file name of a doc (for example invoice-2026.pdf), or null for a new blank document. */
      originalNameOf: (doc) => { const t = find(doc); return t ? t.orig : null; },
      /** rename(doc, name): renames the tab (see renameTab). rename(doc) with no name edits the name in place. */
      rename: (doc, name) => {
        const t = find(doc);
        if (!t) return Promise.resolve(false);
        if (name === undefined) { startEdit(t); return Promise.resolve(null); }
        return renameTab(t, name);
      },
      /** Record the Slop Drive file a tab is linked to (kept across reloads by session.js). */
      setDriveId(doc, id) { const t = find(doc); if (t) { t.driveId = id || null; emit('drive', t); } },
      /** After a save: the adapter's saved(doc) runs (clears the dirty state), then the strip is redrawn. */
      markSaved(doc) { if (find(doc)) { call('saved', doc); changed(doc); } },
      /** Subscribe to strip events: fn(why, tab, api, other). why: open, close, activate, reorder, content, drive. */
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      overflowVisible: () => !more.hidden,
      saveToDrive: (doc = api.current()) => (NS.drive ? NS.drive.saveToDrive(api, doc) : Promise.resolve(null)),
      toast: (msg) => toastFn(msg),
      destroy() {
        d.removeEventListener('pointerdown', onClick, true);
        d.removeEventListener('keydown', onKey, true);
        win.removeEventListener('resize', checkOverflow); if (offLang) offLang();
        listeners.clear(); tabs.length = 0; cur = null; edit = null; mounts.delete(api);
        strip.remove(); plus.remove(); more.remove(); menu.remove();
        host.classList.remove('sl-doctabs');
      },
    };
    mounts.add(api);
    render();
    return api;
  }

  /** SlopDocTabs.rename(tabId, name): renames a tab in whichever strip holds it. tabId null = the active tab.
   * No name = edit the name in place (the File menu item uses this). Resolves true when renamed, false when refused or not found. */
  function rename(tabId, name) {
    for (const m of mounts) {
      const doc = tabId == null ? m.current() : (m.tabs().find((t) => t.id === tabId) || {}).doc;
      if (doc) return m.rename(doc, name);
    }
    return Promise.resolve(false);
  }

  NS.mount = mount;
  NS.newId = newId;
  NS.rename = rename;
})();
