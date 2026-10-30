// Board drag and drop with the pointer: a mouse drags a card from anywhere on it, a finger or pen from its grip (so the
// board still scrolls under a finger). After a few pixels the card lifts (a copy follows the pointer), a gap shows where
// it will land, the board scrolls when the pointer nears its edges, and the drop is one move (with Undo). Escape cancels.
// A click that was not a drag still opens the card. Exposes window.SlopProjects.boardDrag.attach(root).
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const THRESHOLD = 5, EDGE = 48, SPEED = 14;
  let d = null, swallow = false;

  function start(e) {
    const r = d.card.getBoundingClientRect();
    d.offX = d.sx - r.left; d.offY = d.sy - r.top;
    d.ghost = d.card.cloneNode(true);
    d.ghost.classList.add('ghost');
    d.ghost.removeAttribute('tabindex');
    d.ghost.setAttribute('aria-hidden', 'true');
    d.ghost.style.width = `${r.width}px`;
    document.body.append(d.ghost);
    d.ph = document.createElement('div');
    d.ph.className = 'pph';
    d.ph.style.height = `${r.height}px`;
    d.card.after(d.ph);
    d.card.classList.add('is-dragging');
    document.body.classList.add('p-dragging');
    d.started = true;
    d.raf = requestAnimationFrame(tick);
    move(e);
  }

  /** Scrolls the board (sideways) and the page (up and down) while the pointer is near an edge. */
  function tick() {
    if (!d || !d.started) return;
    const r = d.root.getBoundingClientRect();
    if (d.x < r.left + EDGE) d.root.scrollLeft -= SPEED;
    else if (d.x > r.right - EDGE) d.root.scrollLeft += SPEED;
    if (d.y < EDGE) g.scrollBy(0, -SPEED);
    else if (d.y > g.innerHeight - EDGE) g.scrollBy(0, SPEED);
    place();
    d.raf = requestAnimationFrame(tick);
  }

  /** Puts the gap in the column under the pointer, before the first card whose middle is below it. */
  function place() {
    const under = document.elementFromPoint(d.x, d.y);
    const col = (under && under.closest && under.closest('.pcol')) || null;
    if (!col || !d.root.contains(col)) return;
    const body = col.querySelector('.pcol-body');
    const cards = [...body.querySelectorAll('.pcard:not(.is-dragging)')];
    const before = cards.find((c) => { const b = c.getBoundingClientRect(); return b.top + b.height / 2 > d.y; }) || null;
    if (d.ph.parentNode !== body || d.ph.nextElementSibling !== before) body.insertBefore(d.ph, before);
    for (const c of d.root.querySelectorAll('.pcol.is-target')) if (c !== col) c.classList.remove('is-target');
    col.classList.add('is-target');
  }

  function move(e) {
    if (!d) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.started) {
      if (Math.hypot(d.x - d.sx, d.y - d.sy) < THRESHOLD) return;
      start(e);
      return;
    }
    e.preventDefault();
    d.ghost.style.transform = `translate(${d.x - d.offX}px, ${d.y - d.offY}px) rotate(1.5deg)`;
    place();
  }

  function cleanup() {
    if (!d) return;
    cancelAnimationFrame(d.raf);
    if (d.ghost) d.ghost.remove();
    if (d.ph) d.ph.remove();
    d.card.classList.remove('is-dragging');
    document.body.classList.remove('p-dragging');
    for (const c of d.root.querySelectorAll('.pcol.is-target')) c.classList.remove('is-target');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    document.removeEventListener('keydown', onEsc, true);
    d = null;
  }

  function up() {
    if (!d) return;
    if (!d.started) { cleanup(); return; }
    const col = d.ph.closest('.pcol');
    let next = d.ph.nextElementSibling;
    while (next && !next.matches('.pcard:not(.is-dragging)')) next = next.nextElementSibling;
    const id = d.id, colId = col && col.dataset.col;
    swallow = true;
    setTimeout(() => { swallow = false; }, 0);
    cleanup();
    if (!colId) return;
    NS.boardView.focus(id);
    NS.actions.moveCard(id, colId, NS.boardView.indexFor(colId, next ? next.dataset.id : null, id));
  }

  function cancel() { cleanup(); }
  function onEsc(e) { if (e.key === 'Escape' && d && d.started) { e.preventDefault(); e.stopPropagation(); cleanup(); } }

  function attach(root) {
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || d) return;
      const card = e.target.closest('.pcard');
      if (!card || e.target.closest('.pc-more, input')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.pgrip')) return;   // a finger scrolls; it drags by the grip
      if (e.target.closest('.pgrip')) e.preventDefault();
      d = { root, card, id: card.dataset.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, started: false };
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      document.addEventListener('keydown', onEsc, true);
    });
    // The click that ends a drag does not open the card.
    root.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, true);
  }

  NS.boardDrag = { attach, get active() { return !!(d && d.started); } };
})(typeof window !== 'undefined' ? window : globalThis);
