# Slop Clean: handoff

Slop Clean (`clean/`) shows what a picture reveals (GPS location, camera make and model, serial numbers, software, dates,
author, copyright, the embedded thumbnail) and removes the chosen parts. Everything runs in the browser. Nothing is uploaded.

## Files

| Path | What |
|---|---|
| `index.html`, `css/clean.css` | The page (classic scripts, SlopUI dialogs, SlopCmd commands, SlopHub for Slop Drive). |
| `js/core/bytes.js` | Byte helpers: bounds checks, CRC-32, ASCII/UTF-8 text. |
| `js/core/tags.js` | Every tag in plain words, its category, and the category list (`CATS`, `resolve`, `blockGone`). |
| `js/core/tiff.js` | TIFF/EXIF: parses every IFD (main, EXIF, GPS, interoperability, thumbnail, pages) and writes a new TIFF with only the kept tags. |
| `js/core/xmp.js` | Quick look inside an XMP packet (which properties it names). |
| `js/core/jpeg.js`, `png.js`, `webp.js` | One module per format: parse, report, strip. |
| `js/core/index.js` | `detect`, `inspect`, `strip` (strips, then reads the result back), `summary`. |
| `js/io/files.js` | Reading pictures, the decode check, copy names. |
| `js/ui/report.js`, `js/ui/choices.js` | The picture cards and the "What to remove" panel. |
| `js/app/main.js` | The controller: open, drop, Drive launch, download (one file or zip), Save to Slop Drive, Replace original. |
| `../drive/js/ui/clean-action.js` | Slop Drive's "Remove metadata now" (confirmation, then a `(clean)` copy). |
| `../tests/clean/` | Tests: `core` (bytes), `decode` (real canvas pictures, same pixels), `page`, `drive-action`. Fixtures are built in code (`fixtures.js`). |

## Categories

Each finding belongs to one category. The person picks which categories to remove. Defaults: everything except the
colour profile (ICC) and the print size (DPI), which are kept unless ticked.

`location` GPS · `date` dates and times · `camera` make, model, lens · `serial` serial numbers and unique IDs ·
`software` software and computer name · `author` author and camera owner · `copyright` · `description` titles, comments,
keywords · `thumbnail` embedded thumbnail picture · `embedded` XMP, IPTC, Photoshop and other application blocks ·
`other` exposure settings and other tags · `physical` DPI · `icc` colour profile.

Picture structure (sizes, orientation, sampling, strip offsets, JPEG tables, the JFIF and Adobe headers) is never removed.
Removing it would break the picture.

## What is removed, per format

**JPEG.** Removed: APP1 (EXIF and XMP), APP13 (Photoshop and IPTC), other APPn blocks except APP0 and APP14, APP2 multi-picture
(MPF), COM comments, the JFXX thumbnail, and any data after the end-of-image marker. Kept: the picture data, the quantisation and
Huffman tables, the frame and scan headers, JFIF (APP0), Adobe (APP14) and, unless ticked, the ICC profile (APP2). The EXIF block
is rewritten with the kept tags only. If nothing is left, the block is dropped.

**PNG.** Removed: tEXt, zTXt and iTXt (by keyword: Author, Copyright, Software, Creation Time, Description, Comment, Title...),
tIME, eXIf (rewritten with the kept tags), unknown ancillary chunks, and the XMP text chunk. Kept: IHDR, PLTE, IDAT, IEND, tRNS,
gAMA, cHRM, sRGB, sBIT, bKGD, hIST, sPLT, the animation chunks, and pHYs and iCCP unless ticked. Every chunk CRC is recomputed
for rewritten chunks.

**WebP.** Removed: EXIF and XMP chunks (EXIF rewritten with the kept tags). Kept: the picture chunks and ICCP unless ticked. The
VP8X feature flags are cleared for what is gone, and the RIFF size is recalculated.

**TIFF.** Each IFD is filtered by category. The picture strips and tiles and the thumbnail are copied byte for byte; only their
offsets change. Removed: the tags in the categories above (XMP, IPTC and Photoshop tags are removed with the blocks rule below).

**Blocks rule.** XMP, IPTC, Photoshop and other application blocks can hold any personal field, so they are removed whenever
the `embedded` category is ticked or any personal category (location, date, camera, serial, software, author, copyright,
description) is removed. Keeping a field such as the date while removing the location therefore also drops the XMP packet.
The report says what is inside the packet before it goes.

**Unreadable metadata.** An EXIF block that cannot be read is removed whole, and the report says so.

## Pixels and re-encoding

The picture data is never decoded or re-encoded. Removal is byte-level, so the quality is unchanged. Every cleaned JPEG, PNG and
WebP is decoded again with `createImageBitmap` before it is offered; if it does not decode, the picture is not offered and the
original is untouched.

## Limits

- **HEIC, HEIF, AVIF and RAW are not supported.** They are reported as unsupported; nothing is written for them.
- **TIFF:** the structure is checked by reading it back. Chromium cannot draw most TIFF files, so the page shows no preview for
  them. The picture data is copied unchanged.
- **A JPEG with a compressed thumbnail inside its EXIF block** loses the thumbnail with the block (the `thumbnail` category).
- **Compressed text** (zTXt, compressed iTXt) is reported as present and removed by keyword; its text is not decompressed.
- **MakerNote** (manufacturer-specific data) is removed with the `camera` category. It can hold serial numbers and settings.
- **Multi-picture JPEGs** (MPF) lose the extra pictures with the other application data.
- **Data after the end of a JPEG** (motion photos, appended video) is removed and reported.
- **Replacing the original** only happens for a picture opened from Slop Drive, after a confirmation. Downloads and Drive saves
  are always copies.

## What removing metadata does not remove

Removing metadata does not remove what is visible in the picture. Faces, licence plates, name badges, text on signs, street
scenes and recognisable landmarks stay. A picture can reveal a location without any GPS field. Blur or crop those parts with an
image editor before you share a picture.

## Drive

- On a picture in Slop Drive, the right-click menu has "Remove metadata…" (opens Slop Clean on the file through the usual Open in
  path, with `?drive=<id>`) and "Remove metadata now" (asks, listing what goes, then writes `<name> (clean).<ext>` next to the
  original). The details panel has a "Remove metadata…" button.
- Slop Clean is a tool, not a default app: it never replaces Slop PhotoSlop as the app that opens a picture by default.
  (`tool: true` in `shared/apps.js`; `drive/js/core/io.js` ranks tools below the exact-type apps.)

## Tests

`node tests/run.mjs clean` runs the four pages. The core test builds JPEG, PNG, WebP and TIFF files with EXIF, GPS, XMP,
text chunks and a thumbnail, and checks what is found and removed. The decode test builds real canvas pictures, adds metadata,
and checks that the pixels hash the same before and after. `node tests/run.mjs drive` covers the Drive integration too.
