/* Shared video core (window.SlopVideo.laneView): the Layout lane, a timeline strip of layout switches used by
   SlopCut and Reel Remix. Each band is one layout (its name and slot count); each marker is a switch. Add a
   switch at the playhead (with a chosen layout), drag a marker to move it, select one and press Delete (or
   the Delete button) to remove it. Every change is reported through onCommit(switches) as a new list; the host
   stores it and calls update() again. Pointer and keyboard only; no dependencies. Words: ui.video.lane.* (SV.word);
   they follow a language change (SlopI18n.on), opts.label too when it is a function. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const V = (SV.laneView = {});
  const SEG = SV.segments, T = SV.templates;
  const SNAP = 0.1;
  const word = (id, vars) => SV.word('lane', id, vars);
  const sec = (v) => { const I = root.SlopI18n; return I ? I.num(+v.toFixed(1), { minimumFractionDigits: 1 }) : v.toFixed(1); };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs) { if (k === 'class') n.className = attrs[k]; else if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); }
    for (const k of kids) n.append(k);
    return n;
  };
  const pct = (t, dur) => (dur > 0 ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0) + '%';
  /** Time of a pointer (client x) on the track, snapped to 0.1 s and clamped to [0, dur]. */
  const timeAt = (track, x, dur) => {
    const r = track.getBoundingClientRect();
    const t = r.width > 0 ? ((x - r.left) / r.width) * dur : 0;
    return Math.round(Math.min(dur, Math.max(0, t)) / SNAP) * SNAP;
  };

  /**
   * Mount a lane into host. opts.onCommit(list) receives the new switch list; opts.onSeek(t) (optional) is called
   * when the track is clicked. opts.label: the title (a string, or a function read on each language change).
   * Returns { update({ duration, switches, layouts, playhead }) }. layouts is a list of [id, label] for the add select
   * (or a function giving it, read again on a language change).
   */
  V.mount = function (host, opts) {
    const select = el('select', { class: 'lv-sel' });
    const add = el('button', { type: 'button', class: 'lv-btn' });
    const del = el('button', { type: 'button', class: 'lv-btn', disabled: '' });
    const track = el('div', { class: 'lv-track', role: 'group' });
    const title = el('b', { class: 'lv-title' });
    const head = el('div', { class: 'lv-head' }, title, select, add, del);
    const hint = el('p', { class: 'lv-hint' });
    const root2 = el('div', { class: 'lv' }, head, track, hint);
    host.replaceChildren(root2);
    const st = { duration: 10, switches: [], layouts: [], playhead: 0, sel: -1, drag: null };
    /** The fixed words, again after a language change. */
    function words() {
      const lbl = typeof opts.label === 'function' ? opts.label() : opts.label;
      title.textContent = lbl || word('title');
      select.setAttribute('aria-label', word('pick'));
      add.title = word('add_tip'); add.textContent = word('add');
      del.title = word('delete_tip'); del.textContent = word('delete');
      track.setAttribute('aria-label', word('track'));
    }
    words();
    const I = root.SlopI18n;
    const off = I && I.on ? I.on(() => {
      if (!root2.isConnected) { if (off) off(); return; } // a lane taken off the page (replaced) stops listening
      words(); fillLayouts(); render();
    }) : null;

    const commit = (list) => { if (opts.onCommit) opts.onCommit(SEG.clean(list)); };
    add.addEventListener('click', () => commit(SEG.add(st.switches, st.playhead, select.value)));
    del.addEventListener('click', () => { if (st.sel >= 0) { const i = st.sel; st.sel = -1; commit(SEG.remove(st.switches, i)); } });
    track.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('.lv-mark');
      if (!m) { if (opts.onSeek) opts.onSeek(timeAt(track, e.clientX, st.duration)); return; }
      const i = +m.dataset.i;
      st.sel = i; track.focus?.();
      st.drag = { i, moved: false, t: st.switches[i].start, pointer: e.pointerId, m };
      try { m.setPointerCapture(e.pointerId); } catch (err) { /* not an active pointer: the drag still follows the track */ } // touch-ok: .lv-track and .lv-mark have touch-action: none (lane.css)
      e.preventDefault();
      for (const x of track.querySelectorAll('.lv-mark')) x.classList.toggle('on', +x.dataset.i === i);
      del.disabled = false;
    });
    track.addEventListener('pointermove', (e) => {
      const d = st.drag;
      if (!d) { if (opts.onScrub && e.buttons === 1) opts.onScrub(timeAt(track, e.clientX, st.duration)); return; }
      if (d.pointer !== e.pointerId) return;
      const t = timeAt(track, e.clientX, st.duration);
      d.moved = d.moved || t !== d.t;
      d.t = t;
      d.m.style.left = pct(t, st.duration);
    });
    const end = (e) => {
      const d = st.drag;
      if (!d || d.pointer !== e.pointerId) return;
      st.drag = null;
      if (d.moved) commit(SEG.move(st.switches, d.i, d.t));
      else render();
      e.stopPropagation();
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', () => { if (st.drag) { st.drag = null; render(); } });
    track.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel >= 0) { e.preventDefault(); const i = st.sel; st.sel = -1; commit(SEG.remove(st.switches, i)); }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && st.sel >= 0) {
        e.preventDefault();
        const step = (e.shiftKey ? 1 : SNAP) * (e.key === 'ArrowLeft' ? -1 : 1);
        commit(SEG.move(st.switches, st.sel, st.switches[st.sel].start + step));
      }
    });
    track.tabIndex = 0;

    function render() {
      if (st.drag) return; // no re-render while a marker is held: it would drop the pointer capture
      const dur = Math.max(st.duration, 0.1);
      const segs = SEG.norm(st.switches, dur);
      const kids = [];
      segs.forEach((s) => {
        const name = T.label(s.layout);
        kids.push(el('div', { class: 'lv-band', style: `left:${pct(s.start, dur)};width:${pct(s.end - s.start, dur)}`, title: word('band_tip', { name, start: sec(s.start), end: sec(s.end) }) },
          el('span', { class: 'lv-bl', text: word('band', { name, n: s.slots }) })));
      });
      st.switches.forEach((s, i) => {
        if (st.drag && st.drag.i === i) return; // the dragged marker is drawn by the drag
        kids.push(mark(s, i));
      });
      if (st.drag) kids.push(mark({ start: st.drag.t, layout: st.switches[st.drag.i].layout }, st.drag.i, st.drag.m));
      kids.push(el('div', { class: 'lv-ph', style: `left:${pct(st.playhead, dur)}` }));
      track.replaceChildren(...kids);
      del.disabled = st.sel < 0;
      const hasSw = st.switches.length > 0;
      hint.textContent = word(hasSw ? 'hint' : 'hint_none');
    }
    function mark(s, i, node) {
      const sel = i === st.sel;
      const b = node || el('button', { type: 'button', class: 'lv-mark' + (sel ? ' on' : ''), tabindex: '-1', 'data-i': String(i) });
      b.setAttribute('aria-label', word('mark', { name: T.label(s.layout), t: sec(s.start) }));
      b.className = 'lv-mark' + (sel ? ' on' : '') + (st.drag && st.drag.i === i ? ' drag' : '');
      b.dataset.i = String(i);
      b.style.left = pct(s.start, Math.max(st.duration, 0.1));
      b.title = word('mark_tip', { name: T.label(s.layout), t: sec(s.start) });
      if (!node) b.textContent = String(i + 1);
      return b;
    }
    function fillLayouts() {
      const list = typeof st.layouts === 'function' ? st.layouts() : st.layouts, keep = select.value;
      select.replaceChildren(...list.map(([v, l]) => el('option', { value: v, text: l })));
      if (list.some(([v]) => v === keep)) select.value = keep;
    }
    return {
      update(o = {}) {
        if (o.duration != null) st.duration = +o.duration || 10;
        if (o.switches) st.switches = SEG.clean(o.switches);
        if (o.playhead != null) st.playhead = +o.playhead || 0;
        if (o.layouts) { st.layouts = o.layouts; fillLayouts(); }
        if (st.sel >= st.switches.length) st.sel = -1;
        render();
      }
    };
  };
})();
