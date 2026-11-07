# PDF passwords (`shared/pdf-crypto/`): handoff

Adds and removes PDF passwords in the browser. One implementation for the whole site: File convert
(`convert/js/core/pdf-lock.js`) and Slop PDF (`pdf/js/io/decrypt.js`, `pdf/js/ui/protect.js`) use it. Nothing is uploaded and nothing is logged.

## What it does

- **Encrypt**: the PDF Standard security handler with **AES-256** (ISO 32000-2: V 5, R 6, crypt filter `AESV3` for strings
  and streams, Algorithms 2.A/2.B for the password hashing, 8/9/10 for `/U /UE`, `/O /OE`, `/Perms`). A user password (to
  open) and an owner password (to change the permissions); the permissions are printing (low and high quality), copying,
  editing, comments, form filling, page assembly and accessibility extraction. The header becomes `%PDF-1.7` with Adobe
  extension level 8 in the catalog (`/Extensions /ADBE`), as Acrobat and qpdf write it; a 2.0 file stays 2.0. `/ID` is kept,
  or made when missing.
- **Decrypt**: every revision of the Standard handler (RC4 40 and 128-bit, AES-128, AES-256 R5 and R6), with the user
  password, the owner password, or the empty password of a file that opens freely but has limits. Certificate handlers are
  refused (`code: 'unsupported'`).

**Approach.** pdf-lib cannot encrypt. There is an MIT library that can (`@pdfsmaller/pdf-encrypt` 1.2.0: AES-256 R6 on top
of pdf-lib, about 190 KB unpacked, one maintainer, first published February 2026; `pdf-lib-plus-encrypt` is a 2023 pdf-lib
fork, `cryptpdf` does R5 only). It was not vendored because the site already had its own reader of every revision
(Slop PDF's decryptor): vendoring an encryptor would put a second Algorithm 2.B and a second key derivation beside it,
which this module exists to avoid. The encrypting half is about 100 lines on top of the decryptor's code, and both are
checked against qpdf. So it is written here on pdf-lib's object level: the file is parsed (object streams and XRef
streams are expanded by pdf-lib's parser), every string and stream of every indirect object is encrypted with the file key
(fresh random IV each; the `/Contents` of a signature dictionary is skipped, as the standard says), the `/Encrypt`
dictionary is added afterwards (so it is never encrypted), and `PDFWriter` writes a classic cross-reference table. Writing
with a table, not object streams, means there are no XRef streams to exempt and no object-stream members to treat
differently, which is simpler than a post-save byte pass. Crypto is WebCrypto (AES-CBC, SHA-256/384/512); MD5 and RC4
are small pure functions (only read, never written).

## Files (classic scripts; load in this order; each merges into `window.SlopPdfCrypto`; Node: `require` each)

| File | Holds |
|---|---|
| `legacy.js` | byte helpers, MD5, RC4, R2 to R4 key derivation and checks (moved from `pdf/js/io/decrypt.js`) |
| `aes256.js` | AES via WebCrypto, Algorithm 2.A/2.B (`keyR6`, `hashR6`), `makeR6` (8, 9, 10), `readPerms` (13), `toP`/`fromP` |
| `security.js` | `parseRaw` (pdf-lib parse with encrypted object streams held back), `readEncrypt`, `fileKey`, per-object `cipher` |
| `decrypt.js` | `isEncrypted`, `decryptPdf`, `inspect`, `mapStrings` |
| `encrypt.js` | `encryptPdf` |

pdf-lib must be loaded first (`window.PDFLib`, or pass `opts.PDFLib`).

## API

```js
const C = window.SlopPdfCrypto;
C.isEncrypted(bytes)                                  // cheap scan for /Encrypt
await C.inspect(bytes)                                // { encrypted:false } or { encrypted, R, V, method:'RC4'|'AESV2'|'AESV3',
                                                      //   bits, P, permissions:{print,copy,modify,annotate,fillForms,
                                                      //   accessibility,assemble,printHigh}, needsPassword }
await C.decryptPdf(bytes, password, { useObjectStreams }) // Uint8Array, or null when not encrypted;
                                                      // throws Error .code 'password' | 'unsupported'
await C.encryptPdf(bytes, { userPassword, ownerPassword, permissions, currentPassword, encryptMetadata })
                                                      // ownerPassword blank: 32 random characters nobody knows;
                                                      // permissions: each allowed unless false; printHigh follows print,
                                                      // assemble follows modify; an already-protected input is decrypted
                                                      // first with currentPassword (or '')
```

## Slop PDF: how to wire it (done: see pdf/HANDOFF.md "Passwords"; the scripts load on demand from `<template id="pdf-crypto">`)

1. **Load the scripts** in `pdf/index.html` where `js/io/decrypt.js` is loaded now, before it:
   `../shared/pdf-crypto/{legacy,aes256,security,decrypt,encrypt}.js` (with `data-src="shared/pdf-crypto/…"` like the
   other shared scripts), and add the five paths to both Slop PDF lists in `shared/offline/manifest.js` (lines with
   `pdf/js/io/decrypt.js`), so the offline build and the precache have them.
2. **Replace `pdf/js/io/decrypt.js`'s body** with a shim, so `pdfjs.js` (`E.registerPdf`) keeps working unchanged and the
   MD5/RC4/AES code exists once:
   ```js
   (function () { 'use strict'; var SP = window.SP = window.SP || {}, C = window.SlopPdfCrypto;
     SP.decrypt = { isEncrypted: C.isEncrypted, decryptPdf: function (b, pw) { return C.decryptPdf(b, pw || ''); },
       inspect: C.inspect, md5: C.md5, rc4: C.rc4 }; })();
   ```
   (`SP.decrypt.md5`/`rc4` were exported before; grep for other users before dropping them.) Same contract: bytes or null,
   errors with `.code` `'password'`/`'unsupported'`.
3. **Remember what the file had**: in `E.registerPdf`, when `decrypted` is true, also keep
   `f.security = await C.inspect(bytes)` (the original bytes) and whether the typed password was the owner's. The password
   itself must not be stored on `f`, in the edit log, the session (`io/session.js`, `io/doc-state.js`) or Drive metadata.
4. **Export with a password** (Download / Export dialog, `pdf/js/ui/exports.js` `A.download`): add a "Protect with a
   password" section (unchecked by default): Password, Confirm, and Allow printing / copying / editing checkboxes. Build
   and **validate first** (`E.validate` opens the output with pdf.js, which would ask for the password), then:
   ```js
   if (prot.on) bytes = await SlopPdfCrypto.encryptPdf(bytes, { userPassword: prot.pw, ownerPassword: prot.owner || '',
     permissions: { print: prot.print, copy: prot.copy, modify: prot.edit, annotate: prot.edit, assemble: prot.edit } });
   ```
   Clear the password inputs as soon as the download starts (success or error); never put them in `A.status`, toasts,
   `console`, `A.lastOutput` metadata or localStorage. Name the file as usual. Saving to Slop Drive (`A.saveToDrive`) can
   take the same option.
5. **Command "Protect with password…"** (`pdf/js/ui/commands.js`, group File, keywords `password encrypt lock secure`):
   opens the export dialog with the protect section on (or a small SlopUI dialog with the same fields that calls
   `A.download` with them). Enabled when there are pages.
6. **"Remove password"**: when the open file was encrypted (`f.decrypted` / `f.security`), show a notice in the file
   info ("This PDF had a password. Downloads have no password unless you add one.") with a **Remove password** action,
   which is just a plain Download, and a **Keep the password** action, which opens step 4 with the protect section on
   and the permissions preset from `f.security.permissions`. Today Slop PDF already saves decrypted files without a
   password silently; say so, so nobody is surprised.
7. **Tests**: `tests/pdf/` page: open `tests/pdf-crypto/fixtures/qpdf-aes256.pdf` (password `sesame`), export with a new
   password, reopen in pdf.js with it (asks, opens, the text is there), and the plain export has no `/Encrypt`.

## Tests

- `tests/node/pdf-crypto.test.mjs`: MD5/RC4 vectors; `/P` values equal qpdf's (-4, -2072); Algorithm 2.B and 2.A against
  qpdf-made files (user and non-ASCII owner password give the key qpdf reports); R4 AES-128 and R2 RC4 keys; decryption of
  the qpdf files (object streams too); `makeR6` round trip; encrypt → decrypt round trips (strings with escapes, the
  content stream, pictures byte for byte); permissions-only files; re-protecting a protected file; `qpdf --check` of the
  output when qpdf is installed (`QPDF=<path>`; skipped otherwise).
- `tests/pdf-crypto/crypto.test.html`: pdf.js asks for the password (NEED_PASSWORD), refuses a wrong one
  (INCORRECT_PASSWORD), opens with the user and the owner password, text, title and the picture are intact, and
  `getPermissions()` reads the flags back.
- `tests/convert/pdf-lock.test.html`: the File convert conversions, their pages and the forgetting of passwords.
- Fixtures and the recorded qpdf check: `tests/pdf-crypto/fixtures/README.md`.
