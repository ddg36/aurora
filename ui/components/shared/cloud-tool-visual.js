// Lenguaje visual compartido para tools de Lyra, Cloud y Duo.
// Importante: detectar un borrador sólo cambia la UI. La ejecución sigue
// dependiendo del parser estricto de cada motor y de un JSON completo válido.

const html = (...args) => globalThis.html(...args);

const ICONOS = { read: '◫', bash: '›_', edit: '✎', write: '＋', panel_send: '⇢', forge_submit: '⚒', view_describe: '⌘', view_invoke: '⌁' };
const FASES = {
  preparing: ['Preparando', 'text-sky-300', 'bg-sky-400'],
  ready: ['Lista', 'text-violet-300', 'bg-violet-400'],
  running: ['Ejecutando', 'text-amber-300', 'bg-amber-400'],
  success: ['Completada', 'text-emerald-300', 'bg-emerald-400'],
  error: ['Error', 'text-red-300', 'bg-red-400'],
};

function valorParcial(texto, clave) {
  const m = texto.match(new RegExp(`"${clave}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 's'));
  if (!m) return '';
  try { return JSON.parse(`"${m[1].replace(/"$/, '')}"`); } catch { return m[1].replace(/\\n/g, '↵ '); }
}

export function detectarToolDraft(texto = '') {
  // Algunos proveedores muestran el label visual `JSON` sin fence antes del
  // objeto ("JSON{...}"). Sigue siendo sólo una pista de renderizado.
  const inicio = texto.search(/(?:^|```(?:json|pitool)?\s*)(?:json\s*)?\{?\s*"tool"\s*:/i);
  if (inicio < 0) return null;
  const tramo = texto.slice(inicio);
  const tool = tramo.match(/"tool"\s*:\s*"([^"\\]{1,32})/i)?.[1]?.toLowerCase();
  if (!tool) return { tool: 'tool', status: 'preparing', summary: 'Leyendo solicitud…' };
  const path = valorParcial(tramo, 'path');
  const command = valorParcial(tramo, 'cmd');
  const content = valorParcial(tramo, 'content');
  const to = valorParcial(tramo, 'to');
  const message = valorParcial(tramo, 'message');
  let completa = false;
  const idx = tramo.search(/\{\s*"tool"/);
  if (idx >= 0) {
    let depth = 0, str = false, esc = false;
    for (const ch of tramo.slice(idx)) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { str = !str; continue; }
      if (str) continue;
      if (ch === '{') depth++;
      if (ch === '}' && --depth === 0) { completa = true; break; }
    }
  }
  const summary = tool === 'panel_send'
    ? `→ ${to || 'panel'}${message ? ` · ${message.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`
    : tool === 'forge_submit'
    ? `${valorParcial(tramo, 'name') || 'Paquete Forge'} · validando contrato y código`
    : tool === 'view_describe' || tool === 'view_invoke'
    ? `${valorParcial(tramo, 'view') || 'vista'}${valorParcial(tramo, 'action') ? ` · ${valorParcial(tramo, 'action')}` : ''}`
    : path || command || (content ? `${content.length.toLocaleString()} caracteres recibidos` : 'Recibiendo argumentos…');
  return { tool, status: completa ? 'ready' : 'preparing', path, command, size: content.length, summary };
}

export function toolVisual({ tool, args = {}, status = 'running', result, error, paneId, quien, runId } = {}) {
  const fallo = error || result?.is_error || result?.ok === false;
  const path = args.path || '';
  return {
    tool: tool || 'tool', args, path, command: args.cmd || '', paneId, quien, runId,
    size: typeof args.content === 'string' ? args.content.length : 0,
    summary: tool === 'panel_send'
      ? `→ ${args.to || 'panel'} · ${String(args.message || '').replace(/\s+/g, ' ').slice(0, 120)}`
      : tool === 'forge_submit'
      ? `${args.manifest?.name || 'Paquete Forge'}@${args.manifest?.version || '?'}`
      : tool === 'view_describe' || tool === 'view_invoke'
      ? `${args.view || 'Aurora'}${args.action ? ` · ${args.action}` : ''}`
      : '',
    status: fallo ? 'error' : status,
    output: error || result?.output || result?.error || '',
    artifact: !fallo && status === 'success' && path && (tool === 'write' || tool === 'edit') ? { path, type: extension(path) } : null,
  };
}

function extension(path = '') {
  const name = path.split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : 'file';
}

export function emitirToolVisual(detail) {
  const visual = { id: detail.id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), ...detail };
  window.dispatchEvent(new CustomEvent('aurora:tool-visual', { detail: visual }));
  return visual;
}

export function abrirArtefacto(artifact) {
  if (!artifact?.path) return;
  const detail = { ...artifact, type: artifact.type || extension(artifact.path) };
  window.dispatchEvent(new CustomEvent('aurora:artifact-open', { detail }));
  document.dispatchEvent(new CustomEvent('lyra:canvas', { detail: { path: detail.path, lang: detail.type, tab: detail.type === 'html' ? 'preview' : 'codigo' } }));
}

export function ToolVisualCard({ visual, compact = false }) {
  if (!visual) return null;
  const status = visual.status || 'preparing';
  const [fase, tone, dot] = FASES[status] || FASES.preparing;
  const path = visual.path || visual.args?.path;
  const command = visual.command || visual.args?.cmd;
  const detalle = path || command || visual.summary || (visual.size ? `${visual.size.toLocaleString()} caracteres` : 'Preparando argumentos…');
  const artifact = visual.artifact || ((status === 'success' && path && ['write', 'edit'].includes(visual.tool)) ? { path, type: extension(path) } : null);
  return html`
    <div class=${`relative overflow-hidden rounded-xl border bg-black/25 shadow-sm ${status === 'error' ? 'border-red-400/25' : 'border-white/10'}`}>
      ${['preparing', 'running'].includes(status) && html`<div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent animate-pulse"></div>`}
      <div class=${`flex items-center gap-2 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-mono text-sky-200 flex-shrink-0">${ICONOS[visual.tool] || '⌁'}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-white/90 font-mono">${visual.tool || 'tool'}</span>
            <span class=${`inline-flex items-center gap-1 text-[10px] ${tone}`}><i class=${`w-1.5 h-1.5 rounded-full ${dot} ${['preparing', 'running'].includes(status) ? 'animate-pulse' : ''}`}></i>${fase}</span>
            ${visual.paneId && html`<span class="text-[9px] text-white/30 uppercase">${visual.paneId}</span>`}
          </div>
          <div class="truncate text-[11px] text-white/45 font-mono" title=${detalle}>${detalle}</div>
        </div>
        ${visual.size > 0 && html`<span class="text-[10px] text-white/30 font-mono">${visual.size >= 1024 ? `${(visual.size / 1024).toFixed(1)} KB` : `${visual.size} B`}</span>`}
      </div>
      ${visual.output && !compact && html`<div class=${`mx-3 mb-2 px-2 py-1.5 rounded-md text-[11px] font-mono whitespace-pre-wrap max-h-24 overflow-auto ${status === 'error' ? 'bg-red-500/5 text-red-200/80' : 'bg-white/[.03] text-white/45'}`}>${String(visual.output).slice(0, 900)}</div>`}
      ${artifact && html`
        <div class="flex items-center gap-2 px-3 py-2 border-t border-white/5 bg-white/[.02]">
          <span class="text-[10px] text-emerald-300/70 flex-1 truncate">◆ Artefacto · ${artifact.path.split('/').pop()}</span>
          <button type="button" class="px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] text-white/70" onClick=${() => abrirArtefacto(artifact)}>${artifact.type === 'html' ? '◩ Vista previa' : '▣ Abrir Canvas'}</button>
        </div>
      `}
    </div>
  `;
}
