/* Slop PDF passwords (shared/pdf-crypto through pdf/js/io/decrypt.js): the password code loads only for a protected file,
   the qpdf AES-256 fixture opens with its password and its security is recorded (never the password), the notice's
   Remove password / Keep the password, protect on download read back with pdf.js, and the Protect with password command. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const PW = 'sesame', NEW = 'Tr0ub4dor&3';
  const doc = () => PT.win.document;
  const qpdf = async () => new PT.win.Uint8Array(await (await fetch('../pdf-crypto/fixtures/qpdf-aes256.pdf')).arrayBuffer());
  async function openQpdf() {
    PT.reset();
    const orig = PT.A.askPassword;
    PT.A.askPassword = () => Promise.resolve(PW);
    try { return await PT.open(await qpdf(), 'qpdf-aes256.pdf'); } finally { PT.A.askPassword = orig; }
  }
  /** pdf.js on bytes with a password: { doc } or { name, code } of the refusal. */
  async function pdfjs(bytes, password) {
    const lib = await PT.E.pdfjs();
    try { return { doc: await lib.getDocument(PT.E.docParams(new PT.win.Uint8Array(bytes), password)).promise }; }
    catch (e) { return { name: e.name, code: e.code }; }
  }
  const textOf = async (d) => (await (await d.getPage(1)).getTextContent()).items.map((t) => t.str).join(' ');
  const dialog = () => [...doc().querySelectorAll('.sui-dlg')].find((b) => /Download PDF/.test(b.querySelector('.sui-title').textContent));
  const checks = (dlg) => [...dlg.querySelectorAll('.sui-check input')].map((c) => c.checked);
  const notice = () => doc().querySelector('.pw-notice');
  function leaks(secret) {
    const ls = JSON.stringify(Object.assign({}, PT.win.localStorage));
    const files = JSON.stringify([...PT.E.files.values()].map((f) => ({ security: f.security, name: f.name })));
    return [ls, files, doc().getElementById('statusMsg').textContent, doc().body.innerText].filter((t) => t.includes(secret)).length;
  }

  describe('Slop PDF passwords', () => {
    it('a plain PDF does not load the password code', async () => {
      await PT.boot();
      PT.U.store.set('autosave', false); PT.A.setAutosave(false);
      await PT.open(await PT.makePdf([{ text: 'Plain' }]), 'plain.pdf');
      expect(PT.E.state.pages.length).toBe(1);
      expect(!!PT.win.SlopPdfCrypto).toBe(false);
      expect(doc().querySelectorAll('script[src*="/shared/pdf-crypto/"]').length).toBe(0);
      expect(notice().hidden).toBe(true);
    }, { timeout: 60000 });

    it('opens the qpdf AES-256 file with its password and records what security it had, not the password', async () => {
      const f = await openQpdf();
      expect(f.decrypted).toBe(true);
      expect(f.locked).toBe(null);
      expect(!!PT.win.SlopPdfCrypto.encryptPdf).toBe(true);
      expect(PT.SP.decrypt.isEncrypted(f.bytes)).toBe(false);
      const s = f.security;
      expect([s.encrypted, s.R, s.bits, s.method, s.owner]).toEqual([true, 6, 256, 'AESV3', false]);
      expect([s.permissions.print, s.permissions.copy, s.permissions.modify]).toEqual([false, false, true]);
      expect(JSON.stringify(f.security).includes(PW)).toBe(false);
      expect(leaks(PW)).toBe(0);
      const out = await PT.read(await PT.E.build());
      expect(out.pages[0].text).toContain('Known answer page');
    }, { timeout: 30000 });

    it('says the file had a password; Remove password downloads it without one', async () => {
      await waitFor(() => notice() && !notice().hidden);
      expect(notice().textContent).toContain('This PDF had a password.');
      expect(notice().textContent).toContain('Downloads have no password unless you add one');
      const cap = PT.captureDownloads();
      try {
        notice().querySelector('.pw-remove').click();
        await waitFor(() => cap.list.length === 1, { timeout: 20000 });
      } finally { cap.restore(); }
      const bytes = await PT.bytesOf(cap.list[0].blob);
      expect(PT.SP.decrypt.isEncrypted(bytes)).toBe(false);
      const r = await pdfjs(bytes);
      expect(await textOf(r.doc)).toContain('Known answer page');
    }, { timeout: 30000 });

    it('Keep the password opens the protect section with the original permissions and downloads it protected', async () => {
      notice().querySelector('.pw-keep').click();
      const dlg = await waitFor(dialog);
      expect(checks(dlg)).toEqual([true, false, false, true]);   // protect on; printing and copying off as in the original
      const pw = dlg.querySelector('input[name=pw]'), pw2 = dlg.querySelector('input[name=confirm]');
      // the two passwords must match: the dialog stays open and says so
      pw.value = NEW; pw2.value = 'other';
      const cap = PT.captureDownloads();
      let bytes;
      try {
        dlg.querySelector('.sui-primary').click();
        await waitFor(() => !dlg.querySelector('.sp-err').hidden);
        expect(dlg.querySelector('.sp-err').textContent).toContain('not the same');
        expect(!!dialog()).toBe(true);
        pw2.value = NEW;
        dlg.querySelector('.sui-primary').click();
        await waitFor(() => cap.list.length === 1, { timeout: 30000 });
        bytes = await PT.bytesOf(cap.list[0].blob);
      } finally { cap.restore(); }
      expect([pw.value, pw2.value]).toEqual(['', '']);   // emptied once the download started
      expect(PT.SP.decrypt.isEncrypted(bytes)).toBe(true);
      expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('%PDF-1.7');
      expect(leaks(NEW)).toBe(0);
      expect(doc().getElementById('statusMsg').textContent).toContain('password-protected');
      // pdf.js asks for the password, refuses a wrong one and opens with the right one
      const lib = await PT.E.pdfjs();
      expect(await pdfjs(bytes)).toEqual({ name: 'PasswordException', code: lib.PasswordResponses.NEED_PASSWORD });
      expect(await pdfjs(bytes, 'wrong')).toEqual({ name: 'PasswordException', code: lib.PasswordResponses.INCORRECT_PASSWORD });
      const r = await pdfjs(bytes, NEW);
      expect(await textOf(r.doc)).toContain('Known answer page');
      const perms = await r.doc.getPermissions(), F = lib.PermissionFlag;
      expect([perms.includes(F.PRINT), perms.includes(F.COPY), perms.includes(F.MODIFY_CONTENTS)]).toEqual([false, false, true]);
      const info = await PT.SP.decrypt.inspect(bytes);
      expect([info.R, info.bits, info.method]).toEqual([6, 256, 'AESV3']);
    }, { timeout: 60000 });

    it('Protect with password… is a command and a File menu item, with every permission on; unchecked it downloads plain', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'Command' }]), 'cmd.pdf');
      const C = PT.win.SlopCmd, c = C.list().find((x) => x.id === 'file.protect');
      expect(!!c).toBe(true);
      expect(c.title).toBe('Protect with password…');
      expect(c.group).toBe('File');
      for (const k of ['password', 'encrypt', 'lock', 'secure']) expect(c.keywords).toContain(k);
      expect(c.enabled).toBe(true);
      expect(PT.A._.fileMenu().some((x) => x && x.label === 'Protect with password…')).toBe(true);
      expect(notice().hidden).toBe(true);   // this file never had a password
      C.run('file.protect');
      const dlg = await waitFor(dialog);
      expect(checks(dlg)).toEqual([true, true, true, true]);
      // an empty password is refused
      dlg.querySelector('.sui-primary').click();
      await waitFor(() => !dlg.querySelector('.sp-err').hidden);
      expect(dlg.querySelector('.sp-err').textContent).toContain('Type a password');
      // unchecked: a plain download
      const on = dlg.querySelector('.sui-check input');
      on.checked = false; on.dispatchEvent(new PT.win.Event('change'));
      expect(dlg.querySelector('.pp-protect-fields').hidden).toBe(true);
      const cap = PT.captureDownloads();
      try {
        dlg.querySelector('.sui-primary').click();
        await waitFor(() => cap.list.length === 1, { timeout: 20000 });
      } finally { cap.restore(); }
      expect(PT.SP.decrypt.isEncrypted(await PT.bytesOf(cap.list[0].blob))).toBe(false);
      // with no pages it is off
      PT.reset();
      expect(C.list().find((x) => x.id === 'file.protect').enabled).toBe(false);
    }, { timeout: 60000 });
  });
})();
