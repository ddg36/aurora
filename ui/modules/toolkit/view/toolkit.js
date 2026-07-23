const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { HERRAMIENTAS } from '../scripts/herramientas.js';
import { sendToLyra, fetchModels, cancelarMensaje } from '../../../components/shared/lyra-ws.js';
import { renderMarkdown } from '../../../components/shared/markdown.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { Button, Chip, Icon, Panel, PanelBody, Select, Textarea, ToolPage, ToolHeader, ToolSection } from '../../../components/index.js?v=v1-surface-convergence-1';
import { ToolForge } from './tool-forge.js';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

export default function Toolkit() {
  const [herramienta, setHerramienta] = useState(HERRAMIENTAS[0]);
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  const [generando, setGenerando] = useState(false);
  const [modelos, setModelos] = useState([]);
  const [modelo, setModelo] = useState('');
  const [err, setErr] = useState('');
  const [seccion, setSeccion] = useState(globalThis.__auroraOpenForge ? 'forge' : 'rapidas');
  const salidaRef = useRef('');

  useEffect(() => {
    globalThis.__auroraOpenForge = false;
    fetchModels().then(ms => {
      setModelos(ms);
      if (ms.length && !modelo) setModelo(ms[0].id || ms[0]);
    });
  }, []);

  useEffect(() => registerAIView({
    id: 'toolkit',
    description: 'Herramientas rápidas y Tool Forge de Aurora.',
    actions: {
      resume: {
        description: 'Resume qué herramienta, sección y salida están activas.',
        readOnly: true,
        run: () => ({
          section: seccion, generating: generando,
          selectedTool: herramienta?.id || null,
          inputChars: entrada.length, outputChars: salida.length,
          models: modelos.length,
        }),
      },
      list_tools: {
        description: 'Lista las herramientas rápidas visibles en Toolkit.',
        readOnly: true,
        run: () => HERRAMIENTAS.map(item => ({ id: item.id, name: item.nombre, description: item.descripcion })),
      },
      open_forge: {
        description: 'Abre la sección Tool Forge sin ejecutar ni aprobar paquetes.',
        run: () => { setSeccion('forge'); return { section: 'forge' }; },
      },
      select_tool: {
        description: 'Selecciona una herramienta rápida por id, sin ejecutarla.',
        input: { id: { type: 'string', required: true } },
        run: ({ id }) => {
          const found = HERRAMIENTAS.find(item => item.id === id);
          if (!found) throw new Error(`Herramienta Toolkit desconocida: ${id}`);
          setHerramienta(found);
          setSeccion('rapidas');
          return { selectedTool: found.id, name: found.nombre };
        },
      },
    },
  }), [seccion, generando, herramienta, entrada, salida, modelos]);

  const ejecutar = async () => {
    if (!entrada.trim() || generando) return;
    setGenerando(true);
    setErr('');
    setSalida('');
    salidaRef.current = '';
    try {
      await sendToLyra({
        message: entrada,
        model: modelo,
        system: herramienta.system,
        pure_system: true,
        onToken: (t) => {
          salidaRef.current += t;
          setSalida(salidaRef.current);
        },
      });
    } catch (e) {
      setErr(e.message);
    }
    setGenerando(false);
  };

  const copiar = () => copiarTexto(salida);

  return html`
    <${ToolPage} wide>
      <${ToolHeader} icon="toolkit" eyebrow="Transformación" title="Toolkit" description="Una operación clara sobre el texto activo." actions=${html`
        <${Chip} active=${seccion === 'rapidas'} onClick=${() => setSeccion('rapidas')}>Rápidas<//>
        <${Chip} active=${seccion === 'forge'} onClick=${() => setSeccion('forge')}><${Icon} name="package" size=${14}/> Forge<//>
      `} />

      ${seccion === 'forge' ? html`<${ToolForge} />` : html`

      <div class="tool-choice-grid">
        ${HERRAMIENTAS.map(h => html`
          <${Panel}
            key=${h.id}
            onClick=${() => setHerramienta(h)}
            interactive
            active=${herramienta.id === h.id}
            class="text-left"
          >
            <${PanelBody}>
              <div class="text-sm inline-flex items-center gap-2"><${Icon} name=${h.icono} size=${15}/> ${h.nombre}</div>
              <div class="text-[10px] text-white/40 mt-0.5">${h.descripcion}</div>
            <//>
          <//>
        `)}
      </div>

      <${ToolSection} title=${herramienta.nombre} description=${herramienta.descripcion}>
        <${Textarea} class="w-full h-32 font-mono resize-y" placeholder=${`Texto para "${herramienta.nombre}"…`} value=${entrada} onInput=${e => setEntrada(e.target.value)} spellcheck="false" />
        <div class="flex items-center gap-2 mt-2 flex-wrap">
          <${Select} size="sm" class="min-w-0 flex-shrink" value=${modelo} onChange=${e => setModelo(e.target.value)}>
            ${modelos.map(m => { const id = m.id || m; return html`<option key=${id} value=${id}>${id}</option>`; })}
          <//>
          <span class="flex-1" />
          ${generando && html`<${Button} icon="stop" size="sm" variant="danger" onClick=${cancelarMensaje}>Cancelar<//>`}
          <${Button} icon="play" size="sm" variant="primary" onClick=${ejecutar} disabled=${generando || !entrada.trim()}>${generando ? 'Generando…' : herramienta.nombre}<//>
        </div>
      <//>

      ${err && html`<div class="text-xs text-red-400/70 mb-2">${err}</div>`}

      ${(salida || generando) && html`
        <${Panel} class="relative"><${PanelBody}>
          <${Button} icon="copy" iconOnly onClick=${copiar} title="Copiar" class="absolute top-2 right-2" />
          <div class="text-sm pr-8" dangerouslySetInnerHTML=${{ __html: renderMarkdown(salida || '…') }} />
        <//><//>
      `}
      `}
    <//>
  `;
}
