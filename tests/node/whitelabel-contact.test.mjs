// Covers: tools/whitelabel/profile.mjs, tools/whitelabel/emit.mjs, shared/contact/contact.js, tools/seo/footnav.mjs
// The brand profile's contact address (brand/README.md "A contact address"): the schema, the marker a build writes into
// shared/contact/contact.js (the one place the address is set), and the footer line the SEO writer bakes from it. A
// profile without one gets no contact line and no address of this site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, loadProfile, profilesDir, allProfiles, emailProblems } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers } from '../../tools/whitelabel/emit.mjs';
import { buildFootNav, footNav, footNavLinks, contactEmail } from '../../tools/seo/footnav.mjs';
import { registryWindow } from '../../tools/seo/site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('shared/contact/contact.js');
/** The address the script gives for a text of it (run bare, as the SEO writer does). */
const emailOf = (src) => { const win = {}; vm.runInNewContext(src, { window: win }); return win.SlopContact.email(); };

test('email: optional; one address, or null for none', () => {
  const s = loadProfile(DIR, 'sample');
  for (const ok of [undefined, null, 'info@example.com', 'hello.team+web@mail.example.co.uk']) {
    assert.deepEqual(emailProblems(ok), [], String(ok));
    assert.deepEqual(validate({ ...s, email: ok }), [], String(ok));
  }
  for (const bad of ['', 'info', 'info@', '@example.com', 'a b@example.com', 'mailto:info@example.com', 'info@example', '<x>@example.com', 42, true, {}, ['info@example.com'], 'a@' + 'b'.repeat(120) + '.com']) {
    assert.match(validate({ ...s, email: bad }).join('\n'), /^email: /m, JSON.stringify(bad));
  }
});

test('the marker: this site keeps its own address; a profile without one writes null; another address replaces it', () => {
  assert.match(SRC, /const EMAIL = \/\*profile:email\*\/'info@slopographic\.com';/);
  assert.equal(emailOf(SRC), 'info@slopographic.com');
  const own = loadProfile(DIR, 'slopographic');
  assert.equal(own.email, 'info@slopographic.com');
  assert.equal(applyMarkers(SRC, markerValues(own)), SRC, "this site's build changes nothing");
  for (const p of allProfiles(DIR).filter((x) => x.id !== 'slopographic')) {
    assert.equal(markerValues(p).email, null, `${p.id}: the samples have no address`);
    const built = applyMarkers(SRC, markerValues(p));
    assert.match(built, /const EMAIL = \/\*profile:email\*\/null;/, p.id);
    assert.ok(!built.includes('@slopographic'), `${p.id}: no address of this site`);
    assert.equal(emailOf(built), '', p.id);
  }
  const other = applyMarkers(SRC, markerValues({ ...loadProfile(DIR, 'sample'), email: 'hello@acme.example' }));
  assert.match(other, /const EMAIL = \/\*profile:email\*\/"hello@acme\.example";/);
  assert.equal(emailOf(other), 'hello@acme.example');
});

test('the footer line: "Contact: <address>" as a mailto link after the site map, none without an address', () => {
  const win = registryWindow(), data = { apps: win.SLOP_APPS, groups: win.SLOP_GROUP_LABELS };
  const withMail = buildFootNav({ ...data, email: 'hello@acme.example' });
  assert.ok(withMail.includes('</nav><p class="fn-contact" data-contact><span data-i18n="footer.contact">Contact</span>: <a href="mailto:hello@acme.example" data-contact-email>hello@acme.example</a></p>'));
  assert.ok(!footNavLinks(withMail).some((h) => h.startsWith('mailto:')), 'the site map lists pages only');
  const sv = buildFootNav({ ...data, email: 'hej@acme.example', word: (k, t) => (k === 'footer.contact' ? 'Kontakt' : t) });
  assert.ok(sv.includes('>Kontakt</span>: <a href="mailto:hej@acme.example"'));
  const none = buildFootNav(data);
  assert.ok(!none.includes('fn-contact') && !none.includes('mailto:'));
  assert.equal(contactEmail(), 'info@slopographic.com');
  assert.ok(footNav().includes('<a href="mailto:info@slopographic.com" data-contact-email>info@slopographic.com</a>'));
  assert.ok(read('index.html').includes('href="mailto:info@slopographic.com"'), 'the homepage carries it (run node tools/seo/write.mjs)');
});

test('the hand-made footers and the privacy page load the script and have a hidden, empty line for it', () => {
  for (const [file, n] of [['privacy/index.html', 2], ['settings/index.html', 1], ['typeface/index.html', 1]]) {
    const html = read(file);
    assert.equal((html.match(/data-contact hidden><span data-i18n="footer\.contact">Contact<\/span>: <a href="#" data-contact-email><\/a>/g) || []).length, n, file);
    assert.ok(html.includes('<script src="../shared/contact/contact.js"></script>'), file);
    assert.ok(!html.includes('mailto:'), `${file}: the address comes from the script only`);
  }
});
