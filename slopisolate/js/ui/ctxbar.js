/* SlopIsolate — the context bar above the stage: tool buttons, brush size and hardness (keep and remove
 * only), the preview view switch, and zoom controls. The zoom text (.tb-zoom) is written by render/view.js. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, t = U.t;
  const X = CO.ctxbar = {};
  const $ = U.$;
  const TOOLS = [['pan', 'hand', 'cutout.bar.pan', 'H'], ['keep', 'keep', 'cutout.bar.keep', 'K'], ['remove', 'remove', 'cutout.bar.remove', 'R']];
  const VIEWS = () => [['result', t('cutout.bar.result')], ['before', t('cutout.bar.before')], ['split', t('cutout.bar.split')], ['mask', t('cutout.bar.mask')]];
  let bar = null, toolBtns = [], brushGroup = null, viewGroup = null;

  const isBrush = () => S.tool === 'keep' || S.tool === 'remove';

  function toolGroup() {
    toolBtns = TOOLS.map(([id, icon, k, key]) => {
      const label = t(k);
      const b = U.btnIcon(U.h('button', { type: 'button', class: 'seg-b', 'data-tool': id, title: t('cutout.bar.tool_tip', { label, key }), 'aria-label': label }), icon, label);
      b.addEventListener('click', () => S.setTool(id));
      return b;
    });
    return U.h('div', { class: 'seg', role: 'group', 'aria-label': t('cutout.bar.tool') }, ...toolBtns);
  }
  function syncTools() {
    for (const b of toolBtns) {
      const on = b.dataset.tool === S.tool;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /** Size and hardness sliders. Their live input drives S.setBrush (the brush needs no undo history). */
  function brushControls() {
    const size = CO.kit.slider({
      label: t('cutout.bar.size'), min: 4, max: 240, step: 1, value: S.brush.size, fmt: (v) => Math.round(v) + ' px',
      onInput: (v) => S.setBrush({ size: Math.round(+v) }), onCommit: () => {},
    });
    const hard = CO.kit.slider({
      label: t('cutout.bar.hardness'), min: 0, max: 1, step: 0.01, value: S.brush.hardness, fmt: (v) => Math.round(v * 100) + '%',
      onInput: (v) => S.setBrush({ hardness: +v }), onCommit: () => {},
    });
    return U.h('div', { class: 'ctx-group' }, size, hard);
  }

  function viewControls() {
    viewGroup = U.h('div', { class: 'ctx-group' });
    renderView();
    return viewGroup;
  }
  /** Rebuild the view switch (the kit control has no value setter, so it is re-rendered on each view change). */
  function renderView() {
    viewGroup.replaceChildren(CO.kit.seg({ options: VIEWS(), value: S.view, onChange: (v) => S.setView(v) }));
  }

  function zoomControls() {
    const btn = (icon, label, fn) => {
      const b = U.btnIcon(U.h('button', { type: 'button', class: 'tb', title: label, 'aria-label': label }), icon);
      b.addEventListener('click', fn);
      return b;
    };
    const centre = () => { const st = $('#stage'); return [st ? st.clientWidth / 2 : 0, st ? st.clientHeight / 2 : 0]; };
    const zoom = (f) => () => { const [x, y] = centre(); CO.view.zoomAt(f, x, y); };
    const text = U.h('span', { class: 'tb-zoom' }, CO.view.zoomPct() + '%');
    return U.h('div', { class: 'ctx-group' },
      btn('zoomout', t('cutout.bar.zoom_out'), zoom(1 / 1.25)),
      text,
      btn('zoomin', t('cutout.bar.zoom_in'), zoom(1.25)),
      btn('fit', t('cutout.bar.fit'), () => CO.view.fit()));
  }

  /** The bar's controls (again after a language change). */
  function build() {
    brushGroup = U.h('div', { class: 'ctx-brush' }, brushControls());
    bar.replaceChildren(
      U.h('div', { class: 'ctx-group' }, toolGroup()),
      brushGroup,
      U.h('span', { class: 'tb-flex' }),
      viewControls(),
      zoomControls());
    syncTools();
    syncBrush();
  }

  X.init = function () {
    bar = $('#ctxbar');
    if (!bar) return;
    build();
    U.onLang(build);
    CO.on('tool', () => { syncTools(); syncBrush(); });
    CO.on('view', renderView);
  };

  function syncBrush() { if (brushGroup) brushGroup.hidden = !isBrush(); }
  X.syncBrush = syncBrush;
})();
