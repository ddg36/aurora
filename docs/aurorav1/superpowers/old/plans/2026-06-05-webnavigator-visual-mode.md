# WebNavigator Modo Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un 5º tab "Visual" al WebNavigator que captura el viewport de la tab seleccionada, lo muestra en el sidepanel, y permite clickear/escribir por imagen mapeando a clicks físicos por coordenadas.

**Architecture:** Reusa las primitivas físicas existentes (`chrome.debugger` + `Input.dispatchMouseEvent`/`insertText`). Captura con `chrome.tabs.captureVisibleTab`. El click sobre la imagen se mapea a coordenadas reales del viewport por razón de proporción (porcentajes), y las cajas guía del inspector se dibujan con la fórmula inversa, también en porcentajes (escalan solas con la imagen).

**Tech Stack:** Preact + HTM (sin JSX/build de la vista), Chrome Extension APIs, Redux store global (`SET_NAVIGATOR`), BraveTools CDP para verificación.

**Verificación:** Este componente no tiene tests automatizados (corre dentro de la extensión). Cada tarea se verifica con el ciclo del proyecto: `node --check` → build → reload → screenshot/eval con BraveTools. No se hacen commits salvo que el usuario los pida.

**Constantes de trabajo:**
- Archivo principal: `au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.view/web-navigator.js`
- CSS: `au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.styles/general.css`
- Extension ID: `ckickpdblhccbpglafaknnlflpifnopf`
- CDP: `node /media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs`
- Build: `cd /media/almacen/deml/Downloads/core_instruction/aaa && node tools/build-extension.mjs --id=aihub`

**Bloque de reload (se repite en cada verificación — referido como `RELOAD`):**
```bash
CDP=/media/almacen/deml/Downloads/core_instruction/aaa/tools/bravetools/cdp.mjs
node $CDP eval 'chrome.runtime.reload(); "ok"' --target "AI Hub"
sleep 4
node $CDP sidepanel ckickpdblhccbpglafaknnlflpifnopf
sleep 2
node $CDP aurora-tab aihub WebNavigator
sleep 1
```

---

## File Structure

- `web-navigator.js` — todo el componente. Cambios:
  - `defaultState`: 3 claves nuevas (`visualShot`, `visualCapturing`, `visualShowBoxes`).
  - `_trustedClickPoint(tabId, x, y, button)` — método nuevo, extraído de `_trustedClick`.
  - `_captureViewport()`, `_visualClick(...)`, `_visualType(text)` — métodos nuevos.
  - modebar: entrada `['visual', 'Visual']`.
  - render: bloque del tab `visual`.
- `general.css` — clases `.wn-visual-*`.

---

## Task 1: Estado nuevo + tab "Visual" en el modebar (esqueleto)

**Files:**
- Modify: `web-navigator.js` (`defaultState` y el array del modebar y el render de vistas no-simple)

- [ ] **Step 1: Agregar estado al `defaultState`**

Localizar el objeto `defaultState` (cerca del tope del archivo) y agregar las 3 claves después de `typeText: ''`:

```js
  typeText: '',
  visualShot: null,
  visualCapturing: false,
  visualShowBoxes: true,
```

- [ ] **Step 2: Agregar 'visual' al modebar**

Localizar el array del modebar en el render:

```js
        <div class="wn-modebar">
          ${[
            ['simple', 'Simple'],
            ['workflows', 'Workflows'],
            ['builder', 'Builder'],
            ['runs', 'Runs / Debug'],
          ].map(([id, label]) => html`
```

Reemplazar el array por:

```js
        <div class="wn-modebar">
          ${[
            ['simple', 'Simple'],
            ['visual', 'Visual'],
            ['workflows', 'Workflows'],
            ['builder', 'Builder'],
            ['runs', 'Runs / Debug'],
          ].map(([id, label]) => html`
```

- [ ] **Step 3: Agregar el bloque de render del tab visual (placeholder)**

Localizar el inicio de la cadena ternaria de vistas no-simple:

```js
        ${activeView !== 'simple' ? html`
          ${activeView === 'workflows' ? html`
```

Insertar la rama `visual` como primer caso, dejando el resto igual:

```js
        ${activeView !== 'simple' ? html`
          ${activeView === 'visual' ? html`
            <div class="wn-visual">
              <div class="wn-visual-empty">Sin captura. Selecciona una tab y entra a Visual.</div>
            </div>
          ` : activeView === 'workflows' ? html`
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check /media/almacen/deml/Downloads/core_instruction/au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.view/web-navigator.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Build + reload + verificar que el tab aparece**

Run build, luego `RELOAD`, luego:
```bash
node $CDP eval "(function(){ const btns=Array.from(document.querySelectorAll('.wn-modebar button')); return btns.map(b=>b.textContent.trim()); })()" --target "AI Hub"
```
Expected: array que incluye `"Visual"` entre `"Simple"` y `"Workflows"`.

- [ ] **Step 6: Verificar que el tab muestra el placeholder**

```bash
node $CDP eval "(function(){ const v=Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual'); v.click(); return document.querySelector('.wn-visual-empty')?.textContent; })()" --target "AI Hub"
```
Expected: `"Sin captura. Selecciona una tab y entra a Visual."`

---

## Task 2: `_captureViewport()` — captura y muestra la imagen

**Files:**
- Modify: `web-navigator.js` (método nuevo + render del tab visual)

- [ ] **Step 1: Agregar el método `_captureViewport`**

Insertar este método justo después de `_inspectTab` (o cerca de los otros métodos `async`):

```js
  async _captureViewport() {
    const wn = store.getState().webnavigator || defaultState;
    const tab = await this._ensureTab(wn.selectedTabId);
    if (!tab?.id) return;
    this._dispatch({ visualCapturing: true });
    try {
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });
      const dims = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 }),
      });
      const viewport = dims?.[0]?.result || { w: 0, h: 0, dpr: 1 };
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      this._dispatch({
        visualShot: { dataUrl, viewport: { w: viewport.w, h: viewport.h }, dpr: viewport.dpr, at: Date.now() },
        visualCapturing: false,
      });
      await this._inspectTab(tab.id);
    } catch (err) {
      this._dispatch({ visualCapturing: false });
      this._addLog('err', '✗', 'Error capturando viewport: ' + err.message);
    }
  }
```

- [ ] **Step 2: Disparar captura al entrar al tab visual**

Localizar el handler del modebar:

```js
            <button
              key=${id}
              class=${activeView === id ? 'active' : ''}
              onClick=${() => this._dispatch({ activeView: id })}
            >${label}</button>
```

Reemplazar el `onClick` para capturar al entrar a visual:

```js
            <button
              key=${id}
              class=${activeView === id ? 'active' : ''}
              onClick=${() => { this._dispatch({ activeView: id }); if (id === 'visual') this._captureViewport(); }}
            >${label}</button>
```

- [ ] **Step 3: Render de la imagen en el tab visual**

Reemplazar el bloque placeholder del tab visual (de Task 1 Step 3) por:

```js
          ${activeView === 'visual' ? html`
            <div class="wn-visual">
              <div class="wn-visual-bar">
                <button class="wn-action-btn ghost" disabled=${!selectedTabId || visualCapturing} onClick=${() => this._captureViewport()}>↺ Capturar</button>
                <span class="wn-visual-status">${visualCapturing ? 'capturando…' : visualShot ? `${visualShot.viewport.w}×${visualShot.viewport.h}` : 'sin captura'}</span>
              </div>
              ${visualShot?.dataUrl ? html`
                <div class="wn-visual-stage">
                  <img class="wn-visual-img" src=${visualShot.dataUrl} alt="captura" />
                </div>
              ` : html`<div class="wn-visual-empty">Selecciona una tab. Entra a Visual para capturar.</div>`}
            </div>
          ` : activeView === 'workflows' ? html`
```

- [ ] **Step 4: Exponer las variables nuevas en el destructuring del render**

Localizar el destructuring al inicio de `render()`:

```js
      log = [], navInput = '', clickInput = '', typeTarget = '', typeText = '',
```

Agregar las claves visuales en la misma línea de destructuring (debe quedar dentro del mismo `const { ... } = wn;`):

```js
      log = [], navInput = '', clickInput = '', typeTarget = '', typeText = '',
      visualShot = null, visualCapturing = false, visualShowBoxes = true,
```

- [ ] **Step 5: Verificar sintaxis**

Run: `node --check .../web-navigator.js`
Expected: exit 0.

- [ ] **Step 6: Build + reload + capturar Google y verificar la imagen**

Build, `RELOAD`, luego cargar tabs y seleccionar una tab real:
```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.toLowerCase().includes('google')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 4
node $CDP eval "(function(){ const v=Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual'); v.click(); return 'clicked'; })()" --target "AI Hub"
sleep 3
node $CDP eval "(function(){ const wn=store.getState().webnavigator; return { hasShot: !!wn.visualShot?.dataUrl, viewport: wn.visualShot?.viewport, imgInDom: !!document.querySelector('.wn-visual-img') }; })()" --target "AI Hub"
```
Expected: `{ hasShot: true, viewport: { w: <num>, h: <num> }, imgInDom: true }`.

- [ ] **Step 7: Screenshot de confirmación visual**

```bash
node $CDP screenshot /tmp/wn-visual-shot.png --target "AI Hub"
```
Expected: el sidepanel muestra la captura del sitio dentro del tab Visual. Leer la imagen y confirmar que se ve el contenido de la tab.

---

## Task 3: Extraer `_trustedClickPoint` de `_trustedClick`

**Files:**
- Modify: `web-navigator.js` (`_trustedClick` y método nuevo)

- [ ] **Step 1: Agregar el método `_trustedClickPoint`**

Insertar este método inmediatamente antes de `_trustedClick`:

```js
  async _trustedClickPoint(tabId, x, y, button = 'left') {
    if (!chrome.debugger) return { ok: false, msg: 'Debugger no disponible' };
    const target = { tabId };
    let attached = false;
    try {
      await chrome.debugger.attach(target, '1.3');
      attached = true;
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
      return { ok: true, mode: 'debugger' };
    } catch (err) {
      return { ok: false, msg: err.message };
    } finally {
      if (attached) {
        try { await chrome.debugger.detach(target); } catch {}
      }
    }
  }
```

- [ ] **Step 2: Hacer que `_trustedClick` use `_trustedClickPoint`**

Localizar dentro de `_trustedClick` el bloque final que hace attach/dispatch/detach (después del fallback sintético):

```js
      if (pointFailed) return point || { ok: false, msg: 'No se pudo clickear' };
      await chrome.debugger.attach(target, '1.3');
      attached = true;
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button, clickCount: 1 });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button, clickCount: 1 });
      return { ok: true, msg: point.msg || targetRef?.selector || String(targetRef || ''), mode: 'debugger' };
```

Reemplazarlo por:

```js
      if (pointFailed) return point || { ok: false, msg: 'No se pudo clickear' };
      const res = await this._trustedClickPoint(tabId, point.x, point.y, button);
      if (!res.ok) return res;
      return { ok: true, msg: point.msg || targetRef?.selector || String(targetRef || ''), mode: 'debugger' };
```

Nota: tras este cambio, las variables `target` y `attached` declaradas arriba en `_trustedClick` pueden quedar sin uso en esa rama. NO eliminarlas si otras ramas de `_trustedClick` las usan; dejarlas. Verificar en el Step 3 que no rompió nada.

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check .../web-navigator.js`
Expected: exit 0.

- [ ] **Step 4: Build + reload + verificar que el click normal (modo Simple) sigue funcionando**

Build, `RELOAD`, seleccionar Google, escanear, y hacer click en un chip detectado:
```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.toLowerCase().includes('google')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 4
node $CDP eval "(function(){ const wn=store.getState().webnavigator; const b=(wn.inspector?.buttons||[]).find(x=>/buscar|search/i.test(x.text)); if(!b) return 'no btn'; store.dispatch({type:'SET_NAVIGATOR',payload:{clickInput:b}}); const c=Array.from(document.querySelectorAll('.wn-action-btn')).find(x=>x.textContent.trim()==='Click'); c?.click(); return 'clicked'; })()" --target "AI Hub"
sleep 3
node $CDP eval "store.getState().webnavigator?.log?.slice(0,2).map(l=>l.icon+' '+l.msg.slice(0,40))" --target "AI Hub"
```
Expected: el log muestra un `✓ Click: ...` (el refactor no rompió el click normal).

---

## Task 4: `_visualClick` — mapeo + click por coordenadas + recaptura

**Files:**
- Modify: `web-navigator.js` (método nuevo + handler en el render)

- [ ] **Step 1: Agregar el método `_visualClick`**

Insertar después de `_captureViewport`:

```js
  async _visualClick(relX, relY, stageW, stageH, button = 'left') {
    const wn = store.getState().webnavigator || defaultState;
    const shot = wn.visualShot;
    if (!shot?.viewport || !stageW || !stageH) return;
    const tab = await this._ensureTab(wn.selectedTabId);
    if (!tab?.id) return;
    const realX = Math.round((relX / stageW) * shot.viewport.w);
    const realY = Math.round((relY / stageH) * shot.viewport.h);
    const res = await this._trustedClickPoint(tab.id, realX, realY, button);
    if (res?.ok) {
      this._addLog('ok', '✓', `Click visual: ${realX},${realY}`);
      setTimeout(() => this._captureViewport(), 600);
    } else {
      this._addLog('err', '✗', res?.msg || 'No se pudo clickear');
    }
  }
```

- [ ] **Step 2: Cablear el click del stage en el render**

Reemplazar el `<div class="wn-visual-stage">` del Task 2 Step 3 por una versión con handler. El handler calcula la posición relativa al contenedor con `getBoundingClientRect` (robusto ante overlays):

```js
                <div class="wn-visual-stage" onClick=${e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  this._visualClick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
                }}>
                  <img class="wn-visual-img" src=${visualShot.dataUrl} alt="captura" />
                </div>
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check .../web-navigator.js`
Expected: exit 0.

- [ ] **Step 4: Build + reload + click por imagen en el menú de ComfyUI**

Build, `RELOAD`. Seleccionar la tab de ComfyUI, entrar a Visual, y simular un click sobre la imagen en la zona del botón de menú (esquina superior izquierda). El menú de ComfyUI debe abrirse.

```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.includes('ComfyUI')||i.textContent.includes('Unsaved Workflow')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 5
node $CDP eval "(function(){ const v=Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual'); v.click(); return 'visual'; })()" --target "AI Hub"
sleep 3
node $CDP eval "(function(){ const stage=document.querySelector('.wn-visual-stage'); const r=stage.getBoundingClientRect(); const x=r.left+22*(r.width/store.getState().webnavigator.visualShot.viewport.w); const y=r.top+83*(r.height/store.getState().webnavigator.visualShot.viewport.h); stage.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y})); return 'clicked at viewport ~22,83'; })()" --target "AI Hub"
sleep 3
node $CDP screenshot /tmp/wn-visual-comfy-menu.png --target "ComfyUI"
```
Expected: leer `/tmp/wn-visual-comfy-menu.png` y confirmar que el menú de ComfyUI (New, File, Edit, View…) está abierto. El log del WebNavigator muestra `✓ Click visual: ...`.

---

## Task 5: Cajas guía del inspector + toggle

**Files:**
- Modify: `web-navigator.js` (render del stage) y `general.css`

- [ ] **Step 1: Agregar overlay de cajas y toggle al render del stage**

Reemplazar el bloque `<div class="wn-visual-bar">` y `<div class="wn-visual-stage">` por la versión con toggle y overlay de cajas en porcentajes:

```js
              <div class="wn-visual-bar">
                <button class="wn-action-btn ghost" disabled=${!selectedTabId || visualCapturing} onClick=${() => this._captureViewport()}>↺ Capturar</button>
                <button class=${'wn-action-btn ghost' + (visualShowBoxes ? ' active' : '')} onClick=${() => this._dispatch({ visualShowBoxes: !visualShowBoxes })}>Cajas</button>
                <span class="wn-visual-status">${visualCapturing ? 'capturando…' : visualShot ? `${visualShot.viewport.w}×${visualShot.viewport.h}` : 'sin captura'}</span>
              </div>
              ${visualShot?.dataUrl ? html`
                <div class="wn-visual-stage" onClick=${e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  this._visualClick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
                }}>
                  <img class="wn-visual-img" src=${visualShot.dataUrl} alt="captura" />
                  ${visualShowBoxes ? html`
                    <div class="wn-visual-boxes">
                      ${[...(inspector?.buttons || []), ...(inspector?.inputs || []), ...(inspector?.links || [])]
                        .filter(el => el.rect && el.rect.w > 0 && el.rect.h > 0)
                        .map((el, i) => html`
                          <div
                            key=${i}
                            class=${'wn-visual-box ' + (el.kind || 'button')}
                            title=${el.text || el.placeholder || el.kind}
                            style=${{
                              left: (el.rect.x / visualShot.viewport.w * 100) + '%',
                              top: (el.rect.y / visualShot.viewport.h * 100) + '%',
                              width: (el.rect.w / visualShot.viewport.w * 100) + '%',
                              height: (el.rect.h / visualShot.viewport.h * 100) + '%',
                            }}
                          ></div>
                        `)}
                    </div>
                  ` : null}
                </div>
              ` : html`<div class="wn-visual-empty">Selecciona una tab. Entra a Visual para capturar.</div>`}
```

- [ ] **Step 2: Agregar estilos `.wn-visual-*` al CSS**

Agregar al final de `general.css`:

```css
.wn-visual { display: flex; flex-direction: column; gap: 8px; }
.wn-visual-bar { display: flex; align-items: center; gap: 8px; }
.wn-visual-status { font-size: 11px; color: var(--aurora-text-muted); margin-left: auto; }
.wn-visual-empty { padding: 20px 12px; font-size: 12px; color: var(--aurora-text-muted); font-style: italic; text-align: center; }
.wn-visual-stage { position: relative; width: 100%; border: 1px solid color-mix(in srgb, var(--aurora-border) 70%, transparent); border-radius: 8px; overflow: hidden; cursor: crosshair; }
.wn-visual-img { display: block; width: 100%; height: auto; }
.wn-visual-boxes { position: absolute; inset: 0; pointer-events: none; }
.wn-visual-box { position: absolute; border: 1px solid color-mix(in srgb, var(--aurora-accent) 70%, transparent); background: color-mix(in srgb, var(--aurora-accent) 10%, transparent); border-radius: 2px; }
.wn-visual-box.input { border-color: color-mix(in srgb, #a78bfa 80%, transparent); background: color-mix(in srgb, #a78bfa 12%, transparent); }
.wn-visual-box.link { border-color: color-mix(in srgb, #60a5fa 80%, transparent); background: color-mix(in srgb, #60a5fa 10%, transparent); }
.wn-action-btn.ghost.active { border-color: color-mix(in srgb, var(--aurora-accent) 70%, transparent); color: var(--aurora-accent); }
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check .../web-navigator.js`
Expected: exit 0.

- [ ] **Step 4: Build + reload + verificar cajas alineadas en Google**

Build, `RELOAD`, seleccionar Google, entrar a Visual:
```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.toLowerCase().includes('google')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 4
node $CDP eval "(function(){ const v=Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual'); v.click(); return 'visual'; })()" --target "AI Hub"
sleep 3
node $CDP eval "document.querySelectorAll('.wn-visual-box').length" --target "AI Hub"
sleep 1
node $CDP screenshot /tmp/wn-visual-boxes.png --target "AI Hub"
```
Expected: `.wn-visual-box` count > 0; leer `/tmp/wn-visual-boxes.png` y confirmar que las cajas se dibujan sobre los elementos correctos de la captura.

- [ ] **Step 5: Verificar el toggle de cajas**

```bash
node $CDP eval "(function(){ const b=Array.from(document.querySelectorAll('.wn-visual-bar button')).find(x=>x.textContent.trim()==='Cajas'); b.click(); return { boxes: document.querySelectorAll('.wn-visual-box').length, showBoxes: store.getState().webnavigator.visualShowBoxes }; })()" --target "AI Hub"
```
Expected: `{ boxes: 0, showBoxes: false }` — el toggle oculta las cajas sin recapturar.

---

## Task 6: `_visualType` + campo de escritura tras enfocar

**Files:**
- Modify: `web-navigator.js` (método nuevo + barra de escritura en el render del tab visual)

- [ ] **Step 1: Agregar el método `_visualType`**

Insertar después de `_visualClick`. Escribe al elemento que tiene el foco actual (puesto por el último click), sin re-resolver selector:

```js
  async _visualType(text) {
    const wn = store.getState().webnavigator || defaultState;
    if (!text?.trim()) return;
    const tab = await this._ensureTab(wn.selectedTabId);
    if (!tab?.id || !chrome.debugger) return;
    const target = { tabId: tab.id };
    let attached = false;
    try {
      await chrome.debugger.attach(target, '1.3');
      attached = true;
      const insertOk = await chrome.debugger.sendCommand(target, 'Input.insertText', { text }).then(() => true).catch(() => false);
      if (!insertOk) {
        for (const ch of [...text]) {
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        }
      }
      this._addLog('ok', '✓', 'Escribió (visual): ' + text.slice(0, 30));
      this._dispatch({ typeText: '' });
      setTimeout(() => this._captureViewport(), 600);
    } catch (err) {
      this._addLog('err', '✗', 'Error escribiendo (visual): ' + err.message);
    } finally {
      if (attached) {
        try { await chrome.debugger.detach(target); } catch {}
      }
    }
  }
```

- [ ] **Step 2: Agregar la barra de escritura al render del tab visual**

Dentro del bloque `${visualShot?.dataUrl ? html\`...\`` , después del `</div>` que cierra `.wn-visual-stage`, agregar la fila de escritura:

```js
                </div>
                <div class="wn-visual-type">
                  <input
                    class="wn-action-input"
                    placeholder="Click un campo arriba, luego escribe aquí"
                    value=${typeText}
                    onInput=${e => this._dispatch({ typeText: e.target.value })}
                    onKeyDown=${e => e.key === 'Enter' && this._visualType(typeText)}
                  />
                  <button class="wn-action-btn" disabled=${!typeText.trim()} onClick=${() => this._visualType(typeText)}>✎</button>
                </div>
```

(Es decir: el `</div>` que cerraba el stage ahora va seguido por el bloque `.wn-visual-type`, ambos dentro del mismo `${visualShot?.dataUrl ? html\` ... \`}`.)

- [ ] **Step 3: Agregar estilos de la fila de escritura**

Agregar a `general.css`:

```css
.wn-visual-type { display: flex; gap: 6px; }
.wn-visual-type .wn-action-input { flex: 1; min-width: 0; }
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check .../web-navigator.js`
Expected: exit 0.

- [ ] **Step 5: Build + reload + escribir en la búsqueda de Google por imagen**

Build, `RELOAD`. Seleccionar Google, entrar a Visual, clickear sobre el campo de búsqueda (centro-superior de la captura), escribir y enviar:
```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.toLowerCase().includes('google')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 4
node $CDP eval "(function(){ const v=Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual'); v.click(); return 'visual'; })()" --target "AI Hub"
sleep 3
```
Localizar la caja del input de búsqueda y clickear su centro vía el stage, luego escribir:
```bash
node $CDP eval "(function(){ const wn=store.getState().webnavigator; const inp=(wn.inspector?.inputs||[]).find(i=>i.name==='q')||wn.inspector?.inputs?.[0]; if(!inp?.rect) return 'no input rect'; const stage=document.querySelector('.wn-visual-stage'); const r=stage.getBoundingClientRect(); const sx=r.width/wn.visualShot.viewport.w, sy=r.height/wn.visualShot.viewport.h; const cx=r.left+(inp.rect.x+inp.rect.w/2)*sx; const cy=r.top+(inp.rect.y+inp.rect.h/2)*sy; stage.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:cx,clientY:cy})); return 'clicked input'; })()" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ store.dispatch({type:'SET_NAVIGATOR',payload:{typeText:'aurora visual mode'}}); const b=Array.from(document.querySelectorAll('.wn-visual-type button')).find(x=>x.textContent.trim()==='✎'); b?.click(); return 'sent'; })()" --target "AI Hub"
sleep 2
node $CDP eval "document.querySelector('textarea[name=q]')?.value || document.querySelector('input[name=q]')?.value" --target "google"
```
Expected: el valor del campo `q` de Google es `"aurora visual mode"`. El log muestra `✓ Escribió (visual): ...`.

---

## Task 7: Scroll + recaptura, crosshair de feedback, edge case de captura

**Files:**
- Modify: `web-navigator.js` (barra del tab visual + handler de hover) y `general.css`

- [ ] **Step 1: Agregar botones de scroll a la barra visual**

En `.wn-visual-bar`, después del botón "Cajas", agregar dos botones de scroll que reusan `_scroll` y recapturan:

```js
                <button class=${'wn-action-btn ghost' + (visualShowBoxes ? ' active' : '')} onClick=${() => this._dispatch({ visualShowBoxes: !visualShowBoxes })}>Cajas</button>
                <button class="wn-action-btn ghost" disabled=${!selectedTabId} onClick=${async () => { await this._scroll('up'); setTimeout(() => this._captureViewport(), 500); }}>↑</button>
                <button class="wn-action-btn ghost" disabled=${!selectedTabId} onClick=${async () => { await this._scroll('down'); setTimeout(() => this._captureViewport(), 500); }}>↓</button>
```

- [ ] **Step 2: Agregar crosshair de coordenadas en hover**

Agregar estado local en el constructor:

```js
    this.state = { clickPickerOpen: false, typePickerOpen: false, clickPickerRect: null, typePickerRect: null, visualHover: null };
```

(Localizar el `this.state = {...}` existente y agregarle `visualHover: null`.)

En el `.wn-visual-stage`, agregar `onMouseMove` y `onMouseLeave`, y un div crosshair con la lectura de coords:

```js
                <div class="wn-visual-stage"
                  onMouseMove=${e => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const wn = store.getState().webnavigator;
                    const vp = wn.visualShot?.viewport;
                    if (!vp) return;
                    const rx = Math.round((e.clientX - r.left) / r.width * vp.w);
                    const ry = Math.round((e.clientY - r.top) / r.height * vp.h);
                    this.setState({ visualHover: { rx, ry, px: e.clientX - r.left, py: e.clientY - r.top } });
                  }}
                  onMouseLeave=${() => this.setState({ visualHover: null })}
                  onClick=${e => {
                    const r = e.currentTarget.getBoundingClientRect();
                    this._visualClick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
                  }}>
                  <img class="wn-visual-img" src=${visualShot.dataUrl} alt="captura" />
                  ${this.state.visualHover ? html`<div class="wn-visual-cross" style=${{ left: this.state.visualHover.px + 'px', top: this.state.visualHover.py + 'px' }}>${this.state.visualHover.rx},${this.state.visualHover.ry}</div>` : null}
```

(Reemplaza la apertura del `.wn-visual-stage` del Task 6; el bloque de cajas y el cierre quedan igual debajo.)

- [ ] **Step 3: Estilos del crosshair**

Agregar a `general.css`:

```css
.wn-visual-cross { position: absolute; transform: translate(8px, 8px); font-size: 10px; padding: 1px 4px; background: rgba(0,0,0,.7); color: #fff; border-radius: 3px; pointer-events: none; white-space: nowrap; }
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check .../web-navigator.js`
Expected: exit 0.

- [ ] **Step 5: Build + reload + verificar scroll recaptura**

Build, `RELOAD`, seleccionar Google, entrar a Visual, scroll down y confirmar recaptura:
```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.toLowerCase().includes('google')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 4
node $CDP eval "(function(){ Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual').click(); return 'visual'; })()" --target "AI Hub"
sleep 3
node $CDP eval "store.getState().webnavigator.visualShot.at" --target "AI Hub"
node $CDP eval "(function(){ const b=Array.from(document.querySelectorAll('.wn-visual-bar button')).find(x=>x.textContent.trim()==='↓'); b.click(); return 'scrolled'; })()" --target "AI Hub"
sleep 2
node $CDP eval "store.getState().webnavigator.visualShot.at" --target "AI Hub"
```
Expected: el segundo `at` (timestamp) es mayor que el primero — la captura se actualizó tras el scroll.

- [ ] **Step 6: Verificar edge case — página no capturable**

Navegar la tab a `chrome://extensions` no es posible desde el WebNavigator; en su lugar verificar que un error de captura no rompe el panel. Forzar seleccionando una tab y llamando captura con un tabId inválido en el store:
```bash
node $CDP eval "(function(){ store.dispatch({type:'SET_NAVIGATOR',payload:{selectedTabId: 999999999}}); return 'set bad id'; })()" --target "AI Hub"
node $CDP eval "(function(){ const b=Array.from(document.querySelectorAll('.wn-visual-bar button')).find(x=>x.textContent.includes('Capturar')); b?.click(); return 'cap attempted'; })()" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const wn=store.getState().webnavigator; return { capturing: wn.visualCapturing, lastLog: wn.log?.[0]?.msg?.slice(0,40), panelAlive: !!document.querySelector('.wn-visual') }; })()" --target "AI Hub"
```
Expected: `visualCapturing` vuelve a `false` (no queda colgado), el panel sigue vivo (`panelAlive: true`), y el log no provoca crash. `_ensureTab` maneja el fallback a una tab válida.

- [ ] **Step 7: Screenshot final de confirmación del modo completo**

```bash
node $CDP eval "document.querySelector('.wn-icon-btn')?.click(); 'ok'" --target "AI Hub"
sleep 2
node $CDP eval "(function(){ const t=Array.from(document.querySelectorAll('.wn-tab-item')).find(i=>i.textContent.includes('ComfyUI')||i.textContent.includes('Unsaved Workflow')); t?.click(); return !!t; })()" --target "AI Hub"
sleep 5
node $CDP eval "(function(){ Array.from(document.querySelectorAll('.wn-modebar button')).find(b=>b.textContent.trim()==='Visual').click(); return 'visual'; })()" --target "AI Hub"
sleep 3
node $CDP screenshot /tmp/wn-visual-final.png --target "AI Hub"
```
Expected: leer `/tmp/wn-visual-final.png` — el tab Visual muestra la captura de ComfyUI con barra (Capturar / Cajas / ↑ / ↓), cajas guía sobre los elementos detectados, y la fila de escritura abajo.

---

## Self-Review (cubierto)

- **Spec coverage:** refresco bajo demanda (Task 2 + recaptura en Tasks 4/6/7) ✓; click cualquier píxel (Task 4) ✓; cajas guía + toggle (Task 5) ✓; escritura campo+enviar (Task 6) ✓; mapeo por razón/porcentajes (Tasks 4/5) ✓; reutilización `_trustedClickPoint` (Task 3) ✓; edge case no capturable (Task 7) ✓; scroll+recaptura (Task 7) ✓; crosshair feedback (Task 7) ✓.
- **Sin placeholders:** todos los steps tienen código/comandos concretos.
- **Consistencia de nombres:** `visualShot`, `visualCapturing`, `visualShowBoxes`, `_captureViewport`, `_visualClick`, `_visualType`, `_trustedClickPoint` usados consistentes en todas las tareas.
