/* Slop AI side panel, the run (loaded by panel.js; adds to SlopAIKit.panel): sending a message, the tool loop with
 * the app's commands, each tool call as a step ("Gaussian blur, radius 8 ✓"), Stop, plain errors, and
 * "Undo all AI changes" for the last request (SlopCmd.checkpoint() before it runs, the rollback after).
 * With an own-key provider (engine kind 'cloud', shared/ai/cloud/): the one-time notice before its first request, the
 * same tools plus look_at_file (asks each time) and the operations registry, up to settings.steps model turns (12 by
 * default), the tokens of each reply and of this visit under it, and the spending cap (the loop stops when reached). */
(function () {
  'use strict';
  const K = window.SlopAIKit, P = K.panel;
  if (!P) return;
  const h = P.h, T = P.T;
  const MAX_STEPS = 6, MAX_CALLS = 12;

  const confirmFn = (title, msg) => (window.SlopUI && SlopUI.confirm ? SlopUI.confirm(title, msg, T('ui.ai.run.allow')) : Promise.resolve(window.confirm(title + '\n\n' + msg)));
  const stepText = (tool, call) => { try { return tool && tool.label ? tool.label(call.arguments || {}) : call.name; } catch (e) { return call.name; } };
  const ICON = { run: '…', ok: '✓', bad: '✗', stop: '■' };

  /** A step's result as a short line: what the app said, without repeating the step's own label; nothing for data. */
  function result(m) {
    let t = String(m.content || '').trim();
    if (/^[[{]/.test(t)) return '';
    const done = `Done: ${m.label || ''}.`;
    if (m.label && t.startsWith(done)) t = t.slice(done.length).trim();
    else t = t.replace(/^Done:\s*/, '');
    return t.length > 160 ? t.slice(0, 157) + '…' : t;
  }
  /** All messages as DOM; a run of more than 3 steps folds into "9 steps ▸" (open it to see each one). Empty assistant
   * turns (a reply that only called tools) draw nothing. */
  P.viewAll = function (list) {
    const out = [];
    for (let i = 0; i < list.length;) {
      const m = list[i];
      if (m.role === 'assistant' && !m.note && !String(m.display != null ? m.display : m.content || '').trim()) { i++; continue; }
      if (m.role !== 'tool') { out.push(P.view(m)); i++; continue; }
      const run = [];
      for (; i < list.length && (list[i].role === 'tool' || (list[i].role === 'assistant' && !list[i].note && !String(list[i].display != null ? list[i].display : list[i].content || '').trim())); i++) if (list[i].role === 'tool') run.push(list[i]);
      if (run.length <= 3) { run.forEach((x) => out.push(P.view(x))); continue; }
      const bad = run.filter((x) => !x.ok).length;
      out.push(h('details', { class: 'sap-steps' }, h('summary', null, bad ? T('ui.ai.run.steps_bad', { n: run.length, bad }) : T('ui.ai.run.steps_ok', { n: run.length })), ...run.map((x) => P.view(x))));
    }
    return out;
  };

  /** One message as DOM: a user bubble, an assistant reply (Markdown), or a step. */
  P.view = function (m) {
    if (m.role === 'tool') {
      const st = m.ok ? 'ok' : 'bad';
      return h('div', { class: 'sap-tool sap-step ' + st, title: String(m.content).slice(0, 400) },
        h('span', { class: 'sap-step-i', 'aria-hidden': 'true' }, ICON[st]), h('span', { class: 'sap-step-t' }, m.label || m.name),
        h('span', { class: 'sr-only' }, ' ' + T(m.ok ? 'ui.ai.run.done' : 'ui.ai.run.failed')),
        !m.ok ? h('span', { class: 'sap-step-e' }, String(m.content).replace(/^ERROR:\s*/, '')) : result(m) ? h('span', { class: 'sap-step-r' }, result(m)) : null,
        // what was sent to the provider (look_at_file, look_at_canvas): a thumbnail, so the person sees it too
        ...(m.media || []).filter((x) => /^image\//.test(x.mime)).map((x) => h('img', { class: 'sap-thumb', alt: T('ui.ai.run.sent', { name: x.name || T('ui.ai.run.picture') }), src: `data:${x.mime};base64,${x.data}` })));
    }
    if (m.handoff) return h('div', { class: 'sap-handoff' }, P.shown(m));   // "Opening SlopIsolate…", "Continuing in PhotoSlop with …"
    if (m.meter) return h('div', { class: 'sap-usage', title: m.detail || null }, m.display);   // the tokens line (not m.usage: every reply carries its usage)
    const d = h('div', { class: 'sap-msg ' + m.role + (m.error ? ' bad' : '') });
    const text = P.shown(m);
    if (m.role === 'assistant' && K.md && !m.error) d.innerHTML = K.md.render(text); else d.textContent = text;
    return d;
  };

  /** A local model good enough for the longer tool list (the operations): one the catalog marks good at tools, 3B or more. */
  P.capable = function (eng) {
    try { const m = K.catalog && K.catalog.byId(eng.info().id); return !!m && (m.strengths || []).includes('tools') && m.params >= 3; } catch (e) { return false; }
  };
  function setBusy(on) {
    P.sendBtn.textContent = on ? T('ui.ai.panel.stop') : '↑';
    P.sendBtn.classList.toggle('stop', !!on);
    P.sendBtn.setAttribute('aria-label', T(on ? 'ui.ai.panel.stop' : 'ui.ai.panel.send'));
  }
  P.stop = function () {
    if (!P.busy) return;
    P.busy.abort();
    if (P.chain && K.handoff) { K.handoff.cancel(P.chain.id); P.chain = null; P.stoppedChain = true; }   // Stop ends the whole task, every app
  };

  P.send = async function (text) {
    text = text != null ? String(text) : P.input.value.trim();
    if (!text || P.busy) return;
    const eng = P.engine();
    if (!eng) { P.render(); return; }
    const cloud = eng.kind === 'cloud', C = K.cloud, cs = cloud ? C.keys.settings() : null;
    if (cloud && !(await C.meter.notice(eng.provider))) return;
    if (cloud && C.meter.over(cs.cap)) { P.messages.push({ role: 'user', content: text }, { role: 'assistant', content: '', display: C.meter.capText(cs.cap), note: true, error: true }); P.input.value = ''; P.render(); return; }
    P.input.value = '';
    P.messages.push({ role: 'user', content: text });
    P.undoBtn.hidden = true; P.rollback = null;
    P.render();
    const cmd = window.SlopCmd;
    let handed = null;
    const done = [];   // this request's steps so far: they go along when the task moves
    /** The task moves to another app in this tab (handoff.js): the conversation, the task and the chain are saved in
     * sessionStorage, this run stops, and go() navigates (SlopOuttake's act, or the app's address). */
    const hop = async (rec, go) => {
      const chain = P.chain || { id: Date.now().toString(36), hop: 0 };
      if (chain.hop >= K.handoff.MAX_HOPS) throw new Error(`This task already moved through ${chain.hop} apps; it stops here.`);
      const opening = { app: rec.app.name };
      handed = { display: T('ui.ai.run.opening', opening), dk: 'ui.ai.run.opening', dv: opening, note: true, handoff: true };
      K.handoff.save({ to: rec.app.id, toName: rec.app.name, from: P.appId(), fromName: P.appName(), task: rec.task, line: rec.line, dk: rec.dk, dv: rec.dv, chain: { id: chain.id, hop: chain.hop + 1 },
        messages: K.handoff.carry([...P.messages, ...done, { role: 'assistant', display: handed.display }]) });
      P.list.append(P.view(Object.assign({ role: 'assistant' }, handed)));
      if (P.busy) P.busy.abort();   // the next app's page goes on from here
      await go();
      return `Moving to ${rec.app.name}; the task continues there.`;
    };
    const handoff = ({ app, task, url }) => hop({ app, task, line: T('ui.ai.run.continuing', { app: app.name }), dk: 'ui.ai.run.continuing', dv: { app: app.name } }, () => { location.href = url; });
    const control = P.toolsBox.checked && !!cmd;
    if (control && cmd.prepare) { try { await cmd.prepare(); } catch (e) { console.warn('SlopCmd.prepare:', e); } }
    const ops = cloud || eng.kind === 'fake' || P.capable(eng);   // file operations: own-key models, the test engine, capable local models
    const env = { cmd, appId: P.appId(), appName: P.appName(), confirm: confirmFn, look: cloud, ops, who: cloud ? eng.provider.who : '', handoff, hop };
    // the long tail of tools is deferred: find_tools loads what the task needs (toolbox.js), for every engine
    const tools = P.toolsBox.checked ? K.toolbox.arrange(K.appTools.build(env), env) : [];
    let rollback = null;
    try { rollback = control && cmd.checkpoint ? cmd.checkpoint() : null; } catch (e) { rollback = null; }
    let changed = 0;
    const live = h('div', { class: 'sap-live' }), reply = h('div', { class: 'sap-msg assistant live' });
    live.append(reply); P.list.append(live);
    P.busy = new AbortController(); setBusy(true);
    let pieces = '';
    const steps = new Map(), spent = [], Perm = window.SlopAIPermissions;
    // approvals: the one permission module (mode, remembered rules, this visit, this request)
    const permit = (req) => Perm.ask(Object.assign({ app: P.appId(), appName: P.appName(), who: cloud ? eng.provider.who : '' }, req));
    Perm.startRequest();
    try {
      const turns = cloud ? cs.steps || 12 : MAX_STEPS;
      const res = await K.tools.run(eng, [{ role: 'system', content: K.prompt.system(tools, eng, { appName: P.appName(), capable: eng.kind === 'fake' || P.capable(eng) }) }, ...P.messages.filter((m) => !m.error && !m.note)], {
        tools, env: { confirm: confirmFn, permit }, maxSteps: tools.length ? turns : 1, maxCalls: cloud ? Math.max(MAX_CALLS, turns * 3) : MAX_CALLS, temperature: 0.3, max_tokens: 640, signal: P.busy.signal,
        onUsage: cloud ? (u) => { spent.push(u); C.meter.add(u); return C.meter.over(cs.cap) ? C.meter.capText(cs.cap) : null; } : null,
        onDelta: (t) => { pieces += t; reply.innerHTML = K.md.render(pieces.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '').trim()); P.list.scrollTop = P.list.scrollHeight; },
        onTool: ({ phase, call, tool, res: r }) => {
          if (phase === 'start') {
            const row = h('div', { class: 'sap-tool sap-step run' }, h('span', { class: 'sap-step-i', 'aria-hidden': 'true' }, ICON.run), h('span', { class: 'sap-step-t' }, stepText(tool, call)));
            if (reply.textContent.trim()) live.insertBefore(reply.cloneNode(true), reply);   // what the model said before acting stays
            steps.set(call, row); live.insertBefore(row, reply); pieces = ''; reply.textContent = '';
          } else {
            if (r.ok && tool && (tool.cmdId || (tool.cmdIdOf && tool.cmdIdOf(call.arguments || {})))) changed++;
            const row = steps.get(call);
            const msg = { role: 'tool', ok: r.ok, name: call.name, label: stepText(tool, call), content: r.ok ? r.result : 'ERROR: ' + r.error, media: r.media };
            done.push(msg);
            if (row) row.replaceWith(P.view(msg));
          }
          P.list.scrollTop = P.list.scrollHeight;
        },
      });
      // the steps keep their labels in the history (the model sees only name and result)
      for (const m of res.messages) if (m.role === 'tool') { const t = tools.find((x) => x.name === m.name); m.label = stepText(t, { name: m.name, arguments: m.args }); }
      P.messages.push(...res.messages);
      if (P.busy.signal.aborted && !handed) { const dk = P.stoppedChain ? 'ui.ai.run.stopped_chain' : 'ui.ai.run.stopped'; P.messages.push({ role: 'assistant', content: '', display: T(dk), dk, note: true }); }
      P.stoppedChain = false;
    } catch (e) {
      const msg = cloud ? K.cloud.redact((e && e.message) || e) : (e && e.message) || e;
      P.messages.push({ role: 'assistant', content: '', display: cloud && e && e.kind ? msg : T('ui.ai.run.went_wrong', { error: msg }), dk: cloud && e && e.kind ? null : 'ui.ai.run.went_wrong', dv: { error: msg }, error: true });
    }
    if (handed) P.messages.push(Object.assign({ role: 'assistant', content: '' }, handed));
    if (cloud && spent.length) {
      const u = spent.reduce((a, x) => ({ input: a.input + (x.input || 0), output: a.output + (x.output || 0), cacheRead: a.cacheRead + (x.cacheRead || 0), cost: a.cost == null || x.cost == null ? null : a.cost + x.cost }), { input: 0, output: 0, cacheRead: 0, cost: 0 });
      P.messages.push({ role: 'assistant', content: '', display: `${C.meter.line(u)} · ${C.meter.totalLine(cs.cap)}`, detail: C.meter.detail(spent), note: true, meter: true });
    }
    Perm.endRequest();   // "Allow for this request" ends with the reply
    P.busy = null; setBusy(false);
    P.rollback = changed && typeof rollback === 'function' ? rollback : null;
    P.render();
    P.undoBtn.hidden = !P.rollback;
    P.undoN = P.rollback ? changed : 0; P.words();
  };

  P.undoAll = function () {
    const r = P.rollback;
    P.rollback = null; P.undoBtn.hidden = true; P.undoN = 0; P.words();
    if (!r) return;
    let ok = true;
    try { ok = r() !== false; } catch (e) { ok = false; console.warn(e); }
    const dk = ok ? 'ui.ai.run.undid' : 'ui.ai.run.undo_failed';
    P.messages.push({ role: 'assistant', content: '', display: T(dk), dk, note: true, error: !ok });
    P.render();
  };
})();
