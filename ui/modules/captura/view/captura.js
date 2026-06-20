const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useCallback, useRef, useMemo } = globalThis.preactHooks;

import {
  getActiveTab, capturarTexto, capturarScreenshot,
  capturarYoutube,
  resumirTranscript, puntosClave, traducirTranscript, notasEstudio,
  inyectarTextoEnAI,
} from '../scripts/bridge.js';
import { historialCaptura, cargarHistorialCaptura, agregarAlHistorial } from '../scripts/historial.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { Toast } from '../../../components/shared/toast.js';
import {
  Button,
  Chip,
  ChipGroup,
  Dropdown,
  DropdownItem,
  List,
  ListItem,
  ListActions,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  Status,
  Textarea,
} from '../../../components/index.js';
import { renderMarkdown } from '../../../modules/md-reader/scripts/parser.js';
import { extractTimestamps, jumpToTimestamp, searchMatches, classifyUrl } from './transcript-utils.js';
import { ToolResultPanel } from './tool-result-panel.js';
import { Historial } from './historial-panel.js';

// ── Chips de tab ─────────────────────────────────────────────
function TabChips({ tab, tipo }) {
  if (!tab) return null;
  let dominio = '';
  try { dominio = new URL(tab.url).hostname.replace('www.', ''); } catch {}
  const chipTipo = tipo === 'youtube-video'
    ? html`<${Chip} variant="yt">🎬 YouTube</${Chip}>`
    : tipo === 'youtube'
    ? html`<${Chip} variant="yt">▶ YouTube</${Chip}>`
    : html`<${Chip} variant="accent">🌐 Web</${Chip}>`;
  return html`
    <${ChipGroup}>
      ${chipTipo}
      ${dominio && html`<${Chip} variant="muted">${dominio}</${Chip}>`}
      ${tab.title && html`<${Chip} variant="dim" title=${tab.url}>${tab.title.slice(0, 32)}${tab.title.length > 32 ? '…' : ''}</${Chip}>`}
    </${ChipGroup}>
  `;
}

// ── Zona de acción según tipo de página ──────────────────────
function ActionZone({ tipo, busy, conExt, onCapturarPagina, onCapturarPantalla, onCapturarYT, onExtraerTextoDOM, ytOpen, setYtOpen }) {
  if (!conExt) return null;

  const shared = html`
    <div class="flex gap-2">
      <${Button} size="sm" disabled=${busy} onClick=${onExtraerTextoDOM}>📄 DOM</${Button}>
      <${Button} size="sm" disabled=${busy} onClick=${onCapturarPantalla}>📷 Screenshot</${Button}>
    </div>
  `;

  if (tipo === 'youtube-video') return html`
    <div class="flex flex-col gap-2">
      <div class="relative">
        <${Button} variant="primary" disabled=${busy} onClick=${() => setYtOpen(!ytOpen)} class="w-full justify-between">
          <span>🎬 Extraer transcripción</span>
          <span class="text-[9px] opacity-60">${ytOpen ? '▲' : '▼'}</span>
        </${Button}>
        <${Dropdown} open=${ytOpen}>
          ${YOUTUBE_TIPOS.map(t => html`
            <${DropdownItem} key=${t.id} onClick=${() => onCapturarYT(t.id)}>${t.label}</${DropdownItem}>
          `)}
        </${Dropdown}>
      </div>
      ${shared}
    </div>
  `;

  if (tipo === 'youtube') return html`
    <div class="flex flex-col gap-2">
      <div class="rounded-md border border-aurora-warning/20 bg-aurora-warning/10 px-3 py-2 text-center text-[10px] text-aurora-warning">
        Abrí un video para extraer transcripción
      </div>
      ${shared}
    </div>
  `;

  return html`
    <div class="flex flex-col gap-2">
      <${Button} variant="primary" disabled=${busy} onClick=${onCapturarPagina}>📄 Capturar página</${Button}>
      ${shared}
    </div>
  `;
}

const YOUTUBE_TIPOS = [
  { id: 'withoutTimestamps', label: '📝 Sin timestamps'   },
  { id: 'withTimestamps',    label: '🕐 Con timestamps'   },
  { id: 'markdown',          label: '✍ Markdown'          },
  { id: 'fullPage',          label: '📋 Página completa'  },
  { id: 'commentsOnly',      label: '💬 Solo comentarios' },
  { id: 'pageNoTranscript',  label: 'ℹ Solo detalles'     },
];

// ── Barra de búsqueda en transcript ──────────────────────────
function TranscriptSearchBar({ content, matches, matchIndex, query, onQueryChange, onNavigate }) {
  if (!content) return null;
  const hasMatches = matches && matches.length > 0;

  return html`
    <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-aurora-border bg-aurora-surface">
      <input
        type="text"
        class="flex-1 bg-aurora-surface-2 border border-aurora-border rounded-md px-2 py-1 text-xs text-aurora-text placeholder-aurora-text-dim outline-none focus:border-aurora-accent transition-colors"
        placeholder="Buscar en transcript…"
        value=${query}
        onInput=${(e) => onQueryChange(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onNavigate(e.shiftKey ? -1 : 1);
          }
        }}
      />
      ${hasMatches && html`
        <span class="text-[10px] text-aurora-text-muted whitespace-nowrap">${matchIndex + 1}/${matches.length}</span>
      `}
      <${Button} size="sm" disabled=${!hasMatches} onClick=${() => onNavigate(-1)}>◀</${Button}>
      <${Button} size="sm" disabled=${!hasMatches} onClick=${() => onNavigate(1)}>▶</${Button}>
    </div>
  `;
}

// ── Panel de capítulos detectados ────────────────────────────
function ChapterPanel({ chapters, isOpen, onToggle, onJump }) {
  if (!chapters || chapters.length === 0) return null;

  return html`
    <${Panel}>
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-aurora-text-muted transition-colors hover:bg-aurora-surface-hover"
        onClick=${onToggle}
      >
        <span>📑 Capítulos detectados</span>
        <span class="rounded-full bg-aurora-accent/15 px-2 py-0.5 text-[9px] font-bold text-aurora-accent">${chapters.length}</span>
        <span class="ml-auto text-[9px] opacity-50">${isOpen ? '▲' : '▼'}</span>
      </button>
      ${isOpen && html`
        <${PanelBody} noPadding class="p-1 max-h-[200px] overflow-y-auto">
          <${List}>
            ${chapters.map(ch => html`
              <${ListItem}
                name=${ch.title}
                sub=${ch.timestamp}
                onClick=${() => onJump(ch.timestamp)}
              >
                <span class="text-[9px] text-aurora-text-dim">${Math.floor(ch.seconds/60)}:${String(ch.seconds%60).padStart(2,'0')}</span>
              </${ListItem}>
            `)}
          </${List}>
        </${PanelBody}>
      `}
    </${Panel}>
  `;
}

// ── Toolbar de herramientas LLM ──────────────────────────────
function ToolbarHerramientas({ isYT, onResumir, onPuntos, onNotas, onTraducir, onSendChat, busy }) {
  return html`
    <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-aurora-border bg-aurora-surface flex-wrap">
      ${isYT && html`<span class="text-[9px] text-aurora-text-muted uppercase tracking-wide mr-1">Herramientas:</span>`}
      ${isYT && html`
        <${Button} size="sm" disabled=${busy} onClick=${onResumir}>🤖 Resumir</${Button}>
        <${Button} size="sm" disabled=${busy} onClick=${onPuntos}>📌 Puntos clave</${Button}>
        <${Button} size="sm" disabled=${busy} onClick=${onNotas}>📝 Notas estudio</${Button}>
        <${Button} size="sm" disabled=${busy} onClick=${onTraducir}>🌐 Traducir</${Button}>
      `}
      <span class="text-aurora-border"></span>
      <${Button} size="sm" onClick=${onSendChat}>💬 Enviar al chat</${Button}>
    </div>
  `;
}

// ── Resultado texto con toolbar ──────────────────────────────
function ResultadoTexto({ content, onChange, onCopy, onClear, tipoCaptura, toolResult, setToolResult, onSendChat, toolFollowUps, onAskFollowUp, chatBusy, chatStreaming, chatCurrentQuestion, onClearToolFollowUps, screenshotDataUrl, tabUrl }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [collapsed, setCollapsed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [traducirOpen, setTraducirOpen] = useState(false);
  const [traducirIdioma, setTraducirIdioma] = useState('inglés');
  const textareaRef = useRef(null);
  const toolResultRef = useRef('');

  const chapters = extractTimestamps(content);
  const renderedHtml = useMemo(() => content ? renderMarkdown(content, 'preview.md').html : '', [content]);

  useEffect(() => {
    if (!searchQuery) {
      setMatches([]);
      setMatchIndex(-1);
      return;
    }
    setMatches(searchMatches(content, searchQuery));
    setMatchIndex(0);
  }, [searchQuery, content]);

  const navigateMatch = (direction) => {
    if (matches.length === 0) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(matches[next].start, matches[next].end);
    }
  };

  const handleJump = (timestampStr) => {
    jumpToTimestamp(content, timestampStr, tabUrl);
  };

  const handleSearch = (q) => {
    setSearchQuery(q);
    if (q) {
      textareaRef.current?.focus();
    }
  };

  const copyToolResult = async () => {
    if (toolResult) {
      await copiarTexto(toolResult);
      Toast.show('Copiado', 'success');
    }
  };

  const clearToolResult = () => { setToolResult(null); onClearToolFollowUps?.(); };

  // Detectar si es transcript de YouTube por el contenido
  const isYTTranscript = tipoCaptura?.startsWith('yt:') || content.includes('TRANSCRIPCIÓN') || content.includes('Transcripción');

  // Extraer título del video del contenido
  function extraerTitulo() {
    const m = content.match(/(?:Título|Titulo):?\s*(.+)/i);
    return m ? m[1].trim().slice(0, 80) : '';
  }

  const ejecutarHerramienta = async (fn, nombre) => {
    setLlmBusy(true);
    setToolResult(null);
    onClearToolFollowUps?.();
    toolResultRef.current = '';
    Toast.show(`Procesando con Gemita…`, 'info');
    try {
      const titulo = extraerTitulo();
      const resultado = await fn(content, titulo, (acumulado) => {
        setToolResult(acumulado);
      });
      setToolResult(resultado);
      Toast.show(`${nombre} listo`, 'success');
    } catch (e) {
      Toast.show(`${nombre} fallido: ${e.message}`, 'error');
    } finally {
      setLlmBusy(false);
      setTraducirOpen(false);
    }
  };

  const handleResumir = () => ejecutarHerramienta(resumirTranscript, 'Resumen');
  const handlePuntos = () => ejecutarHerramienta(puntosClave, 'Puntos clave');
  const handleNotas = () => ejecutarHerramienta(notasEstudio, 'Notas');
  const handleTraducir = () => {
    if (!traducirIdioma) {
      Toast.show('Especificá un idioma', 'warning');
      return;
    }
    ejecutarHerramienta((t, titulo, onStream) => traducirTranscript(t, traducirIdioma, titulo, onStream), `Traducción a ${traducirIdioma}`);
  };

  return html`
    <${Panel}>
      <${PanelHeader}>
        <button
          type="button"
          class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-aurora-text-dim hover:text-aurora-text transition-colors"
          onClick=${() => setCollapsed(c => !c)}
        >
          <span class="text-[9px] opacity-50 transition-transform ${collapsed ? '' : 'rotate-90'}">▶</span>
          ${isYTTranscript ? 'Transcripción' : 'Texto capturado'}
          <span class="text-[9px] font-normal opacity-40">${content.length.toLocaleString()} chars</span>
        </button>
        <${ListActions}>
          ${!collapsed && html`<${Button} size="sm" onClick=${() => setPreview(p => !p)}>${preview ? '📝' : '👁'}</${Button}>`}
          ${!collapsed && html`<${Button} size="sm" onClick=${onCopy}>📋 Copiar</${Button}>`}
          <${Button} size="sm" onClick=${onClear}>✕</${Button}>
        </${ListActions}>
      </${PanelHeader}>

      ${!collapsed && html`
        <${TranscriptSearchBar}
          content=${content}
          matches=${matches}
          matchIndex=${matchIndex}
          query=${searchQuery}
          onQueryChange=${handleSearch}
          onNavigate=${navigateMatch}
        />

        <${ToolbarHerramientas}
          isYT=${isYTTranscript}
          onResumir=${handleResumir}
          onPuntos=${handlePuntos}
          onNotas=${handleNotas}
          onTraducir=${() => setTraducirOpen(!traducirOpen)}
          onSendChat=${onSendChat}
          busy=${llmBusy}
        />

        ${traducirOpen && html`
          <div class="flex items-center gap-2 px-3 py-2 border-b border-aurora-border bg-aurora-surface">
            <input
              type="text"
              class="flex-1 bg-aurora-surface-2 border border-aurora-border rounded-md px-2 py-1 text-xs text-aurora-text placeholder-aurora-text-dim outline-none focus:border-aurora-accent transition-colors"
              placeholder="Ej: inglés, portugués, francés…"
              value=${traducirIdioma}
              onInput=${(e) => setTraducirIdioma(e.target.value)}
              onKeyDown=${(e) => { if (e.key === 'Enter') handleTraducir(); }}
            />
            <${Button} size="sm" disabled=${llmBusy} onClick=${handleTraducir}>Traducir</${Button}>
            <${Button} size="sm" onClick=${() => setTraducirOpen(false)}>✕</${Button}>
          </div>
        `}

        ${preview ? html`
          <${PanelBody} noPadding class="overflow-y-auto">
            <div class="markdown-body p-3 text-[11px] leading-relaxed" dangerouslySetInnerHTML=${{ __html: renderedHtml }} />
          </${PanelBody}>
        ` : html`
          <${PanelBody} noPadding class="overflow-y-auto">
            <${Textarea}
              ref=${textareaRef}
              class="min-h-[80px] resize-y border-0 rounded-none bg-transparent p-3 text-[11px] leading-relaxed"
              value=${content}
              onInput=${e => onChange(e.target.value)}
              placeholder="El texto capturado aparecerá aquí…"
            />
          </${PanelBody}>
        `}

        <${PanelFooter}>
          ${isYTTranscript && html`
            <${Button} size="sm" onClick=${() => setShowChapters(!showChapters)}>
              📑 Capítulos${chapters.length > 0 ? ` (${chapters.length})` : ''}
            </${Button}>
          `}
          ${llmBusy && html`
            <span class="text-[9px] text-aurora-text-dim animate-pulse">Procesando con Gemita…</span>
          `}
        </${PanelFooter}>
      `}
    </${Panel}>

    ${showChapters && chapters.length > 0 && html`
      <${ChapterPanel}
        chapters=${chapters}
        isOpen=${chaptersOpen}
        onToggle=${() => setChaptersOpen(o => !o)}
        onJump=${handleJump}
      />
    `}

    ${toolResult && html`
      <${ToolResultPanel}
        result=${toolResult}
        onCopy=${copyToolResult}
        onClose=${clearToolResult}
        followUps=${toolFollowUps}
        onAskFollowUp=${onAskFollowUp}
        chatBusy=${chatBusy}
        chatStreaming=${chatStreaming}
        chatCurrentQuestion=${chatCurrentQuestion}
        screenshotDataUrl=${screenshotDataUrl}
      />
    `}
  `;
}

// ── Resultado screenshot ──────────────────────────────────────
function ResultadoScreenshot({ dataUrl, onCopiar, onAbrir, onExtraerTexto, onLimpiar, ocrBusy }) {
  return html`
    <${Panel}>
      <${PanelHeader}>
        <span class="text-[10px] font-bold uppercase tracking-wide text-aurora-text-dim">Screenshot</span>
        <${ListActions}>
          <${Button} size="sm" onClick=${onCopiar}>📋 Copiar</${Button}>
          <${Button} size="sm" onClick=${onAbrir}>🔗 Abrir</${Button}>
          <${Button} size="sm" disabled=${ocrBusy} onClick=${onExtraerTexto}>${ocrBusy ? '⏳ OCR…' : '🔍 OCR'}</${Button}>
          <${Button} size="sm" onClick=${onLimpiar}>✕</${Button}>
        </${ListActions}>
      </${PanelHeader}>
      <${PanelBody} noPadding class="p-2">
        <img src=${dataUrl} alt="screenshot" class="block h-auto w-full rounded-md" />
      </${PanelBody}>
    </${Panel}>
  `;
}

// ── Vista principal ───────────────────────────────────────────
export default function Captura() {
  const [conExt, setConExt]     = useState(globalThis.__aurora_enExtension?.value === true);
  const [tab, setTab]           = useState(null);
  const [tipoTab, setTipoTab]   = useState('desconocido');
  const [status, setStatus]     = useState({ msg: 'Iniciando…', tipo: 'loading' });
  const [preview, setPreview]   = useState(null);
  const [content, setContent]   = useState('');
  const [toolResult, setToolResult] = useState(null);
  const [busy, setBusy]         = useState(false);
  const [ytOpen, setYtOpen]     = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [tipoCaptura, setTipoCaptura] = useState('');
  const [debugData, setDebugData] = useState(null);
  const sseRef                  = useRef(null);

  useEffect(() => {
    cargarHistorialCaptura();
    const sig = globalThis.__aurora_enExtension;
    return sig ? sig.subscribe(val => setConExt(val)) : undefined;
  }, []);

  function applyTab(t) {
    if (!t || !t.url) return;
    const tipo = t.tipo || classifyUrl(t.url).tipo;
    setTab(t);
    setTipoTab(tipo);
    const esYT = tipo.startsWith('youtube');
    setStatus({
      msg:  esYT ? '🎬 YouTube detectado' : '🌐 ' + (t.title?.slice(0, 40) || t.url?.slice(0, 40) || 'Página web'),
      tipo: 'success',
    });
  }

  useEffect(() => {
    if (!conExt) {
      setStatus({ msg: 'Sin extensión — funciones limitadas', tipo: 'warning' });
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      return;
    }
    setStatus({ msg: 'Conectando…', tipo: 'loading' });
    const sse = new EventSource('/ext/tab-stream');
    sseRef.current = sse;
    sse.onmessage = (e) => {
      try { const t = JSON.parse(e.data); if (t?.url) applyTab(t); } catch {}
    };
    sse.onerror = () => { getActiveTab().then(applyTab).catch(() => {}); };
    return () => { sse.close(); sseRef.current = null; };
  }, [conExt]);

  const wrap = useCallback(async (fn, tipoCap) => {
    setBusy(true); setPreview(null); setContent(''); setToolResult(null);
    setStatus({ msg: 'Procesando…', tipo: 'loading' });
    try {
      const result = await fn();
      const texto = typeof result === 'string' ? result : result?.text || result?.data || '';
      setContent(texto);
      setTipoCaptura(tipoCap);
      await copiarTexto(texto);
      setStatus({ msg: `✓ ${texto.length.toLocaleString()} chars copiados`, tipo: 'success' });
      Toast.show('Copiado al portapapeles', 'success');
      await agregarAlHistorial({ tipo: tipoCap, title: tab?.title || '', url: tab?.url || '', content: texto });
    } catch (e) {
      setStatus({ msg: `Error: ${e.message}`, tipo: 'error' });
      Toast.show(e.message, 'error');
    } finally { setBusy(false); }
  }, [tab]);

  const capturarPagina = () => wrap(capturarTexto, 'página');

  const capturarYT     = async (tipo) => {
    setYtOpen(false); setBusy(true); setPreview(null); setContent(''); setToolResult(null);
    setStatus({ msg: 'Verificando transcript...', tipo: 'loading' });
    try {
      if (conExt && tab?.id) {
        const fn = globalThis.__aurora_bgRequest;
        if (fn) {
          try { await fn({ type: 'CHECK_YT_CS' }); } catch(_) {}
        }
      }
      setBusy(true); setStatus({ msg: 'Extrayendo transcript...', tipo: 'loading' });
      const result = await capturarYoutube(tipo);
      setContent(result);
      setTipoCaptura(`yt:${tipo}`);
      await copiarTexto(result);
      setStatus({ msg: `✓ ${result.length.toLocaleString()} chars copiados`, tipo: 'success' });
      Toast.show('Copiado al portapapeles', 'success');
      await agregarAlHistorial({ tipo: `yt:${tipo}`, title: tab?.title || '', url: tab?.url || '', content: result });
    } catch (e) {
      setStatus({ msg: `Error: ${e.message}`, tipo: 'error' });
      Toast.show(e.message, 'error');
    } finally { setBusy(false); }
  };

  const capturarPantalla = useCallback(async () => {
    setBusy(true); setPreview(null); setContent(''); setToolResult(null);
    setStatus({ msg: 'Capturando…', tipo: 'loading' });
    try {
      const r = await capturarScreenshot();
      const dataUrl = r?.dataUrl || '';
      if (!dataUrl) throw new Error('No se obtuvo imagen');
      setPreview(dataUrl);
      await agregarAlHistorial({ tipo: 'screenshot', title: r?.tab?.title || tab?.title || '', url: r?.tab?.url || tab?.url || '', content: '' });
      setStatus({ msg: '📷 Screenshot capturado', tipo: 'success' });
      Toast.show('Screenshot guardado', 'success');
    } catch (e) {
      setStatus({ msg: `Error: ${e.message}`, tipo: 'error' });
      Toast.show(e.message, 'error');
    } finally { setBusy(false); }
  }, [tab]);

  const extraerTextoDePagina = useCallback(async () => {
    setStatus({ msg: 'Extrayendo texto del DOM…', tipo: 'loading' });
    try {
      const r = await capturarTexto();
      const texto = r?.text || '';
      if (!texto) throw new Error('No se obtuvo texto de la página');
      setContent(texto);
      setTipoCaptura('pagina');
      setStatus({ msg: `✓ ${texto.length.toLocaleString()} chars extraídos`, tipo: 'success' });
      Toast.show('Texto extraído del DOM', 'success');
    } catch (e) {
      setStatus({ msg: `Error: ${e.message}`, tipo: 'error' });
      Toast.show(e.message, 'error');
    }
  }, []);

  const [ocrBusy, setOcrBusy] = useState(false);
  const hacerOCR = useCallback(async () => {
    if (!preview) return;
    setOcrBusy(true);
    setStatus({ msg: '🔍 OCR en progreso…', tipo: 'loading' });
    try {
      const res = await fetch('/tools/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: preview }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error en OCR');
      const texto = (data.text || '').trim();
      if (!texto) throw new Error('No se detectó texto en la imagen');
      setContent(texto);
      setTipoCaptura('screenshot');
      setStatus({ msg: `✓ OCR: ${texto.length.toLocaleString()} chars`, tipo: 'success' });
      Toast.show('Texto extraído vía OCR', 'success');
    } catch (e) {
      setStatus({ msg: `Error OCR: ${e.message}`, tipo: 'error' });
      Toast.show(e.message, 'error');
    } finally {
      setOcrBusy(false);
    }
  }, [preview]);

  const hacerDebugYT = useCallback(async () => {
    if (!conExt) { Toast.show('Requiere extensión activa', 'warning'); return; }
    setDebugData(null);
    setStatus({ msg: '🔍 Debuggeando...', tipo: 'loading' });
    try {
      const fn = globalThis.__aurora_bgRequest;
      if (!fn) throw new Error('ext-bridge no disponible');
      if (!tab?.id) throw new Error('No hay pestaña activa');

      const pageType = tipoTab === 'youtube-video' ? 'DEBUG_YOUTUBE' : 'DEBUG_EXT';
      const [pageRes, sideRes] = await Promise.all([
        fn({ type: pageType, tabId: tab.id }),
        fn({ type: 'DEBUG_SIDEPANEL' }),
      ]);

      const data = {
        page: pageRes?.debug || { steps: [{ ok: false, label: 'page', detail: pageRes?.error || 'sin datos' }] },
        sidepanel: sideRes?.debug || { steps: [{ ok: false, label: 'sidepanel', detail: sideRes?.error || 'sin datos' }] },
      };
      setDebugData(data);
      setStatus({ msg: '🔍 Debug completo', tipo: 'success' });
    } catch (e) {
      setStatus({ msg: `🔍 Debug error: ${e.message}`, tipo: 'error' });
      Toast.show(e.message, 'error');
    }
  }, [conExt, tipoTab, tab]);

  const copiarImagen = async () => {
    if (!preview) return;
    try {
      const blob = await (await fetch(preview)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      Toast.show('Imagen copiada', 'success');
    } catch {
      await copiarTexto(preview);
      Toast.show('Copiado como dataUrl', 'warning');
    }
  };

  const abrirImagen = () => {
    if (!preview) return;
    const w = window.open(); w.document.write(`<img src="${preview}" style="max-width:100%">`);
  };

  const [toolFollowUps, setToolFollowUps] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStreaming, setChatStreaming] = useState('');
  const [chatCurrentQuestion, setChatCurrentQuestion] = useState('');

  const handleAskFollowUp = useCallback(async (question, imageUrl) => {
    setChatBusy(true);
    setChatStreaming('');
    setChatCurrentQuestion(question);
    try {
      const { sendToGemita } = await import('../../../components/shared/gemita-ws.js');
      const context = `Tengo el siguiente resultado de análisis:\n\n${toolResult}\n\nBasándote en eso, respondé: ${question}`;
      let answer = '';
      await sendToGemita({
        message: context,
        images: imageUrl ? [imageUrl] : undefined,
        system: 'Respondé la pregunta del usuario basándote exclusivamente en el resultado del análisis proporcionado. Sé conciso y directo.',
        onToken: (token) => {
          answer += token;
          setChatStreaming(answer);
        },
      });
      setToolFollowUps(prev => [...prev, { question, answer }]);
    } catch (e) {
      setToolFollowUps(prev => [...prev, { question, answer: `Error: ${e.message}` }]);
      Toast.show(e.message, 'error');
    } finally {
      setChatBusy(false);
      setChatStreaming('');
      setChatCurrentQuestion('');
    }
  }, [toolResult]);

  const handleHistorialSelect = async (item) => {
    setContent(item.contenido);
    setTipoCaptura(item.tipo);
    setToolResult(null);
    setToolFollowUps([]);
    setStatus({ msg: `📄 ${item.titulo || item.url}`, tipo: 'success' });
  };

  const enviarAlChat = async (platform) => {
    if (!content) { Toast.show('No hay contenido para enviar', 'warning'); return; }
    if (!globalThis.__aurora_enExtension?.value) { Toast.show('Requiere extensión activa', 'warning'); return; }
    try {
      const tabId = tab?.id;
      if (!tabId) { Toast.show('No hay pestaña activa', 'warning'); return; }
      const titulo = extraerTitulo();
      const texto = `${titulo ? 'Video: ' + titulo + '\n\n' : ''}${content}`;
      await inyectarTextoEnAI(tabId, texto);
      Toast.show(`Texto inyectado en ${platform}`, 'success');
    } catch (e) {
      Toast.show(`Error: ${e.message}`, 'error');
    }
  };

  const statusCls = { success: 'ok', warning: 'warn', error: 'err', loading: 'loading' }[status.tipo] ?? 'loading';

  return html`
    <div class="flex flex-1 min-h-0 flex-col p-3 gap-2">
      <${Status} tone=${statusCls}>${status.msg}</${Status}>

      <${TabChips} tab=${tab} tipo=${tipoTab} />

      <${ActionZone}
        tipo=${tipoTab}
        busy=${busy}
        conExt=${conExt}
        onCapturarPagina=${capturarPagina}
        onCapturarPantalla=${capturarPantalla}
        onCapturarYT=${capturarYT}
        onExtraerTextoDOM=${extraerTextoDePagina}
        ytOpen=${ytOpen}
        setYtOpen=${setYtOpen}
      />

      ${conExt && html`
        <button
          class="flex items-center gap-1 px-2 py-1 text-[9px] text-aurora-text-dim border border-aurora-border rounded-md hover:bg-aurora-surface-hover transition-colors self-start"
          onClick=${hacerDebugYT}
        >🔍 Debug ${tipoTab === 'youtube-video' ? 'YouTube' : 'Ext'}</button>
      `}

      ${debugData && html`
        <${Panel}>
          <${PanelHeader}>
            <span class="text-[9px] font-bold uppercase tracking-wide text-aurora-text-dim">🔍 Debug</span>
            <${Button} size="sm" onClick=${() => setDebugData(null)}>✕</${Button}>
          </${PanelHeader}>
          <${PanelBody} noPadding>
            <pre class="max-h-[300px] overflow-y-auto p-2 text-[10px] leading-relaxed font-mono text-aurora-text">${JSON.stringify(debugData, null, 2)}</pre>
          </${PanelBody}>
        </${Panel}>
      `}

      <div class="flex-1 min-h-0 overflow-y-auto">
        ${preview && html`
          <${ResultadoScreenshot}
            dataUrl=${preview}
            onCopiar=${copiarImagen}
            onAbrir=${abrirImagen}
            onExtraerTexto=${hacerOCR}
            onLimpiar=${() => setPreview(null)}
            ocrBusy=${ocrBusy}
          />
        `}

        ${content && html`
          <${ResultadoTexto}
            content=${content}
            onChange=${setContent}
            onCopy=${async () => { await copiarTexto(content); Toast.show('Copiado', 'success'); }}
            onClear=${() => { setContent(''); setTipoCaptura(''); setToolResult(null); setToolFollowUps([]); }}
            tipoCaptura=${tipoCaptura}
            toolResult=${toolResult}
            setToolResult=${setToolResult}
            onSendChat=${() => enviarAlChat('AI Chat')}
            toolFollowUps=${toolFollowUps}
            onAskFollowUp=${handleAskFollowUp}
            chatBusy=${chatBusy}
            chatStreaming=${chatStreaming}
            chatCurrentQuestion=${chatCurrentQuestion}
            onClearToolFollowUps=${() => setToolFollowUps([])}
            screenshotDataUrl=${preview}
            tabUrl=${tab?.url}
          />
        `}

        <${Historial} open=${histOpen} onToggle=${() => setHistOpen(o => !o)} onSelectItem=${handleHistorialSelect} />

        ${!conExt && html`
          <${Panel} class="text-center">
            <${PanelBody}>
              <div class="text-[11px] text-aurora-text-muted">
                Cargá Aurora desde la extensión Chrome para acceder a capturas de pestaña.
              </div>
              <code class="font-mono text-[10px] text-aurora-accent">aurora/extensions/aihub</code>
            </${PanelBody}>
          </${Panel}>
        `}
      </div>
    </div>
  `;
}
