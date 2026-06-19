# Aurora UI Components — Catálogo de componentes existentes

Documento de referencia para `ui/components/`.

Última revisión: 2026-06-12.

Este archivo sirve como mapa rápido para saber qué componentes, helpers, temas, layouts y estilos ya existen en Aurora v2 sin tener que revisar código cada vez.

---

## 1. Arquitectura de componentes

Aurora v2 usa:

- Preact.
- HTM desde `globalThis.html`.
- Hooks desde `globalThis.preactHooks`.
- Twind para clases utilitarias inline.
- CSS global para tokens, efectos, layout y módulos específicos.
- Sin JSX.
- Sin archivos CSS por componente nuevo, salvo casos globales o de módulo.

Ruta base:

```txt
ui/components/
```

Entry point principal:

```txt
ui/components/index.js
```

Registro global:

```txt
ui/components/globals.js
```

`globals.js` importa `ui/components/index.js` y asigna los componentes a `globalThis`. También expone `Toast`.

```js
import * as components from './index.js';
import { Toast } from './shared/toast.js';

Object.assign(globalThis, components);
globalThis.Toast = Toast;
```

---

## 2. Reglas de uso

### Importar componentes primitivos

```js
import { Button, Panel, Input, Toast } from '../../ui/components/index.js';
```

`Toast` no está en `index.js`, pero sí queda disponible en `globalThis.Toast` por `globals.js`.

### Importar componentes avanzados

Para componentes fuera del barrel principal, importar desde su archivo específico:

```js
import { CommandPalette } from '../../ui/components/nav/command-palette.js';
import { Footer } from '../../ui/components/footer/footer.js';
import { CanvasPanel } from '../../ui/components/local.views/canvas.js';
import { ScratchpadPageShell } from '../../ui/components/scratchpad/index.js';
```

### Importar helpers compartidos

```js
import { getJSON, postJSON } from '../../ui/components/shared/api.js';
import { renderMarkdown } from '../../ui/components/shared/markdown.js';
import { sendToGemita } from '../../ui/components/shared/gemita-ws.js';
import { copiarTexto } from '../../ui/components/shared/clipboard.js';
```

### Usar estilos

Preferencias:

1. Componentes reutilizables de `ui/components/`.
2. Twind inline para ajustes puntuales.
3. `fx.css` para efectos globales.
4. `tokens.css` para variables.
5. CSS global solo si el selector no puede expresarse con Twind o componentes.
6. No crear ni mantener CSS específico en `ui/modules/`; los módulos deben consumir componentes/Twind.

---

## 3. Barrel principal: `ui/components/index.js`

Exports disponibles desde `ui/components/index.js`:

```txt
Button
Toolbar
ToolbarSpacer
Dropdown
DropdownItem
Status
Panel
PanelHeader
PanelBody
PanelFooter
PanelLabel
PanelValue
List
ListItem
ListActions
Empty
Chip
ChipGroup
Input
Textarea
Select
ChatMessage
ChatList
IframeContainer
```

---

## 4. Componentes primitivos

### `Button.js`

Archivo:

```txt
ui/components/Button.js
```

Exporta:

```txt
Button
```

Props:

```txt
onClick
variant: undefined | 'primary' | 'danger'
size: undefined | 'sm'
active
disabled
title
children
```

Uso:

```js
import { Button } from '../../ui/components/index.js';

<Button onClick={guardar} variant="primary" size="sm">
  Guardar
</Button>;
```

Notas:

- `variant="primary"` usa acento.
- `variant="danger"` usa error.
- `active` aplica `fx-active`.
- `disabled` bloquea pointer events.
- `class` permite añadir Twind extra sin crear CSS de módulo.

---

### `Dropdown.js`

Archivo:

```txt
ui/components/Dropdown.js
```

Exports:

```txt
Dropdown
DropdownItem
```

Uso:

```js
import { Dropdown, DropdownItem } from '../../ui/components/index.js';

<Dropdown open={open}>
  <DropdownItem onClick={accion}>Opción</DropdownItem>
</Dropdown>;
```

Notas:

- El contenedor padre debe tener `relative`.
- Reemplaza dropdowns locales de módulos.

---

### `Status.js`

Archivo:

```txt
ui/components/Status.js
```

Exports:

```txt
Status
```

Props:

```txt
tone: 'ok' | 'warn' | 'err' | 'loading'
children
```

Uso:

```js
import { Status } from '../../ui/components/index.js';

<Status tone="loading">Procesando…</Status>;
```

Notas:

- Reemplaza status pills locales de módulos.
- Usa variables de Aurora y clases Twind.

---

### `Chip.js`

Archivo:

```txt
ui/components/Chip.js
```

Exports:

```txt
Chip
ChipGroup
```

Props:

```txt
active
variant: undefined | 'yt' | 'accent' | 'muted' | 'dim'
onClick
children
```

Uso:

```js
import { Chip, ChipGroup } from '../../ui/components/index.js';

<ChipGroup>
  <Chip active>Activo</Chip>
  <Chip onClick={() => setFiltro('todo')}>Todo</Chip>
</ChipGroup>;
```

---

### `Input.js`

Archivo:

```txt
ui/components/Input.js
```

Exports:

```txt
Input
Textarea
Select
```

Props de `Input`:

```txt
value
onInput
onChange
onKeyDown
placeholder
type = 'text'
disabled
title
class
```

Props de `Textarea`:

```txt
value
onInput
onChange
onKeyDown
placeholder
rows
disabled
class
```

Props de `Select`:

```txt
value
onChange
disabled
title
class
children
```

Uso:

```js
import { Input, Textarea, Select } from '../../ui/components/index.js';

<Input value={query} onInput={setQuery} placeholder="Buscar..." />;
<Textarea value={texto} onInput={setTexto} rows={6} />;
<Select value={modelo} onChange={setModelo}>
  <option value="local">Local</option>
</Select>;
```

---

### `ChatMessage.js`

Archivo:

```txt
ui/components/ChatMessage.js
```

Exports:

```txt
ChatMessage
ChatList
```

Props:

```txt
ChatMessage.role: 'user' | 'assistant'
ChatMessage.time
ChatMessage.streaming
ChatMessage.loading
ChatMessage.children
ChatList.children
ChatList.class
```

Uso:

```js
import { ChatMessage, ChatList } from '../../ui/components/index.js';

<ChatList>
  <ChatMessage role="user" time="12:00">Hola Aurora</ChatMessage>
  <ChatMessage role="assistant" streaming>
    Pensando...
  </ChatMessage>
</ChatList>;
```

---

### `IframeContainer.js`

Archivo:

```txt
ui/components/IframeContainer.js
```

Exporta:

```txt
IframeContainer
```

Props:

```txt
iframeRef
src = 'about:blank'
allow = 'clipboard-read; clipboard-write; microphone'
children
```

Uso:

```js
import { IframeContainer } from '../../ui/components/index.js';

<IframeContainer src="http://localhost:7779/ui?tab=local">
  <div class="absolute top-2 left-2">Overlay</div>
</IframeContainer>;
```

---

## 5. Shared helpers

### `shared/api.js`

Archivo:

```txt
ui/components/shared/api.js
```

Exports:

```txt
BASE
hdrs()
getJSON(path)
sendJSON(method, path, body)
postJSON(path, body)
putJSON(path, body)
patchJSON(path, body)
deleteJSON(path)
```

Base:

```txt
globalThis.__AURORA_BASE__ || 'http://localhost:7779'
```

Headers:

```txt
globalThis.__AURORA_HDRS__?.() || { 'Content-Type': 'application/json' }
```

Uso:

```js
import { getJSON, postJSON } from '../../ui/components/shared/api.js';

const stats = await getJSON('/db/stats');
await postJSON('/db/eventos', { tipo: 'info', mensaje: 'Hola' });
```

---

### `shared/markdown.js`

Archivo:

```txt
ui/components/shared/markdown.js
```

Exporta:

```txt
renderMarkdown(text)
```

Soporta de forma liviana:

- Headings `#` a `######`.
- Código fenced.
- Blockquotes.
- Listas ordenadas y desordenadas.
- Negrita.
- Cursiva.
- Código inline.
- Links `http(s)`.
- Saltos de línea.

Uso:

```js
import { renderMarkdown } from '../../ui/components/shared/markdown.js';

<div innerHTML={renderMarkdown(texto)} />;
```

Nota:

Para un lector Markdown completo tipo Obsidian, conviene crear un parser más fuerte en `components/shared/markdown.js` o en un módulo dedicado `md-reader`.

---

### `shared/gemita-ws.js`

Archivo:

```txt
ui/components/shared/gemita-ws.js
```

Exports:

```txt
onSessionInfo(cb)
connectGemita()
disconnectGemita()
cancelarMensaje()
getConnectionState()
sendToGemita({ ... })
confirmTool(approved)
resetGemitaSession()
fetchModels()
```

`sendToGemita` callbacks:

```txt
onToken
onThinking
onToolCall
onToolResult
onHubAction
onConfirmRequest
```

Uso:

```js
import { sendToGemita } from '../../ui/components/shared/gemita-ws.js';

await sendToGemita({
  message: 'Resume esto',
  model: 'local',
  onToken: (token) => append(token),
  onToolCall: (name, args, risk) => showToolCall(name, args, risk),
  onConfirmRequest: (name, command, risk, confirm) => askConfirm(name, command, risk, confirm),
});
```

---

### `shared/toast.js`

Archivo:

```txt
ui/components/shared/toast.js
```

Exporta:

```txt
Toast
```

Métodos:

```txt
Toast.show(msg, tipo = 'info', ms = 2000)
Toast.setStatus(msg, ms = 2000)
```

Tipos:

```txt
info
error
warning
success
```

Uso:

```js
import { Toast } from '../../ui/components/shared/toast.js';

Toast.show('Guardado', 'success');
```

También disponible como:

```js
globalThis.Toast.show('Guardado', 'success');
```

---

### `shared/clipboard.js`

Archivo:

```txt
ui/components/shared/clipboard.js
```

Exports:

```txt
copiarTexto(texto)
leerTexto()
```

Comportamiento:

- Si está dentro de extensión, usa `globalThis.__aurora_bgRequest`.
- Si no, usa `navigator.clipboard`.
- Fallback a `document.execCommand('copy')`.

Uso:

```js
import { copiarTexto, leerTexto } from '../../ui/components/shared/clipboard.js';

await copiarTexto(markdown);
const texto = await leerTexto();
```

---

### `shared/flash.js`

Archivo:

```txt
ui/components/shared/flash.js
```

Exports:

```txt
mostrarTemporal(setter, value, options)
cancelarTemporal(setter)
```

Opciones:

```txt
delay = 1500
clearValue = ''
```

Uso:

```js
import { mostrarTemporal } from '../../ui/components/shared/flash.js';

mostrarTemporal(setStatus, 'guardando...', { clearValue: '' });
```

---

### `shared/autosave.js`

Archivo:

```txt
ui/components/shared/autosave.js
```

Exporta:

```txt
crearAutosave(options)
```

Opciones:

```txt
delay = 1500
clearMessageDelay = 1200
save(value, context)
canSave(context)
onDirty(isDirty)
onSaved(value, context)
onMessage(message)
onError(error, value, context)
```

Retorna:

```txt
schedule(value, context)
cancel()
```

Uso:

```js
import { crearAutosave } from '../../ui/components/shared/autosave.js';

const autosave = crearAutosave({
  save: async (value) => await fetch('/db/ajustes', { method: 'POST', body: value }),
  onDirty: setDirty,
  onSaved: () => Toast.show('guardado'),
  onError: () => Toast.show('error guardando', 'error'),
});

autosave.schedule(doc, { fileId });
```

---

### `shared/ext-bridge.js`

Archivo:

```txt
ui/components/shared/ext-bridge.js
```

Exports:

```txt
bgRequest(payload)
initExtBridge()
```

Mensajes:

```txt
AURORA_BG_REQUEST
AURORA_BG_RESPONSE
AURORA_EXT_HELLO
AURORA_EXT_ACK
```

Uso:

```js
import { initExtBridge, bgRequest } from '../../ui/components/shared/ext-bridge.js';

initExtBridge();

const res = await bgRequest({ type: 'CAPTURE_ACTIVE_TAB' });
```

---

## 6. Navegación

### `nav/nav-tabs.js`

Archivo:

```txt
ui/components/nav/nav-tabs.js
```

Exporta:

```txt
TABS
```

Tabs existentes:

```txt
inicio
local
llmcloud
prompts
wiki
scratchpad
editor
stats
captura
toolkit
chain
detective
webnavigator
stylecatalog
ajustes
```

Cada tab tiene:

```txt
id
label
svg
```

Nota:

`CommandPalette` actualmente usa `c.icon`, pero `TABS` exporta `svg`. Conviene corregir esa inconsistencia si se quiere mostrar iconos en la palette.

---

### `nav/command-palette.js`

Archivo:

```txt
ui/components/nav/command-palette.js
```

Exporta:

```txt
CommandPalette
```

Funciones:

- Abre con `Ctrl+K` o `Meta+K`.
- Cierra con `Escape`.
- Navega con flechas.
- Ejecuta con `Enter`.
- Soporta `Alt+1..9` para cambiar tab.
- Usa `TABS` para comandos de navegación.

Uso:

```js
import { CommandPalette } from '../../ui/components/nav/command-palette.js';

<CommandPalette />;
```

---

### `nav/user-switcher.js`

Archivo:

```txt
ui/components/nav/user-switcher.js
```

Exporta:

```txt
UserSwitcher
```

Funciones:

- Lista usuarios desde `/db/usuarios/list`.
- Usuario actual desde `/db/usuarios/me`.
- Login con `/db/usuarios/login`.
- Crear usuario con `/db/usuarios/crear`.
- Guarda token en `localStorage` bajo `aurora_token`.
- Recarga la app al cambiar usuario.

Props:

```txt
onClose
```

Uso:

```js
<UserSwitcher onClose={() => setUsuarioAbierto(false)} />;
```

---

### `nav/notif-center.js`

Archivo:

```txt
ui/components/nav/notif-center.js
```

Exporta:

```txt
NotifCenter
```

Pestañas:

```txt
eventos
cloud
backup
```

Fuentes:

```txt
GET /db/eventos?limit=50
GET /db/llm/cloud/conversaciones
GET /db/backup/resumen
DELETE /db/eventos
DELETE /db/llm/cloud/conversaciones/:id
GET /db/backup
```

Funciones:

- Mostrar eventos.
- Limpiar eventos.
- Mostrar conversaciones cloud.
- Borrar conversación cloud.
- Descargar backup completo.

Props:

```txt
onClose
```

Uso:

```js
<NotifCenter onClose={() => setNotifAbierto(false)} />;
```

---

### `nav/sesion-ui.js`

Archivo:

```txt
ui/components/nav/sesion-ui.js
```

Exports:

```txt
restaurarTab()
iniciarPersistenciaUI()
```

Guarda en:

```txt
/db/ajustes/ui_last_tab
```

También registra evento:

```txt
POST /db/eventos
```

Uso:

```js
import { restaurarTab, iniciarPersistenciaUI } from '../../ui/components/nav/sesion-ui.js';

const tab = await restaurarTab();
iniciarPersistenciaUI();
```

---

## 7. Footer

### `footer/footer.js`

Archivo:

```txt
ui/components/footer/footer.js
```

Exporta:

```txt
Footer
```

Lee:

```txt
footActions.value
```

Renderiza grupos:

```txt
global
module
view
```

Uso:

```js
import { Footer } from '../../ui/components/footer/footer.js';

<Footer />;
```

---

### `footer/registry.js`

Archivo:

```txt
ui/components/footer/registry.js
```

Exports:

```txt
userSwitcherAbierto
notifAbierto
footActions
setViewActions(arr)
clearViewActions()
setGlobalActions(arr)
```

Acciones globales actuales:

```txt
usuario
notif
theme-mode
quick-screenshot
quick-capture
reload
```

Acciones de módulo actuales:

```txt
aihub-add-llm
aihub-json-detective
aihub-load-clipboard
aihub-inject-protocol
```

Captura rápida:

```txt
quick-screenshot
quick-capture
```

Nota:

La captura rápida requiere extensión activa y `globalThis.__aurora_bgRequest`.

---

### `footer/acciones-modulo.js`

Archivo:

```txt
ui/components/footer/acciones-modulo.js
```

Exports:

```txt
ACCIONES_MODULO
ACCIONES_CAPTURA_RAPIDA
```

Acciones de módulo:

```txt
Añadir LLM
JSON Detective
Cargar portapapeles a Notas
Enseñar protocolo @@ al LLM
```

Captura rápida:

```txt
Screenshot rápido
Capturar página
```

---

## 8. Scratchpad components

Archivo principal:

```txt
ui/components/scratchpad/index.js
```

Estilos:

```txt
ui/components/scratchpad/scratchpad.css
```

### `SCRATCHPAD_COMMANDS`

Tipos de bloque disponibles:

```txt
paragraph
heading_1
heading_2
heading_3
bullet
todo
quote
code
callout
toggle
image
bookmark
divider
mini_table
mini_kanban
```

### `ScratchpadPageShell`

Shell principal de una página Scratchpad.

Props principales:

```txt
page
pages
activePageId
blocks
navCollapsed
noteQuery
createPanelOpen
stats
statusLabel
statusTone
nexusOk
onToggleNav
onNoteQuery
onToggleCreatePanel
onAddBlock
onCreatePage
onSelectPage
onDuplicatePage
onDeletePage
onTitleInput
onDescriptionInput
onSave
onPaste
onCopy
onClear
children
```

### `ScratchpadWorkspaceNav`

Sidebar de notas, outline y vistas.

Props principales:

```txt
page
pages
activePageId
blocks
collapsed
query
onToggle
onQuery
onAddBlock
onCreatePage
onSelectPage
onDuplicatePage
onDeletePage
```

Funciones:

- Buscar notas.
- Crear nota.
- Seleccionar nota.
- Duplicar nota.
- Borrar nota.
- Mostrar outline.
- Mostrar vistas table/board.

### `ScratchpadTopBar`

Barra superior de página.

Muestra:

- Cantidad de bloques.
- Palabras.
- Tokens aproximados.
- Estado de sync.
- Botones Insert, Save, Paste, Copy, Clear.

### `ScratchpadCreatePanel`

Panel de inserción de bloques.

Agrupaciones:

```txt
Basic
Rich
Views
```

### `ScratchpadBlockEditor`

Editor principal de bloques.

Props:

```txt
blocks
onAddBlock
onPasteImage
```

### `ScratchpadBlockRow`

Fila editable de bloque.

Soporta:

- Cambiar texto.
- Toggle todo.
- Toggle open.
- Patch block.
- Slash menu.
- Mover.
- Duplicar.
- Borrar.
- Transformar.
- Tabla.
- Kanban.

### `ScratchpadBulletListBlock`

Lista simple editable.

### `ScratchpadTodoListBlock`

Lista de tareas con checkbox.

### `ScratchpadBlockToolbar`

Toolbar por bloque.

Acciones:

```txt
Agregar bloque debajo
Mover arriba
Mover abajo
Duplicar
Cambiar tipo
Borrar
```

### `ScratchpadSlashMenu`

Menú slash para transformar/agregar bloques.

Props:

```txt
query
commands
onPick
```

### `ScratchpadToggleBlock`

Bloque colapsable con título y cuerpo oculto.

### `ScratchpadCalloutBlock`

Bloque de aviso/información.

### `ScratchpadCodeBlock`

Bloque de código editable.

### `ScratchpadImageBlock`

Bloque de imagen.

Soporta:

- URL.
- Data URL.
- Upload.
- Drop.
- Paste.
- Caption.
- Alt text.

### `ScratchpadBookmarkBlock`

Bloque de marcador/link.

Campos:

```txt
title
url
description
```

### `ScratchpadCollectionTable`

Mini tabla editable.

### `ScratchpadCollectionBoard`

Mini kanban editable.

### `ScratchpadEmptyState`

Estado vacío con botón para crear bloque.

---

## 9. Local views

### `local.views/canvas.js`

Archivo:

```txt
ui/components/local.views/canvas.js
```

Estilos:

```txt
ui/components/local/local.canvas.css
```

Exporta:

```txt
CanvasPanel
```

Funciones:

- Editor de código.
- Detección de lenguaje.
- Preview HTML en iframe.
- Abrir preview en ventana.
- Copiar código.
- Enviar código al AI.

Props:

```txt
code
lang
tab
onTabChange
onCodeChange
onClose
onSendToAI
```

Tabs:

```txt
codigo
vista
```

Uso:

```js
import { CanvasPanel } from '../../ui/components/local.views/canvas.js';

<CanvasPanel
  code={codigo}
  tab={tab}
  onTabChange={setTab}
  onCodeChange={setCodigo}
  onClose={() => setCanvasOpen(false)}
  onSendToAI={enviarAlAI}
/>;
```

---

## 10. Temas, backgrounds y HUDs

### `themes/index.js`

Archivo:

```txt
ui/components/themes/index.js
```

Exports:

```txt
THEMES
BACKGROUNDS
HUDS
```

### Temas

Categoría Cósmico:

```txt
redneon
cyan
ocean
aurora
nebula
```

Categoría Cyberpunk:

```txt
amber
lime
magenta
matrix
gold
```

Categoría Gótico:

```txt
rose
violet
blood
shadow
crypt
```

Categoría Abismal:

```txt
abyssal
biolum
deep
```

Categoría Infernal:

```txt
lava
ember
sulfur
```

Categoría Sakura:

```txt
sakura
hanami
matcha
```

Categoría Ártico:

```txt
glaciar
frost
tundra
```

### Backgrounds

Lista completa:

```txt
starfield
void
clouds
nebula
aurora
particles
matrix
grid
rain
glitch
fireflies
castle
blood
ash
fog
ravens
abyss
depths
hellfire
lava
sakura
autumn
moonlit
blizzard
tundra
none
```

### HUDs

Lista completa:

```txt
luna
pulse-rings
scanlines
circuit
corners
candles
runes
drip
sonar
ember
torii
compass
none
```

---

### `themes/manager.js`

Archivo:

```txt
ui/components/themes/manager.js
```

Exporta:

```txt
aplicarTema(temaInput)
```

Funciones:

- Aplica tema por id o por objeto.
- Setea `data-tema`.
- Setea `data-theme-mode`.
- Genera variables CSS en `#aurora-tema-vars`.
- Soporta tema animado.
- Cambia variables según modo claro/oscuro.

Uso:

```js
import { aplicarTema } from '../../ui/components/themes/manager.js';

aplicarTema('aurora');
```

---

### `themes/lib.js`

Archivo:

```txt
ui/components/themes/lib.js
```

Exports:

```txt
readThemeColors()
createAccentWatcher(defaultHex)
```

Usado por backgrounds para leer:

```txt
--aurora-accent
--aurora-edge
--aurora-edge-dim
--aurora-edge-glow
```

---

### `themes/tema-hora.js`

Archivo:

```txt
ui/components/themes/tema-hora.js
```

Exports:

```txt
temaPorHora(hora)
iniciarTemaAuto()
detenerTemaAuto()
```

Franjas:

```txt
06-09  amber
09-12  cyan
12-17  ocean
17-20  lava
20-23  violet
23-24  shadow
00-06  deep
```

Lee:

```txt
/db/ajustes/tema_auto
```

---

### `themes/backgrounds/index.js`

Archivo:

```txt
ui/components/themes/backgrounds/index.js
```

Exporta:

```txt
BACKGROUND_COMPONENTS
```

Mapa directo actual:

```txt
void
grid
matrix
aurora
fireflies
particles
starfield
nebula
```

---

### `themes/backgrounds/loaders.js`

Archivo:

```txt
ui/components/themes/backgrounds/loaders.js
```

Exporta:

```txt
BACKGROUND_LOADERS
```

Carga lazy por modo:

```txt
light
dark
```

Incluye todos los backgrounds listados en `themes/index.js`.

---

### `themes/hud/index.js`

Archivo:

```txt
ui/components/themes/hud/index.js
```

Exporta:

```txt
HUD_COMPONENTS
```

Mapa directo actual:

```txt
luna
scanlines
corners
pulse-rings
circuit
```

---

### `themes/hud/loaders.js`

Archivo:

```txt
ui/components/themes/hud/loaders.js
```

Exporta:

```txt
HUD_LOADERS
```

Carga lazy por modo.

Incluye todos los HUDs listados en `themes/index.js`.

---

## 11. CSS global

### Entry point

Archivo:

```txt
ui/components/ui.css
```

Importa:

```txt
tokens.css
globals/keyframes.css
globals/reset.css
globals/scrollbars.css
globals/shell-layout.css
fx.css
markdown.css
globals/utilities-lite.css
local/local.css
scratchpad/scratchpad.css
modules/inicio/inicio.css
modules/prompts/prompts.css
modules/captura/captura.css
modules/prompts/prompts-ui.css
globals/theme-mode.css
```

---

### `tokens.css`

Variables principales:

```txt
--aurora-bg
--aurora-surface
--aurora-surface-1
--aurora-surface-2
--aurora-surface3
--aurora-surface-hover
--aurora-field
--aurora-text
--aurora-text-muted
--aurora-text-dim
--aurora-glass
--aurora-glass-highlight
--aurora-glass-shadow
--aurora-warning
--aurora-error
--aurora-success
--aurora-radius-xs
--aurora-radius-sm
--aurora-radius
--aurora-radius-md
--aurora-radius-lg
--aurora-font-sans
--aurora-font-mono
--aurora-border
--aurora-border-quiet
--aurora-border-strong
--aurora-shadow-sm
--aurora-shadow-md
--aurora-focus-ring
--aurora-accent
--aurora-surface2
--aurora-edge
--aurora-edge-dim
--aurora-edge-glow
--aurora-text-bright
--aurora-accent-dim
--aurora-accent-glow
--aurora-glow
```

Aliases legacy:

```txt
--accent
--surface
--surface2
--surface3
--text
--text-dim
--text-muted
--text-bright
--error
--font-sans
--font-mono
--border
--radius
```

---

### `globals/reset.css`

Reset base:

- `box-sizing`.
- Body full viewport.
- `#root` full viewport.
- Botones base.
- Inputs base.
- Focus styles.

---

### `globals/shell-layout.css`

Layout reusable:

```txt
.aurora-view-scope
.aurora-host
iframe support
```

Uso:

```html
<section class="aurora-view-scope">
  ...
</section>
```

---

### `globals/utilities-lite.css`

Fallback de utilidades tipo Tailwind/Twind.

Incluye clases básicas:

```txt
flex
grid
block
hidden
fixed
absolute
relative
items-center
justify-between
gap-*
p-*
px-*
py-*
rounded*
border*
bg-*
text-*
overflow-*
pointer-events-none
```

---

### `fx.css`

Efectos globales:

```txt
.fx-hover
.fx-active
.fx-danger
.fx-focus
.fx-item
.fx-panel
.fx-msg-user
.fx-msg-assistant
.fx-msg-streaming
.fx-scroll
.fx-title-glow
.fx-edge-glow
.fx-status
.fx-toast-success
.fx-toast-error
.fx-toast-warning
.fx-tool-activity
.fx-tool-chip
```

---

### `markdown.css`

Estilos para Markdown y bloques de código:

```txt
.message-content
.code-block
.code-hdr
.code-lang
.code-btn
.hl-kw
.hl-str
.hl-num
.hl-cm
.hl-key
```

---

### `globals/keyframes.css`

Animaciones:

```txt
pulse
glow
blink
fadeIn
slideIn
scaleIn
shimmer
float
scanline
sidebar-in
title-glow
icon-flash
icon-scan
icon-swing
icon-spin
icon-explode
icon-wobble
icon-flip
icon-bounce
icon-fly
icon-expand
grid-scan
scanlines-flicker
corners-pulse
pulse-ring-expand
aurora-pulse
compass-spin
circuit-flow
circuit-flow-h
luna-pulse
nebula-drift
nebula-twinkle
```

---

### `globals/scrollbars.css`

Scrollbar global.

---

### `globals/theme-mode.css`

Ajustes para modo claro.

Afecta:

```txt
bg-black/20
bg-black/30
bg-white/*
border-white/*
text-white/*
hover:text-white/*
hover:bg-white/*
aurora-bg-layer
aurora-hud-layer
```

---

## 12. CSS de Local

Entry point:

```txt
ui/components/local/local.css
```

Importa:

```txt
local.messages.css
local.tools.css
local.composer-cloud.css
local.panels.css
local.responsive.css
local.canvas.css
```

### `local.messages.css`

Cubre:

- Thinking.
- Protocol messages `@@`.
- Estados Nexus: ok, error, pending.
- Chat container.
- Empty chat.
- Mensajes.
- Controles.
- Tool activity.

### `local.tools.css`

Cubre:

- Tool calls.
- Tool results.
- Activity bar.
- Nexus confirm banner.

### `local.composer-cloud.css`

Cubre:

- Composer unificado.
- Textarea.
- Botones de enviar.
- Menú plus.
- Estados de input.

### `local.panels.css`

Cubre:

- Panel parámetros.
- Historial.
- Toolbar herramientas.

### `local.responsive.css`

Container queries para paneles pequeños:

```txt
< 340px
< 240px
< 160px
```

### `local.canvas.css`

Cubre:

- Canvas editor.
- Syntax highlighter overlay.
- Textarea sincronizada.
- Tabs.
- Preview.

---

## 13. CSS de Scratchpad

Archivo:

```txt
ui/components/scratchpad/scratchpad.css
```

Cubre:

- Layout principal.
- Sidebar.
- Nav colapsable.
- Notas.
- Buscador.
- Documento.
- Create panel.
- Bloques.
- Toolbar.
- Slash menu.
- Toggle.
- Callout.
- Code.
- Image.
- Bookmark.
- Table.
- Board.
- Empty state.

---

## 14. MD Reader module

Archivo principal:

```txt
ui/modules/md-reader/view/md-reader.js
```

Scripts:

```txt
ui/modules/md-reader/scripts/fs.js
ui/modules/md-reader/scripts/parser.js
```

Estilos:

```txt
ui/modules/md-reader/md-reader.css
```

Registro:

```txt
ui/app.js
ui/components/nav/nav-tabs.js
ui/components/ui.css
```

Vista:

```txt
/ui?tab=md-reader
```

Cubre:

- Nueva tab `MD Read`.
- Escaneo de `**/*.md` bajo `nexus/workspaces/aihub`.
- Lectura mediante `/nexus/fs/read`.
- Escritura y guardado mediante `/nexus/fs/write`.
- Creación de notas faltantes.
- Render Markdown con headings, código, listas, tareas, tablas, blockquotes, tags, wikilinks y links Markdown.
- Outline por documento.
- Mapa del documento actual.
- Grafo global del workspace.
- Filtros por tipo de nodo.
- Búsqueda global de nodos.
- Lista de tareas detectadas.
- Resumen con `/gemita`.
- Acciones de footer: recargar índice, nueva nota, guardar, editar, resumir y abrir grafo.

Parser:

```txt
ui/modules/md-reader/scripts/parser.js
```

Funciones principales:

```txt
indexHeadings
parseMarkdownFile
buildWorkspaceGraph
renderMarkdown
layoutGraph
renderGraphHtml
renderGraphDetails
statsForGraph
resolveMarkdownHref
makeFileIndex
```

Notas:

- El parser es dedicado para Aurora y está adaptado desde la lógica del VS Code `md-reader`.
- `shared/markdown.js` sigue siendo útil para bloques simples, pero `MD Reader` no debería depender de él para grafo/wikilinks.
- La fuente de verdad sigue siendo FS: el índice se reconstruye desde archivos reales.

---

## 15. Uso recomendado para nuevos componentes

### Componente simple

```js
const { html } = globalThis;

export function MiComponente({ value, onChange }) {
  return html`
    <div class="flex items-center gap-2">
      <span class="text-sm text-aurora-text-muted">Valor</span>
      <Input value=${value} onInput=${onChange} />
    </div>
  `;
}
```

### Componente con estado

```js
const { html } = globalThis;
const { useState } = globalThis.preactHooks;

export function Contador() {
  const [count, setCount] = useState(0);

  return html`
    <Panel>
      <PanelHeader>Contador</PanelHeader>
      <PanelBody>
        <div class="text-2xl">${count}</div>
        <Button onClick={() => setCount(count + 1)}>Sumar</Button>
      </PanelBody>
    </Panel>
  `;
}
```

### Componente con API

```js
const { html } = globalThis;
const { useState, useEffect } = globalThis.preactHooks;
import { getJSON } from '../../ui/components/shared/api.js';

export function StatsCard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getJSON('/db/stats').then(setStats).catch(() => setStats(null));
  }, []);

  return html`
    <Panel stat>
      <PanelLabel>Total</PanelLabel>
      <PanelValue>${stats?.chats || 0}</PanelValue>
    </Panel>
  `;
}
```

### Componente con Gemita

```js
const { html } = globalThis;
const { useState } = globalThis.preactHooks;
import { sendToGemita } from '../../ui/components/shared/gemita-ws.js';

export function ResumenButton({ texto }) {
  const [resumen, setResumen] = useState('');

  const resumir = async () => {
    let out = '';
    await sendToGemita({
      message: 'Resume este texto en 5 bullets:',
      system: 'Sé breve y práctico.',
      history: [{ role: 'user', content: texto }],
      onToken: (token) => {
        out += token;
        setResumen(out);
      },
    });
  };

  return html`
    <div>
      <Button onClick=${resumir}>Resumir</Button>
      <p>${resumen}</p>
    </div>
  `;
}
```

---

## 16. Checklist antes de crear un componente nuevo

Antes de crear uno nuevo, revisar si ya existe:

1. ¿Es un botón? Usar `Button`.
2. ¿Es un input? Usar `Input`, `Textarea` o `Select`.
3. ¿Es un panel? Usar `Panel`.
4. ¿Es una lista? Usar `List`.
5. ¿Es una etiqueta? Usar `Chip`.
6. ¿Es un estado vacío? Usar `Empty`.
7. ¿Es un mensaje de chat? Usar `ChatMessage`.
8. ¿Es un iframe? Usar `IframeContainer`.
9. ¿Es una acción global? Revisar `footer/registry.js`.
10. ¿Es navegación? Revisar `nav/*`.
11. ¿Es tema/background/HUD? Revisar `themes/*`.
12. ¿Es un bloque de notas? Revisar `scratchpad/index.js`.

---

## 17. Detalles técnicos conocidos

### CommandPalette / TABS

`nav-tabs.js` exporta tabs con propiedad:

```txt
svg
```

`command-palette.js` actualmente lee:

```txt
icon
```

Conviene corregir para que la palette muestre iconos.

---

### Footer module actions

`footer/acciones-modulo.js` importa scripts de módulo:

```txt
../../modules/scratchpad/scripts/notas.js
```

Esto acopla componente global con módulo Scratchpad. Funciona, pero conviene evaluar si esas acciones deberían vivir en un shared o registro de acciones.

---

### Quick capture

Requiere:

```txt
globalThis.__aurora_enExtension?.value
globalThis.__aurora_bgRequest
```

Sin extensión activa, muestra warning.

---

### Toast tipo loading

`Toast.show()` soporta:

```txt
info
error
warning
success
```

Algunas llamadas usan:

```txt
loading
```

Ese tipo cae a `info`.

---

### Markdown render liviano

`shared/markdown.js` es útil para mensajes y bloques simples, pero no reemplaza un parser Markdown completo para:

- Wikilinks.
- Backlinks.
- Frontmatter.
- Mermaid.
- Matemáticas.
- Links relativos.
- Imágenes locales.
- Footnotes.

Para `Aurora MD Reader`, ya existe parser dedicado en `ui/modules/md-reader/scripts/parser.js`.

---

## 18. Resumen rápido

Categorías existentes:

```txt
Primitivas
Shared helpers
Navegación
Footer
Scratchpad
Local Canvas
Temas
Backgrounds
HUDs
CSS global
CSS Local
CSS Scratchpad
MD Reader
```

Uso principal:

```txt
ui/components/index.js para primitivas
ui/components/shared/* para helpers
ui/modules/md-reader/* para Markdown, grafo y lectura
ui/components/nav/* para navegación global
ui/components/footer/* para acciones globales
ui/components/scratchpad/* para notas/bloques
ui/components/local.views/* para piezas de Local
ui/components/themes/* para temas visuales
ui/components/ui.css como entry point de estilos
```
