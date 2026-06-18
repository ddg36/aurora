const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { THEMES, BACKGROUNDS, HUDS } from '../../../components/themes/index.js';
import { theme, themeMode, background, hud, guardarTema, guardarThemeMode, guardarBackground, guardarHud } from '../scripts/tema.js';
import { llms, cargarLLMs, crearLLM, borrarLLM } from '../scripts/llms.js';
import { crearSnapshotAjustes, descargarJSON, leerJSONArchivo } from '../scripts/export.js';
import { mostrarTemporal } from '../../../components/shared/flash.js';
import { getJSON, putJSON } from '../../../components/shared/api.js';
import { iniciarTemaAuto, detenerTemaAuto, temaPorHora } from '../../../components/themes/tema-hora.js';
import { setTheme } from '../../../store.js';

function Seccion({ titulo, children }) {
  return html`
    <section class="mb-6">
      <h2 class="text-xs uppercase tracking-widest text-white/40 mb-2">${titulo}</h2>
      <div class="bg-white/5 rounded-lg p-3">${children}</div>
    </section>
  `;
}

function ChipGrid({ items, activo, onPick }) {
  return html`
    <div class="flex flex-wrap gap-1.5">
      ${items.map(it => {
        const active = activo === it.id;
        const hasAccent = !!it.accent;
        const accent = it.accent || 'var(--aurora-accent)';
        const style = active
          ? `border-color:${accent};background:color-mix(in srgb, ${accent} 18%, var(--aurora-surface));color:var(--aurora-text);box-shadow:inset 0 -2px 0 ${accent};`
          : hasAccent
            ? `border-color:color-mix(in srgb, ${accent} 34%, var(--aurora-border));background:color-mix(in srgb, ${accent} 8%, var(--aurora-surface));box-shadow:inset 0 -2px 0 ${accent};color:var(--aurora-text-muted);`
            : '';
        return html`
        <button
          key=${it.id}
          onClick=${() => onPick(it.id)}
          class=${`px-2.5 py-1 rounded text-xs transition-colors border
            ${active ? 'is-active' : hasAccent ? 'hover:text-white/80 hover:bg-white/5' : 'border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5'}`}
          style=${style}
        >${it.icon ? it.icon + ' ' : ''}${it.name}</button>
      `})}
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
    <div class="max-w-3xl mx-auto p-4">
      <h1 class="text-lg font-semibold mb-4">⚙ Ajustes</h1>
      ${msg && html`<div class="mb-3 text-xs text-emerald-300">${msg}</div>`}

      <${Seccion} titulo="Tema">
        <div class="mb-3">
          <div class="text-xs text-white/40 mb-1.5">Apariencia</div>
          <${ChipGrid}
            items=${[
              { id: 'dark', name: 'Oscuro', icon: '☾' },
              { id: 'light', name: 'Blanco', icon: '☼' },
            ]}
            activo=${modoActivo}
            onPick=${guardarThemeMode}
          />
        </div>
        <label class="flex items-center gap-2 mb-3 text-xs cursor-pointer">
          <input type="checkbox" checked=${temaAuto} onChange=${toggleTemaAuto} />
          <span class="text-white/70">Tema automático por hora del día</span>
          ${temaAuto && html`<span class="text-white/30">(ahora: ${temaPorHora()})</span>`}
        </label>
        <${ChipGrid} items=${THEMES} activo=${temaActivo} onPick=${guardarTema} />
      <//>

      <${Seccion} titulo="Fondo">
        <${ChipGrid} items=${[{ id: 'none', name: 'Ninguno', icon: '∅' }, ...BACKGROUNDS]} activo=${bgActivo} onPick=${guardarBackground} />
      <//>

      <${Seccion} titulo="HUD">
        <${ChipGrid} items=${[{ id: 'none', name: 'Ninguno', icon: '∅' }, ...HUDS]} activo=${hudActivo} onPick=${guardarHud} />
      <//>

      <${Seccion} titulo="LLMs Cloud personalizados">
        <div class="flex gap-2 mb-3">
          <input
            class="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-white/30"
            placeholder="Nombre (ej: DeepSeek)"
            value=${nombre}
            onInput=${e => setNombre(e.target.value)}
          />
          <input
            class="flex-[2] bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-white/30"
            placeholder="https://chat.ejemplo.com"
            value=${url}
            onInput=${e => setUrl(e.target.value)}
          />
          <button onClick=${agregarLLM} class="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">＋</button>
        </div>
        ${listaLLMs.length === 0 && html`<div class="text-xs text-white/30">Sin LLMs custom</div>`}
        ${listaLLMs.map(l => html`
          <div key=${l.id} class="flex items-center gap-2 py-1 text-xs border-t border-white/5">
            ${l.icono && html`<img src=${l.icono} class="w-4 h-4 rounded" onError=${e => e.target.style.display = 'none'} />`}
            <span class="text-white/80">${l.nombre}</span>
            <span class="flex-1 text-white/30 truncate">${l.url}</span>
            <button onClick=${() => borrarLLM(l.id)} class="text-red-400/60 hover:text-red-400">🗑</button>
          </div>
        `)}
      <//>

      <${Seccion} titulo="Extensiones importadas">
        <div class="grid gap-2">
          ${extensiones.length === 0 && html`<div class="text-xs text-white/30">Sin registry de extensiones</div>`}
          ${extensiones.map(ext => {
            const enabled = estadosExt[ext.id]?.enabled === true;
            return html`
              <div key=${ext.id} class="flex items-center gap-3 rounded border border-white/10 bg-black/20 px-3 py-2">
                <input type="checkbox" checked=${enabled} onChange=${() => toggleExtension(ext)} />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-white/80">${ext.id}</div>
                  <div class="text-[11px] text-white/35 truncate">
                    ${ext.kind} · ${ext.manifest}${ext.dbBridge ? ' · DB' : ''}${ext.uiMode ? ` · ${ext.uiMode}` : ''}
                  </div>
                </div>
                <span class=${`text-[10px] uppercase ${ext.status === 'imported' ? 'text-emerald-300/70' : 'text-white/35'}`}>${ext.status}</span>
              </div>
            `;
          })}
        </div>
      <//>

      <${Seccion} titulo="Export / Import">
        <div class="flex gap-2">
          <button onClick=${exportarJSON} class="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs">⬇ Exportar JSON</button>
          <label class="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs cursor-pointer">
            ⬆ Importar JSON
            <input type="file" accept=".json" class="hidden" onChange=${importarJSON} />
          </label>
        </div>
      <//>
    </div>
  `;
}
