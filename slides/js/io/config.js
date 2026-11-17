/* Slop Slides: the shared config kind 'template' for app 'slides' (shared/config, HANDOFF.md there). A slide is a page with a
   heading block (its title), a text block (the other text boxes) and a list block (bulleted paragraphs). Pictures, shapes,
   tables and the theme are not in the file. Export reads the open deck; import builds a new deck from the pages (title and
   content layouts) and opens it after the person confirms replacing the open presentation. Also the Config menu and the
   palette commands (io/config.js exposes SS.configio). Loaded after objects.js, model.js and layouts.js. */
(function () {
  'use strict';
  const SS = window.SS, C = window.SlopConfig, D = window.SlopConfigDialog;
  const APP = 'slides';
  const CFG = (SS.configio = {});

  /** The paragraphs of a text object as plain strings, with whether each is bulleted. */
  function paras(o) {
    return ((o.text && o.text.paras) || []).map((p) => ({
      t: (p.runs || []).map((r) => r.t || '').join(''), bullet: !!p.bullet && p.bullet !== 'none',
    }));
  }

  /** The deck as pages: one per slide. A text box holding only bullets is a list; others are text. */
  function pagesOf(deck) {
    return { pages: deck.slides.map((s, i) => {
      const blocks = [];
      const title = s.objects.find((o) => o.type === 'text' && o.placeholder === 'title');
      const head = title ? paras(title).map((p) => p.t).join(' ').trim() : '';
      if (head) blocks.push({ type: 'heading', text: head.slice(0, 5000) });
      for (const o of s.objects) {
        if (o.type !== 'text' || o === title) continue;
        const ps = paras(o).filter((p) => p.t.trim());
        if (!ps.length) continue;
        if (ps.every((p) => p.bullet)) blocks.push({ type: 'list', items: ps.map((p) => p.t.slice(0, 500)) });
        else blocks.push({ type: 'text', text: ps.map((p) => p.t).join('\n').slice(0, 5000) });
      }
      return { name: (head || `Slide ${i + 1}`).slice(0, 120), blocks }; // i18n-ignore
    }) };
  }

  /** Paragraph objects for a text placeholder: lines are plain, list items are bulleted. */
  const lines = (list) => SS.objects.paras(list.map(([text, bullet]) => ({ t: text, bullet: bullet ? 'disc' : 'none' })));

  /** A new deck with one slide per page. Layout: title, title and content, or title only. */
  function deckFrom(data) {
    const M = SS.model;
    const deck = M.newDeck({ empty: true });
    for (const pg of data.pages) {
      const head = pg.blocks.find((b) => b.type === 'heading');
      const body = [];
      for (const b of pg.blocks) {
        if (b.type === 'text') for (const line of String(b.text).split('\n')) body.push([line, false]);
        if (b.type === 'list') for (const item of b.items) body.push([item, true]);
      }
      const layout = body.length ? 'title-content' : head ? 'title-only' : 'blank';
      const s = M.addSlide(deck, layout);
      const title = s.objects.find((o) => o.placeholder === 'title');
      if (title && head) SS.objects.setPlain(title, head.text);
      const b = s.objects.find((o) => o.placeholder === 'body');
      if (b && body.length) b.text.paras = lines(body);
    }
    return deck;
  }

  /** Apply: the deck replaces the open presentation after the person confirms. */
  async function apply(data, ctx) {
    const deck = deckFrom(data);
    if (window.SlopUI && SS.app.deck && SS.app.deck.slides.length) {
      const t = SS.util.t;
      const ok = await SlopUI.confirm(t('slides.io.replace_title'), t('slides.io.replace_msg', { name: ctx.name }), t('menu.open'));
      if (!ok) return { ok: false, message: 'the open presentation was kept' }; // i18n-ignore (for the assistant)
    }
    SS.app.load(deck, { name: ctx.name, dirty: true });
  }

  if (C && D) {
    C.registerKind('template', APP, C.templateSchema, apply, {
      label: 'Presentation', description: 'Slides: a heading, text and bulleted lists per slide', // i18n-ignore (the config kind, API)
      read: () => pagesOf(SS.app.deck),
    });
    CFG.commands = () => D.commands({ app: APP, prefix: 'slides', example: EXAMPLE() });
    CFG.menu = () => D.menuItems({ app: APP, example: EXAMPLE() });
    D.install({ app: APP, dragover: true });
  }

  function EXAMPLE() {
    return { kind: 'template', value: { pages: [
      { name: 'Welcome', blocks: [{ type: 'heading', text: 'Welcome' }, { type: 'text', text: 'Replace this with your opening line' }] }, // i18n-ignore
      { name: 'Points', blocks: [{ type: 'heading', text: 'Three points' }, { type: 'list', items: ['First point', 'Second point', 'Third point'] }] }, // i18n-ignore
    ] } };
  }
})();
