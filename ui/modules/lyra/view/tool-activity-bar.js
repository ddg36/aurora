import { clearActivity } from '../scripts/chat/actividad.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { Button, Icon } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);
const { useState } = globalThis.preactHooks;

function statusLabel(status) {
  return status === 'running' ? 'En curso' : status === 'error' ? 'Falló' : 'Completada';
}

function detailText(entry) {
  return [
    `${entry.name} · ${statusLabel(entry.status)}`,
    entry.input && `Entrada\n${entry.input}`,
    entry.error && `Error\n${entry.error}`,
    !entry.error && entry.result && `Resultado\n${entry.result}`,
  ].filter(Boolean).join('\n\n');
}

export function ToolActivityBar({ actividad }) {
  const [selectedId, setSelectedId] = useState(null);
  const visibles = actividad.filter(e => e.status === 'running' || e.status === 'ok' || e.status === 'error');
  if (visibles.length === 0) return null;
  const selected = visibles.find(e => e.id === selectedId) || null;
  const close = () => setSelectedId(null);
  const clear = () => { close(); clearActivity(); };
  return html`
    <div class=${`tool-activity-bar fx-tool-activity${selected ? ' is-inspecting' : ''}`} role="log" aria-label="Actividad de herramientas">
      <div class="tool-activity-head">
        <span class="tool-activity-count"><${Icon} name="toolkit" size=${13}/> ${visibles.length}</span>
        <button class="act-clear" onClick=${clear} title="Limpiar actividad"><${Icon} name="close" size=${13}/></button>
      </div>
      <div class="tool-activity-list">
        ${visibles.map(e => html`
          <button key=${e.id}
            class=${`act-entry fx-tool-chip act-${e.status}${selectedId === e.id ? ' is-selected' : ''}`}
            data-risk=${e.risk}
            aria-expanded=${selectedId === e.id}
            title=${`Inspeccionar ${e.name}`}
            onClick=${() => setSelectedId(selectedId === e.id ? null : e.id)}
          >
            <span class="act-icon"><${Icon} name=${e.status === 'running' ? 'refresh' : e.status === 'error' ? 'warning' : 'check'} size=${13}/></span>
            <span class="act-name">${e.name}</span>
            ${e.preview && html`<span class="act-args">${e.preview}</span>`}
          </button>
        `)}
      </div>
      ${selected && html`
        <section class="tool-activity-inspector" aria-label=${`Detalle de ${selected.name}`}>
          <header>
            <span class=${`act-icon act-${selected.status}`}><${Icon} name=${selected.status === 'running' ? 'refresh' : selected.status === 'error' ? 'warning' : 'check'} size=${15}/></span>
            <div><strong>${selected.name}</strong><small>${statusLabel(selected.status)}${selected.ms != null ? ` · ${selected.ms} ms` : ''} · ${selected.scope || 'local'}</small></div>
            <${Button} iconOnly icon="copy" title="Copiar detalle" onClick=${() => copiarTexto(detailText(selected))}/>
            <${Button} iconOnly icon="close" title="Cerrar detalle" onClick=${close}/>
          </header>
          ${selected.input && html`<div class="tool-detail-block"><span>Entrada</span><pre>${selected.input}</pre></div>`}
          ${(selected.error || selected.result) && html`
            <div class=${`tool-detail-block ${selected.error ? 'is-error' : 'is-result'}`}>
              <span>${selected.error ? 'Error' : 'Resultado'}</span>
              <pre>${selected.error || selected.result}</pre>
            </div>
          `}
          ${!selected.input && !selected.error && !selected.result && html`<p class="tool-detail-empty">La ejecución aún no ha producido detalles.</p>`}
        </section>
      `}
    </div>
  `;
}
