/* SlopLabel — ui/hub: Slop Hub integration. Announces the app, takes what the page was opened with (?drive=<id> from
 * another app, a PWA launch: through the intake, ui/intake.js), saves the project to Slop Drive, and File → Send to (the
 * one builder, SlopOuttake: the PDF and the PNG of the current label). Off under file:// and offline. */
'use strict';

const hubAvailable = () => !!window.SlopHub && location.protocol !== 'file:' && !isOfflineBuild();
async function hubBoot() {
  if (hubAvailable()) { try { SlopHub.register('label'); } catch (e) { /* bus unavailable */ } }
  const r = await launchLabel();
  return !!(r && r.added && r.added.length);
}
/** File ▸ Save: writes the project back to the linked Drive file, or asks for a folder the first time. */
async function saveProjectToDrive() {
  const name = safeName(App.doc.name, '.sloplabel'), blob = projectBlob(App.doc);
  if (!App.driveId) { const id = await SlopHub.saveToDrive(blob, name, { from: 'label' }); if (!id) return; linkDrive(id); }
  else if (!(await SlopHub.update(App.driveId, { blob, name, type: blob.type }))) await SlopHub.put(blob, { id: App.driveId, name, from: 'label' });
  markSaved();
  status(LT('label.hub.saved', { name }), '', 2500);
}
const pdfBlob = async () => new Blob([await pdfBytes({ prompts: App.prompts })], { type: 'application/pdf' });
/** File → Send to ▸ rows: the PDF to the apps that take PDFs (and Slop Workflows), the PNG to the apps that take only
 *  pictures, and Save PDF / PNG to Slop Drive. */
function sendToItems() {
  if (!hubAvailable() || !window.SlopOuttake) return [];
  const pdfApps = SlopHub.appsAccepting('application/pdf').map((a) => a.id); // outtake-ok: the ids only, left out of the PNG list
  const tag = (items, kind) => items.map((i) => Object.assign(i, {
    label: i.save ? LT('label.hub.save_kind', { kind }) : i.plain ? i.label + ' (' + kind + ')' : i.label,
  }));
  const pdf = SlopOuttake.items({ get: pdfBlob, name: () => fileBase() + '.pdf', type: 'application/pdf', from: 'label', verb: 'ui.outtake.send_to' });
  const png = SlopOuttake.items({ get: () => labelPNGBlob(), name: () => fileBase() + '.png', type: 'image/png', from: 'label', verb: 'ui.outtake.send_to', exclude: pdfApps })
    .filter((i) => i.plain || i.save); // the workflow items are there once, with the PDF
  const save = (items) => items.filter((i) => i.save), send = (items) => items.filter((i) => !i.save);
  const p = tag(pdf, 'PDF'), g = tag(png, 'PNG');
  return [...send(p), ...send(g), '-', ...save(p), ...save(g)];
}
