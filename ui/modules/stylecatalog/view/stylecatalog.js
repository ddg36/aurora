const html = (...args) => globalThis.html(...args);
const { useState } = globalThis.preactHooks;

import { PRIMITIVES, TOKENS, PATTERNS, resolveToken } from '../scripts/catalogo.js';
import {
  Button, Toolbar, ToolbarSpacer,
  Panel, PanelHeader, PanelBody, PanelFooter, PanelLabel, PanelValue,
  List, ListItem, Empty, Chip, ChipGroup, Input, Textarea, Select,
  ChatMessage, ChatList,
} from '../../../components/index.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { mostrarTemporal } from '../../../components/shared/flash.js';

function Preview({ id }) {
  switch (id) {
    case 'button':
      return html`
        <div class="flex flex-wrap gap-2 items-center">
          <${Button}>Default<//>
          <${Button} variant="primary">Primary<//>
          <${Button} variant="danger">Danger<//>
          <${Button} size="sm">Small<//>
          <${Button} active>Active<//>
          <${Button} disabled>Disabled<//>
        </div>
      `;
    case 'panel':
      return html`
        <div class="flex flex-col gap-2">
          <${Panel}>
            <${PanelHeader}>Panel default<//>
            <${PanelBody}>Contenido<//>
          <//>
          <${Panel} stat>
            <${PanelValue}>42<//>
            <${PanelLabel}>Items<//>
          <//>
        </div>
      `;
    case 'toolbar':
      return html`
        <div class="flex flex-col gap-2">
          <${Toolbar} title="Actions">
            <${ToolbarSpacer} />
            <${Button} size="sm">Button<//>
          <//>
          <${Toolbar} title="Compact" compact>
            <${ToolbarSpacer} />
            <${Button} size="sm">✕<//>
          <//>
        </div>
      `;
    case 'chip':
      return html`
        <${ChipGroup}>
          <${Chip}>Default<//>
          <${Chip} active>Active<//>
        <//>
      `;
    case 'input':
      return html`
        <div class="flex flex-col gap-2 max-w-xs">
          <${Input} placeholder="Texto…" />
          <${Input} type="url" placeholder="https://…" />
          <${Textarea} rows=${3} placeholder="Multilínea…" />
          <${Select}><option>Opción A</option><option>Opción B</option><//>
        </div>
      `;
    case 'list':
      return html`
        <${List}>
          <${ListItem} icon="📁" name="Item uno" sub="Descripción" />
          <${ListItem} icon="📁" name="Item dos" sub="Seleccionado" />
        <//>
      `;
    case 'empty':
      return html`<${Empty} icon="📭" title="Nada acá">Creá algo para empezar.<//>`;
    case 'chatmessage':
      return html`
        <${ChatList}>
          <${ChatMessage} role="user" time="10:30">Hola Gemita<//>
          <${ChatMessage} role="assistant" time="10:31">¿En qué te ayudo?<//>
        <//>
      `;
    default:
      return html`<${Empty} icon="📦" title="Sin preview" />`;
  }
}

export default function StyleCatalog() {
  const [tab, setTab] = useState('components');
  const [prim, setPrim] = useState(null);
  const [pattern, setPattern] = useState(null);
  const [copiado, setCopiado] = useState(null);

  const copiar = async (snippet) => {
    await copiarTexto(snippet);
    mostrarTemporal(setCopiado, snippet, { delay: 1500, clearValue: null });
  };

  const tabBtn = (id, label) => html`
    <${Chip} active=${tab === id} onClick=${() => setTab(id)}>${label}<//>
  `;

  const snippetBox = (snippet) => html`
    <div class="relative mt-1">
      <pre class="bg-black/30 border border-aurora-border rounded p-2 text-[11px] font-mono whitespace-pre-wrap text-aurora-text-muted overflow-x-auto">${snippet}</pre>
      <button
        class="absolute top-1.5 right-1.5 text-[10px] px-2 py-0.5 rounded bg-aurora-surface border border-aurora-border text-aurora-text-dim hover:text-aurora-text cursor-pointer"
        onClick=${() => copiar(snippet)}
      >${copiado === snippet ? '✓ copiado' : '⧉ copiar'}</button>
    </div>
  `;

  return html`
    <div class="max-w-4xl mx-auto p-4">
      <h1 class="text-lg font-semibold mb-3">🎨 Style Catalog</h1>

      <div class="flex gap-1.5 mb-4">
        ${tabBtn('components', 'Componentes')}
        ${tabBtn('tokens', 'Tokens')}
        ${tabBtn('patterns', 'Patterns')}
      </div>

      ${tab === 'components' && html`
        <div class="flex gap-4">
          <div class="w-52 shrink-0">
            <${List}>
              ${PRIMITIVES.map(p => html`
                <${ListItem}
                  key=${p.id}
                  icon="📦"
                  name=${p.label}
                  sub=${p.file}
                  onClick=${() => setPrim(p)}
                />
              `)}
            <//>
          </div>
          <div class="flex-1 min-w-0">
            ${prim ? html`
              <h2 class="text-xs uppercase tracking-widest text-aurora-text-dim mb-2">Preview — ${prim.base}</h2>
              <div class="bg-white/5 rounded-lg p-4 mb-4">
                <${Preview} id=${prim.id} />
              </div>
              <h2 class="text-xs uppercase tracking-widest text-aurora-text-dim mb-2">Props / variantes</h2>
              <${ChipGroup}>
                ${prim.variants.map(v => html`<${Chip} key=${v}>${v}<//>`)}
              <//>
              <h2 class="text-xs uppercase tracking-widest text-aurora-text-dim mt-4 mb-1">Snippet</h2>
              ${snippetBox(prim.snippet)}
            ` : html`
              <${Empty} icon="📦" title="Elegí un componente">Variantes, estados y snippet de uso.<//>
            `}
          </div>
        </div>
      `}

      ${tab === 'tokens' && html`
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          ${TOKENS.map(t => html`
            <div key=${t.name} class="bg-white/5 rounded-lg p-2 border border-aurora-border">
              <div
                class="h-10 rounded mb-1.5 border border-aurora-border flex items-center justify-center"
                style=${t.type === 'color' ? `background:var(${t.name})` : 'background:var(--aurora-surface-2)'}
              >
                ${t.type !== 'color' && html`<span class="text-[10px] text-aurora-text-dim">${t.type}</span>`}
              </div>
              <div class="text-[11px] font-mono text-aurora-text">${t.name}</div>
              <div class="text-[10px] font-mono text-aurora-text-dim truncate">${resolveToken(t.name) || '—'}</div>
            </div>
          `)}
        </div>
      `}

      ${tab === 'patterns' && html`
        <div class="flex gap-4">
          <div class="w-52 shrink-0">
            <${List}>
              ${PATTERNS.map(p => html`
                <${ListItem}
                  key=${p.id}
                  icon="🧩"
                  name=${p.label}
                  sub=${p.id}
                  onClick=${() => setPattern(p)}
                />
              `)}
            <//>
          </div>
          <div class="flex-1 min-w-0">
            ${pattern ? html`
              <h2 class="text-xs uppercase tracking-widest text-aurora-text-dim mb-1">${pattern.label}</h2>
              ${snippetBox(pattern.snippet)}
            ` : html`
              <${Empty} icon="🧩" title="Elegí un pattern">Composiciones recomendadas con primitivas.<//>
            `}
          </div>
        </div>
      `}
    </div>
  `;
}
