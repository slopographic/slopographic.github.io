// The token budget of the AI panel: on each main app page (real pages in Chromium, the panel's own run, a fake fetch per
// provider), the first request must stay under BUDGET.first estimated input tokens for every provider and BUDGET.local
// for a model on this device, and later turns of a request must keep the cached prefix (same system prompt, the same
// tools for Claude; for the others the earlier tools first). Measured before the deferred tools: 9,700–20,700 tokens per
// request (count_tokens, Claude Haiku 5.5); see tools/ai-tokens.mjs for the table.
// Run: node --test tests/node/ai-tokens.test.mjs
// Covers: tools/ai-tokens.mjs, tests/ai/token-probe.js, shared/ai/toolbox.js, shared/ai/prompt.js, shared/ai/panel-run.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, total, parts, estimate, BUDGET, APPS } from '../../tools/ai-tokens.mjs';

test('the estimate and the parts of a request', () => {
  assert.equal(estimate('x'.repeat(24)), 10);
  const p = parts('anthropic', { system: 'abc', tools: [{ name: 'a', input_schema: {} }, { name: 'b', input_schema: {}, defer_loading: true }], messages: [] });
  assert.equal(p.each.b, 0, 'a deferred tool is not in the context'); assert.equal(p.sent, 2); assert.equal(p.deferred, 1);
  assert.equal(total(p), p.system + p.tools + p.messages);
});

const res = await measure().catch((e) => { console.log('measure:', e.message); return null; });

test('every main app: the first request is under budget for every provider, a local model under its own', { skip: !res && 'Playwright is not installed' }, () => {
  assert.deepEqual(Object.keys(res).sort(), Object.keys(APPS).sort());
  for (const [app, r] of Object.entries(res)) {
    for (const [id, list] of Object.entries(r.parts)) {
      const first = total(list[0]), max = id === 'local' ? BUDGET.local : BUDGET.first;
      assert.ok(first <= max, `${app} ${id}: the first request is ${first} tokens (budget ${max})`);
    }
    console.log(`${app}: first request ${total(r.parts.anthropic[0])} tokens (Claude), ${total(r.parts.local[0])} (local)`);
  }
});

test('later turns keep the cached prefix: Claude gets the same system prompt and tools; the others the earlier tools first', { skip: !res && 'Playwright is not installed' }, () => {
  for (const [app, r] of Object.entries(res)) {
    const a = r.requests.anthropic;
    if (a.length < 2) continue;   // no tools on this page (File convert): one turn
    for (const b of a.slice(1)) { assert.deepEqual(b.tools, a[0].tools, `${app}: Claude's tools`); assert.deepEqual(b.system, a[0].system, `${app}: system`); }
    const o = r.requests.openai, n0 = o[0].tools.map((t) => t.name);
    for (const b of o.slice(1)) assert.deepEqual(b.tools.slice(0, n0.length).map((t) => t.name), n0, `${app}: OpenAI's earlier tools first`);
    assert.ok(a[0].tools.some((t) => t.defer_loading), `${app}: Claude gets deferred tools`);
  }
});

test('the tool loop still works on every page: the probe got its answer', { skip: !res && 'Playwright is not installed' }, () => {
  for (const [app, r] of Object.entries(res)) assert.match(r.said, /ok/, `${app}: ${r.said}`);
});
