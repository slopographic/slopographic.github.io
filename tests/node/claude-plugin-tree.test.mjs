// The public plugin repository that tools/claude-plugin/publish.mjs builds: the Claude Code plugin manifest and its
// marketplace (the documented rules: names, required fields, ./ paths that exist, no ..), the skills' frontmatter, the
// .mcp.json command, the npm package's bin, the Claude Desktop extension (MCPB 0.3 manifest and the zip), versions that
// match everywhere, the README and the site's setup snippets from one source. `claude plugin validate --strict` runs
// too where the claude CLI is installed (not in CI).
// Run: node --test tests/node/claude-plugin-tree.test.mjs
// Covers: tools/claude-plugin/publish.mjs, tools/claude-plugin/build/tree.mjs, tools/claude-plugin/build/zip.mjs, shared/agent/clients.js, shared/agent/bridge.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../../tools/claude-plugin/publish.mjs';
import { unzipList, zip, crc32 } from '../../tools/claude-plugin/build/zip.mjs';
import { LOCAL_TOOLS } from '../../tools/claude-plugin/server/tools.mjs';
import { PORTS } from '../../tools/claude-plugin/server/bridge.mjs';
import { VERSION } from '../../tools/claude-plugin/server/index.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const clients = createRequire(import.meta.url)('../../shared/agent/clients.js');
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED = /^(claude|anthropic|anthropics|claude-code|claude-mods)$|^(claude|anthropic|anthropics|cc-plugin)-|official/i;

const out = path.join(await mkdtemp(path.join(tmpdir(), 'slop-plugin-')), 'claude-plugin');
const built = build(out);
const json = async (rel) => JSON.parse(await readFile(path.join(out, rel), 'utf8'));
const exists = async (rel) => !!(await stat(path.join(out, rel)).catch(() => null));

test('plugin.json: the documented fields, a kebab-case name that is not reserved, directory listing info', async () => {
  const p = await json('.claude-plugin/plugin.json');
  assert.match(p.name, /^[a-z0-9]+(-[a-z0-9]+)*$/); assert.ok(!RESERVED.test(p.name));
  for (const k of ['version', 'description', 'homepage', 'repository', 'license', 'keywords']) assert.ok(p[k], k);
  assert.equal(p.author.name, 'Slopographic');
  assert.equal(new URL(p.homepage).protocol, 'https:');
  assert.equal(p.repository, `https://github.com/${clients.REPO}`);
  assert.equal(p.license, 'MIT');
  assert.ok(await exists('LICENSE') && /MIT License/.test(await readFile(path.join(out, 'LICENSE'), 'utf8')));
  assert.ok(!(await exists('CLAUDE.md')), 'no CLAUDE.md at the plugin root (it is not loaded)');
  const icon = await readFile(path.join(out, 'icon.png'));
  assert.equal(icon.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([icon.readUInt32BE(16), icon.readUInt32BE(20)], [512, 512], 'a square icon of 512 px for the directory');
});

test('marketplace.json: name, owner, a plugin entry at ./ whose name matches the manifest', async () => {
  const m = await json('.claude-plugin/marketplace.json'), p = await json('.claude-plugin/plugin.json');
  assert.match(m.name, ID); assert.ok(!/claude|anthropic/i.test(m.name)); assert.ok(m.owner.name); assert.ok(m.description);
  assert.equal(m.plugins.length, 1);
  const e = m.plugins[0];
  assert.equal(e.name, p.name, 'entry name = manifest name, so /plugin install slopographic@slopographic works');
  assert.equal(e.source, './'); assert.ok(!e.source.includes('..'));
  assert.equal(e.version, undefined, 'the version lives in plugin.json only (no mismatch warning)');
  const snippet = clients.list.find((c) => c.id === 'claude-code').snippets[0].code;
  assert.ok(snippet.includes(`/plugin marketplace add ${clients.REPO}`) && snippet.includes(`/plugin install ${p.name}@${m.name}`));
});

test('.mcp.json runs the bundled server; the skills have descriptions and use the plugin\'s tool names', async () => {
  const mcp = await json('.mcp.json');
  const [name, s] = Object.entries(mcp.mcpServers)[0];
  assert.equal(name, 'app'); assert.equal(s.command, 'node');
  assert.deepEqual(s.args, ['${CLAUDE_PLUGIN_ROOT}/server/index.mjs']);
  assert.ok(await exists('server/index.mjs'));
  assert.ok(`mcp__plugin_slopographic_${name}__`.length + 34 <= 64, 'the longest proxied name fits 64 characters');
  const skills = await readdir(path.join(out, 'skills'));
  assert.deepEqual(skills.sort(), ['slop-connect', 'slop-edit']);
  for (const d of skills) {
    const t = await readFile(path.join(out, 'skills', d, 'SKILL.md'), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(t);
    assert.ok(fm, d + ' has frontmatter');
    assert.match(fm[1], /^description: .{20,}/m); assert.match(fm[1], new RegExp(`^name: ${d}$`, 'm'));
    for (const tool of (fm[1].match(/mcp__\S+/g) || [])) assert.match(tool, new RegExp(`^mcp__plugin_slopographic_${name}__(${LOCAL_TOOLS.map((x) => x.name).join('|')})$`));
  }
});

test('versions match: plugin.json, package.json, manifest.json and the running server', async () => {
  const v = (await json('package.json')).version;
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.equal((await json('.claude-plugin/plugin.json')).version, v);
  assert.equal((await json('manifest.json')).version, v);
  assert.equal(VERSION, v);
  assert.ok(built.mcpb.endsWith(`slopographic-${v}.mcpb`));
});

test('the npm package: a bin for npx, no dependencies, Node 20+', async () => {
  const pkg = await json('package.json');
  assert.equal(pkg.bin['slopographic-mcp'], 'server/index.mjs');
  assert.equal(pkg.dependencies, undefined); assert.equal(pkg.scripts, undefined, 'nothing runs on install');
  assert.equal(pkg.engines.node, '>=20');
  assert.match(readFileSync(path.join(out, 'server/index.mjs'), 'utf8'), /^#!\/usr\/bin\/env node\n/);
  assert.ok(((await stat(path.join(out, 'server/index.mjs'))).mode & 0o111) !== 0, 'executable');
  for (const f of await readdir(path.join(out, 'server'))) assert.doesNotMatch(readFileSync(path.join(out, 'server', f), 'utf8'), /from '(?!node:|\.\/)/, f + ' imports only node: and its own files');
});

test('the MCPB 0.3 manifest and the .mcpb zip', async () => {
  const m = await json('manifest.json');
  assert.equal(m.manifest_version, '0.3');
  for (const k of ['name', 'display_name', 'version', 'description', 'long_description', 'homepage', 'documentation', 'support', 'icon', 'license']) assert.ok(m[k], k);
  assert.equal(m.author.name, 'Slopographic');
  assert.equal(m.server.type, 'node'); assert.equal(m.server.entry_point, 'server/index.mjs');
  assert.deepEqual(m.server.mcp_config.args, ['${__dirname}/server/index.mjs']);
  assert.deepEqual(m.tools.map((t) => t.name), LOCAL_TOOLS.map((t) => t.name)); assert.equal(m.tools_generated, true);
  assert.ok(m.privacy_policies.every((u) => u.startsWith('https://')));
  assert.deepEqual(m.compatibility.platforms, ['darwin', 'win32', 'linux']);
  assert.match(m.long_description, /127\.0\.0\.1/);
  const entries = unzipList(await readFile(built.mcpb));
  const names = entries.map((e) => e.name);
  assert.equal(names[0], 'manifest.json');
  for (const f of ['package.json', 'icon.png', 'server/index.mjs', 'server/bridge.mjs', 'server/ws.mjs', 'server/mcp.mjs']) assert.ok(names.includes(f), f);
  for (const e of entries) assert.ok(e.data.equals(await readFile(path.join(out, e.name))), e.name + ' is the tree\'s file');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'the CRC-32 check value');
  assert.ok(zip([{ name: 'a', data: 'x' }]).equals(zip([{ name: 'a', data: 'x' }])), 'the same files give the same bytes');
});

test('the README and the site help come from one list; the page and the server agree on the ports', async () => {
  const readme = await readFile(path.join(out, 'README.md'), 'utf8');
  for (const c of clients.list) for (const s of c.snippets) assert.ok(readme.includes(s.code) || c.id === 'claude-code', `${c.id}: ${s.label}`);
  for (const c of clients.list) for (const s of c.snippets) if (s.lang === 'json') JSON.parse(s.code);
  assert.equal(typeof clients.PUBLISHED, 'boolean');
  const html = readFileSync(path.join(ROOT, 'how-it-works/index.html'), 'utf8');
  assert.match(html, /id="ai-apps"/); assert.match(html, /data-slop-ai-soon/); assert.match(html, /shared\/agent\/clients\.js/);
  const page = readFileSync(path.join(ROOT, 'shared/agent/bridge.js'), 'utf8');
  const m = /length: (\d+) \}, \(_, i\) => (\d+) \+ i/.exec(page);
  assert.deepEqual([Number(m[1]), Number(m[2])], [PORTS.length, PORTS[0]]);
});

const hasClaude = (() => { try { execFileSync('claude', ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
test('claude plugin validate --strict passes on the tree and on the plugin alone', { skip: !hasClaude && 'the claude CLI is not installed here' }, () => {
  const r = execFileSync('claude', ['plugin', 'validate', out, '--strict'], { encoding: 'utf8' });
  assert.match(r, /Validation passed/);
});
