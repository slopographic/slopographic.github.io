/* Slop EML: boot. Lays the page out as the suite's List · View · Panel (shared/frame: the message list, the message, the
 * actions panel), wires the header, the empty state, the body switch, the drop zone and the commands, opens a file sent
 * from Slop Drive (?drive=<id>), then draws the page. Classic script, runs once the page is parsed. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function layout() {
    const fr = window.SlopFrame.mount($('em-frame'), {
      list: $('em-list'), view: $('em-main'), panel: $('em-side'), phone: '(max-width: 900px)', panelLabel: 'eml.app.actions', storageKey: 'eml',
      button: document.querySelector('.smb-tools'), phoneButton: false, width: 300,
    });
    window.EmlView.frame = fr;
    window.EmlSide.init($('em-side'));
    window.EmlList.init({ open: (doc, show) => { if (show) fr.showView(); } });
    $('em-back').addEventListener('click', () => { fr.showList(); const b = document.querySelector('.em-row.em-on .em-row-open'); if (b) b.focus(); });
    $('em-actions').addEventListener('click', () => fr.openSheet());
    $('em-list-actions').addEventListener('click', () => fr.openSheet());
    $('em-atts-chip').addEventListener('click', () => {
      if (fr.isPhone()) fr.openSheet(); else if (!fr.panelShown()) fr.setPanel(true);
      const cur = window.EmlApp.current(), head = cur ? t('eml.side.attachments_n', { n: cur.msg.attachments.length }) : null;
      const sec = [...$('em-side').querySelectorAll('.sf-h')].find((h) => head && h.textContent.startsWith(head));
      if (sec) { sec.scrollIntoView({ block: 'start' }); const b = sec.parentNode.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
    });
  }

  function wire() {
    const pick = () => window.EmlActions.pick();
    $('em-open').addEventListener('click', pick);
    $('em-open2').addEventListener('click', pick);
    $('em-cmd').addEventListener('click', () => { if (window.SlopCmd && SlopCmd.open) SlopCmd.open(); });
    $('em-v-html').addEventListener('click', () => window.EmlApp.setView('html'));
    $('em-v-text').addEventListener('click', () => window.EmlApp.setView('text'));
    $('em-cid').addEventListener('click', () => window.EmlApp.toggleCids());
    /* The one way in (shared/intake, spec 'eml'): .eml files and mailboxes from a drop on the strip or the page, Open
       messages…, the sample, a paste, ?drive=<id> (Slop Drive's Open with) and a PWA launch open in turn (refusals say
       why). A file that is already open is not opened again. A batch of two or more goes to the list, not to tabs. */
    window.SlopIntake.register({
      id: 'eml',
      accept: { types: ['message/rfc822', 'application/mbox'], exts: ['.eml', '.mbox', '.mbx'], noun: 'eml.app.noun' },
      process: async (file, ctx) => {
        if (window.EmlApp.isOpen(file.name, file.size)) throw new Error(t('eml.err.already_open'));
        await window.EmlApp.openFile(file, { pin: ctx.batch.take.length <= 1 });
        return file.name;
      },
    });
    window.SlopDrop.attach($('em-drop'), {
      intake: 'eml',
      targets: [$('em-drop'), $('em-frame')],
      compact: true,
    });
    // The empty page shows a read email and how (SlopDrop's preview); the sample goes through the strip.
    const empty = $('em-empty'), row = empty.querySelector('.em-empty-b'), sample = document.createElement('button');
    const pre = window.SlopDrop.panel.preview({
      picture: { src: '../assets/shots/eml.jpg', alt: t('eml.drop.alt') },
      steps: [t('eml.drop.step1'), t('eml.drop.step2'), t('eml.drop.step3')],
    });
    // drawn once by SlopDrop: marked, so its words follow a language change (shared/i18n apply())
    pre.querySelectorAll('.sd-steps li').forEach((li, i) => { li.dataset.i18n = ['eml.drop.step1', 'eml.drop.step2', 'eml.drop.step3'][i]; });
    const img = pre.querySelector('img');
    if (img) img.dataset.i18nAttr = 'alt:eml.drop.alt';
    empty.insertBefore(pre, row);
    sample.type = 'button'; sample.className = 'sd-sample'; sample.id = 'em-sample'; sample.textContent = t('eml.drop.sample'); sample.dataset.i18n = 'eml.drop.sample';
    sample.addEventListener('click', () => window.SlopIntake.sample([window.SlopSamples.docs.eml()], { to: 'eml' }));
    row.append(sample);
  }

  /** A message or mailbox sent from Slop Drive ("Open with Slop EML"), or a PWA launch: through the intake. */
  function launch() {
    if (window.SlopHub) window.SlopHub.register('eml');
    return window.SlopIntake.launch({ to: 'eml' }).catch(() => null);
  }

  function boot() {
    window.EmlApp.subscribe(() => window.EmlView.render());
    window.EmlCommands.register();
    layout();
    wire();
    window.EmlView.render();
    launch();
    // a language change: the commands' titles, the sort menu, the list, the message and the panel again
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { window.EmlCommands.relang(); window.EmlList.relang(); window.EmlView.render(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { boot(); } catch (e) {
      console.error(e);
      if (window.SlopUI) window.SlopUI.toast(t('eml.err.start', { error: e.message }));
    }
    document.body.classList.add('ready');
  });
})();
