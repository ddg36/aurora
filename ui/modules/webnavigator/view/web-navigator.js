const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef, useCallback } = globalThis.preactHooks;
import { cargarSesiones, fechaCorta } from '../scripts/sesion.js';
import { cargarLog, TIPO_COLOR } from '../scripts/log.js';
import { cargarCapturas } from '../scripts/capturas.js';
import { postJSON } from '../../../components/shared/api.js';
import { Button, Chip, Empty, Icon, Status, Textarea, ToolPage, ToolHeader, ToolSection } from '../../../components/index.js?v=v1-surface-convergence-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

function EventRow({ item, sequence }) {
  const message = item.mensaje || item.resultado || '';
  return html`
    <div class="navigator-event">
      <span class="navigator-event-sequence">#${item.id ?? sequence}</span>
      <span class=${`navigator-event-type ${TIPO_COLOR[item.tipo] || ''}`}>${item.tipo || 'evento'}</span>
      <div class="navigator-event-content">
        <span>${message}</span>
        ${item.url && html`<a href=${item.url} target="_blank"><${Icon} name="globe" size=${12}/>${item.url}</a>`}
      </div>
    </div>
  `;
}

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

  useEffect(() => registerAIView({
    id: 'webnavigator',
    description: 'Navegación autónoma orientada a un resultado verificable, con ejecución, eventos y evidencia persistente.',
    actions: {
      status: {
        description: 'Resume la ejecución activa y la sesión seleccionada.',
        readOnly: true,
        run: () => ({ ejecutando, liveSesionId, objetivo: objetivo.trim(), selectedSessionId: sesion?.id || null, tab, liveEvents: liveLog.length }),
      },
      list_runs: {
        description: 'Lista las ejecuciones recuperables conocidas por la vista.',
        readOnly: true,
        run: () => sesiones.map(s => ({ id: s.id, objetivo: s.objetivo, inicio: s.inicio || s.creado_en, resultado: s.resultado || null })),
      },
      execute: {
        description: 'Inicia una navegación autónoma desde un objetivo humano terminado; no acepta una lista de clicks.',
        input: { objective: { type: 'string', required: true, maxLength: 4000 } },
        risk: 'external-navigation',
        run: async ({ objective }) => {
          const value = String(objective || '').trim();
          if (!value) throw new Error('objective no puede estar vacío');
          if (ejecutando) throw new Error('Web Navigator ya tiene una ejecución activa');
          setObjetivo(value); setEjecutando(true); setLiveLog([]); setLiveSesionId(null); setTab('live');
          try {
            const res = await postJSON('/nav/run', { objetivo: value, max_steps: 30 });
            if (res.ok === false) throw new Error(res.error || 'WebNavigator no disponible');
            setLiveSesionId(res.id); conectarSSE(res.id);
            return { sessionId: res.id, objective: value, status: 'running' };
          } catch (error) {
            setEjecutando(false); setErr(error?.message || String(error)); throw error;
          }
        },
      },
    },
  }), [ejecutando, liveSesionId, objetivo, sesion, tab, liveLog.length, sesiones]);

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
    const sse = new EventSource(`/nav/stream/${sesionId}?token=${encodeURIComponent(globalThis.AURORA_TOKEN?.() || '')}`);
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
      if (res.ok === false) throw new Error(res.error || 'WebNavigator no disponible');
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

  const stageTitle = tab === 'live'
    ? `Ejecución #${liveSesionId || 'nueva'}`
    : sesion?.objetivo || (sesion ? `Ejecución #${sesion.id}` : 'Actividad reciente');

  return html`
    <${ToolPage} wide class="navigator-page">
      <${ToolHeader} icon="globe" eyebrow="Navegación asistida" title="Web Navigator" description="Declara un resultado; Aurora navega, registra evidencia y devuelve una conclusión verificable." />

      <${ToolSection} title="Objetivo" description="Describe el resultado terminado, no una lista de clics." meta=${ejecutando ? html`<${Status} tone="loading">navegando<//>` : html`<span>Enter para ejecutar</span>`}>
        <div class="navigator-command">
          <${Textarea} value=${objetivo} onInput=${e => setObjetivo(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ejecutar(); } }} placeholder="Ejemplo: compara los precios visibles y devuelve la mejor opción con evidencia." rows="3" class="navigator-objective" />
          <${Button} icon="play" variant="primary" onClick=${ejecutar} disabled=${ejecutando || !objetivo.trim()}>${ejecutando ? 'Navegando…' : 'Iniciar navegación'}<//>
        </div>
        ${err && html`<div class="navigator-error">${err}</div>`}
      <//>

      <div class="navigator-workspace">
        <${ToolSection} title="Ejecuciones" description="Retoma una investigación anterior." meta=${`${sesiones.length} guardadas`} flush>
          <div class="navigator-runs">
            <button class=${`navigator-run ${!sesion && tab !== 'live' ? 'is-active' : ''}`} onClick=${() => verSesion(null)}><${Icon} name="history" size=${14}/><span><strong>Actividad global</strong><small>Todos los eventos</small></span></button>
            ${liveSesionId && html`<button class=${`navigator-run ${tab === 'live' ? 'is-active is-live' : ''}`} onClick=${() => setTab('live')}><${Icon} name="refresh" size=${14}/><span><strong>${objetivo.trim() || `Ejecución #${liveSesionId}`}</strong><small>#${liveSesionId} · en curso</small></span></button>`}
            ${sesiones.map(s => html`<button key=${s.id} class=${`navigator-run ${sesion?.id === s.id && tab !== 'live' ? 'is-active' : ''}`} onClick=${() => verSesion(s)}><${Icon} name=${s.resultado ? 'check' : 'clock'} size=${14}/><span><strong>${s.objetivo || `Ejecución #${s.id}`}</strong><small>#${s.id} · ${fechaCorta(s.inicio || s.creado_en)}</small></span></button>`)}
            ${sesiones.length === 0 && !liveSesionId && html`<${Empty} icon="history" title="Sin ejecuciones">El primer objetivo creará una línea de tiempo recuperable.<//>`}
          </div>
        <//>

        <${ToolSection} title=${stageTitle} description=${sesion?.resultado || (tab === 'live' ? 'Progreso en tiempo real.' : 'Eventos, evidencia y capturas de navegación.')} flush>
          <div class="navigator-stage-tabs">
            ${tab !== 'live' ? html`<${Chip} active=${tab === 'log'} onClick=${() => setTab('log')}>Eventos ${log.length}<//><${Chip} active=${tab === 'capturas'} onClick=${() => setTab('capturas')}>Evidencia ${capturas.length}<//>` : html`<${Status} tone=${ejecutando ? 'loading' : 'ok'}>${ejecutando ? 'en curso' : 'finalizado'}<//>`}
          </div>
          <div class="navigator-stage-body">
            ${tab === 'live' && html`${liveLog.length === 0 && html`<${Empty} icon="clock" title="Preparando navegación">Los pasos aparecerán aquí sin convertir la pantalla en una consola.<//>`}${liveLog.map((item, i) => html`<${EventRow} key=${i} item=${item} sequence=${i + 1}/>`)}<div ref=${liveEndRef}/>`}
            ${tab === 'log' && html`${log.length === 0 && html`<${Empty} icon="history" title="Sin eventos">Selecciona una ejecución o inicia una nueva.<//>`}${log.map(item => html`<${EventRow} key=${item.id} item=${item} sequence=${item.id}/>`)} `}
            ${tab === 'capturas' && html`${capturas.length === 0 && html`<${Empty} icon="camera" title="Sin evidencia visual">Las capturas producidas durante la navegación aparecerán aquí.<//>`}${capturas.map(c => html`<article key=${c.id} class="navigator-evidence"><div><${Icon} name="camera" size=${14}/><strong>${c.titulo || 'Captura'}</strong></div>${c.url && html`<a href=${c.url} target="_blank">${c.url}</a>`}<dl>${c.selector && html`<div><dt>selector</dt><dd>${c.selector}</dd></div>`}${c.aria && html`<div><dt>aria</dt><dd>${c.aria}</dd></div>`}${c.testid && html`<div><dt>testid</dt><dd>${c.testid}</dd></div>`}${c.rol && html`<div><dt>rol</dt><dd>${c.rol}</dd></div>`}${c.placeholder && html`<div><dt>placeholder</dt><dd>${c.placeholder}</dd></div>`}</dl></article>`)}`}
          </div>
        <//>
      </div>
    <//>
  `;
}
