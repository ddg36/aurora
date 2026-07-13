const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;

import { crearDuo } from './duo.js';
import { crearDuoCloud } from './cloud-duo.js';
import { fetchModels } from '../../../components/shared/lyra-ws.js';
import { Button, Chip, Select } from '../../../components/index.js';
import { detectarToolDraft, toolVisual, ToolVisualCard, emitirToolVisual } from '../../../components/shared/cloud-tool-visual.js';

const MODOS = [
  { id: 'libre',          label: 'Libre — conversan sobre lo que quieran' },
  { id: 'debate',         label: 'Debate — posiciones opuestas' },
  { id: 'colaboracion',   label: 'Colaboración — construyen una idea' },
  { id: 'interrogatorio', label: 'Interrogatorio — uno pregunta, otro responde' },
];

const SEED_POR_MODO = {
  libre:          'Saludá a la otra IA y proponé un tema interesante para conversar. Sé breve.',
  debate:         'Vas a debatir con la otra IA. Elegí una posición sobre un tema controversial y presentala con fuerza.',
  colaboracion:   'Vas a colaborar con la otra IA para construir una idea juntos. Proponé un punto de partida creativo.',
  interrogatorio: 'Vas a hacerle preguntas a la otra IA. Empezá con una pregunta profunda. Solo vos preguntás.',
};

export function DuoPanel({ onClose, agentes = [] }) {
  const [modelos, setModelos] = useState([]);
  const [config, setConfig] = useState({
    modo: 'libre', seedPrompt: agentes.length >= 2
      ? 'Colaboren en este objetivo. Si necesitás consultar o entregar trabajo al otro agente, usá panel_send explícitamente.'
      : SEED_POR_MODO.libre,
    motor: agentes.length >= 2 ? 'cloud' : 'local',
    maxRondas: 10, delayMs: 1000, panelInicial: 1, nuevaConversacion: true, modelA: '', modelB: '',
  });
  const [estado, setEstado] = useState('idle');
  const [turnos, setTurnos] = useState([]);
  const [parcial, setParcial] = useState(null);
  const duoRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchModels().then(ms => {
      setModelos(ms);
      if (ms[0]) setConfig(c => ({ ...c, modelA: c.modelA || ms[0], modelB: c.modelB || (ms[1] || ms[0]) }));
    });
    return () => duoRef.current?.detener();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turnos, parcial]);

  const merge = (patch) => setConfig(c => ({ ...c, ...patch }));
  const cambiarModo = (modo) => merge({ modo, seedPrompt: SEED_POR_MODO[modo] });

  const iniciar = () => {
    setTurnos([]);
    setParcial(null);
    const duo = config.motor === 'cloud' ? crearDuoCloud() : crearDuo();
    duoRef.current = duo;
    duo.iniciar(config, {
      onEstado: setEstado,
      onError: (m) => setTurnos(t => [...t, { quien: 'err', texto: m }]),
      onTool: (ev) => {
        // La respuesta que pidió la tool ya terminó. No dejar el cursor de
        // streaming pegado sobre ese JSON mientras esperamos la continuación.
        setParcial(null);
        const visual = ev.error
          ? toolVisual({ tool: 'tool', status: 'error', error: ev.error, paneId: ev.paneId, quien: ev.quien, runId: ev.runId })
          : toolVisual({ tool: ev.call.tool, args: ev.call.args, status: ev.status, result: ev.result, paneId: ev.paneId, quien: ev.quien, runId: ev.runId });
        emitirToolVisual(visual);
        setTurnos(t => {
          if (ev.status !== 'running') {
            const idx = [...t].reverse().findIndex(x => x.toolVisual?.tool === visual.tool && x.quien === ev.quien && x.toolVisual?.status === 'running');
            if (idx >= 0) {
              const real = t.length - 1 - idx;
              return t.map((x, i) => i === real ? { ...x, toolVisual: visual } : x);
            }
          }
          return [...t, { quien: ev.quien, toolVisual: visual }];
        });
        if (ev.status !== 'running') setParcial({ quien: ev.quien, texto: '', esperando: true });
      },
      onTurno: (ev) => {
        if (ev.parcial) {
          setParcial(p => ({ quien: ev.quien, texto: (p?.quien === ev.quien ? p.texto : '') + ev.token }));
        } else {
          setParcial(null);
          setTurnos(t => [...t, { quien: ev.quien, texto: ev.texto, ronda: ev.ronda }]);
        }
      },
    });
  };

  const detener = () => { duoRef.current?.detener(); setEstado('cancelado'); };
  const activo = estado === 'activo' || estado === 'conectando' || estado === 'preparando';

  const colorQuien = (q) => q === 'A' ? 'text-aurora-accent' : q === 'B' ? 'text-emerald-400' : 'text-red-400';
  const labelQuien = (q) => q === 'A' ? 'Panel 1' : q === 'B' ? 'Panel 2' : 'Error';

  // En Cloud no duplicamos los chats dentro de Aurora: Gemini/ChatGPT ya
  // tienen una interfaz excelente y visible arriba. Este controlador ocupa
  // sólo una franja del layout (fuera de los OOPIF) y desaparece al cerrarlo.
  if (agentes.length >= 2) {
    const agenteActivo = parcial?.quien ? labelQuien(parcial.quien) : null;
    const ultimoError = [...turnos].reverse().find(t => t.quien === 'err')?.texto;
    return html`
      <div class="flex-shrink-0 border-t border-aurora-border bg-aurora-surface text-aurora-text px-3 py-2 shadow-lg">
        ${estado === 'idle' ? html`
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-semibold">⇆ Puente entre paneles</span>
                <span class="text-[10px] text-aurora-text-muted">Las IAs se escriben usando la tool panel_send</span>
              </div>
              <textarea rows="2" class="w-full rounded-md border border-aurora-border bg-aurora-bg text-aurora-text px-2 py-1.5 resize-none font-mono text-xs"
                value=${config.seedPrompt} onInput=${e => merge({ seedPrompt: e.target.value })}
                placeholder="Objetivo inicial para el primer panel…" />
            </div>
            <div class="flex flex-col gap-2 min-w-[210px]">
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-aurora-text-muted mr-1">Empieza</span>
                ${[1, 2].map(n => html`<${Chip} key=${n} active=${config.panelInicial === n} onClick=${() => merge({ panelInicial: n })}>${n === 1 ? agentes[0]?.nombre || 'Panel 1' : agentes[1]?.nombre || 'Panel 2'}<//>`)}
              </div>
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1 text-[10px] text-aurora-text-muted cursor-pointer" title="Abre conversaciones nativas vacías antes de iniciar">
                  <input type="checkbox" checked=${config.nuevaConversacion}
                    onChange=${e => merge({ nuevaConversacion: e.target.checked })} /> Chats nuevos
                </label>
                <label class="flex items-center gap-1 text-[10px] text-aurora-text-muted">Máx. mensajes
                  <select class="rounded border border-aurora-border bg-aurora-bg text-aurora-text px-1.5 py-1" value=${config.maxRondas} onChange=${e => merge({ maxRondas: Number(e.target.value) })}>
                    ${[3, 5, 10, 20, 50].map(n => html`<option value=${n}>${n}</option>`)}
                  </select>
                </label>
                <${Chip} variant="accent" onClick=${iniciar}>⇆ Iniciar<//>
                <${Button} iconOnly onClick=${onClose} title="Cerrar controlador">✕<//>
              </div>
            </div>
          </div>
        ` : html`
          <div class="flex items-center gap-2 min-h-9">
            <span class=${`w-2 h-2 rounded-full ${activo ? 'bg-emerald-400 animate-pulse' : estado === 'error' ? 'bg-red-400' : 'bg-white/30'}`}></span>
            <span class="text-xs font-semibold">${estado === 'preparando' ? 'Preparando chats nuevos…' : `Duo ${estado}`}</span>
            ${agenteActivo && html`<span class="text-[11px] text-aurora-text-muted">${agenteActivo} procesando</span>`}
            ${ultimoError && html`<span class="text-[11px] text-red-400 truncate">${ultimoError}</span>`}
            <span class="flex-1"></span>
            ${activo
              ? html`<${Chip} variant="yt" onClick=${detener}>⏹ Detener<//>`
              : html`<${Chip} onClick=${() => { setEstado('idle'); setTurnos([]); setParcial(null); }}>Nueva ejecución<//>`}
            <${Button} iconOnly onClick=${() => { if (activo) detener(); onClose(); }} title="Cerrar controlador">✕<//>
          </div>
        `}
      </div>
    `;
  }

  return html`
    <div class="fixed inset-0 z-[9000] bg-black/70 flex items-center justify-center p-4" onClick=${e => e.target === e.currentTarget && !activo && onClose()}>
      <div class="w-[min(820px,95vw)] h-[min(80vh,720px)] bg-[#14141c] border border-white/10 rounded-xl flex flex-col overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <span class="text-sm font-semibold flex-1">⇆ Duo — IAs conversando y usando tools</span>
          <span class="text-[11px] text-white/40">${estado}</span>
          <${Button} iconOnly onClick=${() => { detener(); onClose(); }} title="Cerrar">✕<//>
        </div>

        <div class="grid grid-cols-2 gap-3 p-3 border-b border-white/10 text-xs">
          <label class="flex flex-col gap-1 col-span-2">
            <span class="text-white/40">Participantes</span>
            <div class="flex gap-1">
              ${agentes.length >= 2 && html`<${Chip} active=${config.motor === 'cloud'} disabled=${activo} onClick=${() => merge({ motor: 'cloud' })}>
                ☁ ${agentes[0]?.nombre || 'Panel 1'} ↔ ${agentes[1]?.nombre || 'Panel 2'} · tools reales
              <//>`}
              <${Chip} active=${config.motor === 'local'} disabled=${activo} onClick=${() => merge({ motor: 'local' })}>⌂ Dos modelos locales<//>
            </div>
          </label>
          ${config.motor === 'local' && html`<label class="flex flex-col gap-1">
            <span class="text-white/40">Modo</span>
            <${Select} value=${config.modo} onChange=${e => cambiarModo(e.target.value)} disabled=${activo}>
              ${MODOS.map(m => html`<option key=${m.id} value=${m.id}>${m.label}</option>`)}
            <//>
          </label>`}
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Empieza</span>
            <div class="flex gap-1">
              ${[1, 2].map(n => html`
                <${Chip} key=${n} class="flex-1 justify-center" disabled=${activo} active=${config.panelInicial === n} onClick=${() => merge({ panelInicial: n })}>Panel ${n}<//>
              `)}
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Modelo Panel 1</span>
            <${Select} value=${config.modelA} onChange=${e => merge({ modelA: e.target.value })} disabled=${activo}>
              ${modelos.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            <//>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Modelo Panel 2</span>
            <${Select} value=${config.modelB} onChange=${e => merge({ modelB: e.target.value })} disabled=${activo}>
              ${modelos.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            <//>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Rondas</span>
            <${Select} value=${config.maxRondas} onChange=${e => merge({ maxRondas: Number(e.target.value) })} disabled=${activo}>
              ${[3, 5, 10, 20, 50].map(n => html`<option key=${n} value=${n}>${n}</option>`)}
            <//>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Delay entre turnos</span>
            <${Select} value=${config.delayMs} onChange=${e => merge({ delayMs: Number(e.target.value) })} disabled=${activo}>
              <option value=${0}>Instantáneo</option>
              <option value=${1000}>1s</option>
              <option value=${2000}>2s</option>
              <option value=${5000}>5s</option>
            <//>
          </label>
          <label class="flex flex-col gap-1 col-span-2">
            <span class="text-white/40">Prompt inicial (seed)</span>
            <textarea rows="2" class="bg-black/30 border border-white/10 rounded px-2 py-1 resize-none font-mono" value=${config.seedPrompt} onInput=${e => merge({ seedPrompt: e.target.value })} disabled=${activo} />
          </label>
          ${config.motor === 'cloud' && html`<label class="flex items-center gap-2 col-span-2 text-white/60 cursor-pointer">
            <input type="checkbox" checked=${config.nuevaConversacion} disabled=${activo}
              onChange=${e => merge({ nuevaConversacion: e.target.checked })} />
            Abrir chats nativos nuevos antes de cada ejecución (evita contaminar un Arena con el anterior)
          </label>`}
        </div>

        <div ref=${scrollRef} class="flex-1 overflow-y-auto p-3 flex flex-col gap-2 text-sm">
          ${turnos.length === 0 && !parcial && html`<div class="text-white/30 text-center mt-8">Configurá y dale ⇆ Iniciar.</div>`}
          ${turnos.map((t, i) => html`
            <div key=${i} class="rounded-lg bg-white/5 p-2">
              <div class=${'text-[11px] font-medium mb-0.5 ' + colorQuien(t.quien)}>${labelQuien(t.quien)}${t.ronda != null ? ` · ronda ${t.ronda + 1}` : ''}</div>
              ${t.toolVisual
                ? html`<${ToolVisualCard} visual=${t.toolVisual} />`
                : html`<div class="whitespace-pre-wrap text-white/80">${t.texto}</div>`}
            </div>
          `)}
          ${parcial && html`
            <div class="rounded-lg bg-white/5 p-2">
              <div class=${'text-[11px] font-medium mb-0.5 ' + colorQuien(parcial.quien)}>${labelQuien(parcial.quien)}</div>
              ${parcial.esperando && !parcial.texto
                ? html`<div class="flex items-center gap-2 text-xs text-white/45"><span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>Procesando el resultado de la tool…</div>`
                : detectarToolDraft(parcial.texto)
                ? html`<${ToolVisualCard} visual=${{ ...detectarToolDraft(parcial.texto), paneId: parcial.quien === 'A' ? 'izq' : 'der' }} />`
                : html`<div class="whitespace-pre-wrap text-white/80">${parcial.texto}<span class="opacity-50">▋</span></div>`}
            </div>
          `}
        </div>

        <div class="px-3 py-2 border-t border-white/10 flex justify-end gap-2">
          ${activo
            ? html`<${Chip} variant="yt" onClick=${detener}>⏹ Detener<//>`
            : html`<${Chip} variant="accent" onClick=${iniciar}>⇆ Iniciar Duo<//>`}
        </div>
      </div>
    </div>
  `;
}

export default DuoPanel;
