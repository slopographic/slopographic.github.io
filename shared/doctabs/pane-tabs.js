/* SlopPaneTabs: a document tab strip for one pane of a split workspace (shared/workspace). Each pane gets its own strip, at its
 * top, so a split shows its tabs inside each pane. The app supplies the tabs and says what a pick or a close does; the strip
 * only draws them and handles the keys. Any app with SlopWorkspace panes can mount one.
 *
 *   const bar = SlopPaneTabs.mount(paneEl, {
 *     label: 'Open documents',        // optional, read by screen readers
 *     items: () => [{ id, title, active, dirty }],  // the app's tabs in order; active = the one this pane shows
 *     pick(id),                       // a tab's name was chosen (click, Enter or Space)
 *     close(id),                      // a tab's close button was pressed, or the tab was middle-clicked
 *     add(),                          // optional: a + button at the end, for a new document
 *   });
 *   bar.render();                     // call after the app's tabs change
 *   bar.destroy();
 *
 * Arrow keys move between tabs. Classic script, no network, no storage. Exposes window.SlopPaneTabs. Styles: pane-tabs.css. */
(function () {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  function mount(host, opts) {
    const o = opts || {};
    const bar = document.createElement('nav');
    bar.className = 'spt-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', o.label || tr('ui.tabs.open_docs', 'Open documents'));
    if (!o.label) bar.dataset.i18nAttr = 'aria-label:ui.tabs.open_docs';
    host.prepend(bar);

    function tab(item) {
      const t = document.createElement('div');
      t.className = 'spt-tab' + (item.active ? ' on' : '');
      t.setAttribute('role', 'presentation');
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'spt-name';
      name.setAttribute('role', 'tab');
      name.setAttribute('aria-selected', item.active ? 'true' : 'false');
      name.title = item.title;
      name.textContent = (item.dirty ? '• ' : '') + item.title;
      name.addEventListener('click', () => { if (o.pick) o.pick(item.id); });
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'spt-x';
      x.setAttribute('aria-label', tr('ui.close_name', 'Close {name}', { name: item.title }));
      x.textContent = '×';
      x.addEventListener('click', (e) => { e.stopPropagation(); if (o.close) o.close(item.id); });
      t.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); if (o.close) o.close(item.id); } });
      t.append(name, x);
      return t;
    }

    const add = o.add ? document.createElement('button') : null;
    if (add) {
      add.type = 'button';
      add.className = 'spt-add';
      add.title = tr('ui.new_document', 'New document');
      add.setAttribute('aria-label', add.title); add.dataset.i18nAttr = 'title:ui.new_document;aria-label:ui.new_document';
      add.textContent = '+';
      add.addEventListener('click', () => o.add());
    }

    function render() {
      const items = (o.items && o.items()) || [];
      const nodes = items.map(tab);
      if (add) nodes.push(add);
      bar.replaceChildren(...nodes);
    }

    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const names = [...bar.querySelectorAll('.spt-name')];
      const at = names.indexOf(document.activeElement);
      if (at < 0) return;
      e.preventDefault();
      const next = names[(at + (e.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length];
      next.focus();
    });

    function destroy() { bar.remove(); }

    render();
    return { el: bar, render, destroy };
  }

  window.SlopPaneTabs = { mount };
})();
