/* Helpers shared by the Slop AI tests: frames, mocked system snapshots, stubs. */
window.AT = (function () {
  const { waitFor } = SlopTest;
  /** Load a same-origin page in a fresh iframe; resolves with its window once ready(win) is true. */
  async function frame(src, ready = (w) => w.document.body && w.document.body.classList.contains('ready'), { width = 1280, height = 800 } = {}) {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:${height}px;border:0;display:block`;
    f.src = src; document.body.append(f);
    await waitFor(() => f.contentWindow && f.contentWindow.document.readyState === 'complete' && ready(f.contentWindow), { timeout: 20000 });
    f.contentWindow.__frame = f;
    return f.contentWindow;
  }
  const db = () => 'slop-ai-test-' + Math.random().toString(36).slice(2, 8);
  /** An app frame with the fake engine, its own database and instant fake tokens. */
  async function app(extra = '', size) {
    const w = await frame('../../ai/?engine=fake&db=' + db() + extra, undefined, size);
    w.AI.fakeDelay = 0; w.AI.fakeLoadMs = 10; w.AI.autoload = false;
    await waitFor(() => w.AI.sys && !w.AI.sysBusy); // the quick boot-time check, so it cannot overwrite a mock later
    w.__opened = []; w.open = (url) => { w.__opened.push(url); return {}; };
    return w;
  }
  /** Stub SlopUI.confirm / prompt answers in a frame. */
  function answer(w, { confirm = true, prompt = 'Renamed' } = {}) {
    w.SlopUI.confirm = async () => confirm; w.SlopUI.prompt = async () => prompt; w.SlopUI.alert = async () => {};
  }
  const gpu = (o = {}) => Object.assign({ ok: true, vendor: 'intel', architecture: 'gen-12lp', description: '', isFallback: false, f16: true, features: ['shader-f16'],
    limits: { maxBufferSize: 2147483648, maxStorageBufferBindingSize: 2147483648, maxComputeWorkgroupStorageSize: 32768, maxComputeInvocationsPerWorkgroup: 256 } }, o);
  const SYS = {
    none: { gpu: { ok: false, reason: 'no-api' }, browser: { name: 'Firefox', os: 'Linux' }, storage: {}, ramGB: 8, cores: 8, bench: null },
    laptop: { gpu: gpu(), browser: { name: 'Chrome', version: '141', os: 'Windows' }, storage: { quota: 50e9, usage: 1e6, persisted: false }, ramGB: 8, cores: 8, bench: { gflops: 400, bandwidthGBs: 50 } },
    gamer: { gpu: gpu({ vendor: 'nvidia', architecture: 'ada', description: 'NVIDIA GeForce RTX 4070' }), browser: { name: 'Chrome', os: 'Windows' }, storage: {}, ramGB: 8, cores: 16, bench: { gflops: 9000, bandwidthGBs: 400 } },
    noF16: { gpu: gpu({ f16: false, features: [] }), browser: { name: 'Chrome', os: 'Windows' }, storage: {}, ramGB: 8, cores: 8, bench: { gflops: 400, bandwidthGBs: 50 } },
    tinyBind: { gpu: gpu({ limits: { maxBufferSize: 268435456, maxStorageBufferBindingSize: 134217728 } }), browser: { name: 'Chrome', os: 'Android' }, storage: {}, ramGB: 4, cores: 8, bench: { gflops: 100, bandwidthGBs: 20 } },
    software: { gpu: gpu({ vendor: 'google', architecture: 'swiftshader', isFallback: true, f16: false }), browser: { name: 'Chrome', os: 'Linux' }, storage: {}, ramGB: 8, cores: 4, bench: { gflops: 0.05, bandwidthGBs: 0.2 } },
  };
  return { frame, app, answer, SYS, gpu, db };
})();
