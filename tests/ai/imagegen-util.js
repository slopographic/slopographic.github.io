/* Helpers for the AI picture tests (after tests/harness.js and cloud-util.js): a fake picture provider in an app frame.
 * IG.install(win) wraps the frame's fetch (CU.install's, when there is one): the picture addresses of OpenAI, Gemini
 * and OpenRouter answer in their documented formats with a solid picture; everything else goes on to the wrapped fetch.
 *   const g = IG.install(win); g.color = '#0000ff'; g.size = [300, 200]; g.calls: [{ url, body (JSON or FormData) }]
 *   g.fail = { status, body } answers the next picture request with that error.
 * IG.key(win, provider, key) puts a key in this tab the way the AI panel does (keys.js, "this tab only"). */
window.IG = (function () {
  'use strict';
  function png(color, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

  function install(win) {
    const inner = win.fetch.bind(win), f = { color: '#ff0000', size: [300, 200], calls: [], fail: null };
    win.fetch = async (url, init = {}) => {
      url = String(url);
      const pic = /api\.openai\.com\/v1\/images\/(generations|edits)$|\/v1beta\/interactions$|openrouter\.ai\/api\/v1\/images$/.test(url);
      if (!pic) return inner(url, init);
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      f.calls.push({ url, body, headers: Object.assign({}, init.headers || {}) });
      if (f.fail) { const x = f.fail; f.fail = null; return json(x.body, x.status); }
      const data = png(f.color, f.size[0], f.size[1]);
      if (/interactions$/.test(url)) return json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data }] }], usage: { total_input_tokens: 10, total_output_tokens: 1200 } });
      if (/openrouter/.test(url)) return json({ data: [{ b64_json: data, media_type: 'image/png' }], usage: { prompt_tokens: 0, completion_tokens: 4000, cost: 0.04 } });
      return json({ data: [{ b64_json: data }], output_format: 'png', usage: { input_tokens: 40, input_tokens_details: { text_tokens: 40, image_tokens: 0 }, output_tokens: 1000 } });
    };
    return f;
  }
  function key(win, provider, k) { win.sessionStorage.setItem('slop-ai.cloud.key:' + provider, k); }
  return { install, key, png };
})();
