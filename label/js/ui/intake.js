/* SlopLabel — ui/intake: the one way files come in (shared/intake, spec 'label'). A drop on the app or the strip, the
 * strip's Choose files, File ▸ Open (Ctrl+O), Insert image, Import CSV / Excel / JSON, the Slop Drive pickers (project,
 * image, data), a pasted picture, ?drive=<id> (another app's Send to…) and a PWA launch all call SlopIntake.take and reach
 * one reader. The mode says what a file is for: 'image' places it (data.props: where), 'data' makes it the data source;
 * otherwise openFiles decides from the file (a project opens in a tab, ZPL is imported, a picture is placed, a table is
 * data). A picture dropped on the stage lands where it was dropped. Parts with files of their own: 'label.replace'
 * (Replace image…), 'label.configs' (Configs ▸ Import…), 'label.zpl-text' (Import ZPL ▸ Open file…). */
'use strict';

const LABEL_RULES = {
  // a known type decides (the extension counts only when the browser gives none): pictures, text, JSON and spreadsheets
  types: ['image/*', 'text/*', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  exts: ['.sloplabel', '.json', '.zpl', '.prn', '.txt', '.csv', '.tsv', '.tab', '.xlsx', '.svg'],
  get noun() { return LT('label.intake.a_label_picture_or_data'); },
};
const OPEN_ACCEPT = '.sloplabel,.json,.zpl,.prn,.txt,.csv,.tsv,.xlsx,image/*,.svg';
const IMAGE_ACCEPT = 'image/*,.svg';
const DATA_ACCEPT = '.csv,.tsv,.tab,.txt,.json,.xlsx,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DRIVE_DATA = ['text/csv', 'text/tab-separated-values', 'text/plain', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

/** Where a picture dropped on the stage goes (null when it was not dropped on the stage). */
function dropPlace(at) {
  const hit = at && document.elementFromPoint(at.x, at.y);
  if (!hit || !hit.closest || !hit.closest('#stage')) return null;
  const [x, y] = toMMpt({ clientX: at.x, clientY: at.y });
  return { x: round(x, 2), y: round(y, 2) };
}
/** The one reader. */
async function readLabelFile(file, ctx) {
  const isImage = /^image\//.test(file.type) || /\.svg$/i.test(file.name || '');
  if (ctx.mode === 'image' || (isImage && ctx.source === 'drop')) {
    const props = (ctx.data && ctx.data.props) || (ctx.source === 'drop' && dropPlace(ctx.at)) || {};
    if (!(await insertImageFile(file, props))) throw new Error('could not be placed');
  } else if (ctx.mode === 'data') await importDataDialog(file);
  else await openFiles([file], { driveId: ctx.drive ? ctx.drive.id : null });
  return file.name;
}
function registerLabelIntake() {
  const SI = window.SlopIntake;
  if (!SI) return;
  SI.register({ id: 'label', accept: LABEL_RULES, driveAccept: ['application/json'], process: readLabelFile });
  SI.register({ id: 'label.replace', main: false, paste: false, accept: { types: ['image/*'], exts: ['.svg'], noun: 'a picture' }, limit: 1,
    process: async (f) => {
      const a = await addImageAsset(App.doc, f);
      await preloadImages(App.doc);
      editSel((x) => { x.asset = a.id; x.aspect = a.aspect; }, LT('label.intake.replace_image'));
      pruneAssets(App.doc);
      return f.name;
    } });
  SI.register({ id: 'label.configs', main: false, paste: false, accept: { types: ['application/json'], exts: ['.json'], noun: 'label.intake.a_configs_file' }, limit: 1,
    process: async (f) => { importConfigsText(await f.text()); return f.name; } });
  SI.register({ id: 'label.zpl-text', main: false, paste: false, toast: false, accept: { exts: ['.zpl', '.prn', '.txt'], noun: 'label.intake.a_zpl_file' }, limit: 1,
    process: (f) => f.text() });
}
registerLabelIntake();

/* The entry points (menus, commands, buttons): sources of the intake. */
const pickLabel = (o) => SlopIntake.pick(Object.assign({ to: 'label' }, o));
function openFilesDialog() { return pickLabel({ accept: OPEN_ACCEPT, multiple: true }); }
function pickImage(props) { return pickLabel({ mode: 'image', multiple: false, accept: IMAGE_ACCEPT, data: { props: props || {} } }); }
function pickData() { return pickLabel({ mode: 'data', multiple: false, accept: DATA_ACCEPT }); }
function replaceImage() { return SlopIntake.pick({ to: 'label.replace', multiple: false, accept: IMAGE_ACCEPT }); }
async function pickZPLText() { const r = await SlopIntake.pick({ to: 'label.zpl-text', multiple: false, accept: '.zpl,.prn,.txt' }); return r.added[0] ? r.added[0].value : null; }
function openProjectDrive() { return SlopIntake.fromDrive({ to: 'label', accept: ['application/json'], title: LT('label.intake.open_label_from_slop_drive') }); }
function imageFromDrive() { return SlopIntake.fromDrive({ to: 'label', mode: 'image', accept: ['image/*'], title: LT('label.intake.insert_image_from_slop_drive') }); }
function dataFromDrive() { return SlopIntake.fromDrive({ to: 'label', mode: 'data', accept: DRIVE_DATA, title: LT('label.intake.data_from_slop_drive') }); }
/** What the page was opened with (?drive=<id>, a PWA launch). */
function launchLabel() { return SlopIntake.launch({ to: 'label' }); }
function attachLabelDrop() {
  window.SlopDrop.attach($('lbDrop'), { intake: 'label', compact: true, targets: [$('app')] });
}
