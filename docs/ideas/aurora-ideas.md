# Aurora Ideas — Extensiones de Productividad

Ideas de extensiones MV3 thin clients para Aurora v2. Todas siguen la arquitectura actual:

- UI principal en `http://localhost:7779/ui`.
- Extensiones con `manifest.json`, `background.js`, `content.js` e `index.html` con iframe.
- Datos persistentes en SQLite vía `/db/*`.
- Automatización avanzada vía `/browser/*`, `/nexus/*` y CDP/Playwright.
- LLM local vía WebSocket `/gemita`.

---

## 1. Aurora Capture

Extensión base para capturar contexto web.

**Captura:**

- URL actual.
- Título.
- Favicon.
- Texto seleccionado.
- HTML limpio del `<article>`, `<main>` o selección.
- Metadatos OpenGraph.
- Screenshot parcial opcional.
- Fecha y usuario.

**Uso en Aurora:**

- Guardar recortes en DB.
- Enviar contexto a Local/Gemita.
- Convertir captura en nota, tarea, prompt o entrada de Wiki.

**Tablas/endpoints posibles:**

- `GET/POST /db/web/capturas`
- `GET /db/web/capturas/:id`
- `DELETE /db/web/capturas/:id`

---

## 2. Aurora Researcher

Sidepanel de investigación sobre la página activa.

**Funciones:**

- Resumir página.
- Extraer puntos clave.
- Detectar entidades: personas, empresas, productos, fechas, precios.
- Extraer argumentos a favor/en contra.
- Generar preguntas de seguimiento.
- Crear fuentes para Wiki.

**Captura web:**

- DOM limpio.
- Enlaces externos.
- Citas textuales.
- Encabezados.
- Tablas.

**Salida:**

- Resumen corto.
- Resumen largo.
- Lista de decisiones.
- Lista de fuentes.
- Prompt reutilizable.

---

## 3. Aurora Tasks From Web

Convierte cualquier página en tareas accionables.

**Ejemplos:**

- “Comprar este producto cuando baje de precio.”
- “Responder este correo.”
- “Investigar esta herramienta.”
- “Guardar esta documentación.”
- “Crear ticket con este bug.”

**Captura:**

- URL.
- Texto relevante.
- Selector del elemento.
- Screenshot opcional.
- Contexto visual.

**Integración:**

- Crear tareas en DB.
- Relacionar tarea con página original.
- Enviar a Local/Gemita para plan de acción.
- Usar `/browser/*` para revisar la página después.

---

## 4. Aurora Clipboard Memory

Memoria automática basada en copiar/pegar.

**Funciona así:**

1. El usuario copia texto en cualquier web.
2. `background.js` detecta `clipboardRead` o evento de copiado.
3. La extensión guarda el texto en Aurora.
4. Aurora infiere tipo, tags y posible destino.

**Tipos detectables:**

- Nota.
- Prompt.
- Código.
- Error.
- Producto.
- Contacto.
- Fuente.
- Tarea.
- Cita.

**Ventaja:**

Convierte el portapapeles en una memoria persistente conectada a Scratchpad, Wiki y Local.

---

## 5. Aurora Form Filler Inteligente

Relleno seguro de formularios con datos persistentes.

**Datos que puede manejar:**

- Nombre.
- Email.
- Empresa.
- Teléfono.
- Dirección.
- Proyecto.
- Cliente.
- Notas internas.
- Respuestas frecuentes.

**Seguridad:**

- Confirmación antes de rellenar.
- Modo manual por campo.
- No exponer datos sensibles en logs.
- Permisos limitados por dominio.
- Opción de borrar dato desde Aurora.

**CDP:**

- Detectar campos visibles.
- Rellenar con `Input.dispatchKeyEvent` o DOM setters.
- Capturar resultado.
- Guardar formulario completado como plantilla.

---

## 6. Aurora Meeting Notes

Extensión para reuniones en web.

**Objetivos:**

- Google Meet.
- Zoom Web.
- Teams Web.
- YouTube Live.
- Streams internos.

**Captura:**

- Participantes visibles.
- Chat.
- Transcripción visible.
- Timestamps.
- Enlaces compartidos.
- Decisiones detectadas.
- Tareas mencionadas.

**Salida:**

- Resumen ejecutivo.
- Decisiones.
- Pendientes.
- Timeline.
- Notas limpias en Markdown.
- Entrada directa en Scratchpad/Wiki.

---

## 7. Aurora Tab Commander

Gestor avanzado de pestañas.

**Captura:**

- Títulos.
- URLs.
- Favicons.
- Estado activo.
- Grupo de pestañas.
- Preview de texto.
- Fecha de apertura.
- Dominio.

**Funciones:**

- Buscar pestañas por texto semántico.
- Agrupar por proyecto.
- Archivar sesión de pestañas.
- Convertir grupo en nota.
- Cerrar duplicados.
- Cerrar tabs de baja prioridad.
- Restaurar sesión desde Aurora.

**CDP:**

- Inspeccionar DOM de tabs activas.
- Extraer contenido sin abrir pestaña.
- Generar mini-resumen por tab.

---

## 8. Aurora Price Watch

Monitor de precios y disponibilidad.

**Captura inicial:**

- Producto.
- Precio.
- Moneda.
- Stock.
- Imágenes.
- URL.
- Tienda.
- Selectores usados.
- Fecha.

**Monitor:**

- Revisión periódica con `/browser/*`.
- Historial de precios.
- Alertas por bajada.
- Alertas por stock.
- Comparación entre URLs.

**Casos:**

- Hardware.
- Componentes.
- Libros.
- Cursos.
- Suscripciones.
- Productos de marketplace.

---

## 9. Aurora Code Context

Extensión para desarrolladores.

**Sitios objetivo:**

- GitHub.
- GitLab.
- StackOverflow.
- MDN.
- React docs.
- Python docs.
- Rust docs.
- Docs internas.

**Captura:**

- Snippets.
- Errores.
- Issues.
- Pull requests.
- Commits.
- Documentación.
- Stack traces.
- Archivos abiertos.

**Acciones:**

- Explicar código.
- Refactorizar.
- Generar tests.
- Buscar en Wiki.
- Crear prompt técnico.
- Guardar patrón reusable.
- Abrir playground/editor desde Aurora.

---

## 10. Aurora Web Automator

Grabador de flujos web.

**Graba:**

- Clicks.
- Inputs.
- Selects.
- Scroll.
- Navegación.
- Esperas.
- Selectores CSS/XPath/testid.
- Screenshots de pasos.

**Ejecuta:**

- Manual desde sidepanel.
- Programado desde Aurora.
- Con confirmaciones por paso riesgoso.
- Con fallback de selectores.

**Backend:**

- `/browser/sessions`
- `/browser/flows`
- `/browser/run`
- `/browser/inspect`
- `/browser/screenshot`

**Uso:**

- Login repetitivo.
- Reportes.
- Extracción de datos.
- QA.
- Migraciones web.
- Monitoreo de estados.

---

## 11. Aurora Docs Bridge

Puente universal para documentos de oficina.

**Objetivo:**

Unificar Markdown, PDF, Word y Excel en un mismo flujo de Aurora.

**Captura:**

- Archivos locales arrastrados al sidepanel.
- Archivos abiertos en Google Docs, Sheets, Office Web o PDF viewers.
- Texto seleccionado.
- Metadatos del documento.
- Estructura: títulos, tablas, listas, referencias.

**Procesamiento:**

- PDF → texto limpio + páginas.
- Word → Markdown.
- Excel → tablas normalizadas.
- Markdown → índice + bloques reutilizables.

**Uso en Aurora:**

- Preguntar sobre un documento.
- Extraer decisiones.
- Convertir Word/PDF a Markdown.
- Convertir Markdown a Word/PDF.
- Guardar versiones en `/nexus/fs`.
- Indexar contenido en Wiki.

---

## 12. Aurora PDF Lens

Lectura inteligente de PDFs.

**Funciones:**

- Extraer texto por página.
- Detectar tablas.
- Detectar figuras y pies de imagen.
- Resaltar secciones.
- Crear resumen por capítulo.
- Generar preguntas/respuestas.
- Exportar citas con página.

**Casos de uso:**

- Papers.
- Contratos.
- Manuales.
- Facturas.
- Reportes.
- Documentos legales.

**Integración:**

- Guardar citas en DB.
- Enviar fragmentos a Local/Gemita.
- Crear notas en Scratchpad.
- Generar bibliografía.

---

## 13. Aurora Sheet Mind

Asistente para hojas de cálculo.

**Objetivo:**

Entender, limpiar y transformar datos desde Excel/Google Sheets.

**Captura:**

- Nombres de hojas.
- Rangos seleccionados.
- Encabezados.
- Tipos de columna.
- Fórmulas visibles.
- Valores calculados.
- Tablas dinámicas detectables.

**Funciones:**

- Explicar columnas.
- Detectar inconsistencias.
- Limpiar datos.
- Sugerir fórmulas.
- Generar scripts Python/pandas.
- Crear resúmenes ejecutivos.
- Convertir tabla a Markdown/JSON/CSV.

**Backend posible:**

- `/db/sheets/imports`
- `/db/sheets/analyses`
- `/nexus/py/run` para pandas.
- `/nexus/fs` para CSV/Markdown exportado.

---

## 14. Aurora Media Notes

Notas inteligentes para videos y audios.

**Objetivo:**

Convertir contenido multimedia en notas accionables.

**Fuentes:**

- YouTube.
- Vimeo.
- Podcasts web.
- Archivos MP3/WAV/WEBM locales.
- Reuniones grabadas.

**Captura:**

- URL.
- Título.
- Autor/canal.
- Duración.
- Transcript visible.
- Timestamps.
- Capturas de pantalla.
- Audio local opcional.

**Procesamiento:**

- Resumen por segmentos.
- Capítulos automáticos.
- Decisiones y tareas.
- Citas con timestamp.
- Transcripción a Markdown.
- Búsqueda dentro del audio/video.

**Salida:**

- Notas con timestamps.
- Resumen ejecutivo.
- Preguntas abiertas.
- Tareas derivadas.
- Entrada en Wiki o Scratchpad.

---

## 15. Aurora Office Copilot

Copilot local para documentos activos.

**Funciona en:**

- Google Docs.
- Google Sheets.
- Office Web.
- PDFs en navegador.
- Notion-like editors.
- Editores Markdown web.

**Acciones:**

- Reescribir selección.
- Resumir selección.
- Corregir estilo.
- Traducir.
- Cambiar tono.
- Generar tabla.
- Crear índice.
- Explicar fórmula.
- Convertir texto a Markdown.
- Convertir Markdown a documento.

**Arquitectura:**

- `content.js` captura selección y contexto.
- `background.js` manda al server.
- `/gemita` procesa la solicitud.
- La respuesta se inserta con confirmación.
- Todo queda registrado en `/db/docs/copilot`.

---

## Prioridad recomendada

Orden práctico de implementación:

1. `Aurora Capture`
2. `Aurora Researcher`
3. `Aurora Tasks From Web`
4. `Aurora Clipboard Memory`
5. `Aurora Tab Commander`
6. `Aurora Code Context`
7. `Aurora Form Filler Inteligente`
8. `Aurora Meeting Notes`
9. `Aurora Price Watch`
10. `Aurora Web Automator`
11. `Aurora Docs Bridge`
12. `Aurora PDF Lens`
13. `Aurora Sheet Mind`
14. `Aurora Media Notes`
15. `Aurora Office Copilot`

La mejor primera extensión es **Aurora Capture**, porque habilita el bloque base para casi todas las demás: capturar contexto web y enviarlo al server. Para oficina, la primera debería ser **Aurora Docs Bridge**, porque normaliza Markdown, PDF, Word y Excel antes de construir asistentes más específicos.

---

## 16A. JSON Family — núcleo de tools dentro de Aurora

**Estado:** 🟢 Completa; verificada en servidor, tab normal y split
**Propietario:** Aurora Server
**No pertenece a:** content scripts, DOM, iframes ni adaptadores de proveedores

### Objetivo

JSON Family es el servicio central de Aurora que recibe contenido ya capturado,
detecta una solicitud de tool, la procesa usando providers reales, espera su
resultado y devuelve una respuesta neutral al mismo relay que inició la llamada.

```text
Relay → JSON Family → Pi Tool Provider → JSON Family → Relay
```

### Responsabilidades exclusivas

1. Recibir `requestId`, texto capturado e identidad opaca de origen.
2. Extraer únicamente un grupo ejecutable final `{"tool","args"}`.
3. Ignorar JSON documental, ejemplos y bloques con prosa posterior.
4. Validar la envoltura y aplicar política atómica/de lotes.
5. Consultar catálogo y schemas del provider correspondiente.
6. Ejecutar las factories oficiales de Pi sin RPC, AgentSession ni segundo LLM.
7. Esperar el resultado completo y preservar `content[]` y `details`.
8. Correlacionar resultado con `requestId`.
9. Devolver `not_tool`, `tool_result` o `tool_error`; nunca manipular DOM.

### Lo que JSON Family NO hace

- No observa ChatGPT, Gemini, Grok ni ningún iframe.
- No contiene selectores de composer, botones Send o Stop.
- No pega texto ni simula teclado/clicks.
- No conoce `tabId`, `frameId` como APIs de Chrome; el origen es metadata opaca.
- No vive en la extensión ni se duplica por proveedor.
- No inyecta el primer/prompt de tools.
- No implementa la lógica interna de read/bash/edit/write.

### Contrato propuesto

```json
{
  "requestId": "relay-chatgpt:uuid",
  "text": "respuesta completa capturada por el relay",
  "origin": {
    "relayId": "chatgpt",
    "surface": "browser-tab",
    "conversationId": "opaco"
  }
}
```

Respuesta sin tool:

```json
{"requestId":"...","kind":"not_tool"}
```

Respuesta con ejecución:

```json
{
  "requestId": "...",
  "kind": "tool_result",
  "entries": [{
    "kind": "tool_result",
    "call": {"tool":"bash","args":{"command":"pwd"}},
    "result": {
      "ok": true,
      "is_error": false,
      "content": [{"type":"text","text":"..."}],
      "details": {}
    }
  }],
  "feedback": "texto listo para continuar el turno"
}
```

### Componentes

- `src/json_family/parser.py`: parser canónico.
- `src/json_family/service.py`: políticas, dispatch y espera.
- `src/json_family/router.py`: endpoint autenticado `POST /json-family/process`.
- `src/pi_tools/`: provider oficial de Pi importado directamente.
- Tests unitarios de parser, schemas, errores, idempotencia y correlación.

### Criterios de aceptación

- [x] El servidor procesa una captura sin depender de que la UI de Aurora esté abierta.
- [x] JSON normal/documental retorna `not_tool`.
- [x] Una tool válida se ejecuta exactamente una vez; `json_family_runs` hace replay durable por `requestId`.
- [x] Archivo inexistente vuelve como `tool_error`, no cuelga el request.
- [x] `bash.cmd` y contratos antiguos se rechazan por schema.
- [x] El resultado conserva contenido nativo, imágenes y detalles.
- [x] Dos requests de distintos relays no mezclan resultados.
- [x] La extensión no importa ni contiene el parser de JSON Family.
- [x] El toggle global impide iniciar nuevas ejecuciones, sin cancelar resultados ya aceptados.

### Verificación de cierre (2026-07-17)

- Parser estricto: 15 casos de JSON documental, incompleto, duplicado,
  no-finito, grupos mixtos y prosa posterior.
- Matriz real de las siete factories oficiales: `read`, `bash`, `edit`,
  `write`, `grep`, `find` y `ls`.
- Idempotencia concurrente, conflicto por reutilizar `requestId`, aislamiento
  entre relays, batch atómico, timeout de bash, desconexión del cliente y
  recuperación conservadora tras reinicio.
- `read` de imagen conserva el `content[]` nativo y produce una entrega neutral
  `{text, images, files}`. Se verificó una imagen PNG de 5.3 MB sin matar el
  host Pi; el canal JSONL admite hasta 64 MB por mensaje.
- El journal guarda una sola copia de la imagen, reconstruye `delivery` durante
  replay y registra ACK durable para no volver a entregarla tras una recarga.

---

## 16B. Relay Family — captura y entrega dentro de la extensión

**Estado:** 🟢 Dirección V2 implementada y ChatGPT + Gemini verificados;
drivers especializados adicionales pendientes
**Propietario:** extensión Aurora Hub
**Dependencia:** contrato estable de la Épica 16A

### Objetivo

Cada relay traduce entre la interfaz nativa de un proveedor y JSON Family.
Captura una respuesta terminada, la envía a Aurora, espera la contestación
correlacionada y, si existe resultado de tool, lo entrega al mismo chat usando
el transporte verificado de ese proveedor.

```text
relay-chatgpt ─┐
relay-gemini  ─┤
relay-grok    ─┼→ JSON Family único en Aurora
relay-deepseek─┤
relay-kimi    ─┘
```

### Responsabilidades exclusivas

1. Conocer el DOM y ciclo de vida de su proveedor.
2. Detectar generación/Stop, estabilidad y respuesta final.
3. Convertir el DOM renderizado a texto/Markdown fiel.
4. Asignar un `requestId` y conservar la identidad real tab/frame/pane.
5. Enviar la captura a JSON Family mediante el background como courier.
6. Esperar `not_tool`, `tool_result` o `tool_error`.
7. Entregar feedback usando composer, Send, timers y confirmación ya maduros.
8. Confirmar que apareció un nuevo turno de usuario antes de declarar entrega.
9. Evitar duplicar respuestas ya consumidas por Lyra Cloud/Duo.

### Lo que un relay NO hace

- No parsea `{"tool","args"}`.
- No valida schemas.
- No llama directamente a Pi ni a `/pi/cloud-tool`.
- No decide políticas de batch, permisos o idempotencia.
- No transforma un error de tool en éxito.
- No comparte resultados con otro tab/frame/pane.

### Dirección V2 — arquitectura definitiva de Relay Family

**Decisión (2026-07-17):** usar un Provider Adapter/Driver por sitio, Relay
Core como Strategy universal y la frontera Ports and Adapters entre ambos.
El core recibe **capacidades y señales semánticas**, nunca selectores CSS.

```text
cloud-relay.js                     selecciona y conecta
       │
       ├─ relay/relay-core.js          decide cuándo y por qué
       │        ↕ contrato semántico
       └─ relay/providers/             sabe cómo operar cada sitio
            ├─ relay-chatgpt.js
            ├─ relay-gemini.js
            ├─ relay-grok.js
            ├─ relay-deepseek.js
            └─ relay-kimi.js
```

Distribución objetivo sin build step:

```text
content-scripts/
├── cloud-relay.js
├── provider-relay.js
└── relay/
    ├── relay-core.js
    ├── relay-contract.js
    ├── relay-utils.js
    └── providers/
        ├── relay-chatgpt.js
        ├── relay-gemini.js
        └── relay-generic.js
```

Aurora no usa bundler ni build step. En MAIN el manifest carga
`contract → utils → provider → core → cloud-relay` en ese orden y cada archivo
registra su pieza en un namespace privado de la extensión.

#### `cloud-relay.js` — bootstrap/orquestador

Debe ser pequeño. Identifica dominio y superficie, obtiene el driver correcto,
lo conecta con Relay Core, conecta `postMessage` y publica READY/diagnósticos.
No contiene selectores, timers, parsing, clicks ni reglas especiales de
proveedor. Los protocolos `AURORA_CLOUD_ASK`, `STOP` y `NEW_CHAT` viven en Core.

#### `relay-core.js` — motor común

Contiene request IDs, correlación, watchers, transiciones de estado, espera de
Stop, estabilidad, streaming, reintentos, timeouts, toggle, ACK, deduplicación,
colas y protocolo con Aurora/JSON Family. Sabe **qué** operación realizar,
pero no conoce ningún selector ni dominio concreto.

Reglas inviolables:

- No contiene `chatgpt.com`, `gemini.google.com` ni ningún dominio.
- No contiene `#prompt-textarea`, `user-query`, `model-response`,
  `data-message-author-role` ni otro selector del proveedor.
- No crece con `if (esChatGPT)` o `if (esGemini)`.
- No conserva referencias DOM entre esperas; vuelve a pedir resolvers al driver.
- Una diferencia del proveedor pertenece al driver o a una capacidad declarada.

#### `relay-<proveedor>.js` — driver DOM

Cada driver mantiene sus selectores como constantes privadas y expone funciones,
no strings CSS ni handles DOM duraderos. Se divide deliberadamente en lectura
segura (`observe`) y acciones con efectos (`act`):

```js
{
  id: 'chatgpt',
  version: 1,
  matches(location),
  capabilities: { text: true, images: true, files: true, newChat: true },
  observe: {
    getInput(), getLatestAssistant(), readAssistant(turn),
    getUserTurnCount(), isGenerating(), getConversationKey(),
    getAttachmentState()
  },
  act: {
    insertText(input, text), submit(input), stopGeneration(),
    attachFiles(files), startNewConversation()
  }
}
```

El driver sabe **cómo** operar su sitio. Puede encapsular peculiaridades de
React/ProseMirror, Angular/Quill, previews, Canvas o navegación SPA; no ejecuta
tools, no crea IDs y no habla directamente con Pi.

`observe` puede usarse en diagnósticos sin provocar clicks o envíos.
`act` concentra toda operación que modifica la página.

#### Contrato obligatorio

`relay-contract.js` valida cada driver antes de arrancar. Como mínimo exige:

```text
id, version, matches, capabilities
observe.getInput
observe.getLatestAssistant
observe.readAssistant
observe.getUserTurnCount
observe.isGenerating
observe.getConversationKey
act.insertText
act.submit
```

Capacidades opcionales como imágenes, archivos o chat nuevo obligan a implementar
sus acciones correspondientes. Un adaptador incompleto falla de forma visible:

```text
Adaptador gemini incompleto: act.attachFiles
```

#### Señales que consume Relay Core

```text
composer disponible
mensaje insertado
envío aceptado
generación iniciada
respuesta estable
generación detenida
turno de usuario creado
conversación nueva confirmada
adjunto aceptado
```

Los strings CSS son selectores; los nodos resueltos son referencias DOM; las
condiciones anteriores son señales de estado; enviar/detener/adjuntar son
capacidades. El conjunto es el contrato semántico del Provider Adapter.

#### Resolvers, no referencias persistentes

ChatGPT y Gemini reemplazan nodos aunque visualmente parezcan iguales. Nunca se
guarda un composer para reutilizarlo segundos después. Core vuelve a solicitarlo:

```js
const input = adapter.observe.getInput();
await adapter.act.insertText(input, prompt);
await adapter.act.submit(adapter.observe.getInput() || input);
```

#### Flujo de arranque

```js
const driver = providerRegistry.find(candidate => candidate.matches(location));
const relay = createRelay({ adapter: validateProviderAdapter(driver) });
relay.start();
```

Si ChatGPT cambia dominio o DOM, se modifica solamente `relay-chatgpt.js` y su
entrada de manifest. Gemini, Relay Core y JSON Family no deben tocarse.

#### Puente aislado de extensión

`provider-relay.js` permanece como courier del mundo isolated hacia
`chrome.runtime`; no contiene DOM específico ni ejecución de tools. Solicita
`AURORA_RELAY_SNAPSHOT` y el service worker consulta en MAIN las funciones
semánticas del driver del mismo `sender.tab/frameId`. Esto evita duplicar el
driver entre mundos —Chromium deduplicaba los mismos archivos— y conserva una
sola fuente de verdad para el DOM. `background.js` es courier autenticado
Aurora ↔ frame exacto, sin parsing de JSON ni ejecución de tools.

#### Contrato de pureza del proveedor

Aurora es mensajero dentro de un iframe/tab de proveedor; no es un modloader.
En reposo sólo puede observar señales semánticas y publicar heartbeat. Ante una
solicitud explícita puede escribir en el composer, adjuntar, pulsar Send/Stop o
iniciar un chat nuevo. Todo lo demás está prohibido:

- no inyectar CSS, HUDs ni elementos decorativos;
- no sobrescribir `Document.prototype`, `visibilityState` o `hidden`;
- no falsificar visibilidad mediante audio, opacidad residual o keep-alive;
- no parchear `history.pushState/replaceState`;
- no cerrar Canvas/paneles ni pulsar controles ajenos al mensaje solicitado;
- no recargar la página como efecto secundario de Stop;
- no ejecutar tools desde content scripts ni endpoints legacy.

`tests/test-provider-purity.mjs` verifica esta frontera desde el manifest, las
reglas DNR y las fuentes activas. `bold-hud.js` excluye los dominios LLM;
X-Frame-Options/CSP se retiran sólo para proveedores embebibles explícitos,
nunca para todos los subframes ni páginas de autenticación.

Hay dos modos deliberadamente distintos:

- **Embedded Native:** iframe mensajero, UI nativa responsiva y ciclo de vida
  honesto. Al ocultarlo usa `visibility:hidden`; no engaña al proveedor.
- **Managed Agent Tab:** tab superior registrada con `autoDiscardable:false`,
  recomendada para agentes persistentes y trabajo prolongado en segundo plano.

Un iframe cross-site no puede prometer la misma política de cookies que una tab
superior. Aurora tampoco debe intentarlo modificando el runtime del proveedor.

### Toggle ON/OFF

El botón vive en Aurora y se propaga en tiempo real a todos los relays:

- `OFF`: el relay no inicia nuevas capturas hacia JSON Family.
- `ON`: inspecciona también la última respuesta estable ya visible.
- Un request aceptado antes de pasar a OFF puede terminar y devolver su resultado.
- Cambiar el toggle no requiere reload del proveedor.

### Criterios de aceptación

- [x] ON/OFF se difunde a cada frame existente mediante `state_push`.
- [x] ON inspecciona retroactivamente la última respuesta estable.
- [x] ChatGPT normal completa captura → tool Pi → feedback verificado → continuación.
- [x] Lyra Cloud y Cloud View marcan la respuesta consumida para impedir doble ejecución.
- [x] El relay reutiliza Stop, espera, reintentos y envío verificado existentes.
- [x] El background no contiene parser, schemas ni ejecución de tools.
- [x] Cada respuesta vuelve al mismo `sender.tab/frameId` que solicitó la entrega.
- [x] ChatGPT y Gemini en split reciben resultados distintos sin contaminación cruzada.
- [x] Una imagen devuelta por `read` se adjunta al frame originador y no al panel vecino.
- [x] El ACK durable evita duplicar texto o imagen al recargar el proveedor.
- [x] El split se monta también en segundo plano sin depender exclusivamente de `requestAnimationFrame`.
- [x] `cloud-relay.js` queda reducido a identificación y composición.
- [x] Relay Core no contiene dominios, selectores ni ramas ChatGPT/Gemini.
- [x] Añadir un proveedor nuevo sólo requiere driver + entrada de manifest.
- [x] El arranque no incluye visibility shim, HUD, transportes ni ejecutores legacy.
- [x] El relay no cierra UI ajena ni recarga el proveedor al detener.
- [x] La pureza del iframe está cubierta por un contrato automatizado.

### Verificación de Dirección V2 (2026-07-17)

- Contrato Node valida drivers v2, separación `observe`/`act`, selectores
  privados, orden por mundo y ausencia de detalles de proveedor en Relay Core.
- `SOL --contracts`: JSON Family, Relay V2 y regresión visual pasan en conjunto.
- La suite completa contiene siete contratos, incluida pureza del proveedor y
  una carga de 100 endpoints concurrentes.
- `SOL --relay-doctor`: cuatro frames vivos (ChatGPT y Gemini en dos superficies)
  reportaron driver v2, core correcto, courier isolated activo y composer listo.
- Turnos reales de texto: ambos proveedores devolvieron tokens exactos con
  streaming y cierre estable.
- Stop real durante una respuesta extensa: resultado `cancelled`, sin UI
  congelada ni turno fantasma en cola.
- Imagen real verificada en ambos paneles. Archivo real verificado mediante el
  marcador secreto `AURORA_RELAY_FILE_MARKER_7F3C9A` leído desde el adjunto.
- La primera prueba de imagen expuso una carrera: el preview de Gemini aparecía
  antes de asociar/subir el archivo al turno. El driver ahora espera preview,
  ausencia de upload activo y una ventana final estable antes de enviar.
- En Lyra Cloud real, ChatGPT conservó getters nativos de `visibilityState` y
  `hidden`, sin estilos Aurora; una solicitud E2E devolvió exactamente
  `RELAY_PURE_MESSENGER_OK` con cierre estable.

### Bugs encontrados y cerrados (2026-07-17)

- Una captura transitoria quedaba marcada como consumida aunque fallara el
  transporte. Ahora conserva el mismo request, reintenta con backoff y sólo
  deduplica `not_tool`, replay confirmado o entrega real.
- Un reload podía volver a pegar un resultado ya ejecutado. JSON Family ahora
  persiste `delivered_at` y el relay reconoce `deliveryAcknowledged`.
- ChatGPT rechaza `fetch(data:)` desde su página parcheada. Los adjuntos base64
  se decodifican localmente antes de crear el `File`.
- Stop podía producir una confirmación falsa mientras el composer seguía
  lleno. En tabs normales se exige observar el nuevo turno de usuario.
- En tabs de fondo Chrome puede suspender el doble rAF inicial y dejar el split
  sin iframes hasta redimensionar. Un timeout y `ResizeObserver` garantizan el
  primer reporte de paneles.
- El supuesto iframe “corrupto” era geometría: el HUD forzaba
  `position:relative` y un alto inline de 516 px prevalecía. ChatGPT recibía
  sólo 464 px y activaba su UI compacta. Expandido ahora usa
  `position:absolute`, sin alto inline: recibió 1032 px, mostró el sidebar
  nativo y 23 chats sin modificar su DOM.
- `aurora-visibility-shim.js` sobrescribía getters nativos; fue retirado del
  manifest. También salieron del arranque `ai-bridge`, `gem-observer` y
  `session-sniffer`; `gem-observer` contenía `/nexus/shell/run`, un ejecutor
  paralelo que violaba JSON Family.
- Tras recargar la extensión, un courier zombie podía contestar ping aunque
  `chrome.runtime` estuviera invalidado. El ping ahora declara `runtimeAlive`;
  el reinjector instala un courier sano y el Endpoint Registry queda como
  fuente autoritativa frente a datasets obsoletos de mundos ya invalidados.

---

## 16C. Surface Context + Endpoint Registry

**Estado:** 🟢 Fundación completa y validada; resolución dirigida lista, Arena Controller queda para épica posterior
**Dependencias:** Relay V2 (16B), JSON Family (16A)

### Objetivo

Modelar cada chat Cloud como un endpoint autónomo y direccionable, sin limitar
Aurora a `cloud`, `izq` y `der`. El mismo Relay debe funcionar en una tab normal,
Lyria Cloud, Cloud View, Duo o una Arena futura de N agentes.

```text
Provider Driver   → cómo opera el sitio
Relay Core        → cómo ejecuta un turno en ese endpoint
Surface Context   → dónde y para qué está montado
Endpoint Registry → identidad real tab/frame + estado vivo
Arena Controller  → coordina N endpoints (épica posterior)
```

### Binding explícito

El padre envía `AURORA_RELAY_BIND`; el core nunca intenta inferir Lyria, Duo o
Arena a partir del DOM:

```js
{
  type: 'AURORA_RELAY_BIND',
  context: {
    surface: 'llmcloud',
    surfaceInstanceId: 'surface-uuid',
    paneId: 'agent-3',
    channelId: 'surface-uuid:agent-3',
    role: 'reviewer',
    runId: null,
    mode: 'embedded'
  }
}
```

Una tab normal usa `surface: 'tab'`, `mode: 'top-level'` y no necesita binding
del padre. El background añade la identidad que sólo Chrome conoce:

```text
endpointId, windowId, tabId, frameId, providerId, conversationKey
```

La clave física es `tabId:frameId`; la identidad lógica estable es `endpointId`.
`paneId` nunca se usa solo porque dos Arenas pueden contener ambas `agent-1`.

### Registro y ciclo de vida

El courier isolated emite heartbeats aunque JSON Family esté OFF. El service
worker conserva una copia liviana en `chrome.storage.session`, actualiza:

```text
booting, ready, idle, generating, frozen, discarded, offline, error
```

y protege tabs administradas con `autoDiscardable:false`. Al liberar el último
endpoint de una tab, restaura el valor previo; la protección nunca queda pegada
permanentemente por haber usado Aurora.

Un heartbeat ausente no autoriza repetir tools con efectos. Sólo marca el
endpoint `offline`; JSON Family conserva su recuperación conservadora `unknown`.

### Criterios de aceptación base

- [x] Lyria Cloud y cada panel Cloud View reciben contextos distintos.
- [x] Una tab normal se registra sin binding artificial.
- [x] El registro combina contexto lógico con `tabId/frameId/windowId` real.
- [x] Heartbeats son independientes del toggle de JSON Family.
- [x] `discarded` y `frozen` son visibles como estados separados.
- [x] La tab se protege al administrar el primer endpoint y se restaura al último release.
- [x] Reload/reinyección conserva `surfaceInstanceId`, `channelId` y conversación.
- [x] `relay-doctor` muestra contexto + estado del registro sin hacer clicks.
- [x] Un `endpointId` se resuelve a una única ruta física viva y nunca elige silenciosamente entre destinos ambiguos.
- [x] Un rebind conserva la identidad lógica y libera la protección de la tab física anterior.

### Verificación de la fundación (2026-07-17)

- Cloud View real registró ChatGPT `:izq` y Gemini `:der` con el mismo
  `surfaceInstanceId`, canales distintos, composer listo y estado `idle`.
- Lyria Cloud real registró ChatGPT como `surface:lyria-cloud`, pane `cloud`;
  dos shells simultáneos conservaron namespaces distintos.
- Varias instancias de Aurora coexistieron sin colisionar: cada shell produjo
  su propio namespace lógico aunque reutilizara `izq`/`der`.
- Una sesión normal de ChatGPT se registró como `surface:tab`, `frameId:0` y
  reflejó `generating` mientras el proveedor mantenía visible Stop.
- El contrato `test-endpoint-registry.mjs` cubre identidad lógica/física,
  subframes no conversacionales, protección reversible y estados
  `frozen`/`discarded`.
- El mismo contrato registra y resuelve cien sesiones concurrentes en estado
  `generating`, comprueba
  aislamiento lógico/físico, rechazo de rutas ambiguas, rebind durante reload y
  restauración de las cien protecciones al terminar. Puede repetirse con
  `SOL --relay-load N` sin consumir cuota de proveedores.
- `SOL --contracts` pasa JSON Family, Relay V2, Endpoint Registry y regresión
  visual, además del Relay Reinjector. `SOL --relay-doctor` ahora incluye tabs,
  iframes, contexto y snapshot durable central.
- Un hard reload remontó Lyria y conservó exactamente ambos `endpointId`
  previos (`surfaceInstanceId:cloud`) sin perder la conversación lógica.

### Reinyección segura

`background/relay-reinjector.js` recupera tabs existentes después de recargar
la extensión sin navegar ni detener el proveedor:

```text
ping courier
  ├─ vivo       → no tocar nada
  ├─ MAIN vivo  → reinyectar sólo provider-relay (ISOLATED)
  └─ MAIN falta → contrato + driver + core (MAIN), luego courier
```

El escaneo corre en paralelo. Tabs `frozen`/`discarded` quedan `deferred` y se
reintentan al activarse o descongelarse; una tab lenta tiene timeout propio y
no bloquea las demás. La prueba real reconectó una sesión normal de ChatGPT,
ignoró un subframe interno y dejó dormidas las tabs congeladas sin despertarlas.

### Bugs encontrados durante la validación

- `*.perplexity.ai` incluía `count.perplexity.ai` y convertía un iframe de
  analítica en falso agente. El manifest y el doctor ahora aceptan únicamente
  hosts conversacionales exactos.
- Gemini crea subframes internos como `/_/bscframe`. El registro ahora ignora
  todo frame embebido sin binding de Aurora y sin composer real; no protege la
  tab ni consume un endpoint.
- Tras recargar la extensión, tabs antiguas conservaban MAIN pero perdían el
  courier isolated. Cerrado con reinyección por ping, idempotente y sin reload.
- `tabs.sendMessage()` puede quedar pendiente contra un contexto invalidado.
  Cerrado con timeout corto por ping y presupuesto independiente por frame.
- El ping aceptaba cualquier courier vivo aunque perteneciera a un build
  anterior. La reinyección ahora compara versión, desmonta timer, observer y
  listener del courier viejo, e instala el nuevo sin duplicar capturadores.
- Un endpoint que migraba a otra tab/frame conservaba la protección
  `autoDiscardable:false` de su ruta anterior. El rebind ahora restaura esa tab
  apenas la identidad lógica adopta su nueva ruta física.
- `--full-reload` observaba sólo el primer target de Aurora y podía declarar
  falso timeout aunque el iframe cache-busted ya estuviera montado. Ahora
  compara el conjunto completo de IDs/URLs antes y después del reload.

### Prueba de choque de enrutamiento (2026-07-17)

- `SOL --relay-load 100` invocó cien heartbeats en paralelo, mantuvo cien
  endpoints simultáneamente en `generating` y resolvió sus cien rutas en
  paralelo sin colisiones.
- Una consulta deliberadamente ambigua a los cien agentes fue rechazada; el
  registro exige `endpointId` en vez de escoger silenciosamente otra IA.
- El rebind de un agente conservó exactamente un endpoint, cambió su ruta y
  restauró la tab anterior. La liberación paralela final dejó cero protecciones
  anti-discard huérfanas.
- En Helium real, la reinyección dejó vivos con build
  `2026-07-17.2-endpoint-routing` a ChatGPT normal, Gemini, Perplexity y dos
  Lyria Cloud; ignoró el subframe interno de Gemini y mantuvo las tabs
  congeladas como `deferred_frozen`, sin despertarlas ni detener generaciones.

---

## 16D. Cloud Tool Boundary — Retiro definitivo del ejecutor legacy

**Estado:** 🟢 Completada y validada (2026-07-17)
**Dependencias:** JSON Family (16A), Relay V2 (16B), Endpoint Registry (16C)

### Regla canónica

```text
Una tool elegida por un LLM Cloud → siempre JSON Family
Una acción explícita de UI humana → endpoint semántico específico
```

No existe un dispatcher HTTP genérico alternativo:

- eliminado `POST /pi/cloud-tool` y su recovery;
- eliminado `POST /tools/providers/pi/run`;
- eliminados `src/pi/cloud_tools.py` y `src/pi/cloud_executor.py`;
- eliminado el cliente frontend `executeCloudTool()`;
- eliminado `cloud_tool_journal`: `json_family_runs` es la única autoridad de
  ejecución/deduplicación y `cloud_agent_turns` conserva sólo el diálogo;
- Lyria Cloud y Duo permiten hasta `MAX_ITER=100` para trabajos agentic largos;
  Stop, deduplicación y cortacircuitos de formato siguen activos.

### Artefactos humanos

Canvas y el visor HTML necesitan leer un archivo cuando el usuario pulsa
“Abrir”. Esa acción no interpreta texto de un modelo y ahora usa exclusivamente:

```http
POST /artifacts/read
{"path":"/ruta/al/artefacto.html"}
```

El endpoint ofrece únicamente `read` mediante la factory oficial de Pi. No
acepta nombre de tool, no ejecuta efectos y no puede convertirse en un bypass
genérico de JSON Family.

### Contrato que Aurora no puede romper

`tests/test-cloud-boundaries.mjs` falla si código activo vuelve a introducir:

- `/pi/cloud-tool` o `/tools/providers/pi/run`;
- módulos o clientes legacy;
- un loop Cloud distinto de cien iteraciones;
- Lyria Cloud o Duo sin `processJSONFamily()`;
- lectura de artefactos por una ruta genérica.

### Verificación real

- Schema 12: `cloud_tool_journal=0`, `json_family_runs=1`,
  `cloud_agent_turns=1`.
- `/artifacts/read` abrió `docs/README.md` correctamente.
- `/pi/cloud-tool` respondió HTTP 404.
- Una solicitud `read` equivalente enviada a `/json-family/process` produjo
  `kind:tool_result` y resultado real de la factory oficial de Pi.
- Las seis suites de `SOL --contracts` pasan.

---

## 17. Cloud Tool Primer `@@` — Catálogo dinámico y cebado de endpoints

**Estado:** 🟡 Implementación avanzada; falta endurecimiento y pruebas
**Dependencias:** JSON Family (16A), Relay V2 (16B)
**Dependencia para inyección dirigida:** Surface Context + Endpoint Registry (16C)
**Componentes principales:**

- `ui/components/shared/cloud-tool-primer.js`
- `ui/components/shared/pi-tool-catalog.js`
- `ui/components/footer/acciones-modulo.js`
- `ui/modules/lyra/scripts/chat/cloud.js`
- `ui/modules/llmcloud/scripts/cloud-duo.js`
- `src/pi/router.py`
- `src/pi_tools/provider.py`
- `src/pi_tools/pi-tool-host.mjs`

### Objetivo

Construir el primer que enseña a un LLM Cloud qué herramientas reales puede
solicitar y cuál es el protocolo exacto para hacerlo, usando como fuente de
verdad el catálogo vivo de la versión instalada de Pi.

El primer sólo informa al modelo. No detecta JSON, no ejecuta herramientas y no
controla iteraciones:

```text
Cloud Tool Primer  → enseña nombres, argumentos y protocolo
JSON Family        → detecta y valida tool calls
Pi Tool Provider   → ejecuta las factories oficiales de Pi
Relay              → transporta prompts, streaming y resultados
```

### Estado real del código

El flujo dinámico principal ya existe:

```text
Factories oficiales de Pi
  ↓
Pi Tool Host persistente
  ↓ catalog
GET /tools/providers/pi/catalog
  ↓
getPiToolCatalog()
  ↓
getCloudToolPrimer()
  ↓
portapapeles / Lyria Cloud / Duo
```

El host instancia directamente las factories públicas disponibles en el SDK:

```text
createReadTool
createBashTool
createEditTool
createWriteTool
createGrepTool
createFindTool
createLsTool
```

El catálogo publica para cada tool:

```text
name, label, description, parameters, executionMode
```

Por lo tanto, las definiciones de Pi ya no están hardcodeadas en el botón `@@`.

### Consumidores actuales

#### 1. Botón manual `@@`

Actualmente el botón:

```text
consulta el catálogo
→ construye el primer
→ lo copia al portapapeles
→ muestra un Toast
```

No escribe en el composer ni envía el mensaje automáticamente. Su descripción
real es **“Copiar instrucciones de Pi Tools al portapapeles”**.

Este comportamiento se conserva como opción segura para tabs normales y sitios
que no estén administrados por Aurora.

#### 2. Lyria Cloud

Cuando JSON Family está activo, Lyria Cloud antepone automáticamente el primer
al primer mensaje de cada hilo Cloud.

La marca de cebado es durable y combina:

```text
Set en memoria
+ localStorage
+ ajuste persistido en DB
+ clave derivada del hilo del proveedor
```

Las rutas con identificador de conversación, por ejemplo `/c/<id>`, `/g/<id>` o
`/share/<id>`, se ceban una sola vez. Un chat nuevo debe recibir un primer nuevo.

#### 3. Cloud Duo

Cada panel recibe una variante colaborativa del primer mediante:

```js
getCloudToolPrimer({ collaboration: true })
```

Esta variante añade `panel_send` como tool del cliente y se inyecta una vez por
panel/run.

### Separación obligatoria con JSON Family

La Épica 17 no debe absorber responsabilidades de 16A:

```text
@@ / Primer:
- publica tools y guidelines
- prepara al modelo para emitir JSON válido

JSON Family:
- detecta el bloque final
- valida nombres y argumentos
- ejecuta mediante el provider correcto
- devuelve resultados durables
```

JSON Family puede estar OFF sin impedir que `@@` copie el primer. Sin embargo,
los cebados automáticos de Lyria Cloud y Duo sólo deben ocurrir cuando JSON
Family esté activo, porque de lo contrario el modelo aprendería tools que Aurora
no procesará en ese flujo.

### Problemas pendientes detectados

#### A. El fallback exportado no participa en los flujos reales

`CLOUD_TOOL_PRIMER` existe como texto de emergencia, pero los consumidores usan
`getCloudToolPrimer()` directamente. Si el catálogo falla:

- `@@` muestra error;
- Lyria Cloud puede abortar antes de enviar;
- Duo puede abortar antes de iniciar.

Debe decidirse entre:

1. conectar un fallback real y explícitamente degradado; o
2. eliminar el export para no aparentar una recuperación inexistente.

Nunca se debe presentar un catálogo estático como si correspondiera a la versión
instalada de Pi.

#### B. La caché no detecta una actualización de Pi durante la sesión

`getPiToolCatalog()` conserva una Promise en memoria. El catálogo se renueva al
recargar Aurora, después de un error o mediante `{ refresh: true }`, pero no por
una actualización de Pi mientras la UI sigue abierta.

Se debe añadir una estrategia de invalidación, por ejemplo:

```text
TTL corto
+ versión/sdkPath/generation del provider
+ refresh manual
+ invalidación al reiniciar Pi Tool Host
```

#### C. El formatter simplifica demasiado el JSON Schema

El primer actual conserva nombre, requerido/opcional y tipo básico, pero puede
perder:

- descripción por propiedad;
- enum;
- límites numéricos;
- estructuras anidadas;
- defaults;
- `oneOf` / `anyOf`;
- restricciones adicionales.

El builder debe generar una representación compacta pero fiel. Para schemas
simples puede usar formato legible; para schemas complejos debe incluir JSON
Schema compacto sin inventar reglas.

#### D. Las tools de Aurora y del cliente aún son manuales

Actualmente siguen definidas en código:

```text
forge_submit
view_describe
view_invoke
panel_send
```

La dirección final es un catálogo compuesto:

```text
Pi Tool Catalog
+ Aurora Tool Registry
+ Client Tools de la superficie
→ Primer Builder
```

Cada superficie publica sólo las tools que realmente puede ejecutar.

#### E. No existen pruebas específicas de la Épica 17

Los tests actuales prueban importación de Pi y JSON Family, pero no cubren el
primer, el botón ni el cebado por hilo.

#### F. Inyección dirigida todavía no existe

El botón no debe buscar iframes genéricamente ni enviar mensajes a todos. La
inyección a un destino concreto depende de 16C.

Cuando Endpoint Registry esté disponible, `@@` podrá ofrecer destinos como:

```text
Copiar al portapapeles
Enviar a Lyria Cloud
Enviar a ChatGPT · tab 4
Enviar a Gemini · panel derecho
Enviar a endpoints seleccionados
```

Toda inyección dirigida debe usar `endpointId`, `channelId` y el binding de
Surface Context. Nunca debe depender sólo de `paneId` o de un selector global de
iframes.

### Diseño objetivo

#### Primer Builder

```js
getCloudToolPrimer({
  profile: 'coding',
  collaboration: false,
  clientTools: [],
  refresh: false,
})
```

Perfiles previstos:

```text
normal         protocolo mínimo
coding         tools de workspace y verificación
review-only    lectura y análisis sin mutaciones
collaboration  coordinación entre endpoints
agent-run      control durable, evidencia y condición terminal
```

Un perfil no concede permisos. Sólo describe las tools que el runtime ya decidió
exponer para ese endpoint/run.

#### Catálogo compuesto

Cada definición normalizada debería contener:

```js
{
  name,
  label,
  description,
  parameters,
  executionMode,
  provider,
  effectClass,
  capabilities
}
```

El primer debe construirse desde ese catálogo normalizado y no desde strings
independientes repartidos por la UI.

### Alcance de esta épica

Incluye:

- catálogo dinámico oficial de Pi;
- builder del primer;
- copia manual con `@@`;
- cebado automático por hilo en Lyria Cloud;
- variante colaborativa de Duo;
- fallback explícito;
- invalidación de caché;
- serialización fiel de schemas;
- tests unitarios, contractuales y E2E;
- integración futura con Endpoint Registry para inyección dirigida.

No incluye:

- ejecución de tools;
- parser de JSON Family;
- loop agéntico completo;
- verificación terminal de objetivos;
- Arena Controller;
- sustitución de `AgentSession` o del historial visual de Aurora.

### Plan incremental

#### 17A — Catálogo vivo de Pi

**Estado:** ✅ Implementado

- factories oficiales instanciadas por `pi-tool-host.mjs`;
- provider persistente Python ↔ Node/Bun;
- endpoint `GET /tools/providers/pi/catalog`;
- nombre, descripción y schema obtenidos de la versión instalada.

#### 17B — Cliente y Primer Builder dinámico

**Estado:** ✅ Implementado parcialmente

- `getPiToolCatalog()` con caché;
- `getCloudToolPrimer()` generado desde el catálogo;
- tools de Aurora añadidas al primer;
- variante `collaboration` para Duo.

Pendiente: schema fiel, catálogo compuesto e invalidación/versionado.

#### 17C — Botón manual `@@`

**Estado:** ✅ Implementado

- obtiene el primer dinámico;
- copia al portapapeles;
- informa éxito o error mediante Toast.

Debe conservarse como fallback manual aun cuando exista inyección dirigida.

#### 17D — Cebado automático por contexto

**Estado:** ✅ Implementado parcialmente

- Lyria Cloud: una vez por hilo durable;
- Duo: una vez por panel/run;
- desactivado cuando JSON Family está OFF.

Pendiente: tests del chat recién creado antes de que aparezca un ID de hilo y
migración futura a identidad de Endpoint Registry.

#### 17E — Robustez del catálogo

**Estado:** ⬜ Pendiente

- invalidación por versión/generación o TTL;
- refresh explícito desde UI/diagnóstico;
- fallback funcional y claramente degradado;
- error distinguible entre servidor caído, Pi ausente y schema inválido.

#### 17F — Schema y guidelines fieles

**Estado:** ⬜ Pendiente

- conservar enum, nested objects, arrays y restricciones;
- añadir guidelines por tool/perfil sin copiar el system prompt completo de Pi;
- no importar módulos privados adicionales de `dist/` para obtener texto interno;
- usar exports públicos o encapsular toda compatibilidad de Pi en un único adapter.

#### 17G — Tool Registry compuesto

**Estado:** ⬜ Pendiente

- registrar tools Aurora y client-side con definitions reales;
- `panel_send` sólo en Duo;
- futuro `agent_send` sólo en Arena;
- filtrar tools por permisos y capacidades del endpoint/run.

#### 17H — Inyección dirigida

**Estado:** ⏳ Bloqueado por 16C

- selector de endpoint;
- envío mediante identidad estable;
- confirmación de entrega/cebado;
- evitar doble cebado después de reload;
- permitir copiar sin enviar.

#### 17I — Tests

**Estado:** ⬜ Pendiente

Crear pruebas para:

```text
primer generado desde catálogo simulado
required/opcional y schemas complejos
tools Aurora/client por perfil
caché, refresh e invalidación
fallo y recuperación del provider
botón @@ copia el texto esperado
Lyria no repite primer en el mismo hilo
chat nuevo sí recibe primer
Duo agrega panel_send una sola vez
JSON Family OFF evita cebado automático
catálogo real y primer conservan las siete tools oficiales
```

### Criterios de aceptación

- [x] Las definitions de Pi provienen del catálogo vivo, no de una copia manual.
- [x] El botón `@@` copia el primer generado dinámicamente.
- [x] Lyria Cloud antepone el primer cuando JSON Family está activo.
- [x] Un hilo conocido no vuelve a cebarse tras recargar Aurora.
- [x] Duo recibe la variante con `panel_send`.
- [ ] El formatter representa fielmente todos los schemas soportados por Pi.
- [ ] La caché se invalida al cambiar la versión/generación del provider.
- [ ] El fallback real permite copiar o continuar de forma explícitamente degradada.
- [ ] Las tools Aurora/client-side proceden de un registry y se filtran por contexto.
- [ ] Existen tests unitarios y contractuales del builder.
- [ ] Existen pruebas E2E de `@@`, Lyria Cloud y Duo.
- [ ] La inyección dirigida usa Endpoint Registry y confirma qué endpoint fue cebado.
- [ ] `relay-doctor` puede mostrar versión del catálogo, hash del primer y estado de cebado.

### Condición de cierre

La épica se considera completa cuando el mismo catálogo real produce un primer
fiel y verificable en todos sus consumidores, los fallos están cubiertos, no hay
definiciones duplicadas y cualquier envío automático está direccionado mediante
una identidad de endpoint estable.

La autonomía completa y la verificación de objetivos deben planificarse en una
épica posterior (`CloudAgentRun`), no incorporarse silenciosamente al botón
`@@`.

---

## 18. Renombrar `lyra` → `lyria` en todo el codebase

**Estado:** 🟡 En planificación
**Alcance:** Todo el proyecto Aurora

### 🎯 Objetivo

Renombrar todos los archivos, directorios, variables, funciones, clases, imports y referencias que contienen `lyra` a `lyria`, manteniendo el mismo funcionamiento y sin romper nada.

### 📖 Historia de Usuario
> **Como** usuario de Aurora, **quiero** que todo lo que diga "lyra" diga "lyria" en el codebase, **para** que el proyecto refleje el nombre correcto de mi compañera y no haya inconsistencias.

### 🎯 Alcance

- Renombrar archivos y directorios: `lyra/` → `lyria/`
- Renombrar variables, funciones, clases: `lyra` → `lyria`
- Actualizar imports y referencias
- Mantener el mismo funcionamiento
- No romper dependencias ni builds
- Actualizar documentación si es necesario

### ⚠️ Consideraciones

- Verificar que no haya conflictos con nombres propios (ej: "Lyria" como nombre propio vs "lyra" como prefijo)
- Actualizar tests si los hay
- Verificar que los scripts de build/start no dependan de nombres en mayúsculas/minúsculas
- Hacer backup antes de empezar

### 📋 Pasos de implementación

1. **Backup completo** del proyecto
2. **Buscar todas las referencias** de `lyra` en el codebase
3. **Renombrar archivos y directorios** (`lyra/` → `lyria/`)
4. **Renombrar variables, funciones, clases** en todo el código
5. **Actualizar imports y referencias** en todos los archivos
6. **Verificar que todo funcione** (tests, build, runtime)
7. **Actualizar documentación** si es necesario

---

## 19. Lyria Chat como frontend web nativo de Pi

**Estado:** 🟢 Núcleo Pi-native implementado y verificado; cierre visual pendiente
**Dependencias:** Pi instalado + Bun (o Node compatible), RPC oficial de Pi
**No depende de:** JSON Family para el runtime local; JSON Family pertenece al
camino de LLMs cloud de las Épicas 16A/16B.

### Decisión arquitectónica

Lyria local ya usa `pi --mode rpc`: Pi es autoridad del modelo, tools, sesión,
contexto, compaction, retry, steering y follow-up. Aurora no importará la TUI,
ANSI ni los componentes terminales de Pi. Adoptará el modelo semántico que los
alimenta y conservará su propia interfaz Preact.

```text
Pi AgentSession
  ↓ AgentSessionEvent íntegro por RPC/JSONL
Pi Runtime Adapter (Python, mínimo y versionado)
  ↓ evento Pi sin perder IDs/content/details
Aurora Turn Reducer
  ↓ turno web estructurado
Aurora Renderer (Preact)
```

Regla central:

> Pi decide qué ocurrió. Aurora decide cómo se representa en web.

Una tool nunca debe aparecer como una burbuja independiente. Es un bloque del
turno assistant que la originó y se actualiza in-place mediante el
`toolCallId` oficial de Pi.

```text
Assistant turn
├─ ThinkingBlock
├─ TextBlock
├─ ToolBlock read · call_abc
│  ├─ args
│  ├─ running / partialResult
│  ├─ result.content[] / details
│  └─ success | error
└─ TextBlock posterior
```

### Hallazgo confirmado en el código real

Pi ya emite `message_start/update/end`, `tool_execution_start/update/end`,
`agent_start/end`, colas, compaction y retries. La pérdida ocurre en la capa de
adaptación:

1. `src/pi/bridge.py` aplana eventos ricos a `token`, `tool_call`,
   `tool_progress` y `tool_result`.
2. En ese paso se pierden `toolCallId`, `message.content[]`, `partialResult`,
   `result.content[]`, imágenes y `details`.
3. `lyra-ws.js` reduce otra vez a callbacks por nombre.
4. `lyra.js` inventa un ID y empareja resultados por nombre/orden.
5. Para persistir, serializa a `[tool_call]`; al cargar, Aurora parsea el string
   e intenta reconstruir lo que Pi ya había entregado estructurado.

Esto falla con dos tools del mismo nombre, ejecución paralela, updates
intercalados, retry y recuperación tras reload.

### Límites importantes

- `cloud.js` y JSON Family no forman parte del runtime local de Lyria.
- `convertToLlm()` prepara contexto para el modelo; no reemplaza el renderer.
- Pi `SessionManager` es autoridad de contexto/sesión agentic; Aurora SQLite
  sigue siendo índice de producto, favoritos y metadatos de UI.
- `mensajes.js` e `historial.js` no se borran: se elimina progresivamente sólo
  su reconstrucción textual como fuente primaria para Lyria local.
- Los imports públicos directos de Pi pueden evaluarse en un host Bun futuro;
  no se importan paquetes Node desde el navegador ni rutas privadas `dist/`.

### Contrato objetivo

El bridge entrega un envelope estable sin reinterpretar el evento:

```json
{
  "type": "pi_event",
  "protocolVersion": 1,
  "runtime": "pi-rpc",
  "event": {
    "type": "tool_execution_start",
    "toolCallId": "call_abc",
    "toolName": "read",
    "args": {"path":"/archivo"}
  }
}
```

Durante la migración se mantiene el protocolo legacy para otros consumidores,
pero Lyria usa sólo `pi_event` cuando el handler nativo está disponible.

### Subépicas

#### 19A — Contrato completo AgentSessionEvent/RPC

- [x] Envelope `pi_event` versionado y allowlist de eventos.
- [x] Preservar evento y mensaje acumulado sin aplanar contenido.
- [x] Contrato automatizado que prohíba perder `toolCallId`.

#### 19B — Reducer de turnos estructurados

- [x] Deltas para respuesta inmediata.
- [x] Snapshot `message.content[]` para reconciliación autoritativa.
- [x] `message_end` como snapshot final.
- [x] Thinking/text/tool en orden cronológico real.

#### 19C — Tools actualizadas in-place

- [x] Start crea bloque por `toolCallId`.
- [x] Update conserva `partialResult` estructurado.
- [x] End conserva `result.content[]`, `details`, imágenes e `isError`.
- [x] Dos tools iguales/paralelas nunca se cruzan.

#### Validación real de 19A–19C (2026-07-17)

- Suite `test-pi-turn-reducer.mjs`: snapshots, deltas, dos `read` paralelos,
  resultados parciales/finales, error independiente, imagen y replay fuera de
  orden.
- E2E desde el chatbox nativo con `SOL-debug-tools --lyra-local-send`: 53
  eventos `pi_event`, protocolo v1, runtime `pi-rpc` y ciclo completo
  `agent_start → message → tool → message → agent_end`.
- Tool real `read`: start/end correlacionados por
  `call-461c2504-c37c-4919-8354-cad74f62cad1`, `isError=false` y
  `result.content=[text]`.
- Verificación visual: Thinking, tarjeta `read`, resultado y texto posterior se
  dibujan en orden dentro de una única respuesta Lyria; Cloud permaneció
  cerrado y el botón Stop local estuvo activo durante la ejecución.

#### 19D — Persistencia y recuperación

- [x] Persistir turno estructurado/versionado en Aurora DB (`estructura_json`,
  migración 13) manteniendo `contenido` limpio para FTS/voz/exportación.
- [x] Recuperar tools y resultados después de reload.
- [x] Leer mensajes legacy `[tool_call]` sin producirlos para turnos Pi v1
  nuevos; los tags quedan sólo como fallback para backend legacy.

Validación real: el mensaje `PI_CLEAN_PERSIST_OK` quedó en SQLite como texto
limpio, sin `[thinking]`/`[tool_*]`, junto a un árbol v1
`thinking → tool → thinking → text`. Después de hard reload, Lyria recuperó la
misma tool `read`, estado `success` y su `toolCallId` oficial exclusivamente
desde `estructura_json`.

#### 19E — Pi como autoridad de sesión

- [x] Auditar `get_state`, `get_messages`, `get_entries`, `get_tree`,
  `get_session_stats` y `switch_session`.
- [x] Clasificar comandos: RPC nativo, adaptación web, Aurora propio o
  emulación frágil a eliminar.
- [x] Mostrar versión/runtime/capacidades y degradación clara si Pi falta.

Clasificación resultante:

| Categoría | Comandos / responsabilidades |
|---|---|
| RPC Pi directo | `/new`, `/compact`, `/model`, thinking y colas de `/settings`, `/name`, `/session`, `/tree`, `/fork`, `/clone`, `/export` |
| RPC + adaptación web | `/resume` (sidebar + `switch_session`), `/copy` (texto Pi + clipboard web), `/import`, `/share`, favoritos de `/scoped-models` |
| Producto Aurora | `/trust`, `/hotkeys`, `/changelog`; metadata de chats, favoritos y UI en SQLite/JSON |
| Adaptación host explícita | `/reload` y `/quit` actúan sobre el proceso Pi compartido con confirmación; `/login` y `/logout` usan el almacén oficial `~/.pi/agent/auth.json` |

Se eliminó del transporte local el `history` de SQLite y el catálogo de
tools del navegador: ninguno vuelve a entrar al contexto del modelo. La
regeneración ya no repite un prompt sobre la memoria completa. Conserva el
`userEntryId` oficial del turno y llama `fork` antes de reenviar el texto.

Validación real (2026-07-17):

- `SOL-debug-tools --pi-session-doctor` ejercitó los seis comandos de lectura
  y cambio de sesión sobre Pi 0.80.6. `switch_session` conservó `sessionId` y
  `leafId`; 16 mensajes y 18 entries siguieron disponibles sin imprimir su
  contenido.
- `--lyra-local-send` completó el ciclo por el chatbox nativo con envelopes
  `pi_event` v1, Stop real y Cloud cerrado.
- `--lyra-regenerate-last` detectó primero el bug `Invalid entry ID for
  forking`: Aurora pasaba el leaf anterior, pero Pi exige el entry del mensaje
  user. Corregido el contrato, regenerar creó una sesión JSONL distinta,
  conservó el contexto previo y generó nuevos IDs de user/assistant.
- La cabecera de Lyria muestra `Pi 0.80.6 · RPC v1`, capacidades y sesión;
  si el proceso no arranca conserva un estado rojo `Pi no disponible` incluso
  cuando no existe `session_id`.
- Suite `test-pi-session-authority.mjs` prohíbe reintroducir `history/tools`,
  fork por un ID no-user, RPC dentro del callback `agent_end` o degradación
  invisible.

#### 19E.1 — Tool Forge como catálogo nativo de Pi

- [x] Convertir nombres canónicos `forge.*` a aliases provider-safe `forge_*`.
- [x] Registrar cada manifest activo con su propio JSON Schema mediante
  `pi.registerTool()`, no como argumentos de un dispatcher genérico.
- [x] Sincronizar en `session_start` y `before_agent_start`, sin `/reload` ni
  reinicio del servidor para cambios posteriores de activación.
- [x] Re-registrar upgrades sobre el mismo alias y retirar del conjunto activo
  las capacidades desactivadas o sustituidas por rollback.
- [x] Preservar `AbortSignal`, updates parciales, `content[]`, versión, riesgo,
  permisos y resultado backend en `details`.
- [x] Exigir `ctx.ui.confirm()` y luego `approve-run` con `RUN forge.nombre`
  para manifests sensibles; el wrapper de compatibilidad no crea un bypass.

Validación: `test-forge-pi-dynamic.mjs` ejercita registro inicial, hot-sync antes
del turno, ejecución directa, aprobación humana, upgrade sobre el mismo alias,
desactivación y `/forge-refresh`. Las suites backend de Tool Forge y Forge Build
siguen pasando junto a los contratos Pi de reducer y autoridad de sesión.

#### 19F — Estados operativos estructurados

**Estado:** 🟡 Pendiente para cerrar la épica

Pi ya emite los eventos necesarios, pero retry, compaction y queue todavía no
están completamente integrados al modelo visual estructurado.

##### Retry

Usar `auto_retry_start`, `auto_retry_end` y `agent_end.willRetry` como un estado
propio del runtime:

```js
{
  type: 'retry',
  status: 'waiting | running | success | failed',
  attempt,
  maxAttempts,
  delay,
  error
}
```

No insertar `🔄 Reintentando…` dentro del texto del assistant.

##### Compaction

Representar `compaction_start` y `compaction_end` con:

```text
reason
aborted
error
tokensBefore
tokensAfter
summary
```

La compactación es estado del runtime, no una respuesta del modelo.

##### Queue

Representar `queue_update.steering` y `queue_update.followUp` como una cola
estructurada del composer o del turno, incluyendo el modo
`one-at-a-time | all`.

Pendiente:

- [ ] Retry como estado visual propio.
- [ ] Compaction como estado visual propio y recuperable.
- [ ] Steering/follow-up como cola estructurada.
- [ ] Recuperación `interrupted/cancelled` después de reload.
- [ ] Tests unitarios y E2E para retry, compaction y queue.

#### 19G — Host AgentSession directo, sólo experimental

Comparar un host Bun que importe la API pública de Pi frente al RPC actual para
múltiples sesiones o APIs no expuestas. No sustituye RPC hasta demostrar mejor
compatibilidad, aislamiento y recuperación.

### Criterios de cierre

- [x] Durante el stream, Lyria renderiza el turno desde eventos Pi, no desde tags string.
- [x] Los IDs de tool son los oficiales de Pi; identidad de mensaje usa el dato
  opaco disponible (`responseId`/timestamp) cuando Pi no expone un ID general.
- [x] Resultados parciales/finales actualizan la misma tarjeta.
- [x] Imágenes, `content[]`, `details` y errores sobreviven bridge → reducer →
  persistencia estructurada y reload.
- [ ] Retry tiene estado visual estructurado, no texto artificial.
- [ ] Compaction tiene estado visual estructurado y recuperable.
- [ ] Steering/follow-up tienen estado de cola estructurado.
- [ ] Existen pruebas E2E de retry, compaction y queue.
- [x] Persistencia/reload reconstruyen el mismo árbol visual.
- [x] Pi es autoridad agentic; Aurora conserva experiencia y metadata web.

<details>
<summary>Hipótesis original descartada (se conserva como registro histórico)</summary>

La propuesta original asumía erróneamente que Lyria ejecutaba su propio loop y
que `cloud.js`, `mensajes.js` e `historial.js` debían reemplazarse con imports
directos de Pi. Los tests de imports siguen siendo evidencia útil de viabilidad
en Bun, pero no justifican mezclar runtime local, Cloud/JSON Family y UI web.

### 🔍 Duplicación identificada

| Función | Aurora (reinventada) | Pi (ya existe) |
|---|---|---|
| **Factory functions de tools** | Hardcodeadas en `cloud.js`: `TOOLS_PI = { read, bash, edit, write }` | `createBashTool`, `createReadTool`, etc. en `sdk.js` |
| **Tool definitions** | `TOOLS_PI` hardcodeado + `validarToolCall()` custom | `createToolDefinition()` en `tools/index.js` |
| **Compaction** | No implementada o custom | `compact()`, `shouldCompact()`, etc. en `compaction/index.js` |
| **Message formatting** | `normalizeMensaje()`, `parsearMensajeRico()` en `mensajes.js` | `convertToLlm()` en `messages.js` |
| **Session Manager** | `historial.js` + `mensajes.js` (custom) | `SessionManager`, `AgentSession` en `sdk.js` |
| **Tool result formatting** | `formatearResultado()` en `cloud.js` | `formatReadResult()`, `formatEditResult()` en tools de Pi |

### 📁 Archivos que reimplementan lógica de Pi

**`cloud.js`** (760+ líneas):
- `parsearToolCalls()` → Reimplementa detección de JSON
- `validarToolCall()` → Validación custom de tools
- `formatearResultado()` → Formateo custom de resultados
- `TOOLS_PI` → Hardcodeo de tool definitions

**`mensajes.js`**:
- `normalizeMensaje()` → Reimplementa formato de mensajes
- `parsearMensajeRico()` → Parsing custom de contenido
- `cargarMensajes()`, `guardarMensaje()` → CRUD custom

**`historial.js`**:
- `cargarChats()`, `crearChat()`, `eliminarChat()` → Session management custom
- `fmtFecha()` → Formateo de fechas custom

**`lyra-ws.js`**:
- `sendToLyra()` → Wrapper custom de WebSocket
- `_dispatch()` → Router custom de mensajes
- Reimplementa handlers para `token`, `tool_call`, `tool_result`, etc.

### 💡 Solución propuesta: Importar de Pi, no reinventar

```javascript
// ✅ CORRECTO: Importar de Pi
import { createBashTool, createReadTool, createEditTool, createWriteTool }
  from "@earendil-works/pi-coding-agent/dist/core/sdk.js";
import { createToolDefinition, allToolNames }
  from "@earendil-works/pi-coding-agent/dist/core/tools/index.js";
import { compact, shouldCompact, generateSummary }
  from "@earendil-works/pi-coding-agent/dist/core/compaction/index.js";
import { convertToLlm }
  from "@earendil-works/pi-coding-agent/dist/core/messages.js";
import { AgentSession, SessionManager }
  from "@earendil-works/pi-coding-agent/dist/index.js";

// ❌ INCORRECTO: Reinventar todo desde cero
// (como está ahora en cloud.js, mensajes.js, historial.js)
```

### ✅ Validación Experimental (Test Real)

**Script de prueba:** `/media/almacen/deml/Downloads/core_instruction/aurora/tests/lyria-test/import-pi-tools/`

**Resultado:** `32/32 tests PASSED` — Todas las funcionalidades se pueden importar de Pi.

| Test | Archivos | Resultado |
|---|---|---|
| **Tool Execution** | `test-import-pi-tools.mjs` | ✅ 7/7 PASSED |
| **Tool Definitions** | `test-tool-definitions.mjs` | ✅ 6/6 PASSED |
| **Compaction** | `test-compaction.mjs` | ✅ 7/7 PASSED |
| **Message Formatting** | `test-message-formatting.mjs` | ✅ 5/5 PASSED |
| **Session Manager** | `test-session-manager.mjs` | ✅ 7/7 PASSED |

**Conclusión:** Todas las funcionalidades que Aurora reimplementa desde cero existen en Pi y se pueden importar directamente.

### 🎯 Beneficios de importar de Pi

1. ✅ **No hay necesidad de reinventar la rueda** — Pi ya tiene todo resuelto
2. ✅ **Aurora se beneficia automáticamente** de las actualizaciones de Pi
3. ✅ **Menos código que mantener** — Elimina 760+ líneas en cloud.js
4. ✅ **Menos bugs por duplicación** — Un solo fuente de verdad (Pi)
5. ✅ **Comportamiento consistente** — Aurora y Pi usan la misma lógica

### 📋 Historias de Usuario

#### HU-1: Importar factory functions de tools
> **Como** usuario de Aurora, **quiero** que las tools se importen de Pi (`createBashTool`, `createReadTool`, etc.) en lugar de hardcodearlas, **para** que Aurora se beneficie automáticamente de las actualizaciones de Pi.

**Criterios de aceptación:**
- [ ] `cloud.js` importa `createBashTool`, `createReadTool`, `createEditTool`, `createWriteTool` de Pi
- [ ] Elimina `TOOLS_PI` hardcodeado
- [ ] Elimina `validarToolCall()` custom (usa las definitions de Pi)
- [ ] Elimina `formatearResultado()` custom (usa `formatReadResult`, `formatEditResult` de Pi)

#### HU-2: Importar funciones de compaction
> **Como** usuario de Aurora, **quiero** que la compaction se importe de Pi (`compact`, `shouldCompact`, etc.) en lugar de reimplementarla, **para** que Aurora use la misma lógica de compaction que Pi.

**Criterios de aceptación:**
- [ ] Aurora importa `compact`, `shouldCompact`, `generateSummary` de Pi
- [ ] Elimina lógica de compaction custom
- [ ] Comportamiento idéntico al de Pi

#### HU-3: Importar message formatting
> **Como** usuario de Aurora, **quiero** que el formateo de mensajes se importe de Pi (`convertToLlm`) en lugar de reimplementarlo, **para** que Aurora use el mismo formato de mensajes que Pi.

**Criterios de aceptación:**
- [ ] Aurora importa `convertToLlm` de Pi
- [ ] Elimina `normalizeMensaje()`, `parsearMensajeRico()` custom
- [ ] Mensajes formateados correctamente

#### HU-4: Importar Session Manager
> **Como** usuario de Aurora, **quiero** que el session manager se importe de Pi (`AgentSession`, `SessionManager`) en lugar de reimplementarlo, **para** que Aurora use la misma gestión de sesiones que Pi.

**Criterios de aceptación:**
- [ ] Aurora importa `AgentSession`, `SessionManager` de Pi
- [ ] Elimina `historial.js` custom (usa SessionManager de Pi)
- [ ] Elimina `mensajes.js` custom (usa AgentSession de Pi)
- [ ] Sesiones gestionadas correctamente

### 📋 Archivos clave (código base de Pi)

**Factory functions (SDK):**
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js` → Exporta `createBashTool`, `createReadTool`, `createEditTool`, `createWriteTool`, `AgentSession`, `SessionManager`

**Tool definitions:**
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/index.js` → Exporta `createToolDefinition`, `allToolNames`

**Compaction:**
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/index.js` → Exporta `compact`, `shouldCompact`, `generateSummary`, `estimateTokens`, `calculateContextTokens`

**Message formatting:**
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/messages.js` → Exporta `convertToLlm`

**Tool result formatting:**
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/read.js` → `formatReadResult()` (línea 100)
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/edit.js` → `formatEditResult()` (línea 100)
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js` → Resultado en línea 323
- `/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/write.js` → Resultado en línea 162

</details>
