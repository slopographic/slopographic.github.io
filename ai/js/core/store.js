/* Slop AI — core/store: conversations in IndexedDB (database "slop-ai", store "convs"; tests use ?db=name or window.SLOP_AI_DB).
 * A conversation: { id, kind: 'chat' | 'build', title, created, updated, persona, system, temperature, maxTokens, tools,
 *   messages: [{ role, content, display?, attachments?, toolCalls?, name?, ok?, usage?, time }], html? (build only) }
 * Also: export to Markdown / JSON. */
'use strict';
(function (AI) {
  const NAME = () => window.SLOP_AI_DB || new URLSearchParams(location.search).get('db') || 'slop-ai';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME(), 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('convs', { keyPath: 'id' }); s.createIndex('updated', 'updated'); };
      r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; res(r.result); };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('convs', mode), s = t.objectStore('convs');
      let out; const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  function blank(kind = 'chat', o = {}) {
    const now = Date.now(), p = AI.prefs;
    return Object.assign({ id: AI.uid(), kind, title: AI.t(kind === 'build' ? 'ai.build.new' : 'ai.chat.new'), created: now, updated: now,
      persona: kind === 'build' ? 'builder' : p.persona, system: null, temperature: kind === 'build' ? 0.4 : p.temperature, maxTokens: kind === 'build' ? 2048 : p.maxTokens,
      tools: kind === 'build' ? false : !!p.tools, messages: [], html: null }, o);
  }
  const strip = (c) => JSON.parse(JSON.stringify(c)); // drop functions/DOM refs before structured clone
  AI.db = {
    open, blank,
    async list(kind) { const all = (await tx('readonly', (s) => s.getAll())) || []; return all.filter((c) => !kind || c.kind === kind).sort((a, b) => b.updated - a.updated); },
    get: (id) => tx('readonly', (s) => s.get(id)),
    async put(c, { touch = true } = {}) { if (touch) c.updated = Date.now(); await tx('readwrite', (s) => s.put(strip(c))); AI.emit('convs', c); return c; },
    async remove(id) { await tx('readwrite', (s) => s.delete(id)); AI.emit('convs', null); },
    async clear() { await tx('readwrite', (s) => s.clear()); AI.emit('convs', null); },
    close() { if (dbp) dbp.then((d) => d.close()).catch(() => {}); dbp = null; },
  };

  /* ---------- export ---------- */
  AI.toMarkdown = function (c) {
    const lines = [`# ${c.title}`, '', `_Slop AI · ${new Date(c.created).toLocaleString()}${c.model ? ' · ' + c.model : ''}_`, ''];
    const sys = AI.systemFor ? AI.systemFor(c) : c.system;
    if (sys) lines.push('> **System:** ' + sys.split('\n').join('\n> '), '');
    for (const m of c.messages) {
      if (m.role === 'tool') { lines.push(`> 🔧 **${m.name}** → ${String(m.content).slice(0, 400)}`, ''); continue; }
      lines.push(m.role === 'user' ? '## You' : '## Slop AI', '', m.display != null ? m.display : m.content);
      if (m.attachments && m.attachments.length) lines.push('', '_Attached: ' + m.attachments.map((a) => a.name).join(', ') + '_');
      lines.push('');
    }
    return lines.join('\n');
  };
  AI.toJSON = (c) => JSON.stringify({ format: 'slop-ai-conversation', version: 1, conversation: strip(c) }, null, 2);
  AI.fromJSON = function (text) {
    const o = JSON.parse(text), c = o && o.format === 'slop-ai-conversation' ? o.conversation : o;
    if (!c || !Array.isArray(c.messages)) throw new Error(AI.t('ai.store.not_conv'));
    return blank(c.kind || 'chat', Object.assign({}, c, { id: AI.uid() }));
  };
})(window.AI);
