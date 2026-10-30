/* SlopBridge: this tab's link to an AI app on this computer (Claude Code, Codex, Cursor…) through the Slopographic MCP
 * bridge (tools/claude-plugin/server/) on ws://127.0.0.1. The page pairs with the code the AI app shows, then offers the
 * same tools as WebMCP (shared/agent/toolset.js) and runs the calls here, with the person's permission settings: a
 * destructive call asks in this page. Files come in through SlopIntake.take (or Slop Drive) and go out from Slop Drive
 * or what the app has open, in chunks. Classic script; window.SlopBridge. The UI is bridge-ui.js.
 *   connect({ port }) → Promise<state>   the given port, then the one this tab used, then PORTS in turn
 *   pair(code) → Promise<{ ok, left?, reason? }>
 *   disconnect()                         ends it here and in the AI app; forgets this tab's pairing
 *   state()  'idle' | 'connecting' | 'need-code' | 'paired' | 'closed' | 'unreachable' | 'refused'
 *   client() the AI app's name ('Claude Code'; ui.agent.your_app until it says)    on(fn) → off: fn(state, detail) on every change
 * Wire format: tools/claude-plugin/server/bridge.mjs. */
(function (g) {
  'use strict';
  if (g.SlopBridge) return;
  const PORTS = Array.from({ length: 10 }, (_, i) => 47821 + i);   // the same as bridge.mjs (a test checks)
  const KEY = 'slop.bridge', CHUNK = 256 * 1024;
  const S = () => g.SlopAgentToolset;
  const tr = (k, v) => { const I = g.SlopI18n; return I ? I.t(k, v) : k; };
  const subs = new Set();
  let ws = null, st = 'idle', detail = {}, clientName = '', tools = new Map(), sig = '', off = null, waiting = null;
  const incoming = new Map();   // call id → [base64 chunks]

  function set(s, d = {}) { st = s; detail = d; for (const fn of subs) try { fn(s, d); } catch (e) { console.warn(e); } }
  const saved = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = (v) => { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch (e) { /* this page only */ } };
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const hello = () => ({ t: 'hello', app: S().appId(), appName: S().appName(), title: document.title.slice(0, 160), url: location.origin + location.pathname });

  function open(port) {
    return new Promise((resolve) => {
      let sock;
      try { sock = new WebSocket(`ws://127.0.0.1:${port}`); } catch (e) { resolve(null); return; }
      const t = setTimeout(() => { sock.close(); resolve(null); }, 4000);
      sock.onopen = () => { clearTimeout(t); resolve(sock); };
      sock.onerror = () => { clearTimeout(t); resolve(null); };
    });
  }

  async function connect({ port = 0 } = {}) {
    if (ws && (st === 'paired' || st === 'need-code' || st === 'connecting')) return st;
    set('connecting');
    const prev = saved();
    const order = [...new Set([port, prev && prev.port, ...PORTS].filter((p) => Number.isInteger(p) && p > 1023 && p < 65536))];
    for (const p of order) {
      const sock = await open(p);
      if (!sock) continue;
      ws = sock;
      ws.onmessage = (e) => message(e.data, p);
      ws.onclose = (e) => closed(e);
      const first = new Promise((r) => { waiting = r; });
      ws.send(JSON.stringify(Object.assign(hello(), prev && prev.port === p ? { token: prev.token } : {})));
      await Promise.race([first, new Promise((r) => setTimeout(r, 5000))]);
      if (st !== 'connecting') return st;
      ws.onclose = null; ws.close(); ws = null;   // something else answers on this port
    }
    set('unreachable');
    return st;
  }

  function closed(e) {
    const was = st;
    ws = null; tools = new Map(); sig = '';
    if (off) { off(); off = null; }
    if (waiting) { waiting(); waiting = null; }
    if (st === 'refused') return;
    if (e && e.code === 4000) save(null);   // another page took over this pairing
    set(was === 'idle' ? 'idle' : 'closed', { code: e && e.code, reason: e && e.reason });
  }

  let pairing = null;
  function message(text, port) {
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (m.client) clientName = String(m.client).slice(0, 60);
    const settle = (v) => { if (pairing) { pairing(v); pairing = null; } };
    if (m.t === 'need-pair') { set('need-code'); if (waiting) { waiting(); waiting = null; } return; }
    if (m.t === 'pair-wrong') { settle({ ok: false, left: m.left }); return; }
    if (m.t === 'refused') { save(null); set('refused', { reason: m.reason }); settle({ ok: false, reason: m.reason }); if (waiting) { waiting(); waiting = null; } return; }
    if (m.t === 'paired') {
      save({ port, token: m.token });
      set('paired', { tab: m.tab });
      settle({ ok: true });
      if (waiting) { waiting(); waiting = null; }
      sendTools(true);
      if (!off) off = S().onChange(() => sendTools(false));
      return;
    }
    if (m.t === 'client') { set(st, detail); return; }
    if (st !== 'paired') return;
    if (m.t === 'chunk') { const c = incoming.get(m.id) || []; c[m.i] = m.data; incoming.set(m.id, c); return; }
    if (m.t === 'call') run(m);
  }

  function pair(code) {
    if (st !== 'need-code') return Promise.resolve({ ok: false, reason: tr('ui.agent.not_waiting') });
    return new Promise((r) => { pairing = r; send({ t: 'pair', code: String(code || '') }); });
  }

  function sendTools(force) {
    if (st !== 'paired' || (S().busy() && !force)) return;
    const defs = S().defs(), s = S().signature(defs);
    if (!force && s === sig) return;
    sig = s;
    const list = S().tools({ who: clientName });
    tools = new Map(list.map((t) => [t.name, t]));
    send({ t: 'tools', tools: list.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
    document.dispatchEvent(new CustomEvent('slop:agent-tools', { detail: { count: list.length, names: list.map((t) => t.name), via: 'bridge' } }));
  }

  const text = (s, isError) => (isError ? { content: [{ type: 'text', text: s }], isError: true } : { content: [{ type: 'text', text: s }] });
  async function run(m) {
    let result;
    try {
      if (m.name === '@receive') result = await receive(m.id, m.args || {});
      else if (m.name === '@export') result = await exportFile(m.id, m.args || {});
      else {
        const t = tools.get(m.name);
        result = t ? await t.execute(m.args || {}, null) : text(`This page has no tool "${m.name}" now. List the tools again.`, true);
      }
    } catch (e) { result = text(String((e && e.message) || e), true); }
    send({ t: 'result', id: m.id, result });
  }

  function bytesOf(chunks, n) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      if (typeof chunks[i] !== 'string') throw new Error('A part of the file was lost on the way.');
      const bin = atob(chunks[i]), u = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
      parts.push(u);
    }
    return parts;
  }
  async function receive(id, a) {
    const chunks = incoming.get(id) || [];
    incoming.delete(id);
    const name = String(a.name || 'file').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 160);
    const file = new File(bytesOf(chunks, a.chunks), name, { type: a.type || '' });
    if (file.size !== a.size) throw new Error(`${name} arrived with ${file.size} of ${a.size} bytes.`);
    const I = g.SlopIntake, H = g.SlopHub;
    if (a.into !== 'drive' && I && I.take && I.spec && I.spec()) {
      const s = await I.take([file], Object.assign({ source: 'api' }, a.mode ? { mode: a.mode } : {}));
      if (s.added && s.added.length) return text(`Opened ${name} in ${S().appName()}.`);
      if (s.cancelled) return text(`The person did not open ${name}.`, true);
      throw new Error((s.skipped && s.skipped[0] && s.skipped[0].reason) || `${S().appName()} did not open ${name}.`);
    }
    if (!H || !H.put) throw new Error('Slop Drive is not available on this page.');
    const did = await H.put(file, { name, from: 'ai' });
    const why = a.into === 'drive' ? '' : ` ${S().appName()} does not open files directly, so it is in Slop Drive; use the operations or open_file with it.`;
    return text(`Put ${name} in Slop Drive (id ${did}).${why}`);
  }

  async function exportFile(id, a) {
    const f = await g.SlopAgentWorkspace.file(a.file);
    const buf = new Uint8Array(await f.arrayBuffer()), n = Math.max(1, Math.ceil(buf.length / CHUNK));
    for (let i = 0; i < n; i++) {
      const part = buf.subarray(i * CHUNK, (i + 1) * CHUNK);
      let bin = '';
      for (let j = 0; j < part.length; j += 0x8000) bin += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
      send({ t: 'chunk', id, i, data: btoa(bin) });
    }
    return { name: f.name, type: f.type || '', size: buf.length, chunks: n };
  }

  function disconnect() {
    save(null);
    if (ws) { send({ t: 'bye' }); try { ws.close(1000, 'bye'); } catch (e) { /* gone */ } }
    ws = null; tools = new Map(); sig = '';
    if (off) { off(); off = null; }
    set('idle');
  }

  g.SlopBridge = { PORTS, KEY, connect, pair, disconnect, state: () => st, detail: () => detail, client: () => clientName || tr('ui.agent.your_app'),
    tools: () => [...tools.keys()], on(fn) { subs.add(fn); return () => subs.delete(fn); } };
})(window);
