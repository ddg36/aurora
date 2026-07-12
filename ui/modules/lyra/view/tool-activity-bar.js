import { clearActivity } from '../scripts/chat/actividad.js';

const html = (...args) => globalThis.html(...args);

export function ToolActivityBar({ actividad }) {
  const visibles = actividad.filter(e => e.status === 'running' || e.status === 'ok' || e.status === 'error');
  if (visibles.length === 0) return null;
  return html`
    <div class="tool-activity-bar fx-tool-activity" role="log" aria-label="Actividad de herramientas">
      <div class="tool-activity-head">
        <span class="tool-activity-count">Tools ${visibles.length}</span>
        <button class="act-clear" onClick=${clearActivity} title="Limpiar actividad">✕</button>
      </div>
      <div class="tool-activity-list">
        ${visibles.map(e => html`
          <div key=${e.id}
            class=${'act-entry fx-tool-chip act-' + e.status}
            title=${e.result || ''}
          >
            <span class="act-icon">${e.status === 'running' ? '⟳' : e.status === 'error' ? '✗' : '✓'}</span>
            <span class="act-name">${e.name}</span>
            ${e.preview && html`<span class="act-args">${e.preview}</span>`}
          </div>
        `)}
      </div>
    </div>
  `;
}
