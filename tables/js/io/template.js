/* Slop Tables template file (.stab-template): a JSON document with a name, a short description and one
   workbook in the .stab format. Parsing validates everything first (checkNative, then a full build), so a
   broken file is rejected before anything is kept; the caller only stores what parseTemplate returns. */
import { fromNative, checkNative } from './native.js';
import { t } from '../i18n.js';

export const TEMPLATE_FORMAT = 'slop-tables-template', TEMPLATE_VERSION = 1;
export const TEMPLATE_MIME = 'application/x-slop-table-template', TEMPLATE_EXT = 'stab-template';

/** A template entry ({ name, description, native }) → Blob for download or Slop Drive. */
export function toTemplateBlob({ name, description = '', native }) {
  const obj = { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, name, description, workbook: native };
  return new Blob([JSON.stringify(obj, null, 1)], { type: TEMPLATE_MIME });
}

/** Text of a template file → { name, description, native }. Throws an Error that says what is wrong. */
export function parseTemplate(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error(t('tables.tpl.err_json')); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== TEMPLATE_FORMAT) throw new Error(t('tables.tpl.err_not_template'));
  if (obj.version !== TEMPLATE_VERSION) throw new Error(t('tables.tpl.err_version'));
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 80) : '';
  if (!name) throw new Error(t('tables.tpl.err_no_name'));
  const description = typeof obj.description === 'string' ? obj.description.slice(0, 300) : '';
  checkNative(obj.workbook);
  fromNative(obj.workbook); // a full build: anything that would fail to open fails here, before any change
  return { name, description, native: obj.workbook };
}
