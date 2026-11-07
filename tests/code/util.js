/* Helpers for the Slop Code tests: the app in an iframe, Slop Drive seeding (through this page's SlopHub, which
 * shares the origin's IndexedDB), typing into CodeMirror and key presses. */
window.CT = (function () {
  const { waitFor, sleep } = SlopTest;
  /** Load the app (or a page) in an iframe. Resolves with its window once the app is ready. */
  async function frame(src, { width = 1280, height = 760, ready = true } = {}) {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:${height}px;border:0;position:relative`;
    f.src = src; document.body.append(f);
    await waitFor(() => f.contentWindow && f.contentWindow.document.readyState === 'complete' &&
      (!ready || f.contentWindow.document.body.classList.contains('ready')), { timeout: 20000 });
    return f.contentWindow;
  }
  const close = (w) => { if (w && w.frameElement) w.frameElement.remove(); };
  const text = (s, type = 'text/plain') => new Blob([s], { type });
  const H = () => window.SlopHub;
  const view = (w) => w.SlopCode.view();
  const doc = (w) => w.SlopCode.docs.current();
  const cm = (w) => w.document.querySelector('.cd-editor .cm-content');
  const textOf = (w) => view(w).state.doc.toString();
  /** Put the cursor at the end of the document and focus the editor. */
  function toEnd(w) {
    const v = view(w);
    v.focus();
    v.dispatch({ selection: { anchor: v.state.doc.length } });
    v.focus();
  }
  /** Type text as the user would (execCommand insertText goes through CodeMirror's input handling). */
  async function typeText(w, s) {
    toEnd(w);
    const before = view(w).state.doc.length;
    w.document.execCommand('insertText', false, s);
    await waitFor(() => view(w).state.doc.length === before + s.length, { timeout: 4000 });
  }
  /** A keydown on the focused element. */
  function key(w, k, { ctrl = false, shift = false, alt = false } = {}) {
    const target = w.document.activeElement || w.document.body;
    // SlopCmd matches letters and digits by e.code (as a real keyboard reports it), so set both.
    const code = /^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : /^\d$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : k;
    target.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, code, ctrlKey: ctrl, metaKey: false, shiftKey: shift, altKey: alt, bubbles: true, cancelable: true }));
  }
  const rec = (id) => H().get(id);
  const tabNames = (w) => [...w.document.querySelectorAll('.cd-tab-name')].map((b) => b.textContent.replace('•', '').trim());
  // The newest dialog that is still open (SlopUI keeps a closed one in the DOM for 140 ms).
  const dialog = (w) => [...w.document.querySelectorAll('.sui-dlg')].filter((d) => !d.parentElement.classList.contains('sui-out')).pop() || null;
  const dialogButtons = (w) => { const d = dialog(w); return d ? [...d.querySelectorAll('.sui-btn')] : []; };
  const clickButton = (w, label) => { const b = dialogButtons(w).find((x) => x.textContent.trim() === label); if (!b) throw new Error('no dialog button ' + label); b.click(); };
  const rawGet = (db, store, id) => new Promise((res, rej) => {
    const r = indexedDB.open(db);
    r.onsuccess = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(store)) { d.close(); res(null); return; }
      const g = d.transaction(store).objectStore(store).get(id);
      g.onsuccess = () => { d.close(); res(g.result || null); };
      g.onerror = () => { d.close(); rej(g.error); };
    };
    r.onerror = () => rej(r.error);
  });
  return { frame, close, text, H, view, doc, cm, textOf, toEnd, typeText, key, rec, tabNames, dialog, dialogButtons, clickButton, rawGet, sleep, waitFor };
})();
