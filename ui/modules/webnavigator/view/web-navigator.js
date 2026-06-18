const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef, useCallback } = globalThis.preactHooks;
import { cargarSesiones, fechaCorta } from '../scripts/sesion.js';
import { cargarLog, TIPO_COLOR } from '../scripts/log.js';
import { cargarCapturas } from '../scripts/capturas.js';
import { postJSON } from '../../../components/shared/api.js';

export default function WebNavigator() {
  const [sesiones, setSesiones] = useState([]);
  const [sesion, setSesion] = useState(null);
  const [log, setLog] = useState([]);
  const [capturas, setCapturas] = useState([]);
  const [tab, setTab] = useState('log');
  const [err, setErr] = useState('');

  const [objetivo, setObjetivo] = useState('');
  const [ejecutando, setEjecutando] = useState(false);
  const [liveLog, setLiveLog] = useState([]);
  const [liveSesionId, setLiveSesionId] = useState(null);
  const sseRef = useRef(null);
  const liveEndRef = useRef(null);

  const recargarSesiones = useCallback(() => {
    cargarSesiones().then(setSesiones).catch(e => setErr(e.message));
  }, []);

  useEffect(() => { recargarSesiones(); }, []);

  useEffect(() => {
    if (liveEndRef.current) liveEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [liveLog]);

  useEffect(() => {
    const id = sesion?.id || null;
    cargarLog(id).then(setLog).catch(() => setLog([]));
    cargarCapturas(id).then(setCapturas).catch(() => setCapturas([]));
  }, [sesion]);

  function conectarSSE(sesionId) {
    if (sseRef.current) sseRef.current.close();
    const sse = new EventSource(`/nav/stream/${sesionId}`);
    sseRef.current = sse;
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.tipo === 'done' || data.tipo === 'error') {
          setEjecutando(false);
          setLiveLog(prev => [...prev, data]);
          sse.close();
          recargarSesiones();
        } else {
          setLiveLog(prev => [...prev, data]);
        }
      } catch {}
    };
    sse.onerror = () => {
      setEjecutando(false);
      sse.close();
      recargarSesiones();
    };
  }

  async function ejecutar() {
    if (!objetivo.trim() || ejecutando) return;
    setEjecutando(true);
    setLiveLog([]);
    setLiveSesionId(null);
    setTab('live');
    try {
      const res = await postJSON('/nav/run', { objetivo: objetivo.trim(), max_steps: 30 });
      setLiveSesionId(res.id);
      conectarSSE(res.id);
    } catch (e) {
      setErr(e.message);
      setEjecutando(false);
    }
  }

  function verSesion(s) {
    setSesion(s);
    setTab('log');
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    setEjecutando(false);
    setLiveLog([]);
    setLiveSesionId(null);
  }

  return html`
    <div class="flex h-full">
      <aside class="w-64 border-r border-white/5 flex flex-col shrink-0">
        <div class="p-2 border-b border-white/5">
          <div class="text-xs font-semibold mb-2">🧭 Web Navigator</div>
          <textarea
            value=${objetivo}
            onInput=${e => setObjetivo(e.target.value)}
            onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ejecutar(); } }}
            placeholder="Objetivo (Enter para ejecutar)"
            rows="3"
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white resize-none outline-none focus:border-white/25"
          />
          <button
            onClick=${ejecutar}
            disabled=${ejecutando || !objetivo.trim()}
            class=${`mt-1 w-full text-xs py-1 rounded font-medium
              ${ejecutando ? 'bg-white/10 text-white/40 cursor-not-allowed'
                           : 'bg-sky-600/80 hover:bg-sky-600 text-white cursor-pointer'}`}
          >${ejecutando ? '⏳ Ejecutando…' : '▶ Ejecutar'}</button>
          ${err && html`<div class="text-[10px] text-red-400/70 mt-1">${err}</div>`}
        </div>

        <div class="flex-1 overflow-y-auto p-2">
          <div
            onClick=${() => verSesion(null)}
            class=${`px-2 py-1 rounded cursor-pointer text-xs mb-1
              ${!sesion && tab !== 'live' ? 'bg-white/15' : 'hover:bg-white/5 text-white/60'}`}
          >Todo el log</div>
          ${liveSesionId && html`
            <div
              onClick=${() => setTab('live')}
              class=${`px-2 py-1.5 rounded cursor-pointer mb-1
                ${tab === 'live' ? 'bg-sky-800/40' : 'hover:bg-white/5'}`}
            >
              <div class="text-xs truncate flex items-center gap-1">
                ${ejecutando ? html`<span class="animate-pulse">●</span>` : '✓'}
                ${objetivo.trim().slice(0, 30) || `Sesión ${liveSesionId}`}
              </div>
              <div class="text-[10px] text-white/40">#${liveSesionId} — en vivo</div>
            </div>
          `}
          ${sesiones.map(s => html`
            <div
              key=${s.id}
              onClick=${() => verSesion(s)}
              class=${`px-2 py-1.5 rounded cursor-pointer mb-1
                ${sesion?.id === s.id && tab !== 'live' ? 'bg-white/15' : 'hover:bg-white/5'}`}
            >
              <div class="text-xs truncate">${s.objetivo || `Sesión ${s.id}`}</div>
              <div class="text-[10px] text-white/40 flex gap-2">
                <span>#${s.id}</span>
                <span>${fechaCorta(s.inicio || s.creado_en)}</span>
                ${s.resultado && html`<span class="text-emerald-400/60">✓</span>`}
              </div>
            </div>
          `)}
          ${sesiones.length === 0 && !liveSesionId && html`<div class="text-xs text-white/30 p-2">Sin sesiones</div>`}
        </div>
      </aside>

      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 text-xs">
          ${tab !== 'live' && html`
            <button onClick=${() => setTab('log')}
              class=${`px-2 py-0.5 rounded ${tab === 'log' ? 'bg-white/15' : 'hover:bg-white/10 text-white/50'}`}>
              Log (${log.length})
            </button>
            <button onClick=${() => setTab('capturas')}
              class=${`px-2 py-0.5 rounded ${tab === 'capturas' ? 'bg-white/15' : 'hover:bg-white/10 text-white/50'}`}>
              Capturas (${capturas.length})
            </button>
          `}
          ${tab === 'live' && html`
            <span class="text-white/60">Log en vivo</span>
            ${liveSesionId && html`<span class="text-white/30 ml-2">#${liveSesionId}</span>`}
          `}
          ${sesion?.resultado && html`
            <span class="ml-auto text-white/40 truncate max-w-xs">✓ ${sesion.resultado}</span>
          `}
        </div>

        <div class="flex-1 overflow-y-auto p-3">
          ${tab === 'live' && html`
            ${liveLog.length === 0 && html`<div class="text-xs text-white/30">Esperando…</div>`}
            ${liveLog.map((l, i) => html`
              <div key=${i} class="flex gap-2 text-xs py-1 border-b border-white/5 items-baseline">
                <span class=${`w-16 shrink-0 ${TIPO_COLOR[l.tipo] || 'text-white/50'}`}>${l.tipo}</span>
                <span class="text-white/70 flex-1 min-w-0 break-words">${l.mensaje || l.resultado || ''}</span>
                ${l.url && html`<a href=${l.url} target="_blank" class="text-sky-300/60 underline truncate max-w-[160px] shrink-0">${l.url}</a>`}
              </div>
            `)}
            <div ref=${liveEndRef} />
          `}

          ${tab === 'log' && html`
            ${log.length === 0 && html`<div class="text-xs text-white/30">Sin entradas</div>`}
            ${log.map(l => html`
              <div key=${l.id} class="flex gap-2 text-xs py-1 border-b border-white/5 items-baseline">
                <span class="text-white/30 w-10 shrink-0">#${l.id}</span>
                <span class=${`w-16 shrink-0 ${TIPO_COLOR[l.tipo] || 'text-white/50'}`}>${l.tipo}</span>
                <span class="text-white/70 flex-1 min-w-0 break-words">${l.mensaje}</span>
                ${l.url && html`<a href=${l.url} target="_blank" class="text-sky-300/60 underline truncate max-w-[180px] shrink-0">${l.url}</a>`}
              </div>
            `)}
          `}

          ${tab === 'capturas' && html`
            ${capturas.length === 0 && html`<div class="text-xs text-white/30">Sin capturas</div>`}
            ${capturas.map(c => html`
              <div key=${c.id} class="bg-white/5 rounded-lg p-2 mb-2 text-xs">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold">${c.titulo}</span>
                  <a href=${c.url} target="_blank" class="text-sky-300/60 underline truncate flex-1">${c.url}</a>
                </div>
                <div class="text-[10px] text-white/40 flex flex-wrap gap-x-3">
                  ${c.selector && html`<span>selector: <code>${c.selector}</code></span>`}
                  ${c.aria && html`<span>aria: ${c.aria}</span>`}
                  ${c.testid && html`<span>testid: ${c.testid}</span>`}
                  ${c.rol && html`<span>rol: ${c.rol}</span>`}
                  ${c.placeholder && html`<span>placeholder: ${c.placeholder}</span>`}
                </div>
              </div>
            `)}
          `}
        </div>
      </div>
    </div>
  `;
}
