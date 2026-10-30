// The task panel: a task opens in the panel on the right of the board, timeline or list (the suite rule, shared/frame/
// HANDOFF.md: details in the right panel, the main button at its foot), not in a dialog. SlopFrame: resized on its edge and
// kept; Escape or Cancel closes it. On a phone it is a bottom sheet whose footer (Task, Cancel, Save) stays on screen.
//   NS.taskPanel.show({ title, body, buttons: [{ label, primary?, danger?, act? }] })   act() returning false keeps it open
//   NS.taskPanel.close()   NS.taskPanel.isOpen()
// Classic script, after shared/frame (frame.js, panel.js) and before js/ui/editor.js.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const doc = g.document;
  let fr = null, p = null, wrap = null, open = false;
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);

  function mount() {
    if (fr || !g.SlopFrame) return !!fr;
    const views = ['view-board', 'view-timeline', 'view-list'].map((id) => doc.getElementById(id));
    wrap = doc.createElement('div');
    wrap.className = 'pj-work';
    const view = doc.createElement('div');
    view.className = 'pj-views';
    const panel = doc.createElement('aside');
    panel.className = 'pj-task';
    views[0].before(wrap);
    view.append(...views);
    wrap.append(view, panel);
    fr = g.SlopFrame.mount(wrap, { view, panel, panelLabel: 'projects.ed.task', storageKey: 'projects-task', app: 'projects', phoneButton: false, command: false,
      width: 380, min: 300, max: 640 });
    p = g.SlopFrame.panel(panel, { title: t('projects.ed.task') });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.preventDefault(); close(); } });
    return true;
  }

  function close() {
    if (!fr) return;
    open = false;
    wrap.classList.remove('pj-task-open');
    p.footer([]);
    p.render([]);
    fr.closeSheet();
  }

  function show(o) {
    if (!mount()) return null;
    open = true;
    wrap.classList.add('pj-task-open');
    p.setTitle(o.title);
    p.render([{ key: 'task', settings: [o.body] }]);
    p.footer(o.buttons.map((b, i) => ({ id: 'pjTask' + i, label: b.label, primary: !!b.primary, run: async () => {
      if (b.act && (await b.act()) === false) return;
      close();
    } })), { more: t('projects.ed.task') });
    if (fr.isPhone()) fr.openSheet();
    const first = o.body.querySelector('input, textarea, select');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    return { close };
  }

  NS.taskPanel = { show, close, isOpen: () => open };
})(typeof window !== 'undefined' ? window : globalThis);
