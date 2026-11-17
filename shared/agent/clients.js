/* SlopAgentClients: how each AI app on a computer connects to Slopographic through the Slopographic MCP server
 * (tools/claude-plugin/). The one source for the site's help ("Use Slopographic from Claude Code and other AI apps" in
 * how-it-works) and the README that tools/claude-plugin/publish.mjs writes. Pure data: window.SlopAgentClients on pages,
 * a CommonJS module for Node.
 *   PUBLISHED   true: the public repository slopographic/claude-plugin exists (false would show "coming soon" instead; the one flag)
 *   REPO        the public repository (owner/name)     NPX  the command that runs the server with no install
 *   list        [{ id, name, steps: [text], snippets: [{ label, file?, lang, code }], note? }]
 * Formats checked against each vendor's documentation on 2026-10-24 (links in each entry's doc). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopAgentClients = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PUBLISHED = true;
  const REPO = 'slopographic/claude-plugin';
  const NPX = ['npx', '-y', `github:${REPO}`];
  const json = (o) => JSON.stringify(o, null, 2);
  const server = { command: NPX[0], args: NPX.slice(1) };
  const list = [
    { id: 'claude-code', name: 'Claude Code', doc: 'https://code.claude.com/docs/en/plugins/install',
      steps: ['In Claude Code, add the marketplace and install the plugin (once):', 'Then, whenever you want to use Slopographic:'],
      snippets: [
        { label: 'Install', lang: 'text', code: `/plugin marketplace add ${REPO}\n/plugin install slopographic@slopographic` },
        { label: 'Connect', lang: 'text', code: '/slopographic:slop-connect photoslop' },
        { label: 'Or without the plugin', lang: 'sh', code: `claude mcp add slopographic -- ${NPX.join(' ')}` },
      ] },
    { id: 'claude-desktop', name: 'Claude Desktop', doc: 'https://modelcontextprotocol.io/docs/develop/connect-local-servers',
      steps: ['Download slopographic.mcpb and open it: Claude Desktop installs it as an extension (it brings its own Node).', 'Or add the server to claude_desktop_config.json (Settings ▸ Developer ▸ Edit Config), then quit and reopen Claude.'],
      snippets: [
        { label: 'Extension', lang: 'text', code: `https://github.com/${REPO}/releases/latest/download/slopographic.mcpb` },
        { label: 'claude_desktop_config.json', file: '~/Library/Application Support/Claude/claude_desktop_config.json · %APPDATA%\\Claude\\claude_desktop_config.json', lang: 'json', code: json({ mcpServers: { slopographic: server } }) },
      ] },
    { id: 'codex', name: 'OpenAI Codex (CLI, IDE and the ChatGPT desktop app)', doc: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
      steps: ['Run the command once, or add the lines to ~/.codex/config.toml. The first start downloads the server, so give it a minute.'],
      snippets: [
        { label: 'Command', lang: 'sh', code: `codex mcp add slopographic -- ${NPX.join(' ')}` },
        { label: '~/.codex/config.toml', lang: 'toml', code: `[mcp_servers.slopographic]\ncommand = "npx"\nargs = ["-y", "github:${REPO}"]\nstartup_timeout_sec = 60\ntool_timeout_sec = 600` },
      ] },
    { id: 'gemini', name: 'Gemini CLI', doc: 'https://geminicli.com/docs/tools/mcp-server/',
      steps: ['Add the server to ~/.gemini/settings.json. Antigravity CLI takes the same entry in ~/.gemini/config/mcp_config.json.'],
      snippets: [{ label: '~/.gemini/settings.json', lang: 'json', code: json({ mcpServers: { slopographic: Object.assign({}, server, { timeout: 600000 }) } }) }] },
    { id: 'cursor', name: 'Cursor', doc: 'https://cursor.com/docs/context/mcp',
      steps: ['Add the server to ~/.cursor/mcp.json (every project) or .cursor/mcp.json (one project).'],
      snippets: [{ label: '~/.cursor/mcp.json', lang: 'json', code: json({ mcpServers: { slopographic: Object.assign({ type: 'stdio' }, server) } }) }] },
    { id: 'vscode', name: 'VS Code (GitHub Copilot)', doc: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
      steps: ['Run the command once (it adds the server to your profile), or add it to .vscode/mcp.json in a project. Note the key is "servers".'],
      snippets: [
        { label: 'Command', lang: 'sh', code: `code --add-mcp '${JSON.stringify(Object.assign({ name: 'slopographic', type: 'stdio' }, server))}'` },
        { label: '.vscode/mcp.json', lang: 'json', code: json({ servers: { slopographic: Object.assign({ type: 'stdio' }, server) } }) },
      ] },
    { id: 'windsurf', name: 'Windsurf / Devin Desktop', doc: 'https://docs.devin.ai/desktop/cascade/mcp',
      steps: ['Add the server to mcp_config.json: ~/.config/devin/mcp_config.json (Devin Desktop; %APPDATA%\\devin on Windows) or ~/.codeium/windsurf/mcp_config.json (Windsurf).'],
      snippets: [{ label: 'mcp_config.json', lang: 'json', code: json({ mcpServers: { slopographic: server } }) }] },
    { id: 'chatgpt', name: 'ChatGPT (chat)', doc: 'https://developers.openai.com/apps-sdk/deploy/connect-chatgpt',
      steps: ['ChatGPT chats connect only to servers on the internet (an https address), not to a program on your computer, so this server does not work there yet. Codex in the ChatGPT desktop app does (see OpenAI Codex).'],
      snippets: [] },
  ];
  return { PUBLISHED, REPO, NPX, list };
});
