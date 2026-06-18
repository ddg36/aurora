const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;

import { crearDuo } from './duo.js';
import { fetchModels } from '../../../components/shared/gemita-ws.js';

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

export function DuoPanel({ onClose }) {
  const [modelos, setModelos] = useState([]);
  const [config, setConfig] = useState({
    modo: 'libre', seedPrompt: SEED_POR_MODO.libre,
    maxRondas: 10, delayMs: 1000, panelInicial: 1, modelA: '', modelB: '',
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
    const duo = crearDuo();
    duoRef.current = duo;
    duo.iniciar(config, {
      onEstado: setEstado,
      onError: (m) => setTurnos(t => [...t, { quien: 'err', texto: m }]),
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
  const activo = estado === 'activo' || estado === 'conectando';

  const colorQuien = (q) => q === 'A' ? 'text-aurora-accent' : q === 'B' ? 'text-emerald-400' : 'text-red-400';
  const labelQuien = (q) => q === 'A' ? 'Panel 1' : q === 'B' ? 'Panel 2' : 'Error';

  return html`
    <div class="fixed inset-0 z-[9000] bg-black/70 flex items-center justify-center p-4" onClick=${e => e.target === e.currentTarget && !activo && onClose()}>
      <div class="w-[min(820px,95vw)] h-[min(80vh,720px)] bg-[#14141c] border border-white/10 rounded-xl flex flex-col overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <span class="text-sm font-semibold flex-1">⇆ Duo — dos IAs conversando</span>
          <span class="text-[11px] text-white/40">${estado}</span>
          <button class="text-white/40 hover:text-white text-lg leading-none" onClick=${() => { detener(); onClose(); }}>✕</button>
        </div>

        <div class="grid grid-cols-2 gap-3 p-3 border-b border-white/10 text-xs">
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Modo</span>
            <select class="bg-black/30 border border-white/10 rounded px-2 py-1" value=${config.modo} onChange=${e => cambiarModo(e.target.value)} disabled=${activo}>
              ${MODOS.map(m => html`<option key=${m.id} value=${m.id}>${m.label}</option>`)}
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Empieza</span>
            <div class="flex gap-1">
              ${[1, 2].map(n => html`
                <button key=${n} disabled=${activo}
                  class=${'flex-1 py-1 rounded border ' + (config.panelInicial === n ? 'border-aurora-accent text-aurora-accent' : 'border-white/10 text-white/40')}
                  onClick=${() => merge({ panelInicial: n })}>Panel ${n}</button>
              `)}
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Modelo Panel 1</span>
            <select class="bg-black/30 border border-white/10 rounded px-2 py-1" value=${config.modelA} onChange=${e => merge({ modelA: e.target.value })} disabled=${activo}>
              ${modelos.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Modelo Panel 2</span>
            <select class="bg-black/30 border border-white/10 rounded px-2 py-1" value=${config.modelB} onChange=${e => merge({ modelB: e.target.value })} disabled=${activo}>
              ${modelos.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Rondas</span>
            <select class="bg-black/30 border border-white/10 rounded px-2 py-1" value=${config.maxRondas} onChange=${e => merge({ maxRondas: Number(e.target.value) })} disabled=${activo}>
              ${[3, 5, 10, 20, 50].map(n => html`<option key=${n} value=${n}>${n}</option>`)}
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-white/40">Delay entre turnos</span>
            <select class="bg-black/30 border border-white/10 rounded px-2 py-1" value=${config.delayMs} onChange=${e => merge({ delayMs: Number(e.target.value) })} disabled=${activo}>
              <option value=${0}>Instantáneo</option>
              <option value=${1000}>1s</option>
              <option value=${2000}>2s</option>
              <option value=${5000}>5s</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 col-span-2">
            <span class="text-white/40">Prompt inicial (seed)</span>
            <textarea rows="2" class="bg-black/30 border border-white/10 rounded px-2 py-1 resize-none font-mono" value=${config.seedPrompt} onInput=${e => merge({ seedPrompt: e.target.value })} disabled=${activo} />
          </label>
        </div>

        <div ref=${scrollRef} class="flex-1 overflow-y-auto p-3 flex flex-col gap-2 text-sm">
          ${turnos.length === 0 && !parcial && html`<div class="text-white/30 text-center mt-8">Configurá y dale ⇆ Iniciar.</div>`}
          ${turnos.map((t, i) => html`
            <div key=${i} class="rounded-lg bg-white/5 p-2">
              <div class=${'text-[11px] font-medium mb-0.5 ' + colorQuien(t.quien)}>${labelQuien(t.quien)}${t.ronda != null ? ` · ronda ${t.ronda + 1}` : ''}</div>
              <div class="whitespace-pre-wrap text-white/80">${t.texto}</div>
            </div>
          `)}
          ${parcial && html`
            <div class="rounded-lg bg-white/5 p-2">
              <div class=${'text-[11px] font-medium mb-0.5 ' + colorQuien(parcial.quien)}>${labelQuien(parcial.quien)}</div>
              <div class="whitespace-pre-wrap text-white/80">${parcial.texto}<span class="opacity-50">▋</span></div>
            </div>
          `}
        </div>

        <div class="px-3 py-2 border-t border-white/10 flex justify-end gap-2">
          ${activo
            ? html`<button class="px-3 py-1.5 rounded border border-red-400/50 text-red-300 text-xs" onClick=${detener}>⏹ Detener</button>`
            : html`<button class="px-3 py-1.5 rounded border border-aurora-accent text-aurora-accent text-xs" onClick=${iniciar}>⇆ Iniciar Duo</button>`}
        </div>
      </div>
    </div>
  `;
}

export default DuoPanel;
