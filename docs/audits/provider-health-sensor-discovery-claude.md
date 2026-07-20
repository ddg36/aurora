# Provider Health Sensor — Discovery, diagnóstico y diseño verificable

**Fecha:** 2026-07-19
**Repositorio:** `/media/almacen/deml/Downloads/core_instruction/aurora`
**Branch:** `task/provider-health-sensor`
**Worktree:** `/media/almacen/deml/Downloads/core_instruction/aurora-provider-health-sensor`
**Base commit:** `17e1e710c1e33058142eaf7ba519bbde51643c00` (`17e1e71`)
**Result commit:** ver `DRIVER_PROVIDER_HEALTH_DISCOVERY_COMPLETED` al final de este documento.
**Estado inicial:** worktree creado desde `17e1e71`, `git status` limpio al iniciar (`HECHO_VERIFICADO`).

## Alcance

Discovery, lectura, diagnóstico, diseño y planificación. Ningún archivo de producción fue modificado. Este documento es el único artefacto de esta fase.

## Exclusiones explícitas

Gemini Clone, normalización ANSI, unificación Lyria↔Cloud, `relay-reinjector.js` (solo se audita, no se corrige), Provider Scout, AI-Cloud Memory, CLI Agent Controller, implementación del sensor.

## Metodología

Lectura directa de código fuente en el worktree aislado (`grep -a` — el repo usa al menos un archivo, `lyra.js`, con bytes que confunden la heurística binaria de `grep` sin `-a`, lección de la sesión anterior). Ninguna prueba viva contra Qwen. Ninguna interacción sintética con UI. Toda afirmación está etiquetada `HECHO_VERIFICADO` (leído en código real), `INFERENCIA` (deducido, no ejecutado), `PROPUESTA` (diseño futuro), `NO_VERIFICADO`, `BLOCKED_EXTERNAL` o `BLOCKED_BY_ENVIRONMENT`.

## Archivos inspeccionados

- `extensions/aihub/content-scripts/relay/relay-core.js` — motor común (enviarVerificado, seguirTarget/leer/chequearFin, sincronizarHilo, handshake READY/PING, watcher de stall).
- `extensions/aihub/content-scripts/relay/relay-contract.js` — validación de adapters, registro, `findProvider`.
- `extensions/aihub/content-scripts/provider-relay.js` — courier (ya inspeccionado en sesión previa: `mark()`, retry exponencial capado en 30s, sin límite de reintentos).
- `extensions/aihub/content-scripts/relay/providers/relay-qwen.js` — adapter Qwen (`isGenerating` siempre `false`, sin selector de Stop).
- `extensions/aihub/background.js` — `snapshotProvider`, `deliverToOrigin` (ya inspeccionado en sesión previa).
- `extensions/aihub/background/endpoint-registry.js` — registro físico/lógico de endpoints, TTL de heartbeat, estados `discarded`/`frozen`/`offline`.
- `extensions/aihub/background/relay-reinjector.js` — recuperación de couriers/adapters tras reload, tabs congeladas/descartadas.
- `ui/modules/lyra/scripts/chat/cloud.js` — `enviarACloud` (máquina de estados de turno persistido), `recuperarCloudPendiente`.
- `ui/modules/lyra/scripts/chat/mensajes.js` — señal `cloudGenerando`.
- `ui/components/shared/cloud-ask.js` — `askCloud`, `esperarRelay`, `nuevaConversacionCloud`, protocolo `AURORA_CLOUD_ASK/ANSWER/CHUNK/STATUS/RESETTING`.
- `ui/modules/lyra/view/lyra.js` — consumo de `cloudGenerando`, banner `cloudStalled` (solo ChatGPT).
- `scripts/SOL-debug-tools/sol-debug.py` — harness de test (`start_lyra_job`), origen real de `lyra_cloud_busy`/`lyra_ui_timeout`.
- `ai-cloud/AI-cloud.md`, `ai-cloud/memories/chatgpt-orchestrator-memories.md`, `ai-cloud/CHECKLIST-ACTIVO.md` — contexto canónico de orquestadores, leídos sin modificar.

---

## Arquitectura actual (mapa de jobs)

**HECHO_VERIFICADO** — Existen **tres sistemas de "job" independientes**, sin jerarquía formal entre ellos:

### 1. Turno persistido de Lyra Cloud (`cloud.js` → `enviarACloud`)

- Nace en `enviarACloud({iframe, texto, aiId, url, ...})`, `turnId = nuevoTurnId()`.
- Persistido en DB vía `guardarTurnoCloud(turnId, {...})` con `status` ∈ `{prepared, awaiting_answer, answer_received, executing_tools, feedback_ready}` (mecanismo de reanudación tras crash/reload — `recuperarCloudPendiente()` lo lee vía `POST /cloud-agent/turn/recover`).
- Un único flag booleano global (`cloudGenerando` signal, `mensajes.js:11`) marca "hay un turno en curso": `true` al entrar a `enviarACloud`, `false` únicamente en el bloque `finally` (línea 665-667) — un solo escritor, un solo punto de liberación. **No hay TTL ni watchdog**: si el `await` dentro del loop (`askCloud(...)`) nunca resuelve, `cloudGenerando` permanece `true` indefinidamente. Esto es coherente con lo observado: los jobs `lyra_cloud_busy` del harness no son un bug de gestión de flag, sino evidencia de que una llamada anterior seguía genuinamente en curso.
- Bucle de iteración de tools: `for (iter < MAX_ITER)`, corta por `completed`/`failed` (`completarTurnoCloud`), o por `MAX_ITER` alcanzado (circuito de seguridad ya existente).
- Liberación de lock: solo el `finally` de `enviarACloud`. No hay lease explícito ni expiración — el "lock" es en memoria (signal), no persiste entre reloads de la página Aurora (si Aurora recarga, `cloudGenerando` vuelve a `false` por defecto, pero el turno en DB puede seguir en `awaiting_answer` — de ahí existe `recuperarCloudPendiente`).

### 2. Petición ASK/ANSWER (`cloud-ask.js` → `askCloud`)

- `requestId` por llamada (`cloud-${Date.now()}-${_seq}` o el provisto por el llamador).
- Vive dentro de una `Promise` con `setTimeout(timeoutMs)` (default 600000ms = 10min) que SÍ tiene watchdog propio: al vencer, llama `detenerCloud()` (clic en Stop del proveedor) y resuelve con `reason:'parent_timeout'`.
- Estados observables vía mensajes: `AURORA_CLOUD_CHUNK` (progreso), `AURORA_CLOUD_ANSWER` (fin), `AURORA_CLOUD_RESETTING` (navegación/reload del pane), `AURORA_CLOUD_STATUS` (traza libre, ver `globalThis.__auroraCloudTrace`).
- `_pendingAnswers` (outbox): si la respuesta llega mientras nadie escucha (Aurora recargó a mitad de camino), queda cacheada hasta el ACK — permite replay (`replayed:true`).
- Este es el nivel donde el **watchdog real de 10 minutos** existe. Es el candidato natural para anclar el "job" formal del sensor.

### 3. Ciclo del courier (`provider-relay.js`, independiente de Lyra)

- Ya documentado en sesión previa: `captured → delivering → waiting(aurora_processing) → delivered | error`. Retry exponencial (`Math.min(30000, 1000 * 2**intentos)`) **sin límite de intentos** — solo limita el *delay*, no la cantidad. Corre para CUALQUIER superficie (tab normal, no solo Lyra/Cloud) y es el mecanismo que ejecuta tools detectadas por polling, no por un ASK explícito.

**Separación crítica (harness):** `lyra_cloud_busy` y `lyra_ui_timeout` **no son estados de Aurora**. Son vocabulario exclusivo de `sol-debug.py:start_lyra_job` (líneas 410-526), un script de prueba que lee la señal real `cloudGenerando` como precondición y decide sus propios estados (`starting/running/done/error`). Ningún código de producción emite esas dos cadenas.

---

## Mapa de relay (señales de generación/finalización)

**HECHO_VERIFICADO**, `relay-core.js`:

- `getStop()` — detecta el botón Stop vía `observe.getStopControl()`. Confiable SOLO si `policies.authoritativeStop === true` (ChatGPT). Para Gemini/Qwen/generic, `authoritativeStop: false` — Stop no es señal de cierre.
- `observe.isGenerating()` — implementado por cada adapter. **HECHO_VERIFICADO en `relay-qwen.js`:** `isGenerating: () => Boolean(first(SELECTORS.stop))` con `SELECTORS.stop: []` (array vacío) → **siempre `false`**, incondicionalmente. No es una señal débil: es una señal ausente.
- Detección de fin por estabilidad de texto: `chequearFin()`, `FIN_IDLE = 8000ms` sin cambios de `lastChange`, con mínimo de 12000ms desde el envío (`minimo`) para no cerrar sobre un turno viejo re-renderizado.
- Cierre rápido autoritativo: `programarCierreStop()`, solo si `stopAuthoritative` y ya se vio Stop una vez (`vioGenerando`) y luego desapareció, con ventana de estabilización `STOP_SETTLE_MS = 650ms`.
- Watcher de stall YA EXISTENTE (`relay-core.js:688-703`): `STALL_MS = 15000`. Si `observe.isToolWorking?.()` (hook opcional, solo ChatGPT lo implementa hoy) sigue verdadero mientras el texto no cambia por más de 15s, emite `AURORA_CLOUD_TOOL_STALLED` **una sola vez por turno**. Principio de diseño ya codificado explícitamente en un comentario: *"avisar a Lyra... nunca autoclic"*. Esto es precedente arquitectónico directo para el sensor: notificar, nunca actuar solo.
- Handshake de vida: `AURORA_CLOUD_READY` anunciado cada 250ms hasta 20 veces (5s), reiniciable por `AURORA_CLOUD_PING` (el padre lo llama cada 1s mientras espera, `cloud-ask.js:118`) — **no hay abandono real** mientras el padre siga preguntando.

**HECHO_VERIFICADO**, `endpoint-registry.js`:

- Estados de endpoint: `booting`, `idle`, `generating` (vía `snapshot.state`, `background.js`: `generating ? 'generating' : composerReady ? 'idle' : 'booting'`), `discarded`, `frozen`, `offline` (con `offlineReason` ∈ `{heartbeat_timeout, pagehide, rebound, tab_removed}`).
- `HEARTBEAT_TTL_MS = 20000` — un endpoint sin heartbeat en 20s se marca `offline` en el próximo `cleanup()`.
- Esta capa NO sabe nada de disponibilidad del proveedor (cuota, auth, challenge) — solo de si el *canal físico* (tab/frame) sigue reportándose vivo.

---

## Fuentes actuales de "busy"/"generating" y qué demuestran

| Señal | Qué demuestra | Qué NO demuestra | Cómo queda obsoleta | Falso positivo típico |
|---|---|---|---|---|
| `cloudGenerando` (signal) | Hay un `enviarACloud()` en vuelo (memoria de Aurora) | Que el proveedor esté progresando; puede estar colgado dentro de un `await` sin fin | Solo se limpia en `finally` — si el await nunca resuelve, queda `true` para siempre hasta reload de Aurora | Ninguno de por sí (es un lock correcto), pero es "todo o nada": no distingue progreso real de cuelgue |
| `observe.getStop()` (botón Stop) | En ChatGPT (authoritativeStop): el sitio aceptó el envío | En Gemini/Qwen/generic: nada confiable — puede persistir 40s+ idle (comentario ya existente en el código) | Persiste tras terminar la generación en algunos sitios | Alto en providers sin `authoritativeStop` |
| `observe.isGenerating()` | Depende 100% del adapter | En Qwen: nada — está hardcodeado a `false` | N/A (nunca es verdadero) | Falso negativo permanente en Qwen |
| Crecimiento de `lastText`/`lastChange` | El DOM cambió | Que el cambio sea la respuesta real (puede ser ruido del sitio) | Se resetea con cada mutación observada, incluso irrelevante | Bajo, pero posible con animaciones/typing indicators que no son la respuesta |
| `FIN_IDLE` (8s sin cambio) | Ausencia de cambio reciente | Causa de la ausencia (¿terminó? ¿se colgó? ¿está pensando en silencio?) | Nunca "vence" en sí — es la señal misma | Puede cerrar prematuramente un turno con pausas largas legítimas |
| `sawGenerating`/`sawStopButton` (harness) | Se observó la señal EN ALGÚN momento de la ventana de polling | Que siga siendo cierta AHORA | Se acumulan con `||=`, nunca se limpian dentro del mismo job | Confirmado en esta sesión: el harness reportó ambos en `true` en un timeout que probablemente correspondía a Qwen genuinamente lento, no a un bug |
| `document.hidden` | La pestaña está en background | Nada sobre el proveedor | Cambia con foco de SO/navegador | Ninguno relevante para disponibilidad |
| `AuroraEndpointRegistry` state `offline` | El canal físico dejó de reportar heartbeat por 20s+ | Causa (¿tab cerrada? ¿crash? ¿simplemente usuario cambió de tab y el heartbeat es más lento?) | Se recalcula en cada `cleanup()` | Puede confundir "tab en background con heartbeat más lento" con "canal muerto" si el intervalo de heartbeat no es sub-20s garantizado |

**Señales fuertes** (alta confianza aislada): `AURORA_CLOUD_ANSWER` recibido con `ok:true` y texto no vacío (fin real confirmado por el propio protocolo). `getStop()` en providers con `authoritativeStop:true`.
**Señales débiles** (nunca solas): `isGenerating()` en providers sin Stop confirmado. Estabilidad de texto sola. `document.hidden`.
**Señales derivadas**: `chequearFin()` combina estabilidad + mínimo tiempo + ausencia de Stop.
**Señales ambiguas**: silencio total (sin banner, sin turno nuevo, sin error) — el caso central de este documento.
**Específicas de proveedor**: `getStop()`, `isToolWorking()`, cualquier banner de cuota/rate-limit (ninguno implementado hoy para ningún proveedor — `NO_VERIFICADO` que exista siquiera un selector de banner en el código actual).

---

## Modelo de disponibilidad/actividad: dos ejes vs. un eje

**PROPUESTA**, con justificación comparativa explícita (instrucción: no adoptar automáticamente).

### Opción A — Un solo eje (enum plano combinado)

```
READY | BUSY | PROGRESSING | STALLED | RATE_LIMITED | QUOTA_EXHAUSTED |
AUTH_REQUIRED | CHALLENGE_REQUIRED | TEMP_UNAVAILABLE | RESTRICTED |
COMPLETED | FAILED | CANCELLED | UNKNOWN
```

Problemas concretos observados al aplicarlo a los escenarios reales de este proyecto:

1. **Explosión combinatoria oculta.** ¿Qué estado usar cuando un job está `PROGRESSING` (avanza texto) mientras el DOM también muestra un banner de `RATE_LIMITED` que aún no bloqueó el turno actual? Con un eje hay que inventar una prioridad arbitraria.
2. **Vidas distintas.** La disponibilidad del proveedor es una propiedad de **sesión/cuenta** (dura minutos u horas — cuota, auth). La actividad es una propiedad de **job individual** (dura segundos). Forzarlas al mismo enum implica que cada nuevo job "resetea" accidentalmente el estado de disponibilidad, o que una disponibilidad vieja contamina jobs nuevos que sí podrían progresar.
3. **Choca con la separación exigida en este mismo documento** (sección siguiente): disponibilidad del proveedor ≠ actividad del job ≠ estado de UI ≠ estado del relay ≠ estado del harness. Un enum combinado no puede representar "proveedor READY globalmente" + "este job específico STALLED" sin ambigüedad de lectura.
4. **Ya existe precedente en el propio código que separa estas nociones**: `endpoint-registry.js` separa `state` (booting/idle/generating/discarded/frozen/offline) del futuro campo de disponibilidad — nunca los mezcla.

### Opción B (recomendada) — Dos ejes independientes

```
availability: READY | RATE_LIMITED | QUOTA_EXHAUSTED | AUTH_REQUIRED |
              CHALLENGE_REQUIRED | TEMP_UNAVAILABLE | RESTRICTED | UNKNOWN

activity:     IDLE | PROGRESSING | STALLED | COMPLETED | FAILED |
              CANCELLED | UNKNOWN
```

Justificación:

- Cada eje tiene una **autoridad natural distinta** (ver sección siguiente): `availability` la produce un detector de banners/estado de cuenta a nivel de página/sesión; `activity` la produce el job/relay a nivel de turno.
- Permite representar honestamente combinaciones reales: proveedor `READY` + job `STALLED` (Qwen disponible pero este turno específico no avanza) es exactamente el caso que originó esta misión.
- Evita inventar prioridades: un consumidor (Lyria Orchestrator) puede decidir su propia regla de negocio (`si availability != READY → pausar todo`; `si activity == STALLED → avisar, no autoclic`) sin que el sensor tenga que precodificar esa jerarquía.
- Reduce el número de estados por eje (7 y 6, mejor que 14 combinados) y cada uno es más fácil de testear de forma aislada con fixtures.

**Decisión de `STALLED`:** se modela como **subestado del eje `activity`**, no como estado de `availability` ni como dimensión independiente. Razón: `STALLED` describe "este job específico dejó de mostrar progreso", que es exactamente la misma naturaleza temporal que `PROGRESSING`/`COMPLETED` (por turno), no la de disponibilidad de cuenta (por sesión). El watcher de stall ya existente en `relay-core.js` confirma esto empíricamente: se dispara por turno (`stallAvisado`, reseteado en cada `seguirTarget()`), nunca por sesión completa.

---

## Separación de autoridad por dimensión

**PROPUESTA**, respondiendo directamente a la exigencia de no convertir ninguna bandera visual en verdad global:

| Dimensión | Autoridad (quién decide) | Vive en | Nunca debe ser confundida con |
|---|---|---|---|
| Disponibilidad del proveedor | Detector de banners/estado de cuenta (nuevo, por-adapter, opcional) leyendo DOM específico de cada sitio | Por conversación/sesión de ese proveedor | Actividad de un job puntual |
| Actividad del job | El propio `askCloud`/courier, combinando señales del relay | Por `requestId`/turno | Estado visual genérico de la pestaña |
| Estado visual de la interfaz (Lyra/Cloud UI) | React/Preact signals (`cloudGenerando`, `cloudStalled`) | Por render de Aurora | Estado real del DOM del proveedor (puede quedar obsoleto tras un reload de Aurora) |
| Estado del relay | `relay-core.js` (`observe.isGenerating()`, `getStop()`, MutationObserver) | Por frame/adapter | Estado del job (el relay puede reportar "generando" sin que exista ningún job de Lyra activo — ej. el usuario escribió directo en el sitio) |
| Estado del harness (`sol-debug.py`) | El propio script de prueba | Solo durante la ejecución de un comando CLI | Cualquier estado de producción — confirmado en esta sesión que `lyra_cloud_busy`/`lyra_ui_timeout` NO existen fuera del harness |

Regla derivada: **ninguna de estas cinco autoridades puede escribir el estado de otra directamente.** El sensor debe leer de todas y sintetizar, no promover una señal aislada a verdad global — exactamente el error que hubiera ocurrido si se hubiera interpretado `sawStopButton:true` del harness como "Qwen está generando realmente".

---

## Tabla de escenarios exigidos

Para cada escenario: `availability` | `activity` | evidencia | confianza | acción de Aurora | lock | retry | aprobación humana.

| # | Escenario | availability | activity | evidencia | confianza | acción | lock | retry | humano |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Stop visible y texto creciendo | READY | PROGRESSING | `getStop()=true` (authoritativeStop) + `lastText` cambia | HIGH | Seguir esperando, streamear chunks | conservar | no aplica | no |
| 2 | Stop visible sin cambios mucho tiempo | READY (inferido, no probado) | STALLED | Stop persiste + `Date.now()-lastChange > STALL_MS` | MEDIUM | Emitir aviso (no autoclic), ofrecer intervención manual | conservar | manual únicamente | recomendado |
| 3 | Composer deshabilitado + banner de cuota | QUOTA_EXHAUSTED o RATE_LIMITED (según texto del banner) | IDLE | Banner con texto específico + composer disabled | HIGH (si el banner matchea patrón validado) | Detener nuevos envíos, `PAUSED_LIMIT` | liberar (no seguir reteniendo el lease de escritura) | prohibido automático | sí, para reanudar |
| 4 | Composer habilitado, sin respuesta, sin banner | UNKNOWN | STALLED o UNKNOWN | Ausencia de señales | LOW/UNKNOWN | No inventar causa; conservar evidencia; permitir diagnóstico manual | conservar (con TTL) | no | recomendado si se prolonga |
| 5 | Sesión cerrada | AUTH_REQUIRED | UNKNOWN | Redirect a login / formulario de credenciales detectado | HIGH si el patrón de URL/DOM es específico | Detener automatización, pedir intervención | liberar | prohibido | sí, obligatorio |
| 6 | CAPTCHA / challenge | CHALLENGE_REQUIRED | UNKNOWN | iframe/challenge conocido (hCaptcha/reCAPTCHA/Cloudflare) detectado | HIGH si el selector es específico y validado | Pausar, no intentar resolver | liberar | prohibido | sí, obligatorio |
| 7 | Error temporal del proveedor | TEMP_UNAVAILABLE | FAILED | Error 5xx visible en UI, o mensaje "algo salió mal" del sitio | MEDIUM | Reintentar con backoff acotado (no infinito) | conservar por poco tiempo | sí, limitado | no, salvo repetición |
| 8 | Rate limit con fecha de reintento | RATE_LIMITED | IDLE | Banner con texto de espera/fecha | HIGH si se parsea `retryAfter` | Pausar hasta `retryAfter` | conservar (pausado) | programado, no ciego | no |
| 9 | Job local finalizado pero DOM dice generating | READY (probable) | COMPLETED (autoridad: job) — DOM contradice pero no es autoridad de `activity` para un job ya cerrado | `askCloud` ya resolvió (`AURORA_CLOUD_ANSWER` recibido) + `isGenerating()` sigue `true` | MEDIUM (contradicción explícita registrada) | Confiar en el cierre del job (protocolo explícito de fin > señal DOM ambigua); registrar contradicción como evidencia | liberar | no aplica | no |
| 10 | DOM limpio pero relay perdió conexión | UNKNOWN (del proveedor) — CONOCIDO (del canal): endpoint `offline` | UNKNOWN | `AuroraEndpointRegistry` sin heartbeat >20s | MEDIUM (para "canal caído"), UNKNOWN (para el proveedor en sí) | Marcar canal no disponible, no proveedor | liberar el endpoint, conservar el turno en DB | reintentar reconexión de canal, no del proveedor | no |
| 11 | Reload durante generación | UNKNOWN (transitorio) | STALLED transitorio → recuperable | `AURORA_CLOUD_RESETTING` con `reason:'pane_reload'` | HIGH (protocolo explícito ya existente) | `askCloud` resuelve `pane_reloaded`; `recuperarCloudPendiente` puede reanudar | transferir vía DB (`guardarTurnoCloud`) | sí, vía reanudación explícita | no |
| 12 | Tab descartada y restaurada | UNKNOWN hasta reconfirmar | recuperable | `tab.discarded` (endpoint-registry), reinjector dispara `tab_resumed` | MEDIUM hasta probeMain confirme adapter | Re-probar adapter antes de asumir nada | conservar turno en DB | reconectar canal | no, salvo si el adapter resultante es incorrecto |
| 13 | Service worker reiniciado | UNKNOWN | recuperable vía DB | `chrome.storage.session` sobrevive (endpoint-registry persiste ahí); jobs en memoria de Lyra NO sobreviven | MEDIUM | Reconstruir desde DB/turno persistido | el "lock" en memoria (`cloudGenerando`) se pierde — riesgo real, ver Riesgos | reanudar vía `recuperarCloudPendiente` | no |
| 14 | Adapter específico ausente, `generic` activo | UNKNOWN — el sensor debe declarar `adapterId:'generic'` explícitamente como evidencia de baja confianza | UNKNOWN | `document.documentElement.dataset.auroraRelayProviderMain !== 'qwen@1'` | LOW (generic no tiene señales específicas de disponibilidad) | Degradar confianza automáticamente cuando `adapterId` no es el esperado | conservar, marcar riesgo | no | recomendado revisar reinjector |
| 15 | Respuesta parcial seguida de indisponibilidad | READY→transición a X | COMPLETED (parcial) luego el eje availability cambia | Texto recibido antes del corte + banner posterior | MEDIUM | Conservar la respuesta parcial como válida; no descartarla; marcar disponibilidad nueva por separado | conservar el resultado parcial | no reintentar el mismo contenido | no, salvo pedir continuar |
| 16 | Tool enviada, resultado aún no confirmado | READY (asumido) | PROGRESSING (esperando ACK) | `AURORA_CLOUD_ASK` enviado, sin `AURORA_CLOUD_ANSWER` todavía | MEDIUM | Seguir esperando dentro del timeout del propio `askCloud` (10min) | conservar | el propio `askCloud` ya reintenta el post en `resumeOnly` (protocolo existente) | no |
| 17 | Menú/overlay abierto confundido con estado del proveedor | N/A — esto es estado de **UI de Aurora**, no del proveedor | N/A | Confirmado en esta MISMA sesión: un menú de selección de modelo quedó abierto por un click sintético del Driver y generó falsos `lyra_cloud_busy` | — | El sensor NUNCA debe leer overlays de Aurora como señal de proveedor — son dimensiones distintas (ver tabla de autoridad) | no aplica | no aplica | no aplica |
| 18 | Proveedor en pantalla inicial sin conversación | READY probable | IDLE | 0 turnos de usuario, sin banner — confirmado en vivo esta sesión con Qwen en home | LOW-MEDIUM | No asumir cuota agotada solo por esto | no hay job | no aplica | no |
| 19 | Timeout sin evidencia suficiente | UNKNOWN | UNKNOWN | Ausencia total de señales positivas o negativas | UNKNOWN explícito | Declarar incertidumbre, no inventar causa — regla obligatoria del orquestador | conservar con evidencia, no destruir | no automático | recomendado |
| 20 | Recuperación del proveedor tras pausa | transición X→READY | IDLE→PROGRESSING al reintentar | Banner desaparece + composer vuelve a aceptar input + un job nuevo progresa | MEDIUM subiendo a HIGH con progreso confirmado | Reanudar, notificar recuperación | reactivar | sí, ahora permitido | no |

---

## Contrato de evento: `provider.availability.changed`

**PROPUESTA.**

```ts
{
  // Obligatorios
  eventVersion: 1,                    // versionado explícito del contrato
  eventId: string,                    // uuid propio del evento (deduplicación)
  provider: string,                   // p.ej. "qwen", "chatgpt" — adapter.id
  adapterId: string,                  // adapter EFECTIVO que produjo la evidencia (puede ser "generic")
  paneId: string,                     // "cloud" | "izq" | "der" | etc.
  sessionId: string | null,           // surfaceInstanceId si existe
  conversationId: string | null,      // conversationKey del adapter
  jobId: string | null,               // turnId o requestId, null si no hay job activo
  previousState: AvailabilityState,
  state: AvailabilityState,
  activityState: ActivityState,
  reason: string,                     // slug legible, p.ej. "quota_banner_matched"
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",
  evidence: EvidenceEntry[],          // ver modelo de confianza abajo
  observedAt: number,                 // epoch ms, cuándo se observó la señal
  source: "adapter" | "relay" | "endpoint_registry" | "harness",
  relayInstanceId: string | null,

  // Opcionales
  retryAfter: number | null,          // epoch ms sugerido para reintentar, si se parseó
  lastProgressAt: number | null,      // último cambio de texto/turno confirmado
}
```

- **Deduplicación:** por `(provider, paneId, sessionId, state, activityState)` — no re-emitir si el tuple no cambió, salvo refresco de `evidence`/`observedAt` tras un intervalo largo (heartbeat de confirmación, no de cambio).
- **Debounce:** ninguna transición de `state` se emite antes de sobrevivir una ventana de estabilidad (proponer 2-3 muestras consecutivas o 1-2s, análogo a `STOP_SETTLE_MS=650ms` ya usado en `relay-core.js` como precedente de "esperar a que se asiente" antes de declarar algo terminal).
- **Histéresis:** requerir MÁS evidencia para subir de severidad (READY→QUOTA_EXHAUSTED) que para bajar (QUOTA_EXHAUSTED→READY) una vez que el usuario/])el retryAfter ya pasó y el composer vuelve a aceptar texto — evita oscilación.
- **Orden de eventos:** garantizar entrega en orden por `(provider, paneId)` — un consumidor no debe ver `READY` después de `QUOTA_EXHAUSTED` si en realidad ocurrió al revés. Usar un contador monotónico por par `(provider, paneId)` además de `observedAt`.
- **Comportamiento tras reload:** el estado en memoria se pierde (mismo problema que `cloudGenerando`). El evento debe poder reconstruirse desde la ÚLTIMA evidencia persistida (proponer persistir el último `provider.availability.changed` por `(provider, paneId)` en `chrome.storage.session`, igual que ya hace `endpoint-registry.js` con sus propios endpoints).
- **Evidencia contradictoria:** nunca promediar ni "ganar por mayoría" silenciosamente — conservar TODAS las señales contradictorias en `evidence[]` y bajar `confidence` a `LOW` o `UNKNOWN` explícitamente en vez de resolver la contradicción en secreto.

---

## Modelo de confianza y evidencia

**PROPUESTA.**

```
HIGH:    banner/mensaje específico validado por fixture + señal estructural
         confirmatoria (composer disabled, o URL de login, o iframe de challenge
         conocido). Mínimo dos señales independientes y consistentes, una de
         ellas de alta especificidad.

MEDIUM:  dos señales independientes consistentes, ninguna de alta especificidad
         por sí sola (ej. "no hay Stop" + "texto no cambia" sin ningún banner).

LOW:     una sola señal visual ambigua (ej. solo "no hay Stop", o solo
         "composer parece disabled" sin poder confirmar la clase real).

UNKNOWN: silencio, evidencia insuficiente, o señales contradictorias sin
         resolver. Es un valor VÁLIDO y esperado — nunca se debe forzar
         una clasificación distinta solo para "completar" el evento.
```

Qué sube confianza: coincidencia con un patrón de banner validado por fixture (texto exacto o regex probado contra captura real); múltiples señales independientes apuntando al mismo estado; repetición estable de la misma señal durante la ventana de debounce.
Qué baja confianza: una sola fuente; señal que ya se sabe volátil (Stop en providers sin `authoritativeStop`); contradicción entre dos señales; ausencia de fixture validado para ese proveedor/idioma.

Cada `EvidenceEntry` debe conservar:

```ts
{
  selectorOrSource: string,   // p.ej. ".quota-banner" o "endpoint_registry.heartbeat"
  normalizedText: string | null, // texto normalizado, NUNCA crudo con posibles tokens/PII
  timestamp: number,
  adapterId: string,
  contentHash: string | null, // hash del fragmento, no el contenido si es sensible
  previousState: string | null,
  contradicts: string[] | null, // ids de otras evidencias que la contradicen
}
```

Regla dura ya exigida por el orquestador y adoptada literalmente: **nunca** guardar cookies, tokens, ni contenido sensible del proveedor dentro de `evidence`.

---

## Protección contra falsos positivos

**PROPUESTA**, mapeando cada requisito a un mecanismo concreto:

- Múltiples señales → mínimo 2 para `MEDIUM`, 2+especificidad para `HIGH` (ya definido arriba).
- Debounce → ventana de 1-2s antes de emitir cualquier transición (precedente: `STOP_SETTLE_MS`).
- Ventana de estabilidad → igual a debounce, aplicado también a `activity` (no declarar `STALLED` en el primer poll sin cambio; usar `STALL_MS=15000` como referencia ya validada en producción).
- Histéresis → definida arriba (más evidencia para empeorar que para mejorar).
- Expiración de señales → cada `EvidenceEntry` debería considerarse "fría" pasado cierto TTL (proponer 60-120s) y no contar para una nueva clasificación sin refrescarse.
- Distinguir ausencia de progreso vs. causa conocida → exactamente el eje `activity=STALLED` (sin causa) vs. `availability=X` (con causa) — la separación de dos ejes ES el mecanismo.
- Estado `UNKNOWN` → obligatorio como salida legítima, no como error.
- Patrones específicos por proveedor e idioma → tabla de patrones (regex + selector) por adapter, versionada y con fixture asociado; nunca un regex global "genérico de cuota" aplicado a todos los sitios.
- Fixtures → ver sección de estrategia de fixtures.
- Evidencia contradictoria → conservar todo, bajar confianza, nunca resolver en silencio.
- Degradación conservadora → ante duda, `UNKNOWN` + conservar el job, nunca `FAILED` ni `QUOTA_EXHAUSTED` optimista.
- Prohibición de retries ciegos → regla dura, ya validada por el precedente de `AURORA_CLOUD_TOOL_STALLED` ("avisar... nunca autoclic").

Regla obligatoria explícita del orquestador, adoptada tal cual: *un timeout demuestra que Aurora dejó de observar progreso; no demuestra por qué el proveedor no progresó.*

---

## Jobs, locks y recuperación

**PROPUESTA**, por estado de `availability`:

**RATE_LIMITED**
- Detener nuevos envíos para ese `(provider, paneId)`.
- Conservar contexto (prompt, turno en DB — ya existe vía `guardarTurnoCloud`).
- Registrar `retryAfter` si se pudo parsear del banner.
- Liberar el *writer lease* de Lyria Orchestrator (permitir que otro agente/rol continúe con otro proveedor) pero **conservar** el lock/lease del turno específico hasta que se decida explícitamente reintentar o abandonar.
- No duplicar el job: el `requestId`/`turnId` existente se reutiliza al reintentar, nunca se crea uno nuevo para el mismo prompt pendiente.

**QUOTA_EXHAUSTED**
- Marcar el job como `PAUSED_LIMIT` (mismo vocabulario que ya usa `CHECKLIST-ACTIVO.md` para Qwen).
- Preservar prompt, respuesta parcial (si la había, escenario 15), tools y resultados ya ejecutados (todo esto YA se persiste hoy en `guardarTurnoCloud`/`resultadoToolPersistible` — el sensor no necesita inventar persistencia nueva, solo consumirla).
- Permitir sustitución de agente (mismo patrón de handoff que ya usan los orquestadores humanos/ChatGPT/Qwen en esta misma sesión).
- Prohibir explícitamente retries automáticos.

**AUTH_REQUIRED**
- Detener automatización por completo para ese proveedor.
- Pedir intervención humana explícita.
- Nunca enviar credenciales ni cualquier dato sensible de forma automática (regla ya presente en `AI-cloud.md`: *"no evadas autenticación, cuotas, paywalls ni barreras explícitas"*).

**CHALLENGE_REQUIRED**
- Pausar.
- No intentar resolver el CAPTCHA/challenge de ninguna forma automática.
- Pedir intervención humana.

**STALLED (activity, no availability)**
- No declarar ningún estado de cuota.
- Conservar toda la evidencia acumulada durante el stall.
- Permitir cancelación manual (ya existe: botón Stop/`detenerCloud`) o diagnóstico manual (ya existe: banner "Answer now", pero HOY solo para ChatGPT — generalizar es trabajo de un checkpoint posterior, fuera de esta fase).
- Distinguir explícitamente "UI de Aurora obsoleta" (ej. `cloudGenerando` colgado por un reload previo) de "proveedor realmente ocupado" — el primero se corrige verificando el estado real del relay/DOM, no confiando ciegamente en la signal de Aurora.

**UNKNOWN**
- No inventar causa.
- No corregir código para "compensar" sin evidencia (regla ya escrita en `CHECKLIST-ACTIVO.md`, línea 673: *"Evitar que Driver o Navigator intenten corregir código para compensar una cuota agotada"*).
- Informar la incertidumbre de forma explícita y visible.

**Cuándo conservar/liberar/transferir/cerrar/pausar/sustituir/reanudar el lock** (síntesis):

| Trigger | Acción sobre el lock del turno | Acción sobre el writer lease del rol |
|---|---|---|
| `READY` + `PROGRESSING` | conservar | conservar |
| `RATE_LIMITED`/`QUOTA_EXHAUSTED` | conservar (pausado, con evidencia) | liberar para permitir otro rol/proveedor |
| `AUTH_REQUIRED`/`CHALLENGE_REQUIRED` | conservar | liberar, requiere humano |
| `STALLED` | conservar | conservar (es el mismo agente/turno, solo se avisa) |
| `UNKNOWN` prolongado | conservar con evidencia | a criterio del orquestador humano, nunca automático |
| Recuperación confirmada (`READY` con progreso real) | reactivar | recuperar |
| `COMPLETED`/`FAILED` terminal | cerrar | liberar |

---

## Estrategia de fixtures y pruebas sin cuota real

**PROPUESTA.**

- **Fixtures HTML mínimos**: capturas estáticas y anonimizadas del DOM relevante por proveedor (banner de cuota, composer disabled, challenge conocido) — nunca el DOM completo real de una sesión con datos de cuenta.
- **Adapters simulados**: un adapter de test que implementa `observe`/`act` con comportamiento programable (generar texto a velocidad controlada, exponer/ocultar Stop, simular banners) — permite ejercitar `relay-core.js` sin red.
- **Reloj controlado**: inyectar un reloj falso para las ventanas de debounce/histéresis/TTL en vez de depender de `Date.now()`/`setTimeout` reales — necesario para tests deterministas de `STALL_MS`, `FIN_IDLE`, `HEARTBEAT_TTL_MS`.
- **Progreso simulado**: fixture que crece texto en pasos controlados para probar `PROGRESSING`→`COMPLETED`.
- **Banners en varios idiomas**: al menos español/inglés por proveedor conocido, versionados junto al patrón que los detecta.
- **Composer habilitado/deshabilitado**: fixture con y sin `disabled` en el control real.
- **Stop obsoleto**: fixture donde Stop persiste sin cambios de texto (reproduce escenario 2).
- **Turnos virtualizados**: reproducir el caso Qwen (conteo de `.chat-user-message` que no sube pese a un envío real) con un DOM fixture que virtualiza intencionalmente.
- **Reload / SW restart / tab discard**: no son fixtures HTML — requieren un harness de extensión (`chrome.tabs.discard`, `chrome.runtime.reload`, matar el service worker) — clasificarlos aparte, ver tabla de pruebas.
- **Señales contradictorias**: fixture con banner de cuota Y `getStop()` reportando actividad simultáneamente — para validar que el sensor baja confianza en vez de resolver en silencio.
- **Respuesta parcial + indisponibilidad**: fixture de texto parcial seguido de inyección de banner.
- **Tool pendiente**: fixture de `AURORA_CLOUD_ASK` enviado sin `AURORA_CLOUD_ANSWER` — para validar que `activity=PROGRESSING` no se confunde con `STALLED` antes de tiempo razonable.
- **retryAfter**: fixture de banner con fecha/contador explícito, para probar el parseo.

### Clasificación de pruebas

| Capa | Qué cubre | Depende de proveedor vivo |
|---|---|---|
| Unitarias | Funciones puras: parseo de banner, cálculo de confianza, deduplicación, debounce | No |
| Contract tests | El contrato `provider.availability.changed` (campos, tipos, versionado) | No |
| Adapter fixtures | Comportamiento de un adapter simulado contra `relay-core.js` real | No |
| Integration tests | `background.js` + `endpoint-registry.js` + reinjector con `chrome.*` mockeado o con una extensión de test | No |
| Browser harness | Extensión real cargada en Chrome/Chromium con fixtures HTML servidos localmente (no el sitio real del proveedor) | No |
| Live acceptance tests | Contra el proveedor real (Qwen/ChatGPT/Gemini reales) | **Sí** — última capa, nunca la única evidencia |

Esta sesión confirma por qué la última capa no puede ser la única: las pruebas vivas contra Qwen quedaron **`BLOCKED_EXTERNAL_PAUSED_LIMIT`** durante toda esta fase, y aun así el discovery y diseño pudieron avanzar completos apoyándose en las capas inferiores.

---

## Riesgo del reinjector — mapeo exacto

**HECHO_VERIFICADO**, `extensions/aihub/background/relay-reinjector.js`:

- `PROVIDERS['chat.qwen.ai'] = 'content-scripts/relay/providers/relay-generic.js'` (línea 24) — mapeo incorrecto confirmado, ya señalado por Navigator, no corregido en esta fase por instrucción explícita.
- Este mapeo **solo se usa** dentro de `ensureFrame()`/`ensureProviderMain()`, y **solo en la rama** `if (!main.ready) { await injectFiles(...) }` — es decir, únicamente cuando `probeMain()` reporta `ready:false`.
- `probeMain()` define `ready: !!(adapter && globalThis.__auroraRelayInstance)` — requiere DOS condiciones: que `findProvider()` ya haya encontrado un adapter Y que `relay-core.js` haya terminado de marcar `__auroraRelayInstance` (bootstrap completo, no solo registro del adapter).
- El reinjector se dispara por: `chrome.tabs.onActivated` (cualquier cambio de pestaña activa), `chrome.tabs.onUpdated` cuando `frozen`/`discarded` pasan a `false` o `status` llega a `complete`, y por `worker_boot` (arranque del service worker, confirmado en sesión previa de este mismo proyecto).

**Camino exacto donde `generic` podría quedar activo** (`INFERENCIA`, no reproducida en vivo en esta fase por prohibición explícita de tocar el reinjector/generar tráfico):

1. Un tab con `chat.qwen.ai` es descartado por Chrome (`tab.discarded`) para liberar memoria.
2. El usuario vuelve a esa pestaña → Chrome dispara una navegación/recarga real de la página (todo el proceso de renderer se reconstruye) → el manifest declarativo (`content_scripts` con `matches: chat.qwen.ai`, `run_at: document_end`) DEBERÍA re-ejecutar `relay-qwen.js` automáticamente, sin intervención del reinjector.
3. **Simultáneamente**, `chrome.tabs.onUpdated` con `discarded:false`/`status:complete` dispara `scheduleScan('tab_resumed')` → `ensureFrame()` → `probeMain()`.
4. Si `probeMain()` corre **antes** de que la inyección declarativa termine su propio bootstrap (`__auroraRelayInstance` aún no seteado, aunque el script ya haya empezado a ejecutar), `main.ready` es `false` → el reinjector inyecta `[...BASE_MAIN, 'relay-generic.js', ...CORE_MAIN]` vía `chrome.scripting.executeScript` con `world:'MAIN'`.
5. Esto ejecuta `relay-generic.js`, que llama `registerProvider({id:'generic', matches:()=>true, ...})` — `relay-contract.js`'s `registerProvider` hace `push()` porque no existe todavía una entrada con `id==='generic'` en ese frame.
6. Si el `push()` de `generic` ocurre **antes** de que el script declarativo original también complete su propio `registerProvider({id:'qwen', ...})`, el array `providers` queda `[generic, qwen]` (o incluso solo `[generic]` si el declarativo aún no llegó a esa línea) — y `findProvider()` (`providers.find(c => c.matches(loc))`) devuelve **el primero que matchee**: `generic.matches = () => true` siempre matchea primero, ganando la carrera para siempre en ese frame hasta la próxima navegación real.
7. Si en cambio el declarativo ya había registrado `qwen` primero, el `push()` posterior de `generic` no lo desplaza (ids distintos, ambos co-existen en el array, pero `qwen` sigue siendo el primer match porque fue el primero en `providers`) — en este orden **no hay regresión**.

Conclusión: el riesgo depende enteramente del **orden de llegada** entre la inyección declarativa (manifest) y la inyección dinámica (reinjector) durante un evento de `tab_resumed`. **NO_VERIFICADO** en esta fase si esa carrera ocurre alguna vez en la práctica — los escenarios probados en el checkpoint anterior (`--full-reload` normal) no ejercitan `tab.discarded`/`tab.frozen`, que son las únicas condiciones donde el reinjector decide activamente re-inyectar.

**Cómo el sensor debe informar qué adapter produjo la evidencia:** cada `EvidenceEntry` y cada evento `provider.availability.changed` deben incluir `adapterId` tomado en vivo (`document.documentElement.dataset.auroraRelayProviderMain`, mismo mecanismo ya usado manualmente en verificaciones de esta sesión) — nunca asumir que el adapter esperado por el manifest es el adapter realmente activo. Si `adapterId !== 'qwen'` para un frame de `chat.qwen.ai`, la confianza de cualquier clasificación de disponibilidad para ESE proveedor debe degradarse automáticamente a `LOW`, porque `relay-generic.js` no tiene ninguna señal específica de cuota/banner de Qwen.

**Diseño de pruebas para este riesgo** (`PROPUESTA`, capa "integration"/"browser harness", no live acceptance):

1. Fixture de extensión de test que simula `tab.discarded=true→false` sin depender de Qwen real (puede usarse cualquier página bajo `chat.qwen.ai`-like matches, incluso una página de test servida localmente con el mismo hostname simulado vía `chrome.declarativeNetRequest` o un dominio de prueba dedicado — **fuera de alcance de esta fase decidir el mecanismo exacto**).
2. Medir el orden real de `registerProvider()` calls instrumentando `relay-contract.js` en un build de test (no en producción) para contar cuál llega primero.
3. Repetir con `chrome.runtime.reload()` real seguido de reactivación de tab, para service worker restart.
4. Reconstrucción MAIN desde cero: forzar `chrome.scripting.executeScript` manual duplicando el orden sospechoso, y verificar `findProvider()` resultante.

---

## Checkpoints propuestos (secuencia completa)

1. **Tipos y contrato puro** — definir TypeScript/JSDoc (o el equivalente que use el proyecto, que hoy es JS clásico sin build) de `AvailabilityState`, `ActivityState`, `EvidenceEntry`, el evento completo. Cero dependencia de DOM real. Pruebas unitarias de validación de forma.
2. **Motor de clasificación (puro)** — función `classify(signals[]) → {state, activityState, confidence, evidence}` que combine señales ya definidas, con debounce/histéresis/expiración simulados con reloj controlado. Sin tocar ningún adapter todavía.
3. **Fixtures y pruebas del motor** — fixtures HTML mínimos + adapter simulado, contract tests, pruebas de falsos positivos (señales contradictorias, silencio, etc.).
4. **Colector de señales (integración con UN adapter, no todos)** — conectar el motor a señales reales de un solo proveedor de bajo riesgo para probar (candidato: ChatGPT, que ya tiene `authoritativeStop` y es el más estable de la sesión, o un adapter de test dedicado).
5. **Emisión de eventos** — disparar `provider.availability.changed` real, persistencia mínima en `chrome.storage.session` para sobrevivir reload.
6. **Integración con jobs (`cloud.js`/`cloud-ask.js`)** — pausar nuevos envíos ante `availability != READY`, sin tocar la lógica de tools existente.
7. **Integración con Lyria Orchestrator** — sustitución de agente, handoffs automáticos — depende de trabajo que hoy es manual (esta misma sesión lo hizo a mano).

## Primer checkpoint recomendado

**Checkpoint 1: Tipos y contrato puro.**

Justificación: no depende de cuota viva, no depende de ningún adapter, no cambia arquitectura existente, tiene pruebas deterministas al 100%, es revisable por commit exacto y su rollback es trivial (borrar los archivos nuevos, nada más los referencia todavía).

**Archivos candidatos** (todos NUEVOS, ningún archivo existente se toca):

- `extensions/aihub/content-scripts/relay/provider-health/types.js` — constantes de `AvailabilityState`/`ActivityState`, forma de `EvidenceEntry` y del evento, documentadas con JSDoc (consistente con el resto del proyecto, que es JS clásico sin TypeScript).
- `extensions/aihub/content-scripts/relay/provider-health/validate.js` — función pura de validación de forma del evento (análoga a `validateProviderAdapter` en `relay-contract.js`, mismo estilo).
- Tests correspondientes, ubicación exacta a definir según convención de testing del repo (`NO_VERIFICADO`: no se encontró un directorio de tests JS existente en esta discovery — requiere confirmación del Orchestrator sobre dónde deben vivir).

**Diff conceptual:** archivos 100% nuevos, cero líneas modificadas en archivos existentes. Ningún import nuevo agregado a `relay-core.js`, `relay-contract.js`, `cloud.js` ni `cloud-ask.js` todavía.

**Criterios de aceptación:**
- Los tres tipos (`AvailabilityState`, `ActivityState`, evento) están definidos y documentados.
- `validate.js` rechaza forma inválida y acepta forma válida, con pruebas deterministas.
- Cero cambios en archivos existentes (`git diff --stat` limitado a archivos nuevos).
- `node --check` pasa en los archivos nuevos.

**Riesgos:** ninguno de regresión (no se conecta a nada todavía). Riesgo de diseño: si el contrato definido acá no encaja con lo que el motor de clasificación (checkpoint 2) necesita, requerirá ajuste — aceptable en esta etapa temprana y barata.

**Dependencias:** ninguna externa. Depende únicamente de que este documento de discovery sea aprobado por Navigator.

**Fuera de alcance explícito de este primer checkpoint:** cualquier adapter, cualquier DOM real, cualquier evento emitido de verdad, cualquier integración con `cloud.js`/jobs, el reinjector, Lyria Orchestrator.

---

## Preguntas abiertas

1. ¿Dónde debe vivir el motor de clasificación: dentro de `relay-core.js` (MAIN world, por frame) o en `background.js` (un solo lugar, agregando snapshots de todos los frames)? Esta discovery no encontró un test runner JS existente en el repo — confirmar convención antes del checkpoint 3.
2. ¿El evento `provider.availability.changed` debe viajar por el mismo canal `postMessage`/`chrome.runtime` que el resto del protocolo Cloud, o merece un canal propio para no acoplar su versionado al de `AURORA_CLOUD_*`?
3. ¿Quién persiste el histórico de `EvidenceEntry` más allá de la sesión — vive solo en memoria/storage.session, o se espera integración con AI-Cloud Memory (Fase 6 del checklist, "Integración con Provider Health Sensor")? Esta discovery encontró que esa fase ya está anticipada en `chatgpt-orchestrator-memories.md`, pero no está implementada.
4. ¿El "Answer now" hoy exclusivo de ChatGPT (`cloudAiId === 'chatgpt'`, `lyra.js:1906`) debe generalizarse como parte de este sensor, o sigue siendo una feature de UI separada que simplemente CONSUME el nuevo estado `STALLED`?
5. Confirmar mecanismo concreto para las pruebas de "tab discarded"/"service worker restart" sin depender de un dominio real — ¿usar un dominio de prueba propio en el manifest de una build de test, o mockear `chrome.tabs`/`chrome.scripting` completamente?

---

## CHECKLIST_DELTA

**Hechos nuevos verificados:**
- `lyra_cloud_busy` y `lyra_ui_timeout` son vocabulario exclusivo del harness `sol-debug.py` (`start_lyra_job`), no existen en código de producción — confirmado leyendo el harness completo.
- `cloudGenerando` (signal única, `mensajes.js:11`) es el único lock de turno de Lyra Cloud; se limpia solo en un `finally` sin TTL propio — el riesgo real es que el `await` interno nunca resuelva, no una mala gestión del flag.
- `askCloud()` (`cloud-ask.js`) SÍ tiene watchdog propio de 10 minutos (`timeoutMs=600000`), con `detenerCloud()` automático al vencer.
- Existe un watcher de stall YA EN PRODUCCIÓN (`relay-core.js:688-703`, `STALL_MS=15000`), con el principio de diseño "avisar, nunca autoclic" ya codificado — precedente arquitectónico directo y validado para el sensor futuro.
- `relay-qwen.js` tiene `isGenerating()` permanentemente `false` (sin selector de Stop) — confirmado, no es una señal débil sino ausente.
- `AuroraEndpointRegistry` (`endpoint-registry.js`) ya modela `discarded`/`frozen`/`offline` con TTL de heartbeat de 20s — reutilizable como fuente de señal para el eje `availability` del canal físico (no del proveedor).
- El riesgo del reinjector (`relay-reinjector.js`, mapeo `chat.qwen.ai → relay-generic.js`) solo se activa en la rama `!main.ready` de `probeMain()`, disparada por `tab_activated`/`tab_resumed`/`worker_boot` — mecanismo exacto de la posible carrera documentado arriba, **no reproducido en vivo** en esta fase.

**Archivos y rutas inspeccionados:** ver sección "Archivos inspeccionados" arriba.

**Rama y worktree creados:**
- `task/provider-health-sensor` desde `17e1e710c1e33058142eaf7ba519bbde51643c00`.
- Worktree: `/media/almacen/deml/Downloads/core_instruction/aurora-provider-health-sensor`.

**Commit documental:** ver hash exacto en `DRIVER_PROVIDER_HEALTH_DISCOVERY_COMPLETED` abajo.

**Estados/contratos propuestos:** modelo de dos ejes (`availability`/`activity`), contrato `provider.availability.changed`, modelo de confianza de 4 niveles, tabla de 20 escenarios, checkpoint 1 (tipos y contrato puro).

**Bloqueos encontrados:** ninguno nuevo — las pruebas vivas de Qwen siguen `BLOCKED_EXTERNAL_PAUSED_LIMIT`, sin necesidad de tocarlas para completar este discovery.

**Riesgos confirmados:** carrera teórica del reinjector (mecanismo mapeado, no reproducido); ausencia de TTL propio en `cloudGenerando` (mitigado en la práctica porque `askCloud` sí tiene watchdog interno, pero el lock de Lyra depende de que ese watchdog exista SIEMPRE en el camino de llamada — no verificado que TODOS los caminos que setean `cloudGenerando=true` pasen necesariamente por un `askCloud` con timeout).

**Siguiente acción exacta:** Navigator revisa el commit documental exacto de este archivo; si aprueba, Orchestrator autoriza expresamente el Checkpoint 1 (tipos y contrato puro) antes de que el Driver toque cualquier archivo nuevo de código.

**Puntos que todavía NO deben marcarse como completados:** ninguna implementación del sensor; ninguna corrección del reinjector; ninguna prueba viva de disponibilidad de Qwen; ninguna generalización del banner "Answer now" a otros proveedores.
