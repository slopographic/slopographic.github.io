// Slop Effects boot: builds the state, the actions and the views, and wires them together. Load last (after every other
// Slop Effects file). Exposes window.SlopEffects.app for the tests and for debugging.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const $ = (id) => document.getElementById(id);

  function boot() {
    const doc = ns.core.newDoc({ name: 'Untitled', comp: ns.io.DEFAULT_COMP }); // i18n-ignore: the project's own name
    const S = ns.state.create(doc);
    const toast = (m) => { if (g.SlopUI) g.SlopUI.toast(m); };
    const act = ns.actions.create(S, { toast });
    const ka = ns.actionsKeys.create(S, act);
    const io = ns.io.create(S, act, { toast });
    io.registerConfig();

    const tr = ns.transport.mount($('fx-transport'), S, act);
    const preview = ns.preview.mount($('fx-view'), $('fx-canvas'), S, ns.media);
    S.on((what) => { if (what === 'doc' || what === 'time' || what === 'view') preview.repaint(); });
    ns.timeline.mount($('fx-timeline'), S, act);
    ns.graph.mount($('fx-graph'), S, act, ka);

    // Side panel tabs: Layer, Effects, Motion (each its own container; the others are hidden).
    const panel = $('fx-panel');
    const boxes = {
      layer: document.createElement('div'), fx: document.createElement('div'), motion: document.createElement('div'),
    };
    for (const k of Object.keys(boxes)) { boxes[k].dataset.panel = k; panel.append(boxes[k]); }
    ns.props.mount(boxes.layer, S, act, io);
    ns.propsFx.mountFx(boxes.fx, S, act);
    ns.propsFx.mountMotion(boxes.motion, S, act, ka);
    // SlopTabs (shared/ui/tabs.js) marks the tab, shows its box and gives the strips the arrow keys
    const sideTabs = g.SlopTabs.mount($('fx-tabs'), { panel: (k) => boxes[k] });
    const showTab = (name) => sideTabs.show(name);
    showTab('layer');
    // Phones: the side panel is a bottom sheet (SlopSheet, shared/ui/sheet.js), opened and closed by Properties in the
    // toolbar, with the shared ×, Escape, a tap outside and a swipe down. On a wide screen it stays in its column.
    const sheet = g.SlopSheet ? g.SlopSheet.attach({ root: $('fx-app'), panel: document.querySelector('.fx-side'), phone: '(max-width: 760px)',
      toggles: [$('fx-props')], label: ns.defs.t('effects.app.props') }) : null;

    // Timeline tabs: the timeline and the graph editor share the lower area.
    g.SlopTabs.mount($('fx-tl-tabs'), { panel: (k) => $(k === 'graph' ? 'fx-graph' : 'fx-timeline') }).show('timeline');

    // The suite rule (shared/frame/HANDOFF.md): Render, the main button, sits at the foot of the right panel; on a phone
    // the closed sheet still shows it, with Properties to open the rest (SlopFramePanel's footer, shared/frame/panel.js).
    g.SlopFramePanel.create(document.querySelector('.fx-side'), { bare: true })
      .footer([{ el: $('fx-render') }], { more: ns.defs.t('effects.app.props'), onMore: () => sheet && sheet.toggle() });
    document.querySelectorAll('.fx-side .sf-foot-more').forEach((b) => { b.dataset.i18n = 'effects.app.props'; });
    const menus = ns.menus.mount(S, Object.assign(act, { toast }), io);
    const renderDialog = () => ns.renderDialog.open(S, toast);
    const compDialog = () => ns.menus.compDialog(S, act);
    const focusMotion = () => { showTab('motion'); if (sheet) sheet.open(); };
    if (g.SlopCmd && g.SlopCmd.init) g.SlopCmd.init({ app: 'effects' });
    ns.cmd.init({ S, act, ka, io, tr, preview, toast, renderDialog, compDialog, focusMotion });
    // a language change: the panels, the timeline and the readouts draw again with the new words (data-i18n does the rest)
    ns.defs.onLang(() => { S.emit('doc'); S.emit('sel'); });

    // Status toasts from the store (undo labels etc.) are not needed; the toolbar shows undo state.
    S.on((what) => { if (what === 'doc') document.title = `${S.doc.name} — Slop Effects`; });
    g.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.isDragging()) S.cancelLive(); });
    S.emit('doc');
    S.emit('sel');
    g.SlopEffects.app = { S, act, ka, io, tr, preview, menus, showTab, sheet };
    menus.refresh();
    g.SlopIntake.dropTarget($('fx-view'), { to: 'effects' });
    if (g.SlopHub) { try { g.SlopHub.register('effects'); } catch (e) { /* bus unavailable */ } }
    io.launch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
