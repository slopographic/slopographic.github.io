// The AI in the apps, said once and in plain words, for the round-ups (shared/seo/roundups/*.mjs), the task FAQs and the
// app pages. Checked against the code:
//   - the AI button on every app page (shell/header.js) opens the AI panel (shared/ai/panel.js); it works the apps that
//     have AI commands (shared/commands/AI-COVERAGE.md) with:
//       a model on this device: WebLLM on WebGPU (shared/ai/webllm.js, shared/ai/catalog.js), downloaded once;
//       a local server: Ollama, LM Studio and others (shared/ai/cloud/catalog/local.js, cloud/local.js);
//       the person's own key: Claude, ChatGPT, Gemini, OpenRouter, Groq and about 50 services (shared/ai/cloud/catalog/).
//     With a key the browser calls that provider directly (shared/ai/cloud/net.js); there is no Slopographic server.
//     Free tiers are the catalog's `free` entries (Gemini, Groq, Mistral: free; OpenRouter: free models; cloud/free.js).
//   - pictures: generate_image / edit_image and PhotoSlop's Generate Image… and Edit with AI… (shared/ai/imagegen/,
//     photoslop/js/app/imagegen.js) need the person's own OpenAI, Gemini or OpenRouter key; an edit changes only the
//     selection (OpenAI with a mask, the others put back inside it, imagegen/pixels.js). Nothing generates pictures on
//     the device.
//   - on the device, with no key: SlopIsolate (shared/cutout), Slop Upscale, Slop OCR, Slop Transcribe (Whisper),
//     Slop Image to 3D, Slop AI Tools and PhotoSlop's Select Subject.
// tests/node/seo-stale.test.mjs keeps the copy from drifting back to claims these facts contradict.
// The words are the SEO tables' seo.ai.* (shared/seo/i18n/<code>/common.js): row (the feature row for the AI panel in a
// comparison table) and short (our value in it), pro (a round-up pro), key (what a key means), free (the free ways to use
// it), images (pictures made or changed by AI: never on the device), imagesShort (our value for a "Generative fill" row),
// how (the full answer for an FAQ: "Does it have AI?").
import { hydrate } from './i18n.mjs';
export const aiIn = (code = 'en') => hydrate({}, 'seo.ai', code);
export const AI = aiIn('en');
