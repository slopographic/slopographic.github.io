/* SlopAgentTools: turns provider-neutral tool definitions into WebMCP tools. Pure (no DOM): window.SlopAgentTools on
 * pages, a CommonJS module for Node tests. The definitions are the one tool list (shared/ai/apptools.js appTools.build:
 * the app's SlopCmd commands with args, ai: false left out, app_state, list_commands, run_command, the operations, the
 * Slop Drive files) through cmdTools.neutral (shared/ai/cmdtools.js), plus shared/agent/workspace.js.
 * A neutral definition (cmdTools.neutral's shape): { name, title?, description, inputSchema, readOnly?, mayDestroy?, untrusted? (it returns the person's own content),
 *   destructive?: bool | fn(input),
 *   confirmText?(input), run(input) → value }.
 *   unique(defs, reserved?)   names cleaned to NAME_RE and made unique (a later duplicate gets _2, _3…)
 *   checkSchema(schema)       → [problems]: what a tool's inputSchema must be (an object type, typed properties)
 *   toWebMCP(def, { confirm }) → the tool the browser's model context takes: { name, title, description, inputSchema,
 *       annotations: { readOnlyHint, consequentialHint?, destructiveHint?, untrustedContentHint? }, execute(input, options) }.
 *       A destructive call asks first: confirm(text, options) → Promise<bool>; a refusal or an error comes back as a text result with isError.
 *   result(value, isError)    the MCP-style result { content: [{ type: 'text', text }], isError? } */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopAgentTools = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  /** The question a person reads before a destructive call (shared/i18n/ui/en/agent.js); the key alone where no tables are (Node). */
  const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
  /** Tool names: letters, digits, _ . - (the WebMCP and MCP rule), at most 64 characters. */
  const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
  const MAX_TEXT = 60000;

  function cleanName(s) {
    const n = String(s || '').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '').toLowerCase().slice(0, 64);
    return n || 'tool';
  }
  function unique(defs, reserved = []) {
    const taken = new Set(reserved), out = [];
    for (const d of defs) {
      const base = cleanName(d.name).slice(0, 60);
      let name = base, i = 1;
      while (taken.has(name)) name = `${base}_${++i}`;
      taken.add(name);
      out.push(Object.assign({}, d, { name }));
    }
    return out;
  }

  const schemaOf = (d) => d.inputSchema || { type: 'object', properties: {} };

  const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
  function checkSchema(s, at = 'inputSchema') {
    const out = [];
    if (!s || typeof s !== 'object') return [`${at} is not an object`];
    if (at === 'inputSchema' && s.type !== 'object') out.push(`${at}.type must be "object"`);
    if (s.type && !TYPES.has(s.type)) out.push(`${at}.type "${s.type}" is not a JSON Schema type`);
    if (s.properties) for (const [k, p] of Object.entries(s.properties)) out.push(...checkSchema(p, `${at}.properties.${k}`));
    if (s.items) out.push(...checkSchema(s.items, `${at}.items`));
    if (s.required && (!Array.isArray(s.required) || s.required.some((r) => !s.properties || !(r in s.properties)))) out.push(`${at}.required names a property it does not have`);
    if (s.enum && (!Array.isArray(s.enum) || !s.enum.length)) out.push(`${at}.enum is empty`);
    try { JSON.stringify(s); } catch (e) { out.push(`${at} is not JSON`); }
    return out;
  }

  const isDestructive = (d, input) => { try { return typeof d.destructive === 'function' ? !!d.destructive(input || {}) : !!d.destructive; } catch (e) { return true; } };
  /** Could this tool ever destroy work? (the annotation; the per-call check decides whether to ask) */
  const mayDestroy = (d) => (d.mayDestroy != null ? !!d.mayDestroy : typeof d.destructive === 'function' || !!d.destructive);

  function text(v) {
    if (v == null) return 'Done.';
    const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + `\n… (${s.length - MAX_TEXT} more characters)` : s;
  }
  /** A picture a tool hands back ({ text, media: [{ mime, data }] }: look_at_canvas, a snapshot) goes as MCP image content. */
  const result = (v, isError) => {
    if (isError) return { content: [{ type: 'text', text: text(v) }], isError: true };
    if (v && typeof v === 'object' && Array.isArray(v.media)) return { content: [{ type: 'text', text: text(v.text || 'Done.') }].concat(v.media.filter((m) => m && m.data).map((m) => ({ type: 'image', data: m.data, mimeType: m.mime || 'image/jpeg' }))) };
    return { content: [{ type: 'text', text: text(v) }] };
  };

  function toWebMCP(d, { confirm } = {}) {
    // readOnlyHint, consequentialHint and untrustedContentHint are WebMCP's (the spec's ToolAnnotations); destructiveHint
    // is MCP's name for the same warning, which MCP-B and desktop clients read
    const annotations = { readOnlyHint: !!d.readOnly };
    if (!d.readOnly && mayDestroy(d)) { annotations.consequentialHint = true; annotations.destructiveHint = true; }
    if (d.untrusted) annotations.untrustedContentHint = true;
    const tool = {
      name: d.name, description: String(d.description || d.title || d.name).slice(0, 1000), inputSchema: schemaOf(d), annotations,
      async execute(input, options) {
        const client = options || null;
        const args = input && typeof input === 'object' ? input : {};
        try {
          if (isDestructive(d, args)) {
            const what = d.confirmText ? d.confirmText(args) : tr('ui.agent.wants_run', { what: d.title || d.name });
            const ok = confirm ? await confirm(what, client) : false;
            if (!ok) return result('The person did not allow this action, so nothing was changed.', true);
          }
          return result(await d.run(args, { client }));
        } catch (e) { return result(String((e && e.message) || e), true); }
      },
    };
    if (d.title) tool.title = d.title;
    return tool;
  }

  return { NAME_RE, cleanName, unique, schemaOf, checkSchema, isDestructive, mayDestroy, toWebMCP, result, text };
});
