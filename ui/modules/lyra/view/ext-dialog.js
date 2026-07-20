import { responderDialogo } from '../../../components/shared/lyra-ws.js';
import { Button, Chip, Icon } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);

export function ExtDialog({ dialogo, valor, onValorChange, onClose }) {
  if (!dialogo) return null;
  const responder = (v) => { responderDialogo(v); onClose(); };
  return html`
    <div class="comando-overlay-backdrop" onClick=${() => responder(null)}>
      <div class="comando-overlay-card" onClick=${e => e.stopPropagation()}>
        <div class="comando-overlay-header">
          <span class="inline-flex items-center gap-2"><${Icon} name="puzzle" size=${16}/> ${dialogo.title || 'Extensión'}</span>
          <${Button} icon="close" iconOnly onClick=${() => responder(null)} title="Cancelar (Esc)" />
        </div>
        <div class="comando-overlay-body">
          ${dialogo.method === 'select' && html`
            <div class="comando-overlay-lista">
              ${dialogo.options.map(op => html`
                <div key=${op} class="comando-overlay-item" onClick=${() => responder(op)}>
                  <span class="comando-overlay-preview">${op}</span>
                </div>
              `)}
            </div>
          `}
          ${(dialogo.method === 'input' || dialogo.method === 'editor') && html`
            <textarea
              class="comando-overlay-texto"
              style=${{ width: '100%', minHeight: dialogo.method === 'editor' ? '160px' : '38px',
                        background: 'var(--surface)', border: '1px solid var(--surface3)', borderRadius: '6px',
                        padding: '8px', color: 'var(--text)', font: 'inherit' }}
              placeholder=${dialogo.placeholder}
              value=${valor}
              onInput=${e => onValorChange(e.target.value)}
              autofocus
            />
          `}
        </div>
        ${dialogo.method !== 'select' && html`
          <div class="comando-overlay-footer">
            <${Chip} onClick=${() => responder(null)}>Cancelar<//>
            <${Chip} variant="accent" onClick=${() => responder(valor)}>Confirmar<//>
          </div>
        `}
      </div>
    </div>
  `;
}
