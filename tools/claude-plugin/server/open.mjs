// Opens a web address in the default browser: open (macOS), rundll32 url.dll (Windows, no shell parsing of & in the
// address), xdg-open (Linux and the BSDs). SLOPOGRAPHIC_NO_OPEN=1 turns it off (tests, headless machines).
//   openUrl(url, { env, platform, spawn }) → Promise<bool> (true when a browser was started)
//   command(url, platform) → [cmd, args]
import { spawn as nodeSpawn } from 'node:child_process';

export function command(url, platform = process.platform) {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}

export function openUrl(url, { env = process.env, platform = process.platform, spawn = nodeSpawn } = {}) {
  if (!/^https?:\/\/[^\s"'<>]+$/.test(String(url))) return Promise.resolve(false);
  if (env.SLOPOGRAPHIC_NO_OPEN) return Promise.resolve(false);
  const [cmd, args] = command(url, platform);
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }); } catch (e) { resolve(false); return; }
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}
