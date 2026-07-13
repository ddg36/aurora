
const { h } = globalThis.preact;

const { useState, useEffect } = globalThis.preactHooks;

import { activeTab, setTab, theme, themeMode, background, hud } from './store.js';

import { cargarTema } from './modules/ajustes/scripts/tema.js';

import { aplicarTema } from './components/themes/manager.js';

import { THEMES } from './components/themes/index.js?v=v2-visual-variants-2';

import { BACKGROUND_LOADERS } from './components/themes/backgrounds/loaders.js?v=v2-visual-variants-2';

import { HUD_LOADERS } from './components/themes/hud/loaders.js?v=v2-visual-variants-2';

import { Footer } from './components/footer/footer.js';

import { clearViewActions, userSwitcherAbierto, notifAbierto } from './components/footer/registry.js';

import { UserSwitcher } from './components/nav/user-switcher.js';

import { NotifCenter } from './components/nav/notif-center.js';

import { AgentEye } from './components/agent-eye/index.js';

import { iniciarTemaAuto } from './components/themes/tema-hora.js';

import { TABS } from './components/nav/nav-tabs.js';

import { CommandPalette } from './components/nav/command-palette.js';

import { restaurarTab, iniciarPersistenciaUI } from './components/nav/sesion-ui.js';

import { iconButtonClass } from './components/shared/iconButton.js';

// Inicializa el registro semántico AIHub aunque la vista activa todavía no
// haya publicado acciones.
import './components/shared/ai-view-actions.js';

const MODULE_LOADERS = {

inicio:       () => import('./modules/inicio/view/inicio.js?v=v2-clean-ui-14'),

aurora:       () => import('./modules/aurora/view/aurora.js?v=v2-control-center-2'),

productividad: () => import('./modules/productividad/view/productividad.js?v=v2-productividad-1'),

lyra:         () => import('./modules/lyra/view/lyra.js?v=v2-clean-ui-14'),

llmcloud:     () => import('./modules/llmcloud/view/llmcloud.js?v=v2-clean-ui-14'),

prompts:      () => import('./modules/prompts/view/prompts.js?v=v2-clean-ui-14'),

wiki:         () => import('./modules/wiki/view/wiki.js?v=v2-clean-ui-14'),

scratchpad:   () => import('./modules/scratchpad/view/scratchpad.js?v=v2-clean-ui-14'),

'md-reader':  () => import('./modules/md-reader/view/md-reader.js?v=v2-md-reader-2'),

editor:       () => import('./modules/editor/view/editor.js?v=v2-clean-ui-14'),

stats:        () => import('./modules/stats/view/stats.js?v=v2-clean-ui-14'),

captura:      () => import('./modules/captura/view/captura.js?v=v2-bd-real-1'),

toolkit:      () => import('./modules/toolkit/view/toolkit.js?v=v2-clean-ui-14'),

chain:        () => import('./modules/chain/view/chain.js?v=v2-clean-ui-14'),

detective:    () => import('./modules/detective-tokens/view/detective.js?v=v2-clean-ui-14'),

webnavigator: () => import('./modules/webnavigator/view/web-navigator.js?v=v2-clean-ui-14'),

stylecatalog: () => import('./modules/stylecatalog/view/stylecatalog.js?v=v2-clean-ui-14'),

ajustes:      () => import('./modules/ajustes/view/ajustes.js?v=v2-visual-variants-2'),

};

function pickComponent(mod) {

if (typeof mod === 'function') return mod;

if (mod && mod.default) return mod.default;

return Object.values(mod || {}).find(v => typeof v === 'function') || null;

}

async function loadOverlay(loaders, id, mode, setComp) {

if (!id || id === 'none') {

setComp(null);

return;

}

const loader = loaders[id];

if (!loader) {

setComp(null);

return;

}

const mod = await loader(mode);

const comp = pickComponent(mod);

setComp(() => comp);

}

function Background() {

const [Comp, setComp] = useState(null);

useEffect(() => {

const load = () => loadOverlay(BACKGROUND_LOADERS, background.value, themeMode.value, setComp).catch(console.error);

load();
const offBg = background.subscribe(load);
const offMode = themeMode.subscribe(load);

return () => { offBg(); offMode(); };

}, []);

return Comp ? h(Comp, {}) : null;

}

function Hud() {

const [Comp, setComp] = useState(null);

useEffect(() => {

const load = () => loadOverlay(HUD_LOADERS, hud.value, themeMode.value, setComp).catch(console.error);

load();
const offHud = hud.subscribe(load);
const offMode = themeMode.subscribe(load);

return () => { offHud(); offMode(); };

}, []);

return Comp ? h(Comp, {}) : null;

}

function ModuleView({ tabId }) {

const [Mod, setMod] = useState(null);

const [err, setErr] = useState(null);

useEffect(() => {

setErr(null);

setMod(null);

clearViewActions();

const loader = MODULE_LOADERS[tabId];
if (!loader) {
  setErr('Módulo no implementado: ' + tabId);
  return;
}

loader()
  .then(mod => {
    const picked = pickComponent(mod);
    if (!picked) throw new Error('El módulo no exporta componente Preact');
    setMod(() => picked);
  })
  .catch(e => {
    console.error('[Aurora] module load failed', tabId, e);
    setErr('Error cargando "' + tabId + '": ' + (e && e.message ? e.message : String(e)));
  });

}, [tabId]);

if (err) {

return h('div', { class: 'p-8 text-center opacity-60 whitespace-pre-wrap' }, err);

}

if (!Mod) {

return h('div', { class: 'p-8 text-center opacity-40' }, 'Cargando...');

}

return h(Mod, {});

}

function UserSwitcherMount() {

const [abierto, setAbierto] = useState(userSwitcherAbierto.value);

useEffect(() => userSwitcherAbierto.subscribe(v => setAbierto(v)), []);

if (!abierto) return null;

return h(UserSwitcher, { onClose: () => { userSwitcherAbierto.value = false; } });

}

function NotifMount() {

const [abierto, setAbierto] = useState(notifAbierto.value);

useEffect(() => notifAbierto.subscribe(v => setAbierto(v)), []);

if (!abierto) return null;

return h(NotifCenter, { onClose: () => { notifAbierto.value = false; } });

}

// Riel vertical único — misma forma en mobile y escritorio, sin ramas por
// tamaño de pantalla. Reserva su propio espacio real vía flexbox en App()
// (nunca `fixed`), así cualquier elemento fixed-al-viewport en cualquier
// vista puede seguir siendo predecible usando var(--aurora-rail-w) en vez
// de chocar contra él. Ícono-solo, scroll vertical nativo (la lista de 18
// tabs es corta y el scroll táctil/rueda ya funciona solo, sin flechas).
function NavBar({ tab }) {
  return h('nav', { class: 'nav-rail relative z-10 h-full flex flex-col items-stretch border-l border-white/5 bg-black/20 backdrop-blur-sm overflow-y-auto scrollbar-none' },
    TABS.map(t => h('button', {
      key: t.id,
      onClick: () => setTab(t.id),
      class: iconButtonClass(tab === t.id, 'rounded-md w-full h-9 flex-shrink-0 text-xs'),
      title: t.label,
      'aria-label': t.label,
    },
      h('span', {
        class: 'flex-shrink-0 flex items-center justify-center',
        style: 'width:16px;height:16px',
        dangerouslySetInnerHTML: { __html: t.svg || t.icon || '' },
      }),
    ))
  );
}

export function App() {

const [tab, setLocalTab] = useState(activeTab.value);
const [bgId, setBgId] = useState(background.value);
const [hudId, setHudId] = useState(hud.value);

useEffect(() => {

cargarTema()
  .then(() => iniciarTemaAuto())
  .catch(err => console.warn('[Aurora v2] cargarTema failed', err));

const urlTab = new URLSearchParams(location.search).get('tab');
if (urlTab && MODULE_LOADERS[urlTab]) {
  if (urlTab !== activeTab.value) activeTab.value = urlTab;
} else {
  restaurarTab().then(t => {
    if (t && MODULE_LOADERS[t] && t !== activeTab.value) activeTab.value = t;
  }).catch(() => {});
}

const unsubPersist = iniciarPersistenciaUI();
const unsubTab = activeTab.subscribe(t => setLocalTab(t));
const unsubBg = background.subscribe(setBgId);
const unsubHud = hud.subscribe(setHudId);
return () => { unsubPersist(); unsubTab(); unsubBg(); unsubHud(); };

}, []);

useEffect(() => {
const applyCurrentTheme = () => {
  const found = THEMES.find(x => x.id === theme.value) || THEMES[0];
  aplicarTema(found);
};

applyCurrentTheme();
const offTheme = theme.subscribe(applyCurrentTheme);
const offMode = themeMode.subscribe(applyCurrentTheme);
return () => { offTheme(); offMode(); };

}, []);

return h(

'div',

{ class: 'relative h-screen overflow-hidden', style: 'background:var(--aurora-bg,#0a0a0f);color:var(--aurora-text,#fff)' },

h('div', { class: 'aurora-bg-layer fixed inset-0 z-0 pointer-events-none overflow-hidden', 'data-bg': bgId }, h(Background, {})),

h('div', { class: 'aurora-hud-layer fixed inset-0 z-20 pointer-events-none overflow-hidden', 'data-hud': hudId }, h(Hud, {})),

h(

'div',

// Núcleo único, mobile y escritorio por igual: riel de NavBar al costado
// (flex-row), contenido+Footer en su propia columna al lado. Nada de
// `order` ni de ramas por tamaño de pantalla — el riel reserva su espacio
// real vía flexbox siempre, y var(--aurora-rail-w) (declarada una sola vez
// en CSS) es la única referencia que cualquier vista necesita para no
// chocar contra él.
{ class: 'relative z-10 flex flex-row h-screen min-h-0' },

h(
  'div',
  { class: 'flex-1 min-w-0 min-h-0 flex flex-col' },

  // overflow-y-auto (no "hidden"): views como Ajustes no manejan su propio
  // scroll interno — en desktop entraban igual por sobra de alto, en un
  // celu (menos alto disponible) el contenido se recortaba sin poder
  // scrollear (bug real reportado en vivo, "casi todas las views"). Lyra sí
  // maneja su propio scroll interno (chat-with-avatars:
  // flex:1;min-height:0;overflow:hidden) así que llena exactamente el alto
  // disponible y esto no le agrega scroll de más — sólo actúa cuando el
  // contenido realmente desborda.
  // min-w-0 + overflow-x-hidden: como flex-item, sin min-w-0 esto NO se
  // achica más allá del ancho mínimo de su contenido (default CSS de
  // flexbox) — con filas flex-wrap adentro (grids de temas/fondos en
  // Ajustes, tabs, etc) eso empuja TODA la página más ancha que la pantalla
  // en vez de dejar que esas filas envuelvan de verdad (bug real reportado
  // en vivo: "casi todas las views" se ven cortadas del lado derecho en un
  // celular, no porque falte flex-wrap sino porque el contenedor padre
  // nunca se restringe al ancho real disponible).
  h('main', { class: 'flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col' }, h(ModuleView, { tabId: tab })),

  h('div', { class: 'flex-shrink-0' }, h(Footer, {})),
),

// flex-shrink-0 (no "shrink-0" — esa clase no genera CSS acá, ni por Twind
// ni por el fallback estático, sólo existe .flex-shrink-0): el riel nunca
// cede espacio al apretarse, sólo <main> lo hace.
h('div', { class: 'flex-shrink-0' }, h(NavBar, { tab })),

),

h(CommandPalette, {}),

h(UserSwitcherMount, {}),

h(NotifMount, {}),

h(AgentEye, {}),

);

}

export default App;
