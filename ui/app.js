
const { h } = globalThis.preact;

const { useState, useEffect, useRef, useCallback } = globalThis.preactHooks;

import { activeTab, setTab, theme, themeMode, background, hud } from './store.js';

import { cargarTema } from './modules/ajustes/scripts/tema.js';

import { aplicarTema } from './components/themes/manager.js';

import { THEMES } from './components/themes/index.js?v=v2-visual-variants-1';

import { BACKGROUND_LOADERS } from './components/themes/backgrounds/loaders.js?v=v2-visual-variants-1';

import { HUD_LOADERS } from './components/themes/hud/loaders.js?v=v2-visual-variants-1';

import { Footer } from './components/footer/footer.js';

import { clearViewActions, userSwitcherAbierto, notifAbierto } from './components/footer/registry.js';

import { UserSwitcher } from './components/nav/user-switcher.js';

import { NotifCenter } from './components/nav/notif-center.js';

import { iniciarTemaAuto } from './components/themes/tema-hora.js';

import { TABS } from './components/nav/nav-tabs.js';

import { CommandPalette } from './components/nav/command-palette.js';

import { restaurarTab, iniciarPersistenciaUI } from './components/nav/sesion-ui.js';

const MODULE_LOADERS = {

inicio:       () => import('./modules/inicio/view/inicio.js?v=v2-clean-ui-4'),

aurora:       () => import('./modules/aurora/view/aurora.js?v=v2-control-center-1'),

productividad: () => import('./modules/productividad/view/productividad.js?v=v2-productividad-1'),

local:        () => import('./modules/local/view/local.js?v=v2-clean-ui-4'),

llmcloud:     () => import('./modules/llmcloud/view/llmcloud.js?v=v2-clean-ui-4'),

prompts:      () => import('./modules/prompts/view/prompts.js?v=v2-clean-ui-4'),

wiki:         () => import('./modules/wiki/view/wiki.js?v=v2-clean-ui-4'),

scratchpad:   () => import('./modules/scratchpad/view/scratchpad.js?v=v2-clean-ui-4'),

'md-reader':  () => import('./modules/md-reader/view/md-reader.js?v=v2-md-reader-2'),

editor:       () => import('./modules/editor/view/editor.js?v=v2-clean-ui-4'),

stats:        () => import('./modules/stats/view/stats.js?v=v2-clean-ui-4'),

captura:      () => import('./modules/captura/view/captura.js?v=v2-bd-real-1'),

toolkit:      () => import('./modules/toolkit/view/toolkit.js?v=v2-clean-ui-4'),

chain:        () => import('./modules/chain/view/chain.js?v=v2-clean-ui-4'),

detective:    () => import('./modules/detective-tokens/view/detective.js?v=v2-clean-ui-4'),

webnavigator: () => import('./modules/webnavigator/view/web-navigator.js?v=v2-clean-ui-4'),

stylecatalog: () => import('./modules/stylecatalog/view/stylecatalog.js?v=v2-clean-ui-4'),

ajustes:      () => import('./modules/ajustes/view/ajustes.js?v=v2-visual-variants-1'),

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

function NavBar({ tab }) {
  const scrollRef = useRef(null);
  const [compact, setCompact] = useState(() => globalThis.matchMedia?.('(max-width: 760px)').matches || false);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Compacto estable por viewport; no depende del scroll horizontal.
  useEffect(() => {
    const mq = globalThis.matchMedia?.('(max-width: 760px)');
    if (!mq) return;
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  // ResizeObserver — solo recalcula flechas de overflow
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      updateArrows();
    });
    ro.observe(el);
    updateArrows();
    return () => ro.disconnect();
  }, []);

  // Rueda del ratón → scroll horizontal
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      updateArrows();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 120, behavior: 'smooth' });
    setTimeout(updateArrows, 150);
  };

  const btnCls = (active) => [
    'flex items-center justify-center py-1 rounded text-xs whitespace-nowrap transition-colors flex-shrink-0',
    compact ? 'w-8 px-0' : 'gap-1 px-2',
    active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5',
  ].join(' ');

  const arrowCls = 'flex-shrink-0 flex items-center justify-center w-5 h-full text-white/30 hover:text-white/70 bg-black/30 cursor-pointer border-0 transition-colors text-xs select-none px-0.5';

  return h('nav', { class: 'relative z-10 flex items-stretch border-b border-white/5 bg-black/20 backdrop-blur-sm' },

    canLeft && h('button', { class: arrowCls, onClick: () => scroll(-1), title: 'Anterior' }, '‹'),

    h('div', {
      ref: scrollRef,
      class: 'flex gap-0.5 px-1 pt-1.5 pb-1 overflow-x-auto scrollbar-none flex-1',
      onScroll: updateArrows,
    },
      TABS.map(t => h('button', {
        key: t.id,
        onClick: () => setTab(t.id),
        class: btnCls(tab === t.id),
        title: t.label,
        'aria-label': t.label,
      },
        h('span', {
          class: 'flex-shrink-0 flex items-center justify-center',
          style: 'width:14px;height:14px',
          dangerouslySetInnerHTML: { __html: t.svg || t.icon || '' },
        }),
        !compact && t.label,
      ))
    ),

    canRight && h('button', { class: arrowCls, onClick: () => scroll(1), title: 'Siguiente' }, '›'),
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

{ class: 'relative z-10 flex flex-col h-screen min-h-0' },

h(NavBar, { tab }),

h('main', { class: 'flex-1 min-h-0 overflow-hidden flex flex-col' }, h(ModuleView, { tabId: tab })),

h(Footer, {}),

),

h(CommandPalette, {}),

h(UserSwitcherMount, {}),

h(NotifMount, {}),

);

}

export default App;
