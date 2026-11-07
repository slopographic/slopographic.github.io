/* The camera RAW converter pages (convert/<slug>/), added to PAGES in pages.js. Same fields as the other pages. Every claim
 * here is what core/raw.js and shared/raw/ do: LibRaw 0.22.1 in WebAssembly, downloaded once (about 1.4 MB) after a notice,
 * the White balance, Exposure and Highlights options, JPG / PNG / WebP output, the embedded preview as the fallback. */
import { withWords } from './page-words.js';
const cat = 'Camera RAW';
const ENGINE = 'The RAW file is developed by LibRaw, the open-source RAW decoder, compiled to run in your browser. The first time, the page asks before it downloads the engine (about 1.4 MB) from the Slopographic cdn; it is checked against its SHA-256 and kept by the browser.';
const OPTIONS = 'Choose the white balance (as shot, auto or daylight), the exposure (−2 to +2 EV) and how blown highlights are handled (clip, blend or rebuild). The picture is turned upright as the camera recorded it and saved in sRGB.';
const PREVIEW = 'The preview on the page shows the JPEG the camera stored inside the RAW file, so dropping a file downloads nothing. Convert develops the RAW data itself.';
const PRIVATE_Q = ['Is my RAW file uploaded?', 'No. The file is read and developed in your browser, on this device. Only the engine is downloaded, once; your photos are never sent anywhere.'];
const DECLINE_Q = ['What if I do not want the engine download?', 'Choose Cancel in the notice. The converter then uses the JPEG preview the camera stored in the file, and the status line says so. Many cameras store a full-size preview; some store a smaller one.'];
const WB_Q = ['Which white balance should I pick?', 'As shot uses the white balance the camera recorded, which is what the camera\'s own JPEG used. Auto works it out from the picture. Daylight uses the camera\'s fixed daylight setting.'];

const page = (ext, maker, label, extra) => ({
  slug: `${ext}-to-jpg`, conv: 'raw-to-jpg', from: [ext], pair: [ext.toUpperCase(), 'JPG'], cat,
  h1: `${ext.toUpperCase()} to JPG converter`,
  title: `${ext.toUpperCase()} to JPG converter for ${maker} RAW photos, free | File convert`,
  description: `Convert ${maker} ${ext.toUpperCase()} RAW files to JPG in your browser. White balance, exposure and highlight options, full size or resized. Nothing is uploaded.`,
  lead: `${label} Drop the file and get a JPG you can share, print or post, developed on your own device.`,
  how: [`Drop one or more .${ext} files. ${ENGINE}`, OPTIONS, PREVIEW],
  faq: [extra, WB_Q, DECLINE_Q, PRIVATE_Q],
});

export const RAW_PAGES = withWords([
  page('cr2', 'Canon', 'CR2 is the RAW format of Canon DSLRs such as the EOS 5D Mark III, 6D, 7D, 80D and Rebel series.',
    ['Can I open CR2 files from any Canon camera?', 'LibRaw reads CR2 from Canon\'s DSLRs and compact cameras, including the smaller sRAW and mRAW files.']),
  page('cr3', 'Canon', 'CR3 is the RAW format of newer Canon cameras, such as the EOS R series, the M50, the 90D and the R5.',
    ['Does it read CR3 from the EOS R cameras?', 'Yes. LibRaw 0.22.1 reads CR3, including the C-RAW compressed files. The preview on the page comes from the JPEG inside the CR3 file.']),
  page('nef', 'Nikon', 'NEF is the RAW format of Nikon cameras, from the D-series DSLRs to the Z mirrorless cameras.',
    ['Are compressed NEF files supported?', 'Lossless and lossy compressed NEF files are read. A NEF from a camera newer than LibRaw 0.22.1 may not be, and then the camera\'s embedded JPEG is used.']),
  page('arw', 'Sony', 'ARW is the RAW format of Sony Alpha cameras, such as the A7 series and the A6000 family.',
    ['Does it read compressed ARW?', 'Yes, compressed and uncompressed ARW files are read by LibRaw. The status line says when the embedded preview had to be used instead.']),
  page('dng', 'phone and camera', 'DNG is the open RAW format from Adobe, used by Leica, Pentax, Ricoh, many phones and the Adobe DNG Converter.',
    ['Can it convert DNG from my phone?', 'Phones that save RAW as DNG, such as Pixel phones and Samsung\'s Pro mode, give DNG files that LibRaw reads, and lossy (JPEG compressed) DNG works too. A DNG compressed with JPEG XL, as some recent iPhones write, may not be read; then the embedded preview is used.']),
  page('raf', 'Fujifilm', 'RAF is the RAW format of Fujifilm cameras, including the X-Trans sensors of the X series.',
    ['Does it handle Fujifilm X-Trans?', 'Yes. LibRaw demosaics X-Trans RAF files. It does not apply Fujifilm\'s film simulations, which are made in the camera, so colours can differ from the camera JPEG.']),
]);
