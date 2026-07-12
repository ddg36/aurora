import { cycleModel } from '../../../components/shared/lyra-ws.js';
import { cargarComandos, iconoComando } from '../scripts/chat/comandos.js';
import { renderizarContenido } from '../scripts/chat/renderizar.js';
import { guardarModelo } from '../scripts/chat/parametros.js';
import { Button, Chip, useFloatingMenu } from '../../../components/index.js';

const html = (...args) => globalThis.html(...args);

const Toast = () => globalThis.Toast || { show() {}, setStatus() {} };

const AI_URLS = {
  gemini:     'https://gemini.google.com',
  claude:     'https://claude.ai',
  chatgpt:    'https://chatgpt.com',
  perplexity: 'https://www.perplexity.ai',
  custom:     '',
};
const AI_LABELS = { gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', custom: 'Custom' };
const AI_ICONOS = { gemini: '◇', chatgpt: '◉', claude: '✶', perplexity: '⊕', custom: '🌐' };

export function Composer({
  cloudVisible, cloudAiLabel, cloudExpanded, cloudHidden, cloudMenu, setCloudMenu,
  closeCloud, toggleCloud, cycleCloudPanel, elegirCloudAi, recargarCloudIframe, cloudUrl,
  duoActivo, toggleDuo,
  lyraOnline, canvasVisibleVal, toggleCanvas, ttsEnabled, toggleAutoVoz,
  widgets, colaMensajes,
  slashSel, setSlashSel, slashCmds, slashIdx, comandosVal, elegirComando,
  mensaje, setMensaje, pendingImageDataUrlVal, previewMd, setPreviewMd,
  handlePaste, handleDrop, offline, lastEscapeTimeRef, dobleEscapeAbreArbol, enviarMensaje,
  plusOpen, setPlusOpen, cargarImagen,
  grabandoVal, transcVal, toggleMic, cargandoVal, detenerGeneracion,
  statsSesion,
}) {
  const slashMenu = useFloatingMenu({ anchor: 'above', matchWidth: true, openControlled: slashSel >= 0 });
  return html`
    <div class="chat-input-area flex flex-col shrink-0 gap-0 w-full min-w-0 bg-black bg-opacity-20 border-t border-aurora-border backdrop-blur">

      <div class="flex items-center gap-1 px-2 pt-1.5 flex-wrap">
        <${Chip}
          active=${cloudVisible}
          class="overflow-hidden px-0"
        >
          <button
            style="background:transparent;border:none;cursor:pointer;padding:0 6px 0 10px;height:100%;color:inherit;font-size:inherit;font-weight:inherit;display:flex;align-items:center;gap:4px"
            onClick=${() => cloudVisible ? closeCloud() : toggleCloud()}
            onContextMenu=${e => { e.preventDefault(); setCloudMenu({ x: e.clientX, y: e.clientY }); }}
            title=${cloudVisible ? 'Clic derecho: opciones · Clic: cerrar' : 'Activar Cloud Backend'}
          >☁ ${cloudVisible ? cloudAiLabel : 'Cloud'}</button>
          ${cloudVisible && html`
            <button
              style="background:transparent;border:none;border-left:1px solid var(--aurora-border);cursor:pointer;padding:0 6px;height:100%;color:inherit;font-size:10px;display:flex;align-items:center"
              onClick=${cycleCloudPanel}
              title=${cloudExpanded ? 'Full → Mini' : cloudHidden ? 'Oculto → Full' : 'Mini → Oculto'}
            >${cloudExpanded ? '∧' : cloudHidden ? '◻' : '∨'}</button>
          `}
        <//>
        <${Chip}
          active=${duoActivo}
          onClick=${toggleDuo}
          title="Modo Duo — Lyra (local) ↔ AI de la nube conversan por turnos"
        >${duoActivo ? '⇆ Duo…' : '⇆ Duo'}<//>
        <span class=${'text-[10px] px-1 ' + (lyraOnline ? 'text-aurora-success' : 'text-aurora-error')} title=${lyraOnline ? 'Lyra online' : 'Lyra offline'}>●</span>

        <span class="flex-1"></span>

        <${Button}
          iconOnly
          active=${canvasVisibleVal}
          onClick=${toggleCanvas}
          title=${canvasVisibleVal ? 'Cerrar Canvas' : 'Canvas — panel de código'}
        >◱<//>
        <${Button}
          iconOnly
          active=${ttsEnabled}
          onClick=${toggleAutoVoz}
          title=${ttsEnabled ? 'Desactivar voz' : 'Activar voz'}
        >${ttsEnabled ? '🔊' : '🔇'}<//>
      </div>

      ${cloudMenu && html`
        <div
          class="composer-plus-menu"
          style=${{ position: 'fixed', top: Math.max(8, cloudMenu.y - 180) + 'px', left: cloudMenu.x + 'px', zIndex: 9999 }}
        >
          ${Object.keys(AI_URLS).filter(id => id !== 'custom').map(id => html`
            <button key=${id} class="composer-plus-item" onClick=${() => elegirCloudAi(id)}>
              <span>${AI_ICONOS[id]}</span><span>${AI_LABELS[id]}</span>
            </button>
          `)}
          <button class="composer-plus-item" onClick=${() => {
            const url = window.prompt('URL custom:', cloudUrl);
            if (url) elegirCloudAi('custom', url);
          }}>
            <span>🌐</span><span>URL custom…</span>
          </button>
          <button class="composer-plus-item" onClick=${() => { recargarCloudIframe(cloudUrl); setCloudMenu(null); }}>
            <span>↺</span><span>Recargar</span>
          </button>
        </div>
        <div class="fixed inset-0" style="z-index:9998" onClick=${() => setCloudMenu(null)}></div>
      `}

      <div class="px-2 pt-1 pb-3 relative" style="z-index:5">
        ${Object.entries(widgets).filter(([, w]) => (w.placement || 'aboveEditor') === 'aboveEditor').map(([key, w]) => html`
          <div key=${'w-' + key} class="composer-widget">
            ${w.lines.map((linea, i) => html`<div key=${i}>${linea}</div>`)}
          </div>
        `)}
        ${(colaMensajes.steering.length > 0 || colaMensajes.followUp.length > 0) && html`
          <div class="queue-chips">
            ${colaMensajes.steering.map((m, i) => html`
              <span key=${'s' + i} class="queue-chip queue-chip--steer" title="Se entrega apenas termine el turno actual">
                🔗 ${String(m).slice(0, 60)}
              </span>
            `)}
            ${colaMensajes.followUp.map((m, i) => html`
              <span key=${'f' + i} class="queue-chip queue-chip--followup" title="Se entrega cuando Lyra termine del todo">
                ⏳ ${String(m).slice(0, 60)}
              </span>
            `)}
          </div>
        `}
        <${slashMenu.FloatingMenu} class="slash-menu">
          ${slashCmds.length === 0 && html`
            <div class="slash-item slash-item--empty">
              ${comandosVal.length ? 'Sin comandos que coincidan' : 'Cargando comandos de pi…'}
            </div>
          `}
          ${slashCmds.map((c, i) => html`
            <div
              key=${c.name}
              class=${'slash-item' + (i === slashIdx ? ' slash-item--sel' : '')}
              onMouseDown=${e => { e.preventDefault(); elegirComando(c); }}
              onMouseEnter=${() => setSlashSel(i)}
            >
              <span class="slash-item-icon">${iconoComando(c.source)}</span>
              <span class="slash-item-name">/${c.name}</span>
              <span class="slash-item-desc">${(c.description || '').split('\n')[0].slice(0, 90)}</span>
            </div>
          `)}
        <//>
        <div ref=${slashMenu.anchorRef} class=${'composer-box' + (mensaje.trim() || pendingImageDataUrlVal ? ' composer-box--expanded' : '')}>

          ${previewMd && mensaje.trim() && html`
            <div class="px-2 py-1.5 mb-1 max-h-40 overflow-y-auto text-sm border-b border-aurora-border/50 prose-chat"
              dangerouslySetInnerHTML=${{ __html: renderizarContenido(mensaje) }} />
          `}

          <textarea
            class="composer-textarea"
            value=${mensaje}
            onInput=${e => {
              const v = e.target.value;
              setMensaje(v);
              if (v.startsWith('/') && !v.includes('\n')) {
                cargarComandos();
                setSlashSel(s => (s < 0 ? 0 : s));
              } else {
                setSlashSel(-1);
              }
            }}
            onKeyDown=${e => {
              if (slashSel >= 0) {
                if (e.key === 'ArrowDown' && slashCmds.length) { e.preventDefault(); setSlashSel((slashIdx + 1) % slashCmds.length); return; }
                if (e.key === 'ArrowUp' && slashCmds.length)   { e.preventDefault(); setSlashSel((slashIdx - 1 + slashCmds.length) % slashCmds.length); return; }
                // Tab completa (como cualquier CLI/terminal) SIN enviar —
                // Enter YA NO completa acá, cae al branch de abajo que
                // manda el comando tal cual está escrito. Antes Enter
                // hacía elegirComando() (sólo completa texto + cierra el
                // dropdown con setSlashSel(-1)) — el SIGUIENTE Enter real
                // ya no entraba a este bloque (slashSel quedó en -1) y
                // cadía al enviarMensaje() genérico: el comando SÍ se
                // ejecutaba bien (el backend lo reconoce igual), pero con
                // el "flash" de burbuja de chat normal en el medio — se
                // sentía como que "seguía tratándose como mensaje".
                if (e.key === 'Tab' && slashCmds.length) { e.preventDefault(); elegirComando(slashCmds[slashIdx]); return; }
                if (e.key === 'Escape') { setSlashSel(-1); return; }
              }
              if (e.key === 'Escape' && !mensaje.trim()) {
                // pi real: doble-ESC (<500ms entre pulsaciones) con el
                // editor vacío abre el árbol de sesión.
                const ahora = Date.now();
                if (ahora - lastEscapeTimeRef.current < 500) {
                  lastEscapeTimeRef.current = 0;
                  dobleEscapeAbreArbol();
                } else {
                  lastEscapeTimeRef.current = ahora;
                }
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                setSlashSel(-1);
                enviarMensaje();
                return;
              }
              if (e.altKey && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                cycleModel().then(m => {
                  if (m) {
                    guardarModelo(m.id);
                    Toast().show(`🔁 Modelo: ${m.provider}/${m.id}`, 'info');
                  } else {
                    Toast().show('No hay más modelos para ciclar', 'info');
                  }
                });
              }
            }}
            onPaste=${handlePaste}
            onDrop=${handleDrop}
            onDragOver=${e => e.preventDefault()}
            placeholder=${offline ? 'Lyra offline…' : 'Pregunta lo que quieras'}
            rows="1"
          />

          <div class="composer-actions">
            <div class="relative">
              <${Button}
                iconOnly
                title="Más opciones"
                onClick=${e => {
                  if (!plusOpen) {
                    const r = e.currentTarget.getBoundingClientRect();
                    setPlusOpen({ x: r.left, y: r.top });
                  } else {
                    setPlusOpen(null);
                  }
                }}
              >+<//>
            </div>
            <${Button}
              iconOnly
              active=${previewMd}
              title="Vista previa Markdown"
              onClick=${() => setPreviewMd(p => !p)}
            >👁<//>
            <${Button}
              iconOnly
              active=${slashSel >= 0}
              title="Comandos pi (/)"
              onClick=${() => {
                if (slashSel >= 0) { setSlashSel(-1); return; }
                cargarComandos();
                if (!mensaje.startsWith('/')) setMensaje('/');
                setSlashSel(0);
                document.querySelector('.composer-textarea')?.focus();
              }}
            >/<//>
            ${plusOpen && html`
              <div
                class="composer-plus-menu"
                style=${{ position: 'fixed', bottom: (window.innerHeight - plusOpen.y + 8) + 'px', left: plusOpen.x + 'px', zIndex: 9999 }}
              >
                <label class="composer-plus-item" onClick=${() => setPlusOpen(null)}>
                  <span>📎</span><span>Adjuntar archivo</span>
                  <input type="file" accept=".pdf,image/*,.txt,.md,.csv,.json" style="display:none"
                    onChange=${e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.type.startsWith('image/')) {
                        cargarImagen(file);
                      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                        Toast().show('📄 PDF recibido — próximamente extracción de texto', 'info', 3000);
                      } else {
                        const reader = new FileReader();
                        reader.onload = ev => {
                          const texto = ev.target.result;
                          setMensaje(`\`\`\`\n${texto.slice(0, 3000)}${texto.length > 3000 ? '\n…(truncado)' : ''}\n\`\`\`\n`);
                          Toast().show(`📄 ${file.name} cargado`, 'success');
                        };
                        reader.readAsText(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button class="composer-plus-item" onClick=${() => { Toast().show('📍 Mapear DOM requiere la extensión de browser (FASE extensions)', 'warning', 2500); setPlusOpen(null); }}>
                  <span>📍</span><span>Mapear DOM</span>
                </button>
              </div>
              <div class="fixed inset-0" style="z-index:9998" onClick=${() => setPlusOpen(null)}></div>
            `}

            <div class="flex-1"></div>

            <${Button}
              iconOnly
              active=${grabandoVal}
              onClick=${toggleMic}
              title=${transcVal ? 'Transcribiendo…' : (grabandoVal ? 'Soltar para transcribir' : 'Dictar')}
            >${transcVal ? '…' : (grabandoVal ? '⏹' : '🎤')}<//>

            ${cargandoVal
              ? html`<${Button} iconOnly shape="circle" variant="danger" onClick=${detenerGeneracion} title="Detener">■<//>`
              : html`<${Button}
                  iconOnly
                  shape="circle"
                  variant="primary"
                  onClick=${() => enviarMensaje()}
                  disabled=${(!mensaje.trim() && !pendingImageDataUrlVal) || offline}
                >↑<//>`
            }
          </div>
        </div>
      </div>
      ${statsSesion && html`
        <div class="px-2 pb-1 text-[10px] text-aurora-text-muted font-mono whitespace-nowrap" title="Tokens de esta sesión">${statsSesion}</div>
      `}
    </div>
  `;
}
