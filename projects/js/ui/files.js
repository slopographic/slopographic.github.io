// Slop Projects files: download the current project as a JSON backup or its tasks as CSV, open a backup (a file
// picker, or a drop on the empty page through SlopDrop), and Try a sample (the sample is a backup file made in the page,
// so it goes the same way a dropped file does). Nothing is uploaded. Exposes window.SlopProjects.files.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI;
  const st = () => NS.state;
  let drop = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function exportJson() {
    const p = st().project;
    if (!p) { UI.toast(t('projects.files.open_first')); return false; }
    const text = JSON.stringify(NS.io.backup(p, st().tasks), null, 2);
    UI.download(new Blob([text], { type: 'application/json' }), NS.io.fileName(p, 'json'));
    return true;
  }

  function exportCsv() {
    const p = st().project;
    if (!p) { UI.toast(t('projects.files.open_first')); return false; }
    UI.download(new Blob(['﻿' + NS.io.csv(p, st().tasks, st().customers)], { type: 'text/csv' }), NS.io.fileName(p, 'csv'));
    return true;
  }

  /** Reads one backup file and adds its project. Throws Error(reason) for SlopDrop's progress row. */
  async function openFile(file) {
    const r = NS.io.readText(await file.text(), () => NS.store.newId(), new Set(st().customers.keys()));
    if (!r.ok) throw new Error(r.message);
    const sample = /^Sample /.test(file.name);
    const b = { project: { ...r.project, ...(sample ? { sample: true } : {}) }, tasks: r.tasks.map((x) => (sample ? { ...x, sample: true } : x)) };
    const ok = await NS.actions.addBundle(b, sample ? t('projects.files.opened_sample', { name: b.project.name }) : t('projects.files.opened', { name: b.project.name, n: b.tasks.length }));
    if (!ok) throw new Error(t('projects.files.not_saved'));
    if (r.notes.length) UI.toast(r.notes.join(' '), 6000);
    return b.project.id;
  }

  /* The one way a backup comes in (shared/intake, spec 'projects'): Open a backup (the menu and the empty page's zone), a
     drop on that zone, the sample and a paste of a .json backup, one at a time. */
  function registerIntake() {
    if (!g.SlopIntake || g.SlopIntake.spec('projects')) return;
    g.SlopIntake.register({ id: 'projects', limit: 1, accept: { types: ['application/json'], exts: ['.json'], noun: 'projects.files.noun' }, process: (file) => openFile(file) });
  }
  async function importFile() {
    registerIntake();
    const r = await g.SlopIntake.pick({ to: 'projects', multiple: false, accept: '.json,application/json' });
    if (r.skipped && r.skipped.length) UI.toast(r.skipped[0].reason, 5000);
    return !!(r.added && r.added.length);
  }

  /** The sample project as a file, dated around today. */
  const sampleFile = () => g.SlopSamples.file('Sample project.json', JSON.stringify(NS.sample(st().today)), 'application/json');   // i18n-ignore: a file name the sample check reads

  async function trySample() {
    registerIntake();
    const r = await g.SlopIntake.sample([sampleFile()], { to: 'projects' });
    if (r.skipped && r.skipped.length) UI.toast(r.skipped[0].reason);
    return !!(r.added && r.added.length);
  }

  /** The drop zone on the empty page: a backup file, or the sample. */
  function mountEmpty() {
    const zone = document.getElementById('pDrop');
    if (!zone || !g.SlopDrop || drop) return;
    registerIntake();
    drop = g.SlopDrop.attach(zone, {
      intake: 'projects', window: false, label: 'projects.files.drop', chooseLabel: 'projects.files.open', multiple: false,
      preview: { steps: ['projects.files.step1', 'projects.files.step2', 'projects.files.step3'] },
      sample: { label: 'projects.files.try', files: () => [sampleFile()] },
    });
  }

  NS.files = { exportJson, exportCsv, importFile, openFile, trySample, sampleFile, mountEmpty };
})(typeof window !== 'undefined' ? window : globalThis);
