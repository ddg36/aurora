# Provider Health Sensor — Discovery, diagnóstico y diseño verificable

**Fecha:** 2026-07-19 (v2, corrección documental tras revisión de Navigator)
**Repositorio:** `/media/almacen/deml/Downloads/core_instruction/aurora`
**Branch:** `task/provider-health-sensor`
**Worktree:** `/media/almacen/deml/Downloads/core_instruction/aurora-provider-health-sensor`
**Base commit original:** `17e1e710c1e33058142eaf7ba519bbde51643c00` (`17e1e71`)
**Commit v1 (revisado, `CHANGES_REQUIRED`):** `e197a5994de4406c27fcbbf13ea8bb7abe5194ac`
**Commit v2 (esta versión):** ver `DRIVER_PROVIDER_HEALTH_DISCOVERY_CORRECTED` al final.
**Estado inicial de esta corrección:** worktree en `task/provider-health-sensor`, HEAD `e197a599`, `git status` limpio (`HECHO_VERIFICADO`).

## Alcance de este documento

Discovery, lectura, diagnóstico, diseño y planificación. Ningún archivo de producción fue modificado, ni en v1 ni en esta corrección v2. Este archivo es el único artefacto de la fase.

## Nota de versión

Esta v2 corrige **overclaims verificados por Navigator** en v1: afirmaciones de "escritor único"/"lock único" sobre `cloudGenerando` (falsas — `duo.js` es un segundo escritor, confirmado en esta corrección), atribución incorrecta del riesgo de retención indefinida al timeout de `askCloud()` (que sí existe), un modelo de evento único mezclando autoridades distintas, una tabla de escenarios con 13 filas incorrectas, un modelo de evidencia con riesgo de privacidad, y una afirmación falsa sobre ausencia de convención de tests JS en el repo. Cada corrección está marcada explícitamente donde reemplaza contenido de v1.

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

### Activity — propiedad del request/turn/job

**Corrección de v1 (§ scenario_table_verdict, § two_axis_model_verdict):** v1 no tenía ningún estado previo al primer output, forzando `PROGRESSING` prematuramente. Enum corregido, con justificación de cada estado:

```
IDLE | QUEUED | SUBMITTED | WAITING_FIRST_OUTPUT | PROGRESSING |
STALLED | INTERRUPTED | COMPLETED | FAILED | CANCELLED | UNKNOWN
```

- `IDLE` — sin request activo para ese `(provider, paneId)`.
- `QUEUED` — el turno está persistido (`prepared`/`awaiting_answer` en `cloud.js`) pero el `AURORA_CLOUD_ASK` todavía no se envió al relay.
- `SUBMITTED` — `AURORA_CLOUD_ASK` enviado (`postAlRelay(iframe, request)`), esperando primera respuesta del relay. **Corrección de v1 (fila 16, § overclaims_found #11):** "ASK enviado" ≠ "tool enviada" — `SUBMITTED` describe el nivel de protocolo `askCloud`, no el nivel de tool JSON Family, que es una capa distinta dentro de `cloud.js` (`processCloudToolProtocol`, posterior a recibir la respuesta).
- `WAITING_FIRST_OUTPUT` — request aceptado por el relay pero sin `AURORA_CLOUD_CHUNK` ni `AURORA_CLOUD_ANSWER` todavía. Necesario para no forzar `PROGRESSING` antes de que exista progreso real observable.
- `PROGRESSING` — al menos un `AURORA_CLOUD_CHUNK` recibido y `lastChange` actualizándose dentro de la ventana esperada.
- `STALLED` — hubo `WAITING_FIRST_OUTPUT` o `PROGRESSING` y ahora `Date.now() - lastChange` excede el umbral (`STALL_MS` como referencia, `15000ms`), sin que haya llegado un cierre. Ver sección dedicada abajo.
- `INTERRUPTED` — el request se cortó por una causa externa reconocida y potencialmente recuperable: `pane_reload`, `provider_navigation`, cancelación por Stop. **Corrección de v1 (fila 11):** un `pane_reload` NO es `STALLED` (que implica "sigue activo pero sin progreso"), es una interrupción con causa conocida y ruta de recuperación (`recuperarCloudPendiente`).
- `COMPLETED` — `AURORA_CLOUD_ANSWER` con `ok:true` y contenido válido, o tools ejecutadas con `completarTurnoCloud(turnId, 'completed')`.
- `FAILED` — cierre con error no recuperable (`completarTurnoCloud(turnId, 'failed')`, MAX_ITER alcanzado, tool inválida repetida 3 veces).
- `CANCELLED` — el usuario detuvo la generación explícitamente (`detenerCloud`).
- `UNKNOWN` — evidencia insuficiente o contradictoria para clasificar.

**Corrección de v1 (§ two_axis_model_verdict, terminalidad):** `COMPLETED`/`FAILED`/`CANCELLED` son estados **terminales de un lifecycle**, no "actividad viva" permanente. Tras alcanzarlos, el job lógico debe archivarse/cerrarse, o la `activity` observable de ese `(provider, paneId)` debe volver a `IDLE` para el siguiente request — nunca quedar "congelada" en un estado terminal indefinidamente como si describiera el presente.

**Corrección de v1 (fila 15, respuesta parcial):** una respuesta parcial seguida de un corte **no es `COMPLETED`**. Debe representarse como `INTERRUPTED` (si hay ruta de recuperación conocida) o `FAILED` (si no la hay), conservando el artefacto parcial (`partialArtifact`) como evidencia y contenido recuperable, nunca como éxito.

### Channel — propiedad del endpoint físico (nueva en v2, corrige ausencia en v1)

```
BOOTING | ONLINE | IDLE | GENERATING | DISCARDED | FROZEN | OFFLINE | UNKNOWN
```

**HECHO_VERIFICADO**, mapea 1:1 con lo que `endpoint-registry.js` ya produce hoy (`booting`/`idle`/`generating` vía `snapshot.state`, `discarded`/`frozen` vía `tab.discarded`/`tab.frozen`, `offline` vía `cleanup()` por TTL de heartbeat vencido). `ONLINE` se agrega como estado explícito de "el heartbeat llega a tiempo pero no hay snapshot de estado aplicable todavía" (arranque). Esta dimensión **no conoce nada** de cuota, rate limit, auth o challenge — describe exclusivamente si el canal (tab/frame) sigue reportándose vivo. Un `OFFLINE` por `heartbeat_timeout` significa "no llegó heartbeat dentro del TTL de 20s", **no** "el proveedor cayó" (corrección explícita de v1).

---

## 4. Contratos de eventos separados (corrige el evento único de v1)

**Corrección de v1 (§ event_contract_verdict):** v1 proponía un único evento `provider.availability.changed` cargando también campos de `activity` (`jobId`, `activityState`, `lastProgressAt`). Esto mezclaba autoridades con lifecycles y consumidores distintos. Se separa en tres contratos más un snapshot derivado.

### 4.1 `provider.availability.changed`

Autoridad: detector de disponibilidad por proveedor/sesión/pane. Vive por sesión, no por request.

```ts
{
  eventVersion: 1,
  eventId: string,
  sequence: number,              // NUEVO en v2 — contador monotónico por (logicalProviderId, paneId), exigido por Navigator
  logicalProviderId: string,     // NUEVO en v2 — proveedor LÓGICO (p.ej. "qwen"), independiente del adapter efectivo
  effectiveAdapterId: string,    // NUEVO en v2 — adapter que produjo la evidencia (puede ser "generic" si Qwen quedó mal enrutado)
  paneId: string,
  sessionId: string | null,
  previousState: AvailabilityState,
  state: AvailabilityState,
  reasonCode: string,            // slug estable, no texto libre (ver modelo de evidencia)
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",
  evidence: EvidenceEntry[],
  retryAfter: number | null,
  observedAt: number,
  source: "adapter" | "endpoint_registry",  // "harness" RETIRADO de fuentes válidas en producción (corrección de v1)
}
```

**Corrección de v1 (§ event_contract_verdict, problemas concretos):**
- Se separan `logicalProviderId` de `effectiveAdapterId` explícitamente. Si Qwen quedara enrutado a `relay-generic.js` por la carrera del reinjector, `logicalProviderId` sigue siendo `"qwen"` (identidad de negocio/UI) mientras `effectiveAdapterId` refleja `"generic"` (verdad técnica de qué código produjo la evidencia) — sin este campo doble, es imposible distinguir "Qwen está mal" de "el sensor está leyendo el adapter equivocado".
- `sequence` agregado — v1 exigía orden garantizado en prosa pero no lo modelaba como campo.
- `source:'harness'` retirado como fuente válida — el harness (`sol-debug.py`) no es autoridad de un evento de producción, es una herramienta de test (corrección directa del hallazgo de que `lyra_cloud_busy`/`lyra_ui_timeout` no son estados reales).
- `relayInstanceId` **retirado** de este contrato en v2: v1 lo exigía como obligatorio sin fuente definida (`NO_VERIFICADO` en esta fase que exista tal identificador hoy en el código) — se deja como pregunta abierta, no como campo obligatorio prematuro.

### 4.2 `provider.activity.changed`

Autoridad: el job/relay a nivel de request/turn. Vive por intento, no por sesión.

```ts
{
  eventVersion: 1,
  eventId: string,
  sequence: number,
  logicalJobId: string,          // identidad del job de negocio (sobrevive a reintentos/sustituciones)
  attemptId: string,             // NUEVO en v2 — identidad de ESTE intento específico
  requestId: string | null,      // el requestId de askCloud, si aplica
  turnId: string | null,         // el turnId persistido de cloud.js, si aplica (null para Duo)
  paneId: string,
  previousActivity: ActivityState,
  activity: ActivityState,
  lastProgressAt: number | null,
  terminalReason: string | null, // solo si activity es terminal (COMPLETED/FAILED/CANCELLED/INTERRUPTED)
  partialArtifact: { text: string, truncated: boolean } | null,
  observedAt: number,
}
```

Distinción exigida por Navigator y adoptada: `logicalJobId` identifica la intención de negocio ("responder a este prompt del usuario") y persiste a través de reintentos/sustituciones de proveedor; `attemptId` identifica cada intento concreto (un reintento tras `RATE_LIMITED` crea un `attemptId` nuevo bajo el mismo `logicalJobId`, **nunca reutiliza** el `requestId` anterior — ver sección de reconciliación).

### 4.3 `provider.channel.changed`

**PROPUESTA, pregunta abierta:** reutilizar `AuroraEndpointRegistry` tal cual (ya emite implícitamente estos cambios vía su propio storage) versus exponerlo como evento formal separado. No se decide en esta fase — ver Preguntas Abiertas.

### 4.4 `provider.health.snapshot` (vista derivada, no autoridad)

Agregado de solo lectura para UI: combina el último `availability`, `activity` y `channel` conocidos para un `(logicalProviderId, paneId)`. **Nunca** se escribe directamente — se deriva de los tres eventos anteriores. Ningún consumidor debe tratar el snapshot como fuente de verdad si los eventos individuales están disponibles.

---

## 5. Tabla de escenarios — corregida

**Corrección de v1 (§ scenario_table_verdict):** se corrigen las filas 2, 3, 4, 7, 8, 9, 11, 13, 15, 16, 17, 18 y 20 exactamente como exigió Navigator. Se mantiene el resto de la tabla original de v1 sin cambios salvo ajuste de vocabulario a los ejes corregidos.

| # | Escenario | availability | activity | evidencia | confianza | acción | lock | retry | humano |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Stop visible y texto creciendo | READY | PROGRESSING | `getStop()=true` (authoritativeStop) + `lastText` cambia | HIGH (progreso), no del Stop aislado | Seguir esperando, streamear chunks | conservar | no aplica | no |
| **2 (corregida)** | Stop visible sin cambios mucho tiempo | **UNKNOWN** (corrección: un Stop persistente sin texto nuevo NO prueba `READY` — puede ser un Stop obsoleto en un sitio sin `authoritativeStop`) | STALLED | Stop persiste + `Date.now()-lastChange > STALL_MS` | MEDIUM | Emitir aviso (no autoclic), ofrecer intervención manual | conservar | manual únicamente | recomendado |
| **3 (corregida)** | Composer deshabilitado + banner de cuota | QUOTA_EXHAUSTED o RATE_LIMITED | **PAUSED/BLOCKED** (corrección: no `IDLE` — el job no está "sin trabajo", está retenido por una causa externa) | Banner con `reasonCode` específico + composer disabled | HIGH si el patrón está validado por fixture | Detener nuevos envíos, `PAUSED_LIMIT` a nivel de job lógico | conservar el job persistido, liberar locks en memoria | prohibido automático | sí, para reanudar |
| **4 (corregida)** | Composer habilitado, sin respuesta, sin banner | UNKNOWN | **WAITING_FIRST_OUTPUT** antes del umbral de stall; **STALLED** después | Ausencia de señales | LOW/UNKNOWN | No inventar causa; conservar evidencia; permitir diagnóstico manual | conservar | no | recomendado si se prolonga |
| 5 | Sesión cerrada | AUTH_REQUIRED | UNKNOWN | Redirect a login detectado | HIGH si patrón específico | Detener automatización, pedir intervención | liberar | prohibido | sí, obligatorio |
| 6 | CAPTCHA / challenge | CHALLENGE_REQUIRED | UNKNOWN | Challenge conocido detectado | HIGH si selector específico | Pausar, no resolver | liberar | prohibido | sí, obligatorio |
| **7 (corregida)** | Error temporal del proveedor | TEMP_UNAVAILABLE | FAILED (de este intento) | Error 5xx visible | MEDIUM | Crear un **nuevo `attemptId`** bajo el mismo `logicalJobId`, controlado e idempotente (corrección: "backoff limitado" no bastaba, se exige identidad de reintento explícita) | conservar el `logicalJobId` | sí, vía nuevo attempt, acotado | no, salvo repetición |
| **8 (corregida)** | Rate limit con fecha de reintento | RATE_LIMITED | **PAUSED/BLOCKED** (misma corrección que fila 3) | Banner con `retryAfter` parseable | HIGH si se parsea | Pausar hasta `retryAfter` | conservar job persistido | programado, nunca ciego — `retryAfter` despierta una comprobación, no un reenvío automático | no |
| **9 (corregida)** | Job local finalizado pero DOM dice generating | READY debe justificarse por **evidencia separada de disponibilidad**, no inferirse del cierre del request (corrección: v1 mezclaba ambas) | COMPLETED | `AURORA_CLOUD_ANSWER` recibido cierra el REQUEST; no certifica disponibilidad futura de la cuenta | MEDIUM para activity (HIGH para el cierre del protocolo específicamente), evidencia de availability se evalúa aparte | Confiar en el cierre explícito del protocolo para `activity`; no inferir `availability` de esto | liberar activity | no aplica | no |
| **11 (corregida)** | Reload durante generación | UNKNOWN transitorio | **INTERRUPTED** (corrección: no `STALLED` — hay causa conocida y protocolo explícito: `AURORA_CLOUD_RESETTING{reason:'pane_reload'}` → `askCloud` resuelve `pane_reloaded`) | Evento explícito del protocolo | HIGH (protocolo ya existente) | `recuperarCloudPendiente` puede reanudar | transferir vía DB (turno persistido) | sí, vía reanudación explícita, mismo `logicalJobId`, nuevo `attemptId` | no |
| 12 | Tab descartada y restaurada | UNKNOWN hasta reconfirmar | recuperable | `tab.discarded`, reinjector dispara `tab_resumed` | MEDIUM hasta que `probeMain` confirme `effectiveAdapterId` correcto | Re-probar adapter antes de asumir nada; degradar confianza si `effectiveAdapterId` no es el esperado | conservar turno en DB | reconectar canal | no, salvo si el adapter resultante es incorrecto |
| **13 (corregida)** | Service worker reiniciado | UNKNOWN | recuperable vía DB — **evento distinto de un reload de la página Aurora** (corrección explícita de v1, que los mezclaba) | `endpoint-registry` persiste en `chrome.storage.session` (sobrevive a restart del SW); `cloudGenerando` (memoria de la página Aurora) NO sobrevive a un reload de la página Aurora, pero un restart del service worker por sí solo **no recarga la página de Aurora** — son dos procesos distintos de Chrome | MEDIUM | Reconstruir desde DB/turno persistido si la página Aurora también se recargó; si solo el SW reinició, la página Aurora puede seguir con su estado de memoria intacto | depende de cuál de los dos procesos reinició — no unificar | reanudar vía `recuperarCloudPendiente` solo si la página Aurora perdió memoria | no |
| 14 | Adapter específico ausente, `generic` activo | UNKNOWN, confianza degradada explícitamente | UNKNOWN | `effectiveAdapterId !== logicalProviderId` esperado | LOW (generic no tiene señales específicas) | Degradar confianza automáticamente | conservar, marcar riesgo | no | recomendado revisar reinjector |
| **15 (corregida)** | Respuesta parcial seguida de indisponibilidad | transición a X | **INTERRUPTED o FAILED con `partialArtifact`** (corrección: nunca `COMPLETED`) | Texto recibido antes del corte + banner posterior | MEDIUM | Conservar la respuesta parcial como artefacto recuperable, no como resultado final exitoso; `availability` se reclasifica por separado | conservar el resultado parcial | no reintentar el mismo contenido; posible continuación explícita | no, salvo pedir continuar |
| **16 (corregida)** | Tool enviada, resultado aún no confirmado | READY (asumido) | **SUBMITTED** para el nivel `askCloud`; la fase de tool (parseada/autorizada/ejecutada/resultado recibido/persistido/feedback entregado) es una **subcadena distinta dentro de `activity`**, no un valor único (corrección: v1 trataba "ASK enviado" como equivalente a "tool enviada") | `AURORA_CLOUD_ASK` enviado sin `AURORA_CLOUD_ANSWER` todavía | MEDIUM | Seguir esperando dentro del timeout de `askCloud` (10min ya existente) | conservar | el propio `askCloud` ya reintenta el post en `resumeOnly` (protocolo existente) — no es un retry del sensor | no |
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

---

## 8. Jobs, locks, pausa y sustitución — corregido

**Corrección de v1 (§ job_and_lock_rules_verdict):** se elimina cualquier propuesta de conservar un lock EN MEMORIA indefinidamente durante `UNKNOWN`, `RATE_LIMITED` o `QUOTA_EXHAUSTED`. Se separan explícitamente las nociones ya nombradas en la sección 1 (busy signal, request in flight, turn ownership, reservation, writer lease, persisted job) y se añade **durable claim**.

Para `RATE_LIMITED`/`QUOTA_EXHAUSTED`/`AUTH_REQUIRED`/`CHALLENGE_REQUIRED`:

1. Persistir el job lógico (ya existe el mecanismo: `guardarTurnoCloud`/DB).
2. Liberar cualquier lock en memoria (la busy signal, el request in flight) — no tiene sentido mantener `cloudGenerando=true` en la página Aurora mientras se espera indefinidamente a un proveedor pausado.
3. Liberar el writer lease del rol (permitir que Lyria Orchestrator asigne otro proveedor/agente a la misión mientras este espera).
4. Conservar un **durable claim**: un registro que impide que dos intentos distintos ataquen el mismo `logicalJobId` simultáneamente, identificado por `logicalJobId + attemptId` (no por `requestId` reutilizado).

**Regla de reconciliación antes de cualquier retry o sustitución** (exigida por Navigator, ausente en v1): antes de crear un nuevo `attemptId`, determinar el estado real del intento anterior:

- ¿nunca fue aceptado por el relay? → seguro reintentar desde cero.
- ¿sigue en vuelo? → no reintentar todavía, esperar resolución o cancelar explícitamente primero.
- ¿terminó parcialmente (`partialArtifact`)? → conservar el parcial, decidir si continuar desde ahí o descartar.
- ¿ya ejecutó tools? → **no re-ejecutar tools** — el resultado ya persistido (`resultadoToolPersistible`, ya existente en `cloud.js`) debe reusarse, exactamente como el propio código actual ya hace para el caso de reanudación tras crash (`yaGuardado?.feedback`, línea 587 de `cloud.js`).
- ¿recibió ACK del servidor? → si sí, el servidor ya considera el resultado entregado; un reintento no debe duplicar la entrega.

**Corrección explícita:** nunca reutilizar el mismo `requestId` al sustituir de proveedor o reintentar tras una pausa — cada intento nuevo es un `attemptId` nuevo bajo el mismo `logicalJobId`. `retryAfter` **despierta una comprobación de disponibilidad**, nunca reenvía el prompt automáticamente.

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

Si en una fase futura se autoriza, el Checkpoint 1 debe contener **tres** archivos (no dos, corrección de v1 que omitía tests desde el inicio):

1. `extensions/aihub/content-scripts/relay/provider-health/types.js` — constantes de `AvailabilityState`, `ActivityState`, `ChannelState`, forma de `EvidenceEntry` y de los tres contratos de evento — patrón IIFE clásico, sin ESM.
2. `extensions/aihub/content-scripts/relay/provider-health/validate.js` — validadores puros de forma, mismo patrón que `validateProviderAdapter` de `relay-contract.js`.
3. `tests/provider-health/test_contract.mjs` — pruebas deterministas de ambos archivos, siguiendo la convención ya existente de `tests/ui/*.mjs`.

Criterios de aceptación (actualizados): los tres estados/ejes documentados en este archivo están definidos y documentados con `logicalProviderId`/`effectiveAdapterId` diferenciados; `validate.js` rechaza formas inválidas (incluida ausencia de `sequence`, `evidenceId` mal referenciado en `contradicts`, texto libre en lugar de `patternId`/`reasonCode`); cero cambios en archivos existentes; `node --check` limpio; `bun tests/provider-health/test_contract.mjs` pasa.

---

## Preguntas abiertas (actualizadas)

1. ¿Dónde vive el motor de clasificación real (MAIN world por frame vs. background agregando snapshots)? Sigue sin resolverse.
2. ¿Canal propio para los tres eventos o reutilizar el transporte `AURORA_CLOUD_*`/`chrome.runtime` existente?
3. Relación exacta con AI-Cloud Memory (Fase 6 del checklist) — sigue pendiente.
4. ¿Generalizar "Answer now" (hoy exclusivo de ChatGPT) como consumidor de `STALLED`, o mantenerlo aparte?
5. Mecanismo concreto para pruebas de tab discard/SW restart sin depender de un dominio real — sigue sin decidirse.
6. **Nueva:** ¿existe hoy algún concepto de "tool autorizada" (paso 7 de la cadena de 11) en el código, o toda tool detectada se ejecuta sin gate explícito? No se investigó en esta fase — relevante para saber si el sensor necesita modelar ese paso o si es vacío en la implementación actual.
7. **Nueva:** ¿`provider.channel.changed` debe ser un evento nuevo o basta con que el sensor lea `AuroraEndpointRegistry` directamente sin re-emitir? No se decide en esta corrección.
8. **Nueva:** si `cloud.js` y `duo.js` pueden, en teoría, activar `cloudGenerando` de forma solapada, ¿es eso posible en la UI actual (ej. iniciar Duo mientras un turno normal de Lyra Cloud está en curso)? No investigado — relevante para saber si el sensor debe modelar colisión de escritores como un escenario más, o si la UI ya lo previene estructuralmente.

---

## CHECKLIST_DELTA (v2, reemplaza completamente el de v1)

**Hechos corregidos respecto a v1:**
- `cloudGenerando` tiene ≥2 escritores (`cloud.js`, `duo.js`), confirmado por lectura directa de `duo.js:108-114`.
- `askCloud()` sí tiene watchdog de 600000ms por defecto; el riesgo real de retención está en la ventana previa al `try/finally` de `enviarACloud` y en `fetch()` de `api.js` sin `AbortSignal` (confirmado por lectura de `api.js`).
- Existen tests JS (`tests/ui/*.mjs`, Bun) — se retira el overclaim de "no existe convención".
- El reinjector actúa en más triggers que discard/frozen: cualquier `status:'complete'`, `tab_activated`, `worker_boot`, instalación, invocación manual.

**Sobreafirmaciones retiradas:** las 14 listadas en la sección 12 de este documento.

**Contratos separados:** `provider.availability.changed`, `provider.activity.changed`, `provider.channel.changed` (pregunta abierta), `provider.health.snapshot` (vista derivada) — reemplazan el evento único de v1.

**Estados pendientes de decisión:** ver Preguntas Abiertas (8 puntos, 3 nuevos respecto a v1).

**Escenarios corregidos:** filas 2, 3, 4, 7, 8, 9, 11, 13, 15, 16, 17, 18, 20 de la tabla de 20 escenarios.

**Privacidad de evidencia:** `EvidenceEntry` rediseñado sin texto libre por defecto (`patternId`/`reasonCode`/booleanos estructurales en vez de `normalizedText`/hash).

**Reglas de attempts y reconciliación:** `logicalJobId` + `attemptId` diferenciados; reconciliación obligatoria de 6 preguntas antes de cualquier retry/sustitución; prohibición de reutilizar `requestId`.

**Convención de tests:** `tests/provider-health/test_contract.mjs`, patrón IIFE clásico sin ESM para los archivos de content script.

**Riesgo del reinjector:** ampliado a `PLAUSIBLE_Y_NO_REPRODUCIDO` con alcance de triggers corregido (no limitado a discard/frozen).

**Siguiente acción exacta:** Navigator revisa el delta documental de esta v2 (commit exacto, ver abajo). Solo tras su aprobación, el Orchestrator decide si autoriza expresamente el Checkpoint 1 corregido (3 archivos, incluyendo tests desde el inicio).

**Puntos que todavía NO deben marcarse como completados:** discovery aprobado; contrato canónico aprobado; Provider Health Sensor implementado; Checkpoint 1 autorizado; ninguna prueba viva de Qwen realizada; ninguna corrección del reinjector aplicada.
