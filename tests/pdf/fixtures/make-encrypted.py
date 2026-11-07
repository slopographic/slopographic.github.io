#!/usr/bin/env python3
"""Writes the encrypted PDF fixtures of Slop PDF's decryption tests (tests/pdf/pdf.spec-io.js, tests/pdf/lazy.test.html).

    python3 tests/pdf/fixtures/make-encrypted.py        (pypdf 6.21.2 with cryptography 50.0.2, from pip)

Encrypted by pypdf, not by this site's own encryptor (shared/pdf-crypto/), so the tests check the decryptor against an
independent implementation. Each file is the same two 300 x 200 pages in Helvetica, "Secret page 1" and "Secret page 2":
  locked-rc4-128.pdf     RC4 128-bit (V 2, R 3)          user password "fixture", owner password "fixture-owner"
  locked-aes-128.pdf     AES-128 (V 4, R 4, AESV2)       the same passwords
  locked-aes-256.pdf     AES-256 (V 5, R 6, AESV3)       the same passwords
  owner-only.pdf  AES-128, no user password (it opens freely), owner password "fixture-owner", every permission off
The keys, IVs and file ids are random, so a rerun writes other bytes with the same content.
"""
import os

from pypdf import PdfWriter
from pypdf.constants import UserAccessPermissions
from pypdf.generic import DictionaryObject, NameObject, StreamObject

HERE = os.path.dirname(os.path.abspath(__file__))
USER, OWNER = "fixture", "fixture-owner"
ALL = UserAccessPermissions(0xFFFFFFFF)              # every bit set (P -1)
NO_PERMISSIONS = UserAccessPermissions(0xFFFFF0C0)   # only the reserved bits set (P -3904)
FILES = [
    ("locked-rc4-128.pdf", "RC4-128", USER, ALL),
    ("locked-aes-128.pdf", "AES-128", USER, ALL),
    ("locked-aes-256.pdf", "AES-256", USER, ALL),
    ("owner-only.pdf", "AES-128", "", NO_PERMISSIONS),
]


def plain():
    """The two pages, unencrypted."""
    w = PdfWriter()
    font = w._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    }))
    for n in (1, 2):
        page = w.add_blank_page(300, 200)
        content = StreamObject()
        content.set_data(f"BT /F1 24 Tf 40 100 Td (Secret page {n}) Tj ET".encode("ascii"))
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
        page[NameObject("/Contents")] = w._add_object(content)
    return w


for name, algorithm, user, permissions in FILES:
    w = plain()
    w.encrypt(user_password=user, owner_password=OWNER, algorithm=algorithm, permissions_flag=permissions)
    with open(os.path.join(HERE, name), "wb") as f:
        w.write(f)
    print(name, algorithm)
