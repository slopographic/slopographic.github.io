/* Slop AI — ui/builder-prompts: the system prompt that helps small models write working single-file apps, and the
 * starter templates (game, calculator, landing page). */
'use strict';
(function (AI) {
  AI.BUILDER_SYSTEM = [
    'You build small web apps. Reply with ONE complete HTML file inside a single ```html code block, then at most one short sentence.',
    'Rules:',
    '1. Everything in one file: CSS in <style>, JavaScript in <script>. No external files, no CDNs, no imports, no fetch, no images from the web.',
    '2. Plain JavaScript, no frameworks. Use document.getElementById and addEventListener. Define every function before you use it.',
    '3. Start with <!doctype html> and include <meta name="viewport" content="width=device-width, initial-scale=1">.',
    '4. Work on phones and desktops: flexible layout, big touch-friendly buttons, readable font sizes.',
    '5. localStorage, cookies, alert() and pop-ups are blocked in the preview. Keep state in variables and show messages on the page.',
    '6. Games: use one <canvas> and requestAnimationFrame; support both the keyboard and touch or clicks; show the score and a restart button.',
    '7. When the user asks for a change, reply with the WHOLE updated file again, never a partial snippet or a diff.',
    '8. Keep it under 200 lines. Prefer simple code that surely works over clever code.',
  ].join('\n');
  if (AI.PERSONAS) AI.PERSONAS.builder.system = AI.BUILDER_SYSTEM;

  const head = (title, css) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${css}
</style>
</head>`;

  const GAME = head('Catch the Slop', `html, body { margin: 0; height: 100%; background: #0e0e10; color: #ececef; font: 16px system-ui, sans-serif; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; touch-action: none; }
#hud { position: fixed; top: 10px; left: 12px; font-weight: 700; }
#again { position: fixed; inset: 0; margin: auto; width: 180px; height: 56px; border: 0; border-radius: 14px; background: #d4ff3a; font: 700 18px system-ui; display: none; }`) + `
<body>
<canvas id="c"></canvas>
<div id="hud">Score 0 · Lives 3</div>
<button id="again">Play again</button>
<script>
const c = document.getElementById('c'), g = c.getContext('2d'), hud = document.getElementById('hud'), again = document.getElementById('again');
let W, H, x, drops, score, lives, t, over, keys = {};
function size() { W = c.width = innerWidth; H = c.height = innerHeight; }
function reset() { size(); x = W / 2; drops = []; score = 0; lives = 3; t = 0; over = false; again.style.display = 'none'; }
addEventListener('resize', size);
addEventListener('keydown', (e) => { keys[e.key] = true; });
addEventListener('keyup', (e) => { keys[e.key] = false; });
c.addEventListener('pointermove', (e) => { x = e.clientX; });
again.addEventListener('click', reset);
function step() {
  t++;
  if (!over) {
    if (keys.ArrowLeft) x -= 9; if (keys.ArrowRight) x += 9;
    x = Math.max(40, Math.min(W - 40, x));
    if (t % Math.max(14, 40 - Math.floor(score / 5)) === 0) drops.push({ x: 20 + Math.random() * (W - 40), y: -20, v: 2 + Math.random() * 2 + score / 20 });
    for (const d of drops) d.y += d.v;
    for (const d of drops) if (!d.done && d.y > H - 60 && Math.abs(d.x - x) < 50) { d.done = true; score++; }
    for (const d of drops) if (!d.done && d.y > H) { d.done = true; lives--; }
    drops = drops.filter((d) => !d.done);
    if (lives <= 0) { over = true; again.style.display = 'block'; }
  }
  g.fillStyle = '#0e0e10'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d4ff3a';
  for (const d of drops) { g.beginPath(); g.arc(d.x, d.y, 12, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#5cc8ff'; g.fillRect(x - 45, H - 40, 90, 14);
  hud.textContent = over ? 'Game over · Score ' + score : 'Score ' + score + ' · Lives ' + lives;
  requestAnimationFrame(step);
}
reset(); step();
</script>
</body>
</html>`;

  const LANDING = head('Slime Co.', `* { box-sizing: border-box; }
body { margin: 0; font: 17px/1.5 system-ui, sans-serif; background: #f6f3ea; color: #111; }
header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; }
.hero { padding: 64px 24px; text-align: center; }
.hero h1 { font-size: clamp(36px, 8vw, 72px); line-height: 1; margin: 0 0 16px; letter-spacing: -0.03em; }
.cta { display: inline-block; padding: 14px 26px; border-radius: 999px; background: #111; color: #d4ff3a; border: 0; font: 700 17px system-ui; cursor: pointer; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding: 24px; max-width: 980px; margin: 0 auto; }
.card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 6px 20px rgba(0,0,0,.06); }
#msg { margin-top: 14px; font-weight: 600; min-height: 1.5em; }
footer { text-align: center; padding: 40px; color: #777; }`) + `
<body>
<header><b>Slime Co.</b><a href="#features">Features</a></header>
<section class="hero">
  <h1>Goo that gets things done.</h1>
  <p>Premium artisanal slime, delivered wobbly.</p>
  <button class="cta" id="cta">Get early access</button>
  <div id="msg"></div>
</section>
<section class="grid" id="features">
  <div class="card"><h3>Extra wobble</h3><p>Engineered jiggle for maximum joy.</p></div>
  <div class="card"><h3>Non-sticky*</h3><p>*Mostly. Results may vary.</p></div>
  <div class="card"><h3>Glows in the dark</h3><p>Find your slime at 3 AM.</p></div>
</section>
<footer>© Slime Co.</footer>
<script>
let n = 0;
document.getElementById('cta').addEventListener('click', () => { n++; document.getElementById('msg').textContent = n === 1 ? 'You are on the list! 🟢' : 'Still on the list (' + n + ' times).'; });
</script>
</body>
</html>`;

  /** A template's shown name (the English name, blurb and prompt below stay: the prompt is what the model is asked). */
  AI.tplName = (t) => AI.t('ai.tpl.' + t.id);
  AI.TEMPLATES = [
    { id: 'game', name: 'Game', blurb: 'Catch the falling slop', prompt: 'Make a simple arcade game: catch falling slime drops with a paddle. Keyboard and touch. Score, lives, restart.', html: GAME }, // i18n-ignore: shown through AI.tplName (ai.tpl.*)
    { id: 'calculator', name: 'Calculator', blurb: 'A neat calculator', prompt: 'Make a calculator with big buttons, a display, C and =, and keyboard support.', html: window.SlopAIKit.FAKE_APP_HTML }, // i18n-ignore
    { id: 'landing', name: 'Landing page', blurb: 'A one-page site', prompt: 'Make a landing page for a slime company: header, hero with a button, three feature cards and a footer.', html: LANDING }, // i18n-ignore
  ];
})(window.AI);
