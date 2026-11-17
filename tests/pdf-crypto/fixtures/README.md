# PDF encryption fixtures

Encrypted by another program (qpdf 12.2.0, the static Linux build from the qpdf GitHub release), so the tests of
`shared/pdf-crypto/` check against an independent implementation. The plain file is a one-page pdf-lib document titled
"Fixture" with the text "Known answer page". Used by `tests/node/pdf-crypto.test.mjs` and `crypto.test.html`.

| File | Made with | Passwords | File key (`qpdf --show-encryption-key`) |
|---|---|---|---|
| `qpdf-aes256.pdf` | `--object-streams=generate --encrypt --user-password=sesame --owner-password=Ëigner --bits=256 --print=none --extract=n` | user `sesame`, owner `Ëigner` (UTF-8) | `01a92594dbd6c6a64d489ea258c56fd4a6769fcc4fa0e94fb5f3009aa4add109` (R 6, P -2072) |
| `qpdf-aes128.pdf` | `--object-streams=generate --encrypt --user-password=sesame --owner-password=owner128 --bits=128 --use-aes=y` | user `sesame`, owner `owner128` | `f3fa7bc2ff20a80ad535d38d1291d9f5` (R 4, P -4) |
| `qpdf-rc4-40.pdf` | `--allow-weak-crypto --encrypt --user-password= --owner-password=owner40 --bits=40 --print=n` | no user password, owner `owner40` | `d5b5e57442` (R 2, P -8) |

## qpdf check of the files this module writes (2026-10-24)

`qpdf --check --password=<user or owner>` on the output of `encryptPdf` (AES-256, R 6): "PDF Version: 1.7 extension level 8,
R = 6, P = -2072 ... No syntax or stream encoding errors found"; a wrong password gives "invalid password";
`qpdf --show-encryption` lists AESv3 for streams, strings and files and the permissions that were asked for, and
`qpdf --decrypt` gives back the text and the title. The Node test repeats the check when qpdf is installed (`QPDF=<path>`).
