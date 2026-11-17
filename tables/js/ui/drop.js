/* Slop Tables: the one way files come in (shared/intake, spec 'tables'). A drop on the window or the strip under the
 * sheet tabs (hidden at rest, shown only while files are read), File ▸ Open from Slop Drive (Ctrl+O), Open file from this
 * device, ?drive=<id> (another app's Send to…, Drive's New ▸ spreadsheet) and a PWA launch all reach one reader: a Slop
 * Drive record opens through openRecord (its tab stays linked to it), a file from this device through openFile. .stab,
 * .xlsx, .xlsm, .ods, .csv and .tsv; each in its own tab. The reader waits for the tabs (storage.js launch). A drag of the
 * shared copy buffer (not a file) is still the paste of ui/buffer.js. Templates (.stabt) are a part of their own
 * ('tables.template', ui/templates.js). */
import { $ } from './state.js';
import { openFile, openRecord, whenTabs, OPEN_EXTS, SHEET_TYPES } from './storage.js';
import { MIME } from '../io/native.js';
import { t } from '../i18n.js';

const ACCEPT = { types: [MIME, ...SHEET_TYPES, 'text/csv', 'text/tab-separated-values', 'application/vnd.ms-excel'], exts: OPEN_EXTS, get noun() { return t('tables.drop.noun'); }, allowEmpty: true }; // a zero-byte .stab from Drive's New menu is a blank workbook
async function read(file, ctx) {
  const rec = ctx.drive && ctx.drive.record;
  const ok = rec ? await openRecord(Object.assign({}, rec, { blob: file })) : await openFile(file);
  if (!ok) throw new Error('could not be opened');
  return file.name;
}
let drop = null;
export function wireDrop() {
  const SI = window.SlopIntake;
  if (!SI) return null;
  SI.register({ id: 'tables', accept: ACCEPT, limit: 10, process: read, before: () => whenTabs() });
  const D = window.SlopDrop, zone = $('dropZone');
  if (!D || !zone) return null;
  drop = D.attach(zone, {
    intake: 'tables',
    compact: true,
    label: t('tables.drop.label'),
    targets: [$('grid')],
  });
  const msg = zone.querySelector('.sd-msg');
  if (msg) msg.dataset.i18n = 'tables.drop.label'; // SlopI18n.apply() follows a language switch
  return drop;
}
export const dropper = () => drop;
