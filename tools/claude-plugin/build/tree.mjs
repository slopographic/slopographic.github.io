// The public repository's tree (slopographic/claude-plugin), made from this folder: one root that is at once the Claude
// Code plugin (.claude-plugin/plugin.json, .mcp.json, skills/), its marketplace (.claude-plugin/marketplace.json, the
// plugin at "./"), the npm package that `npx -y github:slopographic/claude-plugin` runs (package.json bin), and the
// source of the Claude Desktop extension (manifest.json, MCPB 0.3; the .mcpb is a zip of the bundle files).
//   tree() → Map<path, Buffer>     bundle() → [{ name, data }] for the .mcpb     marketplace(), mcpbManifest(), readme()
//   PLUGIN (this folder), REPO_ROOT (the apps repository), version()
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LOCAL_TOOLS } from '../server/tools.mjs';

export const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(PLUGIN, '..', '..');
const clients = createRequire(import.meta.url)(path.join(REPO_ROOT, 'shared/agent/clients.js'));
const read = (rel, from = PLUGIN) => readFileSync(path.join(from, rel));
const json = (rel) => JSON.parse(read(rel).toString('utf8'));
export const version = () => json('package.json').version;
const SITE = 'https://slopographic.com', HELP = `${SITE}/how-it-works/#ai-apps`;
const repoUrl = () => `https://github.com/${clients.REPO}`;

function walk(dir) {
  const out = [];
  for (const n of readdirSync(path.join(PLUGIN, dir)).sort()) {
    const rel = path.posix.join(dir, n);
    if (statSync(path.join(PLUGIN, rel)).isDirectory()) out.push(...walk(rel)); else out.push(rel);
  }
  return out;
}
const serverFiles = () => walk('server').filter((f) => f.endsWith('.mjs'));

export function marketplace() {
  const p = json('.claude-plugin/plugin.json');
  return { name: 'slopographic', owner: { name: 'Slopographic', url: SITE },
    description: 'Slopographic: free apps for photos, PDF, video and files that run in your browser, for Claude Code.',
    plugins: [{ name: p.name, source: './', description: p.description, category: 'productivity', tags: ['images', 'pdf', 'video', 'files', 'browser'] }] };
}

export function mcpbManifest() {
  const pkg = json('package.json');
  return {
    manifest_version: '0.3', name: 'slopographic', display_name: 'Slopographic', version: pkg.version,
    description: 'Use the Slopographic apps open in your browser (photo editing, PDF, video, conversions, workflows) from Claude: their real commands, your files in and results out.',
    long_description: [
      'Slopographic\'s apps run in your browser. This extension lets Claude use the app you have open there, with the app\'s own commands, File convert and Slop Workflows, and bring files in from your computer and results back out.',
      '**Local only.** The extension runs a small server on your computer that listens on 127.0.0.1 only. The Slopographic page connects to it after you type a one-time pairing code that Claude shows you. Nothing else on your computer can use the page without the code, and no other website may connect.',
      '**Your data.** Files stay on your computer and in your browser. What leaves the computer is only what Claude itself sends to Anthropic as part of your conversation (tool calls and their results). Destructive actions are confirmed by you in the page.',
    ].join('\n\n'),
    author: { name: 'Slopographic', url: SITE },
    homepage: SITE, documentation: HELP, support: `${repoUrl()}/issues`, repository: { type: 'git', url: `${repoUrl()}.git` },
    icon: 'icon.png',
    server: { type: 'node', entry_point: 'server/index.mjs', mcp_config: { command: 'node', args: ['${__dirname}/server/index.mjs'], env: {} } },
    tools: LOCAL_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    tools_generated: true,
    keywords: ['slopographic', 'photo editor', 'pdf', 'image', 'video', 'convert', 'workflows', 'browser'],
    license: 'MIT', privacy_policies: [HELP],
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=20.0.0' } },
  };
}

/** README: this folder's README.md, then every AI app's setup from shared/agent/clients.js. */
export function readme() {
  const parts = [read('README.md').toString('utf8').trimEnd(), '', '## Other AI apps', '',
    'The same server works in any AI app that runs local MCP servers. Each app needs the lines below once; then ask it to connect to Slopographic.', ''];
  for (const c of clients.list.filter((x) => x.id !== 'claude-code')) {
    parts.push(`### ${c.name}`, '', ...c.steps.map((s) => s + '\n'));
    for (const s of c.snippets) parts.push(`${s.label}${s.file ? ` (${s.file})` : ''}:`, '', '```' + (s.lang === 'text' ? '' : s.lang), s.code, '```', '');
    parts.push(`Format from ${c.doc}`, '');
  }
  return parts.join('\n') + '\n';
}

export function tree() {
  const files = new Map();
  const put = (rel, data) => files.set(rel, Buffer.isBuffer(data) ? data : Buffer.from(data));
  for (const f of ['.claude-plugin/plugin.json', '.mcp.json', 'package.json', ...walk('skills'), ...serverFiles()]) put(f, read(f));
  put('.claude-plugin/marketplace.json', JSON.stringify(marketplace(), null, 2) + '\n');
  put('manifest.json', JSON.stringify(mcpbManifest(), null, 2) + '\n');
  put('README.md', readme());
  put('LICENSE', read('LICENSE', REPO_ROOT));
  put('icon.png', read('assets/icons/icon-512.png', REPO_ROOT));
  put('.gitignore', '*.mcpb\nnode_modules/\n');
  return files;
}

/** The .mcpb: the manifest, the server, its package.json (the server reads its version there), icon, README, LICENSE. */
export function bundle(files = tree()) {
  return ['manifest.json', 'package.json', 'icon.png', 'README.md', 'LICENSE', ...serverFiles()].map((name) => ({ name, data: files.get(name) }));
}
