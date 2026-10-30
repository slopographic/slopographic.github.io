/* Slop Transcribe: the Language and model button, the dialog behind it (shared/models/chooser.js, the speech family) and the actions of the
 * line under a transcript (models.js drawSuggestion): change the language, transcribe again with a better model (downloaded
 * first when it is not on this device: the button names it, its maker and its size), use it from now on for the language.
 * Transcribing again replaces the text; when the person corrected it, they are asked first.
 *   wireChoice({ queue, run, draw, say, catalog, manager, ui, prefs }) -> { choice, drawButton(), drawSuggest(item), refresh() } */
import { createChoice, drawSuggestion } from './models.js';
import { openModelChooser } from '../../shared/models/chooser.js';
import { speechFamily } from '../../shared/speech/family.js';
import { languageName } from './languages.js';
import { tr } from './words.js';

export function wireChoice({ queue: q, run, draw, say, catalog: C, manager: M, ui: UI, prefs }) {
  const $ = (id) => document.getElementById(id);
  const states = new Map();
  let upgrading = null;   // { id (item), model, ctrl, text }
  const status = async (id) => { const s = await M.status(id); states.set(id, s); return s; };
  const installed = (id) => /^(installed|update|bundled)$/.test(states.get(id) || '');
  const choice = createChoice({ prefs, catalog: C, status });

  async function refresh() { for (const m of C.MODELS) await status(m.id); draw(); }
  function drawButton() { $('trModel').textContent = choice.label() + ' ▾'; }
  function drawSuggest(item) {
    drawSuggestion($('trSuggest'), item, { catalog: C, installed, preferred: prefs.preferred, act, busy: upgrading && item && upgrading.id === item.id ? upgrading : null });
  }

  /** The dialog, from the button (for the next files) or from a transcript (then that file is read again with the choice). */
  async function dialog(item) {
    const language = item ? item.language : choice.language;
    const model = item ? item.model || C.QUICK : choice.model || await choice.chooseFor(choice.language);
    return openModelChooser({
      family: speechFamily(C), language, model, pinned: choice.pinned, installer: M, ui: UI, storageHref: '../settings/#storage',
      onChoose: (c) => {
        choice.set(c);
        drawButton();
        refresh();
        if (item) again(item, { model: c.model, language: c.language === 'auto' ? null : c.language });
      },
    });
  }
  /** Asks before corrections are replaced. */
  async function keepEdits(item) {
    if (item.text == null) return true;
    return UI.confirm(tr('transcribe.model.again_q', 'Transcribe again?'), tr('transcribe.model.again_body', 'The new transcript replaces the text, and the corrections you made to it are lost.'), tr('transcribe.model.again', 'Transcribe again'));
  }
  async function again(item, want) {
    if (!(await keepEdits(item))) return;
    if (q.redo(item.id, want)) run();
  }
  async function act(kind, item, model) {
    if (kind === 'choose') { dialog(item); return; }
    if (kind === 'prefer') { prefs.prefer(item.language, model.id); say(tr('transcribe.model.prefer_said', '{model} will read {name} from now on.', { model: model.name, name: languageName(item.language) })); draw(); return; }
    if (kind === 'cancel') { if (upgrading) upgrading.ctrl.abort(); return; }
    if (kind === 'redo') { again(item, { model: model.id, language: item.language }); return; }
    if (kind === 'upgrade') {
      if (upgrading || !(await keepEdits(item))) return;
      upgrading = { id: item.id, model, ctrl: new AbortController(), text: tr('transcribe.model.downloading', 'Downloading {model}…', { model: model.name }) };
      draw();
      try {
        await M.install(model.id, (p) => {
          upgrading.text = tr('transcribe.model.downloading_pct', 'Downloading {model}: {pct}%', { model: model.name, pct: p.total ? Math.floor((p.loaded / p.total) * 100) : 0 });
          const t = $('trSuggest').querySelector('.tr-upgrade-busy');
          if (t) t.textContent = upgrading.text;
        }, { signal: upgrading.ctrl.signal });
        upgrading = null;
        await refresh();
        item.text = null;   // the person agreed above
        if (q.redo(item.id, { model: model.id, language: item.language })) run();
      } catch (e) {
        upgrading = null;
        say(e && e.name === 'AbortError' ? tr('transcribe.model.cancelled', 'Download cancelled. Nothing was stored.') : tr('transcribe.model.not_installed', '{model} was not installed: {error}. Nothing was stored.', { model: model.name, error: (e && e.message) || String(e) }));
        draw();
      }
    }
  }

  $('trModel').addEventListener('click', () => dialog(null));
  drawButton();
  refresh();
  return { choice, drawButton, drawSuggest, refresh, dialog };
}
