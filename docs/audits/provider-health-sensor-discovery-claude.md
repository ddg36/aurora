# Provider Health Sensor — Discovery, diagnóstico y diseño verificable

**Fecha:** 2026-07-19 (v3, segunda corrección documental tras revisión de Navigator)
**Repositorio:** `/media/almacen/deml/Downloads/core_instruction/aurora`
**Branch:** `task/provider-health-sensor`
**Worktree:** `/media/almacen/deml/Downloads/core_instruction/aurora-provider-health-sensor`
**Base commit original:** `17e1e710c1e33058142eaf7ba519bbde51643c00` (`17e1e71`)
**Commit v1 (revisado, `CHANGES_REQUIRED`):** `e197a5994de4406c27fcbbf13ea8bb7abe5194ac`
**Commit v2 (revisado, `CHANGES_REQUIRED`):** `0dede036ec4d8edd4a1da427881df8cf8350d35e`
**Commit v3 (esta versión):** ver `DRIVER_PROVIDER_HEALTH_CONTRACTS_FINALIZED` al final.
**Estado inicial de esta corrección:** worktree en `task/provider-health-sensor`, HEAD `0dede036`, `git status` limpio (`HECHO_VERIFICADO`).

## Alcance de este documento

Discovery, lectura, diagnóstico, diseño y planificación. Ningún archivo de producción fue modificado en ninguna de las tres versiones. Este archivo es el único artefacto de la fase.

## Nota de versión

v2 corrigió overclaims de v1 sobre `cloudGenerando`, el timeout de `askCloud()`, 13 filas de escenarios, privacidad de evidencia y convención de tests. **v3 corrige overclaims de v2** identificados por Navigator: `Activity` mezclaba tres scopes distintos (request/job/tools) bajo un solo eje — se separa en `RequestActivity`/`JobState`/`ToolLifecycle`; `ejecutarPreparada()` se presentaba incorrectamente como ejecutor de tools (la ejecución real es server-side); el evento `provider.activity.changed` era demasiado amplio y `Availability` todavía admitía `Endpoint Registry` como autoridad indebida; Channel afirmaba "mapeo 1:1" mientras agregaba un estado (`ONLINE`) no producido hoy; la reconciliación previa a un retry tenía 5 preguntas cuando el texto decía 6; `partialArtifact.text` viajaba embebido en el bus de eventos exponiendo contenido privado; y 5 filas de la tabla de escenarios (3, 7, 8, 11, 16) seguían con inconsistencias. Cada corrección está marcada explícitamente como "v3" donde reemplaza contenido de v2.

## Exclusiones explícitas

Gemini Clone, normalización ANSI, unificación Lyria↔Cloud, `relay-reinjector.js` (solo se audita, no se corrige), Provider Scout, AI-Cloud Memory, CLI Agent Controller, implementación del sensor, `types.js`/`validate.js`/tests (no se crean todavía).

## Metodología

Lectura directa de código fuente en el worktree aislado (`grep -a` — `lyra.js` contiene bytes que confunden la heurística binaria de `grep` sin `-a`). Ninguna prueba viva contra Qwen en v1 ni en v2. Ninguna interacción sintética con UI. Taxonomía de evidencia: `HECHO_VERIFICADO` (leído en código real), `INFERENCIA` (deducido, no ejecutado), `PLAUSIBLE_Y_NO_REPRODUCIDO` (mecanismo mapeado, sin ejercitarlo en vivo), `PROPUESTA` (diseño futuro), `NO_VERIFICADO`, `BLOCKED_EXTERNAL`, `BLOCKED_BY_ENVIRONMENT`.

## Archivos inspeccionados

Los de v1, más en esta corrección:

- `ui/modules/lyra/scripts/chat/duo.js` — **nuevo en v2**: confirma segundo escritor de `cloudGenerando`.
- `ui/components/shared/api.js` — **nuevo en v2**: confirma ausencia de `AbortSignal`/timeout en `fetch()`.
- `tests/ui/*.mjs` — **nuevo en v2**: confirma convención de tests existente (corrige overclaim de v1).

Lista completa (v1 + v2):

- `extensions/aihub/content-scripts/relay/relay-core.js`
- `extensions/aihub/content-scripts/relay/relay-contract.js`
- `extensions/aihub/content-scripts/provider-relay.js`
- `extensions/aihub/content-scripts/relay/providers/relay-qwen.js`
- `extensions/aihub/background.js`
- `extensions/aihub/background/endpoint-registry.js`
- `extensions/aihub/background/relay-reinjector.js`
- `ui/modules/lyra/scripts/chat/cloud.js`
- `ui/modules/lyra/scripts/chat/duo.js`
- `ui/modules/lyra/scripts/chat/mensajes.js`
- `ui/components/shared/cloud-ask.js`
- `ui/components/shared/api.js`
- `ui/modules/lyra/view/lyra.js`
- `scripts/SOL-debug-tools/sol-debug.py`
- `tests/ui/test_mensajes_parser.mjs`, `tests/ui/test_serializer_roundtrip.mjs`
- `ai-cloud/AI-cloud.md`, `ai-cloud/memories/chatgpt-orchestrator-memories.md`, `ai-cloud/CHECKLIST-ACTIVO.md`

---

## 1. `cloudGenerando` — ownership corregido

**HECHO_VERIFICADO (corrección de v1):** `cloudGenerando` (`mensajes.js:11`, `signal(false)`) tiene **al menos dos escritores independientes**:

1. `cloud.js:enviarACloud()` — `cloudGenerando.value = true` (línea 286), `= false` solo en el `finally` (línea 667) que envuelve **todo el loop de iteración de tools** (potencialmente varias llamadas a `askCloud`, tools ejecutadas, persistencia).
2. `ui/modules/lyra/scripts/chat/duo.js` (líneas 108-114) — `cloudGenerando.value = true` inmediatamente antes de un `try { await askCloud(...) } finally { cloudGenerando.value = false }` **propio**, con alcance mucho más acotado (una sola llamada a `askCloud`, sin loop de tools).

Retiro explícito de v1: **"un solo escritor"**, **"único lock de turno de Lyra Cloud"** y **"un solo punto de liberación"** eran falsos. Son dos rutas independientes, cada una con su propio `try/finally`, escribiendo la misma signal global. No existe coordinación entre ellas — si ambas rutas llegaran a ejecutarse en paralelo (no verificado si la UI lo permite hoy), una podría pisar el `false` de la otra prematuramente. Esto no se investigó más a fondo en esta fase (fuera del alcance: no se toca código).

### Terminología corregida (uso consistente en el resto del documento)

- **UI busy signal**: `cloudGenerando` — booleano compartido, refleja "algo cloud-related está en curso", sin identidad de quién ni de cuál turno.
- **Request in flight**: una llamada específica a `askCloud()` con su `requestId`, entre el `postAlRelay` y la resolución de la promesa.
- **Turn ownership**: el `turnId` persistido por `cloud.js` vía `guardarTurnoCloud` — identidad del turno lógico de Lyra Cloud (no aplica a Duo, que no pasa por `enviarACloud`).
- **Provider/pane reservation**: qué `(provider, paneId)` está actualmente "tomado" por un turno o sesión de Duo — no existe hoy como concepto explícito en el código, es una noción que el sensor tendría que introducir.
- **Writer lease**: concepto de coordinación multiagente (Driver/Navigator/Orchestrator, según `AI-cloud.md`) — no existe en el código de Aurora hoy, vive solo en el protocolo humano/LLM de esta misión.
- **Persisted logical job**: el turno en DB (`guardarTurnoCloud`/`/cloud-agent/turn/recover`) — sobrevive a un reload de Aurora, a diferencia de `cloudGenerando`.

**Corrección de alcance sobre `lyra_cloud_busy`:** el harness reporta `lyra_cloud_busy` cuando lee `signals.cloudGenerando.value === true` (`sol-debug.py:441`). Esto demuestra **únicamente** que la UI busy signal estaba activa en ese instante. No demuestra:
- que `enviarACloud()` (y no `duo.js`) fuera la ruta dueña de esa activación;
- que el proveedor (Qwen) estuviera progresando realmente;
- que no se tratara de un residuo de una llamada anterior no limpiada por alguna causa no identificada.

---

## 2. Riesgo real de retención — corregido

**HECHO_VERIFICADO (corrección de v1):** `askCloud()` (`cloud-ask.js:200-307`) **sí tiene** un watchdog propio: `setTimeout(..., timeoutMs)` con default `600000ms` (línea 201, 276-284). Al vencer: llama `detenerCloud(iframe, paneId)` (clic en Stop del proveedor), emite `AURORA_CLOUD_STATUS` con `fase:'stop', reason:'parent_timeout'`, y resuelve (no rechaza) la Promise con `{ok:false, reason:'parent_timeout', text:'Error: timeout esperando al AI (Ns).'}`.

Retiro explícito de v1: la afirmación *"si el `await askCloud()` nunca resuelve, `cloudGenerando` permanece `true` indefinidamente"* era **incorrecta como estaba formulada** — `askCloud()` con su timeout por defecto SIEMPRE resuelve (nunca queda pendiente para siempre), por lo que el `await` dentro del loop de `enviarACloud` tampoco queda colgado por esa causa.

**Riesgo real, mapeado con precisión (`HECHO_VERIFICADO` + `INFERENCIA` acotada):**

`cloudGenerando.value = true` se ejecuta en `cloud.js:286`, **antes** de que el flujo entre al bloque `try` (línea 363) que contiene el `finally` liberador. Entre esas dos líneas (287-362) ocurren, sin ninguna protección de timeout propia:

- `urlRealDelIframe(iframe, url)` (línea 294) — **HECHO_VERIFICADO**, `cloud-ask.js:152-164`: esta función SÍ tiene su propio timeout interno (500ms, con fallback), por lo que no es la fuente del riesgo.
- `asegurarConversacion(aiId, url)` (línea 295) — **NO_VERIFICADO** en esta fase: no se leyó su implementación; si internamente usa `fetch()` de `api.js` (ver abajo), no tiene timeout.
- `agregar({...})` (línea 307) — síncrono, no aplica.
- `getCloudToolPrimer()` (línea 336) — **NO_VERIFICADO**: no se leyó su implementación en esta fase.
- `guardarTurnoCloud(...)` (línea 339) y `persistir(convId, 'user', texto)` (línea 343) — **NO_VERIFICADO** su implementación exacta, pero por convención del proyecto probablemente usan `postJSON`/`patchJSON` de `api.js`.

**HECHO_VERIFICADO:** `ui/components/shared/api.js` — los `fetch()` en `getJSON`/`postJSON` (líneas 6 y 12, confirmado por grep) **no reciben `AbortSignal` ni ningún parámetro de timeout**. Si el servidor de Aurora (`localhost:7779`) dejara de responder a una de estas llamadas — no el proveedor cloud, sino el backend propio de Aurora — el `await` correspondiente podría quedar pendiente indefinidamente, y como ocurre **antes** del `try/finally` liberador, `cloudGenerando` quedaría `true` sin que ningún código posterior lo libere.

Conclusión corregida: el riesgo de retención indefinida **no** está en `askCloud()` (que sí tiene watchdog) ni en el proveedor cloud en sí. Está en la ventana de código de `enviarACloud()` **anterior** al `try/finally`, específicamente en llamadas HTTP propias de Aurora (`api.js`) sin timeout. También hay `await`s dentro del loop (`persistir`, `guardarTurnoCloud`, tools ejecutadas vía `pi`) cuyo límite de tiempo **no fue demostrado** en esta fase — quedan como `NO_VERIFICADO`, no como riesgo confirmado ni descartado.

---

## 3. Modelo de tres dimensiones (corrige el modelo de dos ejes de v1)

**Corrección de v1:** el modelo de dos ejes (`availability`/`activity`) queda **aprobado en principio pero incompleto**. Falta una tercera dimensión: **Channel** (el canal físico/endpoint), que v1 mencionaba dispersa en la sección de autoridad pero no modelaba como eje formal con sus propios estados.

### Availability — propiedad del proveedor/cuenta/sesión

```
READY | RATE_LIMITED | QUOTA_EXHAUSTED | AUTH_REQUIRED |
CHALLENGE_REQUIRED | TEMP_UNAVAILABLE | RESTRICTED | UNKNOWN
```

**Regla dura (corrección de v1, escenarios 2/18):** `READY` solo puede afirmarse con **evidencia positiva y vigente** de que el proveedor acepta trabajo — nunca por ausencia de señales negativas. Una pantalla de inicio sin banner, un composer que aparenta estar habilitado, o un Stop persistente sin texto nuevo **no son evidencia suficiente de `READY`**; en ausencia de evidencia positiva, el valor correcto es `UNKNOWN`.

### RequestActivity — propiedad de UN request individual al proveedor (corrige "Activity" de v2, separación exigida por Navigator)

**Corrección v3 (§ activity_model_verdict):** v2 mezclaba tres scopes distintos (request de `askCloud`, turno persistido, job completo con tools) bajo un solo eje `Activity`. Se separa en **RequestActivity** (esta sección), **JobState** (sección siguiente) y **ToolLifecycle** (sección siguiente). `CANCELLED` queda reservado exclusivamente para cancelación explícita y autoritativa (nunca como sinónimo de `INTERRUPTED`, corrección de v2 donde `INTERRUPTED` incluía "cancelación por Stop" solapándose con `CANCELLED`).

```
IDLE | QUEUED | SUBMITTED | WAITING_FIRST_OUTPUT | PROGRESSING |
STALLED | INTERRUPTED | COMPLETED | FAILED | CANCELLED | UNKNOWN
```

- `IDLE` — sin request activo para ese `(provider, paneId)`.
- `QUEUED` — el turno está persistido (`prepared`/`awaiting_answer` en `cloud.js`) pero el `AURORA_CLOUD_ASK` todavía no se envió al relay.
- `SUBMITTED` — `AURORA_CLOUD_ASK` enviado (`postAlRelay(iframe, request)`), esperando primera respuesta del relay. Describe únicamente el nivel de protocolo `askCloud` — nada sobre tools.
- `WAITING_FIRST_OUTPUT` — request aceptado por el relay pero sin `AURORA_CLOUD_CHUNK` ni `AURORA_CLOUD_ANSWER` todavía.
- `PROGRESSING` — al menos un `AURORA_CLOUD_CHUNK` recibido y `lastChange` actualizándose dentro de la ventana esperada.
- `STALLED` — hubo `WAITING_FIRST_OUTPUT` o `PROGRESSING` y ahora `Date.now() - lastChange` excede el umbral (`STALL_MS` como referencia, `15000ms`), sin que haya llegado un cierre.
- `INTERRUPTED` — el request se cortó por una causa **externa, no solicitada por el usuario**, y potencialmente recuperable: `pane_reload`, `provider_navigation`, relay perdido, canal descartado. **`CANCELLED` NO es un subtipo de `INTERRUPTED`** — es una cancelación explícita y autoritativa del usuario (`detenerCloud`), corrección de v2 que las solapaba.
- `COMPLETED` — el request individual al proveedor cerró correctamente (`AURORA_CLOUD_ANSWER` con `ok:true` y contenido válido). **Corrección explícita (§ activity_model_verdict #4):** esto cierra el REQUEST, no necesariamente el job lógico completo — una respuesta puede contener una tool pendiente de ejecutar, persistir y responder, que sigue viva en `JobState` aunque `RequestActivity` de ese request puntual ya sea `COMPLETED`.
- `FAILED` — cierre con error no recuperable a nivel de request.
- `CANCELLED` — cancelación explícita y autoritativa del usuario/sistema sobre ESTE request.
- `UNKNOWN` — evidencia insuficiente o contradictoria.

`COMPLETED`/`FAILED`/`CANCELLED` son terminales del request puntual, no de "actividad viva" permanente — tras alcanzarlos, el siguiente request (si lo hay) es una entidad nueva con su propio ciclo desde `IDLE`/`QUEUED`.

**Respuesta parcial (corrección conservada de v2):** una respuesta parcial seguida de un corte no es `COMPLETED`. Se representa como `INTERRUPTED` (con ruta de recuperación conocida) o `FAILED` (sin ella), conservando el contenido parcial — ver `partialArtifactRef` en la sección de privacidad, ya no `partialArtifact.text` embebido en el evento.

### JobState — propiedad del job lógico persistido (nuevo en v3, exigido por Navigator)

**Corrección v3:** `PAUSED`/`BLOCKED` no pertenecen a `RequestActivity` (un request individual no "se pausa", se cierra o se corta) — pertenecen al job lógico completo, que sí puede quedar pausado esperando una condición externa mientras NO hay ningún request en vuelo.

```
CREATED | ACTIVE | PAUSED | BLOCKED | WAITING_TOOL | WAITING_RESULT |
WAITING_FEEDBACK | COMPLETED | FAILED | CANCELLED | UNKNOWN
```

- `CREATED` — el job existe (`guardarTurnoCloud` inicial) pero el primer request todavía no se envió.
- `ACTIVE` — hay un `RequestActivity` en curso para este job (cualquier valor entre `SUBMITTED` y `PROGRESSING`).
- `PAUSED` — el job está detenido por una causa de `Availability` reversible por tiempo (`RATE_LIMITED` con `retryAfter`, por ejemplo) — sin request en vuelo, esperando una condición temporal.
- `BLOCKED` — el job está detenido por una causa que requiere intervención externa antes de poder continuar (`QUOTA_EXHAUSTED`, `AUTH_REQUIRED`, `CHALLENGE_REQUIRED`).
- `WAITING_TOOL` — la respuesta del proveedor fue parseada y contiene una tool detectada, pendiente de validación/ejecución (ver ToolLifecycle).
- `WAITING_RESULT` — la tool fue despachada al ejecutor (JSON Family / backend), esperando el resultado.
- `WAITING_FEEDBACK` — el resultado ya fue recibido/persistido y el siguiente prompt (feedback) está preparado o en camino de entregarse al proveedor.
- `COMPLETED` — el job cerró todas sus fases: respuesta final sin tools pendientes, o `completarTurnoCloud(turnId, 'completed')`.
- `FAILED` — cierre con error no recuperable a nivel de job (`completarTurnoCloud(turnId, 'failed')`, `MAX_ITER` alcanzado, tool inválida repetida 3 veces).
- `CANCELLED` — el usuario canceló el job completo explícitamente.
- `UNKNOWN` — evidencia insuficiente.

`RATE_LIMITED`/`QUOTA_EXHAUSTED` (eje `Availability`) son la **causa** que puede empujar `JobState` a `PAUSED`/`BLOCKED`; no son ellos mismos valores de `JobState`.

### ToolLifecycle — fases de una tool dentro de un job (nuevo en v3, corrige autoridad de ejecución de v2)

**Corrección v3 (§ lifecycle_separation_verdict):** v2 afirmaba incorrectamente que `ejecutarPreparada()` (en `cloud.js`) ejecuta la tool. **HECHO_VERIFICADO al leer el código real:** `processCloudToolProtocol(text, {...})` (`cloud.js:28-37`) delega en `processJSONFamily(text, {...})` (`json-family-client.js:4-9`), que hace `postJSON('/json-family/process', {...})` — la detección Y ejecución real de la tool ocurren **en el backend de Aurora** (server-side, vía el "Pi Tool Provider" mencionado en el encabezado del propio `cloud.js`). El cliente solo envía texto y recibe de vuelta `familyResult.entries` ya con el resultado calculado. `ejecutarPreparada()` (`cloud.js:584-625`) **lee** `familyResult.entries[indice].result` (ya ejecutado por el backend), lo persiste localmente (`guardarTurnoCloud`) y lo presenta en la UI (`mostrarResultadoGuardado`) — no ejecuta nada.

Fases distinguidas (once, sin fusionar detección con ejecución ni recepción con persistencia):

1. tool detectada (el texto del proveedor matchea el formato JSON Family).
2. tool parseada (`parsedProtocolResult(familyResult).calls`).
3. tool validada — **`NO_VERIFICADO`**: no se confirmó en esta fase si existe algún paso de validación de forma/args antes del siguiente punto, más allá de lo que el propio parser ya descarta como `errors`.
4. tool autorizada — **`NO_VERIFICADO`**: no se encontró ningún gate explícito de autorización humana/programática entre "detectada" y "despachada" en el código leído; se asume, sin confirmar, que toda tool detectada y bien formada se despacha automáticamente.
5. tool despachada al ejecutor JSON Family — ocurre **dentro** de la misma llamada `postJSON('/json-family/process', ...)`, es decir, en la práctica los pasos 5-7 son atómicos desde la perspectiva del cliente (una sola llamada de red que ya devuelve el resultado).
6. tool realmente ejecutada por el backend/orquestador (Pi Tool Provider) — ocurre server-side, no observable directamente por el cliente más que por el resultado final.
7. resultado recibido por `processCloudToolProtocol` (la respuesta HTTP de `/json-family/process` ya contiene `entries` con resultados).
8. resultado persistido (`guardarTurnoCloud` con `state.toolResults`, dentro de `ejecutarPreparada`).
9. feedback preparado (`resultados.join(...) + continuation`, construcción del siguiente `prompt`).
10. feedback enviado al proveedor (siguiente iteración del loop, nuevo `askCloud`).
11. feedback aceptado/continuación observada (el proveedor responde al prompt de feedback — vuelve a `RequestActivity` desde `QUEUED`/`SUBMITTED` de un nuevo request).

### Channel — propiedad del endpoint físico (corrige "mapea 1:1" de v2)

**Corrección v3 (§ channel_model_verdict):** v2 afirmaba "mapea 1:1" con `endpoint-registry.js` y en la misma frase agregaba `ONLINE`, que el registro **no produce hoy**. Eso no es un mapeo 1:1. Se separan estados verificados de estados propuestos.

**HECHO_VERIFICADO**, estados que `endpoint-registry.js` produce hoy: `booting` / `idle` / `generating` (vía `snapshot.state`) / `discarded` / `frozen` / `offline` (vía `cleanup()` por TTL de heartbeat vencido, con `offlineReason`).

```
BOOTING | IDLE | GENERATING | DISCARDED | FROZEN | OFFLINE | UNKNOWN
```

`ONLINE` se retira del enum verificado. Si se necesita un estado explícito de "heartbeat llega a tiempo pero sin snapshot de estado aplicable todavía", se etiqueta como:

**`ONLINE` — `PROPUESTA_DERIVADA`**, no producido por `endpoint-registry.js` hoy; requeriría lógica nueva (no existente) para diferenciarlo de `booting`.

Esta dimensión no conoce nada de cuota, rate limit, auth o challenge — describe exclusivamente si el canal (tab/frame) sigue reportándose vivo. Un `OFFLINE` por `heartbeat_timeout` significa "no llegó heartbeat dentro del TTL de 20s", no "el proveedor cayó".

---

## 4. Contratos de eventos — separados por scope y autoridad (corrige `provider.activity.changed` de v2)

**Corrección v3 (§ event_contracts_verdict):** v2 tenía un `provider.activity.changed` demasiado amplio, mezclando `RequestActivity` con lo que en realidad pertenece a `JobState`/`ToolLifecycle`, y admitía `endpoint_registry` como fuente autoritativa de `Availability` — incorrecto, porque el registro describe el canal físico, no la cuenta/sesión del proveedor. Se corrige a tres contratos con scope y autoridad estrictamente separados.

### 4.1 `provider.availability.changed`

Autoridad: **exclusivamente** un detector de disponibilidad por proveedor/sesión/pane (adapter-level). Vive por sesión, no por request ni por job.

```ts
{
  eventVersion: 1,
  eventId: string,
  sequence: number,
  logicalProviderId: string,
  effectiveAdapterId: string,
  paneId: string,
  sessionId: string | null,
  previousState: AvailabilityState,
  state: AvailabilityState,
  reasonCode: string,
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",
  evidence: EvidenceEntry[],
  retryAfter: number | null,
  observedAt: number,
  source: "adapter",   // corrección v3: ÚNICA fuente autoritativa válida. "endpoint_registry" y "harness" RETIRADOS.
}
```

**Corrección v3:** `source: "endpoint_registry"` retirado. El Endpoint Registry puede aportar **contexto o contradicción** (por ejemplo: "el canal está `offline`, así que no hay forma de observar `Availability` ahora mismo" → sube a `UNKNOWN`), y esa contradicción se registra como una `EvidenceEntry` con `sourceClass:"endpoint_channel"` dentro de `evidence[]` — pero el Endpoint Registry **nunca** es el emisor autoritativo de `state` en este evento. Emitir `READY`/`RATE_LIMITED`/etc. requiere evidencia específica de cuenta/proveedor (banner, redirect, composer disabled con reasonCode), que solo un adapter puede observar.

### 4.2 `provider.request.activity.changed`

Autoridad: el request individual al proveedor (`RequestActivity`, sección 3). Vive por intento (`attemptId`), no por sesión.

```ts
{
  eventVersion: 1,
  eventId: string,
  sequence: number,
  logicalProviderId: string,
  effectiveAdapterId: string,
  paneId: string,
  sessionId: string | null,
  logicalJobId: string,
  attemptId: string,
  requestId: string | null,
  previousActivity: RequestActivityState,
  activity: RequestActivityState,
  lastProgressAt: number | null,
  terminalReason: string | null,
  observedAt: number,
}
```

Corregido respecto a v2: se retira `partialArtifact.text` embebido (ver sección de privacidad, ahora `partialArtifactRef` vive en `cloud.job.state.changed`, no aquí — un request individual no es dueño del artefacto acumulado, el job sí).

### 4.3 `cloud.job.state.changed`

Autoridad: el job lógico persistido (`JobState`, sección 3). Vive por `logicalJobId`, sobrevive a múltiples `attemptId`.

```ts
{
  eventVersion: 1,
  eventId: string,
  sequence: number,
  logicalJobId: string,
  currentAttemptId: string | null,
  turnId: string | null,
  paneId: string,
  previousState: JobState,
  state: JobState,
  pauseReason: string | null,     // reasonCode, solo si state === "PAUSED"
  blockedReason: string | null,   // reasonCode, solo si state === "BLOCKED"
  durableClaim: string | null,    // identificador del claim que impide duplicación (ver sección 8)
  partialArtifactRef: PartialArtifactRef | null,  // ver sección de privacidad
  observedAt: number,
}
```

### 4.4 Channel — decisión explícita (corrige "pregunta abierta" de v2)

**Corrección v3 (§ event_contracts_verdict, punto 4):** v2 dejaba esto simultáneamente opcional y obligatorio. Se decide:

**Opción B adoptada: no se crea `provider.channel.changed` como evento nuevo en el Checkpoint 1 (ni en el diseño cercano).** `AuroraEndpointRegistry` permanece como autoridad canónica de Channel, consultable directamente (`AuroraEndpointRegistry.list()`/`resolve()`, ya existentes) por cualquier consumidor que necesite ese dato. Razón: el registro ya persiste en `chrome.storage.session`, ya tiene su propio ciclo de vida (`heartbeat`/`cleanup`/`release`) y duplicar esa autoridad en un evento nuevo introduciría una segunda fuente de verdad para el mismo dato sin necesidad demostrada. Si en una fase de implementación posterior un consumidor concreto necesita *reaccionar* a cambios de Channel en tiempo real (no solo consultarlos bajo demanda), se evaluará entonces envolver el registro existente con un emisor de eventos — no antes, y no como parte de este documento.

### 4.5 `provider.health.snapshot` (vista derivada, no autoridad)

Agregado de solo lectura para UI: combina el último `provider.availability.changed`, `provider.request.activity.changed`, `cloud.job.state.changed` conocidos para un `(logicalProviderId, paneId)`, más una consulta directa a `AuroraEndpointRegistry` para Channel. **Nunca** se escribe directamente. Ningún consumidor debe tratarlo como fuente de verdad si los eventos/consultas individuales están disponibles.

---

## 5. Tabla de escenarios — corregida

**Corrección de v1 (§ scenario_table_verdict):** se corrigen las filas 2, 3, 4, 7, 8, 9, 11, 13, 15, 16, 17, 18 y 20 exactamente como exigió Navigator. Se mantiene el resto de la tabla original de v1 sin cambios salvo ajuste de vocabulario a los ejes corregidos.

| # | Escenario | availability | activity | evidencia | confianza | acción | lock | retry | humano |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Stop visible y texto creciendo | READY | PROGRESSING | `getStop()=true` (authoritativeStop) + `lastText` cambia | HIGH (progreso), no del Stop aislado | Seguir esperando, streamear chunks | conservar | no aplica | no |
| **2 (corregida)** | Stop visible sin cambios mucho tiempo | **UNKNOWN** (corrección: un Stop persistente sin texto nuevo NO prueba `READY` — puede ser un Stop obsoleto en un sitio sin `authoritativeStop`) | STALLED | Stop persiste + `Date.now()-lastChange > STALL_MS` | MEDIUM | Emitir aviso (no autoclic), ofrecer intervención manual | conservar | manual únicamente | recomendado |
| **3 (corregida v3)** | Composer deshabilitado + banner de cuota | QUOTA_EXHAUSTED o RATE_LIMITED | RequestActivity: `FAILED` o `COMPLETED` según qué devolvió el último request observado; JobState: **`BLOCKED`** (cuota) o **`PAUSED`** (rate limit con `retryAfter`) — corrección v3: `PAUSED`/`BLOCKED` viven en `JobState`, no son valores de `RequestActivity` | Banner con `reasonCode` específico + composer disabled | HIGH si el patrón está validado por fixture | Detener nuevos requests para este job, `JobState=BLOCKED/PAUSED` | conservar el job persistido, liberar locks en memoria | prohibido automático | sí, para reanudar |
| **4 (corregida)** | Composer habilitado, sin respuesta, sin banner | UNKNOWN | **WAITING_FIRST_OUTPUT** antes del umbral de stall; **STALLED** después | Ausencia de señales | LOW/UNKNOWN | No inventar causa; conservar evidencia; permitir diagnóstico manual | conservar | no | recomendado si se prolonga |
| 5 | Sesión cerrada | AUTH_REQUIRED | UNKNOWN | Redirect a login detectado | HIGH si patrón específico | Detener automatización, pedir intervención | liberar | prohibido | sí, obligatorio |
| 6 | CAPTCHA / challenge | CHALLENGE_REQUIRED | UNKNOWN | Challenge conocido detectado | HIGH si selector específico | Pausar, no resolver | liberar | prohibido | sí, obligatorio |
| **7 (corregida v3)** | Error temporal del proveedor | TEMP_UNAVAILABLE | RequestActivity: `FAILED` (de este intento); JobState: `ACTIVE` si se decide reintentar | Error 5xx visible | MEDIUM | **Solo tras completar la reconciliación de la sección 8** (¿el request anterior fue aceptado? ¿sigue en vuelo? ¿produjo parcial?) crear un nuevo `attemptId` bajo el mismo `logicalJobId` — corrección v3: "parecer temporal" no basta por sí solo, la reconciliación es condición previa obligatoria, no opcional | conservar el `logicalJobId` | sí, vía nuevo attempt, acotado, solo tras reconciliar | no, salvo repetición |
| **8 (corregida v3)** | Rate limit con fecha de reintento | RATE_LIMITED | RequestActivity: `COMPLETED` o `FAILED` del último request; JobState: **`PAUSED`** (misma corrección que fila 3 — no es un valor de RequestActivity) | Banner con `retryAfter` parseable | HIGH si se parsea | Pausar el job hasta `retryAfter` | conservar job persistido | programado, nunca ciego — `retryAfter` despierta una comprobación, no un reenvío automático | no |
| **9 (corregida)** | Job local finalizado pero DOM dice generating | READY debe justificarse por **evidencia separada de disponibilidad**, no inferirse del cierre del request (corrección: v1 mezclaba ambas) | COMPLETED | `AURORA_CLOUD_ANSWER` recibido cierra el REQUEST; no certifica disponibilidad futura de la cuenta | MEDIUM para activity (HIGH para el cierre del protocolo específicamente), evidencia de availability se evalúa aparte | Confiar en el cierre explícito del protocolo para `activity`; no inferir `availability` de esto | liberar activity | no aplica | no |
| **11 (corregida v3)** | Reload durante generación | UNKNOWN transitorio | RequestActivity: **`INTERRUPTED`** (no `STALLED` — hay causa conocida y protocolo explícito: `AURORA_CLOUD_RESETTING{reason:'pane_reload'}` → `askCloud` resuelve `pane_reloaded`); JobState: `ACTIVE` (recuperable) | Evento explícito del protocolo | HIGH (protocolo ya existente) | `recuperarCloudPendiente` puede reanudar. **Comportamiento ACTUAL, `HECHO_VERIFICADO`:** `askCloud({resumeOnly:true, requestId})` reenvía el **mismo `requestId`** que ya traía el turno persistido (`cloud.js:378-380`, `turnoPrevio.requestId`) — reutiliza identidad, no crea una nueva. **Diseño futuro, `PROPUESTA`, no implementado:** un `attemptId` nuevo por cada reintento, distinto del `requestId` reutilizado por `resumeOnly` — son dos identidades a niveles distintos (`attemptId` a nivel del sensor/job lógico, `requestId` a nivel del protocolo `askCloud` existente), no se contradicen pero tampoco deben confundirse como si ya coexistieran hoy | transferir vía DB (turno persistido) | sí, vía `resumeOnly` (ya existente) | no |
| 12 | Tab descartada y restaurada | UNKNOWN hasta reconfirmar | recuperable | `tab.discarded`, reinjector dispara `tab_resumed` | MEDIUM hasta que `probeMain` confirme `effectiveAdapterId` correcto | Re-probar adapter antes de asumir nada; degradar confianza si `effectiveAdapterId` no es el esperado | conservar turno en DB | reconectar canal | no, salvo si el adapter resultante es incorrecto |
| **13 (corregida)** | Service worker reiniciado | UNKNOWN | recuperable vía DB — **evento distinto de un reload de la página Aurora** (corrección explícita de v1, que los mezclaba) | `endpoint-registry` persiste en `chrome.storage.session` (sobrevive a restart del SW); `cloudGenerando` (memoria de la página Aurora) NO sobrevive a un reload de la página Aurora, pero un restart del service worker por sí solo **no recarga la página de Aurora** — son dos procesos distintos de Chrome | MEDIUM | Reconstruir desde DB/turno persistido si la página Aurora también se recargó; si solo el SW reinició, la página Aurora puede seguir con su estado de memoria intacto | depende de cuál de los dos procesos reinició — no unificar | reanudar vía `recuperarCloudPendiente` solo si la página Aurora perdió memoria | no |
| 14 | Adapter específico ausente, `generic` activo | UNKNOWN, confianza degradada explícitamente | UNKNOWN | `effectiveAdapterId !== logicalProviderId` esperado | LOW (generic no tiene señales específicas) | Degradar confianza automáticamente | conservar, marcar riesgo | no | recomendado revisar reinjector |
| **15 (corregida)** | Respuesta parcial seguida de indisponibilidad | transición a X | **INTERRUPTED o FAILED con `partialArtifact`** (corrección: nunca `COMPLETED`) | Texto recibido antes del corte + banner posterior | MEDIUM | Conservar la respuesta parcial como artefacto recuperable, no como resultado final exitoso; `availability` se reclasifica por separado | conservar el resultado parcial | no reintentar el mismo contenido; posible continuación explícita | no, salvo pedir continuar |
| **16 (corregida v3)** | `AURORA_CLOUD_ASK` enviado, sin `AURORA_CLOUD_ANSWER` todavía | **`UNKNOWN`** (corrección v3: sin evidencia separada de disponibilidad, no puede asumirse `READY`) | RequestActivity: `SUBMITTED`; JobState: `ACTIVE` — corrección v3 del título: la evidencia real disponible es únicamente "ASK enviado", **no** "tool enviada". No hay evidencia todavía de que el proveedor haya detectado, autorizado, despachado o ejecutado ninguna tool — esas fases (ToolLifecycle, sección 3) son posteriores a que exista siquiera una `AURORA_CLOUD_ANSWER` | `AURORA_CLOUD_ASK` enviado sin `AURORA_CLOUD_ANSWER` todavía | MEDIUM para RequestActivity, UNKNOWN para Availability | Seguir esperando dentro del timeout de `askCloud` (10min ya existente) | conservar | el propio `askCloud` ya reintenta el post en `resumeOnly` (protocolo existente) — no es un retry del sensor | no |
| **17 (corregida)** | Menú/overlay abierto confundido con estado del proveedor | N/A — dimensión de **UI de Aurora**, no del proveedor | N/A | **Corrección de causalidad (v1 sobreafirmaba):** en esta sesión un menú de selección de modelo quedó abierto tras un click sintético del Driver, y se observaron `lyra_cloud_busy` posteriores. No existe evidencia de que el overlay haya ESCRITO `cloudGenerando` — un menú visual no toca esa signal en el código inspeccionado. La relación causal exacta entre "overlay abierto" y "busy reportado por el harness" queda **`NO_VERIFICADO`**, no confirmada como en v1. | — | El sensor NUNCA debe leer overlays de Aurora como señal de proveedor — son dimensiones distintas, independientemente de si esta instancia específica tuvo relación causal o coincidencia temporal | no aplica | no aplica | no aplica |
| **18 (corregida)** | Proveedor en pantalla inicial sin conversación | **UNKNOWN** (corrección: no "READY probable" — ausencia de banner no es evidencia positiva, ver regla dura de la sección Availability) | IDLE | 0 turnos de usuario, sin banner — confirmado en vivo en sesión previa con Qwen en home | LOW | No asumir cuota agotada solo por esto; tampoco asumir disponibilidad | no hay job | no aplica | no |
| 19 | Timeout sin evidencia suficiente | UNKNOWN | UNKNOWN | Ausencia total de señales | UNKNOWN explícito | Declarar incertidumbre, no inventar causa | conservar con evidencia | no automático | recomendado |
| **20 (corregida)** | Recuperación del proveedor tras pausa | transición X→READY | IDLE (corrección: la recuperación de `availability` **habilita** una nueva decisión, no dispara reenvío automático del prompt) | Banner desaparece + composer acepta input | MEDIUM subiendo a HIGH con progreso confirmado de un intento nuevo | Notificar recuperación; **el reenvío requiere una decisión explícita** (humana o del Orchestrator), nunca automático | reactivar el job lógico como reintentable | sí, pero como decisión explícita, nuevo `attemptId` | recomendado, no obligatorio |

### Fases de una tool, explícitamente distinguidas (exigido por Navigator, ausente en v1)

1. prompt preparado (`status:'prepared'`)
2. prompt enviado (`AURORA_CLOUD_ASK` posteado)
3. request aceptado (relay confirma recepción — no siempre observable explícitamente hoy, `NO_VERIFICADO`)
4. primer output (`AURORA_CLOUD_CHUNK`)
5. respuesta cerrada (`AURORA_CLOUD_ANSWER`)
6. tool parseada (`processCloudToolProtocol` detecta `calls`)
7. tool autorizada (**concepto que hoy no existe explícitamente en el código** — `NO_VERIFICADO`/pregunta abierta: ¿hay algún gate de autorización antes de ejecutar, o toda tool detectada se ejecuta?)
8. tool ejecutada (`ejecutarPreparada`)
9. resultado recibido (`r = entry?.result`)
10. resultado persistido (`guardarTurnoCloud` con `toolResults`)
11. feedback entregado (siguiente `prompt` con el resultado, próxima iteración del loop)

---

## 6. Modelo de confianza — corregido (independencia real, no conteo)

**Corrección de v1 (§ confidence_model_verdict):** se retira cualquier regla basada en "cantidad de señales" per se. Se agrega estructura de evidencia para poder evaluar independencia real.

```
HIGH:    una señal ESTRUCTURAL y AUTORITATIVA por sí sola (p.ej. redirect a URL de
         login conocida, o un patternId validado por fixture con alta especificidad)
         PUEDE ser suficiente. No requiere combinarse si su authority es alta.

MEDIUM:  dos o más señales de sourceClass/correlationGroup DISTINTOS y
         genuinamente independientes, consistentes entre sí.

LOW:     una señal visual ambigua, o señales del mismo correlationGroup
         (ej. banner y composer-disabled que cambian juntos por el MISMO
         evento DOM no cuentan como dos señales independientes).

UNKNOWN: silencio, evidencia insuficiente, o señales contradictorias sin resolver.
```

**Corrección explícita del error de v1:** "ausencia de Stop" + "texto estable" **no son dos señales independientes de disponibilidad** — ambas derivan de la misma causa posible (el turno terminó normalmente) y no aportan nada sobre el estado de la CUENTA/proveedor. Confundir "dos observaciones" con "dos fuentes independientes" fue el error señalado por Navigator.

### EvidenceEntry — campos de correlación añadidos

```ts
{
  evidenceId: string,          // NUEVO — identidad estable, referenciable desde `contradicts`
  sourceClass: string,         // NUEVO — p.ej. "dom_banner" | "composer_state" | "url_redirect" | "endpoint_heartbeat"
  authority: "structural" | "heuristic",  // NUEVO — ¿la señal es un hecho estructural (disabled=true) o una heurística (parece un banner)?
  correlationGroup: string,    // NUEVO — señales que cambian juntas por la misma causa comparten grupo
  patternId: string | null,    // NUEVO — id del patrón versionado/validado por fixture que matcheó, si aplica
  reasonCode: string,          // slug estable, reemplaza texto libre como campo primario
  logicalProviderId: string,
  effectiveAdapterId: string,
  observedAt: number,
  expiresAt: number,           // NUEVO — TTL explícito de la evidencia
  previousState: string | null,
  contradicts: string[] | null, // ahora referencia evidenceId real, no texto libre
}
```

---

## 7. Privacidad de `EvidenceEntry` — corregida

**Corrección de v1 (§ privacy_evidence_verdict):** v1 proponía `normalizedText` (texto normalizado del banner) y opcionalmente un hash del contenido. Navigator identificó correctamente que ninguno de los dos es seguro por defecto:

- `normalizedText` puede contener nombre de usuario, email, información de plan, fechas de facturación, fragmentos de conversación real.
- Un hash de texto sensible sigue siendo un identificador correlacionable (permite comparación/diccionario si el espacio de textos posibles es acotado, como suele serlo un banner de cuota).

**Regla corregida:** `EvidenceEntry` **no** debe incluir texto visible del proveedor por defecto. La clasificación se apoya en:

- `patternId` (referencia a un patrón versionado, no el texto que lo disparó);
- `reasonCode` (slug estable);
- booleanos estructurales (`composerDisabled: true`, `stopVisible: false`);
- `host`, `logicalProviderId`, `effectiveAdapterId`;
- timestamps y valores numéricos mínimos (`stalledMs`, `retryAfter`).

Si en algún momento futuro se necesitara conservar texto crudo para depuración humana explícita, requeriría: TTL corto, nivel de privacidad `PRIVATE` (ver niveles ya definidos en `chatgpt-orchestrator-memories.md`), y consentimiento/política explícita — no es el comportamiento por defecto del sensor. `selectorOrSource` (nombre del selector CSS) se conserva como evidencia diagnóstica **temporal**, nunca como identificador semántico estable (los selectores cambian entre versiones del proveedor sin aviso).

### `partialArtifactRef` — corrige `partialArtifact.text` embebido (v3, § evidence_privacy_verdict)

**Corrección v3:** v2 incluía `partialArtifact: { text: string, truncated: boolean }` directamente dentro del evento `provider.activity.changed` (ahora `provider.request.activity.changed`/`cloud.job.state.changed`). Navigator identificó correctamente que ese texto puede ser conversación privada real del usuario, y transportarlo por el bus de eventos lo expone a cualquier consumidor del evento sin control de acceso.

**Corrección:** el texto se retira del bus de eventos. Los eventos solo transportan una referencia:

```ts
type PartialArtifactRef = {
  artifactId: string,
  ownerLogicalJobId: string,
  privacyClass: "PRIVATE" | "TEAM" | "MISSION" | "SHAREABLE",  // niveles ya definidos en chatgpt-orchestrator-memories.md
  createdAt: number,
  expiresAt: number,
  allowedConsumers: string[],     // roles/agentes autorizados a leer el contenido
  hasContent: boolean,
  approxSize: number | null,      // opcional, nunca el contenido
} | null;
```

El contenido real (`text`) vive en el almacenamiento durable ya existente del turno persistido (`guardarTurnoCloud`/DB), **no** en el evento. Leer el contenido requiere una acción explícita y autorizada por separado (análoga a cómo hoy `recuperarCloudPendiente` ya lee el turno persistido bajo demanda, en vez de transmitirlo proactivamente por cada cambio de estado).

---

## 8. Jobs, locks, pausa y sustitución — corregido

**Corrección de v1 (§ job_and_lock_rules_verdict):** se elimina cualquier propuesta de conservar un lock EN MEMORIA indefinidamente durante `UNKNOWN`, `RATE_LIMITED` o `QUOTA_EXHAUSTED`. Se separan explícitamente las nociones ya nombradas en la sección 1 (busy signal, request in flight, turn ownership, reservation, writer lease, persisted job) y se añade **durable claim**.

Para `RATE_LIMITED`/`QUOTA_EXHAUSTED`/`AUTH_REQUIRED`/`CHALLENGE_REQUIRED`:

1. Persistir el job lógico (ya existe el mecanismo: `guardarTurnoCloud`/DB).
2. Liberar cualquier lock en memoria (la busy signal, el request in flight) — no tiene sentido mantener `cloudGenerando=true` en la página Aurora mientras se espera indefinidamente a un proveedor pausado.
3. Liberar el writer lease del rol (permitir que Lyria Orchestrator asigne otro proveedor/agente a la misión mientras este espera).
4. Conservar un **durable claim**: un registro que impide que dos intentos distintos ataquen el mismo `logicalJobId` simultáneamente, identificado por `logicalJobId + attemptId` (no por `requestId` reutilizado).

### Reconciliación completa antes de retry o sustitución (v3, corrige la lista incompleta de v2 — Navigator: "el reporte decía seis preguntas, el documento tenía cinco")

Antes de crear un nuevo `attemptId` (o, en el diseño actual ya existente de `resumeOnly`, antes de reenviar el mismo `requestId` — ver corrección de la fila 11), reconciliar, en orden, cada una de estas 15 preguntas contra el estado persistido del turno (`guardarTurnoCloud`) y contra `familyResult`/ACKs conocidos:

1. **¿El request anterior fue recibido/aceptado por el relay?** → si no, es seguro reintentar desde cero (nada que duplicar).
2. **¿Sigue en vuelo?** → si sí, no reintentar todavía — esperar resolución (el propio `askCloud` ya tiene su watchdog de 10min) o cancelar explícitamente primero.
3. **¿Produjo respuesta parcial?** → si sí, conservar el `partialArtifactRef` (sección 7), decidir si continuar desde ahí o descartar — nunca perder el contenido silenciosamente.
4. **¿La respuesta contenía una tool?** → determina si aplica el resto de la cadena de ToolLifecycle (preguntas 5-9) o si el job puede cerrarse tras la respuesta de texto.
5. **¿La tool fue validada/autorizada?** → **`NO_VERIFICADO`**: no se confirmó que exista un gate explícito de autorización en el código actual (ver ToolLifecycle, sección 3) — mientras no se confirme, tratar toda tool detectada como ya "autorizada implícitamente" por el propio backend.
6. **¿La tool fue despachada al ejecutor?** → si el `postJSON('/json-family/process', ...)` ya se envió, no reenviar el mismo texto — el backend puede haberla ejecutado ya aunque la respuesta no haya vuelto al cliente.
7. **¿La tool fue realmente ejecutada?** → equivalente a "¿el backend ya corrió el comando/acción?" — si sí, **nunca re-ejecutar** (evita duplicar efectos secundarios reales: un `bash` que escribe un archivo, por ejemplo).
8. **¿El resultado fue recibido por el protocolo cliente?** (`familyResult.entries`) → si no, el request sigue pendiente a nivel de protocolo, no a nivel de tool.
9. **¿El resultado fue persistido?** (`guardarTurnoCloud` con `state.toolResults`) → si sí, reusar el resultado guardado (`yaGuardado?.feedback`, ya existente en `cloud.js:587`) en vez de re-consultar o re-ejecutar — el propio código actual ya implementa este caso para reanudación tras crash.
10. **¿El feedback fue preparado?** (el siguiente `prompt` construido a partir de `resultados.join(...)`) → si sí, no reconstruirlo desde cero, reusar el ya calculado.
11. **¿El feedback fue entregado al proveedor?** (nuevo `askCloud` con el prompt de feedback ya enviado) → si sí, no reenviar — evita que el proveedor reciba el mismo resultado de tool dos veces (el bug real de duplicación de esta misma sesión, con Qwen, tenía exactamente esta forma).
12. **¿El proveedor aceptó el feedback o ya inició una continuación?** → si hay evidencia de una respuesta nueva del proveedor al feedback, el ciclo ya avanzó — no retroceder.
13. **¿El intento anterior fue cancelado de forma autoritativa (`CANCELLED`, no `INTERRUPTED`)?** → una cancelación explícita del usuario nunca debe reabrirse automáticamente con un nuevo intento; requiere una nueva decisión explícita.
14. **¿Existe ACK del backend?** (`acknowledgeRelayDelivery`/`confirmarCloudAnswer`, nivel servidor Aurora) → distinto de la pregunta 15; confirma que el **backend de Aurora** considera la entrega registrada.
15. **¿Existe ACK del relay?** (`AURORA_CLOUD_ACK` a nivel `cloud-ask.js`, nivel canal MAIN↔ISOLATED↔background) → distinto de 14; confirma que el **canal de mensajería del navegador** considera la entrega recibida por el content script, independientemente de si el backend ya la procesó.

**Distinción explícita exigida por Navigator:** ACK backend ≠ ACK relay ≠ entrega al proveedor (el `postAlRelay`/`act.submit()` que efectivamente escribe en el composer del sitio) ≠ aceptación por el proveedor (que el sitio haya procesado el texto como un turno real, observable por `getUserTurnCount()` u equivalente). Las cuatro son verdades independientes — confirmar una no permite asumir las otras, exactamente el mismo principio que causó (y luego resolvió) el bug de envío duplicado de Qwen documentado en esta misma sesión de trabajo.

**Corrección explícita mantenida de v2:** nunca reutilizar el mismo `attemptId` al sustituir de proveedor o reintentar tras una pausa — cada intento nuevo es un `attemptId` nuevo bajo el mismo `logicalJobId` (con la salvedad documentada en la fila 11 sobre el comportamiento **actual** de `resumeOnly`, que sí reutiliza `requestId` a nivel de protocolo `askCloud`, una capa distinta). `retryAfter` despierta una comprobación de disponibilidad, nunca reenvía el prompt automáticamente.

---

## 9. Reinjector — alcance ampliado (corrige el alcance limitado de v1)

**HECHO_VERIFICADO** (sin cambios respecto a v1): `PROVIDERS['chat.qwen.ai'] = 'relay-generic.js'` (mapeo incorrecto); `probeMain()` exige `adapter && globalThis.__auroraRelayInstance`; `findProvider()` devuelve el primer match por orden de inserción en el array `providers`; `relay-generic.js` matchea con `() => true`.

**Corrección de v1 (§ reinjector_risk_verdict):** v1 limitaba el riesgo a los triggers `tab.discarded`/`tab.frozen`. Está confirmado en el propio código que el reinjector se dispara en **más casos**:

- `chrome.tabs.onActivated` — **cualquier** cambio de pestaña activa, no solo tras discard/freeze.
- `chrome.tabs.onUpdated` cuando `frozen`/`discarded` pasan a `false` **o `status` llega a `'complete'`** — esto último ocurre en **cualquier carga completa de página**, incluida una navegación normal sin relación con discard.
- `worker_boot` (arranque del service worker) — confirmado en sesión previa de este mismo proyecto.
- Instalación/arranque de la extensión.
- Invocación manual (`AuroraRelayReinjector.scan`/`ensureFrame` expuestos en `globalThis`).

En **cualquiera** de estos triggers, si `probeMain()` devuelve `ready:false` en el instante exacto en que corre (porque el bootstrap declarativo del manifest todavía no completó `__auroraRelayInstance`, incluso si el adapter ya se registró), el reinjector inyecta el mapeo incorrecto. La ventana de riesgo es, por tanto, **cualquier carga de página de `chat.qwen.ai` cuyo `status:'complete'` dispare un scan del reinjector antes de que termine el bootstrap propio de `relay-core.js`** — no exclusivamente discard/freeze.

Clasificación corregida: `PLAUSIBLE_Y_NO_REPRODUCIDO` (no `PLAUSIBLE` simple como decía v1) — el mecanismo está completamente mapeado por lectura de código, pero no se ha ejercitado en vivo en ninguna fase, y esta corrección documental tampoco lo hizo (fuera de alcance explícito).

**Cómo el sensor informa qué adapter produjo la evidencia:** cada evento `provider.availability.changed` incluye `logicalProviderId` (identidad de negocio, `"qwen"`) y `effectiveAdapterId` (verdad técnica, potencialmente `"generic"`) por separado — ver sección 4.1. Si difieren de lo esperado, la confianza se degrada automáticamente (fila 14 de la tabla de escenarios).

---

## 10. Convención de tests — corregida (retira overclaim de v1)

**Corrección de v1 (§ fixture_strategy_verdict):** v1 afirmaba *"no se encontró un directorio de tests JS existente en esta discovery"*. Esto era falso. **HECHO_VERIFICADO en esta corrección:** existen `tests/ui/test_mensajes_parser.mjs` y `tests/ui/test_serializer_roundtrip.mjs`, ejecutados manualmente con Bun (`NO_VERIFICADO` en esta fase el comando exacto — no hay script de `package.json` que lo declare, según hallazgo de Navigator).

**Ubicación propuesta para el futuro contrato** (si se autoriza un checkpoint de implementación):

```
tests/provider-health/test_contract.mjs
```

**Diseño de carga corregido** (exigido por Navigator, contradice el `export`/`import` ESM que v1 asumía implícitamente al no especificarlo): los archivos destinados a ejecutarse como content script (`types.js`, `validate.js`) **no deben usar `export`/`import` ESM** — deben seguir el patrón clásico IIFE que ya usa el resto de `relay-core.js`/`relay-contract.js`:

```js
(() => {
  const health = globalThis.__auroraProviderHealth ||= {};
  // constantes y validadores colgados de `health.*`
})();
```

Los tests cargarían estos archivos por efecto lateral (ej. leyendo el archivo y evaluándolo en un contexto controlado, o cargándolo como script clásico bajo Bun/Node con un `globalThis` compartido) e inspeccionarían `globalThis.__auroraProviderHealth` directamente, sin import/export.

Comandos mínimos propuestos para un futuro checkpoint (no ejecutados en esta fase, no autorizados todavía):
- `node --check` sobre ambos archivos nuevos.
- `bun tests/provider-health/test_contract.mjs`.

---

## 11. Estado del repositorio principal — corregido

**Corrección de v1 (§ main_worktree_preserved, overclaim #14 exigido por Navigator):** v1 afirmaba que el repositorio principal *"conserva solamente `README.md`, `docs/restaurado` y `ai-cloud/`"* como cambios preexistentes. Esa lista era un snapshot de un momento específico anterior, no una propiedad verificable de forma persistente — el repositorio principal es territorio de trabajo concurrente de otros agentes/orquestadores y cambia independientemente de esta misión.

**Formulación corregida y verificable:**

- Aislamiento Git del worktree (`task/provider-health-sensor` como worktree separado, comparte solo el `.git` común): **confirmado**.
- Ausencia de contaminación en los commits de esta misión (`e197a599` y el commit de esta corrección): **confirmado** — ambos contienen exclusivamente el archivo de este informe.
- Preservación exacta de un snapshot específico y congelado del working tree principal: **no verificable de forma persistente** — el repo principal puede (y de hecho lo hace) seguir cambiando por trabajo concurrente ajeno a esta misión. No existe, ni existió, evidencia de que esta misión haya causado esos cambios.

---

## 12. Sobreafirmaciones retiradas explícitamente (síntesis, exigida por Navigator)

1. ~~`cloudGenerando` es el único lock/escritor~~ → es una UI busy signal compartida por `cloud.js:enviarACloud` y `duo.js`, sin coordinación entre ambos.
2. ~~No es el único lock de turno Cloud~~ → no es un lock formal en absoluto (mutex/lease); es un booleano observable.
3. ~~`askCloud()` normal carece de watchdog~~ → tiene watchdog de 600000ms por defecto, con cierre explícito (`detenerCloud` + `parent_timeout`).
4. ~~El riesgo de retención indefinida está en el watcher principal de 10 minutos~~ → está en la ventana previa al `try/finally` de `enviarACloud` y en `fetch()` de `api.js` sin `AbortSignal`.
5. ~~`lyra_cloud_busy` demuestra que el proveedor progresaba~~ → demuestra solo que la busy signal estaba activa, sin identificar dueño ni progreso real.
6. ~~Un Stop autoritativo es evidencia alta de progreso aislada~~ → demuestra que el sitio expuso su control de generación, no que el texto esté avanzando ni que vaya a cerrar correctamente.
7. ~~El overlay causó `lyra_cloud_busy`~~ → relación causal `NO_VERIFICADO`, no confirmada; el overlay no escribe la signal en el código inspeccionado.
8. ~~Service worker restart implica pérdida de estado en memoria de Lyria~~ → son dos procesos distintos de Chrome; el SW puede reiniciar sin que la página de Aurora se recargue.
9. ~~Pantalla inicial sin banner permite inferir `READY probable`~~ → ausencia de señal negativa no es evidencia positiva; corresponde `UNKNOWN`.
10. ~~Respuesta parcial se clasifica como `COMPLETED`~~ → corresponde `INTERRUPTED`/`FAILED` con `partialArtifact` preservado.
11. ~~`AURORA_CLOUD_ASK` enviado significa "tool enviada"~~ → son fases distintas de una cadena de 11 pasos (sección 5).
12. ~~El reinjector solo actúa en discard/frozen~~ → actúa en cualquier `status:'complete'`, `tab_activated`, `worker_boot`, instalación, o invocación manual.
13. ~~No existe convención de tests JS en el repo~~ → existe (`tests/ui/*.mjs`, Bun).
14. ~~El repositorio principal conserva un snapshot fijo de cambios preexistentes~~ → no verificable de forma persistente; es territorio concurrente.

---

## Checkpoint 1 — actualizado, `NOT_READY` para autorización (sin cambios de veredicto, solo de contenido)

**Estado:** este documento corrige el contrato; **no se solicita autorización de implementación en esta entrega** (instrucción explícita del Orchestrator).

Si en una fase futura se autoriza, el Checkpoint 1 debe contener **tres** archivos, con los tipos reflejando la separación final de esta v3 (corrección: v2 todavía citaba `ActivityState`/`ChannelState` como si fueran un solo eje cada uno):

1. `extensions/aihub/content-scripts/relay/provider-health/types.js` — constantes de `AvailabilityState`, `RequestActivityState`, `JobState`, `ChannelState` (los 6 estados verificados, `ONLINE` documentado aparte como `PROPUESTA_DERIVADA`), forma de `EvidenceEntry` (con `evidenceId`/`sourceClass`/`authority`/`correlationGroup`/`patternId`), `AttemptIdentity` (`logicalJobId`+`attemptId`), `PartialArtifactRef`, y forma de los tres contratos de evento (`provider.availability.changed`, `provider.request.activity.changed`, `cloud.job.state.changed`) — patrón IIFE clásico, sin ESM.
2. `extensions/aihub/content-scripts/relay/provider-health/validate.js` — validadores puros de forma, mismo patrón que `validateProviderAdapter` de `relay-contract.js`.
3. `tests/provider-health/test_contract.mjs` — pruebas deterministas de ambos archivos, siguiendo la convención ya existente de `tests/ui/*.mjs`.

Criterios de aceptación (actualizados v3): los tres ejes (`Availability`/`RequestActivity`/`JobState`) más `Channel` están definidos por separado, sin mezclar `PAUSED`/`BLOCKED` dentro de `RequestActivity`; `logicalProviderId`/`effectiveAdapterId` diferenciados en los tres eventos; `logicalJobId`/`attemptId` diferenciados; `validate.js` rechaza formas inválidas (ausencia de `sequence`, `evidenceId` mal referenciado en `contradicts`, texto libre en `EvidenceEntry` en lugar de `patternId`/`reasonCode`, `partialArtifact.text` embebido en vez de `partialArtifactRef`, `source:"endpoint_registry"` o `source:"harness"` en `provider.availability.changed`); cero cambios en archivos existentes; `node --check` limpio; `bun tests/provider-health/test_contract.mjs` pasa.

---

## Preguntas abiertas (v3 — las que exigían decisión ya están cerradas en este documento; solo quedan follow-ups explícitamente permitidos)

**Cerradas en esta corrección (ya no son preguntas abiertas):** nombres y scope de los tres eventos (sección 4); autoridad de `Availability` (solo `adapter`, nunca `endpoint_registry`/`harness`); tratamiento de Channel (Opción B adoptada — sin evento nuevo); privacidad de `partialArtifact` (`partialArtifactRef`); lista completa de reconciliación (15 preguntas, sección 8).

**Siguen abiertas, explícitamente permitidas como follow-up posterior (no bloquean tipar `RequestActivity`/`JobState`/eventos/`Availability`/Channel/privacidad):**

1. ¿Dónde vive el motor de clasificación real (MAIN world por frame vs. background agregando snapshots)?
2. ¿Canal de transporte para los eventos: propio o reutilizar `AURORA_CLOUD_*`/`chrome.runtime` existente?
3. Relación exacta con AI-Cloud Memory (Fase 6 del checklist).
4. ¿Generalizar "Answer now" (hoy exclusivo de ChatGPT) como consumidor de `STALLED`, o mantenerlo aparte?
5. Mecanismo concreto para pruebas de tab discard/SW restart sin depender de un dominio real (browser harness).
6. ¿Existe hoy algún gate real de "tool autorizada" (paso 5 de ToolLifecycle) en el código, o toda tool detectada y bien formada se despacha automáticamente? `NO_VERIFICADO`, no investigado en ninguna fase de este documento.
7. ¿Pueden `cloud.js` y `duo.js` activar `cloudGenerando` de forma solapada en la UI actual (ej. iniciar Duo mientras un turno normal de Lyra Cloud está en curso)? `NO_VERIFICADO`.

---

## CHECKLIST_DELTA (v3, reemplaza completamente el de v2)

**Hechos corregidos respecto a v2:**
- `RequestActivity`/`JobState`/`ToolLifecycle` separados en tres nociones distintas — v2 los mezclaba bajo un solo eje `Activity`.
- `ejecutarPreparada()` NO ejecuta tools — la ejecución real ocurre server-side vía `processJSONFamily → postJSON('/json-family/process')`; el cliente solo persiste/presenta resultados ya calculados. Confirmado leyendo `cloud.js:28-37` y `json-family-client.js:4-9`.
- `resumeOnly` (comportamiento actual, `HECHO_VERIFICADO`) reutiliza el mismo `requestId` al reanudar un turno tras crash/reload — distinto del `attemptId` nuevo propuesto para reintentos por disponibilidad, que es diseño futuro no implementado.
- Channel decidido: sin evento nuevo (`provider.channel.changed` descartado), `AuroraEndpointRegistry` permanece autoridad única, consultable directamente.
- Channel "mapea 1:1" era falso — `ONLINE` no es producido hoy por `endpoint-registry.js`, se marca `PROPUESTA_DERIVADA`.
- `Availability` solo puede emitirse con `source:"adapter"` — `endpoint_registry` retirado como fuente autoritativa (puede aportar evidencia contradictoria, nunca `state` directo).

**Sobreafirmaciones retiradas (v3, sobre v2):** las 7 listadas por Navigator en `remaining_overclaims` — Channel "1:1", `COMPLETED` atribuido prematuramente a `AURORA_CLOUD_ANSWER`, autoridad incorrecta de `ejecutarPreparada()`, conteo erróneo de preguntas de reconciliación (decía 6, había 5 — ahora son 15 explícitas y completas), Availability admitiendo Endpoint Registry, fila 16 presuponiendo `READY`, título "Tool enviada" describiendo en realidad un ASK.

**Contratos finales:** `provider.availability.changed` (solo `adapter`), `provider.request.activity.changed` (RequestActivity por intento), `cloud.job.state.changed` (JobState por job lógico, incluye `partialArtifactRef`), `provider.health.snapshot` (vista derivada). Sin `provider.channel.changed` — decisión explícita, Opción B.

**Escenarios corregidos en v3:** filas 3, 7, 8, 11, 16 (las 5 pendientes exigidas por Navigator tras v2), sumadas a las 13 ya corregidas en v2.

**Privacidad de evidencia:** además de lo ya corregido en v2, `partialArtifact.text` embebido retirado del bus de eventos — reemplazado por `partialArtifactRef` (referencia durable con `privacyClass`/`allowedConsumers`/TTL, sin contenido).

**Reconciliación:** de 5 preguntas incompletas (v2) a 15 preguntas explícitas y completas, con distinción de ACK backend / ACK relay / entrega al proveedor / aceptación por el proveedor como cuatro verdades independientes.

**Preguntas abiertas cerradas en v3:** scope/nombres de eventos, autoridad de Availability, tratamiento de Channel, privacidad de artefactos parciales, lista de reconciliación — ya no son preguntas abiertas, están decididas en este documento.

**Preguntas abiertas que siguen legítimamente abiertas (follow-up, no bloquean):** ubicación del motor de clasificación, canal de transporte de eventos, relación con AI-Cloud Memory, generalización de "Answer now", browser harness para discard/SW-restart, existencia de gate de autorización de tools, posible solapamiento Duo/enviarACloud.

**Siguiente acción exacta:** Navigator revisa el delta documental de esta v3 (commit exacto, ver abajo). Solo tras su aprobación, el Orchestrator decide si autoriza expresamente el Checkpoint 1 (3 archivos, tipos ya reflejando la separación final de v3).

**Puntos que todavía NO deben marcarse como completados:** discovery corregido aprobado; contrato canónico cerrado; Checkpoint 1 autorizado; Provider Health Sensor implementado; ninguna prueba viva de Qwen realizada; ninguna corrección del reinjector aplicada; ningún archivo de código (`types.js`/`validate.js`/tests) creado todavía.
