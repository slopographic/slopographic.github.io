# Slop Recorder (recorder/)

Records the screen (a screen, a window or a tab), the webcam, the microphone, or the screen with the webcam in a corner,
with the screen's sound and/or the microphone where the browser allows; countdown, pause and resume, a live timer, trim
after recording, and saves as WebM (as recorded), MP4 or GIF (the video engine) or WAV (sound only). Out through
SlopOuttake: Download, Save to Slop Drive, Open in… (SlopCut first). In through shared/intake (spec `recorder`): Open
recording…, a drop on the stage, a paste, ?drive= — a recording made before, to trim or save in another format.

## Files

| File | What |
|---|---|
| `js/core/state.js` | the state machine: idle → countdown → recording ⇄ paused → review; elapsed time without pauses. Pure, Node-tested |
| `js/core/webm.js` | EBML: `measure` (length from the blocks), `readDuration`, `setDuration` (writes Info's Duration that MediaRecorder leaves out). Pure |
| `js/core/plan.js` | the choices, `clean`, `needs`, the webcam corner rect, trim clamping, ffmpeg arguments, the recording type, names, clocks. Pure |
| `js/core/support.js` | what a browser can record, in plain words (rows for this browser, a table for the others). Pure |
| `js/capture.js` | getDisplayMedia / getUserMedia, screen + webcam on a canvas (drawn on a worker clock so a background tab keeps going), WebAudio mix |
| `js/record.js` | one session: MediaRecorder on the state machine; the time counts from the recorder's start event; the WebM's length written in |
| `js/output.js` | the file to save: trim by playing the kept part once in real time (captureStream) and recording it again, else ffmpeg; MP4/GIF through `convert/js/core/ffmpeg-engine.js`; WAV through convert's audio.js |
| `js/settings.js`, `js/view.js`, `js/save.js`, `js/main.js` | the panel's settings (kept in localStorage `slop.recorder.settings`), the stage/trim/support view, saving and Open in…, boot (SlopAppBar, SlopFrame, intake) |
| `js/commands.js`, `js/ai-commands.js` | Ctrl+K commands (Alt+R record/stop, Alt+P pause) and the assistant's tools with argument schemas |

## What browsers allow (shown live on the page, `support.js`)

| Browser | Screen | Sound from the screen | Webcam and mic |
|---|---|---|---|
| Chrome, Edge on Windows and ChromeOS | yes | a tab and the whole screen | yes |
| Chrome, Edge on macOS and Linux | yes | a tab only | yes |
| Firefox (desktop) | yes | none | yes |
| Safari (macOS) | yes | none | yes |
| Phones and tablets | no (no getDisplayMedia) | none | yes |

Safari records MP4 (no WebM): the recording is kept as MP4, trimming then goes through the video engine.

## Notes

- `start_recording` for the screen needs the person's click: getDisplayMedia refuses a call without a user gesture, and the
  error says to press Record.
- A recording is kept in memory until saved; very long ones need RAM. Chunks come every second (`rec.start(1000)`).
- The real-time trim plays the kept part muted; it takes as long as the part. Firefox uses `mozCaptureStream`.
- A frame (or tab) that is not painted produces no canvas frames: the tests keep their iframe on screen.
- `?source=screen|camera|pip|mic` starts with that source (the task pages link it).

## Tests

`tests/node/recorder-core.test.mjs` (state, plan, support), `tests/node/recorder-webm.test.mjs` (EBML),
`tests/recorder/record.test.html` (fake devices: canvas captureStream + oscillator; pause, trim, Drive, Open in, PiP pixels,
countdown, microphone + WAV, refusal, intake), `tests/recorder/convert.test.html` (MP4 and GIF with the real ffmpeg core),
`tests/recorder/look.test.html` (layout at 1280 and 390, settings, support table, commands), `tests/a11y/sweep-38.test.html`.
