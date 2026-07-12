import { setTab } from '../../store.js';
import { Toast } from '../shared/toast.js';
import { iconButtonClass, ICON_BTN_SQUARE } from '../shared/iconButton.js';

// ── SVG icons ────────────────────────────────────────────────
const SVG_CAMERA = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4.5C1 3.67 1.67 3 2.5 3h1.17L4.5 1.5h5l.83 1.5H11.5C12.33 3 13 3.67 13 4.5v6c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-6z"/><circle cx="7" cy="7.5" r="2"/></svg>`;

const SVG_PAGE = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="1" width="9" height="12" rx="1.5"/><line x1="5" y1="4.5" x2="9" y2="4.5"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="5" y1="9.5" x2="7.5" y2="9.5"/></svg>`;
import { escribirNota, NOTAS_ROOT, asegurarRaiz } from '../../modules/scratchpad/scripts/notas.js';

async function leerClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    Toast.show('No se pudo leer el portapapeles (permiso denegado)', 'error');
    return null;
  }
}

function tryParseJson(text) {
  try {
    return { ok: true, status: 'JSON válido detectado', formatted: JSON.stringify(JSON.parse(text), null, 2) };
  } catch {
    return { ok: false };
  }
}

function detectJson(raw) {
  const direct = tryParseJson(raw);
  if (direct.ok) return direct;
  const match = raw.match(/\{[\s\S]*\}/) || raw.match(/\[[\s\S]*\]/);
  if (match) {
    const extracted = tryParseJson(match[0]);
    if (extracted.ok) return { ...extracted, status: 'JSON extraído del texto' };
  }
  return { ok: false, status: 'No se encontró JSON válido', formatted: String(raw) };
}

async function abrirNotaScratchpad(nombre, contenido) {
  await asegurarRaiz();
  const path = `${NOTAS_ROOT}/${nombre}`;
  await escribirNota(path, contenido);
  setTab('scratchpad');
  return path;
}

async function aihubJsonDetective() {
  const raw = await leerClipboard();
  if (!raw) { Toast.show('Portapapeles vacío', 'warning'); return; }
  const result = detectJson(raw);
  const contenido = ['# JSON Detective', '', result.status, '', '```json', result.formatted, '```'].join('\n');
  await abrirNotaScratchpad(`json-detective-${Date.now()}.md`, contenido);
  Toast.show(result.status, result.ok ? 'success' : 'warning');
}

async function aihubLoadClipboard() {
  const text = await leerClipboard();
  if (!text) { Toast.show('Portapapeles vacío', 'warning'); return; }
  await abrirNotaScratchpad(`clipboard-${Date.now()}.md`, text);
  Toast.show(`Portapapeles cargado (${text.length} chars)`, 'success');
}

function aihubOpenAddLlm() {
  setTab('ajustes');
  Toast.show('Agregá tu LLM custom abajo en Ajustes', 'info');
}

function aihubInjectProtocol() {
  const frames = document.querySelectorAll('iframe[data-aurora-frame-id], iframe[data-pane]');
  if (!frames.length) { Toast.show('No hay iframes de LLM activos', 'warning'); return; }
  let count = 0;
  for (const iframe of frames) {
    try { iframe.contentWindow?.postMessage({ type: 'AURORA_INJECT_PROTOCOL' }, '*'); count++; } catch {}
  }
  if (count) Toast.show(`Señal enviada a ${count} iframe(s) — requiere la extensión para inyectar`, 'info');
  else Toast.show('Inject de protocolo requiere la extensión de browser', 'warning');
}

// ── Quick-capture desde footer ────────────────────────────────
async function quickScreenshot() {
  const bgReq = globalThis.__aurora_bgRequest;
  const enExt = globalThis.__aurora_enExtension?.value;
  if (!enExt || !bgReq) { Toast.show('Requiere extensión activa', 'warning'); return; }
  Toast.show('Capturando…', 'loading');
  try {
    const res = await bgReq({ type: 'VISUAL_OBSERVE_ACTIVE_TAB' });
    if (!res?.success || !res?.screenshot) throw new Error(res?.error || 'Sin imagen');
    const dataUrl = res.screenshot;
    // Copiar imagen al clipboard
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      Toast.show('Screenshot copiado', 'success');
    } catch {
      await navigator.clipboard.writeText(dataUrl);
      Toast.show('Screenshot (dataUrl) copiado', 'warning');
    }
    // Enviar al servidor
    fetch((globalThis.AURORA_BASE || 'http://localhost:7779') + '/ext/capture', {
      method: 'POST',
      headers: globalThis.AURORA_HDRS?.() || { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'screenshot', content: dataUrl, tab: res.tab || {}, ts: Date.now() }),
    }).catch(() => {});
  } catch (e) {
    Toast.show('Screenshot fallido: ' + e.message, 'error');
  }
}

async function quickCapturePage() {
  const bgReq = globalThis.__aurora_bgRequest;
  const enExt = globalThis.__aurora_enExtension?.value;
  if (!enExt || !bgReq) { Toast.show('Requiere extensión activa', 'warning'); return; }
  Toast.show('Capturando página…', 'loading');
  try {
    const res = await bgReq({ type: 'CAPTURE_ACTIVE_TAB' });
    if (!res?.success) throw new Error(res?.error || 'Sin contenido');
    const texto = res.data || '';
    await navigator.clipboard.writeText(texto);
    Toast.show(`Página copiada (${texto.length.toLocaleString()} chars)`, 'success');
  } catch (e) {
    Toast.show('Captura fallida: ' + e.message, 'error');
  }
}

export const ACCIONES_MODULO = [
  { id: 'aihub-add-llm', icon: '＋', title: 'Añadir LLM', onClick: aihubOpenAddLlm },
  { id: 'aihub-json-detective', icon: '{ }', title: 'JSON Detective', onClick: aihubJsonDetective },
  { id: 'aihub-load-clipboard', icon: '⊞', title: 'Cargar portapapeles a Notas', onClick: aihubLoadClipboard },
  { id: 'aihub-inject-protocol', icon: '@@', title: 'Enseñar protocolo @@ al LLM (requiere extensión)', onClick: aihubInjectProtocol },
];

function SvgBtn({ svg, title, onClick }) {
  const html = (...args) => globalThis.html(...args);
  return html`
    <button
      class=${iconButtonClass(false, ICON_BTN_SQUARE)}
      title=${title}
      onClick=${onClick}
      dangerouslySetInnerHTML=${{ __html: svg }}
    />
  `;
}

export const ACCIONES_CAPTURA_RAPIDA = [
  {
    id: 'quick-screenshot',
    title: 'Screenshot rápido',
    component: ({ action }) => {
      const html = (...args) => globalThis.html(...args);
      return html`<${SvgBtn} svg=${SVG_CAMERA} title=${action.title} onClick=${action.onClick} />`;
    },
    onClick: quickScreenshot,
  },
  {
    id: 'quick-capture',
    title: 'Capturar página',
    component: ({ action }) => {
      const html = (...args) => globalThis.html(...args);
      return html`<${SvgBtn} svg=${SVG_PAGE} title=${action.title} onClick=${action.onClick} />`;
    },
    onClick: quickCapturePage,
  },
];
