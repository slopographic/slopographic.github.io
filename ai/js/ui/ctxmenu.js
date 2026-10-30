/* Slop AI — ui/ctxmenu: context menus for a chat message, a code block, a conversation in the list and a model card.
 * Right-click on the target, or the Menu key / Shift+F10 on it (or on a control inside it). The items are the ones the
 * target already offers as buttons or in its More menu: AI.copyText, AI.openInBuilder, AI.chat.regenerate,
 * AI.convItems (chatlist.js) and AI.modelItems (models.js). Classic script; window.AI. */
(function (AI) {
  'use strict';

  /** A chat message in the Chat view: copy it, and regenerate the last reply. */
  function messageItems(msgNode) {
    const conv = AI.chat && AI.chat.conv, idx = +msgNode.dataset.i, m = conv && conv.messages[idx];
    if (!m) return null;
    const text = m.display != null ? m.display : m.content;
    const out = [{ label: AI.t(m.role === 'user' ? 'ai.msg.copy_message' : 'ai.msg.copy_reply'), act: () => AI.copyText(text) }];
    if (m.role !== 'user' && idx === conv.messages.length - 1 && !AI.chat.busy) out.push({ label: AI.t('ai.msg.regenerate'), act: () => AI.chat.regenerate() });
    return out;
  }

  /** A code block: copy the code, or open it in the mini-app builder. */
  function codeItems(box) {
    const code = box.querySelector('code') ? box.querySelector('code').textContent : '';
    return [
      { label: AI.t('ai.msg.copy_code'), act: () => AI.copyText(code) },
      { label: AI.t('ai.msg.open_builder'), act: () => AI.openInBuilder(code) },
    ];
  }

  function resolve(target) {
    if (!target || !target.closest) return null;
    const code = target.closest('.md-code');
    if (code) return codeItems(code);
    const msg = target.closest('.msg[data-i]');
    if (msg) return msg.closest('#view-chat') ? messageItems(msg) : null;
    const conv = target.closest('.conv[data-id]');
    if (conv) { const c = AI.convById(conv.dataset.id); return c ? AI.convItems(c) : null; }
    const card = target.closest('.mcard[data-id]');
    if (card) return AI.modelItems(card.dataset.id);
    return null;
  }

  AI.initCtxMenu = function () {
    const app = document.getElementById('app');
    if (app && window.SlopCtx) SlopCtx.bind(app, resolve);
  };
  AI.ctxResolve = resolve;
})(window.AI);
