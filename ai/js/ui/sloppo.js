/* Slop AI — ui/sloppo: Sloppo in the top bar. With a model loaded he is "AI powered" (aura, sparkles, brain hat).
 * Click him to "Ask Sloppo": a speech bubble streamed through window.SlopAI.ask (the same API the buddy uses). */
'use strict';
(function (AI) {
  const K = AI.K, el = AI.el;
  let draw = null, raf = 0, bubble = null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paint(canvas, t, big) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    if (!draw) return;
    const look = { body: 'lime', eyes: AI.E.ready() ? 'star' : 'normal', mouth: 'smile', noGlow: true, baseY: big ? 0.86 : 0.9, scale: big ? 2.1 : 2.3 };
    if (AI.E.ready()) K.powerUp.draw(g, W, H, look, t, draw);
    else draw(g, W, H, look, t);
  }
  function loop(now) {
    raf = 0;
    const t = now / 1000;
    paint(AI.$('sloppo').querySelector('canvas'), t, false);
    const hello = document.querySelector('.hello-sloppo'); if (hello) paint(hello, t, true);
    AI.$('sloppo').classList.toggle('powered', AI.E.ready());
    if (!reduce && !document.hidden) raf = requestAnimationFrame(loop);
  }
  AI.paintSloppo = () => { if (!raf) raf = requestAnimationFrame(loop); };

  AI.askSloppo = function (question) {
    if (bubble) { bubble.remove(); bubble = null; }
    const out = el('div', { class: 'say' }, AI.E.ready() ? '…' : '');
    const inp = el('input', { class: 'inp', placeholder: AI.t('ai.sloppo.placeholder'), 'aria-label': AI.t('ai.sloppo.ask') });
    const go = async (q) => {
      out.textContent = '';
      const s = window.SlopAI.ask(q || 'Say hi to me in your style.', { persona: 'sloppo' });
      AI.lastSloppo = s;
      try { for await (const piece of s) out.textContent += piece; } catch (e) { out.textContent = 'blorp. ' + e.message; }
    };
    bubble = el('div', { class: 'sloppo-bubble', role: 'dialog', 'aria-label': AI.t('ai.sloppo.ask') }, out,
      el('form', { onsubmit: (e) => { e.preventDefault(); const q = inp.value.trim(); if (q) { inp.value = ''; go(q); } } }, inp),
      el('button', { type: 'button', class: 'x', 'aria-label': AI.t('menu.close'), onclick: () => { bubble.remove(); bubble = null; } }, '×'));
    document.body.append(bubble);
    if (!AI.E.ready()) out.textContent = AI.t('ai.sloppo.no_model');
    else go(question);
    setTimeout(() => inp.focus(), 0);
    return bubble;
  };

  const MASCOT = /*profile:mascot*/true;   // the brand profile's mascot switch (set at build time)
  AI.initSloppo = function () {
    if (!MASCOT) {
      AI.$('sloppo').hidden = true; AI.paintSloppo = () => {};
      document.head.append(el('style', null, '.hello-sloppo{display:none}'));
      return;
    }
    AI.$('sloppo').onclick = () => AI.askSloppo();
    const base = new URL('../shared/sloppo/index.js', document.baseURI).href;
    import(base).then((m) => { draw = m.drawSloppo; K.powerUp.install(m.HATS); AI.paintSloppo(); }).catch((e) => console.warn('Sloppo painter unavailable', e));
    AI.on('engine', AI.paintSloppo);
    AI.on('tab', AI.paintSloppo);
    document.addEventListener('visibilitychange', AI.paintSloppo);
  };
})(window.AI);
