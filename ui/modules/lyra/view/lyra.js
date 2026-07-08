const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef, useCallback } = globalThis.preactHooks;

import {
  historial, streamingActual, thinkingActual, cargando,
  cargarMensajes, guardarMensaje, agregarMensajeLocal, agregarMensajeRico, limpiarHistorial,
  limpiarStream, borrarMensaje, parsearMensajeRico, combinarPartesRicas,
} from '../scripts/chat/mensajes.js';
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
import { getJSON, patchJSON } from '../../../components/shared/api.js';
import { ParamsPanel } from './params-panel.js';
import { ComandoOverlay } from './comando-overlay.js';

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
  const [cloudUrl, setCloudUrl]                     = useState(AI_URLS.gemini);
  const [cloudAiId, setCloudAiId]                   = useState('gemini');
  const [cloudMenu, setCloudMenu]                   = useState(null);
  const [plusOpen, setPlusOpen]                     = useState(null);
  const [nexusPendiente, setNexusPendiente]         = useState(null);
  const [avatar, setAvatar]                         = useState(null);
  const [asistenteEnVivo, setAsistenteEnVivo]       = useState({ blocks: [] });
  const [colaMensajes, setColaMensajes]             = useState({ steering: [], followUp: [] });
  const [widgets, setWidgets]                       = useState({});
  const [comandoOverlay, setComandoOverlay]         = useState(null); // {comando, interactive, data, aplicando}
  const assistantMessageRef                          = useRef(asistenteEnVivo);

  const chatRef   = useRef(null);
  const [enFondo, setEnFondo]   = useState(true);
  const iframeRef = useRef(null);

  const cloudAiLabel = AI_LABELS[cloudAiId] || cloudAiId || 'Cloud';
  const offline = !lyraOnline;

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
    connectLyra().catch(() => {});
    onWidgetUpdate(setWidgets);
    getJSON('/db/ajustes/avatar').then(d => {
      if (d?.valor) try { setAvatar(JSON.parse(d.valor)); } catch {}
    }).catch(() => {});

    const onCanvasEvent = e => {
      const { code, lang } = e.detail || {};
      canvasWrite(code || '');
      if (lang) setCanvasLang(lang);
      setCanvasTab('codigo');
    };
    document.addEventListener('lyra:canvas', onCanvasEvent);
    return () => document.removeEventListener('lyra:canvas', onCanvasEvent);
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
    const texto = (typeof textoDirecto === 'string' ? textoDirecto : opciones.message ?? mensaje).trim();
    const imagenDataUrl = opciones.skipUserAppend ? null : pendingImageDataUrl.value;
    if (!texto && !imagenDataUrl) return;

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
        onMessageEnd: (role, stopReason) => {
          // message end - could be used to show completion status
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
        onCompactionEnd: reason => {
          Toast().setStatus('');
        },
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
        // Serializa los bloques EN ORDEN cronológico real — mismo criterio
        // que message.content de pi, para que al recargar el chat se vea
        // exactamente en la secuencia en que pasó.
        const partes = assistantMessageRef.current.blocks.map(b => {
          if (b.tipo === 'thinking') return `[thinking]\n${b.contenido}\n[/thinking]`;
          if (b.tipo === 'text') return b.contenido;
          if (b.tipo === 'tool') {
            const call = `[tool_call:${b.name}]\n${b.argsFull || b.args}\n[/tool_call:${b.name}]`;
            if (b.output == null) return call;
            const abre = b.isError ? `[tool_result:${b.name}:error]` : `[tool_result:${b.name}]`;
            return `${call}\n${abre}\n${b.output}\n[/tool_result:${b.name}]`;
          }
          return '';
        });
        const contenidoFinal = partes.filter(Boolean).join('\n\n');
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
  }, [mensaje]);

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
    const texto = Array.from(files).find(f =>
      f.type.startsWith('text/') || /\.(txt|md|csv|json|js|py|sh|html|css)$/i.test(f.name));
    if (texto) {
      const reader = new FileReader();
      reader.onload = ev => {
        const t = ev.target.result;
        setMensaje(prev => `${prev}${prev ? '\n' : ''}\`\`\`\n${t.slice(0, 4000)}${t.length > 4000 ? '\n…(truncado)' : ''}\n\`\`\`\n`);
        Toast().show(`📄 ${texto.name} cargado`, 'success');
      };
      reader.readAsText(texto);
    }
  }, [cargarImagen]);

  const recargarCloudIframe = useCallback((url) => {
    const target = url || cloudUrl;
    const iframe = iframeRef.current;
    if (!target || !iframe) return;
    iframe.src = 'about:blank';
    setTimeout(() => { iframe.src = target; }, 50);
  }, [cloudUrl]);

  const toggleCloud = useCallback(() => {
    setCloudVisible(v => {
      const abriendo = !v;
      if (abriendo) {
        setCloudExpanded(false);
        setCloudHidden(false);
        requestAnimationFrame(() => recargarCloudIframe(cloudUrl));
      }
      Toast().show(abriendo ? '☁️ Cloud Backend activado' : '☁️ Cloud Backend desactivado', 'info', 2000);
      return abriendo;
    });
  }, [cloudUrl, recargarCloudIframe]);

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
    setCloudVisible(false);
    setCloudExpanded(false);
    setCloudHidden(false);
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

  const onChatScroll = useCallback(() => {
    setEnFondo(estaCercaDelFondo(chatRef.current));
  }, []);

  const visibleMessages = historialVal.filter(m => !m._internal);

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
          const rolLabel = msg.role === 'user'
            ? '👤 Tú'
            : esExterno
              ? `${AI_ICONOS[cloudAiId] || '☁'} ${AI_LABELS[cloudAiId] || 'AI ext'}`
              : '🦙 Lyra';

          if (msg.role === 'assistant') {
            const parsed = combinarPartesRicas(parsearMensajeRico(msg.content));
            return html`
              <div key=${idx} class="message assistant">
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
                <div class=${quickActionsClass}>
                  <button class=${actionChipClass} onClick=${() => copiarMensaje(msg.content)} title="Copiar al portapapeles">📋 Copiar</button>
                  <button class=${actionChipClass} onClick=${() => añadirANotas(msg.content)} title="Añadir a notas">✎ A notas</button>
                  <button class=${actionChipClass} onClick=${() => reformularRespuesta(regenerarRespuesta, msg)} title="Regenerar respuesta">↻ Regenerar</button>
                  <button class=${actionChipClass} onClick=${() => leerMensaje(msg.content)} title="Leer mensaje">🔊 Leer</button>
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
            <div key=${idx} class=${'message ' + msg.role + (esExternoFinal ? ' direct-ai' : '')}>
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

        ${cargandoVal && !streamingVal && !thinkingVal && html`
          <div class="message assistant loading">
            <div class="message-header"><span class="role">🦙 Lyra</span></div>
            <div class="message-content">
              <span class="typing-indicator">◌ Pensando…</span>
            </div>
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

      <div class=${'cloud-panel ' + (cloudExpanded ? 'expanded' : cloudHidden ? 'hidden-mode' : 'mini') + (cloudVisible ? '' : ' cloud-panel-hidden')}>
        ${!cloudExpanded && cloudVisible && html`
          <div class="cloud-mini-header">
            <span class="cloud-mini-label">☁ ${cloudAiLabel}</span>
            <div class="cloud-mini-actions">
              <button class="cloud-mini-btn" title="Expandir" onClick=${() => setCloudExpanded(true)}>⛶</button>
              <button class="cloud-mini-btn" title="Recargar" onClick=${() => recargarCloudIframe(cloudUrl)}>↺</button>
              <button class="cloud-mini-btn cloud-mini-btn--close" title="Cerrar" onClick=${closeCloud}>✕</button>
            </div>
          </div>
        `}
        <div class="cloud-panel-iframe-wrap" style="position:relative;">
          <iframe
            data-pane="cloud"
            src="about:blank"
            ref=${iframeRef}
            allow="clipboard-read; clipboard-write; microphone"
            title="Cloud Backend"
            tabIndex="-1"
          ></iframe>
          ${!cloudExpanded && html`
            <div
              class="cloud-panel-shield"
              onClick=${e => e.stopPropagation()}
              title="Cloud Backend en miniatura"
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
            class=${'btn-duo ' + controlBtnIdle}
            onClick=${() => Toast().show('⇄ Duo requiere la extensión de browser (FASE extensions)', 'warning', 2500)}
            title="Modo Duo — Lyra ↔ AI externo"
          >⇄ Duo</button>

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
                    disabled=${(!mensaje.trim() && !pendingImageDataUrlVal) || offline}
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
