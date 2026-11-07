/* Slopnodes context menu: a small popover for right-clicks. Items: { label, act, disabled?, keys? } | '-' | { label, sub: [...] }.
 * Opens at a point, closes on a click elsewhere, Escape or scroll; Arrow keys move, Enter runs. Exposes window.SlopNodesMenu
 * = { open(x, y, items), close() }. Classic script. */
(function () {
  'use strict';
  let pop = null, onAway = null;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function close() {
    if (pop) pop.remove();
    pop = null;
    document.removeEventListener('pointerdown', onAway, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', close, true);
  }
  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (!pop) return;
    const items = [...pop.querySelectorAll('.snm-item:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  }
  function list(items) {
    const ul = el('div', 'snm-list');
    ul.setAttribute('role', 'menu');
    for (const it of items) {
      if (it === '-') { ul.append(el('hr', 'snm-sep')); continue; }
      const b = el('button', 'snm-item');
      b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.append(el('span', null, it.label));
      if (it.keys) b.append(el('span', 'snm-keys', it.keys));
      if (it.sub) b.append(el('span', 'snm-arrow', '▸'));
      b.disabled = !!it.disabled;
      if (it.sub) {
        b.addEventListener('pointerenter', () => { const sub = b.nextElementSibling; if (sub && sub.classList.contains('snm-sub')) sub.hidden = false; });
        const sub = list(it.sub); sub.classList.add('snm-sub'); sub.hidden = true;
        ul.append(b, sub);
        b.addEventListener('click', () => { sub.hidden = !sub.hidden; });
      } else {
        b.addEventListener('click', () => { close(); it.act && it.act(); });
        ul.append(b);
      }
    }
    return ul;
  }
  function open(x, y, items) {
    close();
    pop = el('div', 'snm');
    pop.append(list(items));
    document.body.append(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px';
    pop.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
    const first = pop.querySelector('.snm-item:not(:disabled)');
    if (first) first.focus();
    setTimeout(() => {
      onAway = (e) => { if (!pop || !pop.contains(e.target)) close(); };
      document.addEventListener('pointerdown', onAway, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', close, true);
    }, 0);
  }
  window.SlopNodesMenu = { open, close };
})();
