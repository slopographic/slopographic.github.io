/* Slop Signature: an email signature from a short form, seen in a mock email as it is typed, then copied into Gmail,
 * Outlook or Apple Mail (Copy signature puts the formatted signature and a plain-text one on the clipboard), or taken as
 * HTML. What was typed is kept in this browser (localStorage, through try/catch) so the page opens where it was left.
 * A link may name the mail program (?mail=gmail|outlook|outlook-web|apple, from a task page): its steps open, the others
 * close, for this visit only (presetOf; unknown values are ignored, nothing is stored).
 * Random makes a whole sample signature from a seed (js/sample.js, shared/sample), shown in the seed field to make it again.
 * A picture comes in by the button, a paste, a drop on the email or the Picture box, or another app's Open in (?drive=), all
 * through SlopIntake (the 'signature' spec in form.js); the logo maker is js/logo-ui.js; copying for each mail program js/copy.js.
 * Classic script, after model.js, templates.js, form.js, logo.js, logo-ui.js, sample.js and copy.js.
 * Sets SlopSignature.app = { state, current, render, say, copy, copyFor, copyCode, download, reset, example, random, presetOf }. */
(function (g) {
  'use strict';
  const NS = (g.SlopSignature = g.SlopSignature || {});
  const M = NS.model, T = NS.templates, F = NS.form, UI = g.SlopUI;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const KEY = 'slop-signature';
  const $ = (id) => document.getElementById(id);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not kept: the page still works */ } };
  let state = load() || M.sample(), current = { html: '', text: '' };

  function render() {
    state = F.read();
    save(state);
    const s = M.clean(state);
    current = { html: T.html(s), text: T.text(s) };
    $('sgSig').innerHTML = current.html;   // the templates escape every typed value
    $('sgEmpty').hidden = !!current.html;
    const probs = M.problems(state);
    $('sgProblems').replaceChildren(...probs.map((p) => UI.el('li', null, p.text)));
    $('sgProblems').hidden = !probs.length;
    for (const id of ['sgCopy', 'sgCode', 'sgDownload', 'sgCopyGmail', 'sgCopyOutlook', 'sgCopyApple']) $(id).disabled = !current.html;
    $('sgPicNote').textContent = NS.copy.pictureNote(s);
    $('sgPicNote').hidden = !s.imageHref;
    if (NS.logoUI) NS.logoUI.draw();
  }
  const say = (t) => { $('sgMsg').textContent = t; };

  /** The signature on the clipboard for a mail program (js/copy.js); false when the browser refused. */
  async function copyFor(client) {
    if (!current.html) return false;
    const ok = await NS.copy.copyFor(client);
    if (!ok) say(tr(client === 'html' ? 'signature.msg.no_copy_html' : 'signature.msg.no_copy'));
    return ok;
  }
  const copy = () => copyFor('all');
  const copyCode = () => copyFor('html');
  function download() {
    const s = M.clean(state), name = (s.name || 'signature').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'signature';
    const page = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${M.esc(s.name || 'Signature')}</title></head><body>\n${current.html}\n</body></html>\n`;
    UI.download(new Blob([page], { type: 'text/html' }), `${name}-signature.html`);
  }
  function reset() { F.fill(M.blank()); render(); say(tr('signature.msg.cleared')); }
  function example() { F.fill(M.sample()); render(); say(''); }
  /** A random signature from a seed (a new one when none is given), with its logo drawn. Resolves the sample. */
  async function random(seed, locale) {
    const r = NS.sample.make(seed == null || seed === '' ? g.SlopSample.newSeed() : seed, locale || $('sgSeedLang').value);
    $('sgSeed').value = r.seed;
    let st = r.state;
    if (r.logo) { try { st = Object.assign({}, st, { image: await NS.logo.png(Object.assign({ colour: st.accent }, r.logo)) }); } catch (e) { /* no canvas: the signature without a logo */ } }
    F.fill(st); render();
    say(tr('signature.msg.seed', { seed: String(r.seed) }));
    return r;
  }

  const MAILS = ['gmail', 'outlook', 'outlook-web', 'apple'];
  /** The preset in a page address: { mail } when it names a known mail program, else {}. Pure. */
  function presetOf(search) {
    const mail = new URLSearchParams(search || '').get('mail');
    return MAILS.includes(mail) ? { mail } : {};
  }
  /** Opens the steps for one mail program and closes the others. */
  function showMail(mail) {
    for (const d of document.querySelectorAll('.sg-how details[data-mail]')) d.open = d.dataset.mail === mail;
  }

  function mount() {
    F.mount($('sgForm'), state, render);
    $('sgCopy').addEventListener('click', copy);
    $('sgCode').addEventListener('click', copyCode);
    $('sgDownload').addEventListener('click', download);
    $('sgReset').addEventListener('click', reset);
    $('sgExample').addEventListener('click', example);
    $('sgRandom').addEventListener('click', () => random());
    $('sgSeedGo').addEventListener('click', () => random($('sgSeed').value.trim()));
    $('sgSeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); random($('sgSeed').value.trim()); } });
    for (const [id, client] of [['sgCopyGmail', 'gmail'], ['sgCopyOutlook', 'outlook'], ['sgCopyApple', 'apple']]) $(id).addEventListener('click', () => copyFor(client));
    NS.logoUI.mount(document.querySelector('#sgForm [data-group="picture"]'));
    // a picture dropped on the email or the Picture box goes the one way in (shared/intake), like the button and a paste
    for (const t of [$('sgView'), document.querySelector('#sgForm [data-group="picture"]')]) g.SlopIntake.dropTarget(t, { to: 'signature' });
    // a language change draws the form again in the new words, with what was typed (the static text follows data-i18n)
    if (g.SlopI18n) g.SlopI18n.on(() => {
    F.mount($('sgForm'), F.read(), render);
    const pic = document.querySelector('#sgForm [data-group="picture"]');
    NS.logoUI.mount(pic); g.SlopIntake.dropTarget(pic, { to: 'signature' });
    if (NS.layout && NS.layout.relabel) NS.layout.relabel();
    render();
    });
    const preset = presetOf(location.search);
    if (preset.mail) showMail(preset.mail);
    render();
    g.SlopIntake.launch({ to: 'signature' });   // a picture another app sent (Open in Slop Signature, ?drive=)
  }

  mount();
  // SlopCmd (Ctrl+K and the assistant): the commands with arguments (js/ai-commands.js) load when the AI panel first asks
  if (g.SlopCmd) {
    g.SlopCmd.init({ app: 'signature' });
    g.SlopCmd.provide({ prepare: () => (NS.ai ? null : new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
      { src: new URL('js/ai-commands.js', location.href).href, onload: res, onerror: () => rej(new Error('Could not load ai-commands.js')) })))) });
  }
  NS.app = { get state() { return state; }, get current() { return current; }, render, say, copy, copyFor, copyCode, download, reset, example, random, presetOf };
})(typeof window !== 'undefined' ? window : globalThis);
