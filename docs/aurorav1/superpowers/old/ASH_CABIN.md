# ASH_CABIN.md

Manual de la cabina Ash/AIHub y el flight recorder.
Fecha: 2026-05-25.

## Objetivo

La cabina no es el cerebro de Ash. Es el panel de control/debug/supervisión para humanos.

La IA interactúa principalmente por protocolos `@@`.
El humano gobierna desde la cabina.

## Principios

- La cabina debe explicar qué vio Ash.
- La cabina debe explicar qué ignoró Ash y por qué.
- La cabina debe explicar qué ejecutó Ash.
- La cabina debe mostrar qué ve `@@browser` antes de permitir acciones de control.

## Browser Cabin

El sidepanel incluye una sección `Browser Cabin` para observar y controlar una tab gestionada.

Muestra:

- URL, título y hostname.
- Viewport, scroll y DPR.
- Elemento enfocado.
- Elementos interactivos visibles con `el_N`, rol, nombre, selector, bbox, enabled/focused.

Uso previsto:

1. Pulsar `Observar` o ejecutar `@@browser action=dom/interactive`.
2. Revisar mapa de elementos.
3. Ejecutar acciones por id de elemento mapeado, no por selector inventado.

Regla actual:

- `Browser Cabin` puede navegar, mapear, capturar, hacer click, escribir y scrollear en la tab gestionada.
- Las acciones visuales viven en ASH/Browser Cabin, no en BraveTools/CDP.

### Navegador en sidepanel

`Browser Cabin` usa dos modos:

1. **Tab gestionada + espejo** — modo principal.
2. **Iframe directo** — pausado/experimental.

Decisión:

- El control ocurre en una tab normal gestionada por la extensión.
- El sidepanel muestra un espejo/stream de esa tab mediante capturas.
- El espejo evita CSP, `frame-ancestors` y publicidad embebida propia del iframe directo.
- El iframe directo solo sirve para sitios que permiten `frame-ancestors`.
- ChatGPT debe recibir contexto compacto, no DOM crudo ni selectores largos.

Limitación:

- Sitios como Amazon pueden bloquear o limitar iframe con `X-Frame-Options`/CSP.
- Para Amazon usar `Mirror iframe`: captura visual + overlay + mapa textual compacto.

Formato compacto recomendado para ChatGPT:

```
page "Amazon.com..." "https://www.amazon.com/"
viewport 1661x1256 scroll=0,0
focus role="body" name="..."
elements total=49 shown=18 truncated=true
el_2 searchbox "Search Amazon" enabled box=357,11,835,38
el_3 button "Go" enabled box=1193,10,45,40
```

No enviar por defecto:

- Selectores CSS largos.
- Texto completo del DOM.
- Elementos sin nombre o con cajas invisibles/minúsculas.
- Más de 20-30 elementos salvo `debug=true`.

Estado validado:

- Amazon/YouTube no son fiables como iframe directo.
- Amazon/YouTube funcionan como tab gestionada + espejo dentro del sidepanel.
- La imagen puede adjuntarse a ChatGPT web, pero en la prueba el assistant devolvió respuesta vacía; fallback operativo: enviar contexto compacto textual.

Acciones nuevas:

- `web/launch path="sandbox/proyecto/index.html"` abre un HTML local de la extensión en la tab gestionada.
- `browser/text selector="body"` lee texto desde la tab gestionada.
- `browser/transcript` extrae segmentos/timestamps desde la tab gestionada si la transcripción está abierta.
- `dom/text` se enruta a `browser/text` para no leer accidentalmente ChatGPT.
- La tab gestionada debe vivir siempre en una ventana Chrome `normal`; no usar `popup` ni subventanas.

Herramientas de control/lectura:

- `web/launch` convierte rutas seguras (`sandbox/**`, `debug-artifacts/**`, `general/**`) a `chrome-extension://...` y abre la página.
- `browser/map` crea un mapa compacto y dibuja overlay visual numerado en la tab gestionada.
- Los números del overlay coinciden con `browser/click el=N` y `browser/fill el=N`.
- Las zonas con scroll aparecen como `SCROLL` con badge naranja y metadata `scroll=...`.
- `browser/clear-map` limpia el overlay y el mapa guardado.
- `browser/scroll dy=N` scrollea página o el primer contenedor scrollable visible.
- `browser/scroll el=N dy=N` scrollea el elemento mapeado.
- `browser/wheel x=N y=N dy=N` emula rueda sobre coordenada visible y busca el contenedor scrollable ancestro.
- `browser/scroll selector="..." dy=N` scrollea una sección concreta.
- `browser/click-point x=N y=N` hace click por coordenada visible.
- `browser/region-text x=N y=N w=N h=N` lee texto dentro de una región visible.

Flujo recomendado para proyectos HTML/CSS/JS:

```
@@nexus
file/write sandbox/mi-web/index.html ...
@@end

@@nexus
file/write sandbox/mi-web/css/style.css ...
@@end

@@nexus
file/write sandbox/mi-web/js/app.js ...
@@end

@@br
launch sandbox/mi-web/index.html
@@end

@@br
map
@@end

@@br
click 1
@@end
```

`@@nexus` crea y valida archivos. `@@br` abre, observa y manipula la página. BraveTools/CDP queda solo como herramienta temporal de debug durante desarrollo.
- La cabina debe mostrar policy real del isolated world.
- La cabina debe evitar depender de sessionStorage del main world.
- La cabina debe servir para distinguir:
  - bug de detector
  - bug de policy
  - bug de Nexus
  - error del comando

---

## Paneles v1

### Status

Muestra el estado actual del sistema:

| Campo | Descripción |
|---|---|
| Nexus online/offline | Resultado del último ping a `http://127.0.0.1:7777/ping` |
| workspace | Ruta del workspace activo |
| autoloop.enabled | Si el watcher de bloques está activo |
| autoloop.running | Si hay una ejecución en curso |
| manualOnly | Bloquea autoejecución — solo Manual Run funciona |
| allowNexusAuto | Permite autoejecutar bloques `@@nexus` |
| maxBlocksPerMessage | Límite de bloques ejecutados por mensaje |
| lastDetectedId | Último id de bloque detectado por el watcher |
| lastExecutedId | Último id ejecutado con éxito |
| lastError | Último error registrado |

---

### Events / Flight Recorder

Registra eventos en tiempo real del ciclo de vida de cada bloque.

Eventos registrados:

| Evento | Cuándo ocurre |
|---|---|
| `ash.block.detected` | Watcher encontró un bloque válido |
| `ash.block.queued` | Bloque encolado para ejecución |
| `ash.block.executing` | Bloque en ejecución activa |
| `ash.block.executed` | Bloque ejecutado con éxito |
| `ash.block.ignored` | Bloque ignorado (id ya visto, policy, streaming) |
| `ash.block.error` | Error durante ejecución |
| `ash.block.duplicate` | ID repetido — bloqueado |
| `ash.policy.changed` | Policy modificada en isolated world |
| `ash.manual.parse` | Bloque parseado desde Manual Run |
| `ash.manual.run` | Bloque ejecutado desde Manual Run |

Cada evento incluye cuando aplique:

- `timestamp`
- `id` del bloque
- `channel` (`nexus`, `browser`, etc.)
- `action`
- `status` (`ok`, `error`, `blocked`, `ignored`)
- `reason` (`already_executed`, `policy_manual_only`, etc.)
- `source` (`auto`, `manual`, `system`)
- índice del mensaje / turn si existe

---

### Queue

Vista del estado de la cola de ejecución:

| Campo | Descripción |
|---|---|
| pending | Bloques detectados pero no ejecutados aún |
| executed | IDs ya ejecutados en esta sesión |
| ignored | Bloques ignorados por policy o streaming incompleto |
| blocked | Bloques bloqueados con razón explícita |
| errors | Ejecuciones fallidas |
| duplicate ids | IDs vistos más de una vez |

---

### Policy

Muestra y permite modificar la policy desde el contexto correcto de ASH.

Campos editables:

| Campo | Descripción |
|---|---|
| `autoloop.enabled` | Activa/desactiva el watcher |
| `manualOnly` | Solo permite Manual Run |
| `allowNexusAuto` | Permite autoejecutar `@@nexus` |
| `maxBlocksPerMessage` | Límite de bloques por mensaje |

**Importante:** la policy real vive en el isolated world del content script de ASH.
No usar CDP eval en main world como fuente de verdad — el content script lo sobreescribe.
Cambiar policy desde sidepanel/`ash-policy` para que llegue al isolated world.

---

### Manual Run

Permite ejecutar bloques `@@` sin depender del autoloop:

- Pegar bloque `@@channel:id ... @@end:id`
- Parsear y validar antes de ejecutar
- Registrar `source=manual` en el flight recorder
- Mostrar resultado en la cabina
- Avisar si el id ya fue ejecutado (`already_executed`)
- Permitir force run solo si se decide explícitamente

---

## Estados esperados

### Ejecución normal

```
detected → queued → executing → executed
```

Resultado en chat:
```
@@nexus-result:<id> status=ok
```

### Bloqueado por manualOnly

```
detected → ignored/blocked reason=policy_manual_only
```

Resultado en chat:
```
@@nexus-result:<id> status=blocked reason=policy_manual_only
```

### Bloqueado por allowNexusAuto=false

```
detected → ignored/blocked reason=policy_channel_disabled
```

Resultado en chat:
```
@@nexus-result:<id> status=blocked reason=policy_channel_disabled
```

### maxBlocksPerMessage excedido

Primeros N bloques: `executed`

Excedentes:
```
@@nexus-result:<id> status=blocked reason=max_blocks_exceeded
```

### ID duplicado

Primer bloque: `executed`

Segundo bloque:
```
@@nexus-result:<id> status=blocked reason=already_executed
```

---

## Lecciones confirmadas

- Policy debe cambiarse mediante `sidepanel + ash-policy` en el isolated world.
- `sessionStorage` desde main world (CDP eval) no es confiable para cambiar policy.
- Realtime watcher confirmado: `detected → queued → executing → executed` sin reload.
- Reload con historial viejo no revivió bloques — `_executedIds` persiste en sessionStorage.
- Resultados `blocked` cierran el protocolo y evitan silencio — nunca se omite el resultado.
- Resultados `@@nexus-result` nunca deben autoejecutarse.

---

## Diagnóstico de bugs

### Si no llega ningún resultado

Posibles causas:
- Detector no vio el bloque (streaming incompleto, `@@end:id` no llegó)
- Watcher no está corriendo (`autoloop.enabled=false`)
- Autoloop deshabilitado por policy
- Bloque mal formado (ids que no coinciden)

Mirar en cabina:
- Events: buscar `ash.block.detected` o su ausencia
- `lastDetectedId` — ¿aparece el id esperado?
- `lastError`
- Policy actual

### Si llega status=blocked

No es bug de Nexus. La policy funcionó correctamente. Leer el `reason`.

### Si llega status=ok pero debía bloquearse

Revisar:
- Policy real en isolated world — no asumir lo que muestra sessionStorage del main world
- `manualOnly` — ¿estaba activo antes del bloque?
- `allowNexusAuto` — ¿estaba en false?
- ¿La policy se activó *antes* de que el bloque llegara al chat?

### Si llega resultado viejo antes del nuevo

Bug de backlog, cola, o historial. Revisar:
- `source` del evento y su message index
- `_executedIds` en sessionStorage
- Si el reload limpió la cola correctamente

---

## Roadmap cabina v2

| Feature | Estado |
|---|---|
| Vista de eventos mejorada | Pendiente |
| Filtros por id/channel/status | Pendiente |
| Exportar eventos a `sandbox/logs/` | Pendiente |
| Botón clear queue | Pendiente |
| Botón clear executed ids (con confirmación) | Pendiente |
| Manual Run integrado | Pendiente |
| Policy editor más claro | Pendiente |
| Vista de smoke suite | Pendiente |
| Vista de artifacts (futura) | Pendiente |

---

## No hacer todavía

- No convertir la cabina en IDE.
- No agregar `click`/`type`/`send` de browser.
- No conectar providers LLM reales.
- No upload automático desde la cabina.
- No ejecutar historial viejo desde la cabina sin confirmación explícita.
