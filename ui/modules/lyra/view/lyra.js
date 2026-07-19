const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef, useCallback } = globalThis.preactHooks;

import {
  historial, streamingActual, thinkingActual, cargando, cloudGenerando,
  cargarMensajes, guardarMensaje, agregarMensajeLocal, agregarMensajeRico, limpiarHistorial,
  limpiarStream, borrarMensaje, parsearMensajeRico, combinarPartesRicas,
} from '../scripts/chat/mensajes.js';
import { enviarACloud, recuperarCloudPendiente } from '../scripts/chat/cloud.js';
import { detenerCloud, invalidarCloudRelay } from '../../../components/shared/cloud-ask.js';
import { crearDuoLyraCloud } from '../scripts/chat/duo.js';
import { urlRestaurada } from '../../../components/shared/llm-sesiones.js';
import { chats, chatActualId, cargarChats, crearChat, eliminarChat, autoGuardar, fmtFecha, exportarChat } from '../scripts/chat/historial.js';
import { modeloSeleccionado, cargarModelo, guardarModelo } from '../scripts/chat/parametros.js';
import { instruccion, cargarInstruccion } from '../scripts/chat/instrucciones.js';
import { pendingImages, setPendingImage, removePendingImage, clearPendingImage, MAX_PENDING_IMAGES } from '../scripts/chat/vision.js';
import {
  grabando, transcribiendo, autoVoz, vozSeleccionada, voces,
  cargarVoces, setVoz, toggleAutoVoz, iniciarGrabacion, detenerGrabacion, hablar, detenerVoz,
} from '../scripts/voz/voz.js';
import { canvasDoc, canvasVisible, toggleCanvas, canvasWrite, handleHubAction, cargarCanvas } from '../scripts/canvas/canvas.js';
import {
  renderizarContenido, scrollAlFondo, estaCercaDelFondo, inicializarEventosCodigo,
} from '../scripts/chat/renderizar.js';
import { toolActivity, trackStart, trackEnd, clearActivity } from '../scripts/chat/actividad.js';
import { copiarMensaje, añadirANotas, reformularRespuesta, leerMensaje } from '../scripts/chat/acciones-rapidas.js';
import { exportarChatPDF } from '../scripts/chat/exportar-pdf.js';
import { comandosPi, cargarComandos, filtrarComandos, iconoComando } from '../scripts/chat/comandos.js';
import { HERRAMIENTAS_SISTEMA, promptParaHerramienta } from '../scripts/chat/herramientas.js';
import { sendToLyra, fetchModels, connectLyra, cancelarMensaje, enviarSteer, onWidgetUpdate, onSessionInfo as subscribeSessionInfo, refreshPiStatus, cycleModel, linkSession } from '../../../components/shared/lyra-ws.js';
import { CanvasPanel } from '../../../components/lyra.views/canvas.js';
import { nexusOnline } from '../../../store.js';
import { getJSON, postJSON, patchJSON } from '../../../components/shared/api.js';
import { ToolVisualCard } from '../../../components/shared/cloud-tool-visual.js';
import { ParamsPanel } from './params-panel.js';
import { ComandoOverlay } from './comando-overlay.js';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';
import { usePersistedState } from '../../../components/shared/persisted-state.js';
import {
  createPiTurnState, reducePiTurn, piTurnText, piResultText,
} from '../scripts/chat/pi-turn-reducer.js';

const Toast = () => globalThis.Toast || { show() {}, setStatus() {} };

// Mismo formato que formatTokens() de pi real (footer.js) — 1.2k / 45k / 3.4M.
function formatTokens(n) {
  if (n == null) return '0';
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1000000) return Math.round(n / 1000) + 'k';
  if (n < 10000000) return (n / 1000000).toFixed(1) + 'M';
  return Math.round(n / 1000000) + 'M';
}

const AI_URLS = {
  gemini:     'https://gemini.google.com',
  claude:     'https://claude.ai',
  chatgpt:    'https://chatgpt.com',
  perplexity: 'https://www.perplexity.ai',
  custom:     '',
};
const AI_LABELS = { gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', custom: 'Custom' };
const AI_ICONOS = { gemini: '◇', chatgpt: '◉', claude: '✶', perplexity: '⊕', custom: '🌐' };
// Favicon real del proveedor en vez de un glifo fijo. El favicon.ico directo
// del dominio no es confiable (probado: ChatGPT 403, Gemini 404, Grok 200
// pero text/html de error) — el servicio de Google resuelve esto igual para
// cualquier sitio, sin depender de CORS/hosting de cada proveedor.
function iconoUrlPara(aiId) {
  const url = AI_URLS[aiId];
  if (!url) return null;
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; }
  catch { return null; }
}

// SVG monocromo, mismo lenguaje visual que NavBar/Footer (nav-tabs.js,
// footer/registry.js): viewBox 14x14, stroke currentColor — nunca glifos
// Unicode (▾/◻/∧ se veían inconsistentes, y el ◻ se confundía con un botón
// de Stop). Ciclo mini→oculto→expandido: cada ícono representa la ACCIÓN
// (qué va a pasar al clickear), no el estado actual.
const ICON_OCULTAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7c1.3-2.3 3.2-3.5 5-3.5s3.7 1.2 5 3.5c-1.3 2.3-3.2 3.5-5 3.5S3.3 9.3 2 7z"/><circle cx="7" cy="7" r="1.6"/><line x1="2" y1="12" x2="12" y2="2"/></svg>';
const ICON_MOSTRAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7c1.3-2.3 3.2-3.5 5-3.5s3.7 1.2 5 3.5c-1.3 2.3-3.2 3.5-5 3.5S3.3 9.3 2 7z"/><circle cx="7" cy="7" r="1.6"/></svg>';
const ICON_COLAPSAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,5 7,9 11,5"/></svg>';
const ICON_EXPANDIR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,5 1.5,1.5 5,1.5"/><polyline points="9,1.5 12.5,1.5 12.5,5"/><polyline points="12.5,9 12.5,12.5 9,12.5"/><polyline points="5,12.5 1.5,12.5 1.5,9"/></svg>';
// Mover el panel a cabecera (arriba del chat) o de vuelta al pie (entre el
// chat y el composer, default). Doble flecha vertical = "cambiar de lado".
const ICON_A_CABECERA = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 7,2 11,6"/><line x1="7" y1="2" x2="7" y2="9"/><line x1="2.5" y1="12" x2="11.5" y2="12"/></svg>';
const ICON_AL_PIE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,8 7,12 11,8"/><line x1="7" y1="12" x2="7" y2="5"/><line x1="2.5" y1="2" x2="11.5" y2="2"/></svg>';

// Fila de acciones del composer: usaba +, /, 🎤, ■, ↑ y el emoji 👁 mezclados
// con texto plano — inconsistente con el resto de la interfaz (NavBar/Footer,
// SVG monocromo viewBox 14x14). Mismo lenguaje visual para toda la fila.
const ICON_MAS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>';
const ICON_COMANDO = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,2 2,7 5,12"/><polyline points="9,2 12,7 9,12"/></svg>';
const ICON_MIC = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="1.5" width="4" height="7" rx="2"/><path d="M3 7.5a4 4 0 008 0"/><line x1="7" y1="11.5" x2="7" y2="13"/><line x1="4.5" y1="13" x2="9.5" y2="13"/></svg>';
const ICON_MIC_STOP = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/></svg>';
const ICON_ENVIAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="12" x2="7" y2="2"/><polyline points="3,6 7,2 11,6"/></svg>';
const ICON_DETENER = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/></svg>';
// Botón toggle Cloud: ☁ emoji fijo + label 'Cloud' cuando está apagado —
// una vez conectado a un proveedor debe mostrar SU favicon (ver
// iconoUrlPara), pero desactivado no hay proveedor que mostrar; una nube
// SVG monocromo mantiene el mismo lenguaje visual sin el emoji.
const ICON_NUBE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 10.5h6a2.3 2.3 0 000-4.6 3.3 3.3 0 00-6.3-1 2.6 2.6 0 00-1.7 4.7"/></svg>';

// Barra superior: ☰/⚙/🔧/＋ — mismo problema, mismo tratamiento.
const ICON_HISTORIAL = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="12" y2="4"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10" x2="12" y2="10"/></svg>';
const ICON_PARAMETROS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2"/><path d="M7 1.5v1.7M7 10.8v1.7M12.5 7h-1.7M3.2 7H1.5M10.6 3.4l-1.2 1.2M4.6 9.4L3.4 10.6M10.6 10.6L9.4 9.4M4.6 4.6L3.4 3.4"/></svg>';
const ICON_HERRAMIENTAS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.8 2.2a2.6 2.6 0 00-3.4 3.1L2 8.7l1.3 1.3 3.4-3.4a2.6 2.6 0 003.1-3.4l-1.5 1.5-1.4-.4-.4-1.4z"/></svg>';
const ICON_NUEVO_CHAT = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>';

// Header y acciones de cada mensaje: 📋/✎/↻/🔊/📌/📍/🔇 — mismo problema,
// mismo tratamiento (SVG monocromo 14x14).
const ICON_COPIAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="4.5" width="7" height="8" rx="1"/><path d="M2.5 9.5v-6a1 1 0 011-1h5"/></svg>';
const ICON_NOTA = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l3 3v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M9 2v3h3"/></svg>';
const ICON_REGENERAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7a4.5 4.5 0 018-2.7M11.5 7a4.5 4.5 0 01-8 2.7"/><polyline points="10,1.5 10.5,4.3 7.7,4"/><polyline points="4,12.5 3.5,9.7 6.3,10"/></svg>';
const ICON_HABLAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h2.3L7.5 3v8L4.3 8.5H2z"/><path d="M9.5 5a3 3 0 010 4M11 3.5a5 5 0 010 7"/></svg>';
const ICON_MUDO = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h2.3L7.5 3v8L4.3 8.5H2z"/><line x1="9.5" y1="4.5" x2="12.5" y2="9.5"/><line x1="12.5" y1="4.5" x2="9.5" y2="9.5"/></svg>';
const ICON_FIJAR = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h4l-.5 4.5L11 8H3l2.5-1.5z"/><line x1="7" y1="8" x2="7" y2="12.5"/></svg>';
const ICON_FIJADO = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h4l-.5 4.5L11 8H3l2.5-1.5z"/><line x1="7" y1="8" x2="7" y2="12.5"/></svg>';
// Roles de mensaje: 👤 Tú / 🦙 Lyra — mismo problema, mismo tratamiento.
// ICON_USUARIO reusa el mismo path que footer/registry.js (SVG_USUARIO) para
// no inventar un segundo símbolo de "persona" en la app.
const ICON_USUARIO = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="4.2" r="2.4"/><path d="M2 12.5c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>';
const ICON_LYRA = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="none"><path d="M8 1L3 8h3.2L5.5 13l5.5-8H7.8L9 1H8z"/></svg>';
const rolTu = () => html`<span dangerouslySetInnerHTML=${{ __html: ICON_USUARIO }}></span> Tú`;
const rolLyra = () => html`<span dangerouslySetInnerHTML=${{ __html: ICON_LYRA }}></span> Lyra`;

// Label de mensajes de proveedor externo (rolLabel/rolLabelFinal): mostraba
// un glifo fijo (◇/◉/✶/⊕) igual que el header/selector del panel — mismo
// favicon real acá, con su propio fallback local (el mensaje puede persistir
// mucho después de que cambiaste de proveedor activo).
function RolProveedor({ aiId, label }) {
  const [fallo, setFallo] = useState(false);
  const src = iconoUrlPara(aiId);
  return html`
    ${src && !fallo
      ? html`<img class="cloud-provider-favicon-inline" src=${src} alt="" onError=${() => setFallo(true)} />`
      : html`<span>${AI_ICONOS[aiId] || '☁'}</span>`}
    ${label}
  `;
}

function AvatarSlot({ avatar, side }) {
  if (!avatar) return null;
  const mood = avatar.mood ?? 'neutral';
  const src  = avatar.images?.[mood] ?? avatar.images?.neutral ?? null;
  if (!src) return null;
  const flip = side === 'right';
  return html`
    <div
      class=${'avatar-slot avatar-slot--' + side}
      style="width:100px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:center;position:relative;overflow:hidden;"
    >
      <img src=${src} alt="avatar" style=${'width:100%;height:auto;max-height:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 0 12px var(--aurora-accent));transition:opacity 0.3s ease;' + (flip ? 'transform:scaleX(-1);' : '')} />
    </div>
  `;
}

function AvatarCenter({ avatar }) {
  if (!avatar) return null;
  const mood = avatar.mood ?? 'neutral';
  const src  = avatar.images?.[mood] ?? avatar.images?.neutral ?? null;
  if (!src) return null;
  return html`
    <div style="flex-shrink:0;height:50%;min-height:120px;max-height:320px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;position:relative;">
      <img src=${src} alt="avatar" style="max-height:100%;max-width:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 0 18px var(--aurora-accent));transition:opacity 0.3s ease;" />
    </div>
  `;
}

function useSig(sig) {
  const [val, setVal] = useState(sig.value);
  useEffect(() => sig.subscribe(v => setVal(Array.isArray(v) ? [...v] : v)), []);
  return val;
}

export function Local({ active = true } = {}) {
  const [mensaje, setMensaje]              = useState('');
  const [previewMd, setPreviewMd]          = useState(false);
  const [slashSel, setSlashSel]            = useState(-1);
  const comandosVal                        = useSig(comandosPi);
  const slashCmds  = slashSel >= 0 ? filtrarComandos(comandosVal, mensaje) : [];
  const slashIdx   = slashCmds.length ? Math.min(slashSel, slashCmds.length - 1) : -1;
  const elegirComando = (cmd) => {
    if (!cmd) return;
    setMensaje('/' + cmd.name + ' ');
    setSlashSel(-1);
    document.querySelector('.composer-textarea')?.focus();
  };
  const historialVal                       = useSig(historial);
  const streamingVal                       = useSig(streamingActual);
  const thinkingVal                        = useSig(thinkingActual);
  const cargandoVal                        = useSig(cargando);
  const cloudGenerandoVal                  = useSig(cloudGenerando);
  const chatsVal                           = useSig(chats);
  const chatIdVal                          = useSig(chatActualId);
  const modeloVal                          = useSig(modeloSeleccionado);
  const instruccionVal                     = useSig(instruccion);
  const pendingImagesVal                  = useSig(pendingImages);
  const grabandoVal                        = useSig(grabando);
  const transcVal                          = useSig(transcribiendo);
  const ttsEnabled                         = useSig(autoVoz);
  const vocesVal                           = useSig(voces);
  const vozVal                             = useSig(vozSeleccionada);
  const toolActivityVal                    = useSig(toolActivity);
  const lyraOnline                       = useSig(nexusOnline);
  const canvasCodeVal                      = useSig(canvasDoc);
  const canvasVisibleVal                   = useSig(canvasVisible);

  const [modelosDisp, setModelosDisp]               = useState([]);
  const [mostrarParametros, setMostrarParametros]   = useState(false);
  const [mostrarHistorial, setMostrarHistorial]     = useState(false);
  const [mostrarToolbar, setMostrarToolbar]         = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedThinking, setExpandedThinking]     = useState({});
  const [expandedTools, setExpandedTools]           = useState({});
  const toggleTool = (key) => setExpandedTools(prev => ({ ...prev, [key]: !prev[key] }));
  const [fijados, setFijados]                        = useState({});
  const [canvasLang, setCanvasLang]                 = useState('text');
  const [canvasTab, setCanvasTab]                   = useState('codigo');
  const [cloudVisible, setCloudVisible]             = usePersistedState('lyra_cloud_visible', false);
  // Antes useState: Aurora recordaba que el panel estaba activo (cloudVisible,
  // sí persistido) pero olvidaba en qué modo — mini/oculto/expandido volvía
  // siempre a mini al recargar, sin importar cómo lo había dejado el usuario.
  const [cloudExpanded, setCloudExpanded]           = usePersistedState('lyra_cloud_expanded', false);
  const [cloudHidden, setCloudHidden]               = usePersistedState('lyra_cloud_hidden', false);
  // Posición del panel — independiente del modo (mini/oculto/expandido):
  // 'bottom' (default, entre el chat y el composer) o 'top' (cabecera, antes
  // de la barra de historial/params/tools).
  const [cloudPosition, setCloudPosition]           = usePersistedState('lyra_cloud_position', 'bottom');
  // Favicon del proveedor (iconoUrlPara) puede fallar por red/CORS del
  // servicio externo — no persistido, solo evita reintentar en este montaje.
  const [faviconFallo, setFaviconFallo]             = useState({});
  // Altura custom del panel cloud (px). Persistida en la DB (/db/ajustes) vía
  // usePersistedState — NO localStorage — y sincronizada entre superficies por
  // el bus /eventos. Durante el drag se aplica imperativo (sin persistir) para
  // no escribir a la DB en cada frame; se guarda UNA sola vez al soltar.
  const [cloudHeight, setCloudHeight] = usePersistedState('lyra_cloud_height', null);
  const iniciarResizeCloud = useCallback((e) => {
    e.preventDefault();
    const panel = document.querySelector('.cloud-panel');
    const enCabecera = panel?.classList.contains('cloud-panel-top');
    const startY = e.clientY;
    const startH = panel?.getBoundingClientRect().height || 420;
    let finalH = startH;
    const handle = e.currentTarget;
    // Sin pointer capture, si el cursor se desliza rápido fuera del handle
    // (hacia el iframe/shield del panel, pegado al borde donde vive el
    // handle) el navegador puede dejar de despachar pointermove a este
    // listener — el resize solo "agarraba" en un sentido según qué lado
    // tuviera el iframe debajo. setPointerCapture ata los eventos al handle
    // pase lo que pase bajo el cursor durante el drag.
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    const onMove = (ev) => {
      // Abajo (default): el panel crece "hacia arriba" (borde inferior fijo,
      // pegado al composer) — arrastrar hacia arriba agranda.
      // Cabecera: el panel crece "hacia abajo" (borde superior fijo, pegado
      // al techo) — arrastrar hacia abajo agranda. Signo invertido.
      const delta = enCabecera ? (ev.clientY - startY) : (startY - ev.clientY);
      finalH = Math.max(140, Math.min(window.innerHeight * 0.9, startH + delta));
      if (panel) panel.style.height = finalH + 'px';   // imperativo: liso y sin tocar la DB
    };
    const onUp = (ev) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
      setCloudHeight(Math.round(finalH));   // persistir a DB una sola vez
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }, [setCloudHeight]);
  // El proveedor Cloud es una preferencia, no estado efímero de la vista.
  // Antes cada hard reload volvía silenciosamente a Gemini aunque el usuario
  // estuviera trabajando con ChatGPT.
  const [cloudUrl, setCloudUrl]                     = usePersistedState('lyra_cloud_url', AI_URLS.gemini);
  const [cloudAiId, setCloudAiId]                   = usePersistedState('lyra_cloud_ai', 'gemini');
  // Título real del hilo activo en el proveedor (document.title del sitio,
  // ej. "Saludos informales") — reportado por relay-core.js en cada cambio
  // de conversación. Se muestra al lado de "ChatGPT" en la cabecera del panel
  // para que el usuario sepa en qué sesión concreta está parado.
  const [cloudTitulo, setCloudTitulo]               = useState('');
  // conv_id (cloud_conversaciones) del hilo activo del proveedor — resuelto
  // por URL al detectar cambio de conversación. Los mensajes _via:direct-ai/
  // pi-tool con OTRO _convId se ocultan del render (no se borran de DB ni del
  // historial local): evita mezclar la memoria de un hilo de ChatGPT con la
  // de otro cuando el usuario cambia de conversación en el sidebar del sitio.
  // undefined = todavía no se resolvió el hilo activo (no filtrar nada
  // todavía); null = resuelto, hilo SIN memoria propia (ocultar todo lo
  // cloud); número = conv_id real del hilo con memoria.
  const [cloudConvIdActivo, setCloudConvIdActivo]   = useState(undefined);
  // Hidrata desde DB (cloud_mensajes) los turnos cloud de un hilo que YA
  // tiene memoria pero cuyo historial en memoria está vacío para ese convId
  // — el caso típico: recargar Aurora borra el signal `historial` (efímero),
  // pero cloud_mensajes sí persiste. Sin esto, la respuesta de un hilo con
  // memoria real desaparecía tras cada reload, aunque el iframe (ChatGPT
  // nativo) siguiera mostrándola normalmente.
  const [cloudHistorialPropio, setCloudHistorialPropio] = useState([]);
  // En extensión el iframe del LLM se monta a nivel de extensión (login OK),
  // no inline. Reactivo: el caps de la extensión llega async (HELLO).
  const [usaExtPane, setUsaExtPane]                 = useState(() => (globalThis.__aurora_extContext?.value?.caps || []).includes('llmPanes'));
  useEffect(() => {
    const sig = globalThis.__aurora_extContext;
    const upd = () => setUsaExtPane((sig?.value?.caps || []).includes('llmPanes'));
    upd();
    return sig ? sig.subscribe(upd) : undefined;
  }, []);

  // El proceso Pi es compartido: al cambiar/restaurar chat hay que pedir el
  // estado de ESA sesión, no mostrar la que casualmente quedó activa antes.
  useEffect(() => {
    if (chatIdVal != null) refreshPiStatus(chatIdVal).catch(() => {});
  }, [chatIdVal]);

  useEffect(() => registerAIView({
    id: 'canvas',
    description: 'Canvas visual de Lyra para mostrar, editar y previsualizar código o texto.',
    actions: {
      status: {
        description: 'Devuelve visibilidad, lenguaje, pestaña y tamaño del documento.',
        readOnly: true,
        run: () => ({
          visible: !!canvasVisible.value,
          lang: canvasLang,
          tab: canvasTab,
          chars: String(canvasDoc.value || '').length,
        }),
      },
      open: {
        description: 'Abre Canvas; opcionalmente establece contenido, lenguaje y pestaña.',
        input: {
          code: { type: 'string', required: false },
          lang: { type: 'string', required: false },
          tab: { type: 'string', enum: ['codigo', 'preview'], required: false },
        },
        run: ({ code, lang, tab } = {}) => {
          if (code != null) canvasWrite(String(code));
          if (lang) setCanvasLang(String(lang));
          if (tab === 'codigo' || tab === 'preview') setCanvasTab(tab);
          canvasVisible.value = true;
          return { visible: true, chars: String(code ?? canvasDoc.value ?? '').length };
        },
      },
      write: {
        description: 'Reemplaza el contenido de Canvas y lo abre por defecto.',
        input: {
          code: { type: 'string', required: true, maxLength: 200000 },
          lang: { type: 'string', required: false },
          open: { type: 'boolean', required: false },
        },
        run: ({ code, lang, open = true } = {}) => {
          const value = String(code ?? '');
          if (value.length > 200000) throw new Error('code excede 200000 caracteres');
          canvasWrite(value);
          if (lang) setCanvasLang(String(lang));
          if (open) canvasVisible.value = true;
          return { visible: !!canvasVisible.value, chars: value.length, lang: lang || canvasLang };
        },
      },
      close: {
        description: 'Oculta Canvas sin borrar su contenido.',
        run: () => { canvasVisible.value = false; return { visible: false }; },
      },
    },
  }), [canvasLang, canvasTab]);
  const [duoActivo, setDuoActivo]                   = useState(false);
  const duoRef                                      = useRef(null);
  const [cloudMenu, setCloudMenu]                   = useState(null);
  const [plusOpen, setPlusOpen]                     = useState(null);
  const [pendingFiles, setPendingFiles]             = useState([]);
  const [cloudStatus, setCloudStatus]               = useState({ fase: 'idle', ts: Date.now() });
  const [nexusPendiente, setNexusPendiente]         = useState(null);
  const [avatar, setAvatar]                         = useState(null);
  const [asistenteEnVivo, setAsistenteEnVivo]       = useState({ blocks: [] });
  const [colaMensajes, setColaMensajes]             = useState({ steering: [], followUp: [] });
  const [widgets, setWidgets]                       = useState({});
  const [comandoOverlay, setComandoOverlay]         = useState(null); // {comando, interactive, data, aplicando}
  const [sessionStats, setSessionStats]             = useState(null); // get_session_stats — estilo footer.js de pi
  const [piInfo, setPiInfo]                         = useState(null);
  const [ultimoTps, setUltimoTps]                   = useState(null); // tok/s del último turno — no existe en pi, agregado propio
  const [forgeTools, setForgeTools]                 = useState([]);
  const assistantMessageRef                          = useRef(asistenteEnVivo);

  const chatRef   = useRef(null);
  const [enFondo, setEnFondo]   = useState(true);
  const [lightbox, setLightbox] = useState(null);   // imagen expandida (click en thumbnail)
  const iframeRef = useRef(null);
  const cloudRecoveryRef = useRef(false);
  const ultimaEscrituraRef = useRef(0);

  const cloudAiLabel = AI_LABELS[cloudAiId] || cloudAiId || 'Cloud';
  const offline = !lyraOnline;
  const CLOUD_FASES = {
    idle: ['idle', 'En espera'], ready: ['ready', 'Conectado'], ask_received: ['working', 'Preparando'],
    ask_queued: ['queued', 'En cola'], ask_dequeued: ['working', 'Retomando'], composer_ready: ['working', 'Composer listo'],
    attachments_start: ['uploading', 'Subiendo adjunto'], attachments_ready: ['working', 'Adjunto listo'],
    submitted: ['thinking', 'Pensando'], answer: [cloudStatus.ok === false ? 'error' : 'ready', cloudStatus.ok === false ? 'Sin respuesta' : 'Listo'],
    stop: ['warning', 'Cancelando'], resetting: ['warning', 'Reconectando'],
  };
  const [cloudStatusTone, cloudStatusLabel] = CLOUD_FASES[cloudStatus.fase] || ['idle', cloudStatus.fase || 'En espera'];
  const cloudStatusTiming = cloudStatus.fase === 'answer' && cloudStatus.generaMs != null
    ? `${(cloudStatus.generaMs / 1000).toFixed(1)}s`
    : cloudStatus.queue ? `${cloudStatus.queue} pendiente${cloudStatus.queue === 1 ? '' : 's'}` : '';
  // Frases rotativas mientras la nube trabaja (el indicador ya tiene 3 dots).
  const FRASES_TRABAJO = ['Pensando', 'Trabajando', 'Procesando', 'Razonando', 'Analizando', 'Buscando', 'Conectando ideas', 'Casi ahí'];
  const [fraseIdx, setFraseIdx] = useState(0);
  useEffect(() => {
    if (!cloudGenerandoVal) { setFraseIdx(0); return; }
    const id = setInterval(() => setFraseIdx(i => i + 1), 2000);
    return () => clearInterval(id);
  }, [cloudGenerandoVal]);
  // El indicador SOLO se muestra mientras genera → siempre rotar frases (no el
  // status crudo tipo "Conectado"). El label estático queda para otros usos.
  const cloudStatusDisplay = cloudGenerandoVal
    ? FRASES_TRABAJO[fraseIdx % FRASES_TRABAJO.length]
    : cloudStatusLabel;

  useEffect(() => {
    cargarInstruccion();
    cargarModelo();
    cargarVoces();
    cargarCanvas();
    cargarChats().then(() => {
      if (!chatActualId.value && chats.value.length > 0) {
        chatActualId.value = chats.value[0].id;
      }
    });
    fetchModels().then(ms => setModelosDisp(ms || [])).catch(() => {});
    const refreshForge = () => getJSON('/tools')
      .then(r => setForgeTools((r.tools || []).filter(t => (t.tags || []).includes('forge'))))
      .catch(() => {});
    refreshForge();
    window.addEventListener('aurora:forge-changed', refreshForge);
    connectLyra().catch(() => {});
    onWidgetUpdate(setWidgets);
    const unsubscribePiInfo = subscribeSessionInfo(setPiInfo);
    getJSON('/db/ajustes/avatar').then(d => {
      if (d?.valor) try { setAvatar(JSON.parse(d.valor)); } catch {}
    }).catch(() => {});

    const onCanvasEvent = async e => {
      const { code, path, lang, tab } = e.detail || {};
      let value = code;
      if (value == null && path) {
        try {
          const r = await postJSON('/artifacts/read', { path });
          if (!r?.ok || r?.is_error) throw new Error(r?.output || r?.error || 'No se pudo leer el artefacto');
          value = r.output || '';
        } catch (err) {
          Toast().show(`No se pudo abrir ${path}: ${err?.message || err}`, 'error');
          return;
        }
      }
      canvasWrite(value || '');
      if (lang) setCanvasLang(lang);
      setCanvasTab(tab === 'preview' ? 'preview' : 'codigo');
      canvasVisible.value = true;
    };
    document.addEventListener('lyra:canvas', onCanvasEvent);
    return () => {
      document.removeEventListener('lyra:canvas', onCanvasEvent);
      window.removeEventListener('aurora:forge-changed', refreshForge);
      unsubscribePiInfo();
    };
  }, []);

  useEffect(() => {
    const onCloudStatus = e => setCloudStatus(e.detail || { fase: 'idle', ts: Date.now() });
    window.addEventListener('aurora:cloud-status', onCloudStatus);
    return () => window.removeEventListener('aurora:cloud-status', onCloudStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cloudRecoveryRef.current) return;
      cloudRecoveryRef.current = true;
      try {
        const r = await recuperarCloudPendiente({ iframe: iframeRef.current });
        if (cancelled || !r?.resumed) return;
        setCloudVisible(true);
        if (r.aiId) setCloudAiId(r.aiId);
        if (r.url) setCloudUrl(r.url);
        Toast().show('↻ Turno Cloud retomado', 'info', 2500);
      } catch (err) {
        console.warn('[Lyra] no se pudo recuperar turno Cloud:', err);
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (chatIdVal) cargarMensajes(chatIdVal);
    setEnFondo(true);   // chat nuevo: arranca siguiendo el final, como el primer load
  }, [chatIdVal]);

  useEffect(() => {
    // Antes: mientras había streaming (enVuelo) se forzaba scrollAlFondo en
    // CADA chunk sin mirar si el usuario había subido a leer — "secuestraba"
    // el scroll. Ahora solo sigue el fondo si el usuario YA estaba ahí
    // (enFondo real, actualizado por onChatScroll); si subió, se queda quieto.
    if (enFondo) scrollAlFondo(chatRef.current);
    inicializarEventosCodigo(chatRef.current, {
      onNotas: añadirANotas,
      onRun: code => {
        setMensaje(`Ejecutá este comando con run_bash y mostrame el output:\n\`\`\`bash\n${code}\n\`\`\``);
      },
    });
  }, [historialVal, streamingVal, cargandoVal, thinkingVal]);

  const enviarMensaje = useCallback(async (textoDirecto) => {
    const opciones = textoDirecto && typeof textoDirecto === 'object' ? textoDirecto : {};
    let texto = (typeof textoDirecto === 'string' ? textoDirecto : opciones.message ?? mensaje).trim();
    const imagenesDataUrl = opciones.skipUserAppend
      ? []
      : (pendingImages.value || []).map(item => item?.dataUrl).filter(Boolean);
    if (!texto && !imagenesDataUrl.length && !(cloudVisible && pendingFiles.length)) return;
    if (!texto && cloudVisible && (imagenesDataUrl.length || pendingFiles.length)) texto = 'Analiza los archivos adjuntos.';

    // Cloud activo: el mensaje va al LLM de la nube (iframe), NO a pi.
    // Comandos "/" siguen siendo de Lyra. Respuesta marcada _via:'direct-ai',
    // memoria propia en cloud_mensajes — la sesión de pi ni se entera.
    if (cloudVisible && !texto.startsWith('/') && !opciones.skipUserAppend) {
      // Guard de concurrencia: un solo turno de nube a la vez. Dos enviarACloud
      // en paralelo compiten por el mismo iframe (inyección + captura) → caos.
      if (cloudGenerando.value) { Toast().show('⏳ Esperá a que la nube termine', 'warning', 2000); return; }
      setMensaje('');
      // Reusa el adjunto de imagen de Lyra: la nube lo recibe como data URL y
      // el relay lo pega al composer del LLM (drag&drop) antes de enviar.
      const imgs = imagenesDataUrl.length ? imagenesDataUrl : undefined;
      if (imagenesDataUrl.length) clearPendingImage();
      const files = pendingFiles.length ? pendingFiles : undefined;
      setPendingFiles([]);
      await enviarACloud({ iframe: iframeRef.current, texto, aiId: cloudAiId, url: cloudUrl, images: imgs, files });
      return;
    }

    // Steering: Lyra ya está respondiendo — Enter no bloquea, encola el
    // mensaje y pi lo entrega apenas termine el turno de tool-calls actual.
    if (cargando.value) {
      if (texto.startsWith('/')) return; // comandos mid-stream: fuera de alcance por ahora
      if (!opciones.skipUserAppend) {
        agregarMensajeRico({ role: 'user', content: texto, _imagenes: imagenesDataUrl.length ? imagenesDataUrl : undefined });
        clearPendingImage();
      }
      setMensaje('');
      enviarSteer(texto, chatActualId.value, imagenesDataUrl);
      return;
    }
    setMensaje('');

    if (!opciones.skipUserAppend) {
      agregarMensajeRico({ role: 'user', content: texto, _imagenes: imagenesDataUrl.length ? imagenesDataUrl : undefined });
      clearPendingImage();
    }

    if (!chatActualId.value) {
      const chat = await crearChat(texto.substring(0, 38) || 'Chat sin nombre');
      if (chat) chatActualId.value = chat.id;
    }

    cargando.value = true;
    limpiarStream();
    const msg0 = { blocks: [] };
    assistantMessageRef.current = msg0;
    setAsistenteEnVivo(msg0);
    let respuesta = '';
    let thinking  = '';
    const trackIds = {};
    let piTurn = createPiTurnState();
    let piTurnContext = null;
    let piSessionSnapshot = null;

    // Agrega texto/thinking al último bloque si es del mismo tipo (acumula
    // la generación real en curso); si no, abre un bloque nuevo — igual que
    // el message.content de pi: array cronológico único, nunca 4 baldes sueltos.
    const agregarTexto = (tipo, delta) => {
      const blocks = assistantMessageRef.current.blocks;
      const ultimo = blocks[blocks.length - 1];
      const nuevos = ultimo && ultimo.tipo === tipo
        ? [...blocks.slice(0, -1), { ...ultimo, contenido: ultimo.contenido + delta }]
        : [...blocks, { tipo, contenido: delta }];
      assistantMessageRef.current = { blocks: nuevos };
      setAsistenteEnVivo(assistantMessageRef.current);
    };

    try {
      await sendToLyra({
        message: texto,
        images:  imagenesDataUrl,
        model:   modeloSeleccionado.value,
        system:  instruccion.value,
        chat_id: chatActualId.value,
        retry: opciones.retry || null,
        onPiEvent: (event, envelope) => {
          piTurn = reducePiTurn(piTurn, envelope);
          assistantMessageRef.current = { blocks: piTurn.blocks };
          setAsistenteEnVivo(assistantMessageRef.current);
          respuesta = piTurnText(piTurn, 'text');
          thinking = piTurnText(piTurn, 'thinking');
          streamingActual.value = respuesta;
          thinkingActual.value = thinking;

          // Actividad secundaria de Aurora, correlacionada por el ID oficial
          // de Pi. Nunca por nombre: dos `read` paralelos son independientes.
          if (event.type === 'tool_execution_start' && event.toolCallId) {
            trackIds[event.toolCallId] = trackStart(event.toolName, event.args, { toolCallId: event.toolCallId });
          } else if (event.type === 'tool_execution_end' && event.toolCallId) {
            const output = piResultText(event.result);
            trackEnd(trackIds[event.toolCallId], event.isError ? 'error' : 'ok', output.slice(0, 200));
          }
        },
        onToken: token => {
          respuesta += token;
          streamingActual.value = respuesta;
          agregarTexto('text', token);
        },
        onThinking: t => {
          thinking += t;
          thinkingActual.value = thinking;
          agregarTexto('thinking', t);
        },
        onToolCall: (name, args, risk) => {
          trackIds[name] = trackStart(name, args, { risk });
          const argsStr = JSON.stringify(args || {}, null, 2);
          const toolCallId = Date.now() + '_' + Math.random().toString(36).slice(2, 9);
          const argsPreview = argsStr.length > 120 ? argsStr.replace(/\s+/g, ' ').slice(0, 120) + '…' : argsStr;
          assistantMessageRef.current = {
            blocks: [...assistantMessageRef.current.blocks,
              { tipo: 'tool', id: toolCallId, name, args: argsPreview, argsFull: argsStr, output: null, isError: false, status: 'running' }],
          };
          setAsistenteEnVivo(assistantMessageRef.current);
        },
        onToolResult: (name, output) => {
          const isErr = /^Error/i.test(String(output || ''));
          trackEnd(trackIds[name], isErr ? 'error' : 'ok', String(output ?? '').slice(0, 200));
          // Sin truncar: la caja de salida ya scrollea sola (max-height +
          // overflow-y), no hace falta cortar el texto para que quepa.
          const out = String(output ?? '').trim();
          const blocks = assistantMessageRef.current.blocks;
          let idx = -1;
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].tipo === 'tool' && blocks[i].name === name && blocks[i].status === 'running') { idx = i; break; }
          }
          if (idx >= 0) {
            const actualizado = { ...blocks[idx], output: out, isError: isErr, status: isErr ? 'error' : 'success' };
            assistantMessageRef.current = { blocks: [...blocks.slice(0, idx), actualizado, ...blocks.slice(idx + 1)] };
            setAsistenteEnVivo(assistantMessageRef.current);
          }
        },
        onToolProgress: (name, partial) => {
          // tool progress - could be used to show partial results
        },
        onMessageStart: role => {
          // message start - could be used to show message status
        },
        onMessageEnd: (role, stopReason, usage, tokensPerSec) => {
          // tok/s no es algo que pi muestre en su propia UI (footer.js no
          // trackea timing) — es un agregado propio de Aurora, calculado
          // igual acá con lo que ya manda pi (usage.output + tiempo medido
          // del lado del bridge).
          if (role === 'assistant' && tokensPerSec != null) setUltimoTps(tokensPerSec);
        },
        onAgentStart: () => {
          // agent start - could be used to show working indicator
        },
        onAgentEnd: () => {
          // agent end - could be used to hide working indicator
        },
        onQueueUpdate: (steering, followUp) => {
          setColaMensajes({ steering, followUp });
        },
        onSessionInfo: (sessionId, sessionName) => {
          // session info - could be used to update session display
        },
        onThinkingLevel: level => {
          // thinking level - could be used to show thinking level
        },
        onCompactionStart: reason => {
          Toast().setStatus('🗜️ Compactando contexto…');
        },
        onCompactionEnd: (reason, info) => {
          Toast().setStatus('');
          // Antes esto sólo apagaba el status, sin decir qué pasó — un
          // auto-compact (reason='auto') que fallara desaparecía en
          // silencio total, igual bug que /compact pero para el disparo
          // automático.
          if (info?.error) {
            Toast().show(`✗ Compactación falló: ${info.error}`, 'error', 4000);
          } else if (info?.aborted) {
            Toast().show('Compactación cancelada', 'info');
          } else if (info?.tokensBefore != null) {
            Toast().show(`🗜️ Compactado: ${info.tokensBefore}→${info.tokensAfter} tokens`, 'success', 3000);
          }
        },
        onSessionStats: stats => setSessionStats(stats),
        onTurnContext: context => { piTurnContext = context; },
        onSessionSnapshot: snapshot => { piSessionSnapshot = snapshot; },
        onCommandResult: async (comandoNombre, interactive, data) => {
          const esNuevaSesion = (comandoNombre === 'fork' || comandoNombre === 'clone' || comandoNombre === 'import') && data.sessionPath;
          if (esNuevaSesion) {
            const nombreNuevo = comandoNombre === 'fork' ? '🌿 Rama'
              : comandoNombre === 'clone' ? '🌿 Clon' : '📥 Importado';
            const chat = await crearChat(nombreNuevo);
            if (chat) {
              if (data.parentChatId != null) {
                try { await patchJSON(`/db/chats/${chat.id}`, { parent_chat_id: data.parentChatId }); } catch {}
              }
              linkSession(chat.id);
              await cargarChats();
              chatActualId.value = chat.id;
              Toast().show(data.texto || 'Nueva sesión creada', 'success');
            }
            setComandoOverlay(null);
            return;
          }
          setComandoOverlay(prev => {
            // Confirmación de una acción disparada DESDE este mismo overlay
            // (elegir modelo o nivel de thinking) — cierra en vez de mostrar
            // una segunda pantalla de "listo". /scoped-models en cambio
            // siempre refresca la lista (se puede seguir marcando favoritos).
            if (prev?.aplicando && (comandoNombre === 'model' || comandoNombre === 'settings')) {
              Toast().show(data.texto || 'Listo', 'success');
              return null;
            }
            return { comando: comandoNombre, interactive, data };
          });
        },
        onHubAction: (name, args, respond) => {
          handleHubAction(name, args, respond);
        },
        onConfirmRequest: (name, command, risk, confirm) => {
          setNexusPendiente({
            bloque: {
              task_id: name,
              payload: command,
              risk_level: String(risk || 'MEDIUM').toUpperCase(),
              description: `Lyra quiere ejecutar ${name}`,
            },
            confirm,
          });
        },
      });
      streamingActual.value = '';
      if (!opciones.skipUserSave) await guardarMensaje(chatActualId.value, 'user', texto);
      if (assistantMessageRef.current.blocks.length) {
        const serializarBloques = blocks => {
          const partes = [];
          for (const b of blocks) {
            if (b.tipo === 'thinking') partes.push(`[thinking]\n${b.contenido}\n[/thinking]`);
            else if (b.tipo === 'text') partes.push(b.contenido);
            else if (b.tipo === 'tool') {
              const tid = b.id || '';
              const call = `[tool_call:${b.name}${tid ? ':' + tid : ''}]\n${b.argsFull || b.args}\n[/tool_call:${b.name}${tid ? ':' + tid : ''}]`;
              partes.push(call);
              if (b.output == null) continue;
              const abre = b.isError ? `[tool_result:${b.name}${tid ? ':' + tid : ''}:error]` : `[tool_result:${b.name}${tid ? ':' + tid : ''}]`;
              partes.push(`${abre}\n${b.output}\n[/tool_result:${b.name}${tid ? ':' + tid : ''}]`);
            }
          }
          return partes.filter(Boolean).join('\n\n');
        };
        const esPiNativo = piTurn.lastSeq > 0;
        const estructura = esPiNativo ? {
          protocolVersion: 1,
          runtime: 'pi-rpc',
          parentEntryId: piTurnContext?.parentEntryId ?? null,
          userEntryId: piSessionSnapshot?.lastUserEntryId ?? null,
          sessionId: piSessionSnapshot?.sessionId || piTurnContext?.sessionId || '',
          sessionPath: piSessionSnapshot?.sessionPath || piTurnContext?.sessionPath || '',
          leafId: piSessionSnapshot?.leafId || null,
          blocks: assistantMessageRef.current.blocks,
        } : null;
        // En v1 la estructura es la fuente visual y `contenido` queda limpio
        // para FTS, voz y exportación. Los tags sólo sobreviven como fallback
        // cuando Aurora se conecta temporalmente a un backend Pi legacy.
        const contenidoFinal = esPiNativo
          ? (piTurnText(piTurn, 'text').trim() || respuesta.trim())
          : serializarBloques(assistantMessageRef.current.blocks);
        agregarMensajeRico({ role: 'assistant', content: contenidoFinal, thinking: thinking || null, _piTurn: estructura });
        await guardarMensaje(chatActualId.value, 'assistant', contenidoFinal, estructura);
      }
      await autoGuardar(historial.value, modeloSeleccionado.value);
      if (autoVoz.value && respuesta) {
        detenerVoz();
        hablar(respuesta);
      }
    } catch (e) {
      streamingActual.value = '';
      agregarMensajeLocal('assistant', `Error: ${e.message}`);
    } finally {
      cargando.value = false;
      setNexusPendiente(null);
      assistantMessageRef.current = { blocks: [] };
      setAsistenteEnVivo({ blocks: [] });
      setColaMensajes({ steering: [], followUp: [] });
    }
  }, [mensaje, cloudVisible, cloudAiId, cloudUrl, pendingFiles]);

  const regenerarRespuesta = useCallback(async (msg) => {
    if (!msg || cargando.value) return;
    const idx = historial.value.findIndex(m => (msg.id && m.id === msg.id) || m === msg);
    if (idx < 0) return;
    let userIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (historial.value[i].role === 'user') {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0) {
      Toast().setStatus('⚠ No encontré el mensaje anterior del usuario');
      return;
    }
    if (!msg._piTurn?.userEntryId) {
      Toast().show('Este mensaje es legacy; regeneralo desde una sesión Pi nueva o usá /fork.', 'warning', 3500);
      return;
    }
    const userMsg = historial.value[userIdx];
    const eliminados = historial.value.slice(idx);
    historial.value = historial.value.slice(0, idx);
    for (const item of eliminados) {
      if (item.id) await borrarMensaje(item.id);
    }
    await enviarMensaje({
      message: userMsg.content,
      retry: { userEntryId: msg._piTurn.userEntryId },
      skipUserAppend: true,
      skipUserSave: true,
    });
  }, [enviarMensaje]);

  const detenerGeneracion = useCallback(() => {
    // Cloud generando: cortar la nube (cancela captura + clickea su stop).
    if (cloudGenerando.value) { detenerCloud(iframeRef.current); cloudGenerando.value = false; cargando.value = false; return; }
    cancelarMensaje();
    if (streamingActual.value) {
      agregarMensajeLocal('assistant', streamingActual.value);
      streamingActual.value = '';
    }
    assistantMessageRef.current = { blocks: [] };
    setAsistenteEnVivo({ blocks: [] });
      setColaMensajes({ steering: [], followUp: [] });
    cargando.value = false;
  }, []);

  const toggleMic = useCallback(async () => {
    if (grabando.value) {
      try {
        const texto = await detenerGrabacion();
        if (texto) {
          if (autoVoz.value) enviarMensaje(texto);
          else setMensaje(prev => (prev ? prev + ' ' : '') + texto);
        }
      } catch (e) {
        Toast().show(`⚠ Error de voz: ${e.message}`, 'error');
      }
    } else {
      try {
        await iniciarGrabacion();
      } catch {
        Toast().show('⚠ Micrófono no disponible o sin permiso', 'error');
      }
    }
  }, [enviarMensaje]);

  const nuevoChat = useCallback(async () => {
    cancelarMensaje();
    assistantMessageRef.current = { blocks: [] };
    setAsistenteEnVivo({ blocks: [] });
      setColaMensajes({ steering: [], followUp: [] });
    limpiarHistorial();
    chatActualId.value = null;
    const chat = await crearChat('Chat sin nombre');
    if (chat) chatActualId.value = chat.id;
  }, []);

  const cambiarChat = useCallback(id => {
    if (id) chatActualId.value = id;
  }, []);

  // Clicks dentro del modal de comandos — mandan el slash-command equivalente
  // en silencio (mismo pipeline que escribirlo a mano, sin ensuciar el chat).
  const manejarAccionOverlay = useCallback((accion, valor) => {
    setComandoOverlay(prev => prev && ({ ...prev, aplicando: true }));
    let texto;
    if (accion === 'fork') texto = `/fork ${valor}`;
    else if (accion === 'model') texto = `/model ${valor}`;
    else if (accion === 'settings') texto = `/settings ${valor}`;
    else if (accion === 'scoped-models') texto = `/scoped-models ${valor.quitar ? 'remove' : 'add'} ${valor.id}`;
    if (texto) enviarMensaje({ message: texto, skipUserAppend: true, skipUserSave: true });
  }, [enviarMensaje]);

  const cargarImagen = useCallback((blob) => {
    const MAX_BYTES = 5 * 1024 * 1024;
    if (blob.size > MAX_BYTES) {
      Toast().show('⚠ Imagen demasiado grande (máx 5 MB)', 'error');
      return;
    }
    if ((pendingImages.value || []).length >= MAX_PENDING_IMAGES) {
      Toast().show(`⚠ Máximo ${MAX_PENDING_IMAGES} imágenes por mensaje`, 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const agregada = setPendingImage(blob, ev.target.result);
      const cantidad = (pendingImages.value || []).length;
      if (agregada) Toast().show(`◉ Imagen ${cantidad}/${MAX_PENDING_IMAGES} lista para enviar`, 'success');
      else Toast().show(`⚠ Máximo ${MAX_PENDING_IMAGES} imágenes por mensaje`, 'warning');
    };
    reader.readAsDataURL(blob);
  }, []);

  const cargarArchivoCloud = useCallback((file) => {
    const MAX_BYTES = 8 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      Toast().show('⚠ Archivo demasiado grande (máx 8 MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      setPendingFiles(prev => [...prev, {
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: ev.target.result,
      }]);
      Toast().show(`📎 ${file.name} listo para Cloud`, 'success');
    };
    // Data URL conserva PDFs y otros binarios sin corrupción UTF-8.
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(e => {
    const items = [...(e.clipboardData?.items || [])];
    const imagenes = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (!imagenes.length) return;
    e.preventDefault();
    imagenes.forEach(cargarImagen);
  }, [cargarImagen]);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;

    files.filter(file => file.type.startsWith('image/')).forEach(cargarImagen);
    const otros = files.filter(file => !file.type.startsWith('image/'));
    if (cloudVisible) {
      otros.forEach(cargarArchivoCloud);
    } else if (otros[0]) {
      const archivo = otros[0];
      const reader = new FileReader();
      reader.onload = ev => {
        const t = ev.target.result;
        setMensaje(prev => `${prev}${prev ? '\n' : ''}\`\`\`\n${t.slice(0, 4000)}${t.length > 4000 ? '\n…(truncado)' : ''}\n\`\`\`\n`);
        Toast().show(`📄 ${archivo.name} cargado`, 'success');
      };
      reader.readAsText(archivo);
    }
  }, [cargarImagen, cloudVisible, cargarArchivoCloud]);

  const recargarCloudIframe = useCallback((url) => {
    const target = url || cloudUrl;
    const iframe = iframeRef.current;
    invalidarCloudRelay(iframe);
    if (!target) return;
    if (!iframe) {
      window.parent.postMessage({ type: 'AURORA_LLM_RELOAD', id: 'cloud', url: target }, '*');
      return;
    }
    iframe.src = 'about:blank';
    setTimeout(() => { iframe.src = target; }, 50);
  }, [cloudUrl]);

  // relay-core.js vigila getConversationKey() y avisa CUALQUIER cambio de
  // hilo (click manual del usuario en el sidebar del proveedor, o un hilo
  // muerto/borrado que el sitio redirige a home en silencio sin error
  // visible). Sin esto, cloudUrl y el título mostrado quedaban desincronizados
  // del hilo real que el usuario está viendo en el iframe.
  useEffect(() => {
    const onNavChanged = e => {
      const url = e.detail?.url;
      if (!url || e.detail?.paneId !== 'cloud') return;
      const eraHiloEspecifico = /\/c\//.test(cloudUrl || '');
      const esAhoraHome = !/\/c\//.test(url);
      setCloudUrl(prev => (url === prev ? prev : url));
      setCloudTitulo(e.detail?.titulo || '');
      if (eraHiloEspecifico && esAhoraHome) {
        Toast().show('☁️ El hilo guardado ya no existe, se restauró el chat activo.', 'info', 3000);
      }
      // Resuelve si ESTE hilo ya tiene memoria propia guardada (conv_id) —
      // sin esto no hay forma de saber a qué mensajes _via:direct-ai/pi-tool
      // corresponde este hilo específico vs. otro que el usuario visitó antes.
      getJSON(`/db/llm/cloud/conversaciones/by-url?url=${encodeURIComponent(url)}`)
        .then(r => {
          setCloudConvIdActivo(r?.id ?? null);
          setCloudHistorialPropio(Array.isArray(r?.mensajes) ? r.mensajes : []);
        })
        .catch(() => { setCloudConvIdActivo(null); setCloudHistorialPropio([]); });
    };
    window.addEventListener('aurora:cloud-nav-changed', onNavChanged);
    return () => window.removeEventListener('aurora:cloud-nav-changed', onNavChanged);
  }, [cloudUrl]);

  // Autoritativo: cloud.js conoce el convId real que está usando AHORA para
  // el turno en curso — evita la carrera donde by-url resuelve "sin memoria"
  // (null) antes de que el turno cree la conversación, lo que ocultaría la
  // propia respuesta recién generada (el filtro de _visiblesTodos la trataría
  // como de "otro hilo").
  useEffect(() => {
    const onConvResolved = e => {
      const { url, convId } = e.detail || {};
      if (!url || convId == null || url !== cloudUrl) return;
      setCloudConvIdActivo(convId);
    };
    window.addEventListener('aurora:cloud-conv-resolved', onConvResolved);
    return () => window.removeEventListener('aurora:cloud-conv-resolved', onConvResolved);
  }, [cloudUrl]);

  // "Reconocer sesiones": desde el Centro de notificaciones (tab Cloud
  // history, que ya lista cloud_conversaciones) el usuario puede abrir
  // directamente una conversación pasada — navega el iframe a esa URL,
  // el vigía de relay-core.js la detecta como cambio de hilo (mismo camino
  // que un cambio manual en el sidebar del proveedor) y el resto de la
  // cadena ya construida (convId, hidratación) hace el resto solo.
  useEffect(() => {
    const onOpenUrl = e => {
      const { url, aiId } = e.detail || {};
      if (!url) return;
      if (aiId) setCloudAiId(aiId);
      setCloudUrl(url);
      setCloudVisible(true);
      setCloudExpanded(false);
      setCloudHidden(false);
      setTimeout(() => recargarCloudIframe(url), 80);
    };
    window.addEventListener('aurora:cloud-open-url', onOpenUrl);
    return () => window.removeEventListener('aurora:cloud-open-url', onOpenUrl);
  }, [recargarCloudIframe]);

  const toggleCloud = useCallback(() => {
    setCloudVisible(v => {
      const abriendo = !v;
      if (abriendo) {
        setCloudExpanded(false);
        setCloudHidden(false);
        // setTimeout, NO requestAnimationFrame: en pestaña oculta RAF no
        // dispara y el iframe quedaba en about:blank. Restaura último hilo.
        urlRestaurada(cloudUrl).then(u => {
          if (u !== cloudUrl) setCloudUrl(u);
          setTimeout(() => recargarCloudIframe(u), 80);
        });
      }
      Toast().show(abriendo ? '☁️ Cloud Backend activado' : '☁️ Cloud Backend desactivado', 'info', 2000);
      return abriendo;
    });
  }, [cloudUrl, recargarCloudIframe]);

  // Duo Lyra ↔ Nube: pi y el LLM externo conversan por turnos en el hilo.
  const toggleDuo = useCallback(() => {
    if (duoActivo) { duoRef.current?.detener(); setDuoActivo(false); return; }
    if (!cloudVisible || (!usaExtPane && !iframeRef.current)) { Toast().show('Abrí ☁ Cloud primero', 'warning', 2500); return; }
    if (!lyraOnline) { Toast().show('Lyra local está offline — Duo necesita ambos agentes', 'warning', 3000); return; }
    if (cargando.value) { Toast().show('Esperá a que Lyra termine', 'warning', 2000); return; }
    const duo = crearDuoLyraCloud();
    duoRef.current = duo;
    setDuoActivo(true);
    Toast().show('⇆ Duo iniciado — Lyra ↔ ' + (AI_LABELS[cloudAiId] || 'Nube'), 'info', 2000);
    duo.iniciar(
      { iframe: iframeRef.current, model: modeloSeleccionado.value, convId: cloudConvIdActivo },
      { onEstado: e => { if (['fin', 'cancelado', 'error'].includes(e)) setDuoActivo(false); },
        onError: m => Toast().show('Duo: ' + m, 'error', 3000) },
    );
  }, [duoActivo, cloudVisible, cloudAiId, usaExtPane, lyraOnline, cloudConvIdActivo]);

  const cycleCloudPanel = useCallback(() => {
    if (cloudExpanded) {
      setCloudExpanded(false);
      setCloudHidden(false);
    } else if (!cloudHidden) {
      setCloudHidden(true);
    } else {
      setCloudExpanded(true);
      setCloudHidden(false);
    }
  }, [cloudExpanded, cloudHidden]);

  const closeCloud = useCallback(() => {
    invalidarCloudRelay(iframeRef.current);
    setCloudVisible(false);
    setCloudExpanded(false);
    setCloudHidden(false);
  }, []);

  // AURORA CONTROLA al iframe de la extensión (no al revés): reporta el rect
  // del placeholder y la extensión dibuja el iframe EXACTAMENTE ahí. Debe
  // seguir el layout de Aurora al pixel — modos (mini/expandido) que animan,
  // scroll, resize. Por eso: ResizeObserver (sigue el tamaño, incluido durante
  // transiciones), scroll (sigue la posición) y un loop rAF corto tras cada
  // cambio de modo (cubre la animación CSS mientras el rect va cambiando).
  useEffect(() => {
    if (!usaExtPane) return;
    let ultimo = '';
    let lastRect = null;   // último rect visible — reusado en modo oculto (el wrap es display:none, sin rect)
    const report = () => {
      // Cerrado: sacar el iframe de la extensión.
      if (!cloudVisible) {
        if (ultimo !== 'vacio') { window.parent.postMessage({ type: 'AURORA_LLM_PANES', panes: [], hidden: true }, '*'); ultimo = 'vacio'; }
        return;
      }
      // Oculto manualmente o detrás de otra vista: el placeholder no tiene un
      // rect útil. Avisar hidden:true para que el iframe externo no tape Home,
      // pero conservar el pane montado y con su sesión autenticada viva.
      if (!active || cloudHidden) {
        const clave = `hidden,${active ? 'panel' : 'view'},${cloudUrl}`;
        if (clave === ultimo) return;
        ultimo = clave;
        window.parent.postMessage({
          type: 'AURORA_LLM_PANES',
          panes: [{ id: 'cloud', surface: 'lyria-cloud', url: cloudUrl, rect: lastRect || { left: 0, top: 0, width: 1, height: 1 } }],
          hidden: true,
        }, '*');
        return;
      }
      const el = document.querySelector('[data-llm-pane="cloud"]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;  // sin layout aún
      // Clamp al panel: en mini el wrap mide 72px dentro de un panel de 72px
      // con header → el placeholder rebalsa por debajo y el iframe de extensión
      // taparía el composer (botón ocultar). Recortá al alto visible del panel.
      const panel = el.closest('.cloud-panel');
      let bottom = r.top + r.height;
      if (panel) { const pr = panel.getBoundingClientRect(); bottom = Math.min(bottom, pr.top + pr.height); }
      lastRect = { left: r.left, top: r.top, width: r.width, height: Math.max(2, bottom - r.top) };
      // Dedupe: no floodear postMessages con el mismo rect.
      const clave = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${cloudUrl}`;
      if (clave === ultimo) return;
      ultimo = clave;
      window.parent.postMessage({
        type: 'AURORA_LLM_PANES',
        panes: [{ id: 'cloud', surface: 'lyria-cloud', url: cloudUrl, rect: lastRect }],
        hidden: false,
      }, '*');
    };
    const el = document.querySelector('[data-llm-pane="cloud"]');
    const ro = new ResizeObserver(report);
    if (el) ro.observe(el);
    window.addEventListener('resize', report);
    window.addEventListener('scroll', report, true);
    // Loop rAF ~600ms: cubre la transición CSS del cambio de modo (el rect
    // va cambiando frame a frame; el iframe de la extensión lo sigue suave).
    const t0 = Date.now();
    let raf;
    const loop = () => { report(); if (Date.now() - t0 < 600) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    // Interval con dedupe (barato: solo postea si el rect cambió): garantiza
    // que el report dispare apenas el placeholder está en el DOM y con layout,
    // aunque el effect corra antes de que React lo pinte.
    const iv = setInterval(report, 300);
    return () => { ro.disconnect(); window.removeEventListener('resize', report); window.removeEventListener('scroll', report, true); cancelAnimationFrame(raf); clearInterval(iv); };
  }, [usaExtPane, cloudVisible, cloudExpanded, cloudHidden, cloudUrl, active]);

  // Al desmontar la vista, sacar el iframe de la extensión (no dejar huérfano).
  useEffect(() => () => {
    try { window.parent.postMessage({ type: 'AURORA_LLM_PANES', panes: [] }, '*'); } catch (_) {}
  }, []);

  // El panel cloud en modo Full (.llama-view.cloud-expanded .cloud-panel.expanded)
  // se ancla con bottom:<altura del composer> para no taparlo — antes un
  // valor fijo (116px) que quedó desincronizado del alto real del composer
  // (creció con la fila de botones nuevos: mide ~134px), tapando el botón
  // toggle Cloud. Ahora sigue el alto real vía ResizeObserver + CSS var.
  useEffect(() => {
    const el = document.querySelector('.chat-input-area');
    const root = document.querySelector('.llama-view');
    if (!el || !root) return;
    const aplicar = () => root.style.setProperty('--composer-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    aplicar();
    const ro = new ResizeObserver(aplicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const elegirCloudAi = useCallback((aiId, urlOverride) => {
    const url = urlOverride || AI_URLS[aiId] || '';
    setCloudAiId(aiId);
    setCloudUrl(url);
    setCloudMenu(null);
    recargarCloudIframe(url);
    Toast().show(`☁️ ${aiId === 'custom' ? url : aiId.toUpperCase()}`, 'info', 1500);
  }, [recargarCloudIframe]);

  const toggleCategory = useCallback(id => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleSysChipClick = useCallback((tool, soloNombre) => {
    setMensaje(prev => prev + promptParaHerramienta(tool, soloNombre));
  }, []);

  const handleForgeChipClick = useCallback((tool, soloNombre) => {
    const text = soloNombre
      ? tool.name
      : `Usá aurora_forge_run con name "${tool.name}" y arguments según este contrato: ${JSON.stringify(tool.input_schema)}. Objetivo: `;
    setMensaje(prev => prev + text);
  }, []);

  const onChatScroll = useCallback(() => {
    setEnFondo(estaCercaDelFondo(chatRef.current));
  }, []);

  // Cap de render: pintar TODOS los mensajes re-renderiza la lista entera en
  // cada chunk del streaming → con conversaciones largas (80+ msgs) pinnea el
  // main thread y congela la app (y cuelga el loop de tools de la nube). Solo
  // los últimos MAX_RENDER se pintan; el resto sigue en historial/DB.
  const MAX_RENDER = 50;
  // Mensajes cloud (_via:direct-ai/pi-tool) etiquetados con el _convId del
  // hilo que los generó. Si el usuario cambió de conversación en el sidebar
  // del proveedor (cloudConvIdActivo ya resuelto contra ESE hilo), ocultar
  // los que pertenecen a un hilo distinto — sin esto, cambiar de hilo en
  // ChatGPT mezclaba visualmente memoria de conversaciones distintas.
  const _visiblesFiltrados = historialVal.filter(m => {
    if (m._internal) return false;
    const esCloud = m._via === 'direct-ai' || m._via === 'pi-tool' || m._via === 'duo-external';
    if (!esCloud || m._convId == null || cloudConvIdActivo === undefined) return true;
    return m._convId === cloudConvIdActivo;
  });
  // El signal `historial` es efímero: un reload de Aurora lo vacía (viene de
  // cargarMensajes, que solo lee la tabla `mensajes` de pi, NUNCA cloud). Si
  // el hilo activo tiene memoria en DB (cloud_mensajes), se fusiona SIEMPRE
  // con lo que haya en memoria — no solo cuando memoria está vacía: un turno
  // nuevo en curso (aún sin persistir()) coexiste con la memoria vieja
  // hidratada de DB en vez de reemplazarla. Bug real verificado en vivo:
  // con un "si no hay nada, hidratar" exclusivo, mandar UN mensaje nuevo
  // hacía desaparecer toda la memoria hidratada del hilo en el siguiente
  // render (tieneMemoriaEnVivo pasaba a true con solo ese mensaje nuevo).
  // Dedup por rol+contenido (lo único estable entre ambas fuentes: DB no
  // comparte id con el _uiId en memoria).
  const _visiblesTodos = cloudConvIdActivo != null && cloudHistorialPropio.length
    ? (() => {
        const yaEnMemoria = new Set(
          _visiblesFiltrados
            .filter(m => m._convId === cloudConvIdActivo)
            .map(m => `${m.role} ${m.content}`),
        );
        const hidratados = cloudHistorialPropio
          .filter(m => !yaEnMemoria.has(`${m.rol} ${m.contenido}`))
          .map(m => ({
            role: m.rol, content: m.contenido, ts: (m.capturado_en || 0) * 1000,
            id: `cloud-hist-${m.id}`, _via: 'direct-ai', _convId: cloudConvIdActivo,
          }));
        return [..._visiblesFiltrados, ...hidratados].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      })()
    : _visiblesFiltrados;
  const visibleMessages = _visiblesTodos.length > MAX_RENDER
    ? _visiblesTodos.slice(-MAX_RENDER)
    : _visiblesTodos;

  const estaFijado = (msg) => fijados[msg.id] !== undefined ? fijados[msg.id] : !!msg.fijado;
  const togglePin = async (msg) => {
    if (!msg.id) return;
    try {
      const r = await patchJSON(`/db/chats/mensajes/${msg.id}/pin`);
      setFijados(prev => ({ ...prev, [msg.id]: !!r.fijado }));
    } catch (e) {
      console.warn('[Aurora] pin fallo', e);
    }
  };

  const controlBtnBase = 'h-7 px-2 text-xs font-semibold rounded-md border whitespace-nowrap cursor-pointer transition disabled:opacity-35 disabled:cursor-default';
  const controlBtnIdle = `${controlBtnBase} bg-aurora-surface border-aurora-border text-aurora-text-muted hover:border-aurora-accent hover:text-aurora-text`;
  const controlBtnActive = `${controlBtnBase} bg-aurora-accent bg-opacity-20 border-aurora-accent text-aurora-text`;
  const cloudBtnClass = `${controlBtnBase} border-aurora-border text-aurora-text-muted bg-aurora-surface hover:border-aurora-accent hover:text-aurora-text`;
  const cloudBtnActiveClass = `${controlBtnBase} border-aurora-accent text-black bg-aurora-accent`;
  const quickActionsClass = 'message-quick-actions flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-aurora-border opacity-50 transition-opacity';
  const actionChipClass = 'action-chip inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-full bg-aurora-surface border border-aurora-border text-aurora-text-dim cursor-pointer whitespace-nowrap transition hover:border-aurora-accent hover:text-aurora-text active:scale-95';
  const panelTopClass = 'shrink-0 border-b border-aurora-border bg-black bg-opacity-20';
  const panelButtonClass = 'px-2 py-1 text-[11px] rounded border border-aurora-border bg-aurora-surface text-aurora-text-dim cursor-pointer hover:border-aurora-accent hover:text-aurora-text';
  const toolbarHeaderClass = 'toolbar-section-header flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] text-aurora-text-dim cursor-pointer select-none transition hover:bg-aurora-surface hover:text-aurora-text';
  const toolbarChipClass = 'toolbar-tool-chip flex items-center gap-1 px-2 py-1 rounded-full text-[10px] bg-aurora-surface border border-aurora-border text-aurora-text-dim cursor-pointer transition hover:border-aurora-accent hover:text-aurora-text';

  // Mismo formato que el footer.js real de pi: ↑input ↓output, costo,
  // %contexto — tok/s es agregado propio de Aurora (pi no lo muestra).
  let statsTexto = '';
  if (sessionStats) {
    const tk = sessionStats.tokens || {};
    const partes = [];
    if (tk.input) partes.push(`↑${formatTokens(tk.input)}`);
    if (tk.output) partes.push(`↓${formatTokens(tk.output)}`);
    if (tk.cacheRead) partes.push(`R${formatTokens(tk.cacheRead)}`);
    if (tk.cacheWrite) partes.push(`W${formatTokens(tk.cacheWrite)}`);
    if (sessionStats.cost) partes.push(`$${sessionStats.cost.toFixed(3)}`);
    const ctx = sessionStats.contextUsage;
    if (ctx && ctx.percent != null && ctx.contextWindow) {
      partes.push(`${ctx.percent.toFixed(1)}%/${formatTokens(ctx.contextWindow)}`);
    }
    if (ultimoTps != null) partes.push(`${ultimoTps} tok/s`);
    statsTexto = partes.join(' · ');
  }

  return html`
    <div class="llama-view ${canvasVisibleVal ? 'canvas-open' : ''} ${cloudVisible && cloudExpanded ? 'cloud-expanded' : ''}">

      <div class=${'flex items-center gap-1 px-2 py-1.5 flex-wrap ' + panelTopClass}>
        <button class=${mostrarHistorial ? controlBtnActive : controlBtnIdle} onClick=${() => setMostrarHistorial(v => !v)} title="Historial de chats" dangerouslySetInnerHTML=${{ __html: ICON_HISTORIAL }}></button>
        <button class=${mostrarParametros ? controlBtnActive : controlBtnIdle} onClick=${() => setMostrarParametros(v => !v)} title="Parámetros del modelo" dangerouslySetInnerHTML=${{ __html: ICON_PARAMETROS }}></button>
        <button class=${mostrarToolbar ? controlBtnActive : controlBtnIdle} onClick=${() => setMostrarToolbar(v => !v)} title="Herramientas" dangerouslySetInnerHTML=${{ __html: ICON_HERRAMIENTAS }}></button>
        <button class=${controlBtnIdle} onClick=${nuevoChat} title="Nuevo chat" dangerouslySetInnerHTML=${{ __html: ICON_NUEVO_CHAT }}></button>
        <span class="flex-1"></span>
        ${modelosDisp.length > 0
          ? html`
            <select
              class="h-7 max-w-[210px] text-xs rounded-md border border-aurora-border bg-aurora-surface text-aurora-text px-1"
              value=${modeloVal}
              onChange=${e => guardarModelo(e.target.value)}
            >
              ${modelosDisp.map(m => {
                const id = m.id || m;
                const label = m.provider ? `${id} · ${m.provider}` : id;
                return html`<option key=${id} value=${id}>${label}</option>`;
              })}
            </select>
          `
          : html`<span class="text-[10px] text-aurora-text-dim border border-aurora-border rounded px-2 py-1">llama-server offline</span>`
        }
        ${vocesVal.length > 0 && html`
          <select
            class="h-7 max-w-[160px] text-xs rounded-md border border-aurora-border bg-aurora-surface text-aurora-text px-1"
            value=${vozVal}
            onChange=${e => setVoz(e.target.value)}
            title="Voz TTS"
          >
            ${vocesVal.map(v => html`<option key=${v.id} value=${v.id}>${v.nombre}</option>`)}
          </select>
        `}
        ${statsTexto && html`
          <span class="text-[10px] text-aurora-text-dim px-1.5 font-mono whitespace-nowrap" title="Tokens de esta sesión (como el footer de pi) · tok/s del último turno">${statsTexto}</span>
        `}
        ${piInfo && html`
          <span
            class=${'text-[10px] px-1.5 py-0.5 rounded border font-mono whitespace-nowrap ' +
              (piInfo.degraded
                ? 'text-aurora-error border-aurora-error/40'
                : 'text-aurora-success border-aurora-success/30')}
            title=${piInfo.degraded
              ? piInfo.error
              : `Pi ${piInfo.piVersion || '?'} · ${piInfo.runtime} v${piInfo.protocolVersion} · sesión ${piInfo.session_id || 'nueva'} · ${piInfo.capabilities?.length || 0} capacidades`}
          >${piInfo.degraded ? 'Pi no disponible' : `Pi ${piInfo.piVersion || ''} · RPC v${piInfo.protocolVersion || 1}`}</span>
        `}
        <span class=${'text-[10px] px-1.5 ' + (lyraOnline ? 'text-aurora-success' : 'text-aurora-error')} title=${lyraOnline ? 'Lyra online' : 'Lyra offline'}>●</span>
      </div>

      ${mostrarParametros && html`
        <${ParamsPanel} instruccionVal=${instruccionVal} />
      `}

      ${mostrarHistorial && html`
        <div class=${'llama-history-panel ' + panelTopClass + ' max-h-[200px] overflow-y-auto'}>
          <div class="history-header sticky top-0 flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold bg-black bg-opacity-30 border-b border-aurora-border backdrop-blur">
            <span>Historial</span>
            <div class="history-export flex gap-1">
              <button class=${panelButtonClass + ' px-1.5 py-0.5 text-[10px]'} onClick=${() => exportarChat(historialVal, modeloVal, 'md')}>MD</button>
              <button class=${panelButtonClass + ' px-1.5 py-0.5 text-[10px]'} onClick=${() => exportarChat(historialVal, modeloVal, 'json')}>JSON</button>
              <button class=${panelButtonClass + ' px-1.5 py-0.5 text-[10px]'} onClick=${() => exportarChatPDF(historialVal, modeloVal)}>PDF</button>
            </div>
          </div>
          <div class="history-list p-1">
            ${chatsVal.length === 0 && html`<p class="history-empty p-2 text-center text-[11px] text-aurora-text-muted">Sin chats guardados</p>`}
            ${chatsVal.map(c => html`
              <div key=${c.id}
                class=${'history-item flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] border border-transparent cursor-pointer transition ' + (c.id === chatIdVal ? 'active' : '')}
                style=${c.parent_chat_id ? 'margin-left:14px' : ''}
                onClick=${() => cambiarChat(c.id)}>
                <div class="hi-info flex-1 overflow-hidden">
                  <span class="hi-nombre block overflow-hidden text-ellipsis whitespace-nowrap">${c.parent_chat_id ? '🌿 ' : ''}${c.nombre}</span>
                  <span class="hi-meta text-[10px] text-aurora-text-dim">${c.modelo || '—'} · ${fmtFecha(c.updatedAt ?? c.actualizado_en)}</span>
                </div>
                <button class="hi-del px-1 bg-transparent border-0 text-aurora-text-dim cursor-pointer"
                  onClick=${e => { e.stopPropagation(); eliminarChat(c.id); }}>×</button>
              </div>
            `)}
          </div>
        </div>
      `}

      ${mostrarToolbar && html`
        <div class=${'llama-toolbar-panel ' + panelTopClass + ' max-h-[180px] overflow-y-auto px-2 py-1'}>
          <div class="toolbar-section mb-1">
            <div class=${toolbarHeaderClass} onClick=${() => toggleCategory('sistema')}>
              <span class="toolbar-section-title flex-1 font-semibold">Sistema (${HERRAMIENTAS_SISTEMA.length})</span>
              <span class="expand-icon text-[9px]">${expandedCategories['sistema'] ? '▼' : '▶'}</span>
            </div>
            ${expandedCategories['sistema'] && html`
              <div class="toolbar-chips flex flex-wrap gap-1 px-1 py-1.5">
                ${HERRAMIENTAS_SISTEMA.map(t => html`
                  <button
                    key=${t.name}
                    class=${toolbarChipClass}
                    title=${t.desc}
                    onClick=${e => handleSysChipClick(t, e.ctrlKey || e.metaKey)}
                  >${t.name}</button>
                `)}
              </div>
            `}
          </div>
          <div class="toolbar-section mb-1">
            <div class=${toolbarHeaderClass} onClick=${() => toggleCategory('forge')}>
              <span class="toolbar-section-title flex-1 font-semibold">Forjadas (${forgeTools.length})</span>
              <span class="expand-icon text-[9px]">${expandedCategories['forge'] ? '▼' : '▶'}</span>
            </div>
            ${expandedCategories['forge'] && html`
              <div class="toolbar-chips flex flex-wrap gap-1 px-1 py-1.5">
                ${forgeTools.length === 0 && html`<span class="text-[10px] text-aurora-text-dim px-1">Todavía no hay tools aprobadas y activas.</span>`}
                ${forgeTools.map(t => html`
                  <button key=${t.name} class=${toolbarChipClass} title=${`${t.description} · riesgo ${t.risk}`}
                    onClick=${e => handleForgeChipClick(t, e.ctrlKey || e.metaKey)}>${t.name}</button>
                `)}
              </div>
            `}
          </div>
        </div>
      `}

      ${avatar?.position === 'center' && html`<${AvatarCenter} avatar=${avatar} />`}

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
          const msgKey = msg._uiId
            || (msg.id != null ? `db:${msg.id}` : `legacy:${msg.role}:${msg.ts || msg.timestamp || 'sin-ts'}:${idx}`);
          const esExterno = msg._via === 'direct-ai' || msg._via === 'duo-external';
          const esPiTool = msg._via === 'pi-tool';
          const rolLabel = msg.role === 'user'
            ? rolTu()
            : esPiTool
              ? html`<span dangerouslySetInnerHTML=${{ __html: ICON_HERRAMIENTAS }}></span> pi tool${msg._toolIter ? ` · ${msg._toolIter}/${msg._toolMax || 6}` : ''}`
              : esExterno
                ? html`<${RolProveedor} aiId=${cloudAiId} label=${AI_LABELS[cloudAiId] || 'AI ext'} />`
                : rolLyra();

          if (msg.role === 'assistant') {
            const parsed = combinarPartesRicas(parsearMensajeRico(msg.content));
            return html`
              <div key=${msgKey} class=${'message assistant' + (esExterno ? ' direct-ai' : '') + (esPiTool ? ' pi-tool' : '') + (esPiTool && msg._toolError ? ' is-error' : '') + (msg._via === 'duo-external' ? ' duo-turn' : '')}>
                <div class="message-header">
                  <span class="role">${rolLabel}</span>
                  <span class="time">${new Date(msg.ts || msg.timestamp || Date.now()).toLocaleTimeString()}</span>
                  ${msg.id && html`
                    <button
                      class=${'msg-pin-btn' + (estaFijado(msg) ? ' fijado' : '')}
                      onClick=${() => togglePin(msg)}
                      title=${estaFijado(msg) ? 'Desfijar mensaje' : 'Fijar mensaje'}
                      dangerouslySetInnerHTML=${{ __html: estaFijado(msg) ? ICON_FIJADO : ICON_FIJAR }}
                    ></button>
                  `}
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
                    const key = `${msgKey}:thinking:${i}`;
                    return html`
                      <div key=${key} class="message-thinking">
                        <button
                          class="thinking-toggle-inline"
                          onClick=${() => setExpandedThinking(prev => ({ ...prev, [key]: !prev[key] }))}
                        >${expandedThinking[key] ? '▼' : '▶'} Thinking</button>
                        ${expandedThinking[key] && html`
                          <div class="thinking-content-inline"><pre>${p.contenido}</pre></div>
                        `}
                      </div>
                    `;
                  }
                  if (p.tipo === 'text') {
                    return html`
                      <div key=${`${msgKey}:text:${i}`} class="message-content"
                        dangerouslySetInnerHTML=${{ __html: renderizarContenido(p.contenido) }}
                      ></div>
                    `;
                  }
                  if (p.tipo === 'tool') {
                    const key = `${msgKey}:tool:${i}`;
                    const abierto = expandedTools[key] ?? true;
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
                ${msg._imagen && html`
                  <img src=${msg._imagen} alt="Imagen leída por la tool" class="mt-2 max-w-full max-h-72 rounded-lg border border-white/10 object-contain bg-black/10 cursor-zoom-in" onClick=${() => setLightbox(msg._imagen)} />
                `}
                ${msg._imagenes?.length && html`
                  <div class="flex flex-wrap gap-2 mt-2">
                    ${msg._imagenes.map((src, i) => html`
                      <img key=${`${msgKey}:image:${i}`} src=${src} alt="Imagen generada" class="max-w-full max-h-80 rounded-lg border border-white/10 object-contain bg-black/10 cursor-zoom-in" onClick=${() => setLightbox(src)} />
                    `)}
                  </div>
                `}
                ${msg._timing && html`
                  <div class="text-[10px] text-aurora-text-muted font-mono mt-1 opacity-70">
                    ⏱ responde ${(msg._timing.responde / 1000).toFixed(1)}s · genera ${(msg._timing.genera / 1000).toFixed(1)}s
                  </div>
                `}
                ${!esPiTool && html`<div class=${quickActionsClass}>
                    <button class=${actionChipClass} onClick=${() => copiarMensaje(msg.content)} title="Copiar al portapapeles"><span dangerouslySetInnerHTML=${{ __html: ICON_COPIAR }}></span> Copiar</button>
                    <button class=${actionChipClass} onClick=${() => añadirANotas(msg.content)} title="Añadir a notas"><span dangerouslySetInnerHTML=${{ __html: ICON_NOTA }}></span> A notas</button>
                    <button class=${actionChipClass} onClick=${() => reformularRespuesta(regenerarRespuesta, msg)} title="Regenerar respuesta"><span dangerouslySetInnerHTML=${{ __html: ICON_REGENERAR }}></span> Regenerar</button>
                    <button class=${actionChipClass} onClick=${() => leerMensaje(msg.content)} title="Leer mensaje"><span dangerouslySetInnerHTML=${{ __html: ICON_HABLAR }}></span> Leer</button>
                  </div>`}
              </div>
            `;
          }

          const esExternoFinal = msg._via === 'direct-ai' || msg._via === 'duo-external';
          const rolLabelFinal = msg.role === 'user'
            ? rolTu()
            : esExternoFinal
              ? html`<${RolProveedor} aiId=${cloudAiId} label=${AI_LABELS[cloudAiId] || 'AI ext'} />`
              : rolLyra();
          return html`
            <div key=${msgKey} class=${'message ' + msg.role + (esExternoFinal ? ' direct-ai' : '') + (msg._via === 'duo-external' ? ' duo-turn' : '')}>
              <div class="message-header">
                <span class="role">${rolLabelFinal}</span>
                <span class="time">${new Date(msg.ts || msg.timestamp || Date.now()).toLocaleTimeString()}</span>
                ${msg.id && html`
                  <button
                    class=${'msg-pin-btn' + (estaFijado(msg) ? ' fijado' : '')}
                    onClick=${() => togglePin(msg)}
                    title=${estaFijado(msg) ? 'Desfijar mensaje' : 'Fijar mensaje'}
                    dangerouslySetInnerHTML=${{ __html: estaFijado(msg) ? ICON_FIJADO : ICON_FIJAR }}
                  ></button>
                `}
              </div>
              <div class="message-content"
                dangerouslySetInnerHTML=${{ __html: renderizarContenido(msg.content, { externo: esExternoFinal }) }}
              ></div>
              ${msg._imagenes?.length && html`
                <div class="flex flex-wrap gap-2 mt-2">
                  ${msg._imagenes.map((src, i) => html`
                    <img key=${`${msgKey}:image:${i}`} src=${src} alt="Imagen adjunta" class="max-w-[160px] max-h-40 rounded-lg border border-white/10 object-contain bg-black/10 cursor-zoom-in" onClick=${() => setLightbox(src)} />
                  `)}
                </div>
              `}
              ${msg._timing && html`
                <div class="text-[10px] text-aurora-text-muted font-mono mt-1 opacity-70">
                  ⏱ responde ${(msg._timing.responde / 1000).toFixed(1)}s · genera ${(msg._timing.genera / 1000).toFixed(1)}s
                </div>
              `}
              ${(msg.content || '').trim() && html`
                <div class="flex flex-wrap gap-2 mt-2">
                  <button class=${actionChipClass} onClick=${() => copiarMensaje(msg.content)} title="Copiar al portapapeles"><span dangerouslySetInnerHTML=${{ __html: ICON_COPIAR }}></span> Copiar</button>
                </div>
              `}
            </div>
          `;
        })}

        ${(streamingVal || asistenteEnVivo.blocks.length > 0) && html`
          <div class="message assistant streaming">
            <div class="message-header">
              <span class="role">${rolLyra()}</span>
              <span class="streaming-dot">●</span>
            </div>
            ${asistenteEnVivo.blocks.map((b, i) => {
              const blockKey = b.id || `live:${b.tipo}:${i}`;
              if (b.tipo === 'thinking') {
                return html`
                  <div key=${blockKey} class="message-thinking">
                    <button
                      class="thinking-toggle-inline"
                      onClick=${() => setExpandedThinking(prev => ({ ...prev, _live: !prev._live }))}
                    >${expandedThinking._live ? '▼' : '▶'} Thinking</button>
                    ${expandedThinking._live && html`
                      <div class="thinking-content-inline"><pre>${b.contenido}</pre></div>
                    `}
                  </div>
                `;
              }
              if (b.tipo === 'text') {
                return html`
                  <div key=${blockKey} class="message-content"
                    dangerouslySetInnerHTML=${{ __html: renderizarContenido(b.contenido) }}
                  ></div>
                `;
              }
              if (b.tipo === 'tool') {
                const abierto = expandedTools[b.id] ?? true;
                return html`
                  <div key=${blockKey} class=${'message tool-execution ' + (b.status === 'error' ? 'tool-error' : b.status === 'running' ? 'tool-running' : 'tool-success')}>
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
          </div>
        `}

        ${cargandoVal && !streamingVal && !thinkingVal && !cloudGenerandoVal && html`
          <div class="message assistant loading">
            <div class="message-header"><span class="role">${rolLyra()}</span></div>
            <div class="message-content">
              <span class="typing-indicator">◌ Pensando…</span>
            </div>
          </div>
        `}
        ${cloudGenerandoVal && html`
          <div class=${'cloud-activity cloud-activity--' + cloudStatusTone}>
            <span class="cloud-activity-chibi" aria-hidden="true"></span>
            <span class="cloud-activity-copy">
              <strong>${cloudAiLabel}</strong>
              <small key=${cloudStatusDisplay}>${cloudStatusDisplay}${cloudStatusTiming ? ' · ' + cloudStatusTiming : ''}</small>
            </span>
            <span class="cloud-activity-pulse"></span>
          </div>
        `}
        ${!enFondo && html`
          <button class="scroll-to-bottom-btn" title="Ir al final"
            onClick=${() => { scrollAlFondo(chatRef.current); setEnFondo(true); }}>
            ↓ Ir al final${(streamingVal || cloudGenerandoVal) ? ' · nuevo contenido' : ''}
          </button>
        `}
        </div>
        ${avatar?.position === 'right' && html`<${AvatarSlot} avatar=${avatar} side="right" />`}
      </div>

      ${toolActivityVal.length > 0 && html`
        <div class="tool-activity-bar fx-tool-activity" role="log" aria-label="Actividad de herramientas">
          <div class="tool-activity-head">
            <span class="tool-activity-count">Tools ${toolActivityVal.filter(e => e.status === 'running' || e.status === 'ok' || e.status === 'error').length}</span>
            <button class="act-clear" onClick=${clearActivity} title="Limpiar actividad">✕</button>
          </div>
          <div class="tool-activity-list">
            ${toolActivityVal.filter(e => e.status === 'running' || e.status === 'ok' || e.status === 'error').map(e => html`
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
      `}

      ${nexusPendiente && html`
        <div class=${'nexus-confirm-banner risk-' + nexusPendiente.bloque.risk_level.toLowerCase()}>
          <div class="nexus-confirm-header">
            <span class="nexus-confirm-risk">${nexusPendiente.bloque.risk_level === 'HIGH' ? '⚠ HIGH' : '⚡ MEDIUM'}</span>
            <span class="nexus-confirm-title">${nexusPendiente.bloque.task_id}</span>
          </div>
          <code class="nexus-confirm-cmd">${nexusPendiente.bloque.payload}</code>
          <p class="nexus-confirm-desc">${nexusPendiente.bloque.description}</p>
          <div class="nexus-confirm-actions">
            <button class="nexus-confirm-cancel" onClick=${() => { nexusPendiente.confirm(false); setNexusPendiente(null); }}>✕ Cancelar</button>
            <button class="nexus-confirm-ok" onClick=${() => { nexusPendiente.confirm(true); setNexusPendiente(null); }}>✓ Ejecutar</button>
          </div>
        </div>
      `}

      ${pendingImagesVal.length > 0 && html`
        <div class="image-preview-bar flex items-center shrink-0 gap-2 px-3 py-1.5 bg-black bg-opacity-30 border-t border-aurora-border overflow-x-auto">
          ${pendingImagesVal.map((item, i) => html`
            <div key=${item.id} class="relative shrink-0" title=${item.name || `Imagen ${i + 1}`}>
              <img src=${item.dataUrl} alt=${item.name || `Imagen ${i + 1}`} class="img-preview-thumb h-11 rounded" />
              <button
                onClick=${() => removePendingImage(item.id)}
                class="img-preview-close absolute -top-1 -right-1 w-5 h-5 p-0 rounded-full bg-black/80 border border-white/20 text-white text-xs cursor-pointer"
                title="Quitar imagen"
              >✕</button>
            </div>
          `)}
          <span class="text-[10px] text-aurora-text-dim whitespace-nowrap">${pendingImagesVal.length}/${MAX_PENDING_IMAGES}</span>
          ${pendingImagesVal.length > 1 && html`
            <button onClick=${clearPendingImage}
              class="img-preview-close px-1.5 py-0.5 bg-transparent border-0 text-aurora-text-dim text-xs cursor-pointer whitespace-nowrap"
              title="Quitar todas las imágenes">Quitar todas</button>
          `}
        </div>
      `}

      ${pendingFiles.length > 0 && html`
        <div class="image-preview-bar flex items-center shrink-0 gap-2 px-3 py-1.5 bg-black bg-opacity-30 border-t border-aurora-border">
          ${pendingFiles.map((file, i) => html`
            <span key=${file.name + i} class="cloud-file-chip" title=${file.name}>
              <span class="cloud-file-chip-icon">${file.type?.includes('pdf') ? 'PDF' : file.type?.startsWith('text/') ? 'TXT' : 'FILE'}</span>
              <span class="cloud-file-chip-name">${file.name}</span>
            </span>
            <button onClick=${() => setPendingFiles(prev => prev.filter((_, n) => n !== i))}
              class="img-preview-close px-1.5 py-0.5 bg-transparent border-0 text-aurora-text-dim text-sm cursor-pointer"
              title="Quitar archivo">✕</button>
          `)}
        </div>
      `}

      <div class=${'cloud-panel ' + (cloudExpanded ? 'expanded' : cloudHidden ? 'hidden-mode' : 'mini') + (cloudVisible ? '' : ' cloud-panel-hidden') + (cloudPosition === 'top' && !cloudExpanded ? ' cloud-panel-top' : '')}
        style=${cloudVisible && !cloudHidden && !cloudExpanded && cloudHeight ? `height:${cloudHeight}px` : ''}>
        ${cloudVisible && !cloudHidden && !cloudExpanded && html`
          <div class="cloud-resize-handle" title="Arrastrá para ajustar el alto" onPointerdown=${iniciarResizeCloud}></div>
        `}
        ${cloudVisible && html`
          <div class="cloud-mini-header">
            <div class="cloud-identity">
              ${iconoUrlPara(cloudAiId) && !faviconFallo[cloudAiId]
                ? html`<img class="cloud-provider-mark cloud-provider-favicon" src=${iconoUrlPara(cloudAiId)} alt="" onError=${() => setFaviconFallo(f => ({ ...f, [cloudAiId]: true }))} />`
                : html`<span class="cloud-provider-mark">${AI_ICONOS[cloudAiId] || '☁'}</span>`}
              <span class="cloud-mini-label">${cloudAiLabel}</span>
              ${cloudTitulo && html`<span class="cloud-thread-title" title=${cloudTitulo}>${cloudTitulo}</span>`}
              <span class=${'cloud-live-status cloud-live-status--' + cloudStatusTone}>
                <span class="cloud-live-dot"></span>${cloudStatusLabel}
              </span>
              ${cloudStatusTiming && html`<span class="cloud-live-timing">${cloudStatusTiming}</span>`}
            </div>
            <div class="cloud-mini-actions">
              ${!cloudExpanded && html`
                <button
                  class="cloud-mini-btn"
                  title=${cloudPosition === 'top' ? 'Mover al pie (junto al composer)' : 'Mover a cabecera (arriba del chat)'}
                  onClick=${() => setCloudPosition(p => p === 'top' ? 'bottom' : 'top')}
                  dangerouslySetInnerHTML=${{ __html: cloudPosition === 'top' ? ICON_AL_PIE : ICON_A_CABECERA }}
                ></button>
              `}
              <button
                class="cloud-mini-btn"
                title=${cloudExpanded ? 'Contraer a mini' : 'Expandir'}
                onClick=${() => { setCloudExpanded(v => !v); setCloudHidden(false); }}
                dangerouslySetInnerHTML=${{ __html: cloudExpanded ? ICON_COLAPSAR : ICON_EXPANDIR }}
              ></button>
              <button class="cloud-mini-btn" title="Recargar" onClick=${() => recargarCloudIframe(cloudUrl)}>↺</button>
              <button class="cloud-mini-btn cloud-mini-btn--close" title="Cerrar" onClick=${closeCloud}>✕</button>
            </div>
          </div>
        `}
        <div class="cloud-panel-iframe-wrap" style="position:relative;">
          ${usaExtPane
            ? html`<div data-llm-pane="cloud" style="width:100%;height:100%;"></div>`
            : html`<iframe
                data-pane="cloud"
                src="about:blank"
                ref=${iframeRef}
                allow="clipboard-read; clipboard-write; microphone"
                title="Cloud Backend"
                tabIndex="-1"
              ></iframe>`}
          ${!cloudExpanded && html`
            <div
              class="cloud-panel-shield"
              onClick=${e => { e.stopPropagation(); setCloudExpanded(true); setCloudHidden(false); }}
              title="Abrir ${cloudAiLabel}"
            ></div>
          `}
        </div>
      </div>

      <div class="chat-input-area flex flex-col shrink-0 gap-0 w-full min-w-0 bg-black bg-opacity-20 border-t border-aurora-border backdrop-blur">

        <div class="flex items-center gap-1 px-2 pt-1.5 flex-wrap">
          <div
            class=${'btn-cloud-backend ' + (cloudVisible ? cloudBtnActiveClass : cloudBtnClass)}
            style="display:flex;align-items:center;gap:0;padding:0;overflow:hidden"
          >
            <button
              style="background:transparent;border:none;cursor:pointer;padding:0 6px 0 8px;height:100%;color:inherit;font-size:inherit;font-weight:inherit;display:flex;align-items:center;gap:4px"
              onClick=${() => cloudVisible ? closeCloud() : toggleCloud()}
              onContextMenu=${e => { e.preventDefault(); setCloudMenu({ x: e.clientX, y: e.clientY }); }}
              title=${cloudVisible ? 'Clic derecho: opciones · Clic: cerrar' : 'Activar Cloud Backend'}
            >
              ${cloudVisible && iconoUrlPara(cloudAiId) && !faviconFallo[cloudAiId]
                ? html`<img class="cloud-provider-favicon-inline" src=${iconoUrlPara(cloudAiId)} alt="" onError=${() => setFaviconFallo(f => ({ ...f, [cloudAiId]: true }))} />`
                : html`<span dangerouslySetInnerHTML=${{ __html: ICON_NUBE }}></span>`}
              ${cloudVisible ? cloudAiLabel : 'Cloud'}
            </button>
            ${cloudVisible && html`
              <button
                style="background:transparent;border:none;border-left:1px solid rgba(255,255,255,0.2);cursor:pointer;padding:0 6px;height:100%;color:inherit;display:flex;align-items:center"
                onClick=${cycleCloudPanel}
                title=${cloudExpanded ? 'Full → Mini' : cloudHidden ? 'Oculto → Full' : 'Mini → Oculto'}
                dangerouslySetInnerHTML=${{ __html: cloudExpanded ? ICON_COLAPSAR : cloudHidden ? ICON_MOSTRAR : ICON_OCULTAR }}
              ></button>
            `}
          </div>
          <button
            class=${'btn-duo ' + (duoActivo ? controlBtnActive : controlBtnIdle)}
            onClick=${toggleDuo}
            title="Modo Duo — Lyra ↔ LLM de la nube conversan por turnos"
          >${duoActivo ? '⇆ Duo…' : '⇄ Duo'}</button>

          <span class="flex-1"></span>

          <button
            class=${'btn-canvas ' + (canvasVisibleVal ? controlBtnActive : controlBtnIdle)}
            onClick=${toggleCanvas}
            title=${canvasVisibleVal ? 'Cerrar Canvas' : 'Canvas — panel de código'}
          >◱</button>
          <button
            class=${'btn-tts ' + (ttsEnabled ? controlBtnActive : controlBtnIdle)}
            onClick=${toggleAutoVoz}
            title=${ttsEnabled ? 'Desactivar voz' : 'Activar voz'}
            dangerouslySetInnerHTML=${{ __html: ttsEnabled ? ICON_HABLAR : ICON_MUDO }}
          ></button>
        </div>

        ${cloudMenu && html`
          <div
            class="composer-plus-menu"
            style=${{ position: 'fixed', top: Math.max(8, cloudMenu.y - 180) + 'px', left: cloudMenu.x + 'px', zIndex: 9999 }}
          >
            ${Object.keys(AI_URLS).filter(id => id !== 'custom').map(id => html`
              <button key=${id} class="composer-plus-item" onClick=${() => elegirCloudAi(id)}>
                ${iconoUrlPara(id) && !faviconFallo[id]
                  ? html`<img class="cloud-provider-mark cloud-provider-favicon" src=${iconoUrlPara(id)} alt="" onError=${() => setFaviconFallo(f => ({ ...f, [id]: true }))} />`
                  : html`<span>${AI_ICONOS[id]}</span>`}
                <span>${AI_LABELS[id]}</span>
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
          ${slashSel >= 0 && html`
            <div class="slash-menu">
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
            </div>
          `}
          <div class=${'composer-box' + (mensaje.trim() || pendingImagesVal.length ? ' composer-box--expanded' : '')}>

            ${previewMd && mensaje.trim() && html`
              <div class="px-2 py-1.5 mb-1 max-h-40 overflow-y-auto text-sm border-b border-aurora-border/50 prose-chat"
                dangerouslySetInnerHTML=${{ __html: renderizarContenido(mensaje) }} />
            `}

            <textarea
              class="composer-textarea"
              value=${mensaje}
              onInput=${e => {
                const v = e.target.value;
                ultimaEscrituraRef.current = Date.now();
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
                  if ((e.key === 'Tab' || e.key === 'Enter') && slashCmds.length) { e.preventDefault(); elegirComando(slashCmds[slashIdx]); return; }
                  if (e.key === 'Escape') { setSlashSel(-1); return; }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
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
              onBlur=${e => {
                // El relay inyecta tool-results en el iframe del LLM haciendo
                // focus() en su composer → roba el foco de este textarea
                // (cross-origin: relatedTarget queda null). Si el usuario está
                // escribiendo mientras corre el loop Cloud, se lo devolvemos:
                // así lo que teclea nunca se filtra al chat del iframe. Un clic
                // legítimo dentro de Aurora trae relatedTarget != null y no se
                // toca; un clic deliberado al iframe sin escritura reciente
                // tampoco (guard por ultimaEscritura < 3s).
                if (e.relatedTarget) return;
                if (!cloudGenerando.value) return;
                if (Date.now() - ultimaEscrituraRef.current > 3000) return;
                const el = e.target;
                const ini = el.selectionStart, fin = el.selectionEnd;
                requestAnimationFrame(() => {
                  if (document.activeElement === el) return;
                  try { el.focus(); el.setSelectionRange(ini, fin); } catch (_) {}
                });
              }}
              onPaste=${handlePaste}
              onDrop=${handleDrop}
              onDragOver=${e => e.preventDefault()}
              placeholder=${offline ? 'Lyra offline…' : 'Pregunta lo que quieras'}
              rows="1"
            />

            <div class="composer-actions">
              <div class="relative">
                <button
                  class="composer-icon-btn"
                  title="Más opciones"
                  onClick=${e => {
                    if (!plusOpen) {
                      const r = e.currentTarget.getBoundingClientRect();
                      setPlusOpen({ x: r.left, y: r.top });
                    } else {
                      setPlusOpen(null);
                    }
                  }}
                  dangerouslySetInnerHTML=${{ __html: ICON_MAS }}
                ></button>
              </div>
              <button
                class=${'composer-icon-btn' + (previewMd ? ' text-aurora-accent' : '')}
                title="Vista previa Markdown"
                onClick=${() => setPreviewMd(p => !p)}
                dangerouslySetInnerHTML=${{ __html: ICON_MOSTRAR }}
              ></button>
              <button
                class=${'composer-icon-btn' + (slashSel >= 0 ? ' text-aurora-accent' : '')}
                title="Comandos pi (/)"
                onClick=${() => {
                  if (slashSel >= 0) { setSlashSel(-1); return; }
                  cargarComandos();
                  if (!mensaje.startsWith('/')) setMensaje('/');
                  setSlashSel(0);
                  document.querySelector('.composer-textarea')?.focus();
                }}
                dangerouslySetInnerHTML=${{ __html: ICON_COMANDO }}
              ></button>
              ${plusOpen && html`
                <div
                  class="composer-plus-menu"
                  style=${{ position: 'fixed', bottom: (window.innerHeight - plusOpen.y + 8) + 'px', left: plusOpen.x + 'px', zIndex: 9999 }}
                >
                  <label class="composer-plus-item" onClick=${() => setPlusOpen(null)}>
                    <span>📎</span><span>Adjuntar archivo</span>
                    <input type="file" multiple accept=".pdf,image/*,.txt,.md,.csv,.json" style="display:none"
                      onChange=${e => {
                        const seleccionados = [...(e.target.files || [])];
                        if (!seleccionados.length) return;

                        seleccionados
                          .filter(file => file.type.startsWith('image/'))
                          .forEach(cargarImagen);

                        const otros = seleccionados.filter(file => !file.type.startsWith('image/'));
                        if (cloudVisible) {
                          otros.forEach(cargarArchivoCloud);
                        } else if (otros[0]) {
                          const file = otros[0];
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

              <button
                class=${'composer-icon-btn' + (grabandoVal ? ' composer-icon-btn--active' : '')}
                onClick=${toggleMic}
                title=${transcVal ? 'Transcribiendo…' : (grabandoVal ? 'Soltar para transcribir' : 'Dictar')}
              >${transcVal ? '…' : html`<span dangerouslySetInnerHTML=${{ __html: grabandoVal ? ICON_MIC_STOP : ICON_MIC }}></span>`}</button>

              ${cargandoVal
                ? html`<button class="composer-send-btn composer-send-btn--stop" onClick=${detenerGeneracion} title="Detener" dangerouslySetInnerHTML=${{ __html: ICON_DETENER }}></button>`
                : html`<button
                    class="composer-send-btn"
                    onClick=${() => enviarMensaje()}
                    disabled=${(!mensaje.trim() && pendingImagesVal.length === 0 && pendingFiles.length === 0) || (offline && !cloudVisible)}
                    dangerouslySetInnerHTML=${{ __html: ICON_ENVIAR }}
                  ></button>`
              }
            </div>
          </div>
        </div>
      </div>

      ${canvasVisibleVal && html`
        <div class="canvas-panel">
          <${CanvasPanel}
            code=${canvasCodeVal}
            lang=${canvasLang}
            tab=${canvasTab}
            onTabChange=${setCanvasTab}
            onCodeChange=${(code, lang) => { canvasWrite(code || ''); if (lang) setCanvasLang(lang); }}
            onClose=${() => { canvasVisible.value = false; }}
            onSendToAI=${code => enviarMensaje(`Revisá este código:\n\`\`\`\n${code}\n\`\`\``)}
          />
        </div>
      `}

      ${comandoOverlay && html`
        <${ComandoOverlay}
          comando=${comandoOverlay.comando}
          interactive=${comandoOverlay.interactive}
          data=${comandoOverlay.data}
          aplicando=${comandoOverlay.aplicando}
          onClose=${() => setComandoOverlay(null)}
          onAction=${manejarAccionOverlay}
        />
      `}

      ${lightbox && html`
        <div class="img-lightbox" onClick=${() => setLightbox(null)}>
          <img src=${lightbox} onClick=${e => e.stopPropagation()} />
          <button class="img-lightbox-close" onClick=${() => setLightbox(null)} title="Cerrar">✕</button>
        </div>
      `}

    </div>
  `;
}

export default Local;
