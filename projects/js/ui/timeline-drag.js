// Timeline drags and keys. Drag a bar to move the task, or one of its ends to change that date, by whole days (the bar
// follows and shows the new dates); a press without a drag opens the task. On a focused bar the arrows move it a day,
// Shift with an arrow changes the end, Alt with an arrow the start, and Enter opens it. Each change is one undo step,
// and later tasks move on so no dependency breaks. Exposes window.SlopProjects.timelineDrag.attach(root).
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const THRESHOLD = 4;
  let d = null;
  const st = () => NS.state;

  function show(dates) {
    const geo = NS.timeline.geo(), b = NS.bars.box(geo.sp.from, dates, geo.ppd);
    d.bar.style.left = `${b.x}px`;
    d.bar.style.width = `${b.w}px`;
    d.tip.textContent = NS.card.range(dates, st().locale);
  }

  function move(e) {
    if (!d) return;
    const dx = e.clientX - d.sx;
    if (!d.started) {
      if (Math.abs(dx) < THRESHOLD) return;
      d.started = true;
      d.bar.classList.add('is-dragging');
      d.tip = document.createElement('span');
      d.tip.className = 'tl-tip';
      d.bar.append(d.tip);
    }
    e.preventDefault();
    d.dates = NS.bars.drag(d.mode, d.task, NS.bars.daysFor(dx, NS.timeline.geo().ppd));
    show(d.dates);
  }

  function end(commit) {
    if (!d) return;
    const { bar, task, dates, started, mode } = d;
    bar.removeEventListener('pointermove', move);
    bar.classList.remove('is-dragging');
    if (d.tip) d.tip.remove();
    d = null;
    if (!commit) { if (started) NS.timeline.render(); return; }
    if (!started) { NS.editor.open({ task }); return; }
    NS.timeline.focus(task.id);
    if (dates && (dates.start !== task.start || dates.end !== task.end)) NS.actions.setDates(task.id, dates, mode === 'move' ? 'moved' : 'changed');
    else NS.timeline.render();
  }

  function onKey(e) {
    const bar = e.target.closest && e.target.closest('.tl-bar');
    if (!bar) return;
    const t = st().tasks.find((x) => x.id === bar.dataset.id);
    if (!t) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NS.editor.open({ task: t }); return; }
    if (e.key === 'Escape' && d) { e.preventDefault(); end(false); return; }
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const mode = e.shiftKey ? 'end' : e.altKey ? 'start' : 'move';
    NS.timeline.focus(t.id);
    NS.actions.setDates(t.id, NS.bars.drag(mode, t, step), mode === 'move' ? 'moved' : 'changed');
  }

  function attach(root) {
    root.addEventListener('pointerdown', (e) => {
      const bar = e.target.closest('.tl-bar');
      if (!bar || e.button !== 0 || d) return;
      const task = st().tasks.find((x) => x.id === bar.dataset.id);
      if (!task) return;
      e.preventDefault();
      bar.focus({ preventScroll: true });
      d = { bar, task, mode: (e.target.dataset && e.target.dataset.edge) || 'move', sx: e.clientX, started: false, dates: null };
      try { bar.setPointerCapture(e.pointerId); } catch (x) { /* synthetic events in tests */ } // touch-ok: .tl-bar has touch-action: none (css/timeline.css)
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', () => end(true), { once: true });
      bar.addEventListener('pointercancel', () => end(false), { once: true });
    });
    root.addEventListener('keydown', onKey);
  }

  NS.timelineDrag = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
