const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useCallback, useRef } = globalThis.preactHooks;
import { prompts, cargarPrompts, guardarPrompt, borrarPrompt, toggleFavorito, registrarUso,
  addHistorial, getHistorial, clearHistorial,
  addGuardado, getGuardados, deleteGuardado,
  detectarVariables, reemplazarVariables } from '../scripts/guardar.js';
import { filtrar, categorias } from '../scripts/filtros.js';
import { importarPlantillas } from '../scripts/plantillas.js';
import { generarIdea, ideaAPrompt, getTematicas } from '../scripts/ideas.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { Button } from '../../../components/Button.js';
import { Input, Select, Textarea } from '../../../components/Input.js';
import { Chip } from '../../../components/Chip.js';
import { AutoFitChips } from '../../../components/shared/iconButton.js';
import { Panel, PanelHeader, PanelBody, PanelFooter } from '../../../components/Panel.js';
import { Empty } from '../../../components/Empty.js';
import { getTeamRoles } from '../../../components/shared/builder-api.js';
import TabComfyUI from './prompts-comfyui.js';
import TabWan from './prompts-wan.js';
import { TeamRolesEditor } from './editor-roles.js';
import { CreativityIdeasEditor } from './editor-ideas.js';

const AI_DESTINOS = [
  { id: 'lyra',     label: '🦙 Lyra (local)', url: null },
  { id: 'chatgpt',    label: '💬 ChatGPT',        url: 'https://chatgpt.com' },
  { id: 'claude',     label: '◆ Claude',          url: 'https://claude.ai' },
  { id: 'gemini',     label: '✦ Gemini',          url: 'https://gemini.google.com' },
  { id: 'perplexity', label: '◑ Perplexity',      url: 'https://www.perplexity.ai' },
];

const SECCIONES = [
  { id: 'biblioteca', label: '📚 Biblioteca' },
  { id: 'historial',  label: '🕐 Historial'  },
  { id: 'guardados',  label: '💾 Guardados'  },
  { id: 'ideas',      label: '💡 Ideas'      },
  { id: 'equipo',     label: '👥 Equipo AI'  },
  { id: 'comfyui',   label: '🖼 ComfyUI'    },
  { id: 'wan',        label: '🎬 Wan Video'  },
];

function _tematicaAEstilo(tematica) {
  const m = { libro:'cinematic photo of', musica:'digital art of', mundos:'concept art of',
    historia:'oil painting of', terror:'dark horror art of', fantasia:'fantasy art of',
    scifi:'sci-fi concept art of', romance:'romantic photography of' };
  return m[tematica] || 'cinematic photo of';
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function rand(arr) { return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }

// ─── ModalVariables ──────────────────────────────────────────────────────────

function ModalVariables({ prompt, onClose, onEnviar }) {
  const vars = detectarVariables(prompt.contenido);
  const [vals, setVals] = useState({});
  const [destino, setDestino] = useState('lyra');
  const preview = reemplazarVariables(prompt.contenido, vals);

  return html`
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick=${onClose}>
      <${Panel} class="w-[min(560px,100%)] max-h-[88vh] flex flex-col" onClick=${e => e.stopPropagation()}>
        <${PanelHeader}>
          <span class="text-sm font-bold text-aurora-text">✦ ${prompt.nombre}</span>
          <${Button} size="sm" onClick=${onClose}>✕</${Button}>
        </${PanelHeader}>
        <${PanelBody} class="flex flex-col gap-3 overflow-y-auto">
          ${vars.length > 0 && html`
            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold text-aurora-text-muted uppercase">Variables</label>
              ${vars.map(v => html`
                <div key=${v} class="flex flex-col gap-1">
                  <span class="text-xs font-mono text-aurora-accent">{{${v}}}</span>
                  <${Input} placeholder=${v} value=${vals[v] || ''}
                    onInput=${e => setVals(prev => ({ ...prev, [v]: e.target.value }))} />
                </div>
              `)}
            </div>
          `}
          <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-aurora-text-muted uppercase">Preview</label>
            <pre class="bg-aurora-surface border border-aurora-border rounded-md p-3 text-xs text-aurora-text-dim whitespace-pre-wrap max-h-[300px] overflow-auto font-mono">${preview}</pre>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-aurora-text-muted uppercase">Enviar a</label>
            <${Select} value=${destino} onChange=${e => setDestino(e.target.value)}>
              ${AI_DESTINOS.map(d => html`<option key=${d.id} value=${d.id}>${d.label}</option>`)}
            </${Select}>
          </div>
        </${PanelBody}>
        <${PanelFooter} class="justify-end">
          <${Button} onClick=${onClose}>Cancelar</${Button}>
          <${Button} onClick=${() => copiarTexto(preview)}>⧉ Copiar</${Button}>
          <${Button} variant="primary" onClick=${() => { onEnviar(preview, destino); onClose(); }}>▶ Enviar</${Button}>
        </${PanelFooter}>
      </${Panel}>
    </div>
  `;
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function Editor({ inicial, onCerrar, onGuardado }) {
  const [nombre, setNombre]       = useState(inicial?.nombre || '');
  const [contenido, setContenido] = useState(inicial?.contenido || '');
  const [categoria, setCategoria] = useState(inicial?.categoria || '');
  const [tags, setTags]           = useState(inicial?.tags || '');
  const [err, setErr]             = useState('');

  const guardar = async () => {
    if (!nombre.trim() || !contenido.trim()) { setErr('Nombre y contenido requeridos'); return; }
    try {
      await guardarPrompt({ id: inicial?.id, nombre: nombre.trim(), contenido, categoria: categoria || null, tags: tags || null });
      onGuardado();
    } catch (e) { setErr(e.message); }
  };

  return html`
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick=${onCerrar}>
      <${Panel} class="w-[min(560px,100%)] max-h-[88vh] flex flex-col" onClick=${e => e.stopPropagation()}>
        <${PanelHeader}>
          <span class="text-sm font-bold text-aurora-text">${inicial?.id ? 'Editar prompt' : 'Nuevo prompt'}</span>
          <${Button} size="sm" onClick=${onCerrar}>✕</${Button}>
        </${PanelHeader}>
        <${PanelBody} class="flex flex-col gap-3 overflow-y-auto">
          ${err && html`<div class="text-xs text-aurora-error">${err}</div>`}
          <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-aurora-text-muted uppercase">Nombre</label>
            <${Input} placeholder="Nombre" value=${nombre} onInput=${e => setNombre(e.target.value)} />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-aurora-text-muted uppercase">Contenido — usá <code>{{variables}}</code> para placeholders</label>
            <${Textarea} rows="6" class="font-mono" placeholder="Contenido del prompt…" value=${contenido} onInput=${e => setContenido(e.target.value)} />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-aurora-text-muted uppercase">Categoría</label>
              <${Input} placeholder="Categoría" value=${categoria} onInput=${e => setCategoria(e.target.value)} />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-aurora-text-muted uppercase">Tags</label>
              <${Input} placeholder="tags,separados,por,coma" value=${tags} onInput=${e => setTags(e.target.value)} />
            </div>
          </div>
        </${PanelBody}>
        <${PanelFooter} class="justify-end">
          <${Button} onClick=${onCerrar}>Cancelar</${Button}>
          <${Button} variant="primary" onClick=${guardar}>Guardar</${Button}>
        </${PanelFooter}>
      </${Panel}>
    </div>
  `;
}

// ─── Tab Biblioteca ──────────────────────────────────────────────────────────

function TabBiblioteca({ lista, onEnviarPrompt }) {
  const [busqueda, setBusqueda]     = useState('');
  const [categoria, setCategoria]   = useState('');
  const [soloFav, setSoloFav]       = useState(false);
  const [editando, setEditando]     = useState(null);
  const [varPrompt, setVarPrompt]   = useState(null);
  const [importando, setImportando] = useState(false);
  const [msg, setMsg]               = useState('');

  const copiar = async (p) => {
    if (detectarVariables(p.contenido).length) { setVarPrompt(p); return; }
    await copiarTexto(p.contenido);
    registrarUso(p.id);
    addHistorial(p.contenido, p.nombre, null).catch(() => {});
  };

  const importar = async () => {
    if (importando) return;
    setImportando(true);
    try {
      const r = await importarPlantillas();
      setMsg(`✓ ${r.importados} importados, ${r.omitidos} ya existían`);
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setMsg(`Error: ${e.message}`);
      setTimeout(() => setMsg(''), 4000);
    } finally { setImportando(false); }
  };

  useEffect(() => {
    setViewActions([
      { id: 'nuevo-prompt', icon: '＋', title: 'Nuevo prompt', onClick: () => setEditando({}) },
      { id: 'import', icon: '⬇', title: 'Importar plantillas', onClick: importar, disabled: () => importando },
    ]);
    return () => clearViewActions();
  }, [importando]);

  const visibles = filtrar(lista, { busqueda, categoria, soloFavoritos: soloFav });
  const cats = categorias(lista);

  const enviarDesdeModal = async (texto, destino) => {
    if (varPrompt) {
      registrarUso(varPrompt.id);
      addHistorial(texto, varPrompt.nombre, destino).catch(() => {});
    }
    const ai = AI_DESTINOS.find(d => d.id === destino);
    if (ai?.url) { await copiarTexto(texto); window.open(ai.url, '_blank', 'noopener'); }
    else onEnviarPrompt(texto);
  };

  return html`
    <div class="flex flex-col gap-3 flex-1 overflow-clip">
      ${msg && html`<div class="text-xs text-aurora-text-muted">${msg}</div>`}
      <div class="flex gap-1.5 items-center">
        <${Input} class="flex-1" placeholder="Buscar…" value=${busqueda}
          onInput=${e => setBusqueda(e.target.value)} />
        <${Select} value=${categoria} onChange=${e => setCategoria(e.target.value)}>
          <option value="">Todas</option>
          ${cats.map(c => html`<option key=${c} value=${c}>${c}</option>`)}
        </${Select}>
        <${Chip} active=${soloFav} onClick=${() => setSoloFav(!soloFav)}>★ Favs</${Chip}>
      </div>

      ${visibles.length === 0 && html`
        <${Empty} icon="✦" title="Sin prompts">Creá el primero con ＋ o importá plantillas.</${Empty}>
      `}

      <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
        ${visibles.map(p => html`
          <div key=${p.id} class="flex flex-col gap-1.5 bg-aurora-surface border border-aurora-border rounded-lg p-3 cursor-pointer transition-colors hover:border-aurora-accent hover:bg-[color-mix(in_srgb,var(--aurora-accent)_4%,var(--aurora-surface))]" onClick=${() => copiar(p)}>
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                ${p.categoria && html`<div class="text-[10px] text-aurora-text-muted uppercase">${p.categoria}</div>`}
                <div class="text-sm font-semibold text-aurora-text truncate">${p.nombre}</div>
              </div>
              <${Chip} active=${p.favorito} variant="accent" onClick=${e => { e.stopPropagation(); toggleFavorito(p.id); }}>★</${Chip}>
            </div>
            <div class="text-xs text-aurora-text-dim line-clamp-2">${p.contenido}</div>
            <div class="flex items-center gap-1 flex-wrap" onClick=${e => e.stopPropagation()}>
              ${detectarVariables(p.contenido).length > 0 && html`<${Chip} variant="accent">{{vars}}</${Chip}>`}
              ${p.usos > 0 && html`<span class="text-[10px] text-aurora-text-muted">${p.usos} usos</span>`}
              <${Button} size="sm" class="ml-auto" onClick=${() => setEditando(p)}>✎</${Button}>
              <${Button} size="sm" variant="danger" onClick=${() => borrarPrompt(p.id)}>🗑</${Button}>
            </div>
          </div>
        `)}
      </div>

      ${varPrompt !== null && html`
        <${ModalVariables} prompt=${varPrompt} onClose=${() => setVarPrompt(null)} onEnviar=${enviarDesdeModal} />
      `}
      ${editando !== null && html`
        <${Editor} inicial=${editando.id ? editando : null} onCerrar=${() => setEditando(null)} onGuardado=${() => setEditando(null)} />
      `}
    </div>
  `;
}

// ─── Tab Historial ───────────────────────────────────────────────────────────

function TabHistorial() {
  const [items, setItems] = useState([]);
  const [copiado, setCopiado] = useState(null);

  useEffect(() => { getHistorial().then(setItems); }, []);

  const limpiar = async () => {
    if (!confirm('¿Limpiar todo el historial?')) return;
    await clearHistorial(); setItems([]);
  };

  const copiar = async (it) => {
    await copiarTexto(it.contenido);
    setCopiado(it.id); setTimeout(() => setCopiado(null), 1200);
  };

  const guardar = async (it) => {
    await addGuardado(it.contenido, it.nombre);
    setCopiado(`g_${it.id}`); setTimeout(() => setCopiado(null), 1200);
  };

  return html`
    <div class="flex flex-col gap-3 flex-1 overflow-clip">
      <div class="flex items-center gap-2">
        <span class="text-xs text-aurora-text-dim flex-1">${items.length} entradas</span>
        ${items.length > 0 && html`<${Button} variant="danger" size="sm" onClick=${limpiar}>🗑 Limpiar</${Button}>`}
      </div>
      ${items.length === 0 && html`<${Empty} icon="🕐" title="Sin historial todavía" />`}
      ${items.map(it => html`
        <div key=${it.id} class="bg-aurora-surface border border-aurora-border rounded-lg p-3">
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-aurora-text truncate">${it.nombre || '(sin nombre)'}</div>
              <div class="text-[10px] text-aurora-text-muted">${it.destino_ai || ''} · ${new Date((it.enviado_en || 0) * 1000).toLocaleString()}</div>
            </div>
            <${Button} size="sm" onClick=${() => copiar(it)}>${copiado === it.id ? '✓' : '⧉'}</${Button}>
            <${Button} size="sm" onClick=${() => guardar(it)}>${copiado === `g_${it.id}` ? '✓' : '💾'}</${Button}>
          </div>
          <div class="mt-2 text-xs text-aurora-text-dim">${it.contenido}</div>
        </div>
      `)}
    </div>
  `;
}

// ─── Tab Guardados ───────────────────────────────────────────────────────────

function TabGuardados() {
  const [items, setItems] = useState([]);
  const [copiado, setCopiado] = useState(null);

  useEffect(() => { getGuardados().then(setItems); }, []);

  const borrar = async (id) => { await deleteGuardado(id); setItems(prev => prev.filter(i => i.id !== id)); };
  const copiar = async (it) => { await copiarTexto(it.contenido); setCopiado(it.id); setTimeout(() => setCopiado(null), 1200); };

  return html`
    <div class="flex flex-col gap-3 flex-1 overflow-clip">
      <span class="text-xs text-aurora-text-dim">${items.length} guardados (máx 200)</span>
      ${items.length === 0 && html`<${Empty} icon="💾" title="Sin outputs guardados">Usá 💾 desde el historial.</${Empty}>`}
      ${items.map(it => html`
        <div key=${it.id} class="bg-aurora-surface border border-aurora-border rounded-lg p-3">
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-aurora-text truncate">${it.nombre || '(sin nombre)'}</div>
              <div class="text-[10px] text-aurora-text-muted">${it.tipo !== 'general' ? it.tipo : ''} · ${new Date((it.creado_en || 0) * 1000).toLocaleDateString()}</div>
            </div>
            <${Button} size="sm" onClick=${() => copiar(it)}>${copiado === it.id ? '✓' : '⧉ copiar'}</${Button}>
            <${Button} size="sm" variant="danger" onClick=${() => borrar(it.id)}>🗑</${Button}>
          </div>
          <div class="mt-2 text-xs text-aurora-text-dim">${it.contenido}</div>
        </div>
      `)}
    </div>
  `;
}

// ─── Tab Ideas ───────────────────────────────────────────────────────────────

function TabIdeas({ onEnviarPrompt, onIdeaAComfy, onIdeaAWan }) {
  const [tematicas, setTematicas] = useState([]);
  const [tematica, setTematica]   = useState('general');
  const [idea, setIdea]           = useState(null);
  const [copiado, setCopiado]     = useState(false);
  const [historial, setHistorial] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    getTematicas().then(ts => { setTematicas(ts); if (ts.length) setTematica(ts[0]); });
  }, []);

  const generar = async () => {
    const i = await generarIdea(tematica);
    setIdea(i); setCopiado(false);
    setHistorial(prev => [i, ...prev].slice(0, 10));
  };

  const copiar = async () => {
    if (!idea) return;
    await copiarTexto(ideaAPrompt(idea));
    setCopiado(true); setTimeout(() => setCopiado(false), 1500);
  };

  return html`
    <div class="flex flex-col gap-4 flex-1 overflow-clip">
      <div class="flex gap-2 items-center flex-wrap">
        <${Select} class="flex-1 min-w-[140px]" value=${tematica} onChange=${e => setTematica(e.target.value)}>
          ${tematicas.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
        </${Select}>
        <${Button} onClick=${generar}>🎲 Generar idea aleatoria</${Button}>
        <${Button} size="sm" onClick=${() => setEditorOpen(true)}>✏ Editar conceptos</${Button}>
      </div>

      ${editorOpen && html`
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick=${() => setEditorOpen(false)}>
          <div onClick=${e => e.stopPropagation()}>
            <${CreativityIdeasEditor} onClose=${() => {
              setEditorOpen(false);
              getTematicas().then(ts => { setTematicas(ts); if (ts.length && !ts.includes(tematica)) setTematica(ts[0]); });
            }} />
          </div>
        </div>
      `}

      ${idea && html`
        <div class="bg-aurora-surface border border-aurora-border rounded-lg p-4 flex flex-col gap-2">
          <div class="text-[11px] text-aurora-text-muted uppercase font-bold">Idea generada · ${idea.tematica}</div>
          <div class="grid grid-cols-2 gap-1.5">
            ${[['Personaje', idea.personaje], ['Escenario', idea.escenario], ['Conflicto', idea.conflicto], ['Giro', idea.giro], ['Tema', idea.tema]].map(([k, v]) => html`
              <div key=${k} class="flex flex-col gap-0.5">
                <span class="text-[10px] text-aurora-text-muted uppercase">${k}</span>
                <span class="text-xs text-aurora-text">${v}</span>
              </div>
            `)}
          </div>
          <div class="flex gap-1.5 flex-wrap mt-1">
            <${Button} size="sm" onClick=${copiar}>${copiado ? '✓ copiado' : '⧉ Copiar'}</${Button}>
            <${Button} size="sm" onClick=${() => onEnviarPrompt(ideaAPrompt(idea))}>▶ Enviar a Lyra</${Button}>
            ${onIdeaAComfy && html`<${Button} size="sm" variant="primary" onClick=${() => onIdeaAComfy(idea)}>🖼 → ComfyUI</${Button}>`}
            ${onIdeaAWan   && html`<${Button} size="sm" variant="primary" onClick=${() => onIdeaAWan(idea)}>🎬 → Wan</${Button}>`}
          </div>
        </div>
      `}

      ${historial.length > 1 && html`
        <div class="flex flex-col gap-1">
          ${historial.slice(1).map((i, idx) => html`
            <div key=${idx} class="bg-aurora-surface border border-aurora-border rounded-md px-3 py-2 text-xs cursor-pointer hover:border-aurora-accent transition-colors" onClick=${() => setIdea(i)}>
              <span>${i.personaje}</span> · <span class="opacity-60">${i.escenario}</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

// ─── Tab Equipo AI ───────────────────────────────────────────────────────────

function TabEquipo({ onEnviarPrompt }) {
  const [roles, setRoles] = useState([]);
  const [objetivo, setObjetivo] = useState('');
  const [outputs, setOutputs]   = useState({});
  const [copiado, setCopiado]   = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    getTeamRoles().then(r => setRoles(r || [])).catch(() => {});
  }, []);

  if (!roles.length) return html`<div class="comfy-loading">Cargando roles…</div>`;

  const miembros = roles[0]?.default_members || [];

  const generar = (rol) => {
    const prompt = (rol.prompt_template || '').replace(/\{\{objetivo\}\}/g, objetivo || '(sin objetivo)');
    copiarTexto(prompt);
    setOutputs(prev => ({ ...prev, [rol.id]: prompt }));
    setCopiado(rol.id); setTimeout(() => setCopiado(null), 1200);
  };

  const enviarChat = (rolId) => {
    const txt = outputs[rolId];
    if (txt) onEnviarPrompt(txt);
  };

  return html`
    <div class="flex flex-col gap-4 flex-1 overflow-clip">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-aurora-text-muted uppercase">🎯 Objetivo</label>
          <div class="flex gap-1">
            <${Button} size="sm" onClick=${() => {
              const ejemplos = ['Crear un sistema de inventario con React', 'Diseñar una API REST para blog', 'Refactorizar módulo de autenticación'];
              setObjetivo(rand(ejemplos));
            }}>🎲 Generar</${Button}>
            <${Button} size="sm" onClick=${() => setEditorOpen(true)}>✏ Editar roles</${Button}>
          </div>
        </div>
        <${Textarea} rows="3" placeholder="Describe el proyecto o tarea para todo el equipo…" value=${objetivo}
          onInput=${e => setObjetivo(e.target.value)} />
      </div>

      <div class="flex flex-col gap-2">
        ${(miembros.length ? miembros : roles).map(m => {
          const rol = roles.find(r => r.id === (m.rolId || m.id)) || m;
          return html`
            <div key=${rol.id} class="bg-aurora-surface border border-aurora-border rounded-lg p-3 flex flex-col gap-2">
              <div class="flex items-center gap-2.5">
                <span class="text-xl flex-shrink-0">${rol.icono || '🤖'}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-aurora-text">${rol.nombre}</div>
                  ${m.cargo && html`<div class="text-xs text-aurora-text-dim">${m.cargo}</div>`}
                </div>
                ${outputs[rol.id] && html`<span class="text-xs text-aurora-accent">✓</span>`}
                <div class="flex gap-1">
                  <${Button} size="sm" onClick=${() => generar(rol)} title="Copiar prompt del rol">
                    ${copiado === rol.id ? '✓' : '⚡'}
                  </${Button}>
                  ${outputs[rol.id] && html`
                    <${Button} size="sm" onClick=${() => enviarChat(rol.id)} title="Enviar al chat local">→ Chat</${Button}>
                    <${Button} size="sm" onClick=${() => addGuardado(outputs[rol.id], rol.nombre)} title="Guardar">💾</${Button}>
                  `}
                </div>
              </div>
              ${outputs[rol.id] && html`
                <div class="text-xs text-aurora-text-dim bg-[color-mix(in_srgb,var(--aurora-accent)_5%,transparent)] rounded p-2">${outputs[rol.id].slice(0, 140)}…</div>
              `}
            </div>
          `;
        })}
      </div>

      <div>
        <h4 class="text-[11px] text-aurora-text-muted uppercase font-bold mb-2">Roles disponibles</h4>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
          ${roles.map(r => html`
            <div key=${r.id} class="bg-aurora-surface border border-aurora-border rounded-md px-3 py-2 flex items-center gap-2 cursor-pointer hover:border-aurora-accent transition-colors text-xs" onClick=${() => generar(r)}>
              <span class="text-base">${r.icono || '🤖'}</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-aurora-text truncate">${r.nombre}</div>
                ${r.prompt_template && html`<div class="text-[9px] text-aurora-text-dim">${r.prompt_template.slice(0,50)}…</div>`}
              </div>
            </div>
          `)}
        </div>
      </div>

      ${editorOpen && html`
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick=${() => setEditorOpen(false)}>
          <div onClick=${e => e.stopPropagation()}>
            <${TeamRolesEditor} onClose=${() => { setEditorOpen(false); getTeamRoles().then(r => setRoles(r || [])); }} />
          </div>
        </div>
      `}
    </div>
  `;
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function Prompts() {
  const [lista, setLista] = useState(prompts.value);
  const [tab, setTab]     = useState('biblioteca');

  useEffect(() => {
    cargarPrompts();
    return prompts.subscribe(setLista);
  }, []);

  const enviarALyra = useCallback((texto) => {
    window.dispatchEvent(new CustomEvent('aurora:sendToLocal', { detail: { texto } }));
  }, []);

  const irAComfy = useCallback((idea) => {
    setTab('comfyui');
  }, []);

  const irAWan = useCallback((idea) => {
    setTab('wan');
  }, []);

  return html`
    <div class="prompts-view">
      <${AutoFitChips} class="prompts-nav">
        ${SECCIONES.map(s => html`
          <${Chip} key=${s.id} active=${tab === s.id} onClick=${() => setTab(s.id)}>${s.label}<//>
        `)}
      <//>

      ${tab === 'biblioteca' && html`<${TabBiblioteca} lista=${lista} onEnviarPrompt=${enviarALyra} />`}
      ${tab === 'historial'  && html`<${TabHistorial} />`}
      ${tab === 'guardados'  && html`<${TabGuardados} />`}
      ${tab === 'ideas'      && html`<${TabIdeas} onEnviarPrompt=${enviarALyra} onIdeaAComfy=${irAComfy} onIdeaAWan=${irAWan} />`}
      ${tab === 'equipo'     && html`<${TabEquipo} onEnviarPrompt=${enviarALyra} />`}
      ${tab === 'comfyui'   && html`<${TabComfyUI} />`}
      ${tab === 'wan'        && html`<${TabWan} />`}
    </div>
  `;
}
