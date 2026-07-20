const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { THEMES, BACKGROUNDS, BACKGROUND_SERIES, HUDS } from '../../../components/themes/index.js?v=v9-lyria-presence-1';
import { theme, themeMode, background, hud, guardarTema, guardarThemeMode, guardarBackground, guardarHud } from '../scripts/tema.js';
import { llms, cargarLLMs, crearLLM, borrarLLM } from '../scripts/llms.js';
import { crearSnapshotAjustes, descargarJSON, leerJSONArchivo } from '../scripts/export.js';
import { mostrarTemporal } from '../../../components/shared/flash.js';
import { getJSON, putJSON } from '../../../components/shared/api.js';
import { iniciarTemaAuto, detenerTemaAuto, temaPorHora } from '../../../components/themes/tema-hora.js';
import { setTheme } from '../../../store.js';
import { Button, Chip, Panel, PanelBody, Input, Icon, List, ListItem } from '../../../components/index.js?v=v10-settings-grid-2';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

function Seccion({ titulo, children }) {
  return html`
    <section class="mb-6 min-w-0">
      <h2 class="au-label mb-2">${titulo}</h2>
      <${Panel}><${PanelBody}>${children}<//><//>
    </section>
  `;
}

const CATEGORY_LABELS = {
  cosmic: 'Cósmico', cyberpunk: 'Cyberpunk', gothic: 'Gótico', abysmal: 'Abismal',
  infernal: 'Infernal', sakura: 'Sakura', arctic: 'Ártico', neutral: 'Neutro',
};

function AtmosphereGrid({ items, activo, onPick, kind = 'scene' }) {
  return html`
    <div class="atmosphere-option-grid" data-kind=${kind}>
      ${items.map(item => html`
        <${Button}
          key=${item.id}
          active=${activo === item.id}
          onClick=${() => onPick(item.id)}
          class="atmosphere-option"
          title=${item.description || item.name}
        >
          <span
            class="atmosphere-option-icon"
            style=${item.accent ? `color:${item.accent};border-color:color-mix(in srgb,${item.accent} 38%,var(--aurora-border));` : undefined}
          ><${Icon} name=${item.icon || 'none'} size=${15} /><//>
          <span class="atmosphere-option-copy">
            <strong>${item.shortName || item.name.split(' · ')[0]}</strong>
            <small>${item.behavior || CATEGORY_LABELS[item.category] || 'Neutro'}</small>
          </span>
          <span class="atmosphere-option-check"><${Icon} name="check" size=${11} /><//>
        <//>
      `)}
    </div>
  `;
}

function ThemePicker({ temaActivo, modoActivo, temaAuto, onTheme, onMode, onAuto }) {
  const activeTheme = THEMES.find(x => x.id === temaActivo) || THEMES[0];
  const [categoria, setCategoria] = useState(activeTheme.category);

  useEffect(() => {
    const selected = THEMES.find(x => x.id === temaActivo);
    if (selected?.category && selected.category !== categoria) setCategoria(selected.category);
  }, [temaActivo]);

  const categories = [...new Set(THEMES.map(x => x.category))];
  const items = THEMES.filter(x => x.category === categoria).map(x => ({ ...x, icon: 'spark' }));
  return html`
    <div class="settings-subsection">
      <div class="atmosphere-catalog-meta"><span>Apariencia</span>Contraste base</div>
      <${AtmosphereGrid}
        kind="mode"
        items=${[
          { id: 'dark', name: 'Oscuro', icon: 'moon', behavior: 'Baja luminancia', description: 'Superficies oscuras y contraste contenido.' },
          { id: 'light', name: 'Claro', icon: 'sun', behavior: 'Alta luminancia', description: 'Superficies claras y contraste diurno.' },
        ]}
        activo=${modoActivo}
        onPick=${onMode}
      />
    </div>
    <label class="settings-toggle-card">
      <input type="checkbox" checked=${temaAuto} onChange=${onAuto} />
      <span class="settings-toggle-icon"><${Icon} name="clock" size=${15} /><//>
      <span class="settings-toggle-copy">
        <strong>Tema automático</strong>
        <small>Cambia el color según la hora local</small>
      </span>
      <span class=${`settings-toggle-state ${temaAuto ? 'is-on' : ''}`}>${temaAuto ? temaPorHora() : 'Manual'}</span>
    </label>
    <div class="settings-subsection">
      <div class="atmosphere-filter-row" aria-label="Filtrar temas por familia">
        ${categories.map(id => html`
          <${Chip} key=${id} active=${categoria === id} onClick=${() => setCategoria(id)}>${CATEGORY_LABELS[id] || id}<//>
        `)}
      </div>
      <div class="atmosphere-catalog-meta"><span>${CATEGORY_LABELS[categoria] || categoria}</span>${items.length} paletas</div>
      <${AtmosphereGrid} kind="theme" items=${items} activo=${temaActivo} onPick=${onTheme} />
    </div>
  `;
}

function BackgroundPreview({ item, series }) {
  const empty = !item;
  return html`
    <div
      class="atmosphere-preview atmosphere-background-preview"
      data-scene=${item?.scene || 'none'}
      data-category=${item?.category || 'neutral'}
      data-series=${series}
      aria-label=${empty ? 'Sin fondo seleccionado' : `Vista conceptual de ${item.name}`}
    >
      <div class="atmosphere-preview-grid" aria-hidden="true"></div>
      <div class="atmosphere-preview-orbit" aria-hidden="true"></div>
      <div class="atmosphere-preview-copy">
        <span class="atmosphere-preview-icon"><${Icon} name=${item?.icon || 'none'} size=${18} /><//>
        <div class="min-w-0">
          <div class="text-sm font-semibold truncate">${item?.name || 'Sin fondo'}</div>
          <div class="text-[10px] text-white/45 uppercase tracking-wider">
            ${empty ? 'Lienzo neutro' : `${CATEGORY_LABELS[item.category] || item.category} · ${BACKGROUND_SERIES.find(x => x.id === series)?.name || series}`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function HudPreview({ item }) {
  return html`
    <div class="atmosphere-preview atmosphere-hud-preview" data-preview-hud=${item?.id || 'none'}>
      <div class="atmosphere-hud-rail" aria-hidden="true">
        <span></span><span class="is-active"></span><span></span>
      </div>
      <div class="atmosphere-hud-canvas">
        <div class="atmosphere-hud-heading">
          <${Icon} name=${item?.icon || 'none'} size=${16} />
          <span>${item?.name || 'Sin HUD'}</span>
          <small>${item?.behavior || 'Neutro'}</small>
        </div>
        <div class="atmosphere-hud-panel">
          <span></span><span></span><span></span>
        </div>
        <div class="atmosphere-hud-controls">
          <i></i><i class="is-active"></i><i></i>
        </div>
      </div>
    </div>
  `;
}

function BackgroundPicker({ activo, onPick }) {
  const activeItem = BACKGROUNDS.find(x => x.id === activo);
  const [serie, setSerie] = useState(activeItem?.series || 'remake');
  const [categoria, setCategoria] = useState(activeItem?.category || 'cosmic');

  useEffect(() => {
    const selected = BACKGROUNDS.find(x => x.id === activo);
    if (selected?.series && selected.series !== serie) setSerie(selected.series);
    if (selected?.category && selected.category !== categoria) setCategoria(selected.category);
  }, [activo]);

  const meta = BACKGROUND_SERIES.find(x => x.id === serie) || BACKGROUND_SERIES[0];
  const seriesItems = BACKGROUNDS.filter(x => x.series === serie);
  const categories = [...new Set(seriesItems.map(x => x.category))];
  const items = seriesItems.filter(x => x.category === categoria);
  return html`
    <div class="min-w-0">
      <${BackgroundPreview} item=${activeItem} series=${activeItem?.series || serie} />
      <div class="flex flex-wrap gap-2 mb-2">
        ${BACKGROUND_SERIES.map(s => html`
          <${Chip} key=${s.id} active=${serie === s.id} onClick=${() => setSerie(s.id)}>
            ${s.name}
          <//>
        `)}
      </div>
      <div class="text-[11px] text-white/35 mb-3">${meta.description}</div>
      <div class="atmosphere-filter-row" aria-label="Filtrar fondos por atmósfera">
        ${categories.map(id => html`
          <${Chip} key=${id} active=${categoria === id} onClick=${() => setCategoria(id)}>
            ${CATEGORY_LABELS[id] || id}
          <//>
        `)}
      </div>
      <div class="atmosphere-catalog-meta"><span>${CATEGORY_LABELS[categoria] || categoria}</span>${items.length} escenas</div>
      <${AtmosphereGrid}
        items=${[{ id: 'none', shortName: 'Sin fondo', name: 'Sin fondo', icon: 'none', category: 'neutral' }, ...items]}
        activo=${activo}
        onPick=${onPick}
      />
    </div>
  `;
}

export default function Ajustes() {
  const [temaActivo, setTemaActivo] = useState(theme.value);
  const [modoActivo, setModoActivo] = useState(themeMode.value);
  const [bgActivo, setBgActivo] = useState(background.value);
  const [hudActivo, setHudActivo] = useState(hud.value);
  const [listaLLMs, setListaLLMs] = useState(llms.value);
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [temaAuto, setTemaAuto] = useState(false);
  const [extensiones, setExtensiones] = useState([]);
  const [estadosExt, setEstadosExt] = useState({});

  useEffect(() => {
    cargarLLMs();
    getJSON('/db/ajustes/tema_auto').then(r => setTemaAuto(r?.valor === '1')).catch(() => {});
    getJSON('/db/extensions')
      .then(r => {
        setExtensiones(r?.registry?.extensions || []);
        setEstadosExt(r?.states || {});
      })
      .catch(() => {});
    const subs = [
      theme.subscribe(setTemaActivo),
      themeMode.subscribe(setModoActivo),
      background.subscribe(setBgActivo),
      hud.subscribe(setHudActivo),
      llms.subscribe(setListaLLMs),
    ];
    return () => subs.forEach(u => u());
  }, []);

  useEffect(() => registerAIView({
    id: 'ajustes',
    description: 'Configuración de apariencia, atmósfera, HUD, proveedores e integraciones de Aurora.',
    actions: {
      status: { description: 'Devuelve la configuración visual e integraciones visibles.', readOnly: true, run: () => ({ theme: temaActivo, mode: modoActivo, background: bgActivo, hud: hudActivo, autoTheme: temaAuto, llms: listaLLMs.length, extensions: extensiones.length }) },
      list_visuals: { description: 'Lista identidades, fondos y HUDs disponibles.', readOnly: true, run: () => ({ themes: THEMES.map(x => x.id), backgrounds: BACKGROUNDS.map(x => x.id), huds: HUDS.map(x => x.id) }) },
      set_theme: { description: 'Cambia identidad visual y, opcionalmente, luminancia.', input: { theme: { type: 'string', required: true }, mode: { type: 'string', enum: ['dark', 'light'], required: false } }, run: async ({ theme: id, mode }) => { if (!THEMES.some(x => x.id === id)) throw new Error(`Tema desconocido: ${id}`); await guardarTema(id); if (mode) await guardarThemeMode(mode); return { theme: id, mode: mode || modoActivo }; } },
      set_atmosphere: { description: 'Cambia fondo y/o HUD usando IDs del catálogo.', input: { background: { type: 'string', required: false }, hud: { type: 'string', required: false } }, run: async ({ background: bg, hud: nextHud }) => { if (bg) { if (!BACKGROUNDS.some(x => x.id === bg)) throw new Error(`Fondo desconocido: ${bg}`); await guardarBackground(bg); } if (nextHud) { if (!HUDS.some(x => x.id === nextHud)) throw new Error(`HUD desconocido: ${nextHud}`); await guardarHud(nextHud); } return { background: bg || bgActivo, hud: nextHud || hudActivo }; } },
    },
  }), [temaActivo, modoActivo, bgActivo, hudActivo, temaAuto, listaLLMs.length, extensiones.length]);

  const toggleTemaAuto = async () => {
    const nuevo = !temaAuto;
    setTemaAuto(nuevo);
    await putJSON('/db/ajustes/tema_auto', { valor: nuevo ? '1' : '0' }).catch(() => {});
    if (nuevo) { setTheme(temaPorHora()); iniciarTemaAuto(); }
    else detenerTemaAuto();
  };

  const agregarLLM = async () => {
    if (!nombre.trim() || !url.trim()) return;
    try {
      await crearLLM(nombre.trim(), url.trim());
      setNombre('');
      setUrl('');
      mostrarTemporal(setMsg, 'LLM agregado', { delay: 2500 });
    } catch (e) {
      mostrarTemporal(setMsg, `Error: ${e.message}`, { delay: 2500 });
    }
  };

  const toggleExtension = async (ext) => {
    const actual = estadosExt[ext.id]?.enabled === true;
    const next = { enabled: !actual, config: estadosExt[ext.id]?.config || null };
    setEstadosExt(prev => ({ ...prev, [ext.id]: next }));
    try {
      await putJSON(`/db/extensions/${ext.id}`, next);
      mostrarTemporal(setMsg, `${ext.id} ${next.enabled ? 'activada' : 'desactivada'}`, { delay: 1800 });
    } catch (err) {
      setEstadosExt(prev => ({ ...prev, [ext.id]: estadosExt[ext.id] || {} }));
      mostrarTemporal(setMsg, `Error extensión: ${err.message}`, { delay: 2500 });
    }
  };

  const exportarJSON = () => {
    descargarJSON('aurora-ajustes.json', crearSnapshotAjustes({
      theme: temaActivo,
      themeMode: modoActivo,
      background: bgActivo,
      hud: hudActivo,
      llms: listaLLMs,
      extensions: { registry: extensiones, states: estadosExt },
    }));
  };

  const importarJSON = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await leerJSONArchivo(file);
      if (data?.theme) await guardarTema(data.theme);
      if (data?.themeMode) await guardarThemeMode(data.themeMode);
      if (data?.background) await guardarBackground(data.background);
      if (data?.hud) await guardarHud(data.hud);
      mostrarTemporal(setMsg, 'Ajustes importados', { delay: 2500 });
    } catch (err) {
      mostrarTemporal(setMsg, `Error importando: ${err.message}`, { delay: 2500 });
    }
  };

  return html`
    <div class="w-full max-w-3xl mx-auto p-4">
      <h1 class="flex items-center gap-2 text-lg font-semibold mb-4"><${Icon} name="settings" size=${19} /> Ajustes</h1>
      ${msg && html`<div class="mb-3 text-xs text-emerald-300">${msg}</div>`}

      <${Seccion} titulo="Tema">
        <${ThemePicker}
          temaActivo=${temaActivo}
          modoActivo=${modoActivo}
          temaAuto=${temaAuto}
          onTheme=${guardarTema}
          onMode=${guardarThemeMode}
          onAuto=${toggleTemaAuto}
        />
      <//>

      <${Seccion} titulo="Fondo">
        <div class="text-[11px] text-white/40 mb-3">Elige primero una familia visual; la escena activa se actualiza al instante detrás de Aurora.</div>
        <${BackgroundPicker} activo=${bgActivo} onPick=${guardarBackground} />
      <//>

      <${Seccion} titulo="HUD de interfaz">
        <${HudPreview} item=${HUDS.find(x => x.id === hudActivo)} />
        <div class="text-[11px] text-white/40 mb-3">El HUD actúa sobre la interfaz real: foco, paneles, navegación y procesos activos. No sustituye el fondo.</div>
        <${AtmosphereGrid}
          kind="hud"
          items=${[{ id: 'none', name: 'Sin HUD', icon: 'none', behavior: 'Neutro', description: 'Interfaz sin decoración funcional.' }, ...HUDS]}
          activo=${hudActivo}
          onPick=${guardarHud}
        />
        ${hudActivo !== 'none' && html`<div class="atmosphere-selection-note"><span>${HUDS.find(x => x.id === hudActivo)?.behavior}</span>${HUDS.find(x => x.id === hudActivo)?.description || ''}</div>`}
      <//>

      <${Seccion} titulo="LLMs Cloud personalizados">
        <div class="flex flex-wrap gap-2 mb-3">
          <${Input}
            class="flex-1 min-w-0 basis-32"
            placeholder="Nombre (ej: DeepSeek)"
            value=${nombre}
            onInput=${e => setNombre(e.target.value)}
          />
          <${Input}
            class="flex-[2] min-w-0 basis-48"
            placeholder="https://chat.ejemplo.com"
            value=${url}
            onInput=${e => setUrl(e.target.value)}
          />
          <${Button} iconOnly onClick=${agregarLLM} title="Agregar LLM"><${Icon} name="plus" size=${15} /><//>
        </div>
        ${listaLLMs.length === 0 && html`<div class="text-xs text-white/30">Sin LLMs custom</div>`}
        ${listaLLMs.map(l => html`
          <div key=${l.id} class="flex items-center gap-2 py-1 text-xs border-t border-white/5">
            ${l.icono && html`<img src=${l.icono} class="w-4 h-4 rounded" onError=${e => e.target.style.display = 'none'} />`}
            <span class="text-white/80">${l.nombre}</span>
            <span class="flex-1 text-white/30 truncate">${l.url}</span>
            <${Button} iconOnly variant="danger" onClick=${() => borrarLLM(l.id)} title="Borrar LLM"><${Icon} name="trash" size=${14} /><//>
          </div>
        `)}
      <//>

      <${Seccion} titulo="Extensiones importadas">
        <div class="atmosphere-catalog-meta"><span>Registry</span>${extensiones.length} extensiones detectadas</div>
        <${List} layout="grid" class="extension-registry-list">
          ${extensiones.length === 0 && html`<div class="text-xs text-white/30">Sin registry de extensiones</div>`}
          ${extensiones.map(ext => {
            const enabled = estadosExt[ext.id]?.enabled === true;
            return html`
              <${ListItem}
                key=${ext.id}
                icon="package"
                name=${ext.id}
                sub=${`${ext.kind} · ${ext.manifest}${ext.dbBridge ? ' · DB' : ''}${ext.uiMode ? ` · ${ext.uiMode}` : ''}`}
                class=${enabled ? 'is-enabled' : ''}
              >
                <span class="extension-registry-state">${ext.status}</span>
                <label class="extension-switch" title=${enabled ? `Desactivar ${ext.id}` : `Activar ${ext.id}`}>
                  <input type="checkbox" checked=${enabled} onChange=${() => toggleExtension(ext)} />
                  <span aria-hidden="true"></span>
                </label>
              <//>
            `;
          })}
        <//>
      <//>

      <${Seccion} titulo="Export / Import">
        <div class="flex gap-2">
          <${Chip} onClick=${exportarJSON}><${Icon} name="download" size=${13} /> Exportar JSON<//>
          <label class="relative">
            <${Chip} onClick=${() => {}}><${Icon} name="upload" size=${13} /> Importar JSON<//>
            <input type="file" accept=".json" class="absolute inset-0 opacity-0 cursor-pointer" onChange=${importarJSON} />
          </label>
        </div>
      <//>
    </div>
  `;
}
