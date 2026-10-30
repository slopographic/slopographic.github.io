/* SlopAIKit fileTools: look_at_file, the one way a model at an AI provider gets to see a file. Classic script; adds
 * SlopAIKit.fileTools. Part of the one tool list (appTools.build adds it when env.look is set, for engines that can see).
 *   fileTools.look(env) → the tool:  look_at_file({ file })   file: a Slop Drive name or id, or "open" (what the app
 *        has open, through the same event as the Convert dialog, shared/convert/provided.js)
 *   fileTools.canvas(env) → look_at_canvas(): a picture of the work in this app (SlopCmd.snapshot(): the app's own, else its
 *        work area drawn by shared/commands/view.js; else the file it hands to Convert), so the model can check what it made. Same
 *        kind, 'send', and the same small copy; the chat shows it as a thumbnail.
 *   fileTools.shrink(blob, max) → { mime, data (base64), width, height, from: { width, height } }
 *   fileTools.extract(text, n) → the first n characters, and how many were left out
 * It needs approval of its own kind, 'send' (permissions.js): "Allow app changes" never covers it. It sends only a small copy: a picture scaled to at most
 * 1024 px on its longest side as JPEG, or the first 8,000 characters of a text file. The file itself is not changed. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // words people read (steps, questions): shared/i18n/ui/<code>/ai2.js
  const MAX_PX = 1024, MAX_CHARS = 8000;
  const TEXT = /^text\/|json|xml|javascript|csv|yaml|markdown/i, TEXT_NAME = /\.(md|markdown|txt|csv|tsv|json|js|mjs|ts|py|html?|css|xml|svg|ya?ml|toml|ini|sql|sh|log)$/i;
  const PICTURE = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i, PICTURE_NAME = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

  function b64(buf) {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /** A drawable from a Blob (SVG through an <img>, which createImageBitmap does not take), a canvas, or an ImageBitmap. */
  async function bitmap(src) {
    if (src && (src.getContext || src.close)) return src;
    if (/svg/.test(src.type || '')) {
      const url = URL.createObjectURL(src), img = new Image();
      try { img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
    }
    return createImageBitmap(src);
  }
  async function shrink(blob, max = MAX_PX) {
    const bmp = await bitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    const from = { width: bmp.width, height: bmp.height };
    if (bmp.close && bmp !== blob) bmp.close();
    return { mime: 'image/jpeg', data: b64(await out.arrayBuffer()), width: w, height: h, from };
  }
  const extract = (text, n = MAX_CHARS) => ({ text: text.length > n ? text.slice(0, n) : text, left: Math.max(0, text.length - n) });

  /** The file the model named: "open" = what the app has open, else Slop Drive by id or name. */
  async function find(q, env) {
    if (/^(open|current|this|app)$/i.test(String(q || '').trim()) || String(q).startsWith('app:')) {
      const root = new URL('../../', K.base || document.baseURI).href;
      const { ask } = await import(root + 'shared/convert/provided.js');
      const { files, app } = await ask();
      if (!files.length) throw new Error(`${app} has nothing open to look at.`);
      const n = Number(String(q).split(':')[1]) || 1;
      return files[Math.min(files.length, n) - 1];
    }
    const f = await K.appTools.findFile(env.hub !== undefined ? env.hub : window.SlopHub, q);
    return new File([f.blob], f.name, { type: f.type || f.blob.type || '' });
  }

  function look(env = {}) {
    const who = env.who || T('ui.ai.the_provider');
    return {
      name: 'look_at_file', maxChars: MAX_CHARS + 400,
      description: `Look at a picture or read a text file: a Slop Drive file (name or id from list_files), or "open" for what this app has open. The person is asked each time; a picture comes as a small copy (at most ${MAX_PX} px).`,
      params: { file: { type: 'string', description: 'Slop Drive file name or id, or "open"', required: true } },
      destructive: true, kind: () => 'send',   // not destructive: it sends a copy out, so it needs approval (its own kind)
      confirmTitle: () => T('ui.ai.step.send_copy_q', { who }),
      confirmText: (a) => T(/^(open|current|this|app)$/i.test(String(a.file || '').trim()) ? 'ui.ai.step.look_open' : 'ui.ai.step.look_file', { file: String(a.file), px: String(MAX_PX), chars: MAX_CHARS, who }),
      label: (a) => (/^(open|current)$/i.test(String(a.file || '')) ? T('ui.ai.step.look_open_label') : T('ui.ai.step.look_label', { file: String(a.file) })),
      run: async (a) => {
        const f = await find(a.file, env);
        if (PICTURE.test(f.type || '') || PICTURE_NAME.test(f.name || '')) {
          const s = await shrink(f);
          return { text: `A ${s.width} × ${s.height} copy of ${f.name} (the original is ${s.from.width} × ${s.from.height}).`, media: [{ mime: s.mime, data: s.data, name: f.name }] };
        }
        if (TEXT.test(f.type || '') || TEXT_NAME.test(f.name || '')) {
          const x = extract(await f.text());
          return x.left ? `${x.text}\n… (${x.left} more characters not sent)` : x.text;
        }
        throw new Error(`${f.name} is not a picture or a text file, so it cannot be looked at. A conversion (list_operations) can make a picture or text of it first.`);
      },
    };
  }

  /** look_at_canvas: the app's own picture of its work, else its open file (only pictures and SVG can be looked at). */
  async function snapshot(env) {
    const cmd = env.cmd !== undefined ? env.cmd : window.SlopCmd;
    // the app's own picture, else the page's work area drawn (SlopCmd's default, shared/commands/view.js)
    let snap = null;
    try { snap = cmd && cmd.snapshot ? await cmd.snapshot() : null; } catch (e) { console.warn('snapshot:', e); }
    if (snap) return { src: snap, name: 'the work in ' + (env.appName || 'this app') };
    const root = new URL('../../', K.base || document.baseURI).href;
    const { ask } = await import(root + 'shared/convert/provided.js');
    const { files, app } = await ask();
    const f = files.find((x) => PICTURE.test(x.type || '') || PICTURE_NAME.test(x.name || '') || /svg/.test(x.type || '') || /\.svg$/i.test(x.name || ''));
    if (!f) throw new Error(`${app} cannot show its work as a picture yet. Use app_state to check it instead.`);
    return { src: f, name: f.name };
  }
  function canvas(env = {}) {
    const who = env.who || T('ui.ai.the_provider'), where = env.appName || T('ui.ai.this_app');
    return {
      name: 'look_at_canvas', maxChars: 400,
      description: `See the current result in ${where} as a picture (at most ${MAX_PX} px), to check your own work after making or changing something. The person may be asked first.`,
      params: {}, schema: { type: 'object', properties: {} },
      destructive: true, kind: () => 'send',   // a picture of the work goes to the provider: approval of kind 'send'
      confirmTitle: () => T('ui.ai.step.send_work_q', { who }),
      confirmText: () => T('ui.ai.step.canvas', { app: where, px: String(MAX_PX), who }),
      label: () => T('ui.ai.step.canvas_label', { app: where }),
      run: async () => {
        const { src, name } = await snapshot(env), s = await shrink(src);
        return { text: `A ${s.width} × ${s.height} picture of ${name} (full size ${s.from.width} × ${s.from.height}).`, media: [{ mime: s.mime, data: s.data, name }] };
      },
    };
  }

  K.fileTools = { look, canvas, shrink, extract, MAX_PX, MAX_CHARS };
})();
