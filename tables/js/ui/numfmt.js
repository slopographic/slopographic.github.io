/* Number formats offered in the toolbar and the Format menu: [label id, code] (codes from the engine's fmt/; the label
   is tables.nf.<id> in the chosen language). */
import { t } from '../i18n.js';

export const NUMBER_FORMATS = [
  ['general', 'General'],
  ['number', '0.00'],
  ['thousands', '#,##0'],
  ['thousands_dec', '#,##0.00'],
  ['percent', '0%'],
  ['percent_dec', '0.00%'],
  ['currency', '"$"#,##0.00'],
  ['date', 'yyyy-mm-dd'],
];
export const nfLabel = (id) => t('tables.nf.' + id);
