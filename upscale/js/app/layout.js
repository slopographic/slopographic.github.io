/* Slop Upscale: the page as the suite's List · View · Panel (shared/frame). The files on the left (only with two or more),
 * the picture in the middle, and on the right the settings (Size, Model, Output) with the Upscale button stuck to the
 * panel's foot, and the result's actions (Download, Save to Slop Drive, Open in…). Phones: the list is the page, the panel
 * is a bottom sheet whose foot (the Upscale button) always shows. Runs as soon as it loads (the markup is above it), so
 * the first paint already has the panel. The controller (app/main.js) calls paint() after every change. Classic script.
 *   SlopUpscale.layout = { frame, panel, paint(), select(item) } */
(function (g) {
  'use strict';
  const U = g.SlopUpscale, $ = (id) => document.getElementById(id), t = U.t;
  const A = () => U.app, S = () => U.app.S;
  const fr = g.SlopFrame.mount($('up-frame'), {
    list: $('up-list'), view: $('up-stage-wrap'), panel: $('up-panel'), phone: '(max-width: 900px)', panelLabel: 'ui.settings',
    storageKey: 'upscale', button: document.querySelector('.up-tools'), phoneButton: false, width: 300, min: 260,
  });
  const groups = [...$('up-panel').querySelectorAll('.up-group')];
  const panel = g.SlopFrame.panel($('up-panel'), { title: t('upscale.panel.title') });
  $('up-back').addEventListener('click', () => fr.showList());

  /** The footer's buttons: Upscale (this one) or Upscale N pictures (every one not done), and Cancel while running. */
  function primary() {
    const s = S(), todo = s.items.filter((it) => !it.out);
    const many = todo.length > 1, all = todo.every((it) => it.kind === 'image');
    const label = many ? t(all ? 'upscale.panel.run_pictures' : 'upscale.panel.run_files', { n: todo.length }) : t('upscale.panel.run');
    return [{ el: $('up-run'), label, hidden: s.busy, disabled: !s.item, run: () => A().run() }, { el: $('up-cancel'), hidden: !s.busy, run: () => A().cancel() }];
  }

  function resultActions() {
    const s = S(), it = s.item, done = !!(it && it.out), D = U.drive, O = U.output;
    const doneAll = s.items.filter((x) => x.out);
    return [
      { el: $('up-download'), label: t('ui.download'), disabled: !done || s.busy, run: O.download },
      doneAll.length > 1 ? { id: 'up-zip', label: t('upscale.panel.zip', { n: doneAll.length }), disabled: s.busy || !g.SlopZip, run: O.downloadAll } : null,
      { el: $('up-save'), label: t('upscale.panel.save'), disabled: !done || s.busy || !D.available(), run: O.saveDrive },
      { id: 'up-openin', label: t('upscale.panel.open_in'), disabled: !done || s.busy || !g.SlopOuttake, menu: () => O.openInItems() },
      { el: $('up-clear'), label: s.items.length > 1 ? t('upscale.panel.remove') : t('upscale.panel.clear'), disabled: !it || s.busy, run: () => A().remove(it) },
    ];
  }

  let shape = '';
  /** Redraw what changed: the list, the title, the result actions (only when their state changed: the settings are not
   * moved while someone is in them) and the footer (always; it is small). */
  function paint() {
    const s = S(), it = s.item;
    const now = JSON.stringify([s.items.length, s.items.map((x) => (x.out ? 2 : x.running ? 1 : 0)), s.busy, it && it.id, U.drive.available()]);
    if (now !== shape) {
      shape = now;
      panel.setTitle(it ? it.name : t('upscale.panel.title'));
      panel.render([
        ...groups.map((gr) => ({ title: t(gr.dataset.key), key: gr.dataset.title, settings: gr })),
        { title: t('upscale.panel.result'), key: 'result', actions: resultActions() },
      ]);
      list();
    }
    panel.footer(primary(), { note: t('upscale.panel.keys_note'), more: t('ui.settings') });
  }

  function list() {
    const s = S(), rows = $('up-rows');
    fr.setList(s.items.length > 1);
    $('up-count').textContent = t('upscale.list.count', { n: s.items.length, done: s.items.filter((x) => x.out).length });
    $('up-back').textContent = t('upscale.list.back', { n: s.items.length });
    rows.replaceChildren(...s.items.map((x) => {
      const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('span'), meta = document.createElement('span');
      li.className = 'up-row' + (x === s.item ? ' up-on' : '');
      b.type = 'button'; b.className = 'up-row-open';
      if (x === s.item) b.setAttribute('aria-current', 'true');
      name.className = 'up-row-name'; name.textContent = x.name;
      meta.className = 'up-row-meta';
      meta.textContent = t('upscale.list.meta', { w: String(x.w), h: String(x.h), state: t(x.out ? 'upscale.list.done' : x.running ? 'upscale.list.running' : 'upscale.list.waiting') });
      b.append(name, meta);
      b.addEventListener('click', () => { if (S().busy && x !== S().item) { A().toast(t('upscale.run.wait')); return; } A().select(x); fr.showView(); });
      li.append(b);
      return li;
    }));
  }

  // a language change: the panel's sections, its foot and the list again, in the new language
  U.words.on(() => { panel.setTitle(S().item ? S().item.name : t('upscale.panel.title')); shape = ''; paint(); });
  U.layout = { frame: fr, panel, paint, groups };
})(typeof window !== 'undefined' ? window : globalThis);
