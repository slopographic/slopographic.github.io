/* Video links for Slop Notes. A YouTube, Vimeo or direct video-file link becomes a card: a [!VIDEO] callout with a link that
 * opens the video in a new tab. No iframe is embedded and nothing is requested: the YouTube thumbnail is only a link. */

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** Parentheses are escaped so the link target cannot end early. */
const href = (h) => h.replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));

/** What a link is: { provider, watch, thumb } for YouTube, Vimeo or a video file (http or https only), else null. */
export function videoInfo(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || '';
  } else if (host === 'youtu.be') id = parts[0] || '';
  if (/^[\w-]{11}$/.test(id)) {
    return { provider: 'YouTube', watch: 'https://www.youtube.com/watch?v=' + id, thumb: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' };
  }
  if (host === 'vimeo.com' && /^\d+$/.test(parts[0] || '')) return { provider: 'Vimeo', watch: 'https://vimeo.com/' + parts[0], thumb: '' };
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(u.pathname)) return { provider: 'Video file', watch: u.href, thumb: '' };
  return null;
}

/** The card for a video link, as Markdown, or null when the link is not a video. The title is optional. */
export function videoCard(raw, title = '') {
  const v = videoInfo(raw);
  if (!v) return null;
  const name = clean(title).replace(/[[\]]/g, '') || v.provider + ' video';
  const links = [v.provider === 'Video file' ? '[Open the video](' + href(v.watch) + ')' : '[Open on ' + v.provider + '](' + href(v.watch) + ')'];
  if (v.thumb) links.push('[Thumbnail](' + v.thumb + ')');
  return '> [!VIDEO] ' + name + '\n> ' + links.join(' · ');
}
