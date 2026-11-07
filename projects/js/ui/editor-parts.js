// Two parts of the task editor: the checklist (tick, edit, remove and add items) and "Waits for" (the tasks that must
// finish first; one that would make a loop is refused in plain words). Each returns { el, value() }; nothing is saved
// until the editor's Save. Exposes window.SlopProjects.editorParts.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** The checklist: items [{ text, done }]. */
  function checklist(items) {
    let list = (items || []).map((c) => ({ text: c.text, done: !!c.done }));
    const ul = el('ul', { class: 'pe-check', 'aria-label': t('projects.ed.checklist') });
    const input = el('input', { type: 'text', id: 'peCheckNew', maxlength: 200, placeholder: t('projects.ed.add_item'), 'aria-label': t('projects.ed.new_item'), autocomplete: 'off' });
    const count = el('span', { class: 'note' });
    const draw = () => {
      ul.replaceChildren(...list.map((c, i) => el('li', { class: c.done ? 'is-done' : '' },
        el('input', { type: 'checkbox', checked: c.done, 'aria-label': t('projects.ed.done_item', { text: c.text }), onchange: (e) => { c.done = e.target.checked; draw(); } }),
        el('input', { type: 'text', value: c.text, maxlength: 200, 'aria-label': t('projects.ed.item_n', { n: String(i + 1) }), oninput: (e) => { c.text = e.target.value; } }),
        el('button', { type: 'button', class: 'pe-x', 'aria-label': t('projects.ed.remove', { text: c.text }), onclick: () => { list.splice(i, 1); draw(); input.focus(); } }, '×'))));
      const done = list.filter((c) => c.done).length;
      count.textContent = list.length ? t('projects.ed.done_of', { done: String(done), n: String(list.length) }) : '';
    };
    const add = () => { const v = input.value.trim(); if (!v) return; if (list.length >= 100) { UI.toast(t('projects.ed.max_items')); return; } list.push({ text: v, done: false }); input.value = ''; draw(); input.focus(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } });
    draw();
    return {
      el: el('div', { class: 'pe-sec' }, el('div', { class: 'pe-sec-h' }, el('span', null, t('projects.ed.checklist')), count), ul,
        el('div', { class: 'inline' }, input, el('button', { type: 'button', class: 'btn small', onclick: add }, t('projects.ed.add')))),   // i18n-ignore: class names
      value: () => list.map((c) => ({ text: String(c.text || '').trim(), done: !!c.done })).filter((c) => c.text),
    };
  }

  /** "Waits for": the deps of task `id` among the project's tasks (id is null for a new task). */
  function waitsFor(id, deps, tasks) {
    let cur = (deps || []).filter((d) => tasks.some((task) => task.id === d));
    const others = tasks.filter((x) => x.id !== id);
    const chips = el('div', { class: 'pe-deps' });
    const pick = el('select', { id: 'peDepAdd', 'aria-label': t('projects.ed.dep_add_aria') });
    const name = (d) => (tasks.find((x) => x.id === d) || {}).title || '';
    const draw = () => {
      chips.replaceChildren(...(cur.length ? cur.map((d) => el('span', { class: 'chip dep' }, name(d),   // i18n-ignore: class names
        el('button', { type: 'button', class: 'pe-x', 'aria-label': t('projects.ed.dep_stop', { title: name(d) }), onclick: () => { cur = cur.filter((x) => x !== d); draw(); } }, '×')))
        : [el('span', { class: 'note' }, t('projects.ed.dep_none'))]));
        pick.replaceChildren(el('option', { value: '' }, t('projects.ed.dep_pick')),
        ...others.filter((x) => !cur.includes(x.id)).sort((a, b) => a.title.localeCompare(b.title)).map((x) => el('option', { value: x.id }, x.title)));
    };
    pick.addEventListener('change', () => {
      const v = pick.value;
      if (!v) return;
      const r = id ? NS.deps.check(tasks, id, [...cur, v]) : { ok: true, value: [...cur, v] };
      if (!r.ok) { UI.toast(r.message, 5000); pick.value = ''; return; }
      cur = r.value;
      draw();
      pick.focus();
    });
    draw();
    const waiting = id ? NS.deps.successors(tasks, id) : [];
    return {
      el: el('div', { class: 'pe-sec' }, el('div', { class: 'pe-sec-h' }, el('span', null, t('projects.ed.waits'))), chips, pick,
        waiting.length ? el('p', { class: 'note' }, t('projects.ed.waiting', { names: waiting.map((x) => x.title).join(', ') })) : null),
      value: () => cur.slice(),
    };
  }

  NS.editorParts = { checklist, waitsFor };
})(typeof window !== 'undefined' ? window : globalThis);
