const html = (...args) => globalThis.html(...args);

const ICONOS = {
  tree: '🌳', model: '🧠', settings: '⚙️', 'scoped-models': '⭐',
  session: '📊', hotkeys: '⌨️', changelog: '📜', trust: '🔒',
  copy: '📋', export: '📄', share: '🔗', login: '🔑', logout: '🔑',
  reload: '🔄', new: '🌱', name: '🏷️', compact: '🗜️',
  fork: '🌿', clone: '🌿', import: '📥', quit: '🛑',
};

const TITULOS = {
  tree: 'Árbol de sesión', model: 'Modelo', settings: 'Thinking level',
  'scoped-models': 'Favoritos para Alt+M', session: 'Sesión pi',
  hotkeys: 'Atajos de teclado', changelog: 'Historial de versiones',
};

function tituloDe(comando) {
  return TITULOS[comando] || ('/' + comando);
}

// Overlay genérico para el resultado de comandos "/" de pi — nunca es un
// mensaje de chat (ver spec 2026-07-08). Interactivo cuando el backend lo
// marca así (tree/model/settings/scoped-models); el resto es texto + Cerrar.
export function ComandoOverlay({ comando, interactive, data, aplicando, onClose, onAction }) {
  if (!comando) return null;

  const onKeyDown = e => { if (e.key === 'Escape') onClose(); };

  return html`
    <div class="comando-overlay-backdrop" onClick=${onClose} onKeyDown=${onKeyDown} tabIndex="-1">
      <div class="comando-overlay-card" onClick=${e => e.stopPropagation()}>
        <div class="comando-overlay-header">
          <span>${ICONOS[comando] || '⚙️'} ${tituloDe(comando)}</span>
          <button class="comando-overlay-close" onClick=${onClose} title="Cerrar (Esc)">✕</button>
        </div>
        <div class="comando-overlay-body">
          ${aplicando && html`<div class="comando-overlay-aplicando">Aplicando…</div>`}
          ${!aplicando && comando === 'tree' && html`
            <div class="comando-overlay-lista">
              ${data.nodos.map(n => {
                // pi sólo permite ramificar desde mensajes de user (fork real =
                // UserMessageSelectorComponent, agent-session-runtime.js:fork()
                // tira "Invalid entry ID for forking" para cualquier otro rol) —
                // clickear un nodo assistant/tool acá rompía /fork con ese error.
                const puedeRamificar = n.rol === 'user' && !n.actual;
                return html`
                <div
                  key=${n.id}
                  class=${'comando-overlay-item' + (n.actual ? ' comando-overlay-item--actual' : '') + (puedeRamificar ? '' : ' comando-overlay-item--fijo')}
                  style=${{ paddingLeft: (10 + n.profundidad * 16) + 'px' }}
                  onClick=${() => puedeRamificar && onAction('fork', n.id)}
                >
                  <span class="comando-overlay-marca">${n.actual ? '●' : ''}</span>
                  <span class="comando-overlay-rol comando-overlay-rol--${n.rol}">${n.rol}</span>
                  <span class="comando-overlay-preview">${n.preview}</span>
                </div>
              `;
              })}
            </div>
          `}
          ${!aplicando && comando === 'model' && html`
            <div class="comando-overlay-lista">
              ${data.modelos.map(m => html`
                <div
                  key=${m.id}
                  class=${'comando-overlay-item' + (m.id === data.actual ? ' comando-overlay-item--actual' : '')}
                  onClick=${() => m.id !== data.actual && onAction('model', m.id)}
                >
                  <span class="comando-overlay-marca">${m.id === data.actual ? '●' : (m.favorito ? '⭐' : '')}</span>
                  <span class="comando-overlay-preview">${m.id}</span>
                  <span class="comando-overlay-badge">[${m.provider}]</span>
                </div>
              `)}
            </div>
          `}
          ${!aplicando && comando === 'settings' && html`
            <div class="comando-overlay-chips">
              ${data.niveles.map(nivel => html`
                <button
                  key=${nivel}
                  class=${'comando-overlay-chip' + (nivel === data.thinkingActual ? ' comando-overlay-chip--actual' : '')}
                  onClick=${() => onAction('settings', nivel)}
                >${nivel}</button>
              `)}
            </div>
          `}
          ${!aplicando && comando === 'scoped-models' && html`
            <div class="comando-overlay-lista">
              ${data.todos.length === 0 && html`<div class="comando-overlay-vacio">Sin modelos disponibles.</div>`}
              ${data.todos.map(m => {
                const esFav = data.favoritos.includes(m.id);
                return html`
                  <div key=${m.id} class="comando-overlay-item" onClick=${() => onAction('scoped-models', { id: m.id, quitar: esFav })}>
                    <span class="comando-overlay-marca">${esFav ? '⭐' : '☆'}</span>
                    <span class="comando-overlay-preview">${m.id}</span>
                    <span class="comando-overlay-badge">[${m.provider}]</span>
                  </div>
                `;
              })}
            </div>
          `}
          ${!aplicando && !interactive && html`
            <pre class="comando-overlay-texto">${data.texto}</pre>
          `}
        </div>
        ${!interactive && html`
          <div class="comando-overlay-footer">
            <button class="comando-overlay-btn" onClick=${onClose}>Cerrar</button>
          </div>
        `}
      </div>
    </div>
  `;
}
