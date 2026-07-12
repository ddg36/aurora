import { exportarChat } from '../scripts/chat/historial.js';
import { exportarChatPDF } from '../scripts/chat/exportar-pdf.js';
import { Chip, AutoFitChips } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);

// Antes vivía DENTRO del flujo del documento (bg-opacity-20 bastaba, el
// chat real detrás daba contexto) — ahora flota como overlay vía
// useFloatingMenu, necesita fondo sólido y sombra propia como cualquier
// dropdown, si no el chat de atrás se transparenta encima y es ilegible.
const floatingPanelClass = 'shadow-2xl rounded-lg border border-aurora-border bg-aurora-surface max-h-[200px] overflow-y-auto';

export function HistoryPanel({ FloatingMenu, chats, chatIdActual, historial, modelo, fmtFecha, onCambiarChat, onEliminarChat }) {
  return html`
    <${FloatingMenu} class=${'llama-history-panel ' + floatingPanelClass}>
      <div class="history-header sticky top-0 flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold bg-aurora-surface-2 border-b border-aurora-border">
        <span>Historial</span>
        <${AutoFitChips} class="history-export">
          <${Chip} onClick=${() => exportarChat(historial, modelo, 'md')}>MD<//>
          <${Chip} onClick=${() => exportarChat(historial, modelo, 'json')}>JSON<//>
          <${Chip} onClick=${() => exportarChatPDF(historial, modelo)}>PDF<//>
        <//>
      </div>
      <div class="history-list p-1">
        ${chats.length === 0 && html`<p class="history-empty p-2 text-center text-[11px] text-aurora-text-muted">Sin chats guardados</p>`}
        ${chats.map(c => html`
          <div key=${c.id}
            class=${'history-item flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] border border-transparent cursor-pointer transition ' + (c.id === chatIdActual ? 'active' : '')}
            style=${c.parent_chat_id ? 'margin-left:14px' : ''}
            onClick=${() => onCambiarChat(c.id)}>
            <div class="hi-info flex-1 overflow-hidden">
              <span class="hi-nombre block overflow-hidden text-ellipsis whitespace-nowrap">${c.parent_chat_id ? '🌿 ' : ''}${c.nombre}</span>
              <span class="hi-meta text-[10px] text-aurora-text-dim">${c.modelo || '—'} · ${fmtFecha(c.updatedAt ?? c.actualizado_en)}</span>
            </div>
            <button class="hi-del px-1 bg-transparent border-0 text-aurora-text-dim cursor-pointer"
              onClick=${e => { e.stopPropagation(); onEliminarChat(c.id); }}>×</button>
          </div>
        `)}
      </div>
    <//>
  `;
}
