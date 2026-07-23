const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { ejecutarCadena, PLANTILLAS } from '../scripts/ejecutar.js';
import { fetchModels, cancelarMensaje } from '../../../components/shared/lyra-ws.js';
import { renderMarkdown } from '../../../components/shared/markdown.js';
import { Button, Chip, ChipGroup, Input, Select, Textarea, ToolPage, ToolHeader, ToolSection } from '../../../components/index.js?v=v1-surface-convergence-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

let nextId = 1;
const nuevoPaso = () => ({ id: nextId++, nombre: `Paso`, instruccion: '' });

export default function Chain() {
  const [pasos, setPasos] = useState([{ id: nextId++, nombre: 'Paso 1', instruccion: 'Resumí el texto del usuario en español.' }]);
  const [entrada, setEntrada] = useState('');
  const [salidas, setSalidas] = useState({});
  const [estado, setEstado] = useState({});
  const [corriendo, setCorriendo] = useState(false);
  const [modelos, setModelos] = useState([]);
  const [modelo, setModelo] = useState('');
  const [err, setErr] = useState('');
  const [abierto, setAbierto] = useState({});

  useEffect(() => {
    fetchModels().then(ms => {
      setModelos(ms);
      if (ms.length) setModelo(ms[0].id || ms[0]);
    });
  }, []);

  const setPaso = (id, campo, valor) =>
    setPasos(ps => ps.map(p => p.id === id ? { ...p, [campo]: valor } : p));

  const agregarPaso = () => setPasos(ps => [...ps, { ...nuevoPaso(), nombre: `Paso ${ps.length + 1}` }]);
  const quitarPaso = (id) => setPasos(ps => ps.filter(p => p.id !== id));
  const moverPaso = (i, dir) => setPasos(ps => {
    const j = i + dir;
    if (j < 0 || j >= ps.length) return ps;
    const copia = [...ps];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });

  const cargarPlantilla = (p) => {
    setPasos(p.pasos.map(x => ({ ...x, id: nextId++ })));
    setSalidas({});
    setEstado({});
  };

  const ejecutar = async (input = entrada) => {
    const source = String(input || '').trim();
    if (!source || corriendo) return;
    setCorriendo(true);
    setErr('');
    setSalidas({});
    setEstado({});
    try {
      await ejecutarCadena({
        pasos,
        entrada: source,
        model: modelo,
        onPasoInicio: (i) => setEstado(s => ({ ...s, [i]: 'corriendo' })),
        onToken: (i, texto) => setSalidas(s => ({ ...s, [i]: texto })),
        onPasoFin: (i) => setEstado(s => ({ ...s, [i]: 'ok' })),
      });
    } catch (e) {
      setErr(e.message);
    }
    setCorriendo(false);
    return { steps: pasos.length, outputs: salidas };
  };

  useEffect(() => registerAIView({
    id: 'chain',
    description: 'Transformación secuencial: cada salida alimenta el siguiente paso.',
    actions: {
      status: { description: 'Resume modelo, pasos y ejecución actuales.', readOnly: true, run: () => ({ model: modelo, running: corriendo, inputChars: entrada.length, steps: pasos.map((p, i) => ({ index: i, name: p.nombre, instruction: p.instruccion, status: estado[i] || 'pending' })) }) },
      list_templates: { description: 'Lista cadenas iniciales disponibles.', readOnly: true, run: () => PLANTILLAS.map(p => ({ name: p.nombre, steps: p.pasos })) },
      load_template: { description: 'Carga una plantilla conocida en el editor.', input: { name: { type: 'string', required: true } }, run: ({ name }) => { const item = PLANTILLAS.find(p => p.nombre === name); if (!item) throw new Error(`Plantilla desconocida: ${name}`); cargarPlantilla(item); return { name, steps: item.pasos.length }; } },
      execute: { description: 'Ejecuta la cadena visible con una entrada inicial.', input: { input: { type: 'string', required: true, maxLength: 120000 } }, run: ({ input }) => ejecutar(input) },
    },
  }), [modelo, corriendo, entrada.length, pasos, estado, salidas]);

  return html`
    <${ToolPage} wide>
      <${ToolHeader} icon="repeat" eyebrow="Flujo" title="Chain" description="La salida de cada paso se convierte en la entrada del siguiente." />
      <${ChipGroup}>
        ${PLANTILLAS.map(p => html`
          <${Chip} key=${p.nombre} onClick=${() => cargarPlantilla(p)}>${p.nombre}<//>
        `)}
      <//>

      ${pasos.map((p, i) => html`
        <${ToolSection} key=${p.id} class="chain-step" title=${`${i + 1}. ${p.nombre}`} meta=${estado[i] === 'corriendo' ? 'ejecutando' : estado[i] === 'ok' ? 'completado' : 'pendiente'}>
          <div class="flex items-center gap-2 mb-1">
            <span class=${`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-semibold
              ${estado[i] === 'ok' ? 'bg-emerald-500/30 text-emerald-300' :
                estado[i] === 'corriendo' ? 'bg-amber-500/30 text-amber-300 animate-pulse' :
                'bg-white/10 text-white/50'}`}>${i + 1}</span>
            <${Input}
              class="flex-1 min-w-0"
              value=${p.nombre}
              onInput=${e => setPaso(p.id, 'nombre', e.target.value)}
            ><//>
            <${Button} icon="chevronLeft" iconOnly onClick=${() => moverPaso(i, -1)} title="Subir" />
            <${Button} icon="chevronRight" iconOnly onClick=${() => moverPaso(i, 1)} title="Bajar" />
            <${Button} icon="close" iconOnly variant="danger" onClick=${() => quitarPaso(p.id)} title="Quitar paso" />
          </div>
          <${Textarea}
            class="w-full h-16 resize-y"
            placeholder="Instrucción de este paso (system prompt)…"
            value=${p.instruccion}
            onInput=${e => setPaso(p.id, 'instruccion', e.target.value)}
            spellcheck="false"
          ><//>
          ${salidas[i] != null && html`
            <div class="mt-1">
              <${Chip} active=${abierto[i] !== false} onClick=${() => setAbierto(a => ({ ...a, [i]: !a[i] }))}>
                ${abierto[i] !== false ? '▾' : '▸'} salida (${(salidas[i] || '').length} chars)
              <//>
              ${abierto[i] !== false && html`
                <div class="text-xs mt-1 p-2 bg-black/30 rounded max-h-48 overflow-y-auto"
                  dangerouslySetInnerHTML=${{ __html: renderMarkdown(salidas[i]) }} />
              `}
            </div>
          `}
        <//>
      `)}

      <${Button} icon="plus" size="sm" onClick=${agregarPaso}>Agregar paso<//>

      <${ToolSection} title="Entrada y ejecución" description="El material inicial que atravesará toda la cadena.">
      <${Textarea} class="w-full h-24 font-mono resize-y" placeholder="Entrada inicial de la cadena…" value=${entrada} onInput=${e => setEntrada(e.target.value)} spellcheck="false"><//>
      <div class="flex items-center gap-2 mt-2 flex-wrap">
        <${Select} size="sm" class="min-w-0 flex-shrink" value=${modelo} onChange=${e => setModelo(e.target.value)}>
          ${modelos.map(m => {
            const id = m.id || m;
            return html`<option key=${id} value=${id}>${id}</option>`;
          })}
        <//>
        <span class="flex-1" />
        ${corriendo && html`
          <${Button} icon="stop" size="sm" variant="danger" onClick=${cancelarMensaje}>Cancelar<//>
        `}
        <${Button} icon="play" size="sm" variant="primary"
          onClick=${ejecutar}
          disabled=${corriendo || !entrada.trim() || pasos.length === 0}
        >${corriendo ? 'Ejecutando…' : 'Ejecutar cadena'}<//>
      </div>
      <//>

      ${err && html`<div class="text-xs text-red-400/70 mt-2">${err}</div>`}
    <//>
  `;
}
