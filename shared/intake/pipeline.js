/* SlopIntake pipeline: the one path every file takes into an app, whatever its source. Pure (no DOM): the page's side
   (events, dialogs, the progress list) comes in as env, so Node tests run it as it is. Loads after rules.js and
   normalize.js. SlopIntake.createPipeline(env) → { register, unregister, spec, specs, take }. intake.js makes the page's one
   pipeline with the real env. See shared/intake/HANDOFF.md.
   take(input, { source, to, mode, at, data }) runs one batch, in this order:
     1. normalize: the source's input → Files (normalize.js)
     2. accept: the spec's rules (rules.js) or accept(file) → true | false | 'reason', and except(file); refusals keep
        their reason. route(files, batch) → the files kept: the app may hand the others to another spec or a dialog
     3. event 'before' (env.emit returns false when a listener cancels)
     4. gates, in order: the first-use notice (once per batch, env.notice); the count and size limits; "Add to <open doc>
        or New" when the app has something open (env.choose, skipped when the source gave a mode); the app's gate(batch)
     5. before(batch) → batch | File[] | false
     6. process(file, ctx) over the files, at most `concurrency` at once (default 1); or onAdd/onNew(files, ctx) for the
        whole batch when the app gives them for the chosen mode, or processAll(files, ctx) for a reader that wants them all. Event 'file' after each file.
     7. after(results, batch); the feedback (env.view(id): the drop zone's rows, or env.report: a toast); event 'after'.
   A single file is a batch of one. Batches for one app run one after another (drops during a batch queue up). */
(function (root) {
  'use strict';
  const SI = (root.SlopIntake = root.SlopIntake || {});
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  /** A noun or label an app gave: an i18n key (read in the current language when used), a function, or text (SlopI18n.label). */
  const lab = (v) => { const I = globalThis.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };

  SI.createPipeline = function (env) {
    env = env || {};
    const R = SI.rules;
    const specs = [];
    const chains = new Map();
    let seq = 0;
    const noop = () => {};
    const emit = (type, detail) => (env.emit ? env.emit(type, detail) !== false : true);

    /** Registers an app (or one of its parts). spec: { id, accept, noun, process, ... } (see HANDOFF.md). Registering the
     *  same id again replaces it. first: true puts it before the others (paste goes to the first that takes the file). */
    function register(spec) {
      if (!spec || !spec.id) throw new Error('SlopIntake.register: an id is needed');
      if (typeof spec.process !== 'function' && typeof spec.processAll !== 'function' && typeof spec.onNew !== 'function' && typeof spec.onAdd !== 'function') throw new Error('SlopIntake.register(' + spec.id + '): process(file, ctx) is needed');
      const i = specs.findIndex((s) => s.id === spec.id);
      if (i >= 0) specs.splice(i, 1, spec);
      else if (spec.first) specs.unshift(spec);
      else specs.push(spec);
      return () => unregister(spec.id, spec);
    }
    function unregister(id, only) {
      const i = specs.findIndex((s) => s.id === id && (!only || s === only));
      if (i >= 0) specs.splice(i, 1);
    }
    /** The spec a take goes to: the one named, else the page's main one (main: true, else the first that is not part-only). */
    function spec(id) {
      if (id) return specs.find((s) => s.id === id) || null;
      return specs.find((s) => s.main) || specs.find((s) => s.main !== false) || specs[0] || null;
    }

    /** Is a file taken? { ok } or { ok: false, reason }. accept: rules object, function, or nothing (everything). */
    function check(s, file) {
      const c = checkRules(s, file);
      if (!c.ok || !s.except) return c;
      const x = s.except(file); // the app leaves some files to its own path (its own clipboard copies): a reason, or true
      return x ? { ok: false, reason: typeof x === 'string' ? x : tr('ui.intake.not_here', '{name} is not taken here', { name: file.name || tr('ui.intake.file', 'file') }) } : c;
    }
    function checkRules(s, file) {
      const a = s.accept;
      if (typeof a === 'function') {
        const r = a(file);
        if (r === true || (r && r.ok)) return { ok: true };
        return { ok: false, reason: typeof r === 'string' ? r : (r && r.reason) || tr('ui.intake.not_noun', '{name} is not {noun}', { name: file.name || tr('ui.intake.file', 'file'), noun: s.noun ? lab(s.noun) : tr('ui.intake.supported', 'a supported file') }) };
      }
      const rules = Object.assign({}, a || { any: true });
      if (s.noun && !rules.noun) rules.noun = s.noun;
      if (s.maxBytes && !rules.maxBytes) rules.maxBytes = s.maxBytes;
      return R ? R.check(file, rules) : { ok: true };
    }

    /** Gate 2: the count and size limits. Files past them are refused, with the reason. */
    function limits(s, batch) {
      const limit = s.limit || Infinity, total = s.maxTotal || Infinity;
      let bytes = 0;
      const keep = [];
      for (const f of batch.take) {
        let reason = '';
        if (keep.length >= limit) reason = limit === 1 ? tr('ui.intake.one_at_a_time', '{name} is not taken: only one file at a time', { name: f.name }) : tr('ui.intake.n_at_a_time', '{name} is not taken: only {n} files at a time', { name: f.name, n: String(limit) });
        else if (bytes + (f.size || 0) > total) reason = tr('ui.intake.too_much', '{name} is not taken: more than {size} at once', { name: f.name, size: R.size(total) });
        if (reason) batch.refused.push({ file: f, name: f.name, reason });
        else { keep.push(f); bytes += f.size || 0; }
      }
      batch.take = keep;
    }
    const sourcesOf = (s, key) => (s[key] === undefined ? null : [].concat(s[key]));
    const detail = (batch, extra) => Object.assign({ app: batch.app, source: batch.source, mode: batch.mode, files: batch.take.slice(), refused: batch.refused.slice(), batch }, extra);

    async function run(s, input, opts) {
      const view = (env.view && env.view(s.id)) || null;
      const batch = { id: ++seq, app: s.id, source: opts.source || 'api', mode: opts.mode || null, at: opts.at || null, data: Object.assign({}, opts.data), files: [], take: [], refused: [], cancelled: false };
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      batch.signal = ac ? ac.signal : null;
      batch.cancel = () => { batch.cancelled = true; if (ac) ac.abort(); };
      const summary = { app: s.id, source: batch.source, mode: null, added: [], skipped: [], refused: [], cancelled: false, batch };
      let shown = 0;
      const showRefused = () => { if (view && view.refuse) for (; shown < batch.refused.length; shown++) view.refuse(batch.refused[shown]); };
      const finish = (cancelled) => {
        if (!cancelled) showRefused();
        summary.cancelled = !!cancelled;
        summary.mode = batch.mode;
        summary.refused = batch.refused.map((r) => ({ name: r.name, reason: r.reason, file: r.file }));
        summary.skipped = summary.refused.map((r) => ({ name: r.name, reason: r.reason })).concat(summary.skipped);
        if (view && view.end) view.end(summary, batch);
        else if (env.report && !cancelled) env.report(summary, batch);
        emit('after', Object.assign(detail(batch), { results: summary.added.map((a) => a.value), summary }));
        return summary;
      };
      try { batch.files = await SI.normalize(input); } catch (e) { batch.files = []; batch.readError = e; }
      if (batch.readError && env.toast) env.toast(tr('ui.intake.read_failed', 'Could not read the files'), 'warn');
      if (view && view.begin) view.begin(batch);
      if (!batch.files.length) { if (view && view.end) view.end(summary, batch); return summary; }
      // 2. accept
      for (const f of batch.files) {
        const c = check(s, f);
        if (c.ok) batch.take.push(f); else batch.refused.push({ file: f, name: f.name, reason: c.reason });
      }
      // 2b. route: the app may send some files elsewhere (another spec, a dialog) and keep the rest
      if (batch.take.length && s.route) {
        const kept = await s.route(batch.take.slice(), batch);
        if (Array.isArray(kept)) { batch.routed = batch.take.filter((f) => !kept.includes(f)); batch.take = kept; }
        if (!batch.take.length) return finish(false);
      }
      // 3. the before event: a listener may cancel the batch (detail.batch.cancel() or preventDefault)
      if (batch.take.length && !emit('before', detail(batch))) batch.cancel();
      if (batch.cancelled) return finish(true);
      // 4. gates
      if (batch.take.length && s.notice && env.notice) {
        const notice = typeof s.notice === 'function' ? s.notice(batch) : s.notice;
        if (notice && !(await env.notice(s, notice, batch))) return finish(true);
      }
      limits(s, batch);
      const asks = sourcesOf(s, 'ask'); // the sources the Add or New choice is asked for (default: all)
      if (batch.take.length && !batch.mode && s.hasOpen && (!asks || asks.includes(batch.source))) {
        let open = false;
        try { open = !!s.hasOpen(batch); } catch (e) { open = false; }
        if (open) {
          const name = s.openName ? s.openName(batch) : tr('ui.intake.open_doc', 'the open document');
          const pick = env.choose ? await env.choose({ count: batch.take.length, names: batch.take.map((f) => f.name), name, source: batch.source, app: s.id, labels: s.labels }) : 'add';
          if (!pick) return finish(true);
          batch.mode = pick;
        } else batch.mode = 'new';
      }
      if (batch.take.length && s.gate) { if ((await s.gate(batch)) === false) return finish(true); }
      // 5. before hook
      if (batch.take.length && s.before) {
        const r = await s.before(batch);
        if (r === false || batch.cancelled) return finish(true);
        if (Array.isArray(r)) batch.take = r;
        else if (r && r.take) batch.take = r.take;
      }
      if (!batch.take.length) return finish(false);
      // 6. process: the whole batch (onAdd / onNew for the mode) or a file at a time in a bounded pool
      showRefused();
      const rows = new Map();
      for (const f of batch.take) rows.set(f, view && view.row ? view.row(f) : null);
      const ctxFor = (f, i) => {
        const row = rows.get(f);
        return { source: batch.source, mode: batch.mode, at: batch.at, index: i, data: batch.data, batch, signal: batch.signal, drive: f.slopDrive || null,
          progress: row && row.progress ? (p) => row.progress(p) : noop };
      };
      const whole = (batch.mode === 'add' && s.onAdd) || (batch.mode === 'new' && s.onNew) || s.processAll || (typeof s.process !== 'function' && (s.onNew || s.onAdd)) || null;
      const done = new Array(batch.take.length);
      /** A file's outcome: its row, its place in the summary (in the files' order), and the 'file' event at once. */
      const settle = (f, i, r) => {
        const row = rows.get(f);
        let reason = '';
        if (!r.ok && !r.skipped) {
          const msg = (r.error && r.error.message) || tr('ui.intake.unreadable', 'could not be read');
          reason = msg.includes(f.name) ? msg : f.name + ' ' + msg;
        }
        done[i] = { f, r, reason };
        if (row && row.set) { if (r.ok) row.set('ready', tr('ui.intake.ready', 'Ready')); else if (!r.skipped) row.set('error', reason); }
        if (!r.skipped) emit('file', { app: s.id, source: batch.source, mode: batch.mode, file: f, index: i, ok: !!r.ok, result: r.ok ? r.value : undefined, error: r.ok ? undefined : r.error, batch });
      };
      if (whole) {
        let r;
        try { const out = [].concat((await whole(batch.take.slice(), ctxFor(batch.take[0], 0))) || []); r = (i) => ({ ok: true, value: out[i] }); }
        catch (error) { r = () => ({ ok: false, error }); }
        batch.take.forEach((f, i) => settle(f, i, r(i)));
      } else {
        const res = await SI.pool(batch.take, s.concurrency || 1, async (f, i) => {
          let r;
          try { r = { ok: true, value: await s.process(f, ctxFor(f, i)) }; } catch (error) { r = { ok: false, error }; }
          settle(f, i, r);
          return r;
        }, () => batch.cancelled);
        res.forEach((r, i) => { if (r.skipped) done[i] = { f: batch.take[i], r }; });
      }
      for (const d of done) {
        if (!d) continue;
        if (d.r.ok) summary.added.push({ name: d.f.name, value: d.r.value, file: d.f });
        else if (!d.r.skipped) summary.skipped.push({ name: d.f.name, reason: d.reason });
      }
      // 7. after
      if (s.after) { try { await s.after(summary.added.map((a) => a.value), batch, summary); } catch (e) { if (env.warn) env.warn('SlopIntake after', e); } }
      return finish(batch.cancelled);
    }

    /** One batch into an app. input: anything normalize takes (or a Promise of it). opts: { source, to, mode, at, data }.
     *  Resolves the summary { app, source, added: [{ name, value, file }], skipped: [{ name, reason }], cancelled }. */
    function take(input, opts) {
      opts = opts || {};
      const s = spec(opts.to);
      if (!s) {
        if (env.warn) env.warn('SlopIntake.take: no app is registered' + (opts.to ? ' as ' + opts.to : ''));
        return Promise.resolve({ app: null, source: opts.source || 'api', added: [], skipped: [], cancelled: true });
      }
      const prev = chains.get(s.id) || Promise.resolve();
      const next = prev.then(() => run(s, input, opts)).catch((e) => {
        if (env.warn) env.warn('SlopIntake', e);
        return { app: s.id, source: opts.source || 'api', added: [], skipped: [], cancelled: true, error: e };
      });
      chains.set(s.id, next);
      return next;
    }

    return { register, unregister, spec, specs: () => specs.slice(), take, check };
  };
})(typeof window !== 'undefined' ? window : globalThis);
