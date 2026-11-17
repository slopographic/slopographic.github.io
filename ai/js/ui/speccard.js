/* Slop AI — ui/speccard: the shareable "spec card" PNG (1200×675) of the system check. */
'use strict';
(function (AI) {
  const K = AI.K, el = AI.el;

  function fit(g, text, max) { let t = String(text); while (t.length > 3 && g.measureText(t).width > max) t = t.slice(0, -2); return t === String(text) ? t : t.replace(/.$/, '…'); }

  // The card is a picture the person shares: its words stay English (text stamped into what they make).
  const enVerdict = (v) => (v.level === 'good' ? `✅ runs well ~${v.tps} tok/s` : v.level === 'slow' ? `⚠️ slow ~${v.tps} tok/s` : '❌ won’t fit'); // i18n-ignore
  /** Draw the card; returns the canvas. */
  AI.specCard = function (sys, { W = 1200, H = 675 } = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0e0e10'); bg.addColorStop(1, '#1b1f12');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(212,255,58,.07)'; g.beginPath(); g.arc(W - 120, 90, 260, 0, Math.PI * 2); g.fill();
    const font = (w, s) => `${w} ${s}px "Inter Tight", system-ui, sans-serif`;
    g.fillStyle = '#d4ff3a'; g.font = font(800, 20); g.fillText('SLOP AI · SPEC CARD', 56, 64);
    g.fillStyle = '#ececef'; g.font = font(800, 46); g.fillText('Can my PC run local AI?', 56, 118);
    const gp = sys.gpu || {}, b = sys.browser || {}, be = sys.bench || {};
    const lines = [
      ['GPU', gp.ok ? [gp.vendor, gp.architecture, gp.description].filter(Boolean).join(' · ') || 'WebGPU adapter' : 'No WebGPU'],
      ['WebGPU', gp.ok ? (gp.isFallback ? 'software only' : 'yes') + (gp.ok ? ' · shader-f16 ' + (gp.f16 ? 'yes' : 'no') : '') : 'not available'],
      ['Speed', be.gflops ? `${be.gflops} GFLOPS · ${be.bandwidthGBs} GB/s` : 'not measured'],
      ['Machine', [sys.ramGB ? (sys.ramGB >= 8 ? '8+ GB RAM' : sys.ramGB + ' GB RAM') : '', sys.cores ? sys.cores + ' threads' : '', [b.name, b.version && String(b.version).split('.')[0]].filter(Boolean).join(' '), b.os].filter(Boolean).join(' · ')],
    ];
    let y = 176;
    for (const [k, v] of lines) {
      g.fillStyle = '#8a8a94'; g.font = font(600, 18); g.fillText(k.toUpperCase(), 56, y);
      g.fillStyle = '#ececef'; g.font = font(500, 22); g.fillText(fit(g, v, 470), 170, y); y += 40;
    }
    // verdicts
    const x0 = 680, rows = K.catalog.list;
    g.fillStyle = '#8a8a94'; g.font = font(600, 16); g.fillText('MODEL', x0, 170); g.fillText('VERDICT', x0 + 250, 170);
    let ry = 204;
    const col = { good: '#9fe03a', slow: '#ffc23a', no: '#ff5a6e' };
    for (const m of rows) {
      const v = K.sysinfo.verdict(sys, m);
      g.fillStyle = '#ececef'; g.font = font(600, 19); g.fillText(fit(g, m.name, 235), x0, ry);
      g.fillStyle = col[v.level]; g.font = font(700, 19);
      g.fillText(v.level === 'good' ? `● ~${v.tps} tok/s` : v.level === 'slow' ? `● slow ~${v.tps} tok/s` : '● won’t fit', x0 + 250, ry);
      ry += 36;
    }
    const rec = K.sysinfo.recommend(sys, rows), rm = rec && K.catalog.byId(rec);
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(56, 360, 560, 140);
    g.fillStyle = '#8a8a94'; g.font = font(600, 16); g.fillText('BEST PICK FOR THIS DEVICE', 80, 396);
    g.fillStyle = '#d4ff3a'; g.font = font(800, 36); g.fillText(fit(g, rm ? rm.name : 'Get WebGPU first', 510), 80, 444); // i18n-ignore: the card's words stay English
    g.fillStyle = '#c9c9d1'; g.font = font(500, 18); g.fillText(rm ? fit(g, `${enVerdict(K.sysinfo.verdict(sys, rm))} · ${rm.license.short}`, 510) : 'See slopographic.com/ai for how', 80, 478);
    g.fillStyle = '#8a8a94'; g.font = font(500, 18); g.fillText('Runs 100% on your device. Your chats never leave it.', 56, H - 70);
    g.fillStyle = '#ececef'; g.font = font(800, 22); g.fillText('slopographic.com/ai', 56, H - 38);
    g.fillStyle = '#6c6c76'; g.font = font(500, 15); g.fillText(new Date(sys.time || Date.now()).toLocaleDateString(), W - 170, H - 38);
    return c;
  };
  AI.specCardBlob = (sys) => new Promise((r) => AI.specCard(sys).toBlob(r, 'image/png'));

  AI.specCardDialog = async function (sys) {
    if (!sys) return;
    const blob = await AI.specCardBlob(sys), url = URL.createObjectURL(blob), name = 'slop-ai-spec-card.png';
    const file = new File([blob], name, { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    window.SlopUI.dialog({
      title: AI.t('ai.spec.title'), cls: 'ai-dlg spec-dlg', onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
      body: el('div', null, el('img', { src: url, alt: AI.t('ai.spec.title'), class: 'spec-img' })),
      buttons: [
        canShare ? { label: AI.t('ai.spec.share'), act: () => navigator.share({ files: [file], title: 'Can my PC run local AI?', text: 'My spec card from slopographic.com/ai' }).catch(() => {}) } : null, // i18n-ignore
        window.SlopHub ? { label: AI.t('ai.spec.save_drive'), act: () => window.SlopHub.saveToDrive(blob, name, { from: 'ai' }) } : null,
        { label: AI.t('ai.spec.download'), primary: true, act: () => window.SlopUI.download(blob, name) },
      ].filter(Boolean),
    });
  };
})(window.AI);
