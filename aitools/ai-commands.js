/* Slop AI Tools for the assistant: SlopCmd commands with arguments (shared/commands/args.js) on the hub, loaded on demand
 * by SlopCmd.prepare() (hub.js). A job is one tool on one file, run by ai-jobs.js with the tool pages' own engines:
 *   new_job         start a job for a tool (denoise, portrait, tags, ocr, speech)
 *   add_file        the job's file, from Slop Drive (or this site)
 *   set_options     the tool's settings: denoise mode and strength, blur strength, OCR or speech model, language, tag confidence
 *   request_model   show the person the download dialog of a model the job needs (they confirm; nothing downloads here)
 *   run_job         run it; a model that is not on this device is named, never fetched
 *   export_result   the result to Slop Drive and/or a download (a PNG, a .txt, an .srt), or tags onto the Drive file
 * state() says what is on this device and what the job holds; the checkpoint puts the job back. */
(function () {
  'use strict';
  const C = window.SlopCmd, J = window.SlopAIJobs;
  if (!C || !J || C.get('ait.ai.new-job')) return;
  const R = () => window.SlopAIModels, M = () => window.SlopAIManager;
  let job = null;
  const list = [];
  const add = C.aiAdder('ait', list);   // shared/commands/commands.js
  const need = () => { if (!job) throw new Error('No job yet: new_job first'); return job; };
  const say = (text) => { const s = document.getElementById('status'); if (s) s.textContent = text; };
  /** The person's words on the status line (aitools/i18n/<code>/hub.js); the replies to the assistant stay English. */
  const L = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const toolName = (id) => L('aitools.tool.' + id + '_name');
  const stem = (n) => String(n).replace(/\.[^.]+$/, '') || 'result';
  const TOOL_IDS = Object.keys(J.TOOLS);

  add('new_job', 'New job', [
    { name: 'tool', type: 'enum', values: TOOL_IDS, required: true, description: 'denoise (a photo, no model), portrait (blur the background behind a person), tags (suggest tags for a photo), ocr (read text from a picture), speech (audio or video to text)' },
    { name: 'file', type: 'string', maxLength: 300, description: 'optional: a Slop Drive file to start with (name or id)' },
  ], async (a) => {
    job = { tool: a.tool, file: null, options: {}, result: null };
    const t = J.TOOLS[a.tool], miss = await J.missing(job);
    let msg = `New ${t.name} job.`;
    if (a.file) msg += ' ' + (await addFile({ file: a.file }));
    else msg += ' Use add_file next.';
    if (miss.length) msg += ` It needs ${miss.map((m) => `${m.name} (${m.size})`).join(' and ')}, not on this device yet: request_model shows the person its download dialog.`;
    return msg;
  }, { description: 'Start a job with one of the AI tools. The job runs on this device; nothing is uploaded.' });

  async function addFile(a) {
    const j = need(), S = window.SlopCmdSources;
    if (!a.file && !a.url) throw new Error('Give file (a Slop Drive name or id) or url (a file on this site)');
    const r = a.file ? await S.driveFile(a.file) : await S.siteFile(a.url);
    const type = r.blob.type || r.type || '';
    if (!J.TOOLS[j.tool].accept.test(type)) throw new Error(`${J.TOOLS[j.tool].name} takes ${j.tool === 'speech' ? 'audio or video' : 'a picture'}; ${r.name} is ${type || 'of an unknown type'}`);
    j.file = { name: r.name, blob: r.blob, driveId: a.file ? r.id : null };
    j.result = null;
    return `Added ${r.name} (${R().formatSize(r.blob.size)}). Use run_job to run it.`;
  }
  add('add_file', 'Add the file', [
    { name: 'file', type: 'string', maxLength: 300, description: 'a Slop Drive file name or id' },
    { name: 'url', type: 'string', maxLength: 500, description: 'or the address of a file on this site' },
  ], addFile, { description: 'Give the job its file (one; a new one replaces it).' });

  add('set_options', 'Set the job options', [
    { name: 'mode', type: 'enum', values: ['median', 'bilateral', 'both'], description: 'denoise: the filter' },
    { name: 'strength', type: 'number', min: 0, max: 100, description: 'denoise: how strong; portrait: how far the background blurs' },
    { name: 'model', type: 'string', maxLength: 80, description: 'ocr or speech: the model id (app_state lists them)' },
    { name: 'language', type: 'string', maxLength: 20, description: 'speech: a language code like en or sv, or auto' },
    { name: 'min_confidence', type: 'number', min: 0, max: 1, description: 'tags: the lowest confidence kept (0.02 by default)' },
  ], async (a) => {
    const j = need(), FOR = { mode: ['denoise'], strength: ['denoise', 'portrait'], model: ['ocr', 'speech'], language: ['speech'], min_confidence: ['tags'] };
    const set = Object.keys(FOR).filter((k) => a[k] !== undefined && a[k] !== '');
    if (!set.length) throw new Error('Give an option to set');
    const wrong = set.filter((k) => !FOR[k].includes(j.tool));
    if (wrong.length) throw new Error(`${J.TOOLS[j.tool].name} has no ${wrong.join(' or ')} option`);
    if (a.model) {
      const m = R().byId(a.model);
      if (!m || (m.tool !== j.tool && !(j.tool === 'speech' && window.SlopSpeechModels.byId(a.model)))) throw new Error(`“${a.model}” is not a ${J.TOOLS[j.tool].name} model. app_state lists them.`);
    }
    for (const k of set) j.options[k] = a[k];
    j.result = null;
    return `${J.TOOLS[j.tool].name}: ${set.map((k) => `${k} ${a[k]}`).join(', ')}.`;
  }, { description: 'Set the options of the job\'s tool. Each tool has its own; the others are refused.' });

  add('request_model', 'Ask to download a model', [{ name: 'model', type: 'string', maxLength: 80, description: 'the model id; default the first one the job is missing' }], async (a) => {
    let id = a.model;
    if (!id) { const miss = job ? await J.missing(job) : []; if (!miss.length) return 'The job has every model it needs.'; id = miss[0].id; }
    const m = R().byId(id);
    if (!m) throw new Error(`Unknown model “${id}”`);
    if (/^(installed|bundled)$/.test(await M().status(id))) return `${m.name} is already on this device.`;
    window.SlopAIGetMore.open(id, { onInstalled: () => window.SlopAIHub && window.SlopAIHub.refresh() });
    return `Showed the download dialog for ${m.name} (${R().formatSize(R().downloadBytes(m))}, ${R().LICENCES[m.licence]}). It downloads only when the person presses Download there; then run_job.`;
  }, { macro: false, description: 'Show the person the licence and download dialog of a model. Nothing downloads unless they confirm.' });

  add('run_job', 'Run the job', [], async () => {
    const j = need();
    say(L('aitools.job.working', { tool: toolName(j.tool), file: j.file ? j.file.name : '…' }));
    try { j.result = await J.run(j, say); } catch (e) { say(''); throw e; }
    const r = j.result;
    say(L('aitools.job.done', { tool: toolName(j.tool) }));
    if (r.kind === 'image') return `Made a ${r.w} × ${r.h} PNG. Use export_result to keep it.`;
    if (r.kind === 'text') return r.text ? `Read ${r.lines} line(s):\n${r.text.slice(0, 4000)}` : 'No text found on this picture.';
    if (r.kind === 'speech') return r.segments.length ? `${r.segments.length} segments (${r.language}, ${r.model}):\n${window.SlopTranscript.txt(r.segments).slice(0, 4000)}` : 'No speech found in this file.';
    return r.tags.length ? `Suggested tags: ${r.tags.map((t) => `${t.tag} ${Math.round(t.p * 100)}%`).join(', ')}.` : 'Nothing confident enough to suggest.';
  }, { description: 'Run the job on its file. A model that is not on this device is named, and request_model asks the person for it.' });

  add('export_result', 'Export the result', [
    { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },
    { name: 'format', type: 'enum', values: ['auto', 'txt', 'srt', 'vtt'], default: 'auto', description: 'speech: srt (default), vtt or txt' },
    { name: 'name', type: 'string', maxLength: 200, description: 'the file name; default from the source file' },
  ], async (a) => {
    const j = need(), r = j.result;
    if (!r) throw new Error('Nothing to export yet: run_job first');
    const H = window.SlopHub, X = window.SlopTranscript, src = stem(j.file.name);
    if (r.kind === 'tags') {
      if (!r.tags.length) throw new Error('No tags to save');
      if (a.to === 'download') throw new Error('Tags are saved onto the Slop Drive file; use to: drive');
      const tags = r.tags.map((t) => t.tag);
      if (j.file.driveId) {
        const rec = await H.get(j.file.driveId), all = window.SlopTags.withAdded(window.SlopTags.of(rec), tags);
        await H.update(j.file.driveId, { meta: Object.assign({}, rec.meta || {}, { tags: all }) }, { touch: false });
        return `Saved ${all.length} tag(s) on ${j.file.name} in Slop Drive.`;
      }
      j.file.driveId = await H.put(j.file.blob, { name: j.file.name, from: 'ai-tags', meta: { tags } });
      return `Put ${j.file.name} in Slop Drive with ${tags.length} tag(s).`;
    }
    let blob, name;
    if (r.kind === 'image') { blob = r.blob; name = `${src}-${j.tool === 'portrait' ? 'blur' : 'denoised'}.png`; }
    else if (r.kind === 'text') { blob = new Blob([r.text], { type: 'text/plain' }); name = src + '.txt'; }
    else {
      const f = a.format === 'auto' ? 'srt' : a.format;
      blob = new Blob([f === 'txt' ? X.txt(r.segments) : f === 'vtt' ? X.vtt(r.segments) : X.srt(r.segments)], { type: f === 'srt' ? 'application/x-subrip' : f === 'vtt' ? 'text/vtt' : 'text/plain' });
      name = `${src}.${f}`;
    }
    name = a.name || name;
    const out = [];
    if (a.to !== 'download') out.push(`saved ${name} to Slop Drive (id ${await H.put(blob, { name, from: 'aitools' })})`);
    if (a.to !== 'drive') { window.SlopAITools.download(name, blob); out.push(`downloaded ${name}`); }
    return out.join(' and ').replace(/^./, (c) => c.toUpperCase()) + '.';
  }, { description: 'Save the result to Slop Drive (other apps open it there) and/or download it. Tags are written onto the Drive file.' });

  async function state() {
    const tools = {}, models = [];
    for (const [id, t] of Object.entries(J.TOOLS)) tools[id] = t.name;
    for (const { model: m, status } of await M().list()) models.push({ id: m.id, name: m.name, tool: m.tool || null, status, size: R().formatSize(R().downloadBytes(m)) });
    const j = job && { tool: job.tool, file: job.file && { name: job.file.name, bytes: job.file.blob.size, fromDrive: !!job.file.driveId }, options: job.options,
      missing: (await J.missing(job)).map((m) => m.id),
      result: job.result && (job.result.kind === 'image' ? { kind: 'image', w: job.result.w, h: job.result.h } : job.result.kind === 'text' ? { kind: 'text', chars: job.result.text.length }
        : job.result.kind === 'speech' ? { kind: 'speech', segments: job.result.segments.length, language: job.result.language } : { kind: 'tags', tags: job.result.tags.slice(0, 20) }) };
    return { app: 'Slop AI Tools', tools, job: j || null, models };
  }
  /** The job as it is now: the rollback puts it back. */
  function checkpoint() {
    const was = job && Object.assign({}, job, { options: Object.assign({}, job.options), file: job.file && Object.assign({}, job.file) });
    return () => { job = was; return true; };
  }
  C.register(list);
  C.provide({ state, checkpoint });
})();
