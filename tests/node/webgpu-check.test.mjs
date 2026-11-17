// The nightly WebGPU check (tools/webgpu-check.mjs, .github/workflows/webgpu.yml): its flags, models and summary.
// Covers: tools/webgpu-check.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize, failed, IDS, ARGS } from '../../tools/webgpu-check.mjs';

test('checks the smallest model in both builds, on SwiftShader WebGPU', () => {
  assert.deepEqual(IDS, ['Qwen2.5-0.5B-Instruct-q4f32_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC']);
  assert.ok(ARGS.includes('--enable-unsafe-webgpu') && ARGS.includes('--use-webgpu-adapter=swiftshader'));
  const cat = readFileSync(new URL('../../shared/ai/catalog.js', import.meta.url), 'utf8');
  for (const id of IDS) assert.ok(cat.includes(id), id + ' is in the catalog');
});

test('the job summary: a row per model; only a model the adapter could run can fail the job', () => {
  const rows = [{ id: 'a-q4f32', status: 'ok', seconds: 12.5, text: 'Hello | there' }, { id: 'a-q4f16', status: 'untestable', error: 'no shader-f16' }];
  const md = summarize({ vendor: 'google', architecture: 'swiftshader', f16: false }, rows);
  assert.match(md, /Adapter: google swiftshader, shader-f16: no/);
  assert.match(md, /\| a-q4f32 \| ✅ ok \| 12.5 \| Hello \\\| there \|/);
  assert.match(md, /\| a-q4f16 \| ➖ untestable \|/);
  assert.equal(failed(rows), false);
  assert.equal(failed([{ id: 'x', status: 'failed', error: 'Invalid ShaderModule' }]), true);
  assert.match(summarize(null, []), /Adapter: none/);
});

test('the workflow runs nightly, by hand and when WebLLM changes, with the model cached', () => {
  const y = readFileSync(new URL('../../.github/workflows/webgpu.yml', import.meta.url), 'utf8');
  for (const s of ['schedule:', 'workflow_dispatch:', "'vendor/web-llm/**'", "'shared/ai/catalog.js'", 'actions/cache@', 'node tools/webgpu-check.mjs --profile=.webgpu-profile']) assert.ok(y.includes(s), s);
});
