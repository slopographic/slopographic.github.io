/* Slop AI — ui/messages: rendering chat messages (markdown, code blocks with Copy / Preview, tool steps, stats). */
'use strict';
(function (AI) {
  const K = AI.K, el = AI.el;

  AI.statsText = (u) => (u ? AI.t('ai.msg.stats', { n: u.tokens, tps: String(u.tps), ttft: AI.num1(u.ttft / 1000) }) : '');

  function attChips(atts) {
    if (!atts || !atts.length) return null;
    return el('div', { class: 'atts' }, atts.map((a) => el('span', { class: 'att' }, AI.icon('clip'), a.name, el('small', null, AI.fmtBytes(a.size)))));
  }
  function toolLine(m) {
    return el('details', { class: 'msg tool' + (m.ok === false ? ' bad' : '') },
      el('summary', null, AI.icon('tool'), el('b', null, m.name), el('span', null, ' ' + AI.t(m.ok === false ? 'ai.msg.tool_failed' : 'ai.msg.tool_done'))),
      el('pre', null, String(m.content).slice(0, 3000)));
  }

  /** One message element. opts: { last, onRegen, live } */
  AI.msgEl = function (m, i, opts = {}) {
    if (m.role === 'tool') return toolLine(m);
    if (m.role === 'user') return el('div', { class: 'msg user', 'data-i': i }, el('div', { class: 'bubble' }, m.display != null ? m.display : m.content), attChips(m.attachments));
    const body = el('div', { class: 'md' + (m.error ? ' err' : ''), html: K.md.render(m.display != null ? m.display : m.content) });
    const calls = (m.toolCalls || []).map((c) => el('span', { class: 'call' }, AI.icon('tool'), `${c.name}(${Object.keys(c.arguments || {}).length ? JSON.stringify(c.arguments).slice(0, 80) : ''})`));
    const meta = el('div', { class: 'meta' },
      m.usage ? el('span', { class: 'stats' }, AI.statsText(m.usage)) : null,
      !opts.live ? el('button', { type: 'button', class: 'mini', 'data-act': 'copy-msg', title: AI.t('ai.msg.copy_reply') }, AI.t('ui.copy')) : null,
      opts.last && opts.onRegen && !opts.live ? el('button', { type: 'button', class: 'mini', 'data-act': 'regen', title: AI.t('ai.msg.regenerate') }, AI.icon('redo'), AI.t('ai.msg.regenerate')) : null);
    return el('div', { class: 'msg bot' + (opts.live ? ' live' : ''), 'data-i': i }, el('div', { class: 'avatar', 'aria-hidden': 'true' }, AI.icon('spark')),
      el('div', { class: 'col' }, calls.length ? el('div', { class: 'calls' }, calls) : null, body, meta));
  };

  /** Render a whole conversation into list. */
  AI.renderMessages = function (list, conv, opts = {}) {
    list.textContent = '';
    const ms = conv ? conv.messages : [];
    let lastBot = -1;
    ms.forEach((m, i) => { if (m.role === 'assistant') lastBot = i; });
    ms.forEach((m, i) => {
      if (m.role === 'assistant' && !m.display && !m.content && m.toolCalls && m.toolCalls.length) { list.append(AI.msgEl(Object.assign({}, m, { display: '' }), i, {})); return; }
      list.append(AI.msgEl(m, i, { last: i === lastBot && i >= ms.length - 3, onRegen: opts.onRegen }));
    });
  };

  /** Live streaming target: paints markdown at most once per frame. */
  AI.liveMsg = function (list) {
    const node = AI.msgEl({ role: 'assistant', content: '' }, -1, { live: true });
    const md = node.querySelector('.md');
    list.append(node);
    let text = '', raf = 0, tm = 0;
    const paint = () => { cancelAnimationFrame(raf); clearTimeout(tm); raf = tm = 0; md.innerHTML = K.md.render(text.replace(/<tool_call>[\s\S]*$/, '')) + '<span class="caret"></span>'; };
    return {
      node,
      add(t) { text += t; if (!raf) { raf = requestAnimationFrame(paint); tm = setTimeout(paint, 80); } }, // the timer covers throttled frames
      get text() { return text; },
      end() { paint(); node.classList.remove('live'); const c = md.querySelector('.caret'); if (c) c.remove(); },
    };
  };

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const t = el('textarea', { style: 'position:fixed;left:-9999px' }); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } t.remove();
    }
    if (btn) { const o = btn.textContent; btn.textContent = AI.t('ai.msg.copied'); setTimeout(() => { btn.textContent = o; }, 1200); }
    AI.lastCopied = text;
  }
  AI.copyText = copy;

  /** Delegated clicks for a message list: code Copy / Preview, Copy reply, Regenerate. */
  AI.wireMessageActions = function (list, getConv, { onRegen } = {}) {
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const act = b.dataset.act, msgNode = b.closest('.msg'), conv = getConv();
      const m = conv && msgNode && conv.messages[+msgNode.dataset.i];
      if (act === 'copy' || act === 'preview') {
        const box = b.closest('.md-code'), text = m ? (m.display != null ? m.display : m.content) : '';
        const blocks = K.md.codeBlocks(text), code = blocks[+box.dataset.i] ? blocks[+box.dataset.i].code : box.querySelector('code').textContent;
        if (act === 'copy') copy(code, b); else AI.openInBuilder(code);
      } else if (act === 'copy-msg' && m) copy(m.display != null ? m.display : m.content, b);
      else if (act === 'regen' && onRegen) onRegen();
    });
  };
})(window.AI);
