import { renderizarContenido } from '../scripts/chat/renderizar.js';
import { copiarMensaje, añadirANotas, leerMensaje } from '../scripts/chat/acciones-rapidas.js';
import { Chip, AutoFitChips } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);
const { useMemo } = globalThis.preactHooks;

const AI_ICONOS = { gemini: '◇', chatgpt: '◉', claude: '✶', perplexity: '⊕', custom: '🌐' };
const AI_LABELS = { gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', custom: 'Custom' };

const IconoCerebro = ({ vivo }) => html`
  <svg class="thinking-brain-icon ${vivo ? 'is-live' : ''}" viewBox="0 0 24 24" width="14" height="14"
    fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path opacity="0.9" d="M9 4.5c-1.7 0-3 1.3-3 3 0 .4.1.8.2 1.1C4.9 9.1 4 10.4 4 12c0 1.4.7 2.6 1.8 3.3-.1.3-.2.7-.2 1.1 0 1.9 1.5 3.4 3.4 3.6.3 1.2 1.4 2 2.6 2s2.3-.8 2.6-2c1.9-.2 3.4-1.7 3.4-3.6 0-.4-.1-.8-.2-1.1 1.1-.7 1.8-1.9 1.8-3.3 0-1.6-.9-2.9-2.2-3.4.1-.3.2-.7.2-1.1 0-1.7-1.3-3-3-3-.7 0-1.3.2-1.8.6C13.1 4.7 12.1 4 11 4c-.7 0-1.4.2-2 .5z"/>
    <path opacity="0.6" d="M12 4v16"/>
    <path class="spark" style="animation-delay:0s" d="M8 8.5c.8.5 1.8.5 2.6 0"/>
    <path class="spark" style="animation-delay:0.3s" d="M13.4 8.5c.8.5 1.8.5 2.6 0"/>
    <path class="spark" style="animation-delay:0.6s" d="M7 12.8c.9.4 2 .3 2.8-.3"/>
  </svg>
`;

// El bloque de texto EN VIVO se re-renderiza en cada token (streamingActual
// es un signal que fuerza un render del componente entero por cada delta,
// aparte del propio setAsistenteEnVivo) — sin memoizar, renderizarContenido()
// (markdown + syntax highlight) se re-ejecutaba sobre TODO el texto
// acumulado en CADA uno de esos renders, aunque el contenido no hubiera
// cambiado desde el render anterior. Costo ~O(n²) con el largo de la
// respuesta — invisible en una PC, tira el framerate a 5fps en un celular
// (bug real reportado en vivo, sólo mientras genera). useMemo sólo
// recalcula si b.contenido cambió de verdad.
const BloqueTextoVivo = ({ contenido }) => {
  const htmlRenderizado = useMemo(() => renderizarContenido(contenido), [contenido]);
  return html`<div class="message-content" dangerouslySetInnerHTML=${{ __html: htmlRenderizado }}></div>`;
};

export function MessageList({
  chatRef, onChatScroll, visibleMessages, streamingVal, offline, cargandoVal, cloudGenerandoVal, thinkingVal,
  asistenteEnVivo, avatar, AvatarSlot, cloudAiId,
  expandedCompaction, setExpandedCompaction,
  expandedThinking, toggleThinking, getThinkingDefault,
  expandedTools, toggleTool, getToolDefault,
  estaFijado, togglePin, hablar, combinarPartesRicas, parsearMensajeRico,
  regenerarRespuesta, tpsTexto,
}) {
  return html`
    <div class="chat-with-avatars" style="display:flex;flex:1;min-height:0;overflow:hidden;">
      ${avatar?.position === 'left' && html`<${AvatarSlot} avatar=${avatar} side="left" />`}
      <div class="chat-container" style="flex:1;min-width:0"
        ref=${chatRef}
        onScroll=${onChatScroll}
      >
      ${visibleMessages.length === 0 && !streamingVal && html`
        <div class="empty-chat">
          <p>⚡ Lyra — Local AI</p>
          <p class="hint">${offline
            ? 'Lyra offline. Inicia el servidor Aurora primero.'
            : 'Envía un mensaje para comenzar'}</p>
        </div>
      `}

      ${visibleMessages.map((msg, idx) => {
        if (msg.role === 'system') return null;

        if (msg.role === 'compaction') {
          const expandido = !!expandedCompaction[idx];
          const tokenStr = (msg.tokensBefore ?? 0).toLocaleString();
          return html`
            <div key=${idx} class="message compaction-summary">
              <button
                class="compaction-summary-toggle"
                onClick=${() => setExpandedCompaction(prev => ({ ...prev, [idx]: !prev[idx] }))}
              >🗜️ Compactado desde ${tokenStr} tokens ${expandido ? '▼' : '▶ (click para expandir)'}</button>
              ${expandido && html`
                <div class="compaction-summary-content"
                  dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg.content) }}
                ></div>
              `}
            </div>
          `;
        }

        const esExterno = msg._via === 'direct-ai' || msg._via === 'duo-external';
        const rolLabel = msg.role === 'user'
          ? '👤 Tú'
          : esExterno
            ? `${AI_ICONOS[cloudAiId] || '☁'} ${AI_LABELS[cloudAiId] || 'AI ext'}`
            : '🦙 Lyra';

        if (msg.role === 'assistant') {
          const parsed = combinarPartesRicas(parsearMensajeRico(msg.content));
          const claseExt = esExterno ? ' direct-ai' : '';
          const claseDuo = msg._via === 'duo-external' ? ' duo-turn' : '';
          return html`
            <div key=${idx} class=${'message assistant' + claseExt + claseDuo}>
              <div class="message-header">
                <span class="role">${rolLabel}</span>
                <span class="time">${new Date(msg.ts || msg.timestamp || Date.now()).toLocaleTimeString()}</span>
                ${msg.id && html`
                  <button
                    class=${'msg-pin-btn' + (estaFijado(msg) ? ' fijado' : '')}
                    onClick=${() => togglePin(msg)}
                    title=${estaFijado(msg) ? 'Desfijar mensaje' : 'Fijar mensaje'}
                  >${estaFijado(msg) ? '📌' : '📍'}</button>
                `}
                <button
                  class="msg-speak-btn"
                  onClick=${() => hablar(msg.content)}
                  title="Releer mensaje"
                >🔊</button>
              </div>
              ${parsed.length ? parsed.map((p, i) => {
                if (p.tipo === 'thinking') {
                  const key = `${idx}_${i}`;
                  const abiertoThinking = expandedThinking[key] ?? getThinkingDefault(key);
                  return html`
                    <div key=${key} class="message-thinking">
                      <${Chip}
                        active=${abiertoThinking}
                        onClick=${() => toggleThinking(key)}
                      ><${IconoCerebro} vivo=${false}/> Thinking<//>
                      ${abiertoThinking && html`
                        <div class="thinking-content-inline"><pre>${p.contenido}</pre></div>
                      `}
                    </div>
                  `;
                }
                if (p.tipo === 'text') {
                  return html`
                    <div key=${idx + '_' + i} class="message-content"
                      dangerouslySetInnerHTML=${{ __html: renderizarContenido(p.contenido) }}
                    ></div>
                  `;
                }
                if (p.tipo === 'tool') {
                  const key = `${idx}_${i}`;
                  const abierto = expandedTools[key] ?? getToolDefault(key);
                  return html`
                    <div key=${key} class=${'message tool-execution ' + (p.isError ? 'tool-error' : 'tool-success')}>
                      <div class="tool-execution-header" onClick=${() => toggleTool(key)}>
                        <span class="tool-toggle-chevron">${abierto ? '▼' : '▶'}</span>
                        <span class="tool-execution-icon">${p.isError ? '✗' : '✓'}</span>
                        <span class="tool-execution-name">${p.nombre}</span>
                        <span class="tool-execution-preview">${String(p.args || '').replace(/\s+/g, ' ').slice(0, 100)}</span>
                      </div>
                      ${abierto && html`
                        <div class="tool-execution-body">
                          <pre class="tool-execution-args">${p.args}</pre>
                          ${p.output != null && html`
                            <div class="tool-execution-output">
                              <pre>${p.output}</pre>
                            </div>
                          `}
                        </div>
                      `}
                    </div>
                  `;
                }
                return null;
              }) : html`
                <div class="message-content"
                  dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg.content) }}
                ></div>
              `}
              <div class="message-quick-actions mt-2 pt-2 border-t border-aurora-border opacity-50 transition-opacity flex items-center flex-wrap gap-2">
                <${AutoFitChips}>
                  <${Chip} onClick=${() => copiarMensaje(msg.content)} title="Copiar al portapapeles">📋 Copiar<//>
                  <${Chip} onClick=${() => añadirANotas(msg.content)} title="Añadir a notas">✎ A notas<//>
                  <${Chip} onClick=${() => reformularRespuesta(regenerarRespuesta, msg)} title="Regenerar respuesta">↻ Regenerar<//>
                  <${Chip} onClick=${() => leerMensaje(msg.content)} title="Leer mensaje">🔊 Leer<//>
                <//>
                ${idx === visibleMessages.length - 1 && tpsTexto && html`
                  <span class="text-[10px] text-aurora-text-muted font-mono whitespace-nowrap" title="tok/s del último turno">${tpsTexto}</span>
                `}
              </div>
            </div>
          `;
        }

        const esExternoFinal = msg._via === 'direct-ai' || msg._via === 'duo-external';
        const rolLabelFinal = msg.role === 'user'
          ? '👤 Tú'
          : esExternoFinal
            ? `${AI_ICONOS[cloudAiId] || '☁'} ${AI_LABELS[cloudAiId] || 'AI ext'}`
            : '🦙 Lyra';
        return html`
          <div key=${idx} class=${'message ' + msg.role + (esExternoFinal ? ' direct-ai' : '') + (msg._via === 'duo-external' ? ' duo-turn' : '')}>
            <div class="message-header">
              <span class="role">${rolLabelFinal}</span>
              <span class="time">${new Date(msg.ts || msg.timestamp || Date.now()).toLocaleTimeString()}</span>
              ${msg.id && html`
                <button
                  class=${'msg-pin-btn' + (estaFijado(msg) ? ' fijado' : '')}
                  onClick=${() => togglePin(msg)}
                  title=${estaFijado(msg) ? 'Desfijar mensaje' : 'Fijar mensaje'}
                >${estaFijado(msg) ? '📌' : '📍'}</button>
              `}
            </div>
            <div class="message-content"
              dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg.content, { externo: esExternoFinal }) }}
            ></div>
            ${msg._timing && html`
              <div class="text-[10px] text-aurora-text-muted font-mono mt-1 opacity-70">
                ⏱ responde ${(msg._timing.responde / 1000).toFixed(1)}s · genera ${(msg._timing.genera / 1000).toFixed(1)}s
              </div>
            `}
          </div>
        `;
      })}

      ${(streamingVal || asistenteEnVivo.blocks.length > 0) && html`
        <div class="message assistant streaming">
          <div class="message-header">
            <span class="role">🦙 Lyra</span>
            <span class="streaming-dot">●</span>
          </div>
          ${asistenteEnVivo.blocks.map((b, i) => {
            if (b.tipo === 'thinking') {
              const abiertoLive = expandedThinking._live ?? getThinkingDefault('_live');
              return html`
                <div key=${'b' + i} class="message-thinking">
                  <${Chip}
                    active=${abiertoLive}
                    onClick=${() => toggleThinking('_live')}
                  ><${IconoCerebro} vivo=${cargandoVal}/> Thinking<//>
                  ${abiertoLive && html`
                    <div class="thinking-content-inline"><pre>${b.contenido}</pre></div>
                  `}
                </div>
              `;
            }
            if (b.tipo === 'text') {
              return html`<${BloqueTextoVivo} key=${'b' + i} contenido=${b.contenido} />`;
            }
            if (b.tipo === 'tool') {
              const abierto = expandedTools[b.id] ?? getToolDefault(b.id);
              return html`
                <div key=${'b' + i} class=${'message tool-execution ' + (b.status === 'error' ? 'tool-error' : b.status === 'running' ? 'tool-running' : 'tool-success')}>
                  <div class="tool-execution-header" onClick=${() => toggleTool(b.id)}>
                    <span class="tool-toggle-chevron">${abierto ? '▼' : '▶'}</span>
                    <span class="tool-execution-icon">${b.status === 'running' ? '⟳' : b.status === 'error' ? '✗' : '✓'}</span>
                    <span class="tool-execution-name">${b.name}</span>
                    <span class="tool-execution-preview">${b.args}</span>
                  </div>
                  ${abierto && html`
                    <div class="tool-execution-body">
                      <pre class="tool-execution-args">${b.argsFull || b.args}</pre>
                      ${b.output && html`
                        <div class="tool-execution-output">
                          <pre>${b.output}</pre>
                        </div>
                      `}
                    </div>
                  `}
                </div>
              `;
            }
            return null;
          })}
          ${cargandoVal && asistenteEnVivo.blocks[asistenteEnVivo.blocks.length - 1]?.tipo === 'text' && html`<span class="typewriter-cursor">▋</span>`}
          ${tpsTexto && html`
            <div class="mt-2 pt-2 border-t border-aurora-border">
              <span class="text-[10px] text-aurora-text-muted font-mono whitespace-nowrap">${tpsTexto}</span>
            </div>
          `}
        </div>
      `}

      ${cargandoVal && !streamingVal && !thinkingVal && !cloudGenerandoVal && html`
        <div class="message assistant loading">
          <div class="message-header"><span class="role">🦙 Lyra</span></div>
          <div class="message-content">
            <span class="typing-indicator"><${IconoCerebro} vivo=${true}/> Pensando…</span>
          </div>
        </div>
      `}
      ${cloudGenerandoVal && html`
        <div class="message assistant loading direct-ai">
          <div class="message-content">
            <span class="typing-indicator">☁ generando…</span>
          </div>
        </div>
      `}
      </div>
      ${avatar?.position === 'right' && html`<${AvatarSlot} avatar=${avatar} side="right" />`}
    </div>
  `;
}
