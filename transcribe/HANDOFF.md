# Slop Transcribe: handoff

Voice, MP3 or video to text, on the device. `transcribe/index.html`, ES modules in `transcribe/js/`.

| File | What it does |
|---|---|
| `js/app.js` | Wires the page: SlopDrop (drop, Choose files), the recorder, the language, Transcribe and Stop, the transcript box, exports, Slop Drive and Slop Docs. Sets `window.SlopTranscribe = { queue, engine, add, run, select, selected }`. |
| `js/queue.js` | The files and their results, read one after another through an engine that is passed in (`createQueue({ engine, onChange })`). Pure apart from the engine. 2 hours at most per file. |
| `js/record.js` | Microphone recording with MediaRecorder; the file joins the queue like any other. Plain reasons when the microphone is blocked or missing. |
| `js/exports.js` | TXT, Word (shared/office/docx.js), SRT and WebVTT. Text and Word use the person's corrections; subtitles keep the timed segments. |
| `js/ai-commands.js` | The SlopCmd commands with arguments (palette, Slop AI panel via the header's AI button, WebMCP, macros): `tr.add-from-drive`, `tr.transcribe` (language, model, file; stops on `ctx.signal`), `tr.stop`, `tr.get-transcript` (text/SRT/VTT as the value), `tr.save-to-drive`, `tr.correct`, `tr.select`, `tr.remove`, `tr.clear`; `SlopCmd.provide({ state, checkpoint })` (the rollback restores corrections only). Test: `tests/transcribe/ai-commands.test.html`. |
| `js/view.js` | Draws the list and the transcript pane. |
| `js/languages.js` | Re-exports `shared/speech/languages.js`: the 99 Whisper languages (code as in the `<|code|>` token, English name; Javanese is `jw`), `filterLanguages` (the dialog's search). |
| `js/models.js` | `createChoice` (the language and model for the next files: Detect automatically + the quick model by default; a pinned language; the preferred model per language once installed), `suggestionOf` / `drawSuggestion` (the line under a transcript). |
| `js/choose.js` | The Language and model button, the shared chooser behind it (`shared/models/chooser.js`, speech family) and the actions of the line under a transcript: change the language, transcribe again with the better model (downloaded first, the button names model, maker and size), use it from now on for that language. |
| `../aitools/transcript.js` | `SlopTranscript`: the one place for transcript formats, shared with the AI Tools Speech page. |

The engine is Slop AI Tools' Whisper (`aitools/common.js`: `ensure(model)`, `audioSamples`, `call('detect')`,
`call('transcribe', { model })`), so the models are the same downloads as the Speech page. The quick model (Whisper tiny) is
offered by `SlopAITools.gate('speech')`; the others (Whisper base, small, base.en, small.en, KB-Whisper base and small for
Swedish, NB-Whisper base and small for Norwegian; `aitools/speech-models.js`, files on slopographic/cdn) only from the
Language and model dialog or the offer under a transcript.

Start fast, upgrade on request: each new file is read by the quick model, which first finds the language of its first
30 s (`detect`, cached on the item); the line under the transcript says "Detected Swedish (92%) · read with Whisper tiny"
and offers the first model the dialog ranks for that language ("For better accuracy: KB-Whisper small (KBLab, National
Library of Sweden), 248 MB" → Transcribe again in higher quality), or, once it is installed, "Use it from now on for
Swedish". Transcribing again replaces the text; if the person corrected it, a confirm asks first. Nothing is remembered
unless asked: "Always use Swedish" in the dialog pins the language (otherwise each new file goes back to Detect
automatically), "Use it from now on" sets the model for that language (`shared/models/prefs.js`). The SlopFlow picture
(shared/ui/flow.js) shows the file kind to TXT and runs while transcribing.

Tests: `tests/transcribe/units.test.html` (formats, queue with a fake engine, exports read back as .docx, recorder with a fake
microphone), `tests/transcribe/models.test.html` (detection once per file, the choice, the offer matching the ranking, redo,
remembered choices), `tests/transcribe/app.test.html` (the page with a fake engine at 1280 and 390 px: detection shown, the
upgrade downloads and reads again, the per-language preference). The real models: `tests/aitools/whisper-real.test.html`.

Limits: Whisper tiny is fast but makes mistakes on names and noisy audio (KB-Whisper base reads Swedish far better at
about the same speed; the small models are about three times slower); there is no speaker separation and no live
(streaming) dictation. No i18n keys yet (the app family has none).
