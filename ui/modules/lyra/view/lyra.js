const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef, useCallback } = globalThis.preactHooks;

import {
  historial, streamingActual, thinkingActual, cargando, cloudGenerando,
  cargarMensajes, guardarMensaje, agregarMensajeLocal, agregarMensajeRico, limpiarHistorial,
  limpiarStream, borrarMensaje, parsearMensajeRico, combinarPartesRicas,
} from '../scripts/chat/mensajes.js';
import { enviarACloud } from '../scripts/chat/cloud.js';
import { detenerCloud, invalidarCloudRelay } from '../../../components/shared/cloud-ask.js';
import { crearDuoLyraCloud } from '../scripts/chat/duo.js';
import { urlRestaurada } from '../../../components/shared/llm-sesiones.js';
import { chats, chatActualId, cargarChats, crearChat, eliminarChat, autoGuardar, fmtFecha, exportarChat } from '../scripts/chat/historial.js';
import { modeloSeleccionado, cargarModelo, guardarModelo } from '../scripts/chat/parametros.js';
import { instruccion, cargarInstruccion } from '../scripts/chat/instrucciones.js';
import { pendingImage, pendingImageDataUrl, setPendingImage, clearPendingImage } from '../scripts/chat/vision.js';
import {
  grabando, transcribiendo, autoVoz, vozSeleccionada, voces,
  cargarVoces, setVoz, toggleAutoVoz, iniciarGrabacion, detenerGrabacion, hablar, detenerVoz,
} from '../scripts/voz/voz.js';
import { canvasDoc, canvasVisible, CANVAS_TOOLS, toggleCanvas, canvasWrite, handleHubAction, cargarCanvas } from '../scripts/canvas/canvas.js';
import {
  renderizarContenido, scrollAlFondo, estaCercaDelFondo, inicializarEventosCodigo,
} from '../scripts/chat/renderizar.js';
import { toolActivity, trackStart, trackEnd, clearActivity } from '../scripts/chat/actividad.js';
import { copiarMensaje, añadirANotas, reformularRespuesta, leerMensaje } from '../scripts/chat/acciones-rapidas.js';
import { exportarChatPDF } from '../scripts/chat/exportar-pdf.js';
import { comandosPi, cargarComandos, filtrarComandos, iconoComando } from '../scripts/chat/comandos.js';
import { HERRAMIENTAS_SISTEMA, promptParaHerramienta } from '../scripts/chat/herramientas.js';
import { sendToLyra, fetchModels, connectLyra, cancelarMensaje, enviarSteer, onWidgetUpdate, cycleModel, linkSession } from '../../../components/shared/lyra-ws.js';
import { CanvasPanel } from '../../../components/lyra.views/canvas.js';
import { nexusOnline } from '../../../store.js';
import { getJSON, postJSON, patchJSON } from '../../../components/shared/api.js';
import { ToolVisualCard } from '../../../components/shared/cloud-tool-visual.js';
import { ParamsPanel } from './params-panel.js';
import { ComandoOverlay } from './comando-overlay.js';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';
import { usePersistedState } from '../../../components/shared/persisted-state.js';

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

export function Local() {
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
  const pendingImageDataUrlVal             = useSig(pendingImageDataUrl);
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
  const [cloudVisible, setCloudVisible]             = useState(false);
  const [cloudExpanded, setCloudExpanded]           = useState(false);
  const [cloudHidden, setCloudHidden]               = useState(false);
  // El proveedor Cloud es una preferencia, no estado efímero de la vista.
  // Antes cada hard reload volvía silenciosamente a Gemini aunque el usuario
  // estuviera trabajando con ChatGPT.
  const [cloudUrl, setCloudUrl]                     = usePersistedState('lyra_cloud_url', AI_URLS.gemini);
  const [cloudAiId, setCloudAiId]                   = usePersistedState('lyra_cloud_ai', 'gemini');
  // En extensión el iframe del LLM se monta a nivel de extensión (login OK),
  // no inline. Reactivo: el caps de la extensión llega async (HELLO).
  const [usaExtPane, setUsaExtPane]                 = useState(() => (globalThis.__aurora_extContext?.value?.caps || []).includes('llmPanes'));
  useEffect(() => {
    const sig = globalThis.__aurora_extContext;
    const upd = () => setUsaExtPane((sig?.value?.caps || []).includes('llmPanes'));
    upd();
    return sig ? sig.subscribe(upd) : undefined;
  }, []);

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
  const [ultimoTps, setUltimoTps]                   = useState(null); // tok/s del último turno — no existe en pi, agregado propio
  const [forgeTools, setForgeTools]                 = useState([]);
  const assistantMessageRef                          = useRef(asistenteEnVivo);

  const chatRef   = useRef(null);
  const [enFondo, setEnFondo]   = useState(true);
  const iframeRef = useRef(null);

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
  const FASES_EN_PROGRESO = ['thinking', 'working', 'uploading', 'queued'];
  const [fraseIdx, setFraseIdx] = useState(0);
  useEffect(() => {
    if (!cloudGenerandoVal) { setFraseIdx(0); return; }
    const id = setInterval(() => setFraseIdx(i => i + 1), 2000);
    return () => clearInterval(id);
  }, [cloudGenerandoVal]);
  const cloudStatusDisplay = FASES_EN_PROGRESO.includes(cloudStatusTone)
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
    getJSON('/db/ajustes/avatar').then(d => {
      if (d?.valor) try { setAvatar(JSON.parse(d.valor)); } catch {}
    }).catch(() => {});

    const onCanvasEvent = async e => {
      const { code, path, lang, tab } = e.detail || {};
      let value = code;
      if (value == null && path) {
        try {
          const r = await postJSON('/pi/cloud-tool', { tool: 'read', args: { path } });
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
    };
  }, []);

  useEffect(() => {
    const onCloudStatus = e => setCloudStatus(e.detail || { fase: 'idle', ts: Date.now() });
    window.addEventListener('aurora:cloud-status', onCloudStatus);
    return () => window.removeEventListener('aurora:cloud-status', onCloudStatus);
  }, []);

  useEffect(() => {
    if (chatIdVal) cargarMensajes(chatIdVal);
  }, [chatIdVal]);

  useEffect(() => {
    const enVuelo = cargandoVal || streamingVal || thinkingVal;
    if (enVuelo || enFondo) {
      scrollAlFondo(chatRef.current);
      if (enVuelo) setEnFondo(true);
    }
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
    const imagenDataUrl = opciones.skipUserAppend ? null : pendingImageDataUrl.value;
    if (!texto && !imagenDataUrl && !(cloudVisible && pendingFiles.length)) return;
    if (!texto && cloudVisible && (imagenDataUrl || pendingFiles.length)) texto = 'Analiza los archivos adjuntos.';

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
      const imgs = imagenDataUrl ? [imagenDataUrl] : undefined;
      if (imagenDataUrl) clearPendingImage();
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
        agregarMensajeRico({ role: 'user', content: texto, image: imagenDataUrl ? imagenDataUrl.split(',')[1] : null });
        clearPendingImage();
      }
      setMensaje('');
      enviarSteer(texto, chatActualId.value);
      return;
    }
    setMensaje('');

    if (!opciones.skipUserAppend) {
      agregarMensajeRico({ role: 'user', content: texto, image: imagenDataUrl ? imagenDataUrl.split(',')[1] : null });
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
        model:   modeloSeleccionado.value,
        system:  instruccion.value,
        history: (opciones.history || historial.value.slice(-20, -1)).map(m => ({ role: m.role, content: m.content })),
        tools:   CANVAS_TOOLS,
        chat_id: chatActualId.value,
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
              partes.push(`${call}\n${abre}\n${b.output}\n[/tool_result:${b.name}${tid ? ':' + tid : ''}]`);
            }
          }
          return partes.filter(Boolean).join('\n\n');
        };
        const contenidoFinal = serializarBloques(assistantMessageRef.current.blocks);
        agregarMensajeRico({ role: 'assistant', content: contenidoFinal, thinking: thinking || null });
        await guardarMensaje(chatActualId.value, 'assistant', contenidoFinal);
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
    const userMsg = historial.value[userIdx];
    const eliminados = historial.value.slice(idx);
    historial.value = historial.value.slice(0, idx);
    for (const item of eliminados) {
      if (item.id) await borrarMensaje(item.id);
    }
    await enviarMensaje({
      message: userMsg.content,
      history: historial.value.slice(0, userIdx),
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
    const reader = new FileReader();
    reader.onload = ev => {
      setPendingImage(blob, ev.target.result);
      Toast().show('◉ Imagen lista para enviar', 'success');
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
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) cargarImagen(blob);
        return;
      }
    }
  }, [cargarImagen]);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        cargarImagen(file);
        return;
      }
    }
    const archivo = Array.from(files).find(f => !f.type.startsWith('image/'));
    if (archivo && cloudVisible) {
      cargarArchivoCloud(archivo);
    } else if (archivo) {
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
      { iframe: iframeRef.current, model: modeloSeleccionado.value },
      { onEstado: e => { if (['fin', 'cancelado', 'error'].includes(e)) setDuoActivo(false); },
        onError: m => Toast().show('Duo: ' + m, 'error', 3000) },
    );
  }, [duoActivo, cloudVisible, cloudAiId, usaExtPane, lyraOnline]);

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
      // Oculto: el .cloud-panel-iframe-wrap es display:none → el placeholder no
      // tiene rect. Igual hay que avisar hidden:true (si no, el iframe queda
      // visible). Mantener montado (sesión viva) con el último rect conocido.
      if (cloudHidden) {
        const clave = `hidden,${cloudUrl}`;
        if (clave === ultimo) return;
        ultimo = clave;
        window.parent.postMessage({
          type: 'AURORA_LLM_PANES',
          panes: [{ id: 'cloud', url: cloudUrl, rect: lastRect || { left: 0, top: 0, width: 1, height: 1 } }],
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
        panes: [{ id: 'cloud', url: cloudUrl, rect: lastRect }],
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
  }, [usaExtPane, cloudVisible, cloudExpanded, cloudHidden, cloudUrl]);

  // Al desmontar la vista, sacar el iframe de la extensión (no dejar huérfano).
  useEffect(() => () => {
    try { window.parent.postMessage({ type: 'AURORA_LLM_PANES', panes: [] }, '*'); } catch (_) {}
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
  const _visiblesTodos = historialVal.filter(m => !m._internal);
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
        <button class=${mostrarHistorial ? controlBtnActive : controlBtnIdle} onClick=${() => setMostrarHistorial(v => !v)} title="Historial de chats">☰</button>
        <button class=${mostrarParametros ? controlBtnActive : controlBtnIdle} onClick=${() => setMostrarParametros(v => !v)} title="Parámetros del modelo">⚙</button>
        <button class=${mostrarToolbar ? controlBtnActive : controlBtnIdle} onClick=${() => setMostrarToolbar(v => !v)} title="Herramientas">🔧</button>
        <button class=${controlBtnIdle} onClick=${nuevoChat} title="Nuevo chat">＋</button>
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
          const esExterno = msg._via === 'direct-ai' || msg._via === 'duo-external';
          const esPiTool = msg._via === 'pi-tool';
          const rolLabel = msg.role === 'user'
            ? '👤 Tú'
            : esPiTool
              ? `🔧 pi tool${msg._toolIter ? ` · ${msg._toolIter}/${msg._toolMax || 6}` : ''}`
              : esExterno
                ? `${AI_ICONOS[cloudAiId] || '☁'} ${AI_LABELS[cloudAiId] || 'AI ext'}`
                : '🦙 Lyra';

          if (msg.role === 'assistant') {
            const parsed = combinarPartesRicas(parsearMensajeRico(msg.content));
            return html`
              <div key=${idx} class=${'message assistant' + (esExterno ? ' direct-ai' : '') + (esPiTool ? ' pi-tool' : '') + (esPiTool && msg._toolError ? ' is-error' : '') + (msg._via === 'duo-external' ? ' duo-turn' : '')}>
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
                ${msg._toolVisual || msg._toolDraft
                  ? html`<${ToolVisualCard} visual=${msg._toolVisual || msg._toolDraft} />`
                  : parsed.length ? parsed.map((p, i) => {
                  if (p.tipo === 'thinking') {
                    const key = `${idx}_${i}`;
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
                      <div key=${idx + '_' + i} class="message-content"
                        dangerouslySetInnerHTML=${{ __html: renderizarContenido(p.contenido) }}
                      ></div>
                    `;
                  }
                  if (p.tipo === 'tool') {
                    const key = `${idx}_${i}`;
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
                  <img src=${msg._imagen} alt="Imagen leída por la tool" class="mt-2 max-w-full max-h-72 rounded-lg border border-white/10 object-contain bg-black/10" />
                `}
                ${msg._timing && html`
                  <div class="text-[10px] text-aurora-text-muted font-mono mt-1 opacity-70">
                    ⏱ responde ${(msg._timing.responde / 1000).toFixed(1)}s · genera ${(msg._timing.genera / 1000).toFixed(1)}s
                  </div>
                `}
                ${!esPiTool && html`<div class=${quickActionsClass}>
                    <button class=${actionChipClass} onClick=${() => copiarMensaje(msg.content)} title="Copiar al portapapeles">📋 Copiar</button>
                    <button class=${actionChipClass} onClick=${() => añadirANotas(msg.content)} title="Añadir a notas">✎ A notas</button>
                    <button class=${actionChipClass} onClick=${() => reformularRespuesta(regenerarRespuesta, msg)} title="Regenerar respuesta">↻ Regenerar</button>
                    <button class=${actionChipClass} onClick=${() => leerMensaje(msg.content)} title="Leer mensaje">🔊 Leer</button>
                  </div>`}
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
              ${msg._imagenes?.length && html`
                <div class="flex flex-wrap gap-2 mt-2">
                  ${msg._imagenes.map((src, i) => html`
                    <img key=${i} src=${src} alt="Imagen adjunta" class="max-w-[160px] max-h-40 rounded-lg border border-white/10 object-contain bg-black/10" />
                  `)}
                </div>
              `}
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
                return html`
                  <div key=${'b' + i} class="message-thinking">
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
                  <div key=${'b' + i} class="message-content"
                    dangerouslySetInnerHTML=${{ __html: renderizarContenido(b.contenido) }}
                  ></div>
                `;
              }
              if (b.tipo === 'tool') {
                const abierto = expandedTools[b.id] ?? true;
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
          </div>
        `}

        ${cargandoVal && !streamingVal && !thinkingVal && !cloudGenerandoVal && html`
          <div class="message assistant loading">
            <div class="message-header"><span class="role">🦙 Lyra</span></div>
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

      ${pendingImageDataUrlVal && html`
        <div class="image-preview-bar flex items-center shrink-0 gap-2 px-3 py-1.5 bg-black bg-opacity-30 border-t border-aurora-border">
          <img src=${pendingImageDataUrlVal} class="img-preview-thumb h-11 rounded" />
          <button onClick=${clearPendingImage} class="img-preview-close px-1.5 py-0.5 bg-transparent border-0 text-aurora-text-dim text-sm cursor-pointer">✕</button>
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

      <div class=${'cloud-panel ' + (cloudExpanded ? 'expanded' : cloudHidden ? 'hidden-mode' : 'mini') + (cloudVisible ? '' : ' cloud-panel-hidden')}>
        ${cloudVisible && html`
          <div class="cloud-mini-header">
            <div class="cloud-identity">
              <span class="cloud-provider-mark">${AI_ICONOS[cloudAiId] || '☁'}</span>
              <span class="cloud-mini-label">${cloudAiLabel}</span>
              <span class=${'cloud-live-status cloud-live-status--' + cloudStatusTone}>
                <span class="cloud-live-dot"></span>${cloudStatusLabel}
              </span>
              ${cloudStatusTiming && html`<span class="cloud-live-timing">${cloudStatusTiming}</span>`}
            </div>
            <div class="cloud-mini-actions">
              <button class="cloud-mini-btn" title=${cloudExpanded ? 'Contraer a mini' : 'Expandir'} onClick=${() => { setCloudExpanded(v => !v); setCloudHidden(false); }}>${cloudExpanded ? '▾' : '⛶'}</button>
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
            >☁ ${cloudVisible ? cloudAiLabel : 'Cloud'}</button>
            ${cloudVisible && html`
              <button
                style="background:transparent;border:none;border-left:1px solid rgba(255,255,255,0.2);cursor:pointer;padding:0 6px;height:100%;color:inherit;font-size:10px;display:flex;align-items:center"
                onClick=${cycleCloudPanel}
                title=${cloudExpanded ? 'Full → Mini' : cloudHidden ? 'Oculto → Full' : 'Mini → Oculto'}
              >${cloudExpanded ? '∧' : cloudHidden ? '◻' : '∨'}</button>
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
          >${ttsEnabled ? '🔊' : '🔇'}</button>
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
          <div class=${'composer-box' + (mensaje.trim() || pendingImageDataUrlVal ? ' composer-box--expanded' : '')}>

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
                >+</button>
              </div>
              <button
                class=${'composer-icon-btn' + (previewMd ? ' text-aurora-accent' : '')}
                title="Vista previa Markdown"
                onClick=${() => setPreviewMd(p => !p)}
              >👁</button>
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
              >/</button>
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
                        } else if (cloudVisible) {
                          cargarArchivoCloud(file);
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

              <button
                class=${'composer-icon-btn' + (grabandoVal ? ' composer-icon-btn--active' : '')}
                onClick=${toggleMic}
                title=${transcVal ? 'Transcribiendo…' : (grabandoVal ? 'Soltar para transcribir' : 'Dictar')}
              >${transcVal ? '…' : (grabandoVal ? '⏹' : '🎤')}</button>

              ${cargandoVal
                ? html`<button class="composer-send-btn composer-send-btn--stop" onClick=${detenerGeneracion} title="Detener">■</button>`
                : html`<button
                    class="composer-send-btn"
                    onClick=${() => enviarMensaje()}
                    disabled=${(!mensaje.trim() && !pendingImageDataUrlVal && pendingFiles.length === 0) || (offline && !cloudVisible)}
                  >↑</button>`
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

    </div>
  `;
}

export default Local;
