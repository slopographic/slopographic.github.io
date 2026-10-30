/* Slop Compare: boot. The suite's View · Panel layout (shared/frame, SlopFrame): the two sides and the result in the middle,
 * the settings on the right with Compare and the report's actions at the panel's foot (a bottom sheet on phones); the
 * header (SlopAppBar), the one way in (SlopIntake spec 'diff': Open…, Slop Drive…, a drop on a side or the zone, a paste,
 * ?drive=, a PWA launch, the sample) and the commands (commands.js). Exposes window.SlopCompare for the commands, the
 * assistant and the tests. ES module. */
import { S, on, setSide, firstEmpty, filled } from './state.js';
import * as slots from './slots.js';
import * as view from './view.js';
import * as panelUI from './panel.js';
import * as ex from './export.js';
import { compareSides, sideKind } from '../io/files.js';
import { kindOf } from '../core/kind.js';
import { sample } from './samples.js';
import { init as initCommands } from './commands.js';
import { t, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const toast = (m) => window.SlopUI.toast(m, 4000);
let bar = null, frame = null, side = null, settings = null, zone = null, run = 0, shownKind = undefined;

/** Compares the two sides now; resolves the result (or null with S.error set). */
async function compare({ quiet = false } = {}) {
  if (!filled('a') || !filled('b')) {
    S.result = null; S.error = quiet ? '' : t('diff.app.add_first', { side: !filled('a') ? 'A' : 'B' });
    view.render(); sync(); return null;
  }
  const mine = ++run;
  S.busy = true; sync();
  try {
    const r = await compareSides(S.sides.a, S.sides.b, S.opts);
    if (mine !== run) return S.result;
    S.result = r; S.error = ''; S.cur = -1;
  } catch (e) {
    if (mine !== run) return null;
    S.result = null; S.error = e.message;
  } finally { if (mine === run) S.busy = false; }
  view.resetPage();
  view.render(); sync();
  if (S.result && frame.isPhone()) frame.showView();
  return S.result;
}

/** The header, the panel's sections (when what is compared changes) and its footer (every time). */
function sync() {
  const has = !!S.result, any = filled('a') || filled('b');
  if (zone) zone.empty(!any);
  bar.setActions([{ id: 'open', label: t('diff.app.open'), icon: 'open', onClick: () => window.SlopIntake.pick({ to: 'diff' }) }]);
  bar.setMenu([{ id: 'sample', label: t('diff.app.sample'), onClick: loadSample }, { id: 'clear', label: t('diff.app.clear_both'), disabled: !any, onClick: clearAll }]);
  const kind = has ? S.result.kind : null;
  if (kind !== shownKind) {
    shownKind = kind;
    const result = has ? [{ title: t('diff.panel.report'), key: 'report', actions: [
      { id: 'df-drive', label: t('diff.app.to_drive'), run: saveReport },
      { id: 'df-openin', label: t('diff.app.open_in'), menu: () => ex.openInItems('html') }] }] : [];
    side.render(settings.sections(kind).concat(result));
  }
  side.footer([
    { id: 'df-compare', label: S.busy ? t('diff.app.comparing') : t('diff.app.compare'), primary: true, disabled: S.busy || !filled('a') || !filled('b'), run: () => compare() },
    { id: 'df-export', label: t('menu.export'), disabled: !has, menu: () => [
      { label: t('diff.cmd.report_html'), act: () => ex.download('html').catch((e) => toast(e.message)) },
      { label: t('diff.cmd.report_pdf'), act: () => ex.download('pdf').catch((e) => toast(e.message)) },
      { label: t('diff.cmd.patch'), disabled: !ex.canPatch(), act: () => ex.download('patch').catch((e) => toast(e.message)) },
      { label: t('diff.app.report_drive'), act: saveReport }] },
  ], { more: t('ui.settings'), note: t('diff.app.ctrl_enter') });
  panelUI.sync();
  slots.refresh();
}

async function saveReport() {
  try { const id = await ex.saveToDrive('html'); toast(t('diff.app.saved')); return id; } catch (e) { toast(t('diff.app.save_failed', { why: e.message })); return null; }
}
function clearAll() { setSide('a', {}); setSide('b', {}); }
const loadSample = () => window.SlopIntake.sample(sample, { to: 'diff' });

/** The one reader of the intake: one file to the side it was sent to (or the first empty one), two files to A and B. */
function wireIntake() {
  window.SlopIntake.register({
    id: 'diff', limit: 2,
    accept: (f) => (kindOf(f.name, f.type) ? true : t('diff.err.not_kind')),
    driveAccept: ['text/*', 'application/json', 'application/pdf', 'image/*'],
    processAll: async (files, ctx) => {
      const want = ctx.data && ctx.data.side;
      const order = files.length > 1 ? ['a', 'b'] : [want || firstEmpty() || 'b'];
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const v = await slots.readFile(files[i]);
        setSide(order[i], { ...v, drive: files[i].slopDrive ? files[i].slopDrive.id : null });
        out.push(order[i]);
      }
      return out;
    },
    after: () => { if (filled('a') && filled('b')) compare({ quiet: true }); },
  });
  zone = window.SlopDrop.attach($('df-drop'), {
    intake: 'diff', targets: [$('df-drop')], window: true,
    label: 'diff.drop.label',
    hint: 'diff.drop.hint',
    preview: { steps: ['diff.drop.step1', 'diff.drop.step2', 'diff.drop.step3'] },
    sample: { label: 'diff.drop.sample', files: sample },
  });
}

function boot() {
  bar = window.SlopCompareBar;   // js/ui/bar.js, mounted before the shell
  frame = window.SlopFrame.mount($('df-main'), { list: null, view: $('df-work'), panel: $('df-panel'), panelLabel: 'ui.settings',
    storageKey: 'diff', phone: '(max-width: 860px)', phoneButton: false, width: 320, min: 280, max: 480 });
  side = window.SlopFrame.panel($('df-panel'), { title: t('diff.panel.compare') });
  settings = panelUI.build($('df-settings'));
  if (frame.isPhone() && !panelUI.chosen()) S.opts.view = 'unified';   // side by side is cramped on a phone, until chosen
  slots.wire({ onEdit: () => { if (S.result || S.error) compare({ quiet: true }); else sync(); } });
  view.wire();
  wireIntake();
  on((what) => {
    if ((what === 'opts' && (S.result || S.error)) || (what === 'swap' && filled('a') && filled('b'))) compare({ quiet: true });
    else { if (what !== 'opts') view.render(); sync(); }
  });
  sync();
  // a language change: the panel's sections and foot, the header's menu and the result's words again
  onLang(() => { shownKind = undefined; if (S.result || S.error) view.render(); sync(); });
  window.SlopCompare = { S, compare, go: view.go, at: view.at, count: view.count, setSide, clearAll, sideKind, export: ex, frame: () => frame, ready: false };
  initCommands(window.SlopCompare);
  if (window.SlopHub) window.SlopHub.register('diff');
  Promise.resolve(window.SlopIntake.launch({ to: 'diff' })).finally(() => { window.SlopCompare.ready = true; });
}

try { boot(); } catch (e) { console.error(e); if (window.SlopUI) toast(t('diff.app.boot_failed', { why: e.message })); }
document.body.classList.add('ready');
