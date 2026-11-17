/* SlopAIKit bench: a short WebGPU micro-benchmark. Classic script; adds SlopAIKit.bench.
 *   run(adapter, { onStep, size }) → { gflops, bandwidthGBs, ms, n, mb }
 * - matmul: a tiled 16×16 f32 matrix multiply (N×N), GFLOPS = 2·N³·reps / time
 * - bandwidth: a compute pass that reads one storage buffer and writes another (vec4 copy), GB/s = 2·bytes·reps / time
 * LLM token speed is bound by memory bandwidth, so the verdicts use that number first. Takes about a second. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai2.js
  const MATMUL = `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
@group(0) @binding(3) var<uniform> N: u32;
var<workgroup> ta: array<array<f32, 16>, 16>;
var<workgroup> tb: array<array<f32, 16>, 16>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  var acc = 0.0;
  let n = N;
  for (var t = 0u; t < n; t = t + 16u) {
    ta[l.y][l.x] = A[g.y * n + t + l.x];
    tb[l.y][l.x] = B[(t + l.y) * n + g.x];
    workgroupBarrier();
    for (var k = 0u; k < 16u; k = k + 1u) { acc = acc + ta[l.y][k] * tb[k][l.x]; }
    workgroupBarrier();
  }
  C[g.y * n + g.x] = acc;
}`;
  const COPY = `
@group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(num_workgroups) w: vec3<u32>) {
  let i = g.x + g.y * w.x * 256u;
  if (i < arrayLength(&src)) { dst[i] = src[i] * 1.0001; }
}`;
  const now = () => performance.now();
  const r2 = (x) => (x < 10 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10);

  async function timed(device, encodeOnce, reps) {
    const go = (k) => { const enc = device.createCommandEncoder(); for (let i = 0; i < k; i++) encodeOnce(enc); device.queue.submit([enc.finish()]); return device.queue.onSubmittedWorkDone(); };
    await go(1); // warm-up (pipeline compile)
    const t0 = now(); await go(reps); return now() - t0;
  }

  async function matmul(device, n, budgetMs) {
    const bytes = n * n * 4, U = GPUBufferUsage;
    const a = device.createBuffer({ size: bytes, usage: U.STORAGE | U.COPY_DST }), b = device.createBuffer({ size: bytes, usage: U.STORAGE | U.COPY_DST });
    const c = device.createBuffer({ size: bytes, usage: U.STORAGE }), u = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
    const data = new Float32Array(n * n); for (let i = 0; i < data.length; i++) data[i] = ((i * 7919) % 97) / 97;
    device.queue.writeBuffer(a, 0, data); device.queue.writeBuffer(b, 0, data); device.queue.writeBuffer(u, 0, new Uint32Array([n, 0, 0, 0]));
    const pipe = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({ code: MATMUL }), entryPoint: 'main' } });
    const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [a, b, c, u].map((buffer, i) => ({ binding: i, resource: { buffer } })) });
    const enc1 = (enc) => { const p = enc.beginComputePass(); p.setPipeline(pipe); p.setBindGroup(0, bind); p.dispatchWorkgroups(n / 16, n / 16); p.end(); };
    let reps = 2, ms = await timed(device, enc1, reps);
    if (ms < budgetMs / 4) { reps = Math.max(2, Math.min(64, Math.round((reps * budgetMs) / 2 / Math.max(ms, 0.5)))); ms = await timed(device, enc1, reps); }
    [a, b, c, u].forEach((x) => x.destroy());
    return { gflops: (2 * n * n * n * reps) / (ms / 1000) / 1e9, ms, reps };
  }

  async function copy(device, mb, budgetMs) {
    const bytes = mb * 1048576, U = GPUBufferUsage, groups = bytes / 16 / 256;
    const s = device.createBuffer({ size: bytes, usage: U.STORAGE }), d = device.createBuffer({ size: bytes, usage: U.STORAGE });
    const pipe = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({ code: COPY }), entryPoint: 'main' } });
    const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: s } }, { binding: 1, resource: { buffer: d } }] });
    const gx = Math.min(groups, 65535), gy = Math.ceil(groups / gx);
    const enc1 = (enc) => { const p = enc.beginComputePass(); p.setPipeline(pipe); p.setBindGroup(0, bind); p.dispatchWorkgroups(gx, gy); p.end(); };
    let reps = 2, ms = await timed(device, enc1, reps);
    if (ms < budgetMs / 4) { reps = Math.max(2, Math.min(64, Math.round((reps * budgetMs) / 2 / Math.max(ms, 0.5)))); ms = await timed(device, enc1, reps); }
    s.destroy(); d.destroy();
    return { bandwidthGBs: (2 * bytes * reps) / (ms / 1000) / 1e9, ms, reps };
  }

  /** Starts small (128², 8 MB) and only scales up when the GPU is fast, so a software GPU finishes in a second too. */
  async function run(adapter, { onStep, budgetMs = 400 } = {}) {
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    const lim = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize);
    const maxMb = Math.max(4, Math.floor(lim / 1048576 / 2));
    const t0 = now();
    try {
      if (onStep) onStep(T('ui.ai.sys.matmul'));
      let n = 128, m = await matmul(device, n, budgetMs / 4);
      if (m.ms / m.reps < 2) { n = 512; m = await matmul(device, n, budgetMs); }
      if (onStep) onStep(T('ui.ai.sys.bandwidth'));
      let mb = Math.min(8, maxMb), c = await copy(device, mb, budgetMs / 4);
      if (c.ms / c.reps < 4 && maxMb > mb) { mb = Math.min(64, maxMb); c = await copy(device, mb, budgetMs); }
      return { gflops: r2(m.gflops), bandwidthGBs: r2(c.bandwidthGBs), n, mb, ms: Math.round(now() - t0) };
    } finally { device.destroy(); }
  }

  K.bench = { run, MATMUL, COPY };
})();
