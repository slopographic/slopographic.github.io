// The timeline view (Gantt): a row per task with dates, a bar from its start to its end on a day, week or month scale,
// arrows from each task to the tasks that wait for it (red when one starts too early), a line for today, a diamond on
// a due day, and the tasks without dates in a list beside it (each can be put on the timeline). The names stay at the
// left while the scale scrolls sideways inside its own box. Dragging and keys are timeline-drag.js.
// Exposes window.SlopProjects.timeline.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el, T = g.SlopTime;
  const ROW = 36;
  const SVG = 'http://www.w3.org/2000/svg';
  const st = () => NS.state, BR = () => NS.bars;
  let root = null, side = null, note = null, focusId = null, first = true, geo = null;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  const svg = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  /** The scheduled tasks in timeline order: by start, then end, then board order. */
  const rows = (tasks) => tasks.filter((t) => t.start && t.end).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : (a.order || 0) - (b.order || 0)));

  function scale(sp, zoom, ppd, width) {
    const tk = BR().ticks(sp, zoom, st().today, st().locale);
    const cell = (x, cls) => el('span', { class: cls + (x.weekend ? ' we' : '') + (x.today ? ' now' : ''), style: `left:${x.x}px;width:${x.w}px` }, x.text);
    return el('div', { class: 'tl-head' },
      el('div', { class: 'tl-corner' }, tr('projects.tl.task')),
      el('div', { class: 'tl-scale', style: `width:${width}px` },
        el('div', { class: 'tl-top' }, tk.top.map((x) => cell(x, 'tl-tk'))),
        el('div', { class: 'tl-bot' }, tk.bottom.map((x) => cell(x, 'tl-tk')))));
  }

  function bar(t, sp, ppd, done) {
    const b = BR().box(sp.from, t, ppd);
    const s = st(), range = NS.card.range(t, s.locale);
    const narrow = b.w < Math.max(60, t.title.length * 6.5);
    return el('div', { class: `tl-bar c-${s.project.color || 'blue'}${done ? ' is-done' : ''}${narrow ? ' narrow' : ''}`, role: 'button', tabindex: '0', 'data-id': t.id,
      style: `left:${b.x}px;width:${b.w}px`, 'aria-label': tr('projects.tl.bar_aria', { title: t.title, range }) },
      el('span', { class: 'tl-h s', 'data-edge': 'start', 'aria-hidden': 'true' }),
      el('span', { class: 'tl-lbl' }, t.title),
      el('span', { class: 'tl-h e', 'data-edge': 'end', 'aria-hidden': 'true' }));
  }

  function render() {
    if (!root) return;
    const s = st(), p = s.project;
    if (!p) { root.replaceChildren(); side.replaceChildren(); return; }
    const zoom = s.zoom, ppd = BR().ppdOf(zoom);
    const all = s.tasks, shown = rows(s.visible);
    const sp = BR().span(p, all, s.today, zoom), width = sp.days * ppd;
    const isDone = (t) => NS.board.isDone(p, t);
    const old = root.querySelector('.tl-scroll'), keep = old ? old.scrollLeft : null;
    const act = document.activeElement, had = act && root.contains(act) && act.closest('.tl-bar');   // keep the focus on a redraw
    if (!focusId && had) focusId = had.dataset.id;
    const body = el('div', { class: `tl-body z-${zoom}`, style: `--ppd:${ppd}px;--rows:${Math.max(shown.length, 1)};width:${width}px` });
    shown.forEach((t, i) => {
      const due = t.due ? el('span', { class: `tl-due${!isDone(t) && t.due < s.today ? ' late' : ''}`, style: `left:${BR().xOf(sp.from, t.due, ppd) + ppd / 2}px`, title: tr('projects.card.due', { day: NS.card.day(t.due, s.locale) }) }) : null;
      body.append(el('div', { class: 'tl-row', style: `top:${i * ROW}px` }, bar(t, sp, ppd, isDone(t)), due));
    });
    const names = el('div', { class: 'tl-names' }, shown.map((t) => el('div', { class: 'tl-name' },
      el('button', { type: 'button', class: 'tl-open', tabindex: '-1', onclick: () => NS.editor.open({ task: t }), title: t.title }, t.title),
      t.assignee ? el('span', { class: 'avatar', title: t.assignee }, NS.card.initials(t.assignee)) : null)));
    if (!shown.length) names.append(el('p', { class: 'note tl-none' }, tr(s.visible.length ? 'projects.tl.no_dates' : 'projects.tl.no_match')));
    // Arrows between the bars shown (both ends must be on the timeline), red when the later task starts too early.
    const at = new Map(shown.map((t, i) => [t.id, i]));
    const bad = new Set(NS.deps.violations(all).map((v) => `${v.from}>${v.to}`));
    const arrows = svg('svg', { class: 'tl-arrows', width, height: Math.max(shown.length, 1) * ROW, 'aria-hidden': 'true' });
    const defs = svg('defs', {});
    for (const k of ['ok', 'bad']) { const m = svg('marker', { id: `tlArrow-${k}`, viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '7', markerHeight: '7', orient: 'auto' }); m.append(svg('path', { d: 'M0 0L8 4L0 8z', class: `tl-ah ${k}` })); defs.append(m); }
    arrows.append(defs);
    for (const t of shown) for (const dId of t.deps || []) {
      if (!at.has(dId)) continue;
      const from = all.find((x) => x.id === dId), k = bad.has(`${dId}>${t.id}`) ? 'bad' : 'ok';
      arrows.append(svg('path', { class: `tl-arrow ${k}`, d: BR().arrow(BR().box(sp.from, from, ppd), at.get(dId), BR().box(sp.from, t, ppd), at.get(t.id), ROW), 'marker-end': `url(#tlArrow-${k})` }));
    }
    body.prepend(arrows);
    if (s.today >= sp.from && s.today <= sp.to) body.append(el('div', { class: 'tl-today', style: `left:${BR().xOf(sp.from, s.today, ppd) + ppd / 2}px`, title: tr('projects.tl.today') }));
    const scroll = el('div', { class: 'tl-scroll', style: `--row:${ROW}px` }, scale(sp, zoom, ppd, width), el('div', { class: 'tl-main' }, names, body));
    root.replaceChildren(scroll);
    geo = { sp, ppd, zoom };
    if (keep !== null && !first) scroll.scrollLeft = keep;
    else { scroll.scrollLeft = Math.max(0, BR().xOf(sp.from, startDay(shown, isDone), ppd)); first = false; }
    note.textContent = bad.size ? tr('projects.tl.bad', { n: bad.size }) : '';
    renderSide(s, isDone);
    for (const b of document.querySelectorAll('[data-zoom]')) b.setAttribute('aria-pressed', String(b.dataset.zoom === zoom));
    if (focusId) { const f = root.querySelector(`.tl-bar[data-id="${CSS.escape(focusId)}"]`); if (f) f.focus({ preventScroll: true }); focusId = null; }
  }

  function renderSide(s, isDone) {
    const undated = s.visible.filter((t) => !t.start).sort((a, b) => (a.order || 0) - (b.order || 0));
    side.replaceChildren(el('h3', { class: 'h3' }, tr('projects.tl.undated', { n: String(undated.length) })),
      undated.length ? el('ul', { class: 'tl-undated' }, undated.map((t) => el('li', { class: isDone(t) ? 'is-done' : '' },
        el('button', { type: 'button', class: 'tl-u-title', onclick: () => NS.editor.open({ task: t }) }, t.title),
        el('button', { type: 'button', class: 'btn small', 'aria-label': tr('projects.tl.put', { title: t.title }), onclick: () => NS.actions.schedule(t.id) }, tr('projects.tl.schedule')))))   // i18n-ignore: class names
        : el('p', { class: 'note' }, tr('projects.tl.all_dated')));
  }

  /** Where the timeline opens: a few days before today, or earlier when an unfinished task started before that. */
  function startDay(shown, isDone) {
    let d = T.addDays(st().today, -3);
    for (const t of shown) if (!isDone(t) && t.start < d) d = t.start;
    return T.addDays(d, -1);
  }

  /** Scrolls so today is near the left edge. */
  function toToday() {
    const sc = root.querySelector('.tl-scroll');
    if (sc && geo) sc.scrollTo({ left: Math.max(0, BR().xOf(geo.sp.from, T.addDays(st().today, -3), geo.ppd)), behavior: 'smooth' });
  }

  function setZoom(z) {
    if (!BR().ZOOMS[z]) return;
    st().zoom = z;
    try { localStorage.setItem('slop-projects.zoom', z); } catch (e) { /* storage blocked: the zoom lasts this visit */ }
    first = true;
    render();
  }

  function mount() {
    root = document.getElementById('tl');
    side = document.getElementById('tlSide');
    note = document.getElementById('tlNote');
    for (const b of document.querySelectorAll('[data-zoom]')) b.addEventListener('click', () => setZoom(b.dataset.zoom));
    document.getElementById('tlToday').addEventListener('click', toToday);
    NS.timelineDrag.attach(root);
  }

  NS.timeline = { mount, render, setZoom, toToday, ROW, rows, geo: () => geo, focus: (id) => { focusId = id; } };
})(typeof window !== 'undefined' ? window : globalThis);
