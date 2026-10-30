/* Slop Drive — ui/keys: keyboard shortcuts (see DR.SHORTCUTS in menus.js for the list shown to people). */
'use strict';
(function (DR) {
  const S = DR.S, $ = DR.$;
  let gPending = 0;
  DR.wireKeys = function () {
    document.addEventListener('keydown', (e) => {
      if (window.SlopUI.openDialogs || document.querySelector('.sui-menu')) return;
      const t = e.target, typing = (!!window.SlopTyping && window.SlopTyping.isTyping(e, { controls: true }));   // shared/input/typing.js
      const mod = e.ctrlKey || e.metaKey, k = e.key, items = DR.selected(), one = items.length === 1 ? items[0] : null;
      if (typing) {
        if (k === 'Escape' && t.id === 'search') { t.value = ''; S.query = ''; DR.render(); $('pane').focus(); }
        else if ((k === 'ArrowDown' || k === 'Enter') && t.id === 'search') { e.preventDefault(); $('pane').focus(); DR.moveFocus('home'); }
        return;
      }
      const run = (fn) => { e.preventDefault(); fn(); };
      // With the shared command palette, SlopCmd owns the shortcuts (people can rebind them); we keep navigation here.
      if (DR.cmdActive && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(k)) return;
      if (gPending && Date.now() - gPending < 1200 && !mod) {
        gPending = 0;
        const sec = { r: 'recent', s: 'starred', t: 'trash' }[k.toLowerCase()];
        if (sec) return run(() => DR.goSection(sec));
        if (k.toLowerCase() === 'd' || k.toLowerCase() === 'h') return run(() => DR.go(null));
      }
      if (e.altKey && !mod && k.toLowerCase() === 's') return run(() => DR.openSortMenu());
      if (mod && k.toLowerCase() === 'a') return run(() => DR.selectAll());
      if (mod && k.toLowerCase() === 'c' && !e.shiftKey) return run(() => DR.clipCopy(false));
      if (mod && k.toLowerCase() === 'x') return run(() => DR.clipCopy(true));
      if (mod && k.toLowerCase() === 'v') return run(() => DR.paste(one && one.isFolder && !one.trashedAt ? one.id : DR.dest()));
      if (mod && k.toLowerCase() === 'd') return run(() => items.length && DR.duplicate(items));
      if (mod && k.toLowerCase() === 'm') return run(() => items.length && DR.moveDialog(items));
      // New folder is Ctrl+Alt+Shift+N, as in Slop Code (Chrome keeps Ctrl+Shift+N for an incognito window); e.code, since a
      // Mac's Option changes e.key
      if (mod && e.altKey && e.shiftKey && e.code === 'KeyN') return run(() => DR.newFolder(DR.dest()));
      if (mod && k.toLowerCase() === 'u') return run(() => DR.uploadPicker(false));
      if (mod && k.toLowerCase() === 'f') return run(() => $('search').focus());
      if (mod) return;
      if (k === '/') return run(() => $('search').focus());
      if (k === '?') return run(() => DR.shortcutsDialog());
      if (k === 'Escape') { if (e.defaultPrevented) return; S.touchMode = false; return run(() => DR.select([])); }   // an open sheet took it first
      if (k === 'g') { gPending = Date.now(); return; }
      if (/^[1-6]$/.test(k)) return run(() => DR.setView(DR.VIEWS[+k - 1][0]));
      if (k === 'i' || k === 'I') return run(() => DR.toggleInfo());
      if ((k === 's' || k === 'S') && items.length && S.section !== 'trash') return run(() => DR.setStar(items, !items.every((x) => x.starred)));
      if (k === 'F2' && one) return run(() => DR.rename(one));
      if ((k === 'Delete' || (k === 'Backspace' && e.metaKey)) && items.length) return run(() => (e.shiftKey || S.section === 'trash' ? DR.purge(items) : DR.trash(items)));
      if (k === 'Backspace' || (e.altKey && k === 'ArrowUp')) return run(() => DR.up());
      if (k === 'Enter' && one) return run(() => DR.open(one));
      if (k === ' ' && one && !one.isFolder) return run(() => DR.quickLook(one));
      if (DR.viewKeys && DR.viewKeys(e)) return;
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end' }[k];
      if (dir) return run(() => DR.moveFocus(dir, e.shiftKey));
    });
  };
})(window.DR);
