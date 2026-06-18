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

const AI_DESTINOS = [
  { id: 'gemita',     label: '🦙 Gemita (local)', url: null },
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

const WAN_ORDEN = ['apertura','sujeto','camara','reveal','iluminacion','estilo','movimiento_sujeto'];
const COMFY_ORDEN = ['estilo','sujeto','pose','detalle_sujeto','iluminacion','escenario','encuadre','calidad'];

function _tematicaAEstilo(tematica) {
  const m = { libro:'cinematic photo of', musica:'digital art of', mundos:'concept art of',
    historia:'oil painting of', terror:'dark horror art of', fantasia:'fantasy art of',
    scifi:'sci-fi concept art of', romance:'romantic photography of' };
  return m[tematica] || 'cinematic photo of';
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function rand(arr) { return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }

function useFetch(url) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(new URL(url, import.meta.url)).then(r => r.ok ? r.json() : null).then(d => d && setData(d)).catch(() => {});
  }, [url]);
  return data;
}

// ─── ModalVariables ──────────────────────────────────────────────────────────

function ModalVariables({ prompt, onClose, onEnviar }) {
  const vars = detectarVariables(prompt.contenido);
  const [vals, setVals] = useState({});
  const [destino, setDestino] = useState('gemita');
  const preview = reemplazarVariables(prompt.contenido, vals);

  return html`
    <div class="prompts-overlay" onClick=${onClose}>
      <div class="prompts-modal" onClick=${e => e.stopPropagation()}>
        <div class="prompts-modal-header">
          <h3>✦ ${prompt.nombre}</h3>
          <button class="btn-icon" onClick=${onClose}>✕</button>
        </div>
        <div class="prompts-modal-body">
          ${vars.length > 0 && html`
            <div class="vars-list">
              <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Variables</label>
              ${vars.map(v => html`
                <div class="var-item" key=${v}>
                  <span class="var-label">{{${v}}}</span>
                  <input class="var-input" placeholder=${v} value=${vals[v] || ''}
                    onInput=${e => setVals(prev => ({ ...prev, [v]: e.target.value }))} />
                </div>
              `)}
            </div>
          `}
          <div class="ui-form-field">
            <label>Preview</label>
            <pre class="prompt-preview-box">${preview}</pre>
          </div>
          <div class="ui-form-field">
            <label>Enviar a</label>
            <select value=${destino} onChange=${e => setDestino(e.target.value)}>
              ${AI_DESTINOS.map(d => html`<option key=${d.id} value=${d.id}>${d.label}</option>`)}
            </select>
          </div>
        </div>
        <div class="prompts-modal-footer">
          <button onClick=${onClose}>Cancelar</button>
          <button onClick=${() => copiarTexto(preview)}>⧉ Copiar</button>
          <button class="btn-primary" onClick=${() => { onEnviar(preview, destino); onClose(); }}>▶ Enviar</button>
        </div>
      </div>
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
    <div class="prompts-overlay" onClick=${onCerrar}>
      <div class="prompts-modal" onClick=${e => e.stopPropagation()}>
        <div class="prompts-modal-header">
          <h3>${inicial?.id ? 'Editar prompt' : 'Nuevo prompt'}</h3>
          <button class="btn-icon" onClick=${onCerrar}>✕</button>
        </div>
        <div class="prompts-modal-body">
          ${err && html`<div style="color:var(--error);font-size:12px">${err}</div>`}
          <div class="ui-form-field">
            <label>Nombre</label>
            <input placeholder="Nombre" value=${nombre} onInput=${e => setNombre(e.target.value)} />
          </div>
          <div class="ui-form-field">
            <label>Contenido — usá <code>{{variables}}</code> para placeholders</label>
            <textarea style="min-height:160px;font-family:var(--font-mono)"
              placeholder="Contenido del prompt…" value=${contenido} onInput=${e => setContenido(e.target.value)} />
          </div>
          <div class="ui-form-row">
            <div class="ui-form-field">
              <label>Categoría</label>
              <input placeholder="Categoría" value=${categoria} onInput=${e => setCategoria(e.target.value)} />
            </div>
            <div class="ui-form-field">
              <label>Tags</label>
              <input placeholder="tags,separados,por,coma" value=${tags} onInput=${e => setTags(e.target.value)} />
            </div>
          </div>
        </div>
        <div class="prompts-modal-footer">
          <button onClick=${onCerrar}>Cancelar</button>
          <button class="btn-primary" onClick=${guardar}>Guardar</button>
        </div>
      </div>
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
    <div class="prompts-section">
      ${msg && html`<div style="font-size:11px;color:var(--text-muted)">${msg}</div>`}
      <div class="prompts-topbar">
        <input class="prompts-search" placeholder="Buscar…" value=${busqueda}
          onInput=${e => setBusqueda(e.target.value)} />
        <select class="prompts-sort" value=${categoria} onChange=${e => setCategoria(e.target.value)}>
          <option value="">Todas</option>
          ${cats.map(c => html`<option key=${c} value=${c}>${c}</option>`)}
        </select>
        <button class=${'prompts-fav-chip' + (soloFav ? ' active' : '')} onClick=${() => setSoloFav(!soloFav)}>★ Favs</button>
      </div>

      ${visibles.length === 0 && html`
        <div class="prompts-empty">
          <span class="prompts-empty-icon">✦</span>
          Sin prompts. Creá el primero con ＋ o importá plantillas.
        </div>
      `}

      <div class="prompts-grid">
        ${visibles.map(p => html`
          <div key=${p.id} class="prompt-card" onClick=${() => copiar(p)}>
            <div class="prompt-card-header">
              <div class="prompt-card-meta">
                ${p.categoria && html`<div class="prompt-cat">${p.categoria}</div>`}
                <div class="prompt-name">${p.nombre}</div>
              </div>
              <button class=${'prompt-fav-btn' + (p.favorito ? ' faved' : '')}
                onClick=${e => { e.stopPropagation(); toggleFavorito(p.id); }}>★</button>
            </div>
            <div class="prompt-preview">${p.contenido}</div>
            <div class="prompt-actions" onClick=${e => e.stopPropagation()}>
              ${detectarVariables(p.contenido).length > 0 && html`<span class="prompt-tag">{{vars}}</span>`}
              ${p.usos > 0 && html`<span class="prompt-stats">${p.usos} usos</span>`}
              <button style="margin-left:auto" onClick=${() => setEditando(p)}>✎</button>
              <button class="btn-danger" onClick=${() => borrarPrompt(p.id)}>🗑</button>
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
    <div class="prompts-section">
      <div class="prompts-topbar">
        <span style="font-size:11px;color:var(--text-dim)">${items.length} entradas</span>
        ${items.length > 0 && html`<button class="btn-danger" onClick=${limpiar}>🗑 Limpiar</button>`}
      </div>
      ${items.length === 0 && html`<div class="prompts-empty"><span class="prompts-empty-icon">🕐</span>Sin historial todavía.</div>`}
      ${items.map(it => html`
        <div key=${it.id} class="prompt-card">
          <div class="prompt-card-header">
            <div class="prompt-card-meta">
              <div class="prompt-name">${it.nombre || '(sin nombre)'}</div>
              <div class="prompt-cat">${it.destino_ai || ''} · ${new Date((it.enviado_en || 0) * 1000).toLocaleString()}</div>
            </div>
            <div class="prompt-actions">
              <button onClick=${() => copiar(it)}>${copiado === it.id ? '✓' : '⧉'}</button>
              <button onClick=${() => guardar(it)}>${copiado === `g_${it.id}` ? '✓' : '💾'}</button>
            </div>
          </div>
          <div class="prompt-preview">${it.contenido}</div>
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
    <div class="prompts-section">
      <div style="font-size:11px;color:var(--text-dim)">${items.length} guardados (máx 200)</div>
      ${items.length === 0 && html`<div class="prompts-empty"><span class="prompts-empty-icon">💾</span>Sin outputs guardados. Usá 💾 desde el historial.</div>`}
      ${items.map(it => html`
        <div key=${it.id} class="prompt-card">
          <div class="prompt-card-header">
            <div class="prompt-card-meta">
              <div class="prompt-name">${it.nombre || '(sin nombre)'}</div>
              <div class="prompt-cat">${it.tipo !== 'general' ? it.tipo : ''} · ${new Date((it.creado_en || 0) * 1000).toLocaleDateString()}</div>
            </div>
            <div class="prompt-actions">
              <button onClick=${() => copiar(it)}>${copiado === it.id ? '✓' : '⧉ copiar'}</button>
              <button class="btn-danger" onClick=${() => borrar(it.id)}>🗑</button>
            </div>
          </div>
          <div class="prompt-preview">${it.contenido}</div>
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
    <div class="prompts-section">
      <div class="ideas-controls">
        <select class="ideas-tematica" value=${tematica} onChange=${e => setTematica(e.target.value)}>
          ${tematicas.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
        </select>
        <button onClick=${generar}>🎲 Generar idea aleatoria</button>
      </div>

      ${idea && html`
        <div class="ideas-result">
          <div class="ideas-result-title">Idea generada · ${idea.tematica}</div>
          <div class="ideas-result-grid">
            ${[['Personaje', idea.personaje], ['Escenario', idea.escenario], ['Conflicto', idea.conflicto], ['Giro', idea.giro], ['Tema', idea.tema]].map(([k, v]) => html`
              <div class="ideas-result-item" key=${k}>
                <span class="label">${k}</span><span class="value">${v}</span>
              </div>
            `)}
          </div>
          <div class="ideas-result-actions">
            <button onClick=${copiar}>${copiado ? '✓ copiado' : '⧉ Copiar'}</button>
            <button onClick=${() => onEnviarPrompt(ideaAPrompt(idea))}>▶ Enviar a Gemita</button>
            ${onIdeaAComfy && html`<button class="ideas-btn-comfy" onClick=${() => onIdeaAComfy(idea)}>🖼 → ComfyUI</button>`}
            ${onIdeaAWan   && html`<button class="ideas-btn-wan"   onClick=${() => onIdeaAWan(idea)}>🎬 → Wan</button>`}
          </div>
        </div>
      `}

      ${historial.length > 1 && html`
        <div class="ideas-historial-mini">
          ${historial.slice(1).map((i, idx) => html`
            <div key=${idx} class="ideas-mini-item" onClick=${() => setIdea(i)}>
              <span>${i.personaje}</span> · <span style="opacity:.6">${i.escenario}</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

// ─── Tab Equipo AI ───────────────────────────────────────────────────────────

function TabEquipo({ onEnviarPrompt }) {
  const rolesData = useFetch('../templates/roles-equipo.tmpl.json');
  const [objetivo, setObjetivo] = useState('');
  const [outputs, setOutputs]   = useState({});
  const [copiado, setCopiado]   = useState(null);

  if (!rolesData) return html`<div class="comfy-loading">Cargando roles…</div>`;

  const roles   = rolesData.roles   || [];
  const miembros = rolesData.defaultMembers || [];

  const generar = (rol) => {
    const prompt = (rol.prompt || '').replace(/\{\{objetivo\}\}/g, objetivo || '(sin objetivo)');
    copiarTexto(prompt);
    setOutputs(prev => ({ ...prev, [rol.id]: prompt }));
    setCopiado(rol.id); setTimeout(() => setCopiado(null), 1200);
  };

  const enviarChat = (rolId) => {
    const txt = outputs[rolId];
    if (txt) onEnviarPrompt(txt);
  };

  return html`
    <div class="prompts-section prompts-equipo">
      <div class="equipo-objetivo">
        <div class="equipo-objetivo-head">
          <label>🎯 Objetivo</label>
          <button class="generador-aleatorio-btn" onClick=${() => {
            const ejemplos = ['Crear un sistema de inventario con React', 'Diseñar una API REST para blog', 'Refactorizar módulo de autenticación'];
            setObjetivo(rand(ejemplos));
          }}>🎲 Generar</button>
        </div>
        <textarea class="equipo-objetivo-input" rows="3" value=${objetivo}
          placeholder="Describe el proyecto o tarea para todo el equipo…"
          onInput=${e => setObjetivo(e.target.value)} />
      </div>

      <div class="equipo-miembros">
        ${(miembros.length ? miembros : roles).map(m => {
          const rol = roles.find(r => r.id === (m.rolId || m.id)) || m;
          return html`
            <div key=${rol.id} class=${'equipo-card' + (outputs[rol.id] ? ' tiene-output' : '')}>
              <div class="equipo-card-head">
                <span class="equipo-icon">${rol.icon || '🤖'}</span>
                <div class="equipo-info">
                  <div class="equipo-nombre">${rol.label}</div>
                  ${m.cargo && html`<div class="equipo-rol">${m.cargo}</div>`}
                </div>
                ${outputs[rol.id] && html`<span class="equipo-nodo-badge">✓</span>`}
                <div class="equipo-card-actions">
                  <button onClick=${() => generar(rol)} title="Copiar prompt del rol">
                    ${copiado === rol.id ? '✓' : '⚡'}
                  </button>
                  ${outputs[rol.id] && html`
                    <button onClick=${() => enviarChat(rol.id)} title="Enviar al chat local">→ Chat</button>
                    <button onClick=${() => addGuardado(outputs[rol.id], rol.label)} title="Guardar">💾</button>
                  `}
                </div>
              </div>
              ${outputs[rol.id] && html`
                <div class="equipo-prompt-preview">${outputs[rol.id].slice(0, 140)}…</div>
              `}
            </div>
          `;
        })}
      </div>

      <div class="equipo-roles-ref">
        <h4>Roles disponibles</h4>
        <div class="equipo-roles-grid">
          ${roles.map(r => html`
            <div key=${r.id} class="equipo-role-card" onClick=${() => generar(r)}>
              <span class="equipo-role-icon">${r.icon || '🤖'}</span>
              <div class="equipo-role-info">
                <div class="equipo-role-name">${r.label}</div>
                ${r.prompt && html`<div class="equipo-role-vars" style="font-size:9px;color:var(--text-dim)">${r.prompt.slice(0,50)}…</div>`}
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

// ─── Tab ComfyUI ─────────────────────────────────────────────────────────────

function TabComfyUI() {
  const chipsData   = useFetch('../templates/comfyui-chips.tmpl.json');
  const [modeloId, setModeloId]     = useState('illustrious');
  const [secciones, setSecciones]   = useState({});
  const [negativos, setNegativos]   = useState([]);
  const [negFree, setNegFree]       = useState('');
  const [nsfw, setNsfw]             = useState(false);
  const [fluxClipL, setFluxClipL]   = useState('');
  const [fluxT5, setFluxT5]         = useState('');
  const [copiado, setCopiado]       = useState(null);

  if (!chipsData) return html`<div class="comfy-loading">Cargando chips…</div>`;

  const modelos    = chipsData.modelos || [];
  const modelo     = modelos.find(m => m.id === modeloId) || modelos[0];
  const modo       = modelo?.modo || 'tags';
  const ordenFilt  = COMFY_ORDEN.filter(id => {
    const s = chipsData.secciones?.find(s => s.id === id);
    return s && (!s.modelos || s.modelos.includes(modeloId)) && (nsfw || !s.nsfw);
  });
  const presetsFilt = (chipsData.presets || []).filter(p => p?.id && !p.id.startsWith('_') && p.modelo === modeloId && (nsfw || !p.nsfw));

  // Build positive preview
  let positivePreview = '';
  if (modo === 'flux') {
    positivePreview = [fluxClipL.trim() && `[clip_l]\n${fluxClipL.trim()}`, fluxT5.trim() && `[t5xxl]\n${fluxT5.trim()}`].filter(Boolean).join('\n\n');
  } else if (modo === 'natural') {
    positivePreview = secciones['natural'] || '';
  } else {
    const qp = nsfw && modelo?.quality_tags_nsfw ? modelo.quality_tags_nsfw : (modelo?.quality_positive || '');
    const partes = ordenFilt.map(id => (secciones[id] || '').trim()).filter(Boolean);
    positivePreview = [qp, ...partes].filter(Boolean).join(', ');
  }
  const negPreview = [modelo?.quality_negative || '', negativos.join(', '), negFree.trim()].filter(Boolean).join(', ');

  const toggleChip = (secId, chip) => {
    setSecciones(prev => {
      const cur = prev[secId] || '';
      const partes = cur ? cur.split(', ').filter(Boolean) : [];
      const idx = partes.indexOf(chip);
      return { ...prev, [secId]: idx >= 0 ? partes.filter((_,i) => i !== idx).join(', ') : [...partes, chip].join(', ') };
    });
  };

  const chipActivo = (secId, chip) => (secciones[secId] || '').split(', ').includes(chip);

  const toggleNeg = (chip) => setNegativos(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);

  const aplicarPreset = (p) => {
    if (modo === 'flux') { setFluxClipL(p.secciones?.clip_l || ''); setFluxT5(p.secciones?.t5xxl || ''); }
    else setSecciones({ ...p.secciones });
    setNegativos([]); setNegFree('');
  };

  const limpiar = () => { setSecciones({}); setNegativos([]); setNegFree(''); setFluxClipL(''); setFluxT5(''); };

  const copiar = async (txt, id) => {
    await copiarTexto(txt);
    setCopiado(id); setTimeout(() => setCopiado(null), 1200);
  };

  const guardar = () => { if (positivePreview) addGuardado(positivePreview, `ComfyUI ${modelo?.label || ''}`); };

  return html`
    <div class="comfy-view">
      <div class="comfy-modelo-row">
        ${modelos.map(m => html`
          <button key=${m.id} class=${'comfy-modelo-btn' + (modeloId === m.id ? ' active' : '')}
            onClick=${() => { setModeloId(m.id); setSecciones({}); setFluxClipL(''); setFluxT5(''); }}
            title=${m.desc || m.label}>${m.icon} ${m.label}</button>
        `)}
        <button class=${'nsfw-toggle' + (nsfw ? ' active' : '')} onClick=${() => setNsfw(!nsfw)}>🔞 NSFW</button>
      </div>

      ${modelo && html`
        <div class="comfy-modelo-hint">
          <span class="comfy-modelo-hint-icon">${modelo.icon}</span>
          <span>${modo === 'flux' ? modelo.hint_clip_l : modelo.hint_prompt}</span>
          <span class="comfy-modelo-cfg">CFG ${modelo.cfg} · Steps ${modelo.steps}</span>
        </div>
      `}

      <div class="comfy-presets-row">
        <span class="comfy-presets-label">Presets</span>
        ${presetsFilt.map(p => html`
          <button key=${p.id} class=${'comfy-preset-btn' + (p.nsfw ? ' nsfw' : '')}
            onClick=${() => aplicarPreset(p)}>${p.label}</button>
        `)}
        <button class="comfy-btn-limpiar" onClick=${limpiar}>✕ Limpiar</button>
      </div>

      <div class="comfy-layout">
        <div class="comfy-constructor">

          ${modo === 'flux' && html`
            <div class="comfy-seccion">
              <div class="comfy-seccion-head">
                <span class="comfy-seccion-icon">📝</span>
                <span class="comfy-seccion-label">CLIP-L (corto)</span>
              </div>
              <textarea class="comfy-free-input" style="min-height:60px" placeholder=${modelo?.hint_clip_l || 'Palabras clave…'}
                value=${fluxClipL} onInput=${e => setFluxClipL(e.target.value)} />
            </div>
            <div class="comfy-seccion">
              <div class="comfy-seccion-head">
                <span class="comfy-seccion-icon">📄</span>
                <span class="comfy-seccion-label">T5-XXL (descripción)</span>
              </div>
              <textarea class="comfy-free-input" style="min-height:100px" placeholder="Descripción detallada en lenguaje natural…"
                value=${fluxT5} onInput=${e => setFluxT5(e.target.value)} />
            </div>
          `}

          ${modo === 'natural' && html`
            <div class="comfy-seccion">
              <div class="comfy-seccion-head">
                <span class="comfy-seccion-icon">📝</span>
                <span class="comfy-seccion-label">Prompt natural</span>
              </div>
              <textarea class="comfy-free-input" style="min-height:140px" placeholder="Descripción en lenguaje natural…"
                value=${secciones['natural'] || ''} onInput=${e => setSecciones(p => ({ ...p, natural: e.target.value }))} />
            </div>
          `}

          ${modo === 'tags' && ordenFilt.map(id => {
            const sec = chipsData.secciones?.find(s => s.id === id);
            if (!sec) return null;
            const chips = sec.chips_por_modelo?.[modeloId] || sec.chips || [];
            const cur = secciones[id] || '';
            return html`
              <div key=${id} class="comfy-seccion">
                <div class="comfy-seccion-head">
                  <span class="comfy-seccion-icon">${sec.icon || '◈'}</span>
                  <span class="comfy-seccion-label">${sec.label}</span>
                  ${cur && html`<button class="comfy-seccion-clear" onClick=${() => setSecciones(p => ({ ...p, [id]: '' }))}>✕</button>`}
                </div>
                <div class="comfy-chips">
                  ${chips.map(chip => html`
                    <button key=${chip} class=${'comfy-chip' + (chipActivo(id, chip) ? ' active' : '')}
                      onClick=${() => toggleChip(id, chip)}>${chip}</button>
                  `)}
                </div>
                <input type="text" class="comfy-free-input" placeholder=${sec.placeholder || 'Texto libre…'}
                  value=${cur} onInput=${e => setSecciones(p => ({ ...p, [id]: e.target.value }))} />
              </div>
            `;
          })}

          <div class="comfy-seccion comfy-seccion-negative">
            <div class="comfy-seccion-head">
              <span class="comfy-seccion-icon">⛔</span>
              <span class="comfy-seccion-label">Negative prompt</span>
              ${(negativos.length > 0 || negFree) && html`
                <button class="comfy-seccion-clear" onClick=${() => { setNegativos([]); setNegFree(''); }}>✕</button>
              `}
            </div>
            <div class="comfy-chips comfy-chips-negative">
              ${(chipsData.negativos_comunes || []).map(chip => html`
                <button key=${chip} class=${'comfy-chip comfy-chip-neg' + (negativos.includes(chip) ? ' active' : '')}
                  onClick=${() => toggleNeg(chip)}>${chip}</button>
              `)}
            </div>
            <input type="text" class="comfy-free-input" placeholder="Negativos adicionales…"
              value=${negFree} onInput=${e => setNegFree(e.target.value)} />
          </div>
        </div>

        <div class="comfy-preview-panel">
          <div class="comfy-preview-head">
            <span class="comfy-preview-title">Positive</span>
            <button class="comfy-copy-btn" onClick=${() => copiar(positivePreview, 'pos')}>
              ${copiado === 'pos' ? '✓' : '⎘ Copiar'}
            </button>
            ${positivePreview && html`<button class="comfy-copy-btn-sm" onClick=${guardar} title="Guardar">💾</button>`}
          </div>
          <pre class="comfy-preview-box comfy-preview-positive">
            ${positivePreview || 'El prompt aparecerá aquí…'}
          </pre>

          ${negPreview && html`
            <div class="comfy-preview-head" style="margin-top:10px">
              <span class="comfy-preview-title">Negative</span>
              <button class="comfy-copy-btn-sm" onClick=${() => copiar(negPreview, 'neg')}>
                ${copiado === 'neg' ? '✓' : '⎘'}
              </button>
            </div>
            <pre class="comfy-preview-box comfy-preview-negative">${negPreview}</pre>
          `}

          <button class="comfy-copy-btn" style="width:100%;margin-top:8px"
            onClick=${() => copiar([positivePreview, negPreview ? `\n\nNEGATIVE:\n${negPreview}` : ''].join(''), 'all')}>
            ${copiado === 'all' ? '✓ Copiado' : '⎘ Copiar todo (positive + negative)'}
          </button>

          ${modelo && html`
            <div class="wan-settings-panel">
              <div class="wan-settings-title">Settings recomendados — ${modelo.label}</div>
              <div class="wan-settings-grid">
                <span>CFG</span><strong>${modelo.cfg}</strong>
                <span>Steps</span><strong>${modelo.steps}</strong>
                <span>Sampler</span><strong>${modelo.sampler || 'euler'}</strong>
                <span>Scheduler</span><strong>${modelo.scheduler || 'normal'}</strong>
                ${modelo.quality_negative && html`<span>Negative</span><strong>Sí</strong>`}
              </div>
              ${modelo.nota && html`<div style="font-size:10px;color:var(--text-dim);margin-top:6px">${modelo.nota}</div>`}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

// ─── Tab Wan Video ───────────────────────────────────────────────────────────

function TabWan() {
  const wanData   = useFetch('../templates/wan-video.tmpl.json');
  const [modoId, setModoId]       = useState('t2v');
  const [secciones, setSecciones] = useState({});
  const [negativos, setNegativos] = useState([]);
  const [negFree, setNegFree]     = useState('');
  const [nsfw, setNsfw]           = useState(false);
  const [copiado, setCopiado]     = useState(null);

  if (!wanData) return html`<div class="comfy-loading">Cargando datos Wan Video…</div>`;

  const modoActual  = wanData.modos?.find(m => m.id === modoId) || wanData.modos?.[0];
  const settings    = wanData.settings?.[modoId] || {};
  const presetsFilt = (wanData.presets || []).filter(p => p?.id && !p.id.startsWith('_') && p.modo === modoId && (nsfw || !p.nsfw));
  const ordenFilt   = [...WAN_ORDEN, ...(nsfw ? ['intimidad','ropa_wan'] : [])].filter(id => {
    if (modoId === 'i2v' && (id === 'sujeto' || id === 'apertura')) return false;
    const s = wanData.secciones?.find(s => s.id === id);
    return s && (nsfw || !s.nsfw);
  });

  const promptCompleto = secciones['_prompt_completo'];
  const positivePreview = promptCompleto || ordenFilt.map(id => (secciones[id] || '').trim()).filter(Boolean).join(', ');
  const negPreview = [negativos.join(', '), negFree.trim()].filter(Boolean).join(', ');

  const chipActivo = (secId, chip) => {
    const cur = secciones[secId] || '';
    return cur === chip || cur.split(', ').includes(chip);
  };

  const toggleChip = (secId, chip) => {
    setSecciones(prev => {
      const cur = prev[secId] || '';
      const partes = cur ? cur.split(', ').filter(Boolean) : [];
      const idx = partes.indexOf(chip);
      return { ...prev, [secId]: idx >= 0 ? partes.filter((_,i) => i !== idx).join(', ') : [...partes, chip].join(', '), _prompt_completo: '' };
    });
  };

  const toggleNeg = (chip) => setNegativos(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);

  const aplicarPreset = (p) => { setSecciones({ ...p.secciones }); setNegativos([]); setNegFree(''); };

  const limpiar = () => { setSecciones({}); setNegativos([]); setNegFree(''); };

  const cargarEjemplo = (ej) => { setSecciones({ _prompt_completo: ej.prompt }); setModoId(ej.modo); };

  const copiar = async (txt, id) => { await copiarTexto(txt); setCopiado(id); setTimeout(() => setCopiado(null), 1200); };

  const guardar = () => { if (positivePreview) addGuardado(positivePreview, `Wan ${modoActual?.label || ''}`); };

  return html`
    <div class="comfy-view wan-view">
      <div class="wan-modo-row">
        ${(wanData.modos || []).map(m => html`
          <button key=${m.id} class=${'wan-modo-btn' + (modoId === m.id ? ' active' : '')}
            onClick=${() => { setModoId(m.id); setSecciones({}); }}
            title=${m.desc || m.label}>${m.icon} ${m.label}</button>
        `)}
        <button class=${'nsfw-toggle' + (nsfw ? ' active' : '')} onClick=${() => setNsfw(!nsfw)}>🔞 NSFW</button>
        ${settings.cfg && html`
          <div class="wan-settings-badge">CFG ${settings.cfg} · Steps ${settings.steps} · ${settings.fps}fps · ${settings.duracion}</div>
        `}
      </div>

      ${settings.nota && html`<div class="wan-hint-bar"><span>ℹ</span> ${settings.nota}</div>`}
      ${modoId === 'i2v' && html`
        <div class="wan-hint-bar wan-hint-i2v">
          <span>🖼</span>
          <span>Modo I2V — la imagen define sujeto y estilo. El prompt <strong>solo describe movimiento</strong>. Mantén el prompt corto (10–30 palabras).</span>
        </div>
      `}

      <div class="comfy-presets-row">
        <span class="comfy-presets-label">Presets</span>
        ${presetsFilt.map(p => html`
          <button key=${p.id} class="comfy-preset-btn" onClick=${() => aplicarPreset(p)}>${p.label}</button>
        `)}
        <button class="comfy-btn-limpiar" onClick=${limpiar}>✕ Limpiar</button>
      </div>

      <div class="comfy-layout wan-layout">
        <div class="comfy-constructor">
          ${ordenFilt.map(id => {
            const sec = wanData.secciones?.find(s => s.id === id);
            if (!sec) return null;
            const chips = sec.chips || [];
            const cur = secciones[id] || '';
            return html`
              <div key=${id} class="comfy-seccion">
                <div class="comfy-seccion-head">
                  <span class="comfy-seccion-icon">${sec.icon || '◈'}</span>
                  <span class="comfy-seccion-label">${sec.label}</span>
                  ${sec.desc && html`<span class="wan-sec-desc">${sec.desc}</span>`}
                  ${cur && html`<button class="comfy-seccion-clear" onClick=${() => setSecciones(p => ({ ...p, [id]: '' }))}>✕</button>`}
                </div>
                <div class="comfy-chips">
                  ${chips.map(chip => html`
                    <button key=${chip} class=${'comfy-chip' + (chipActivo(id, chip) ? ' active' : '')}
                      onClick=${() => toggleChip(id, chip)}>${chip}</button>
                  `)}
                </div>
                <input type="text" class="comfy-free-input" placeholder=${sec.placeholder || 'Texto libre…'}
                  value=${cur} onInput=${e => setSecciones(p => ({ ...p, [id]: e.target.value, _prompt_completo: '' }))} />
              </div>
            `;
          })}

          <div class="comfy-seccion comfy-seccion-negative">
            <div class="comfy-seccion-head">
              <span class="comfy-seccion-icon">⛔</span>
              <span class="comfy-seccion-label">Negative prompt</span>
              ${(negativos.length > 0 || negFree) && html`
                <button class="comfy-seccion-clear" onClick=${() => { setNegativos([]); setNegFree(''); }}>✕</button>
              `}
            </div>
            <div class="comfy-chips comfy-chips-negative">
              ${(wanData.negativos_comunes || []).map(chip => html`
                <button key=${chip} class=${'comfy-chip comfy-chip-neg' + (negativos.includes(chip) ? ' active' : '')}
                  onClick=${() => toggleNeg(chip)}>${chip}</button>
              `)}
            </div>
            <input type="text" class="comfy-free-input" placeholder="Negativos adicionales…"
              value=${negFree} onInput=${e => setNegFree(e.target.value)} />
          </div>

          ${wanData.ejemplos?.length > 0 && html`
            <div class="wan-ejemplos">
              <div class="wan-ejemplos-head">
                <span class="comfy-presets-label">Ejemplos reales</span>
              </div>
              ${wanData.ejemplos.map(ej => html`
                <div key=${ej.id} class="wan-ejemplo" onClick=${() => cargarEjemplo(ej)}>
                  <div class="wan-ejemplo-head">
                    <span class="wan-ejemplo-modo">${wanData.modos?.find(m => m.id === ej.modo)?.icon} ${ej.modo?.toUpperCase()}</span>
                    <span class="wan-ejemplo-label">${ej.label}</span>
                  </div>
                  <p class="wan-ejemplo-preview">${(ej.prompt || '').slice(0, 100)}…</p>
                </div>
              `)}
            </div>
          `}
        </div>

        <div class="comfy-preview-panel">
          <div class="comfy-preview-head">
            <span class="comfy-preview-title">Positive prompt</span>
            <button class="comfy-copy-btn" onClick=${() => copiar(positivePreview, 'pos')}>
              ${copiado === 'pos' ? '✓' : '⎘ Copiar'}
            </button>
            ${positivePreview && html`<button class="comfy-copy-btn-sm" onClick=${guardar} title="Guardar">💾</button>`}
          </div>
          <pre class="comfy-preview-box comfy-preview-positive wan-preview">
            ${positivePreview || 'El prompt aparecerá aquí…\n\nEstructura recomendada:\n[Apertura] → [Sujeto] → [Cámara] → [Reveal] → [Luz] → [Estilo]'}
          </pre>

          ${negPreview && html`
            <div class="comfy-preview-head" style="margin-top:10px">
              <span class="comfy-preview-title">Negative</span>
              <button class="comfy-copy-btn-sm" onClick=${() => copiar(negPreview, 'neg')}>
                ${copiado === 'neg' ? '✓' : '⎘'}
              </button>
            </div>
            <pre class="comfy-preview-box comfy-preview-negative">${negPreview}</pre>
          `}

          <button class="comfy-copy-btn wan-copy-all" onClick=${() => copiar([positivePreview, negPreview ? `\n\nNEGATIVE:\n${negPreview}` : ''].join(''), 'all')}>
            ${copiado === 'all' ? '✓ Copiado' : '⎘ Copiar todo (positive + negative)'}
          </button>

          <div class="wan-settings-panel">
            <div class="wan-settings-title">Settings recomendados — ${modoActual?.label}</div>
            <div class="wan-settings-grid">
              <span>CFG</span><strong>${settings.cfg}</strong>
              <span>Steps</span><strong>${settings.steps}</strong>
              <span>Sampler</span><strong>${settings.sampler}</strong>
              <span>Scheduler</span><strong>${settings.scheduler}</strong>
              <span>FPS</span><strong>${settings.fps}</strong>
              <span>Duración</span><strong>${settings.duracion}</strong>
            </div>
          </div>
        </div>
      </div>
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

  const enviarAGemita = useCallback((texto) => {
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
      <nav class="prompts-nav">
        ${SECCIONES.map(s => html`
          <button key=${s.id} class=${'prompts-nav-btn' + (tab === s.id ? ' active' : '')}
            onClick=${() => setTab(s.id)}>${s.label}</button>
        `)}
      </nav>

      ${tab === 'biblioteca' && html`<${TabBiblioteca} lista=${lista} onEnviarPrompt=${enviarAGemita} />`}
      ${tab === 'historial'  && html`<${TabHistorial} />`}
      ${tab === 'guardados'  && html`<${TabGuardados} />`}
      ${tab === 'ideas'      && html`<${TabIdeas} onEnviarPrompt=${enviarAGemita} onIdeaAComfy=${irAComfy} onIdeaAWan=${irAWan} />`}
      ${tab === 'equipo'     && html`<${TabEquipo} onEnviarPrompt=${enviarAGemita} />`}
      ${tab === 'comfyui'   && html`<${TabComfyUI} />`}
      ${tab === 'wan'        && html`<${TabWan} />`}
    </div>
  `;
}
