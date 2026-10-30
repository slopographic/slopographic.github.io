/* Slop Colors: the colour wheel, one more view of the page's state (js/state.js): the base handle is the current colour,
 * the other handles are its harmony (colors/js/core/harmony.js), on the RGB, RYB or OKLCH wheel (core/wheel.js). Drawn by
 * js/wheel-draw.js; the handles are elements over the canvas, each a slider (role="slider", its hue as the value and its
 * hue, saturation and colour as the value text) that the arrow keys move (core/wheel.js nudge). A drag starting on the ring
 * turns only the hue; one on the disc moves the handle there; one on a handle moves that handle (the rule says what the
 * others do). Mouse, pen and touch are pointer events, captured to the wheel. Under it: the harmony and the wheel to use
 * and the brightness (OKLCH: lightness) slider. Classic script, after swatches.js.
 *   CO.wheel.wire(), paint(s), setRule(id), setModel(id), focus(), moveHandle(i, { a, r, v }) → the colours,
 *   places() → the handles' places, handles() → their elements */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => g.CO.state, X = () => g.SlopColors, WH = () => g.SlopColors.wheel;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const name = (kind, id, en) => (g.SlopI18n && g.SlopI18n.has('colors.' + kind + '.' + id) ? t('colors.' + kind + '.' + id) : en);
  let box = null, cv = null, size = 0, hs = [], base = null, drag = null, last = null;

  /** The base's place: the one this page set last while the colour is still that one (a grey keeps its hue). */
  function baseOf(s) {
    return base && base.hex === s.current && base.wheel === s.wheel ? base.p : WH().point(s.current, s.wheel);
  }
  const places = (s = S().get()) => WH().places(s, baseOf(s));
  function apply(r) {
    const s = S().get();
    if (r.base) base = { hex: r.patch.current, wheel: s.wheel, p: r.base };
    S().set(r.patch);
  }

  function options() {
    const H = X().harmony, fill = (sel, list, kind) => { const v = sel.value; sel.replaceChildren(...list.map(([id, en]) => new Option(name(kind, id, en), id))); if (v) sel.value = v; };
    fill($('co-wheel-rule'), H.HARMONIES, 'harmony');
    fill($('co-wheel-model'), H.WHEELS, 'wheel');
  }
  const setRule = (id) => S().set({ harmony: id });
  const setModel = (id) => S().set({ wheel: id });

  /** The pointer's place on the wheel: { a, r } with r in disc radii (the ring is past 1). */
  function at(e) {
    const b = box.getBoundingClientRect(), R = (b.width / 2) * g.CO.wheelDraw.GEO.disc;
    return WH().fromXY(e.clientX - b.left - b.width / 2, e.clientY - b.top - b.height / 2, R);
  }
  function down(e) {
    if (e.button > 0) return;
    const p = at(e), list = places(), hit = e.target.closest && e.target.closest('.co-wh');
    const ringStart = !hit && p.r > (g.CO.wheelDraw.GEO.ringIn / g.CO.wheelDraw.GEO.disc) * 0.97;
    if (!hit && p.r > 1.25) return;
    const i = hit ? Number(hit.dataset.i) : 0;
    drag = { i, ring: ringStart, id: e.pointerId };
    // touch-ok: #co-wheel carries data-touch-surface (colors/index.html) and touch-action: none (css/view.css)
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic event: no capture */ }
    e.preventDefault();
    (hs[i] || box).focus({ preventScroll: true });
    if (!hit) move(e, list);
  }
  function move(e, list) {
    if (!drag || e.pointerId !== drag.id) return;
    const s = S().get(), now = list || places(s), here = now[drag.i], p = at(e);
    if (!here) return;
    const q = { a: p.a, r: drag.ring ? here.r : Math.min(1, p.r), v: here.v };
    apply(WH().drag(s, drag.i, q, now[0]));
  }
  function up(e) { if (drag && e.pointerId === drag.id) drag = null; }

  function key(e) {
    const i = Number(e.currentTarget.dataset.i), s = S().get(), now = places(s);
    const q = now[i] && WH().nudge(now[i], e.key, e.shiftKey);
    if (!q) return;
    e.preventDefault();
    apply(WH().drag(s, i, q, now[0]));
  }

  function handle(i) {
    const h = document.createElement('div');
    h.className = 'co-wh'; h.dataset.i = String(i); h.tabIndex = 0;
    h.setAttribute('role', 'slider'); h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', '359');
    h.setAttribute('aria-describedby', 'co-wheel-keys');
    h.addEventListener('keydown', key);
    return h;
  }
  function paintHandles(s, list, cols) {
    while (hs.length < cols.length) { const h = handle(hs.length); box.append(h); hs.push(h); }
    while (hs.length > cols.length) hs.pop().remove();
    const R = (size / 2) * g.CO.wheelDraw.GEO.disc, sat = s.wheel === 'oklch' ? 'value_oklch' : 'value';
    hs.forEach((h, i) => {
      const [dx, dy] = WH().toXY(list[i], R), hue = Math.round(list[i].a) % 360;
      h.style.left = `calc(50% + ${dx.toFixed(1)}px)`; h.style.top = `calc(50% + ${dy.toFixed(1)}px)`;
      h.style.background = cols[i];
      h.classList.toggle('is-base', i === 0);
      h.setAttribute('aria-label', i ? t('colors.wheel.handle', { n: i + 1 }) : t('colors.wheel.base'));
      h.setAttribute('aria-valuenow', String(hue));
      h.setAttribute('aria-valuetext', t('colors.wheel.' + sat, { hue: String(hue), sat: String(Math.round(list[i].r * 100)), hex: cols[i] }));
    });
  }

  function paint(s) {
    if (!box) return;
    const list = places(s), cols = WH().colours(s), b = list[0];
    size = box.clientWidth || size;
    if (size) g.CO.wheelDraw.paint(cv, { size, wheel: s.wheel, v: b.v, places: list });
    paintHandles(s, list, cols);
    const rule = $('co-wheel-rule'), model = $('co-wheel-model'), v = $('co-wheel-v'), pct = Math.round(b.v * 100);
    if (rule.value !== s.harmony) rule.value = s.harmony;
    if (model.value !== s.wheel) model.value = s.wheel;
    const kind = s.wheel === 'oklch' ? 'light' : 'bright';
    $('co-wheel-v-lab').textContent = t('colors.wheel.' + kind);
    if (document.activeElement !== v || Number(v.value) !== pct) v.value = String(pct);
    v.setAttribute('aria-valuetext', t('colors.wheel.' + kind + '_text', { pct: String(pct) }));
    last = s;
  }

  function wire() {
    box = $('co-wheel'); cv = $('co-wheel-cv');
    options();
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', (e) => move(e));
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('lostpointercapture', up);
    $('co-wheel-rule').addEventListener('change', (e) => setRule(e.target.value));
    $('co-wheel-model').addEventListener('change', (e) => setModel(e.target.value));
    $('co-wheel-v').addEventListener('input', (e) => {
      const s = S().get(), b = baseOf(s);
      apply(WH().drag(s, 0, { a: b.a, r: b.r, v: Number(e.target.value) / 100 }));
    });
    if (g.ResizeObserver) new g.ResizeObserver(() => { if (box.clientWidth && box.clientWidth !== size && last) paint(last); }).observe(box);
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(options);
  }
  /** Brings the wheel into view and puts the keyboard on the base handle. */
  function focus() {
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (hs[0]) hs[0].focus({ preventScroll: true });
  }
  /** Handle i (0 = the base) moved to a place: { a, r, v } in part; what is left out stays. The assistant's way in. */
  function moveHandle(i, to) {
    const s = S().get(), now = places(s);
    if (!now[i]) throw new Error(`The wheel has ${now.length} handles`);
    apply(WH().drag(s, i, Object.assign({}, now[i], to), now[0]));
    return WH().colours(S().get());
  }
  g.CO.wheel = { wire, paint, setRule, setModel, focus, moveHandle, places: () => places(), handles: () => hs.slice() };
})(window);
