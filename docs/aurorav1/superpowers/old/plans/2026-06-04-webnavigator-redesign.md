# WebNavigator Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar WebNavigator de un buscador headless vacío a un panel de control real del browser Brave usando Chrome Extension APIs (`chrome.tabs` + `chrome.scripting`), con tres zonas: lista de tabs, inspector de página y panel de acciones con log.

**Architecture:** El frontend (Preact, sin build) usa `chrome.tabs` para listar y seleccionar tabs, `chrome.scripting.executeScript` para escanear el DOM de la tab seleccionada (inputs, botones, texto), y ejecuta acciones (navegar, click, escribir, scroll) también via scripting. No hay backend Python ni Playwright — todo corre dentro de la extensión. El estado vive en el store Redux de Aurora via la acción `SET_NAVIGATOR` ya registrada en `manifest.js`.

**Tech Stack:** Preact, HTM, CSS custom properties Aurora (var(--aurora-*)), chrome.tabs API, chrome.scripting API — sin build, sin bundler, sin JSX.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `WebNavigator.view/web-navigator.js` | **Reemplazar** | Componente principal — 3 zonas: tabs, inspector, acciones+log |
| `WebNavigator.styles/general.css` | **Reemplazar** | Estilos completos usando var(--aurora-*) del design system |
| `WebNavigator.view/render.js` | **No tocar** | Adaptador generado, re-exporta web-navigator.js |
| `manifest.js` | **Modificar** icon | Cambiar icon 📄 → 🧭 |

Archivos que NO se tocan: `WebNavigator.nexus.bridge.py`, `WebNavigator.nexus/browser-agent.py` (se dejan para uso futuro via herramientas AI).

---

## Task 1: Reemplazar CSS con design system Aurora

**Archivos:**
- Modify: `au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.styles/general.css`

El CSS actual usa colores hardcoded (`#3b82f6`, `#1a1a2e`, `white`). Hay que reemplazarlo todo usando las custom properties de Aurora para respetar el tema dark/glass del sidepanel.

- [ ] **Paso 1: Reemplazar general.css completo**

Reemplazar todo el contenido del archivo con:

```css
.wn-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: transparent;
  color: var(--aurora-text, #e2e8f0);
  font-size: 13px;
}

/* ── Header ── */
.wn-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  flex-shrink: 0;
}
.wn-header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--aurora-text);
  margin: 0;
}
.wn-header-sub {
  font-size: 11px;
  color: var(--aurora-text-muted, #94a3b8);
  margin: 0;
  margin-left: auto;
}

/* ── Sección genérica ── */
.wn-section {
  flex-shrink: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--aurora-border, #334155) 60%, transparent);
}
.wn-section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--aurora-text-muted);
  cursor: pointer;
  user-select: none;
}
.wn-section-label:hover { color: var(--aurora-text); }
.wn-section-label .wn-chevron { margin-left: auto; transition: transform 0.15s; }
.wn-section-label.collapsed .wn-chevron { transform: rotate(-90deg); }

/* ── Lista de tabs ── */
.wn-tabs-list {
  padding: 4px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}
.wn-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}
.wn-tab-item:hover {
  background: color-mix(in srgb, var(--aurora-surface, #1e293b) 80%, transparent);
}
.wn-tab-item.active {
  background: color-mix(in srgb, var(--aurora-accent, #3b82f6) 15%, transparent);
  border-color: color-mix(in srgb, var(--aurora-accent) 40%, transparent);
}
.wn-tab-favicon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 2px;
}
.wn-tab-favicon-fallback {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wn-tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--aurora-text);
}
.wn-tab-domain {
  font-size: 10px;
  color: var(--aurora-text-muted);
  flex-shrink: 0;
}
.wn-tab-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--aurora-accent);
  flex-shrink: 0;
}

/* ── Inspector ── */
.wn-inspector {
  padding: 8px 14px 10px;
}
.wn-inspector-url {
  font-size: 11px;
  color: var(--aurora-accent);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wn-inspector-empty {
  font-size: 12px;
  color: var(--aurora-text-muted);
  padding: 8px 0;
}
.wn-inspector-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
}
.wn-stat-card {
  background: color-mix(in srgb, var(--aurora-surface) 60%, transparent);
  border: 1px solid color-mix(in srgb, var(--aurora-border) 50%, transparent);
  border-radius: 6px;
  padding: 6px 8px;
}
.wn-stat-val {
  font-size: 18px;
  font-weight: 700;
  color: var(--aurora-text);
  line-height: 1;
}
.wn-stat-lbl {
  font-size: 10px;
  color: var(--aurora-text-muted);
  margin-top: 2px;
}
.wn-element-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.wn-chip {
  background: color-mix(in srgb, var(--aurora-surface) 70%, transparent);
  border: 1px solid color-mix(in srgb, var(--aurora-border) 60%, transparent);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  color: var(--aurora-text-muted);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wn-chip:hover {
  background: color-mix(in srgb, var(--aurora-accent) 20%, transparent);
  color: var(--aurora-text);
  border-color: color-mix(in srgb, var(--aurora-accent) 50%, transparent);
}
.wn-text-preview {
  font-size: 11px;
  color: var(--aurora-text-muted);
  line-height: 1.5;
  max-height: 56px;
  overflow: hidden;
  border-left: 2px solid color-mix(in srgb, var(--aurora-border) 80%, transparent);
  padding-left: 8px;
}
.wn-refresh-btn {
  margin-top: 6px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--aurora-border) 70%, transparent);
  border-radius: 5px;
  color: var(--aurora-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.wn-refresh-btn:hover {
  background: color-mix(in srgb, var(--aurora-surface) 80%, transparent);
  color: var(--aurora-text);
}
.wn-refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Panel de acciones ── */
.wn-actions {
  padding: 8px 14px 10px;
}
.wn-action-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.wn-action-input {
  flex: 1;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--aurora-surface) 60%, transparent);
  border: 1px solid color-mix(in srgb, var(--aurora-border) 70%, transparent);
  border-radius: 6px;
  color: var(--aurora-text);
  font-size: 12px;
  outline: none;
  min-width: 0;
}
.wn-action-input::placeholder { color: var(--aurora-text-muted); }
.wn-action-input:focus {
  border-color: color-mix(in srgb, var(--aurora-accent) 60%, transparent);
}
.wn-action-btn {
  padding: 6px 12px;
  background: color-mix(in srgb, var(--aurora-accent, #3b82f6) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--aurora-accent) 60%, transparent);
  border-radius: 6px;
  color: white;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.wn-action-btn:hover:not(:disabled) {
  background: var(--aurora-accent);
}
.wn-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wn-action-btn.ghost {
  background: transparent;
  border-color: color-mix(in srgb, var(--aurora-border) 70%, transparent);
  color: var(--aurora-text-muted);
}
.wn-action-btn.ghost:hover:not(:disabled) {
  background: color-mix(in srgb, var(--aurora-surface) 80%, transparent);
  color: var(--aurora-text);
}

/* ── Log ── */
.wn-log {
  flex: 1;
  overflow-y: auto;
  padding: 6px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 60px;
}
.wn-log-empty {
  font-size: 11px;
  color: var(--aurora-text-muted);
  padding: 4px 0;
}
.wn-log-entry {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: 11px;
  line-height: 1.4;
  padding: 3px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--aurora-surface) 40%, transparent);
}
.wn-log-entry.ok { color: var(--aurora-text); }
.wn-log-entry.err { color: #f87171; }
.wn-log-entry.info { color: var(--aurora-text-muted); }
.wn-log-icon { flex-shrink: 0; width: 14px; }
.wn-log-msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wn-log-time { flex-shrink: 0; color: var(--aurora-text-muted); font-size: 10px; }

/* ── Scrollbar ── */
.wn-tabs-list::-webkit-scrollbar,
.wn-log::-webkit-scrollbar { width: 4px; }
.wn-tabs-list::-webkit-scrollbar-thumb,
.wn-log::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--aurora-border) 80%, transparent);
  border-radius: 2px;
}

/* ── Spinner ── */
@keyframes wn-spin { to { transform: rotate(360deg); } }
.wn-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid color-mix(in srgb, var(--aurora-accent) 30%, transparent);
  border-top-color: var(--aurora-accent);
  border-radius: 50%;
  animation: wn-spin 0.6s linear infinite;
  flex-shrink: 0;
}
```

- [ ] **Paso 2: Verificar sintaxis — no hay JS aquí, pero confirmar que no quedaron llaves sueltas**

```bash
# contar llaves de apertura y cierre (deben ser iguales)
grep -o '{' /media/almacen/deml/Downloads/core_instruction/au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.styles/general.css | wc -l
grep -o '}' /media/almacen/deml/Downloads/core_instruction/au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.styles/general.css | wc -l
```

Ambos deben devolver el mismo número.

---

## Task 2: Actualizar manifest.js — icono

**Archivos:**
- Modify: `au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/manifest.js`

- [ ] **Paso 1: Cambiar icono 📄 → 🧭**

```js
export default {
  id:    'WebNavigator',
  label: 'Web Navigator',
  icon:  '🧭',
  ord:   17,
};
```

---

## Task 3: Reescribir web-navigator.js — estructura base y lista de tabs

**Archivos:**
- Modify: `au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.view/web-navigator.js`

Este task escribe el esqueleto completo del componente con la Zona 1 (lista de tabs) funcionando. Las zonas 2 y 3 se completan en Task 4.

`chrome.tabs.query` devuelve un array de objetos Tab con: `id`, `title`, `url`, `favIconUrl`, `active`, `windowId`.
`chrome.scripting.executeScript` requiere permiso `scripting` (ya existe en manifest) y ejecuta una función en el contexto de la tab.

- [ ] **Paso 1: Reemplazar web-navigator.js completo**

```js
const html = htm.bind(preact.h);
const { Component } = preact;
const { useState, useEffect, useRef } = preact;

const SET_NAVIGATOR = 'SET_NAVIGATOR';

const defaultState = {
  tabs: [],
  selectedTabId: null,
  inspector: null,
  inspecting: false,
  log: [],
  navInput: '',
  clickInput: '',
  typeTarget: '',
  typeText: '',
  collapsed: { tabs: false, inspector: false, actions: false },
};

function logEntry(type, icon, msg) {
  return { type, icon, msg, time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
}

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export function reducer(state = defaultState, action) {
  if (action.type === SET_NAVIGATOR) return { ...state, ...action.payload };
  return state;
}

export class WebNavigator extends Component {
  constructor(props) {
    super(props);
    this._unsub = null;
  }

  componentDidMount() {
    if (!store.getState().webnavigator) {
      store.dispatch({ type: SET_NAVIGATOR, payload: defaultState });
    }
    this._unsub = store.subscribe(() => this.forceUpdate());
    this._loadTabs();
  }

  componentWillUnmount() {
    if (this._unsub) this._unsub();
  }

  _dispatch(payload) {
    store.dispatch({ type: SET_NAVIGATOR, payload });
  }

  _addLog(type, icon, msg) {
    const wn = store.getState().webnavigator || defaultState;
    const log = [logEntry(type, icon, msg), ...(wn.log || [])].slice(0, 40);
    this._dispatch({ log });
  }

  async _loadTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      const filtered = tabs
        .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && t.type !== 'iframe')
        .map(t => ({ id: t.id, title: t.title || '(sin título)', url: t.url, favIconUrl: t.favIconUrl || '', active: t.active }));
      this._dispatch({ tabs: filtered });
    } catch (err) {
      this._addLog('err', '✗', 'Error cargando tabs: ' + err.message);
    }
  }

  async _selectTab(tabId) {
    this._dispatch({ selectedTabId: tabId, inspector: null });
    await this._inspectTab(tabId);
  }

  async _inspectTab(tabId) {
    this._dispatch({ inspecting: true });
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]), textarea, select, [contenteditable="true"]'))
            .slice(0, 20)
            .map(el => ({
              tag: el.tagName.toLowerCase(),
              type: el.type || el.tagName.toLowerCase(),
              placeholder: el.placeholder || '',
              name: el.name || el.id || el.getAttribute('aria-label') || '',
              value: (el.value || el.textContent || '').slice(0, 60),
            }));
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
            .slice(0, 20)
            .map(el => ({
              text: (el.textContent || el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 50),
              disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
            }))
            .filter(b => b.text);
          const links = Array.from(document.querySelectorAll('a[href]'))
            .slice(0, 15)
            .map(el => ({ text: (el.textContent || '').trim().slice(0, 40), href: el.href }))
            .filter(l => l.text);
          const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300);
          return { inputs, buttons, links, bodyText, title: document.title, url: location.href };
        },
      });
      const data = results?.[0]?.result;
      if (data) {
        this._dispatch({ inspector: data, inspecting: false });
        this._addLog('ok', '✓', `Inspeccionado: ${data.title.slice(0, 40)}`);
      }
    } catch (err) {
      this._dispatch({ inspecting: false });
      this._addLog('err', '✗', 'Error inspeccionando: ' + err.message);
    }
  }

  async _navigate() {
    const wn = store.getState().webnavigator || defaultState;
    const { selectedTabId, navInput } = wn;
    if (!selectedTabId || !navInput.trim()) return;
    const url = navInput.startsWith('http') ? navInput : 'https://' + navInput;
    try {
      await chrome.tabs.update(selectedTabId, { url });
      this._addLog('ok', '→', `Navegando a ${url}`);
      this._dispatch({ navInput: '' });
      setTimeout(() => this._inspectTab(selectedTabId), 2000);
    } catch (err) {
      this._addLog('err', '✗', 'Error navegando: ' + err.message);
    }
  }

  async _clickElement() {
    const wn = store.getState().webnavigator || defaultState;
    const { selectedTabId, clickInput } = wn;
    if (!selectedTabId || !clickInput.trim()) return;
    const selector = clickInput.trim();
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: selectedTabId },
        func: (sel) => {
          const el = document.querySelector(sel)
            || Array.from(document.querySelectorAll('button,[role="button"],a')).find(e =>
               (e.textContent || '').trim().toLowerCase().includes(sel.toLowerCase()));
          if (!el) return { ok: false, msg: 'Elemento no encontrado' };
          el.click();
          return { ok: true, msg: el.textContent?.trim().slice(0, 40) || sel };
        },
        args: [selector],
      });
      const r = results?.[0]?.result;
      if (r?.ok) {
        this._addLog('ok', '✓', `Click: "${r.msg}"`);
        this._dispatch({ clickInput: '' });
        setTimeout(() => this._inspectTab(selectedTabId), 800);
      } else {
        this._addLog('err', '✗', r?.msg || 'No encontrado');
      }
    } catch (err) {
      this._addLog('err', '✗', 'Error click: ' + err.message);
    }
  }

  async _typeInElement() {
    const wn = store.getState().webnavigator || defaultState;
    const { selectedTabId, typeTarget, typeText } = wn;
    if (!selectedTabId || !typeTarget.trim() || !typeText.trim()) return;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: selectedTabId },
        func: (sel, text) => {
          const el = document.querySelector(sel)
            || Array.from(document.querySelectorAll('input,textarea,[contenteditable]')).find(e =>
               (e.placeholder || e.name || e.id || '').toLowerCase().includes(sel.toLowerCase()));
          if (!el) return { ok: false, msg: 'Input no encontrado' };
          el.focus();
          if (el.isContentEditable) {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
          } else {
            el.value = text;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, msg: (el.placeholder || el.name || sel).slice(0, 30) };
        },
        args: [typeTarget, typeText],
      });
      const r = results?.[0]?.result;
      if (r?.ok) {
        this._addLog('ok', '✓', `Escribió en "${r.msg}": ${typeText.slice(0, 30)}`);
        this._dispatch({ typeText: '' });
      } else {
        this._addLog('err', '✗', r?.msg || 'No encontrado');
      }
    } catch (err) {
      this._addLog('err', '✗', 'Error escribiendo: ' + err.message);
    }
  }

  async _scroll(direction) {
    const wn = store.getState().webnavigator || defaultState;
    const { selectedTabId } = wn;
    if (!selectedTabId) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: selectedTabId },
        func: (dir) => {
          const dy = dir === 'down' ? 400 : dir === 'up' ? -400 : dir === 'bottom' ? 99999 : -99999;
          window.scrollBy({ top: dy, behavior: 'smooth' });
        },
        args: [direction],
      });
      this._addLog('info', '↕', `Scroll ${direction}`);
    } catch (err) {
      this._addLog('err', '✗', 'Error scroll: ' + err.message);
    }
  }

  _toggleSection(key) {
    const wn = store.getState().webnavigator || defaultState;
    const collapsed = { ...(wn.collapsed || {}), [key]: !wn.collapsed?.[key] };
    this._dispatch({ collapsed });
  }

  render() {
    const wn = store.getState().webnavigator || defaultState;
    const {
      tabs = [], selectedTabId, inspector, inspecting,
      log = [], navInput = '', clickInput = '', typeTarget = '', typeText = '',
      collapsed = {},
    } = wn;

    const selectedTab = tabs.find(t => t.id === selectedTabId);

    return html`
      <div class="wn-root">

        <div class="wn-header">
          <span style="font-size:16px">🧭</span>
          <h2 class="wn-header-title">Web Navigator</h2>
          <span class="wn-header-sub">${tabs.length} tabs</span>
        </div>

        <!-- ZONA 1: Tabs abiertas -->
        <div class="wn-section">
          <div
            class=${'wn-section-label' + (collapsed.tabs ? ' collapsed' : '')}
            onClick=${() => this._toggleSection('tabs')}
          >
            <span>📑</span> TABS ABIERTAS
            <button
              style="margin-left:4px;background:transparent;border:none;color:inherit;cursor:pointer;font-size:11px;padding:0 4px"
              onClick=${e => { e.stopPropagation(); this._loadTabs(); }}
              title="Recargar lista"
            >↺</button>
            <span class="wn-chevron">▾</span>
          </div>
          ${!collapsed.tabs && html`
            <div class="wn-tabs-list">
              ${tabs.length === 0
                ? html`<span class="wn-inspector-empty">Sin tabs — pulsa ↺ para cargar</span>`
                : tabs.map(tab => html`
                  <div
                    key=${tab.id}
                    class=${'wn-tab-item' + (tab.id === selectedTabId ? ' active' : '')}
                    onClick=${() => this._selectTab(tab.id)}
                  >
                    ${tab.active ? html`<span class="wn-tab-active-dot"></span>` : null}
                    ${tab.favIconUrl
                      ? html`<img class="wn-tab-favicon" src=${tab.favIconUrl} alt="" onerror=${e => { e.target.style.display='none'; }} />`
                      : html`<span class="wn-tab-favicon-fallback">🌐</span>`
                    }
                    <span class="wn-tab-title">${tab.title}</span>
                    <span class="wn-tab-domain">${domainFromUrl(tab.url)}</span>
                  </div>
                `)
              }
            </div>
          `}
        </div>

        <!-- ZONA 2: Inspector -->
        <div class="wn-section">
          <div
            class=${'wn-section-label' + (collapsed.inspector ? ' collapsed' : '')}
            onClick=${() => this._toggleSection('inspector')}
          >
            <span>🔬</span> INSPECTOR
            ${inspecting ? html`<span class="wn-spinner" style="margin-left:6px"></span>` : null}
            <span class="wn-chevron">▾</span>
          </div>
          ${!collapsed.inspector && html`
            <div class="wn-inspector">
              ${!selectedTab
                ? html`<span class="wn-inspector-empty">Seleccioná una tab arriba</span>`
                : html`
                  <div class="wn-inspector-url">${selectedTab.url}</div>
                  ${inspector ? html`
                    <div class="wn-inspector-grid">
                      <div class="wn-stat-card">
                        <div class="wn-stat-val">${inspector.inputs.length}</div>
                        <div class="wn-stat-lbl">Inputs</div>
                      </div>
                      <div class="wn-stat-card">
                        <div class="wn-stat-val">${inspector.buttons.length}</div>
                        <div class="wn-stat-lbl">Botones</div>
                      </div>
                    </div>
                    <div class="wn-element-chips">
                      ${inspector.buttons.slice(0, 6).map((b, i) => html`
                        <span
                          key=${i}
                          class="wn-chip"
                          title=${b.text}
                          onClick=${() => this._dispatch({ clickInput: b.text })}
                        >${b.text}</span>
                      `)}
                    </div>
                    <div class="wn-element-chips">
                      ${inspector.inputs.slice(0, 4).map((inp, i) => html`
                        <span
                          key=${i}
                          class="wn-chip"
                          style="border-style:dashed"
                          title=${inp.placeholder || inp.name || inp.tag}
                          onClick=${() => this._dispatch({ typeTarget: inp.placeholder || inp.name || inp.tag })}
                        >${inp.placeholder || inp.name || inp.tag || 'input'}</span>
                      `)}
                    </div>
                    <div class="wn-text-preview">${inspector.bodyText}</div>
                    <button class="wn-refresh-btn" disabled=${inspecting} onClick=${() => this._inspectTab(selectedTabId)}>
                      ↺ Actualizar
                    </button>
                  ` : html`
                    <span class="wn-inspector-empty">${inspecting ? 'Escaneando...' : 'Seleccioná una tab para inspeccionar'}</span>
                  `}
                `
              }
            </div>
          `}
        </div>

        <!-- ZONA 3: Acciones -->
        <div class="wn-section">
          <div
            class=${'wn-section-label' + (collapsed.actions ? ' collapsed' : '')}
            onClick=${() => this._toggleSection('actions')}
          >
            <span>⚡</span> ACCIONES
            <span class="wn-chevron">▾</span>
          </div>
          ${!collapsed.actions && html`
            <div class="wn-actions">
              <div class="wn-action-row">
                <input
                  class="wn-action-input"
                  placeholder="URL o dominio para navegar"
                  value=${navInput}
                  onInput=${e => this._dispatch({ navInput: e.target.value })}
                  onKeyDown=${e => e.key === 'Enter' && this._navigate()}
                  disabled=${!selectedTabId}
                />
                <button class="wn-action-btn" disabled=${!selectedTabId || !navInput.trim()} onClick=${() => this._navigate()}>
                  Ir →
                </button>
              </div>

              <div class="wn-action-row">
                <input
                  class="wn-action-input"
                  placeholder="Texto o selector del botón a clickear"
                  value=${clickInput}
                  onInput=${e => this._dispatch({ clickInput: e.target.value })}
                  onKeyDown=${e => e.key === 'Enter' && this._clickElement()}
                  disabled=${!selectedTabId}
                />
                <button class="wn-action-btn" disabled=${!selectedTabId || !clickInput.trim()} onClick=${() => this._clickElement()}>
                  Click
                </button>
              </div>

              <div class="wn-action-row">
                <input
                  class="wn-action-input"
                  placeholder="Placeholder o nombre del input"
                  value=${typeTarget}
                  onInput=${e => this._dispatch({ typeTarget: e.target.value })}
                  disabled=${!selectedTabId}
                  style="flex:0.8"
                />
                <input
                  class="wn-action-input"
                  placeholder="Texto a escribir"
                  value=${typeText}
                  onInput=${e => this._dispatch({ typeText: e.target.value })}
                  onKeyDown=${e => e.key === 'Enter' && this._typeInElement()}
                  disabled=${!selectedTabId}
                />
                <button class="wn-action-btn" disabled=${!selectedTabId || !typeTarget.trim() || !typeText.trim()} onClick=${() => this._typeInElement()}>
                  ✎
                </button>
              </div>

              <div class="wn-action-row">
                ${['top','up','down','bottom'].map(dir => html`
                  <button key=${dir} class="wn-action-btn ghost" disabled=${!selectedTabId} onClick=${() => this._scroll(dir)} style="flex:1;padding:4px">
                    ${{ top: '⤒', up: '↑', down: '↓', bottom: '⤓' }[dir]}
                  </button>
                `)}
              </div>
            </div>
          `}
        </div>

        <!-- LOG -->
        <div class="wn-section-label" style="border-bottom:none;padding-bottom:2px">
          <span>📋</span> LOG
          ${log.length > 0 ? html`
            <button
              style="margin-left:auto;background:transparent;border:none;color:var(--aurora-text-muted);cursor:pointer;font-size:10px"
              onClick=${() => this._dispatch({ log: [] })}
            >limpiar</button>
          ` : null}
        </div>
        <div class="wn-log">
          ${log.length === 0
            ? html`<span class="wn-log-empty">Sin acciones aún</span>`
            : log.map((e, i) => html`
              <div key=${i} class=${'wn-log-entry ' + e.type}>
                <span class="wn-log-icon">${e.icon}</span>
                <span class="wn-log-msg" title=${e.msg}>${e.msg}</span>
                <span class="wn-log-time">${e.time}</span>
              </div>
            `)
          }
        </div>

      </div>
    `;
  }
}

export default WebNavigator;
```

- [ ] **Paso 2: Verificar sintaxis JS**

```bash
node --check /media/almacen/deml/Downloads/core_instruction/au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.view/web-navigator.js
```

Debe salir sin output (sin errores).

---

## Task 4: Build y recarga

**Archivos:** ninguno nuevo — solo build

- [ ] **Paso 1: Build de la extensión**

```bash
cd /media/almacen/deml/Downloads/core_instruction/aaa
node tools/build-extension.mjs --id=aihub
```

Debe terminar sin errores. Ignorar warnings de módulos no relacionados.

- [ ] **Paso 2: Recargar extensión via CDP**

```bash
node /media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs sidepanel ckickpdblhccbpglafaknnlflpifnopf --timeout 10000
```

```bash
node /media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs eval 'chrome.runtime.reload(); "ok"' --target "AI Hub" --timeout 10000
```

Esperar 3 segundos y luego:

```bash
sleep 3 && node /media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs aurora-tab aihub WebNavigator
```

- [ ] **Paso 3: Screenshot para verificar**

```bash
sleep 1 && node /media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs screenshot /tmp/wn-after.png --target "AI Hub"
```

Abrir `/tmp/wn-after.png` y verificar que se ven las 3 zonas: lista de tabs, inspector, acciones+log.

- [ ] **Paso 4: Verificar que chrome.tabs.query carga tabs**

```bash
node /media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs eval "
JSON.stringify(store.getState().webnavigator?.tabs?.slice(0,3)?.map(t=>t.title) || 'sin tabs')
" --target "AI Hub"
```

Debe devolver un array con títulos de tabs abiertas (ej: `["Suno | AI Music","YouTube",...]`).

---

## Self-Review

**Cobertura de spec:**
- ✓ Lista de tabs con favicon, título, dominio, indicador de tab activa → Task 3 zona 1
- ✓ Inspector: inputs count, botones count, chips clicables, texto preview → Task 3 zona 2
- ✓ Acciones: navegar, click, escribir, scroll → Task 3 zona 3
- ✓ Log de pasos con tipo, icono, mensaje, hora → Task 3 zona log
- ✓ CSS con design system Aurora (var(--aurora-*)) → Task 1
- ✓ Icono actualizado → Task 2
- ✓ Build y verificación → Task 4

**Placeholders:** ninguno.

**Consistencia de tipos:**
- `SET_NAVIGATOR` usado en reducer, dispatch y componentDidMount — consistente
- `defaultState` con todos los campos que usa el render — consistente
- `_inspectTab(tabId)` llamado con `selectedTabId` (number) — consistente
- `chrome.scripting.executeScript` devuelve `results[0].result` — consistente con uso en `_inspectTab`, `_clickElement`, `_typeInElement`
