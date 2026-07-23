const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { PRIMITIVES, TOKENS, PATTERNS, resolveToken } from '../scripts/catalogo.js';
import {
  Button, Toolbar, ToolbarSpacer,
  Panel, PanelHeader, PanelBody, PanelFooter, PanelLabel, PanelValue,
  List, ListItem, Empty, Chip, ChipGroup, Input, Textarea, Select,
  ChatMessage, ChatList, Icon, ToolPage, ToolHeader, ToolSection,
} from '../../../components/index.js?v=v1-surface-convergence-1';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { mostrarTemporal } from '../../../components/shared/flash.js';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

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
          <${ChatMessage} role="user" time="10:30">Hola Lyra<//>
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

  useEffect(() => registerAIView({
    id: 'stylecatalog',
    description: 'Catálogo de componentes, tokens y patrones permitidos por el sistema visual.',
    actions: {
      status: { description: 'Resume sección y selección visual.', readOnly: true, run: () => ({ tab, primitive: prim?.id || null, pattern: pattern?.id || null }) },
      list_components: { description: 'Lista primitivas reutilizables y su archivo.', readOnly: true, run: () => PRIMITIVES.map(({ id, label, file, snippet }) => ({ id, label, file, snippet })) },
      list_tokens: { description: 'Lista tokens del sistema visual.', readOnly: true, run: () => TOKENS },
      list_patterns: { description: 'Lista patrones de composición.', readOnly: true, run: () => PATTERNS },
      select_section: { description: 'Abre una sección del catálogo.', input: { section: { type: 'string', enum: ['components', 'tokens', 'patterns'], required: true } }, run: ({ section }) => { setTab(section); return { section }; } },
    },
  }), [tab, prim, pattern]);

  const tabBtn = (id, label) => html`
    <${Chip} active=${tab === id} onClick=${() => setTab(id)}>${label}<//>
  `;

  const snippetBox = (snippet) => html`
    <div class="relative mt-1">
      <pre class="bg-black/30 border border-aurora-border rounded p-2 text-[11px] font-mono whitespace-pre-wrap text-aurora-text-muted overflow-x-auto">${snippet}</pre>
      <${Button} icon=${copiado === snippet ? 'check' : 'copy'} size="sm" class="absolute top-1.5 right-1.5" onClick=${() => copiar(snippet)}>${copiado === snippet ? 'Copiado' : 'Copiar'}<//>
    </div>
  `;

  return html`
    <${ToolPage} wide>
      <${ToolHeader} icon="grid" eyebrow="Sistema visual" title="Style Catalog" description="Primitivas, tokens y patrones que Aurora sí permite reutilizar." />
      <div class="flex gap-1.5">
        ${tabBtn('components', 'Componentes')}
        ${tabBtn('tokens', 'Tokens')}
        ${tabBtn('patterns', 'Patterns')}
      </div>

      ${tab === 'components' && html`
        <div class="tool-module-grid stylecatalog-grid">
          <div>
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
          <${ToolSection} class="min-w-0">
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
          <//>
        </div>
      `}

      ${tab === 'tokens' && html`
        <div class="tool-choice-grid">
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
        <div class="tool-module-grid stylecatalog-grid">
          <div>
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
          <${ToolSection} class="min-w-0">
            ${pattern ? html`
              <h2 class="text-xs uppercase tracking-widest text-aurora-text-dim mb-1">${pattern.label}</h2>
              ${snippetBox(pattern.snippet)}
            ` : html`
              <${Empty} icon="🧩" title="Elegí un pattern">Composiciones recomendadas con primitivas.<//>
            `}
          <//>
        </div>
      `}
    <//>
  `;
}
