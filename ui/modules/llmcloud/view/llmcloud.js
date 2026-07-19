const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useMemo, useRef } = globalThis.preactHooks;
import { LLM_PRESETS, cargarURLsCloud } from '../scripts/urls.js';
import { cargarSesiones, onSesiones } from '../../../components/shared/llm-sesiones.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { Toast } from '../../../components/shared/toast.js';
import { DuoPanel } from '../scripts/duo-panel.js';
import { Button, Chip } from '../../../components/index.js';
import { useFloatingMenu } from '../../../components/shared/iconButton.js';
import { usePersistedState } from '../../../components/shared/persisted-state.js';
import { postJSON } from '../../../components/shared/api.js';
import { ToolVisualCard } from '../../../components/shared/cloud-tool-visual.js';

// Sólo delegamos el iframe a la extensión si ésta anunció la capability
// `llmPanes` (sidepanel que sabe montar iframes de LLM a nivel de extensión).
// Si no (extensión vieja o sin recargar), usamos el iframe inline de siempre
// — así nunca queda el panel vacío, con o sin la versión nueva del sidepanel.
const enExt = () => (globalThis.__aurora_extContext?.value?.caps || []).includes('llmPanes');

// Panel del LLM. En extensión: sólo el marco/placeholder — el <iframe> real
// lo pone la extensión (sidepanel.js) como hijo directo de chrome-extension://
// para que el login no se rompa por cookie partitioning, posicionado sobre
// el div `data-llm-pane`. Fuera de extensión (browser suelto): iframe inline
// de fallback (el login igual no anda ahí, pero al menos se ve el LLM).
//
// Top-level, NUNCA redefinido dentro de LLMCloud: una función recreada en cada
// render (identidad nueva) hace que Preact la trate como otro tipo de
// componente y remonte el <iframe> — con sólo abrir el dropdown se recargaba.
function Panel({ sel, src, lado, split, foco, setFoco }) {
  return html`
    <div
      class=${`flex-1 flex flex-col min-w-0 ${split && foco === lado ? 'ring-1 ring-inset' : ''}`}
      style=${split && foco === lado ? 'ring-color:var(--au-accent,#8b5cf6)' : ''}
      onClick=${() => setFoco(lado)}
    >
      ${sel && src ? html`
        <div class="flex items-center gap-1 px-1.5 py-0.5 bg-black/20 border-b border-white/5">
          <span class="flex-1 text-[10px] text-white/30 truncate">${src}</span>
        </div>
        ${enExt()
          ? html`<div data-llm-pane=${lado} class="flex-1 min-h-0 bg-white/5"></div>`
          : html`<iframe
              src=${src}
              data-pane=${lado === 'izq' ? 1 : 2}
              class="flex-1 w-full border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-storage-access-by-user-activation"
              allow="clipboard-read; clipboard-write; microphone; identity-credentials-get; publickey-credentials-get"
            />`}
      ` : html`<div class="flex-1 flex items-center justify-center text-white/30 text-sm">${sel ? 'Cargando sesión…' : 'Elegí un LLM arriba'}</div>`}
    </div>
  `;
}

export default function LLMCloud() {
  const [urls, setUrls] = useState([]);
  // Última sesión de la vista (LLM izq/der, split, foco) — persistida en
  // /db/ajustes y sincronizada entre tabs vía bus. Se guardan IDs, no
  // objetos: sobreviven a cambios en urls-custom. izq/der/split/foco se
  // DERIVAN de acá — sin estado duplicado no hay carrera al restaurar.
  const [ui, setUi] = usePersistedState('llmcloud_ui', {});
  const [duoAbierto, setDuoAbierto] = useState(false);
  const [actividadTools, setActividadTools] = useState([]);
  const [artefacto, setArtefacto] = useState(null);
  const [artefactoContenido, setArtefactoContenido] = useState('');
  const [artefactoError, setArtefactoError] = useState('');
  const llmMenu = useFloatingMenu({ anchor: 'below' });

  useEffect(() => {
    const onTool = e => setActividadTools(prev => {
      const v = e.detail;
      // Los drafts llegan cada 120ms: reemplazar el anterior del mismo panel,
      // no llenar la bandeja con cientos de snapshots del mismo JSON.
      const key = `${v.paneId || v.quien || 'cloud'}:${v.tool || 'tool'}`;
      const clean = prev.filter(x => `${x.paneId || x.quien || 'cloud'}:${x.tool || 'tool'}` !== key);
      return [...clean, v].slice(-4);
    });
    const onArtifact = async e => {
      const a = e.detail;
      if (!a?.path) return;
      setArtefacto(a); setArtefactoContenido(''); setArtefactoError('');
      try {
        const r = await postJSON('/artifacts/read', { path: a.path });
        if (!r?.ok || r?.is_error) throw new Error(r?.output || r?.error || 'No se pudo leer');
        setArtefactoContenido(r.output || '');
      } catch (err) { setArtefactoError(err?.message || String(err)); }
    };
    window.addEventListener('aurora:tool-visual', onTool);
    window.addEventListener('aurora:artifact-open', onArtifact);
    return () => {
      window.removeEventListener('aurora:tool-visual', onTool);
      window.removeEventListener('aurora:artifact-open', onArtifact);
    };
  }, []);

  const izq = urls.find(u => u.id === ui?.izq) ?? urls[0] ?? null;
  const der = urls.find(u => u.id === ui?.der) ?? urls[1] ?? urls[0] ?? null;
  const split = !!ui?.split;
  const foco = ui?.foco === 'der' ? 'der' : 'izq';
  const setFoco = (lado) => setUi(p => ({ ...(p || {}), foco: lado }));
  const setSplit = (v) => setUi(p => ({ ...(p || {}), split: v }));

  // El caps de la extensión llega ASYNC (handshake AURORA_EXT_HELLO). Sin
  // reaccionar a eso, los effects que dependen de enExt() corrían una vez con
  // enExt()=false y nunca se re-suscribían al llegar el HELLO — el iframe no se
  // montaba y el menú no respondía. Este estado fuerza re-render al cambiar.
  const [extCaps, setExtCaps] = useState(enExt());
  useEffect(() => {
    const sig = globalThis.__aurora_extContext;
    setExtCaps(enExt());
    return sig ? sig.subscribe(() => setExtCaps(enExt())) : undefined;
  }, []);

  useEffect(() => {
    cargarURLsCloud().then(todas => {
      setUrls(todas.length ? todas : LLM_PRESETS);
    });
  }, []);

  // Última URL de conversación por host (módulo compartido llm-sesiones —
  // mismo historial que el Cloud Backend de Lyra). null = cargando: los
  // paneles esperan para no montar el iframe dos veces (home → hilo).
  const [sesiones, setSesiones] = useState(null);
  useEffect(() => {
    cargarSesiones().then(m => setSesiones({ ...m }));
    return onSesiones(m => setSesiones({ ...m }));
  }, []);

  const listo = sesiones !== null;
  const restaurar = (sel) => {
    if (!sel || !listo) return null;
    try { return sesiones[new URL(sel.url).host] || sel.url; } catch { return sel.url; }
  };
  // Congeladas por selección: cuando el sniffer reporta que navegaste dentro
  // del iframe, el src NO cambia (sería recargarte el hilo abajo de los pies).
  // La URL restaurada se aplica solo al montar la vista o al elegir otro LLM.
  const srcIzq = useMemo(() => restaurar(izq), [izq?.id, listo]);
  const srcDer = useMemo(() => restaurar(der), [der?.id, listo]);

  const capturaExtension = (n) => Toast.show(`Captura del panel ${n} requiere la extensión de browser`, 'warning');
  const extraerExtension = (n) => Toast.show(`Extraer texto del panel ${n} requiere la extensión de browser`, 'warning');
  const swap = () => setUi(p => ({ ...(p || {}), izq: der?.id ?? null, der: izq?.id ?? null }));

  useEffect(() => {
    const slots = split ? [1, 2] : [1];
    const sup = ['¹', '²', '³'];
    const acciones = [];
    for (const n of slots) {
      acciones.push({ id: `txt-${n}`, icon: `📄${sup[n - 1]}`, title: `Extraer texto panel ${n}`, onClick: () => extraerExtension(n) });
      acciones.push({ id: `shot-${n}`, icon: `📸${sup[n - 1]}`, title: `Captura panel ${n}`, onClick: () => capturaExtension(n) });
    }
    if (split) {
      acciones.push({ id: 'swap', icon: '⇄', title: 'Intercambiar paneles', onClick: swap });
    }
    acciones.push({ id: 'duo', icon: '⇆ Duo', title: 'Duo — dos IAs conversando (nativo, sin extensión)', onClick: () => setDuoAbierto(true) });
    setViewActions(acciones);
    return () => clearViewActions();
  }, [split, izq, der]);

  const [extMenuOpen, setExtMenuOpen] = useState(false);

  // Últimos panes reportados — el cleanup de unmount los necesita para pedir
  // "ocultar" en vez de "borrar" (ver más abajo). Sin esto, al cambiar de tab
  // de Aurora no hay forma de re-enviar la misma lista sin volver a medir el
  // DOM (que para entonces ya no existe, la vista se está desmontando).
  const panesRef = useRef([]);

  // Reportar a la extensión dónde va cada iframe de LLM (rect en px). El
  // El controlador Duo ocupa una franja del layout y NO oculta los iframes:
  // la conversación ocurre en las interfaces nativas de cada proveedor.
  // Sólo el visor de artefactos cubre los paneles.
  useEffect(() => {
    if (!enExt()) return;
    const report = () => {
      const panes = [];
      const add = (lado, sel, src) => {
        if (!sel || !src) return;
        const el = document.querySelector(`[data-llm-pane="${lado}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return; // aún sin layout: no reportar rect en cero
        panes.push({ id: lado, surface: 'llmcloud', url: src, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
      };
      add('izq', izq, srcIzq);
      if (split) add('der', der, srcDer);
      panesRef.current = panes;
      window.parent.postMessage({ type: 'AURORA_LLM_PANES', panes, hidden: !!artefacto }, '*');
    };
    // Doble rAF deja terminar el layout en primer plano. No puede ser el único
    // disparador: Chrome pausa rAF en tabs de fondo y entonces los placeholders
    // existen pero la extensión nunca recibe AURORA_LLM_PANES hasta que alguien
    // redimensiona la ventana. El timeout y ResizeObserver cubren ese caso.
    const raf = requestAnimationFrame(() => requestAnimationFrame(report));
    const timer = setTimeout(report, 80);
    const observed = [...document.querySelectorAll('[data-llm-pane]')];
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(report)
      : null;
    observed.forEach(el => resizeObserver?.observe(el));
    window.addEventListener('resize', report);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [izq, der, srcIzq, srcDer, split, duoAbierto, artefacto, actividadTools.length, urls, extCaps]);

  // Elección desde el menú dibujado por la extensión.
  useEffect(() => {
    if (!enExt()) return;
    const onMsg = (e) => {
      if (e.data?.type === 'AURORA_LLM_MENU_PICK') {
        const u = urls.find(x => x.id === e.data.id);
        if (u) elegir(u);
        setExtMenuOpen(false);
      } else if (e.data?.type === 'AURORA_LLM_MENU_CLOSED') {
        setExtMenuOpen(false);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [urls, split, foco, extCaps]);

  // Al salir de la vista (cambio de tab de Aurora, no de LLM): OCULTAR el
  // iframe, nunca borrarlo — mandar panes:[] acá lo destruía por completo, y
  // al volver a la vista se creaba uno NUEVO (recarga real de la página del
  // LLM, se perdía el hilo/scroll aunque la URL restaurada fuera la misma).
  // Se reenvían los MISMOS panes con hidden:true: la extensión sólo cambia
  // visibility, no toca el src — la sesión sigue viva de fondo mientras el
  // usuario mira otra vista, como una pestaña de navegador en background.
  // El iframe recién se borra si el usuario elige otro LLM (cambia la url del
  // mismo `lado`) o si Aurora recarga entero (cubierto en sidepanel.js por el
  // listener de `frame.load`, que sí debe limpiar todo).
  useEffect(() => () => {
    try {
      // `hidden:true` solo apaga pointer-events + aria-hidden en el bridge
      // (ver aurora-bridge.js) — NINGUNO de los dos afecta lo que se ve. Sin
      // encoger el rect, el iframe queda del mismo tamaño/posición de cuando
      // esta vista estaba activa, tapando cualquier otra tab de Aurora hasta
      // que algo MÁS (ej. Lyra) vuelva a mandar panes y lo pise. Mismo truco
      // que ya usa el panel Cloud de Lyra: reducir a un rect casi-cero en vez
      // de opacity/visibility (eso sí congelaría rAF de streaming en curso).
      const panesOcultos = panesRef.current.map(p => ({ ...p, rect: { ...p.rect, width: 1, height: 1 } }));
      window.parent.postMessage({ type: 'AURORA_LLM_PANES', panes: panesOcultos, hidden: true }, '*');
      window.parent.postMessage({ type: 'AURORA_LLM_MENU_CLOSE' }, '*');
    } catch (_) {}
  }, []);

  const abrirVentana = (url) => {
    if (url) window.open(url, '_blank', 'noopener');
  };

  const elegir = (u) => {
    // Sitios bloqueados por Cloudflare en iframe → abren en pestaña real.
    if (u.soloTab) { abrirVentana(u.url); llmMenu.close(); return; }
    const lado = (!split || foco === 'izq') ? 'izq' : 'der';
    setUi(p => ({ ...(p || {}), [lado]: u.id }));
    llmMenu.close();
  };

  const seleccionado = split && foco === 'der' ? der : izq;

  // En extensión el menú lo dibuja la extensión (encima de los iframes);
  // fuera de extensión usa el FloatingMenu local de siempre.
  const activeIds = [izq?.id, split && der?.id].filter(v => v != null);
  const onTrigger = () => {
    if (enExt()) {
      if (extMenuOpen) { window.parent.postMessage({ type: 'AURORA_LLM_MENU_CLOSE' }, '*'); setExtMenuOpen(false); return; }
      const r = llmMenu.anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      window.parent.postMessage({
        type: 'AURORA_LLM_MENU_OPEN',
        anchor: { left: r.left, bottom: r.bottom },
        options: urls.map(u => ({ id: u.id, nombre: u.nombre, icono: u.icono, soloTab: u.soloTab })),
        activeIds,
      }, '*');
      setExtMenuOpen(true);
    } else {
      llmMenu.toggle();
    }
  };

  return html`
    <div class="relative flex flex-col h-full">
      <div class="flex items-center gap-2 px-2 py-1.5 border-b border-white/5">
        <${Button} btnRef=${llmMenu.anchorRef} active=${enExt() ? extMenuOpen : llmMenu.open} onClick=${onTrigger} title="Elegir LLM">
          ${seleccionado?.icono && html`<img src=${seleccionado.icono} class="w-3.5 h-3.5 rounded-sm mr-1" onError=${e => e.target.style.display = 'none'} />`}
          ${seleccionado?.nombre || 'Elegí un LLM'} ▾
        <//>
        <span class="flex-1" />
        ${seleccionado && html`
          <${Chip} onClick=${() => abrirVentana(seleccionado.url)} title="Abrir en ventana nueva (usa tu sesión del browser)">🔗 Abrir<//>
        `}
        <${Chip} active=${split} onClick=${() => setSplit(!split)} title="Vista dividida">⫿⫿ Split<//>
      </div>

      ${!enExt() && html`
        <${llmMenu.FloatingMenu} class="shadow-2xl rounded-lg border border-aurora-border bg-aurora-surface max-h-[320px] w-[220px] overflow-y-auto p-1 flex flex-col gap-0.5">
          ${urls.map(u => html`
            <button
              key=${u.id} type="button" onClick=${() => elegir(u)} title=${u.url}
              class=${`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                (izq?.id === u.id || (split && der?.id === u.id)) ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`}
            >
              ${u.icono && html`<img src=${u.icono} class="w-4 h-4 rounded-sm flex-shrink-0" onError=${e => e.target.style.display = 'none'} />`}
              <span class="truncate">${u.nombre}</span>
            </button>
          `)}
        <//>
      `}

      <div class="flex-1 flex min-h-0">
        <${Panel} sel=${izq} src=${srcIzq} lado="izq" split=${split} foco=${foco} setFoco=${setFoco} />
        ${split && html`
          <div class="w-px bg-white/10" />
          <${Panel} sel=${der} src=${srcDer} lado="der" split=${split} foco=${foco} setFoco=${setFoco} />
        `}
      </div>

      ${actividadTools.length > 0 && html`
        <div class="border-t border-white/10 bg-black/20 px-2 py-1.5">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[10px] uppercase tracking-wider text-white/35">Mesa compartida · actividad</span>
            <span class="flex-1"></span>
            <button class="text-[10px] text-white/30 hover:text-white/60" onClick=${() => setActividadTools([])}>Limpiar</button>
          </div>
          <div class="grid grid-cols-2 gap-2 max-h-28 overflow-auto">
            ${actividadTools.map((v, i) => html`<${ToolVisualCard} key=${v.id || i} visual=${v} compact=${true} />`)}
          </div>
        </div>
      `}

      ${artefacto && html`
        <div class="absolute inset-0 z-[8500] flex flex-col" style="background:rgba(13,14,20,.98)">
          <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10" style="background:#0d0e14">
            <span class="text-emerald-300">◆</span>
            <div class="min-w-0 flex-1"><div class="text-xs font-semibold">Artefacto compartido</div><div class="text-[10px] text-white/40 font-mono truncate">${artefacto.path}</div></div>
            <${Chip} onClick=${() => setArtefacto(null)}>✕ Cerrar<//>
          </div>
          ${artefactoError
            ? html`<div class="m-4 rounded-lg border border-red-400/20 bg-red-500/5 p-3 text-sm text-red-200">${artefactoError}</div>`
            : !artefactoContenido
              ? html`<div class="flex-1 flex items-center justify-center text-white/35 text-sm">Leyendo artefacto…</div>`
              : artefacto.type === 'html' || artefacto.path.endsWith('.html')
                ? html`<iframe class="flex-1 w-full bg-white border-0" sandbox="allow-scripts" srcdoc=${artefactoContenido}></iframe>`
                : html`<pre class="flex-1 overflow-auto m-3 p-3 rounded-lg bg-black/30 border border-white/10 text-xs text-white/70 font-mono whitespace-pre-wrap">${artefactoContenido}</pre>`}
        </div>
      `}

      ${duoAbierto && html`<${DuoPanel}
        agentes=${split ? [{ id: izq?.id, nombre: izq?.nombre }, { id: der?.id, nombre: der?.nombre }] : []}
        onClose=${() => setDuoAbierto(false)}
      />`}
    </div>
  `;
}
