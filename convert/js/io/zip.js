/* ZIP reader and writer shared with the rest of the site (shared/office/zip.js). Re-exported so the
 * converters import from one place. */
export { writeZip, readZip, readText, crc32 } from '../../../shared/office/zip.js';
