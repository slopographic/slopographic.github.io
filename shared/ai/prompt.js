/* SlopAIKit prompt: the AI panel's system prompt, short and the same on every turn of a request (so it stays cached).
 * Classic script; adds SlopAIKit.prompt. Used by panel-run.js; tools/ai-tokens.mjs measures what it costs.
 *   prompt.system(tools, eng, { appName, capable }) → the text. Own-key models and capable local models also get the
 *        site's apps in a line each (appTools.catalog); tools the model has not loaded yet (toolbox.js) are named, so it
 *        can load them with find_tools by name.
 *   prompt.hopRule() → the rule for tasks that use other apps, with the person's setting (handoff.js mode) */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});

  function hopRule() {
    const show = K.handoff && K.handoff.mode() === 'show';
    return ['Two kinds of work. (1) File in, file out (convert, remove background, watermark, resize, upscale, OCR, transcribe, compress, workflows): run_operation does it on this page. (2) Editing that needs an app (layers in PhotoSlop, a timeline in SlopCut, pages in Slop PDF, slides in Slop Slides): open_in_app moves the task to that app in this tab with the files and a full task; the chat comes along.',
      show ? 'The person chose "Show me in each app": move to the app that does each step, also for file jobs.'
        : 'The person chose "Stay on this page when possible": do file jobs here and move only for editing that needs another app.',
      'If they say "do it here", stay; "show me", move.'].join(' ');
  }
  /** The site's apps, a line each, for models that can move between them. */
  const site = () => `Apps on the site (find_tools also lists what they can do):\n${K.appTools.catalog(window.SLOP_APPS || [], undefined, { brief: true })}`;
  /** The tools that are not loaded yet, by name (find_tools loads them). */
  function more(tools) {
    const names = tools.filter((t) => t.deferred).map((t) => t.name);
    return names.length ? `More tools here, not loaded yet (their arguments are unknown until find_tools loads them, by name or by what they do): ${names.join(', ')}.` : '';
  }

  function system(tools, eng, { appName = 'this page', capable = false } = {}) {
    const name = appName, cloud = eng && eng.kind === 'cloud';
    const lines = [cloud ? `You are Slop AI inside ${name} on slopographic.com, a site of apps that run in the user's browser; the user connected you with their own key. Be brief.`
      : `You are Slop AI inside ${name} on slopographic.com. It runs on the user's own device. Be brief.`];
    if (!tools.length) return lines[0];
    lines.push(`You control ${name} with the tools. Call app_state first when you need to know what is open.`, more(tools),
      'Plan the fewest steps, arguments in the given ranges. Some actions ask the user first; if they say no, accept it. If a tool fails, say so plainly; never invent results. After the actions, answer in one short sentence.');
    if (cloud) {
      lines.push('Files stay on the device: look_at_file sees one. Be resourceful: build what is asked from the tools (layers, shapes, text, gradients, SVG, fills, filters, generate_image) instead of saying it cannot be done; after visual changes check with look_at_canvas and fix what is off.',
        `Never refuse because ${name} cannot do something. ${hopRule()}`, site());
    } else {
      lines.push('You may put several <tool_call> lines in one reply; they run in order.', hopRule());
      // a local model that gets the operations also gets the map of the apps, by name only (small context windows)
      if (capable) lines.push(`Apps (open_in_app): ${(window.SLOP_APPS || []).filter((a) => a.kind === 'app').map((a) => `${a.id} (${a.name})`).join(', ')}.`);
    }
    return lines.filter(Boolean).join(' ');
  }

  K.prompt = { system, hopRule };
})();
