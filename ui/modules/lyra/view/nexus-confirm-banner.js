import { Chip } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);

export function NexusConfirmBanner({ pendiente, onResolve }) {
  if (!pendiente) return null;
  return html`
    <div class=${'nexus-confirm-banner risk-' + pendiente.bloque.risk_level.toLowerCase()}>
      <div class="nexus-confirm-header">
        <span class="nexus-confirm-risk">${pendiente.bloque.risk_level === 'HIGH' ? '⚠ HIGH' : '⚡ MEDIUM'}</span>
        <span class="nexus-confirm-title">${pendiente.bloque.task_id}</span>
      </div>
      <code class="nexus-confirm-cmd">${pendiente.bloque.payload}</code>
      <p class="nexus-confirm-desc">${pendiente.bloque.description}</p>
      <div class="nexus-confirm-actions">
        <${Chip} variant="yt" onClick=${() => onResolve(false)}>✕ Cancelar<//>
        <${Chip} accentColor="#22c55e" active onClick=${() => onResolve(true)}>✓ Ejecutar<//>
      </div>
    </div>
  `;
}
