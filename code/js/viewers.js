/* Slop Code: the tabs that show a file instead of editing it (images, audio, video, PDF, unknown binary) and the
 * rendered Markdown preview. Images use the shared SlopPreview viewer (zoom, pan). Audio and video use the native
 * controls. A PDF is the browser's own PDF view, set to page 1. A binary file gets the "Open in an app" list, the
 * same apps Slop Drive offers (SlopHub.appsAccepting). Nothing here fetches anything: every source is a blob URL. */
import * as docs from './docs.js';
import { el, t } from './dom.js';
import { renderMarkdown } from './markdown.js';

const MEDIA = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
  pdf: ['pdf'],
};

/** The view kind for a file name ('image', 'audio', 'video' or 'pdf'), or null: text and unknown files are decided by content. */
export function mediaKind(name) {
  const dot = String(name || '').lastIndexOf('.');
  const x = dot > 0 ? String(name).slice(dot + 1).toLowerCase() : '';
  for (const kind of Object.keys(MEDIA)) if (MEDIA[kind].includes(x)) return kind;
  return null;
}

const hostOf = () => document.getElementById('cd-viewer');

/** Show what the active tab needs in the viewer area: a file view, or the rendered Markdown. Clears it otherwise. */
export function syncViewer(cur) {
  const host = hostOf();
  if (!host) return;
  const wanted = !cur ? '' : cur.kind !== 'text' ? cur.id + ':' + cur.kind : cur.preview ? cur.id + ':md' : '';
  if (host.dataset.key === wanted) {
    if (wanted.endsWith(':md')) host.replaceChildren(...markdownNodes(docs.textOf(cur)));
    return;
  }
  host.dataset.key = wanted;
  if (!wanted) { host.replaceChildren(); return; }
  if (cur.kind === 'text') host.replaceChildren(...markdownNodes(docs.textOf(cur)));
  else host.replaceChildren(mountFile(cur));
}

function markdownNodes(text) {
  return [el('article', { class: 'cd-md', 'aria-label': t('code.view.rendered') }, renderMarkdown(text))];
}

/** The node for a file tab: a picture, a player, a PDF page, or the binary message. */
function mountFile(doc) {
  if (doc.kind === 'image' && window.SlopPreview) {
    const v = window.SlopPreview.create({ title: doc.name, blobUrl: doc.url, kind: 'image', chrome: false });
    return el('div', { class: 'cd-media' }, v.el);
  }
  if (doc.kind === 'audio') return el('div', { class: 'cd-media cd-audio' }, el('p', { class: 'cd-media-name' }, doc.name),
    el('audio', { controls: true, preload: 'metadata', src: doc.url, 'aria-label': doc.name }));
  if (doc.kind === 'video') return el('div', { class: 'cd-media' }, el('video', { controls: true, preload: 'metadata', src: doc.url, 'aria-label': doc.name, class: 'cd-video' }));
  if (doc.kind === 'pdf') return el('iframe', { class: 'cd-pdf', src: doc.url + '#page=1&view=FitH', title: t('code.view.pdf', { name: doc.name }) });
  return binaryNode(doc);
}

/** An app's name from the shared 'Open in {app}' label (SlopOuttake), in the page's language: the verb is dropped. */
function appName(label) {
  const I = window.SlopI18n, mark = '\u0000';
  const pre = (I && I.has('ui.outtake.open_in') ? I.t('ui.outtake.open_in', { app: mark }) : 'Open in ' + mark).split(mark)[0];
  return pre && label.startsWith(pre) ? label.slice(pre.length) : label;
}

/** "Not text": the message, and an "Open in an app" list (apps that accept this type, as in Slop Drive). */
function binaryNode(doc) {
  const box = el('div', { class: 'cd-bin' },
    el('h2', null, doc.name),
    el('p', null, t('code.view.not_text')));
  const list = el('div', { class: 'cd-bin-apps' });
  const rec = { id: doc.id, name: doc.name };
  // The one builder (SlopOuttake): the file is already in Slop Drive, so the app opens that record (no copy).
  const openers = () => (window.SlopOuttake && window.SlopHub ? window.SlopOuttake.items({ id: rec.id, name: rec.name, type: doc.mime || 'application/octet-stream', from: 'code', folder: false }) : []);
  const showApps = () => {
    const items = openers();
    list.replaceChildren(items.length ? el('p', { class: 'cd-hint' }, t('code.view.open_in')) : el('p', { class: 'cd-hint' }, t('code.view.no_app')),
      ...items.map((it) => el('button', { type: 'button', class: 'sui-btn', onclick: it.act }, appName(it.label))));
  };
  box.append(el('button', { type: 'button', class: 'sui-btn sui-primary', id: 'cd-bin-open', onclick: showApps }, t('code.view.open_app')), list);
  return box;
}
