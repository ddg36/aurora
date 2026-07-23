import { HERRAMIENTAS_SISTEMA } from '../scripts/chat/herramientas.js';
import { Chip, ChipGroup, Icon } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);

// Antes vivía en el flujo del documento (bg-opacity-20, contexto del chat
// detrás); flotando como overlay necesita fondo sólido y sombra propia.
const floatingPanelClass = 'shadow-2xl rounded-lg border border-aurora-border bg-aurora-surface max-h-[180px] overflow-y-auto px-2 py-1';
const toolbarHeaderClass = 'toolbar-section-header flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] text-aurora-text-dim cursor-pointer select-none transition hover:bg-aurora-surface hover:text-aurora-text';

export function ToolsToolbar({ FloatingMenu, expandedCategories, onToggleCategory, onChipClick }) {
  return html`
    <${FloatingMenu} class=${'llama-toolbar-panel ' + floatingPanelClass}>
      <div class="toolbar-section mb-1">
        <div class=${toolbarHeaderClass} onClick=${() => onToggleCategory('sistema')}>
          <span class="toolbar-section-title flex-1 font-semibold">Sistema (${HERRAMIENTAS_SISTEMA.length})</span>
          <span class="expand-icon"><${Icon} name=${expandedCategories['sistema'] ? 'chevronDown' : 'chevronRight'} size=${12}/></span>
        </div>
        ${expandedCategories['sistema'] && html`
          <div class="px-1 py-1.5">
            <${ChipGroup}>
              ${HERRAMIENTAS_SISTEMA.map(t => html`
                <${Chip}
                  key=${t.name}
                  title=${t.desc}
                  onClick=${e => onChipClick(t, e.ctrlKey || e.metaKey)}
                >${t.name}<//>
              `)}
            <//>
          </div>
        `}
      </div>
    </div>
  `;
}
