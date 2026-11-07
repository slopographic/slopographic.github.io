// A small real EPUB 3 book for the File convert tests, written with the shared ZIP writer: a container, a package file
// with a spine of two chapters (in another order than the manifest), a nav document left out of the spine, a picture,
// Swedish and Arabic text (arabic: false leaves it out, so a PDF needs no font download). drm: true lists the chapters in META-INF/encryption.xml, as a DRM-locked book does.
// Covers: convert/js/core/epub.js
import { writeZip } from '../../shared/office/zip.js';

const XHTML = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${title}</title><link rel="stylesheet" href="../style.css"/></head>
<body>${body}</body>
</html>`;

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:0b6b7c1e-test</dc:identifier>
    <dc:title>The Lighthouse Keeper</dc:title>
    <dc:creator>Ada Strand</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch2" href="text/chapter%202.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="pic" href="img/lamp.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`;

const ch1 = (arabic) => XHTML('One', `<section epub:type="chapter"><h1>Chapter One</h1>
<p>The <em>lamp</em> was lit at <strong>dusk</strong>, every day.</p>
<p><img src="../img/lamp.png" alt="A brass lamp"/></p>
<ul><li>Oil</li><li>Wick<ul><li>cotton</li></ul></li></ul>
<p>Göteborg, Malmö${arabic ? ' — مرحبا' : ''}</p></section>`);
const CH2 = XHTML('Two', `<h1>Chapter Two</h1><blockquote><p>Storms come in threes.</p></blockquote>
<table><tr><th>Day</th><th>Wind</th></tr><tr><td>Monday</td><td>12 m/s</td></tr></table>
<p>See <a href="ch1.xhtml#top">chapter one</a>.</p>`);
const NAV = XHTML('Contents', '<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">One</a></li></ol></nav>');

/** A 4 × 4 red PNG, drawn here. */
async function png() {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = '#f00'; g.fillRect(0, 0, 4, 4);
  return new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
}

export async function makeEpub({ drm = false, arabic = true, name = 'lighthouse.epub' } = {}) {
  const entries = [
    { path: 'mimetype', data: 'application/epub+zip', store: true },
    { path: 'META-INF/container.xml', data: '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { path: 'OEBPS/content.opf', data: OPF },
    { path: 'OEBPS/nav.xhtml', data: NAV },
    { path: 'OEBPS/text/ch1.xhtml', data: ch1(arabic) },
    { path: 'OEBPS/text/chapter 2.xhtml', data: CH2 },
    { path: 'OEBPS/img/lamp.png', data: await png() },
    { path: 'OEBPS/style.css', data: 'body { margin: 0 }' },
  ];
  if (drm) entries.push({ path: 'META-INF/encryption.xml', data: '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/text/ch1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>' });
  return new File([await writeZip(entries)], name, { type: 'application/epub+zip' });
}
