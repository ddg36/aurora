const { html } = globalThis;
const { useEffect, useMemo, useState } = globalThis.preactHooks;

import { Button, Chip, ChipGroup, AutoFitChips, Empty, Icon, List, ListItem, Panel, PanelBody, PanelHeader, Select, Status, Textarea, ToolPage, ToolHeader } from '../../../components/index.js?v=v1-surface-convergence-1';
import { JsonBlock } from '../../../components/shared/JsonBlock.js';
import { cargarHealth } from '../scripts/services.js';
import { cargarTools, ejecutarTool } from '../scripts/tools.js';
import { cargarMcpClientConfig, cargarMcpStatus, llamarMcp } from '../scripts/mcp.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

const SECTIONS = ['Services', 'LLM', 'Tools', 'MCP'];

function tone(ok) {
  return ok ? 'ok' : 'err';
}

function Shell({ active, setActive }) {
  return html`
    <${AutoFitChips}>
      ${SECTIONS.map(item => html`
        <${Chip} key=${item} active=${active === item} onClick=${() => setActive(item)}>${item}<//>
      `)}
    <//>
  `;
}

function ServicesView({ health, reload }) {
  const providers = health?.llm?.providers || [];
  return html`
    <div class="tool-module-grid">
      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Servicios</div>
          <${Button} size="sm" onClick=${reload}>Probar</${Button}>
        </${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-2">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-aurora-text">Aurora Server</span>
              <${Status} tone="ok">online</${Status}>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-aurora-text">SQLite</span>
              <${Status} tone=${tone(health?.db?.ok)}>${health?.db?.ok ? 'online' : 'offline'}</${Status}>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-aurora-text">LLM Gateway</span>
              <${Status} tone=${tone(health?.llama?.ok)}>${health?.llama?.ok ? 'online' : 'offline'}</${Status}>
            </div>
          </div>
        </${PanelBody}>
      </${Panel}>

      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Providers</div>
          <${Chip}>${providers.filter(p => p.online).length}/${providers.length} online</${Chip}>
        </${PanelHeader}>
        <${PanelBody}>
          ${providers.length
            ? html`<div class="tool-compact-rows">
                ${providers.map(p => html`
                  <div class="tool-compact-row">
                    <${Status} tone=${tone(p.online)}>${p.online ? 'online' : 'offline'}</${Status}>
                    <div class="min-w-[140px] flex-1">
                      <div class="text-sm font-semibold text-aurora-text">${p.name}</div>
                      <div class="text-xs text-aurora-text-dim">${p.base_url}</div>
                    </div>
                    <${Chip}>${p.kind}</${Chip}>
                    <${Chip}>${(p.models || []).length} modelos</${Chip}>
                    ${p.latency_ms != null && html`<${Chip}>${p.latency_ms} ms</${Chip}>`}
                  </div>
                `)}
              </div>`
            : html`<${Empty} title="Sin providers detectados">Inicia llama.cpp, Ollama o LM Studio.</${Empty}>`}
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function LlmView({ health }) {
  const models = (health?.llm?.providers || []).flatMap(p => (p.models || []).map(m => ({ ...m, provider: p.name, online: p.online })));
  return html`
    <${Panel}>
      <${PanelHeader}>
        <div class="font-semibold text-aurora-text">Modelos descubiertos</div>
        <${Chip}>${models.length}</${Chip}>
      </${PanelHeader}>
      <${PanelBody}>
        ${models.length
          ? html`<div class="grid gap-2">
              ${models.map(m => html`
                <div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <div class="min-w-[220px] flex-1 text-sm font-semibold text-aurora-text">${m.name}</div>
                    <${Chip}>${m.provider}</${Chip}>
                  </div>
                  <${ChipGroup}>
                    ${Object.entries(m.capabilities || {}).filter(([, enabled]) => enabled).map(([name]) => html`<${Chip} variant="accent">${name}</${Chip}>`)}
                  </${ChipGroup}>
                </div>
              `)}
            </div>`
          : html`<${Empty} title="Sin modelos">No hay modelos disponibles en providers locales.</${Empty}>`}
      </${PanelBody}>
    </${Panel}>
  `;
}

function ToolsView({ tools, reload }) {
  const [selected, setSelected] = useState('');
  const [input, setInput] = useState('{\n  "path": "."\n}');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const tool = tools.find(t => t.name === selected) || tools[0];

  useEffect(() => {
    if (!selected && tools[0]) setSelected(tools[0].name);
  }, [tools, selected]);

  async function run() {
    setError('');
    setResult(null);
    try {
      setResult(await ejecutarTool(tool.name, input));
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  return html`
    <div class="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Tool Registry</div>
          <${Button} size="sm" onClick=${reload}>Recargar</${Button}>
        </${PanelHeader}>
        <${PanelBody}>
          ${tools.length
            ? html`<div class="grid gap-2">
                ${tools.map(t => html`
                  <div class=${['rounded-md border px-3 py-2 cursor-pointer fx-hover', selected === t.name ? 'border-aurora-accent bg-aurora-surface-2' : 'border-aurora-border bg-aurora-surface'].join(' ')} onClick=${() => setSelected(t.name)}>
                    <div class="flex flex-wrap items-center gap-2">
                      <div class="min-w-[240px] flex-1 text-sm font-semibold text-aurora-text">${t.name}</div>
                      <${Chip} variant=${t.risk === 'high' ? 'yt' : 'accent'}>${t.risk}</${Chip}>
                      ${t.requires_approval && html`<${Chip}>approval</${Chip}>`}
                    </div>
                    <div class="mt-1 text-xs text-aurora-text-dim">${t.description}</div>
                  </div>
                `)}
              </div>`
            : html`<${Empty} title="Sin tools">El registry no devolvió tools.</${Empty}>`}
        </${PanelBody}>
      </${Panel}>

      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Run Tool</div>
          <${Button} size="sm" variant="primary" disabled=${!tool} onClick=${run}>Run</${Button}>
        </${PanelHeader}>
        <${PanelBody}>
          ${tool && html`
            <div class="grid gap-3">
              <${Select} value=${tool.name} onChange=${e => setSelected(e.target.value)}>
                ${tools.map(t => html`<option value=${t.name}>${t.name}</option>`)}
              </${Select}>
              <${ChipGroup}>
                <${Chip}>${tool.risk}</${Chip}>
                ${(tool.scopes || []).map(scope => html`<${Chip} variant="accent">${scope}</${Chip}>`)}
              </${ChipGroup}>
              <${Textarea} rows=${8} value=${input} onInput=${e => setInput(e.target.value)} />
              ${error && html`<${Status} tone="err">${error}</${Status}>`}
              ${result && html`<${JsonBlock} value=${result} />`}
              <${JsonBlock} value=${tool.input_schema} />
            </div>
          `}
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function McpView({ tools, status, clientConfig, reload }) {
  const exposed = tools.filter(t => (t.tags || []).includes('mcp'));
  const [method, setMethod] = useState('tools/list');
  const [params, setParams] = useState('{}');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function runRpc() {
    setError('');
    setResult(null);
    try {
      const parsed = params.trim() ? JSON.parse(params) : {};
      setResult(await llamarMcp(method, parsed));
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function copyClientConfig() {
    const text = JSON.stringify(clientConfig?.claude_desktop || {}, null, 2);
    const ok = await copiarTexto(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }

  return html`
    <div class="grid gap-3 xl:grid-cols-[1fr_.9fr]">
      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">MCP Bridge</div>
          <${Button} size="sm" onClick=${reload}>Recargar</${Button}>
        </${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-3 md:grid-cols-4">
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="text-xs text-aurora-text-dim">Aurora MCP Server</div>
              <${Status} tone="ok">${status?.server?.transport || 'http-json-rpc'}</${Status}>
              <div class="mt-2 text-xs text-aurora-text-dim">${status?.server?.endpoint || '/mcp/rpc'}</div>
            </div>
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="text-xs text-aurora-text-dim">External MCP Servers</div>
              <div class="mt-2 text-2xl font-semibold text-aurora-text">${(status?.external || []).length}</div>
            </div>
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="text-xs text-aurora-text-dim">Tools exponibles</div>
              <div class="mt-2 text-2xl font-semibold text-aurora-text">${exposed.length}</div>
            </div>
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="text-xs text-aurora-text-dim">Stdio client</div>
              <${Status} tone=${clientConfig?.claude_desktop ? 'ok' : 'loading'}>${clientConfig?.claude_desktop ? 'ready' : 'loading'}</${Status}>
              <div class="mt-2 text-xs text-aurora-text-dim">Claude Desktop compatible</div>
            </div>
          </div>

          <div class="mt-3 grid gap-3 lg:grid-cols-2">
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3 lg:col-span-2">
              <div class="mb-2 flex items-center gap-2">
                <div class="flex-1 text-sm font-semibold text-aurora-text">Client config</div>
                <${Button} size="sm" onClick=${copyClientConfig}>${copied ? 'Copiado' : 'Copiar'}</${Button}>
              </div>
              <${JsonBlock} value=${clientConfig?.claude_desktop || {}} />
            </div>

            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="mb-2 text-sm font-semibold text-aurora-text">Resources</div>
              <div class="grid gap-2">
                ${(status?.resources || []).map(r => html`
                  <div class="rounded border border-aurora-border px-2 py-1.5">
                    <div class="text-xs font-semibold text-aurora-text">${r.uri}</div>
                    <div class="text-xs text-aurora-text-dim">${r.description}</div>
                  </div>
                `)}
              </div>
            </div>
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="mb-2 text-sm font-semibold text-aurora-text">Prompts</div>
              <div class="grid gap-2">
                ${(status?.prompts || []).map(p => html`
                  <div class="rounded border border-aurora-border px-2 py-1.5">
                    <div class="text-xs font-semibold text-aurora-text">${p.name}</div>
                    <div class="text-xs text-aurora-text-dim">${p.description}</div>
                  </div>
                `)}
              </div>
            </div>
          </div>

          <div class="mt-3 grid gap-2">
            <div class="text-sm font-semibold text-aurora-text">Tools MCP</div>
            ${exposed.map(t => html`
              <div class="flex flex-wrap items-center gap-2 rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
                <div class="flex-1 text-sm font-semibold text-aurora-text">${t.name}</div>
                <${Chip}>${t.risk}</${Chip}>
                ${(t.scopes || []).map(scope => html`<${Chip} variant="accent">${scope}</${Chip}>`)}
              </div>
            `)}
          </div>
        </${PanelBody}>
      </${Panel}>

      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Test Console</div>
          <${Button} size="sm" variant="primary" onClick=${runRpc}>Enviar</${Button}>
        </${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-3">
            <${Select} value=${method} onChange=${e => setMethod(e.target.value)}>
              ${['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get', 'aurora/externalServers'].map(m => html`<option value=${m}>${m}</option>`)}
            </${Select}>
            <${Textarea} rows=${7} value=${params} onInput=${e => setParams(e.target.value)} />
            ${error && html`<${Status} tone="err">${error}</${Status}>`}
            ${result && html`<${JsonBlock} value=${result} />`}
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 p-3">
              <div class="mb-2 text-sm font-semibold text-aurora-text">External servers</div>
              <div class="grid gap-2">
                ${(status?.external || []).map(s => html`
                  <div class="flex flex-wrap items-center gap-2 rounded border border-aurora-border px-2 py-1.5">
                    <${Status} tone=${s.enabled ? 'ok' : 'loading'}>${s.enabled ? 'enabled' : 'disabled'}</${Status}>
                    <span class="min-w-[90px] flex-1 text-sm text-aurora-text">${s.id}</span>
                    <${Chip}>${s.type}</${Chip}>
                    <span class="text-xs text-aurora-text-dim">${s.command || s.url || ''}</span>
                  </div>
                `)}
              </div>
            </div>
          </div>
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

export function AuroraControl() {
  const [active, setActive] = useState('Services');
  const [health, setHealth] = useState(null);
  const [tools, setTools] = useState([]);
  const [mcpStatus, setMcpStatus] = useState(null);
  const [mcpClientConfig, setMcpClientConfig] = useState(null);

  const loadHealth = () => cargarHealth().then(setHealth).catch(() => setHealth(null));
  const loadTools = () => cargarTools().then(setTools).catch(() => setTools([]));
  const loadMcp = () => {
    return Promise.all([
      cargarMcpStatus().then(setMcpStatus).catch(() => setMcpStatus(null)),
      cargarMcpClientConfig().then(setMcpClientConfig).catch(() => setMcpClientConfig(null)),
    ]);
  };

  useEffect(() => {
    loadHealth();
    loadTools();
    loadMcp();
  }, []);

  useEffect(() => registerAIView({
    id: 'aurora',
    description: 'Centro de control: salud de servicios, providers, tools y MCP.',
    actions: {
      status: {
        description: 'Devuelve un resumen operativo sin depender del panel visible.',
        readOnly: true,
        run: async () => {
          const currentHealth = health || await cargarHealth().catch(() => null);
          const currentTools = tools.length ? tools : await cargarTools().catch(() => []);
          if (currentHealth && !health) setHealth(currentHealth);
          if (currentTools.length && !tools.length) setTools(currentTools);
          return {
            section: active,
            server: currentHealth ? 'online' : 'offline',
            database: currentHealth?.db?.ok ? 'online' : 'offline',
            localLLM: currentHealth?.llama?.ok ? 'online' : 'offline',
            providers: (currentHealth?.llm?.providers || []).map(provider => ({ name: provider.name, online: !!provider.online })),
            tools: { total: currentTools.length, forge: currentTools.filter(tool => (tool.tags || []).includes('forge')).length },
            mcp: { loaded: !!mcpStatus, external: (mcpStatus?.external || []).length },
          };
        },
      },
      refresh: {
        description: 'Recarga health, registry y MCP usando la misma lógica de los botones humanos.',
        run: async () => {
          await Promise.all([loadHealth(), loadTools(), loadMcp()]);
          return { refreshed: true };
        },
      },
      show_section: {
        description: 'Muestra una sección del centro de control.',
        input: { section: { type: 'string', required: true, enum: SECTIONS } },
        run: ({ section }) => { setActive(section); return { section }; },
      },
    },
  }), [active, health, tools, mcpStatus]);

  const content = useMemo(() => {
    if (active === 'LLM') return html`<${LlmView} health=${health} />`;
    if (active === 'Tools') return html`<${ToolsView} tools=${tools} reload=${loadTools} />`;
    if (active === 'MCP') return html`<${McpView} tools=${tools} status=${mcpStatus} clientConfig=${mcpClientConfig} reload=${loadMcp} />`;
    return html`<${ServicesView} health=${health} reload=${loadHealth} />`;
  }, [active, health, tools, mcpStatus, mcpClientConfig]);

  return html`
    <${ToolPage} wide>
      <${ToolHeader} icon="aurora" eyebrow="Infraestructura" title="Aurora Control Center" description="Servicios locales, modelos y capacidades que sostienen el panel." actions=${html`
          <${Shell} active=${active} setActive=${setActive} />
          <a href="/ui/tasks.html" target="_parent" class="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold rounded-md border border-aurora-border bg-aurora-surface hover:bg-aurora-surface-2 text-aurora-text no-underline">
            <${Icon} name="productivity" size=${14}/> Tasks
          </a>
      `} />
      ${content}
    <//>
  `;
}

export default AuroraControl;
