#!/usr/bin/env node
// Builds the public repository slopographic/claude-plugin (the Claude Code plugin and marketplace, the npm package for
// npx, the Claude Desktop extension) into a folder, from tools/claude-plugin/ and shared/agent/clients.js. It never
// creates, commits or pushes a repository: the coordinator copies the folder into the repo and publishes.
//   node tools/claude-plugin/publish.mjs <out-folder> [--mcpb <file>]
// The folder is emptied first (only when it is a previous build: it has .claude-plugin/plugin.json, or is empty).
// The .mcpb goes to --mcpb, default <out-folder>/../slopographic-<version>.mcpb, for the GitHub release (asset name
// slopographic.mcpb: shared/agent/clients.js links releases/latest/download/slopographic.mcpb).
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tree, bundle, version } from './build/tree.mjs';
import { zip } from './build/zip.mjs';

export function build(out, { mcpb } = {}) {
  out = path.resolve(out);
  if (existsSync(out) && readdirSync(out).length && !existsSync(path.join(out, '.claude-plugin', 'plugin.json'))) {
    throw new Error(`${out} is not empty and is not an earlier build. Choose an empty folder.`);
  }
  for (const n of existsSync(out) ? readdirSync(out) : []) if (n !== '.git') rmSync(path.join(out, n), { recursive: true, force: true });
  const files = tree();
  for (const [rel, data] of files) {
    const p = path.join(out, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, data, rel === 'server/index.mjs' ? { mode: 0o755 } : undefined);
  }
  const bundlePath = path.resolve(mcpb || path.join(out, '..', `slopographic-${version()}.mcpb`));
  writeFileSync(bundlePath, zip(bundle(files)));
  return { out, files: [...files.keys()], mcpb: bundlePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--mcpb');
  const mcpb = at >= 0 ? args.splice(at, 2)[1] : undefined;
  if (!args[0]) { console.error('usage: node tools/claude-plugin/publish.mjs <out-folder> [--mcpb <file>]'); process.exit(2); }
  const r = build(args[0], { mcpb });
  console.log(`Built ${r.files.length} files in ${r.out}\nDesktop extension: ${r.mcpb}`);
}
