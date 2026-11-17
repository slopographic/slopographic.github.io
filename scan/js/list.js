/* Slop Scan: the pages, in the order of the PDF. Each row: a thumbnail of the page as it will be, its number, and buttons
 * to move it up or down, take its photo again, or remove it (big enough for a finger). A tap on a row shows that page
 * (on a phone, over the list). Under the rows: Take photo and Add photos. Classic script; window.SlopScan.list: wire(), paint(). */
(function (g) {
  'use strict';
  const S = g.SlopScan, $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let timer = 0;

  function button(cls, label, icon, run, disabled) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sui-btn sc-icon ' + cls; b.title = label; b.setAttribute('aria-label', label); b.textContent = icon; b.disabled = !!disabled;
    b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
    return b;
  }
  function row(p, i, n, cur) {
    const li = document.createElement('li');
    li.className = 'sc-row' + (cur ? ' is-current' : '');
    li.dataset.id = p.id;
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'sc-open';
    open.setAttribute('aria-current', String(cur));
    const thumb = document.createElement('canvas');
    thumb.className = 'sc-thumb';
    thumb.width = 1; thumb.height = 1;
    const label = document.createElement('span');
    label.className = 'sc-label';
    label.textContent = t('scan.list.page_n', { n: i + 1 });
    const meta = document.createElement('span');
    meta.className = 'sc-meta';
    meta.textContent = t('scan.style.' + p.style) + (p.found ? '' : ' · ' + t('scan.list.check_corners'));
    open.append(thumb, label, meta);
    open.addEventListener('click', () => { S.pages.select(p.id); S.app.frame().showView(); });
    const tools = document.createElement('div');
    tools.className = 'sc-row-tools';
    tools.append(
      button('sc-up', t('scan.list.up'), '↑', () => S.pages.move(p.id, i - 1), i === 0),
      button('sc-down', t('scan.list.down'), '↓', () => S.pages.move(p.id, i + 1), i === n - 1),
      button('sc-retake', t('scan.list.retake'), '⟳', () => S.io.camera(p.id)),
      button('sc-remove', t('scan.list.remove'), '✕', () => S.pages.remove(p.id)),
    );
    li.append(open, tools);
    return { li, thumb, p };
  }
  /** The thumbnails are drawn after the rows, one per frame, so a long list shows at once. */
  function thumbs(rows) {
    let k = 0;
    const next = () => {
      const r = rows[k++];
      if (!r) return;
      const c = S.render.render(r.p, S.render.THUMB), x = r.thumb;
      x.width = c.width; x.height = c.height;
      x.getContext('2d').drawImage(c, 0, 0);
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }
  function paint() {
    const all = S.pages.all(), cur = S.pages.current(), ol = $('sc-pages');
    const rows = all.map((p, i) => row(p, i, all.length, !!cur && cur.id === p.id));
    ol.replaceChildren(...rows.map((r) => r.li));
    $('sc-count').textContent = all.length ? t('scan.list.count', { n: all.length }) : '';
    if (S.app && S.app.frame()) S.app.frame().setList(all.length > 0);
    thumbs(rows);
  }
  function wire() {
    $('sc-list-camera').addEventListener('click', () => S.io.camera());
    $('sc-list-add').addEventListener('click', () => S.io.pick());
    S.pages.on(() => { clearTimeout(timer); timer = setTimeout(paint, 60); });
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(paint);
  }
  S.list = { wire, paint };
})(window);
