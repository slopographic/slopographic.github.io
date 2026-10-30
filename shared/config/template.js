/* The shared 'template' data shape: a list of pages, each with blocks. A sheet is a page with a table block; a slide is a
 * page with heading, text and list blocks. Apps that ship templates register kind 'template' with
 * SlopConfig.templateSchema, then map the data to and from their own store in apply and read. Limits: 200 pages, 200
 * blocks per page, 1000 rows of 100 cells per table, 5000 characters of text. Exposes SlopConfig.templateSchema. */
(function (g) {
  'use strict';
  const C = (g.SlopConfig = g.SlopConfig || {});
  const { F, consts: { LIMITS } } = C;

  const BLOCK = F.obj({
    type: F.enum(['heading', 'text', 'list', 'table'], { required: true, desc: 'heading and text use "text"; list uses "items"; table uses "rows"' }),
    text: F.text({ desc: 'the words of a heading or paragraph' }),   // i18n-ignore: schema notes for the AI prompt
    items: F.list(F.str({ max: 500 }), { desc: 'bullet points, one short line each' }),   // i18n-ignore: schema notes for the AI prompt
    rows: F.list(F.list(F.cell({}), { max: LIMITS.cols }), { max: LIMITS.rows, desc: 'table rows; each row is a list of cells, top row first' }),
  });

  const PAGE = F.obj({
    name: F.str({ max: 120, required: true, desc: 'the page or sheet name' }),   // i18n-ignore: schema notes for the AI prompt
    blocks: F.list(BLOCK, { desc: 'the content of the page, in order' }),   // i18n-ignore: schema notes for the AI prompt
  });

  C.templateSchema = {
    type: 'object', strict: true,
    fields: { pages: F.list(PAGE, { min: 1, max: LIMITS.items, required: true, desc: 'the pages or sheets, in order' }) },   // i18n-ignore: schema notes for the AI prompt
  };
})(typeof window !== 'undefined' ? window : globalThis);
