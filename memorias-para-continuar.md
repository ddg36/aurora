# Memorias para continuar — checkpoint 2026-07-22

Handoff completo de una sesión larga de trabajo en Aurora. Este archivo existe
para poder retomar el trabajo desde otra máquina (o con otra instancia de
Claude Code) sin perder contexto. Está escrito en orden cronológico
aproximado, agrupado por tema.

## Qué es Aurora (recordatorio rápido)

Aurora **no es una plataforma basada en API de LLMs** — es un proyecto
personal que coordina chats web reales de IA (ChatGPT, Gemini, Claude, Grok,
Perplexity, Qwen, Kimi, Poe) vía iframes/tabs reales, content scripts de una
extensión Chrome MV3, y un backend Python (Litestar) en `:7779`. La UI
(`ui/`) es Preact/HTM/Twind sin build step. El motor agéntico local es `pi`
(`@earendil-works/pi-coding-agent`) vía RPC.

## 1. Reconexión inicial de contexto

La sesión arrancó con un briefing largo del usuario (Deml) sobre el estado
del proyecto, listando varios worktrees activos (Memory Foundry, Provider
Health Sensor, Qwen/Lyria Cloud, Lyria Avatar Presence, SOL worktrees,
ember-thought) y pidiendo **solo inspección de código real**, sin implementar
nada todavía ("Misión de Reconexión 01" — auditoría read-only vía git/CDP).

## 2. Debugging de browser/CDP y migración fuera de Flatpak

- Se investigó un bug sospechado de duplicación de mensajes tras ejecución de
  tools (JSON Family) en el relay de Gemini.
- Se detectó que **Helium** (el browser usado, vía Flatpak) tenía problemas de
  sandboxing bubblewrap: un `llama-server` corriendo en el host era invisible
  desde dentro del sandbox (PID namespace aislado, `/run/host` sin `/proc`).
  Esto llevó a migrar **VSCode y Steam fuera de Flatpak** (instalación nativa
  `.deb`), y a extraer Helium como AppImage nativo con:
  `~/.local/bin/helium` → symlink a `~/.local/lib/helium/AppRun`, lanzado con
  `--no-sandbox --remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1:9222`
  (flags puestos en los `.desktop` launchers, tanto
  `~/.local/share/applications/helium.desktop` como el panel de XFCE).
- Bug de `XDG_CONFIG_HOME` heredado del sandbox de Claude Code creaba un
  perfil fantasma — se resolvió lanzando con `env -u XDG_CONFIG_HOME`.
- Herramientas de debug en vivo: `scripts/SOL-debug-tools/cdp.py` (`list`,
  `eval --target-id <id> --expr <js>`, con `--timeout` configurable — el
  default de 10s se queda corto para operaciones async largas como
  `attachFiles`, usar `--timeout 30`/`40`).

## 3. llama.cpp local

Se configuró `llama.cpp` (`~/Documents/LLAMA-CPP/build/bin/llama-server`)
para trabajar con el agente `pi`. Launcher final en `~/.local/bin/llama-router`:
router mode con `--models-dir ~/models`, `-ngl 999 -c 131072 -b 4096 -ub 2048`,
sampling `--temp 1.2 --top-p 0.95 --top-k 64 --min-p 0.0 --repeat-penalty 1.0`.
Confirmado en vivo: `-b 6144 -ub 4096` hace OOM en la GPU de 4GB (940MX);
`-b 4096 -ub 2048` funciona y duplica la velocidad de prompt-processing.

**Feedback importante del usuario**: cuando pide "investigar" algo que
implica tocar un sistema vivo (matar/reiniciar un proceso corriendo), eso NO
autoriza ejecutarlo sin preguntar primero — solo pide análisis/cálculo. Pasó
dos veces en esta sesión (una interrumpiendo una generación activa, otra
reiniciando el servidor para "probar" batch sizes) y el usuario corrigió
explícitamente ambas veces.

## 4. Multi-window "command center" (spawn_ai_grid)

Se construyó una grilla de ventanas reales (`chrome.windows.create` +
`chrome.system.display`) para los 8 proveedores fijos de Aurora
(`FIXED_AI_URLS` en `extensions/aihub/background.js`): ChatGPT, Gemini,
Claude, Qwen, Grok, Perplexity, Kimi, Poe. Layout 2D real basado en aspect
ratio de pantalla (`cols = round(sqrt(n*aspect))`, `rows = ceil(n/cols)`),
restauración de sesión reutilizando `llm-sesiones.js`/`session-sniffer.js`
existentes (slot='sniffer'). Comandos nuevos en `background.js`:
`spawn_ai_grid` / `close_ai_grid` (guardan `windowId`s en
`chrome.storage.local`).

## 5. Relays de proveedores — el grueso del trabajo de esta sesión

Instrucción explícita del usuario: *"el relay de cada uno debe estar al
nivel de chatgpt relay, con muchos capturadores, eso es para que todo
funcione bien."* Es decir: turnIds reales, `anchorAfterUser`, detección de
lenguaje de código, `attachFiles`, botón de stop — todo **verificado en vivo
contra el DOM real**, nunca adivinado.

### Contrato del sistema de relay

- `extensions/aihub/content-scripts/relay/relay-contract.js`: valida que cada
  adapter tenga `id`, `version`, `matches`, `capabilities`, y las funciones
  `REQUIRED_OBSERVE`/`REQUIRED_ACT`. Si `capabilities.images||files` es true,
  exige `act.attachFiles`.
- `relay-core.js`: `sincronizarHilo` (dedup por `rol+texto` exacto, no por
  ID — por eso un `getTurnId` roto causa duplicados reales),
  `MutationObserver` + debounce 2200ms.
- `relay-utils.js`: `dispatchEnter`, `pasteFiles`, `normalizeAttachments`,
  `domToMarkdown(root, {detectLang})` — reconstruye markdown fiel del DOM
  (código, negrita, listas numeradas con `start`, etc.), no `innerText` plano.

### Gemini (ya estaba parcialmente hecho, se completó esta sesión)

Bug real encontrado: `getTurnId` siempre devolvía `''` porque los atributos
`_ngcontent-*`/`_nghost-*` de Angular son compartidos por TODAS las
instancias de la plantilla, no únicos por turno. Fix: usar
`turn.closest('.conversation-container').id` (confirmado en vivo: 10 turnos,
10 ids distintos, sin repetir — usuario y su respuesta comparten el mismo id
porque el par vive en un solo contenedor). Se implementaron
`getNewUserTurnIds`/`findAssistantAfterUserIds` reales (antes stubs) y se
puso `policies.anchorAfterUser = true`. `attachFiles` ya funcionaba.

Esto era la causa raíz del bug original reportado (duplicación de mensajes
tras tool-calls): cualquier re-render del DOM que produjera un
`domToMarkdown` ligeramente distinto bypaseaba el dedup por texto y
duplicaba el mensaje.

### Claude (`relay-claude.js`) — nuevo, completo

- `turnId`: `closest('[data-index]')` — el wrapper virtualizado de la lista
  trae un índice posicional real (confirmado: usuario=0, respuesta=1).
- `isComplete`: `closest('[data-is-streaming]')` === `"false"`.
- Sin botón de enviar confiable — `act.submit` usa `dispatchEnter` (Enter
  real, confirmado en vivo que navega a una conversación real).
- Bug de duplicación de lenguaje en bloques de código: Claude pone un label
  suelto ("python") ANTES del `<pre>` que `domToMarkdown` capturaba como
  prosa — el fence en sí ya trae `class="language-python"` estándar. Fix con
  regex dirigida solo a este driver.
- `attachFiles`: el input real es
  `<input type=file data-testid="file-upload">`, oculto, sin preview al
  usar `pasteFiles()` sobre el composer. Mecanismo que SÍ funciona: asignar
  un `DataTransfer` a `.files` del input + disparar `Event('change')` —
  produce un `[data-testid="file-thumbnail"]` real. Verificado end-to-end vía
  el adapter real (`findProvider().act.attachFiles(...)`), no solo DOM crudo.

### Grok (`relay-grok.js`) — nuevo, completo

- `turnId`: `closest('[id^="response-"]')` — id real por turno (usuario Y
  respuesta con ids DISTINTOS, no compartido). El id de la respuesta coincide
  con el `rid=` de la URL.
- Code blocks con Shiki (`class="shiki ..."`, sin `language-*` estándar en
  `<code>`) — lenguaje real en un `<span>` hermano en el header
  (`detectLang` hook). Mismo bug de duplicación de label que Claude, mismo
  tipo de fix (regex genérica, no anclada solo al inicio del turno porque acá
  puede aparecer después de prosa real).
- `attachFiles`: input real `<input type=file class=hidden multiple
  name=files>`, mismo mecanismo DataTransfer+change, confirmado con preview
  real (`data-testid="asset-text-icon"`, botón "Remove this attachment").
- Insertar texto en el composer (Tiptap/ProseMirror) requiere `Range` +
  `Selection` explícitos antes de `execCommand('insertText')` —
  `.focus()` solo no bastaba.

### Perplexity (`relay-perplexity.js`) — nuevo, completo (menos attachFiles)

- La respuesta trae id real (`id="markdown-content-N"`, secuencial), pero la
  PREGUNTA no tiene id propio — se empareja por posición: la pregunta N-ésima
  (selector `.group\/title`) usa el MISMO id que `markdown-content-N` (mismo
  principio que Gemini: el par comparte id, pero derivado por orden en vez
  de por contenedor común).
- Lenguaje del código: `data-testid="code-language-indicator"`, vive FUERA de
  `<code>` — sin bug de duplicación (a diferencia de Claude/Grok/Kimi/Poe).
- Composer es Lexical — `execCommand('insertText')` sin un `Range` real
  construido sobre el nodo a veces no se aplicaba, y **persiste un draft
  local** entre reloads (causó una acumulación cómica de texto duplicado
  varias veces durante las pruebas — no es bug de Aurora, es el propio
  Lexical/Perplexity).
- Botón submit: `aria-label="Submit"`. Stop: `aria-label="Stop response
  (Esc)"`.
- **`attachFiles` deshabilitado a pedido del usuario**: el mecanismo
  (idéntico al de Claude/Grok) funcionó UNA vez con confirmación completa
  (preview real, nombre correcto) pero falló en silencio ~6 veces seguidas
  después, sin error visible. Sospecha del usuario: función de pago de
  Perplexity, no bug del relay. `act.attachFiles` queda implementado en el
  código por si se reactiva, pero `capabilities.images/files = false`.

### Kimi (`relay-kimi.js`) — nuevo, completo (menos attachFiles)

- El dominio real cambió de `kimi.moonshot.cn` a **`kimi.com`/`www.kimi.com`**
  — el manifest solo cubría el dominio viejo, así que NINGÚN content script
  de Aurora (ni siquiera `relay-core.js`/`session-sniffer.js`) se inyectaba
  ahí antes de este fix. Se agregó `kimi.com`/`www.kimi.com` a
  `host_permissions` y a los 5 bloques de `content_scripts` que antes solo
  tenían `kimi.moonshot.cn`.
- `turnId`: `closest('.chat-content-item')` trae `data-archer-id`, UUID real
  y distinto por turno.
- `.send-button-container` es un DIV clickeable (Vue), no un `<button>` —
  trae clase `.disabled` cuando el composer está vacío y `.stop` mientras
  genera (mismo elemento cambia de rol según estado).
- Código con clase estándar `language-python` en `<pre>` Y `<code>` — pero
  el header (`.segment-code-header`, con label + botón "Copy") es HERMANO
  del `<pre>` dentro de `.segment-code` (que es un div normal, no pre/code)
  — mismo bug de duplicación ("Python   Copy" antes del fence), mismo tipo
  de fix con regex.
- `attachFiles` deshabilitado: el `<input type=file>` no existe en el DOM
  hasta abrir el menú "Add" del composer, y se desmonta enseguida — el
  mecanismo DataTransfer+change no produjo preview visible en varios
  intentos.

### Poe (`relay-poe.js`) — nuevo, completo, INCLUYE attachFiles funcionando

- `[id^="message-N"]` (ancestro directo de cada burbuja) trae `id` real
  secuencial Y **`data-complete="true"/"false"`** — señal directa de
  "terminó de generar" más confiable que inferir por ausencia de Stop (mejor
  que la mayoría de los otros proveedores).
- Composer es un `<textarea>` real controlado por React — asignar `.value`
  directo no basta, el botón Send queda `disabled` para siempre. Fix: setter
  nativo + limpiar primero (vaciar + `InputEvent`) ANTES de escribir el
  texto nuevo — sin ese paso de limpieza previo, el botón seguía disabled
  incluso con el valor ya visible en pantalla.
- Código con clase estándar `language-python`, pero el nombre del lenguaje
  visible (`.MarkdownCodeBlock_languageName__*`) vive fuera del `<pre>`,
  hermano de su wrapper — mismo bug de duplicación, mismo tipo de fix.
- `attachFiles`: input real ya presente en el DOM sin necesitar abrir ningún
  menú (a diferencia de Kimi) — funcionó al primer intento con preview real.
  **Verificado en vivo end-to-end vía el adapter real.**

### `manifest.json` — reestructurado

Cada proveedor certificado ahora tiene su propio bloque `content_scripts`
(en vez de caer al débil `relay-generic.js` compartido): ChatGPT, Gemini,
Qwen, Claude, Grok, Perplexity, Kimi. Solo quedan en el bloque genérico:
Copilot, You.com (Poe y Kimi se separaron esta sesión).

### Qwen — pendiente, bloqueado por login

`relay-qwen.js` ya tenía MUCHO trabajo previo real (bugs de doble-envío,
spam de toasts, virtualización de Monaco para bloques de código) pero
`getTurnId`/`getNewUserTurnIds`/`findAssistantAfterUserIds` siguen siendo
stubs sin confirmar en vivo, y `stop: []` (nunca capturado). La pestaña de
prueba mostraba "Log in / Sign up" — sin sesión real, bloqueado hasta que el
usuario inicie sesión ahí.

## 6. Bugs de infraestructura encontrados y arreglados (no eran del relay)

### Red IPv4 rota (bloqueaba Grok, Perplexity, Qwen, Kimi, Poe)

`ip route show table all` no tenía ruta default IPv4 en `enp1s0` (solo IPv6
vía `fe80::1`) — la IP (`192.168.100.4/24`) tenía el flag `noprefixroute`
pegado, señal de que NetworkManager se quedó a medias con el DHCP. Root
cause real, no DNS (el usuario sospechaba DNS genérico, pero
`getent hosts`/`curl -4` probaron que era la ruta, no la resolución). Fix:
`nmcli connection down "Wired connection 1" && nmcli connection up
"Wired connection 1"` — restauró la ruta default IPv4 en segundos.

### `auth-escape.js` secuestraba logins de sitios ajenos (bug real, reportado por el usuario)

El script (corre en `accounts.google.com`/`appleid.apple.com`/
`login.microsoftonline.com`/`login.live.com`/`auth.openai.com`, todos los
frames) existe para reabrir en una pestaña nueva un login que quedó roto
DENTRO de un iframe embebido de Aurora (el panel Cloud sí sigue embebiendo
LLMs en iframe — confirmado con una investigación específica, no es
arquitectura retirada). El bug: su lógica de exclusión era una DENYLIST
("escapar salvo que el top-level sea uno de estos casos conocidos") en vez
de una ALLOWLIST — cualquier sitio de terceros con su propio botón nativo de
"Sign in with Google" (ej. el widget `accounts.google.com/gsi/button`, que
usan miles de sitios sin relación con Aurora) caía en el caso por-defecto y
se secuestraba. Fix: `AURORA_UI_HOSTS` (localhost/127.0.0.1 en los puertos
7779/7777/8088) como allowlist explícita — solo escapa si el top-level real
es la propia UI de Aurora.

## 7. Login pendiente en varias pestañas

Durante la sesión se encontró que **Grok y Perplexity tampoco tenían sesión
real** (mismo síntoma "Sign in/Sign up" que Qwen) — causado por la red IPv4
rota, no por la extensión (se descartó explícitamente, con evidencia: el
redirect a `accounts.x.ai/sign-in` es del propio servidor de x.ai, y
`rules.json` solo toca headers de `sub_frame`, sin lógica de bloqueo/redirect
en `background.js`). Una vez arreglada la red, el usuario inició sesión en
Grok con éxito (confirmado: "deml / ddg36_@hotmail.com" en el sidebar real).
Perplexity y Kimi ya estaban logueados. **Qwen sigue sin sesión al cierre de
esta sesión.**

## 8. Prueba del loop de tools (JSON Family) — hallazgos importantes

Instrucción del usuario: verificar que el loop de tools (no solo texto)
funcione en los relays nuevos, "chatgpt funciona bien con herramientas, los
demás también deben funcionar."

### Lo que se probó y confirmó

La captura de bloques ` ```json ` es estructuralmente IDÉNTICA al mecanismo
de captura de cualquier fence de código (` ```python `, etc.) — ya probado
sólido y sin corrupción en los 5 relays nuevos. Esto es lo que realmente
depende del código del relay.

### Lo que NO se pudo confirmar end-to-end, y por qué

1. **El primer real de Aurora vive en `getCloudToolPrimer()`**
   (`ui/components/shared/cloud-tool-primer.js`), y se inyecta SOLO en el
   primer mensaje de una conversación nueva (gateado por
   `activeCloudProtocol()` + `yaCebado`/`marcarCebado` en
   `ui/modules/lyra/scripts/chat/cloud.js`, función `enviarACloud`). Un
   mensaje sintético armado a mano (aunque copie el texto exacto del primer)
   **no tiene la misma legitimidad/contexto** que el flujo real — Claude lo
   detectó y rechazó explícitamente como probable inyección de prompt ("no
   tengo ninguna herramienta llamada view_describe... no voy a emitir
   bloques de tool calls fabricados sin explicación"). Esto reveló además
   que Aurora inyecta contexto persistente real en cada conversación (Claude
   mencionó sin que se lo pidiera datos reales de la PC del usuario/build
   de hardware).
2. **ChatGPT (gpt-5-6-thinking) devolvió un `<pre></pre>` completamente
   vacío 4 veces seguidas** (2 conversaciones nuevas, con y sin variación de
   instrucción) al pedirle que emita el bloque JSON textual. Confirmado con
   `outerHTML` crudo, no es un bug de captura del relay (el DOM real estaba
   vacío). Parece un quirk genuino de ese modelo específico con ese pedido
   específico, no un bug de Aurora.
3. **El panel Cloud embebido de Aurora (dentro de `localhost:7779`) NO tiene
   sesión propia de Claude** — cookie jar separado del tab suelto por el
   partitioning de iframes de Chrome (el mismo problema que `auth-escape.js`
   intenta resolver, pero para OAuth de terceros, NO para el login nativo de
   Claude por email/password, que nunca estuvo en su lista de dominios). El
   iframe redirigió a `claude.ai/login` y mostró un challenge de hCaptcha —
   no se intentó resolver (requeriría loguearse en la cuenta real del
   usuario dentro de un captcha, fuera de lo que se debe hacer sin
   supervisión directa).

### Bug propio encontrado (del método de prueba, no de Aurora)

`atob()` en el navegador decodifica base64 a un "binary string" — usar eso
directo como texto UTF-8 (para pasar el primer con tildes/ñ vía CDP sin
pelear con quoting) producía mojibake ("RespondÃ©" en vez de "Respondé").
Fix: `decodeURIComponent(escape(atob(b64)))`.

### Conclusión honesta

La CAPACIDAD del relay (capturar un fence JSON limpio) está probada. El LOOP
completo (primer real → modelo obedece → Aurora ejecuta → reinyecta
resultado) no se cerró end-to-end para ningún proveedor nuevo en esta
sesión — para hacerlo bien hace falta loguear Claude (u otro proveedor dentro
del picker: Gemini/ChatGPT/Perplexity/Qwen, ya que Grok/Kimi/Poe ni siquiera
están en `AI_URLS`/`AI_LABELS` de `ui/modules/lyra/view/composer.js` — el
picker real solo ofrece esos 5) DENTRO del iframe de Aurora, y probar desde
ahí con el composer real de Lyria (`.composer-textarea`), no con mensajes
sintéticos armados a mano.

## 9. Bug pre-existente encontrado durante el merge (no introducido por esta sesión)

Al fusionar `task/lyria-avatar-presence-backgrounds`, `ui/modules/lyra/view/lyra.js`
referenciaba `cloudGenerandoVal` en dos lugares — variable que **no está
declarada en ningún lado del archivo actual** (solo existe en varios
`*.backup.TIMESTAMP` viejos, donde sí se declaraba vía
`const cloudGenerandoVal = useSig(cloudGenerando);`). Confirmado que el bug
existe en AMBAS ramas por separado (no es artefacto del merge) — un
`ReferenceError` real en cualquier render donde se llegue a evaluar esa
rama del ternario. Se resolvió el conflicto tomando en ambos casos la
versión que NO referencia la variable rota, pero **la declaración faltante
sigue sin arreglarse** — si `cloudGenerandoVal` se necesita de verdad (lo
usa `message-list.js` como prop), hay que re-agregar
`const cloudGenerandoVal = useSig(cloudGenerando);` (importando `cloudGenerando`
desde `./scripts/chat/mensajes.js`) en `lyra.js`.

## 10. Otros hallazgos menores

- **Steam L4D2**: tras migrar Steam de Flatpak a `.deb` nativo, el juego
  mostraba "no tenés permiso para correr esta aplicación" DENTRO del juego
  al lanzarlo. Se descartó: Flatpak Steam leftover (no hay), permisos de
  filesystem (correctos, `deml:deml` con bit +x), doble instancia de Steam
  corriendo (solo una). Diagnóstico: probable caché de ownership/manifest
  desactualizada tras la reinstalación completa — se recomendó "Verificar
  integridad de los archivos del juego" desde Steam (Propiedades → Archivos
  instalados). **Quedó corriendo la verificación al cierre de la sesión, sin
  confirmar si resolvió el problema.**

## 11. Estado de ramas y worktrees — CONSOLIDADO en este checkpoint

**Actualización tras el merge real**: todas las ramas de abajo ya están
fusionadas a `master` (verificado: `git rev-list --count master..<rama>` da
`0` para las ocho). El working tree quedó limpio (`git status` sin
pendientes). El único conflicto real de mezcla de código fue en
`ui/modules/lyra/view/lyra.js` (avatar/duo, 8 bloques resueltos a mano,
documentado en la sección 9 de arriba) y uno trivial en
`ai-cloud/CHECKLIST-ACTIVO.md` (contenido duplicado, resuelto tomando la
versión más completa). El resto fusionó sin conflictos.

Antes de este checkpoint, el repo tenía múltiples worktrees activos, cada
uno en su propia rama, sin fusionar entre sí:

- `master` — rama principal, adelantada a `origin/master` por 2 commits.
- `task/qwen-lyria-cloud` (este worktree, `/home/deml/Downloads/core_instruction/aurora`) —
  TODO el trabajo de esta sesión (relays nuevos, fixes de red/auth-escape,
  manifest reestructurado) vivía sin commitear acá, más una cantidad grande
  de cambios sin commitear que YA estaban sucios al empezar la sesión
  (ver `git status` en el commit de este checkpoint para el detalle exacto).
- `task/sol-ideas-integration` (`aurora-sol-ideas-integration`) — mismo
  commit base que `qwen-lyria-cloud` antes de este checkpoint.
- `task/sol-productivity-inquisition` (`aurora-sol-productivity-inquisition`).
- `task/ai-cloud-memory-foundry-phase1` (`aurora-ai-cloud-memory-foundry`).
- `task/lyria-avatar-presence-backgrounds` (`aurora-lyria-avatar-presence`) —
  adelantada a su remoto.
- `task/provider-health-sensor` (`aurora-provider-health-sensor`).
- `experiment/command-family` — nexus_v2 desactivado (no viable como
  alternativa a JSON Family).
- `ember-thought` (worktree anidado en `.kilo/worktrees/ember-thought`) —
  refactor de frontend (cleanup, dedup, split de archivos grandes, CRUD
  editors).

Este checkpoint fusiona todas estas ramas a `master` (ver el mensaje del
commit de merge correspondiente para el detalle exacto de qué se trajo de
cada una y cómo se resolvió cualquier conflicto). El objetivo explícito del
usuario: poder seguir trabajando desde **otra máquina** con un solo
`git pull` de `master`, sin tener que reconstruir todos los worktrees.

## 12. Cómo retomar

1. Leer este archivo completo.
2. Revisar la sección "Estado y pendientes" al inicio de `README.md`.
3. Prioridad sugerida: (a) Qwen necesita login para terminar su driver, (b)
   cerrar el loop real de tools logueando un proveedor dentro del picker de
   Aurora (Cloud panel embebido), (c) confirmar si la verificación de
   integridad resolvió L4D2.
