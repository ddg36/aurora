import { renderizarContenido } from '../scripts/chat/renderizar.js';
import { copiarMensaje, añadirANotas, leerMensaje } from '../scripts/chat/acciones-rapidas.js';
import { Chip, AutoFitChips, Empty, Icon } from '../../../components/index.js';
import { ToolVisualCard } from '../../../components/shared/cloud-tool-visual.js';

const html = (...args) => globalThis.html(...args);
const { useMemo } = globalThis.preactHooks;

const AI_LABELS = { gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', custom: 'Custom' };

const RoleLabel = ({ role, external, cloudAiId }) => html`
  <span class="inline-flex items-center gap-1.5">
    <${Icon} name=${role === 'user' ? 'user' : external ? 'cloud' : 'bot'} size=${14}/>
    ${role === 'user' ? 'Tú' : external ? (AI_LABELS[cloudAiId] || 'AI externa') : 'Lyria'}
  </span>
`;

const IconoCerebro = ({ vivo }) => html`<${Icon} class=${`thinking-brain-icon ${vivo ? 'is-live' : ''}`} name="brain" size=${14}/>`;

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
        <${Empty} icon="bot" title="Lyria · IA local">
          ${offline ? 'Lyria está desconectada. Inicia el servidor Aurora.' : 'Envía un mensaje para comenzar.'}
        <//>
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
              ><${Icon} name="package" size=${14}/> Compactado desde ${tokenStr} tokens ${expandido ? '· ocultar' : '· mostrar'}</button>
              ${expandido && html`
                <div class="compaction-summary-content"
                  dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg.content) }}
                ></div>
              `}
            </div>
          `;
        }

        const esExterno = msg._via === 'direct-ai' || msg._via === 'duo-external';
        const rolLabel = html`<${RoleLabel} role=${msg.role} external=${esExterno} cloudAiId=${cloudAiId}/>`;

        if (msg.role === 'assistant') {
          const parsed = Array.isArray(msg._piTurn?.blocks)
            ? msg._piTurn.blocks.map(block => block.tipo === 'tool'
              ? { ...block, nombre: block.nombre || block.name }
              : block)
            : combinarPartesRicas(parsearMensajeRico(msg.content));
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
                  ><${Icon} name="pin" size=${14}/></button>
                `}
                <button
                  class="msg-speak-btn"
                  onClick=${() => hablar(msg.content)}
                  title="Releer mensaje"
                ><${Icon} name="volume" size=${14}/></button>
              </div>
              ${msg._toolVisual
                ? html`<${ToolVisualCard} visual=${msg._toolVisual} />`
                : msg._toolDraft
                  ? html`
                      ${msg._toolText && html`
                        <div class="message-content"
                          dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg._toolText) }}
                        ></div>
                      `}
                      <${ToolVisualCard} visual=${msg._toolDraft} />
                    `
                  : parsed.length ? parsed.map((p, i) => {
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
                        <span class="tool-toggle-chevron"><${Icon} name=${abierto ? 'chevronDown' : 'chevronRight'} size=${12}/></span>
                        <span class="tool-execution-icon"><${Icon} name=${p.isError ? 'warning' : 'check'} size=${13}/></span>
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
              ${msg._imagen && html`
                <img src=${msg._imagen} alt="Imagen leída por la tool" class="mt-2 max-w-full max-h-72 rounded-lg border border-white/10 object-contain bg-black/10" />
              `}
              <div class="message-quick-actions mt-2 pt-2 border-t border-aurora-border opacity-50 transition-opacity flex items-center flex-wrap gap-2">
                <${AutoFitChips}>
                  <${Chip} onClick=${() => copiarMensaje(msg.content)} title="Copiar al portapapeles"><${Icon} name="copy" size=${14}/> Copiar<//>
                  <${Chip} onClick=${() => añadirANotas(msg.content)} title="Añadir a notas"><${Icon} name="note" size=${14}/> A notas<//>
                  <${Chip} onClick=${() => reformularRespuesta(regenerarRespuesta, msg)} title="Regenerar respuesta"><${Icon} name="refresh" size=${14}/> Regenerar<//>
                  <${Chip} onClick=${() => leerMensaje(msg.content)} title="Leer mensaje"><${Icon} name="volume" size=${14}/> Leer<//>
                <//>
                ${idx === visibleMessages.length - 1 && tpsTexto && html`
                  <span class="text-[10px] text-aurora-text-muted font-mono whitespace-nowrap" title="tok/s del último turno">${tpsTexto}</span>
                `}
              </div>
            </div>
          `;
        }

        const esExternoFinal = msg._via === 'direct-ai' || msg._via === 'duo-external';
        const rolLabelFinal = html`<${RoleLabel} role=${msg.role} external=${esExternoFinal} cloudAiId=${cloudAiId}/>`;
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
                ><${Icon} name="pin" size=${14}/></button>
              `}
            </div>
            <div class="message-content"
              dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg.content, { externo: esExternoFinal }) }}
            ></div>
            ${msg._timing && html`
              <div class="text-[10px] text-aurora-text-muted font-mono mt-1 opacity-70">
                <${Icon} name="clock" size=${12}/> responde ${(msg._timing.responde / 1000).toFixed(1)}s · genera ${(msg._timing.genera / 1000).toFixed(1)}s
              </div>
            `}
          </div>
        `;
      })}

      ${(streamingVal || asistenteEnVivo.blocks.length > 0) && html`
        <div class="message assistant streaming">
          <div class="message-header">
            <span class="role"><${RoleLabel} role="assistant" /></span>
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
                    <span class="tool-toggle-chevron"><${Icon} name=${abierto ? 'chevronDown' : 'chevronRight'} size=${12}/></span>
                    <span class="tool-execution-icon"><${Icon} name=${b.status === 'running' ? 'refresh' : b.status === 'error' ? 'warning' : 'check'} size=${13}/></span>
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
          <div class="message-header"><span class="role"><${RoleLabel} role="assistant" /></span></div>
          <div class="message-content">
            <span class="typing-indicator"><${IconoCerebro} vivo=${true}/> Pensando…</span>
          </div>
        </div>
      `}
      ${cloudGenerandoVal && html`
        <div class="message assistant loading direct-ai">
          <div class="message-content">
            <span class="typing-indicator inline-flex items-center gap-1.5"><${Icon} name="cloud" size=${14}/> Generando…</span>
          </div>
        </div>
      `}
      </div>
      ${avatar?.position === 'right' && html`<${AvatarSlot} avatar=${avatar} side="right" />`}
    </div>
  `;
}
