/* Slop Compare: two pictures (or two rendered PDF pages) on screen, in one of three views, with each changed area boxed:
 *   side     A and B next to each other (stacked on a phone)
 *   slider   B over A, cut at a handle you drag (or move with the arrow keys): A on the left of it, B on the right
 *   diff     A faded, the changed pixels in red
 * The slider is an editing surface (data-touch-surface: a finger drag moves the handle, never scrolls the page) with a
 * 44 px handle; it is a role=slider for the keyboard and screen readers.
 *   mountPicture(host, { canvas: { a, b, diff }, boxes, w, h, view, label }) → { current(i), view }
 *     current(i) marks box i (Next and Previous change) and scrolls it into view */
import { t } from './i18n.js';

const el = (tag, cls, attrs = {}) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, attrs);

function copy(src) {
  const c = el('canvas', 'df-pic-c');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function boxesOver(frame, boxes, w, h) {
  const layer = el('div', 'df-boxes');
  layer.setAttribute('aria-hidden', 'true');
  boxes.forEach((b, i) => {
    const d = el('div', 'df-box');
    d.dataset.box = i;
    Object.assign(d.style, { left: `${(b.x / w) * 100}%`, top: `${(b.y / h) * 100}%`, width: `${(b.w / w) * 100}%`, height: `${(b.h / h) * 100}%` });
    layer.append(d);
  });
  frame.append(layer);
  return layer;
}

function figure(src, caption, boxes, w, h) {
  const f = el('figure', 'df-fig'), frame = el('div', 'df-frame');
  frame.append(copy(src));
  if (boxes) boxesOver(frame, boxes, w, h);
  const cap = el('figcaption', 'df-cap'); cap.textContent = caption;
  f.append(frame, cap);
  return f;
}

function slider(o) {
  const wrap = el('div', 'df-slider'), frame = el('div', 'df-frame df-slide-frame');
  frame.dataset.touchSurface = '';
  const top = el('div', 'df-slide-top');
  frame.append(copy(o.canvas.a));
  top.append(copy(o.canvas.b));
  frame.append(top);
  boxesOver(frame, o.boxes, o.w, o.h);
  const handle = el('div', 'df-handle', { tabIndex: 0 });
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', t('diff.pic.handle'));
  handle.setAttribute('aria-valuemin', '0'); handle.setAttribute('aria-valuemax', '100');
  frame.append(handle);
  let pos = 50;
  const set = (p) => {
    pos = Math.max(0, Math.min(100, p));
    top.style.clipPath = `inset(0 0 0 ${pos}%)`;
    handle.style.left = `${pos}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    handle.setAttribute('aria-valuetext', t('diff.pic.handle_value', { pct: Math.round(pos) }));
  };
  set(50);
  const at = (e) => { const r = frame.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  frame.addEventListener('pointerdown', (e) => { if (e.button) return; frame.setPointerCapture(e.pointerId); at(e); e.preventDefault(); });
  frame.addEventListener('pointermove', (e) => { if (frame.hasPointerCapture(e.pointerId)) at(e); });
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    const k = { ArrowLeft: pos - step, ArrowRight: pos + step, Home: 0, End: 100 }[e.key];
    if (k === undefined) return;
    e.preventDefault(); set(k);
  });
  const cap = el('p', 'df-cap'); cap.textContent = t('diff.pic.slider_cap');
  wrap.append(frame, cap);
  wrap.setPos = set;
  return wrap;
}

export function mountPicture(host, o) {
  host.textContent = '';
  const view = o.view || 'side';
  const box = el('div', `df-pics df-pics-${view}`);
  box.setAttribute('aria-label', o.label || t('diff.pic.label'));
  if (view === 'slider') box.append(slider(o));
  else if (view === 'diff') box.append(figure(o.canvas.diff, t('diff.pic.diff_cap'), o.boxes, o.w, o.h));
  else box.append(figure(o.canvas.a, 'A', o.boxes, o.w, o.h), figure(o.canvas.b, 'B', o.boxes, o.w, o.h));
  host.append(box);
  return {
    view,
    current(i) {
      for (const d of box.querySelectorAll('.df-box')) d.classList.toggle('df-box-cur', Number(d.dataset.box) === i);
      const first = box.querySelector(`.df-box[data-box="${i}"]`);
      if (first) first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
  };
}
