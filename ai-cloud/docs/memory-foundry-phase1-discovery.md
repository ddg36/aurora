# AI-Cloud Memory & Team Foundry — Fase 1: Discovery y contratos documentales

**Fecha:** 2026-07-20
**Repositorio:** `/media/almacen/deml/Downloads/core_instruction/aurora`
**Branch:** `task/ai-cloud-memory-foundry-phase1`
**Worktree:** `/media/almacen/deml/Downloads/core_instruction/aurora-ai-cloud-memory-foundry`
**Base commit:** `17e1e710c1e33058142eaf7ba519bbde51643c00` (`17e1e71`)
**Estado inicial:** worktree ya creado por el Orchestrator, `HEAD` en la base exacta, `git status` mostraba únicamente `ai-cloud/` como untracked (los 3 archivos canónicos ya copiados). `HECHO_VERIFICADO`.

## Alcance de este documento

Discovery documental y diseño de contratos conceptuales. **Ningún runtime, validador ejecutable, esquema formal en código, persistencia funcional, UI, integración con Provider Health, compactación ni Team Builder se implementan en esta fase.** Todo lo que sigue es diseño para revisión — no una implementación ya construida.

## Metodología

Lectura directa de los 3 archivos canónicos ya presentes en `ai-cloud/`. Sin modificar su contenido salvo que se detecte una contradicción material indispensable para el discovery (ver sección 1). Taxonomía: `HECHO_VERIFICADO` (leído tal cual existe), `PROPUESTA` (diseño de esta fase, no implementado), `DECISIÓN` (elección tomada en este documento con justificación), `NO_VERIFICADO`, `PENDIENTE_NAVIGATOR`.

---

## 1. Inventario actual

**HECHO_VERIFICADO** — archivos existentes en `ai-cloud/`:

| Archivo | Líneas | Propósito |
|---|---|---|
| `AI-cloud.md` | 192 | Comportamiento común de cualquier LLM que participe en Aurora como compañero — roles, jerarquía de verdad, honestidad sobre tools, protocolo de handoff, privacidad general. No contiene estado de ninguna misión. |
| `CHECKLIST-ACTIVO.md` | 1694 | Estado operativo compartido: misiones activas/cerradas, ramas, commits exactos, bloqueos, próximas acciones. Crece con cada checkpoint de cada misión (Qwen, Provider Health, SOL, esta misma Fase 1 la referenciará). |
| `memories/chatgpt-orchestrator-memories.md` | 167 | Memoria especializada de la relación Diego↔ChatGPT-Orchestrator: identidad funcional, arquitectura de colaboración aprendida, errores convertidos en reglas, bugs/hallazgos pendientes de larga vida (Gemini Clone, Tool Output Normalization, Provider Health Sensor, esta misma AI-Cloud Memory Foundry). |

### Relaciones entre las capas (ya documentadas en `AI-cloud.md`, confirmadas por lectura)

```
AI-cloud.md          → comportamiento común, permanente, agnóstico de misión
+ memories/*.md       → identidad funcional + conocimiento duradero por relación/dominio
+ CHECKLIST-ACTIVO.md → estado operativo actual (misiones, ramas, commits, bloqueos)
+ handoff literal     → reporte íntegro del agente anterior + instrucción nueva
```

`AI-cloud.md` declara explícitamente (línea 26): *"Las memorias no deben copiar el checklist. Deben apuntar a CHECKLIST-ACTIVO.md como fuente del estado vigente."* Esta regla YA es el contrato de no-duplicación entre memoria y checklist — la Fase 1 no lo reinventa, lo hereda y lo formaliza como invariante de los contratos `MEMORY`/`SESSION` (sección 4).

### Qué información es estable vs. temporal (clasificación de esta fase, sobre el contenido ya leído)

- **Estable** (candidato a `MEMORY`, vida larga): identidad funcional del usuario y del compañero, arquitectura de colaboración aprendida, reglas derivadas de errores reales (`AI-cloud.md` §"Errores del primer experimento" y equivalentes por memoria), principio central de Aurora, vocabulario propio.
- **Temporal** (pertenece exclusivamente a `CHECKLIST-ACTIVO.md` o a un futuro `SESSION`/`MISSION`, nunca a `MEMORY`): rama activa, hash de commit, estado de un checkpoint, bloqueo puntual (`BLOCKED_EXTERNAL_PAUSED_LIMIT`), próxima acción exacta, oportunidades sujetas a tiempo (ya declarado explícitamente en `chatgpt-orchestrator-memories.md`, sección "Tareas temporales y oportunidades de agentes": *"no pertenecen a esta memoria duradera"*).
- **Nunca debe duplicarse**: el estado operativo vigente (vive solo en el checklist); el contenido íntegro de un handoff (vive como artefacto de sesión, la memoria solo referencia su existencia); secretos, tokens, claves (prohibidos en cualquier capa, ya declarado en `AI-cloud.md` §"Privacidad").

---

## 2. Ubicación definitiva

**DECISIÓN:** `ai-cloud/` permanece en la **raíz del repositorio Aurora** (`/media/almacen/deml/Downloads/core_instruction/aurora/ai-cloud/`), como ya está.

### Razones

- Ya es la ubicación de facto usada por los 3 archivos canónicos y referenciada explícitamente dentro de ellos (`AI-cloud.md` cita rutas relativas a sí mismo, `chatgpt-orchestrator-memories.md` lista "Archivos canónicos" apuntando a esta misma carpeta).
- Backend, extensión de navegador y Lyria comparten el mismo checkout de Aurora en disco — una ubicación fuera del repo (p. ej. `~/.aurora/`) requeriría resolver una ruta de usuario/plataforma adicional sin beneficio real, y complicaría el acceso desde contextos que ya asumen "relativo a la raíz del repo" (scripts, tests, la propia extensión empaquetada).
- Vive dentro del repo — se beneficia gratis de todo lo que Git ya resuelve: historial, diffs, bisección, ramas/worktrees por misión (patrón ya usado en Provider Health y SOL).

### Alternativas descartadas

- **Directorio fuera del repo (p. ej. `~/.config/aurora/ai-cloud/`)**: descartado — rompe portabilidad Linux/Windows sin aportar nada (la ruta de config de usuario difiere entre plataformas, y todo el resto de Aurora ya vive dentro del repo); complica el acceso desde la extensión de navegador, que no tiene un mecanismo simple para leer una ruta arbitraria del sistema de archivos del usuario.
- **Repositorio Git separado**: descartado para esta fase — introduciría un segundo repo a sincronizar, versionar y clonar, sin necesidad demostrada; el aislamiento por worktree/branch (ya usado en toda esta sesión) ya resuelve "trabajo concurrente sin pisarse" sin pagar el costo de un repo adicional. Queda como pregunta abierta para una fase de escala futura (ver Preguntas/Checklist Delta), no una decisión de esta fase.
- **Base de datos únicamente (sin archivos)**: descartada para el contenido canónico/estable (`prompts/`, `memories/`) — estos deben ser legibles y editables como texto plano por un humano o un agente sin herramientas de DB, igual que hoy. Una base de datos SÍ es candidata razonable para `sessions/`/`evidence/` de alto volumen en fases posteriores (Checkpoint 4+), pero no se decide aquí.

### Impacto en Git

- Contenido estable (`prompts/`, `memories/`, `schemas/`, `docs/`) se versiona normalmente.
- Contenido de sesión/evidencia privada (`sessions/`, parte de `evidence/`) requiere política de exclusión explícita — ver sección 11. No se modifica `.gitignore` en este checkpoint (instrucción explícita), solo se documenta la regla futura.

### Acceso desde backend, extensión y Lyria

- **Backend** (Python/Litestar, corre desde la raíz del repo o un subproceso con cwd conocido): acceso por ruta relativa a la raíz del repo, nunca ruta absoluta hardcodeada de este entorno de desarrollo.
- **Extensión de navegador**: no tiene acceso directo al filesystem del repo — hoy ya delega toda lectura/escritura de estado persistente al backend vía HTTP (`/db/...`), patrón confirmado en sesiones previas de este mismo proyecto (`ui/components/shared/api.js`, `getJSON`/`postJSON`). AI-Cloud Memory debe seguir el mismo patrón: la extensión pide al backend, nunca lee `ai-cloud/*.md` directamente del disco.
- **Lyria**: corre como parte del mismo backend/orquestador — acceso directo por ruta relativa, igual que el backend.

### Portabilidad Linux/Windows

**Regla dura (`DECISIÓN`):** ninguna ruta persistida dentro de un archivo de `ai-cloud/` puede ser absoluta de un entorno específico. Toda referencia a un archivo del propio `ai-cloud/` (p. ej. un `MEMORY` que referencia un `PROMPT`) se expresa como ruta relativa a la raíz de `ai-cloud/`, con separador `/` normalizado (nunca `\`), resuelta en runtime por el proceso que la lea (backend), nunca embebida como string absoluto en el contenido versionado. Esto corrige un patrón ya visto como riesgo en esta misma sesión: memorias que citan rutas absolutas de esta máquina de desarrollo (`/home/deml/Downloads/core_instruction/aurora/ai-cloud/...`) son aceptables como **prosa humana** dentro de un `.md` (para que un lector humano encuentre el archivo hoy), pero **nunca** como el único identificador estructural de una referencia dentro de un contrato — el contrato usa IDs estables (sección 5), no rutas.

### Datos privados no versionables

Ver secciones 8 y 11 — nivel `PRIVATE` por defecto, exclusión de Git para contenido de sesión con datos reales del usuario.

---

## 3. Estructura propuesta

**PROPUESTA — ninguna de estas carpetas existe todavía, ninguna se crea en este checkpoint salvo `docs/` (ya creada para alojar este mismo documento).**

```
ai-cloud/
  AI-cloud.md                    ← ya existe, sin cambios
  CHECKLIST-ACTIVO.md            ← ya existe, sin cambios
  memories/                      ← ya existe (1 archivo hoy)
  docs/                          ← NUEVA en este checkpoint (contiene este documento)
  prompts/                       ← propuesta, no creada
  sessions/                      ← propuesta, no creada
  missions/                      ← propuesta, no creada
  teams/                         ← propuesta, no creada
  evidence/                      ← propuesta, no creada
  artifacts/                     ← propuesta, no creada
  schemas/                       ← propuesta, no creada (auxiliar)
  indexes/                       ← propuesta, no creada (auxiliar, derivado)
```

`migrations/` (mencionada como posible auxiliar en el prompt de misión) **no se propone todavía** — no hay ningún schema versionado en código todavía que requiera una ruta de migración; se evaluará recién en el Checkpoint 2/3 si el primer cambio de `schemaVersion` lo justifica. Proponer la carpeta antes de tener un solo schema real sería estructura sin necesidad demostrada.

### Qué vive en cada carpeta y qué no

- **`prompts/`**: prompts base y derivados por rol (`companion-core.md`, `driver-core.md`, `navigator-core.md`, etc. — ya anticipados en `chatgpt-orchestrator-memories.md`). Nunca contiene estado de una misión ni datos de un usuario específico más allá de "cómo colaborar con Diego" en términos generales y ya-aprobados.
- **`memories/`**: memorias especializadas por relación/dominio (ya existe 1). Nunca contiene el checklist completo ni el contenido íntegro de una sesión — solo lo que ya declara `AI-cloud.md`: identidad funcional, decisiones canónicas, reglas aprendidas.
- **`sessions/`**: compactaciones de sesiones reales (Fase 5 futura). Contiene contenido potencialmente privado (prompts reales del usuario, respuestas). Candidato principal a exclusión de Git (sección 11).
- **`missions/`**: estado estructurado de una misión (equivalente estructurado a una entrada del checklist, pero por misión individual en vez de un archivo monolítico creciente). El checklist actual (1694 líneas y creciendo) es exactamente el síntoma que este directorio, en una fase futura, existe para resolver — pero **no se migra en esta fase** (ver sección 12, se decide explícitamente no ejecutar migración física todavía).
- **`teams/`**: definiciones de equipos armados por Lyria (Fase 9 futura, Team Builder). Vacío hasta esa fase.
- **`evidence/`**: referencias a evidencia real (tool results, commits, diffs) — **referencias**, no copias completas de contenido sensible (ver sección 7).
- **`artifacts/`**: productos finales del Artifact Foundry (Fase 10 futura). Vacío hasta esa fase.
- **`schemas/`**: definiciones formales versionadas de los contratos de la sección 4, cuando se implementen en código (Checkpoint 2). Hoy: vacío, los contratos de este documento son conceptuales, no código.
- **`indexes/`**: estructuras derivadas y reconstruibles (sección 10) — nunca fuente de verdad, siempre regenerable a partir de `memories/`/`sessions/`/`missions/`/`evidence/`.
- **`docs/`**: documentos de discovery/diseño como este mismo archivo. No es estado operativo ni memoria — es documentación de arquitectura, mismo espíritu que `docs/audits/` ya usado en la misión de Provider Health Sensor.

---

## 4. Contratos versionados (conceptuales — sin validadores ejecutables)

Cada contrato incluye: propósito, ID estable, versión de formato, campos requeridos/opcionales, referencias, invariantes, estados, privacidad, timestamps, estrategia de migración, rechazo de campos incompatibles, ejemplo válido e inválido.

### 4.1 `PROMPT`

**Propósito:** definir el comportamiento base o derivado de un rol/compañero — el contenido que hoy vive en `AI-cloud.md` y (a futuro) en `prompts/*.md`.

- **ID estable:** `promptId` (slug estable, p. ej. `companion-core`, `driver-core`).
- **schemaVersion:** entero, empieza en `1`.
- **Campos requeridos:** `promptId`, `schemaVersion`, `title`, `scope` (`global` | `role`), `body` (el contenido en sí, Markdown), `createdAt`, `updatedAt`.
- **Campos opcionales:** `extends` (referencia a otro `promptId` del que hereda — permite `driver-core` extender `companion-core` sin duplicar texto, ya anticipado en `chatgpt-orchestrator-memories.md`: *"Diseñar herencia por referencias y hashes para evitar duplicación"*), `pinnedVersion` (para que una misión fije una versión específica de un prompt base sin verse afectada por cambios futuros), `supersedes`.
- **Referencias:** `extends` → otro `promptId`. Ninguna referencia a `sessionId`/`missionId` (un prompt es agnóstico de misión, por diseño ya declarado en `AI-cloud.md`).
- **Invariantes:** `promptId` es único y estable de por vida (nunca se reutiliza tras retirarse); cambiar `body` de forma incompatible exige incrementar `schemaVersion`, no mutar en silencio una versión ya referenciada por `pinnedVersion` en otro lugar.
- **Estados:** `ACTIVE`, `DEPRECATED` (reemplazado por otro vía `supersedes`, pero legible), `RETIRED` (ya no se sirve a agentes nuevos, se conserva por historial).
- **Privacidad:** `SHAREABLE` por defecto (son prompts de comportamiento, no datos privados) — nunca `PRIVATE` salvo un prompt experimental interno explícitamente marcado.
- **Timestamps:** `createdAt`, `updatedAt`.
- **Migración:** un cambio de `schemaVersion` de `PROMPT` debe poder leer versiones anteriores del mismo `promptId` sin perder `extends`/`pinnedVersion` ya referenciados por otros documentos — no se decide el mecanismo exacto en esta fase (Checkpoint 2).
- **Rechazo de campos incompatibles:** cualquier campo fuera de la lista documentada se rechaza (mismo principio de whitelist estricta ya aplicado y aprobado en Provider Health Sensor — reutilizable como precedente de diseño, no como código compartido).

**Ejemplo válido (conceptual):**
```yaml
promptId: driver-core
schemaVersion: 1
title: "Driver — único escritor autorizado"
scope: role
extends: companion-core
body: "..."
createdAt: 1784500000000
updatedAt: 1784500000000
```

**Ejemplo inválido:** falta `promptId` (no hay identidad estable); o incluye `apiKey: "sk-..."` (secreto embebido, prohibido categóricamente en cualquier capa de `ai-cloud/`).

### 4.2 `MEMORY`

**Propósito:** conocimiento duradero de una relación/dominio — lo que hoy vive en `memories/chatgpt-orchestrator-memories.md`, formalizado como unidad direccionable en vez de un único archivo monolítico por agente.

- **ID estable:** `memoryId`.
- **schemaVersion:** entero.
- **Campos requeridos:** `memoryId`, `schemaVersion`, `scope`, `ownerRole`, `knowledgeType` (sección 6), `body`, `confidence`, `freshness`, `privacyLevel`, `createdAt`, `updatedAt`.
- **Campos opcionales:** `providerOrigin`, `project`, `topic`, `sourceSession`, `sourceMessage`, `sourceToolResult`, `baseCommit`, `supersedes`, `expiresAt`.
- **Referencias:** `sourceSession` → `SESSION.sessionId`; `sourceToolResult` → `EVIDENCE.evidenceId`; `supersedes` → otro `memoryId`.
- **Invariantes:** una `MEMORY` de `knowledgeType: FACT` o `OBSERVATION` debe tener al menos una referencia de evidencia (`sourceSession`/`sourceMessage`/`sourceToolResult`) — no puede ser puro texto sin procedencia (ver sección 7). Una `MEMORY` nunca copia el estado operativo vigente de una misión (ese vive en `MISSION`/checklist, regla ya vigente hoy en `AI-cloud.md`).
- **Estados:** `ACTIVE`, `SUPERSEDED` (reemplazada, ver sección 9), `RETRACTED` (se determinó falsa/errónea, se conserva por transparencia pero marcada).
- **Privacidad:** por defecto `TEAM` (visible a los roles de la misma misión/orquestación) — nunca `SHAREABLE` por defecto, requiere decisión explícita de subir el nivel.
- **Migración:** igual criterio que `PROMPT`.
- **Rechazo:** whitelist estricta de campos, mismo principio que 4.1.

**Ejemplo válido (conceptual, basado en contenido ya real de `chatgpt-orchestrator-memories.md`):**
```yaml
memoryId: mem-claude-driver-role-2026-07
schemaVersion: 1
scope: relationship
ownerRole: driver
knowledgeType: RULE
body: "Un solo escritor por estado mutable; los agentes son reemplazables, los roles son persistentes."
confidence: HIGH
freshness: STABLE
privacyLevel: TEAM
sourceSession: null
createdAt: 1784400000000
updatedAt: 1784400000000
```

**Ejemplo inválido:** `knowledgeType: FACT` sin ninguna referencia de procedencia (`sourceSession`/`sourceMessage`/`sourceToolResult` todos ausentes) — un hecho sin evidencia no es distinguible de una alucinación, y el contrato lo rechaza por invariante.

### 4.3 `SESSION`

**Propósito:** compactación de una conversación/turno de trabajo real — prompt original, mensajes, tool calls, resultados, decisiones, próxima acción. Corresponde a la Fase 5 (Compactador de sesiones) ya descrita en el checklist canónico, aquí solo se contractualiza la forma del dato, no el compactador en sí.

- **ID estable:** `sessionId`.
- **schemaVersion:** entero.
- **Campos requeridos:** `sessionId`, `schemaVersion`, `missionId`, `ownerRole`, `providerOrigin`, `startedAt`, `lastActivityAt`, `status` (ver Estados).
- **Campos opcionales:** `project`, `baseCommit`, `nextAction`, `handoffRef` (referencia al artefacto de handoff íntegro, ver `AI-cloud.md` §Handoffs), `compactedFrom` (si esta sesión es una recompactación de otra).
- **Referencias:** `missionId` → `MISSION.missionId`; `handoffRef` → un artefacto de evidencia (no el texto embebido, ver sección 7); `compactedFrom` → otro `sessionId`.
- **Invariantes:** una `SESSION` con `status: PAUSED_LIMIT` (agente agotó cuota) debe conservar `nextAction` explícita y no puede eliminarse hasta que exista una `SESSION` de sustitución que la referencie — mismo principio ya exigido en `chatgpt-orchestrator-memories.md` (*"Preservar el último resultado confirmado cuando una sesión muere a mitad de turno"*).
- **Estados:** `ACTIVE`, `COMPLETED`, `PAUSED_LIMIT`, `BLOCKED`, `SUPERSEDED_BY_COMPACTION`.
- **Privacidad:** `PRIVATE` por defecto — una sesión real contiene el trabajo íntegro del usuario. Nunca `SHAREABLE` por defecto.
- **Migración:** igual criterio.
- **Rechazo:** whitelist estricta.

**Ejemplo válido:**
```yaml
sessionId: sess-2026-07-19-qwen-lyria-cloud-01
schemaVersion: 1
missionId: mission-qwen-lyria-cloud
ownerRole: driver
providerOrigin: claude
startedAt: 1784480000000
lastActivityAt: 1784502000000
status: COMPLETED
nextAction: null
```

**Ejemplo inválido:** `status: PAUSED_LIMIT` sin `nextAction` — el contrato exige saber exactamente qué retomar, no solo que algo quedó pausado.

### 4.4 `EVIDENCE`

**Propósito:** referencia verificable a la procedencia real de un hecho — mensaje, resultado de tool, archivo, commit, diff, documento, URL pública, decisión humana. Deliberadamente análogo en espíritu al `EvidenceEntry` ya diseñado e implementado para Provider Health Sensor (mismo principio: nunca texto libre sensible por defecto, siempre referencia estructurada).

- **ID estable:** `evidenceId`.
- **schemaVersion:** entero.
- **Campos requeridos:** `evidenceId`, `schemaVersion`, `evidenceKind` (ver lista sección 7), `sourceSession`, `observedAt`.
- **Campos opcionales:** `sourceMessage`, `sourceToolResult`, `baseCommit`, `fileRef`, `urlRef` (solo si `evidenceKind: PUBLIC_URL`), `toolCallState` (uno de: `PROPOSED`/`EMITTED`/`ACCEPTED`/`EXECUTED`/`RESULT_RECEIVED`/`CONCLUSION_VERIFIED` — ver sección 7), `expiresAt`.
- **Referencias:** `sourceSession` → `SESSION.sessionId`.
- **Invariantes:** si `evidenceKind` implica una tool (`TOOL_CALL`), `toolCallState` es obligatorio y debe reflejar honestamente en cuál de las 6 fases se quedó — nunca se asume `CONCLUSION_VERIFIED` sin que exista, en algún lugar, un resultado recibido y verificado.
- **Estados:** no tiene estado propio más allá de `toolCallState` (para evidencia de tool) — una evidencia no se "completa" ni se "cancela", es un registro inmutable de lo que se observó.
- **Privacidad:** `PRIVATE` por defecto (puede contener fragmentos de trabajo real del usuario); `fileRef`/`urlRef` prefieren la referencia (ruta/URL) sobre el contenido embebido.
- **Migración:** igual criterio.
- **Rechazo:** whitelist estricta; nunca contenido de texto libre sensible embebido cuando una referencia (ruta, hash, URL) es suficiente — mismo principio ya aprobado y endurecido en Provider Health Sensor (`EvidenceEntry`/`PartialArtifactRef`).

**Ejemplo válido:**
```yaml
evidenceId: ev-tool-bash-2026-07-19-01
schemaVersion: 1
evidenceKind: TOOL_CALL
sourceSession: sess-2026-07-19-qwen-lyria-cloud-01
toolCallState: RESULT_RECEIVED
observedAt: 1784499904000
```

**Ejemplo inválido:** `evidenceKind: TOOL_CALL` sin `toolCallState` — no permite distinguir "se propuso" de "se ejecutó realmente", justo la ambigüedad que `AI-cloud.md` prohíbe explícitamente (*"No afirmes que una acción ocurrió antes de recibir el resultado real"*).

---

## 5. Metadatos mínimos — justificación campo por campo

| Campo | Justificación |
|---|---|
| `memoryId` | Identidad estable de una `MEMORY` — sin esto no hay forma de referenciarla desde `supersedes` ni de evitar duplicados. |
| `promptId` | Identidad estable de un `PROMPT` — necesaria para `extends`/`pinnedVersion`. |
| `sessionId` | Identidad estable de una `SESSION` — necesaria para que `MEMORY.sourceSession` y `EVIDENCE.sourceSession` referencien algo concreto. |
| `missionId` | Une una `SESSION` a la misión que la originó — sin esto, una sesión queda huérfana de contexto de negocio. |
| `evidenceId` | Identidad estable de una `EVIDENCE` — necesaria para que `MEMORY.sourceToolResult` referencie algo concreto y para `contradicts`-like referencias futuras. |
| `schemaVersion` | Permite evolucionar la forma de cada contrato sin romper documentos ya escritos — mismo principio ya validado en Provider Health Sensor (`CONTRACT_VERSION`). |
| `scope` | Distingue `global`/`role`/`relationship`/etc. — sin esto, un prompt o memoria no sabe a qué audiencia aplica. |
| `ownerRole` | Rol persistente dueño del contenido (Driver/Navigator/Orchestrator/etc., ya vocabulario existente en `AI-cloud.md`) — separa "quién es responsable" de "qué proveedor lo ejecutó" (`providerOrigin`). |
| `providerOrigin` | Qué proveedor/agente concreto originó el contenido — necesario para el futuro Team Builder (catálogo de desempeño por proveedor) y para no confundir rol persistente con agente reemplazable. |
| `project` | Aurora ya es multi-proyecto en la práctica (esta sesión mencionó explícitamente Left4Dead como dominio separado en `chatgpt-orchestrator-memories.md`) — sin este campo, memorias de dominios distintos se mezclarían. |
| `topic` | Subdivisión dentro de un proyecto, para indexado (sección 10) sin depender de leer el `body` completo. |
| `sourceSession` | Procedencia obligatoria para `FACT`/`OBSERVATION` (sección 6) — sin esto, no hay forma de auditar de dónde salió una memoria. |
| `sourceMessage` | Procedencia más fina que `sourceSession` cuando el hecho remonta a un mensaje puntual, no a toda la sesión. |
| `sourceToolResult` | Procedencia específica cuando el hecho viene de un resultado de tool — distingue "lo dijo el LLM" de "lo confirmó una tool real". |
| `baseCommit` | Ata una decisión técnica/memoria a un estado exacto del código — sin esto, una memoria sobre "cómo funciona X" puede quedar obsoleta silenciosamente tras un refactor. |
| `confidence` | Ya establecido como necesario en toda esta sesión (Provider Health Sensor usó exactamente este concepto) — sin esto, toda memoria se trataría como igualmente cierta. |
| `freshness` | Distingue una memoria recién confirmada de una que no se revisita hace meses — insumo para decidir si conviene re-verificar antes de confiar en ella. |
| `privacyLevel` | Sección 8 — sin esto, no hay forma de decidir a quién se le puede mostrar. |
| `supersedes` | Sección 9 — sin esto, corregir una memoria requeriría editarla en el lugar (perdiendo el historial) o duplicarla sin relación explícita. |
| `createdAt`/`updatedAt` | Mínimo indispensable de cualquier registro versionado; sin esto no hay forma de ordenar ni de calcular `freshness`. |
| `expiresAt` | Solo aplica a contenido con vida útil conocida (p. ej. una oportunidad temporal, ya existente como concepto en `chatgpt-orchestrator-memories.md` §"Tareas temporales") — opcional, no todo conocimiento caduca. |

Ningún campo de la lista del prompt de misión fue omitido; ninguno se agregó por decoración.

---

## 6. Tipos de conocimiento

| Tipo | Necesita evidencia | Necesita confianza | Puede quedar provisional | Requiere revisión humana | Puede superseder |
|---|---|---|---|---|---|
| `FACT` | Sí, obligatoria (invariante de `MEMORY`) | Sí | No — un hecho sin evidencia no es un `FACT`, es una `HYPOTHESIS` | Solo si se retracta | Sí, a otro `FACT` u `OBSERVATION` obsoletos |
| `INFERENCE` | Recomendada, no obligatoria | Sí, explícita (nunca implícita) | Sí | Recomendada antes de promoverla a `FACT` | Sí, a otra `INFERENCE` |
| `DECISION` | Sí — quién decidió y cuándo | No aplica (una decisión no tiene "confianza", existe o no) | No | Sí, si la toma un humano; opcional si la toma un Orchestrator dentro de su autoridad ya delegada | Sí, explícitamente (una decisión reemplaza a otra) |
| `PREFERENCE` | Recomendada (mensaje del usuario que la expresó) | No aplica del mismo modo — una preferencia no es "más o menos cierta", es válida hasta que cambie | Sí | No, salvo contradicción con otra preferencia | Sí |
| `RULE` | Sí — el incidente/decisión que la originó (mismo patrón que "feedback" en memoria de sesión de este proyecto) | Sí | No — una regla vive o se retira, no vive "a medias" | Sí, para reglas de alto impacto | Sí |
| `HYPOTHESIS` | No requerida (por definición, es lo que se investiga) | Sí, típicamente `LOW`/`MEDIUM` | Sí, por diseño | Sí, antes de promover a `FACT` | Sí, a otra `HYPOTHESIS` refinada |
| `OBSERVATION` | Sí, obligatoria (igual que `FACT`) | Sí | Sí (una observación puede no repetirse) | No, salvo que contradiga otra observación | Sí |

**Regla de promoción (`PROPUESTA`, no implementada):** una `HYPOTHESIS` puede convertirse en `FACT` únicamente cuando se le añade evidencia verificada suficiente — este documento no define el umbral exacto (queda para Checkpoint 3, junto con los validadores).

---

## 7. Evidencia y procedencia

`EVIDENCE.evidenceKind` (enum conceptual, `PROPUESTA`):

```
MESSAGE | TOOL_CALL | FILE | COMMIT | DIFF | DOCUMENT | PUBLIC_URL | HUMAN_DECISION
```

Para `TOOL_CALL`, `EVIDENCE.toolCallState` distingue exactamente las 6 fases ya exigidas por `AI-cloud.md` §"Honestidad sobre tools":

```
PROPOSED → EMITTED → ACCEPTED → EXECUTED → RESULT_RECEIVED → CONCLUSION_VERIFIED
```

Cada transición es un hecho distinto y verificable por separado — exactamente el mismo principio ya aplicado (y endurecido con evidencia real) en el diseño del Provider Health Sensor para distinguir ACK de consumo, journal de entrega, entrega al composer y aceptación real por el proveedor. `EVIDENCE` para `FILE`/`COMMIT`/`DIFF` usa `fileRef`/`baseCommit` (rutas relativas y hashes, nunca contenido embebido completo salvo que sea genuinamente pequeño y no sensible). `EVIDENCE` para `PUBLIC_URL` exige que la URL sea pública y ya haya sido provista por el usuario o encontrada en una búsqueda legítima — nunca inventada.

**Regla dura heredada sin cambios de `AI-cloud.md`:** *"No afirmes que una acción ocurrió antes de recibir el resultado real. Una tool sin respuesta no cuenta como evidencia."* — el contrato `EVIDENCE` la hace estructural: no puede existir un registro con `toolCallState: CONCLUSION_VERIFIED` sin que, en algún momento anterior, haya existido `RESULT_RECEIVED`.

---

## 8. Privacidad

Niveles (ya nombrados en `chatgpt-orchestrator-memories.md`, aquí se les da contrato):

| Nivel | Lectura | Escritura | Exportación | Redacción | Revocación | Expiración | Auditoría |
|---|---|---|---|---|---|---|---|
| `PRIVATE` | Solo el rol/usuario dueño | Solo el dueño o un Orchestrator con autoridad explícita | Nunca automática | N/A (no sale) | N/A | Puede tener `expiresAt` | Registrar cada lectura por un agente distinto del dueño |
| `TEAM` | Roles de la misma misión/orquestación activa | Roles autorizados de esa misión | Solo dentro del mismo equipo | No necesaria dentro del equipo | Se puede bajar a `PRIVATE` | Opcional | Registrar qué rol leyó qué |
| `MISSION` | Cualquier rol asignado a esa misión específica, incluso de otro equipo | Roles asignados a la misión | Solo entre misiones relacionadas, explícitamente | Igual que `TEAM` | Se puede bajar a `TEAM`/`PRIVATE` | Opcional | Igual que `TEAM` |
| `SHAREABLE` | Cualquier agente autorizado por Lyria | Requiere aprobación humana para promover algo a este nivel | Permitida explícitamente | Obligatoria si el contenido original era de nivel inferior y contenía datos personales | Se puede bajar en cualquier momento | Opcional | Registrar entrega a cada proveedor externo |

**Regla dura (`DECISIÓN`, hereda literalmente `AI-cloud.md`):** AI-Cloud es local y privado por defecto. Ningún documento nuevo se crea con `privacyLevel: SHAREABLE` sin decisión explícita — el valor por defecto de cualquier contrato de esta fase es `PRIVATE` (`EVIDENCE`, `SESSION`) o `TEAM` (`MEMORY`), nunca `SHAREABLE`.

**Reglas por proveedor y rol (`PROPUESTA`):** Lyria (cuando exista el mecanismo, Fase 7) decide qué memoria entrega a cada agente según `privacyLevel` + `ownerRole` + el rol del agente destinatario — nunca entrega todas las memorias a todos los proveedores (ya exigido literalmente en `chatgpt-orchestrator-memories.md`).

---

## 9. Supersesión y contradicciones

- **Corregir:** se crea una nueva entrada (`MEMORY`/`PROMPT`) con `supersedes: <idAnterior>`; la anterior pasa a `SUPERSEDED`, nunca se edita en el lugar (mismo principio que Git: nueva versión, no reescritura de historia).
- **Reemplazar:** igual mecanismo — `supersedes` apunta a exactamente una entrada anterior (no a un conjunto, para mantener una cadena lineal auditable, no un grafo).
- **Marcar obsoleta sin reemplazo directo:** estado `RETIRED`/`DEPRECATED` sin `supersedes` (se sabe que ya no aplica, pero no hay una versión nueva que la sustituya punto a punto).
- **Conservar evidencia histórica:** una entrada `SUPERSEDED`/`RETRACTED` nunca se borra — permanece legible con su estado marcado, igual que Git conserva commits viejos.
- **Detectar contradicciones:** dos `MEMORY` `ACTIVE` sobre el mismo `topic`+`scope` con `body` incompatible es una contradicción — su resolución (cuál prevalece) es una decisión humana o de Orchestrator explícita, nunca automática por "la más reciente gana" sin registro.
- **Impedir ciclos de supersesión:** invariante — `supersedes` forma un grafo acíclico dirigido; A no puede superseder a B si B (directa o transitivamente) ya supersede a A. La verificación de esto es un validador de Checkpoint 3, no de esta fase.
- **Nunca presentar una entrada superada como vigente:** cualquier consumidor (Lyria, un agente) que lea memorias debe filtrar por `state: ACTIVE` por defecto — leer una `SUPERSEDED` requiere pedir explícitamente el historial.

---

## 10. Índices

**PROPUESTA**, todos derivados — **nunca segunda fuente de verdad**, siempre reconstruibles desde `memories/`+`sessions/`+`missions/`+`evidence/` recorriendo sus metadatos:

- Por `project`
- Por `ownerRole`
- Por `providerOrigin`
- Por `missionId`
- Por `topic`
- Por `privacyLevel`
- Por `freshness`
- Por `knowledgeType`

Viven en `ai-cloud/indexes/` (sección 3) como archivos (o, en una fase posterior, una tabla de DB) que cualquier proceso puede borrar y regenerar sin pérdida de información real — la fuente de verdad son siempre los documentos individuales con sus propios metadatos, nunca el índice.

---

## 11. Política de Git (propuesta de reglas futuras — `.gitignore` NO se modifica en este checkpoint)

| Contenido | Tratamiento propuesto |
|---|---|
| `prompts/`, `memories/`, `docs/`, `schemas/` | Versionado normal — es exactamente lo que ya se versiona hoy. |
| `sessions/` con contenido real de conversaciones | **Excluir de Git** por defecto (`PRIVATE`, puede contener datos personales/de trabajo real) — candidato a `ai-cloud/sessions/**` en un futuro `.gitignore`. |
| `evidence/` con contenido sensible embebido | Igual criterio que `sessions/` — pero si `EVIDENCE` respeta el principio de "referencia, no contenido" (sección 7), la mayoría de `evidence/` debería ser liviana y potencialmente versionable; se decide caso por caso en Checkpoint 4. |
| `artifacts/` grandes (PDF, DOCX, imágenes) | Excluir de Git — mismo criterio que cualquier binario grande en cualquier repo; usar almacenamiento propio fuera del árbol de Git o Git LFS si se decide versionarlos (no se decide aquí). |
| Secretos/tokens/claves | Nunca en ningún archivo de `ai-cloud/`, versionado o no — regla absoluta ya vigente. |
| `indexes/` | Excluir de Git — son reconstruibles, versionarlos solo generaría diffs de ruido. |
| `teams/` | Versionado normal (definiciones de equipo son configuración, no datos privados de sesión). |
| Ejemplos sanitizados para tests/fixtures futuros | Versionado normal, viven junto a los tests que los usan (Checkpoint 3), no dentro de `ai-cloud/` en sí. |

---

## 12. Migración inicial (diseño, sin ejecutar)

**No se ejecuta ninguna migración física en este checkpoint** (instrucción explícita).

- `AI-cloud.md`: se convertiría, en una fase futura, en el `PROMPT` con `promptId: companion-core`, `scope: global`. El archivo actual YA es casi literalmente ese contrato en prosa — la migración sería mayormente envolver el contenido existente con los metadatos de la sección 5, sin reescribir la prosa.
- `CHECKLIST-ACTIVO.md`: se descompondría en múltiples `MISSION`+`SESSION` (una por misión activa/cerrada ya documentada: Qwen/Lyria Cloud, Provider Health Sensor, SOL Productivity Inquisition, esta misma AI-Cloud Memory Foundry). El crecimiento ya observado de este archivo (718→1694 líneas durante esta sola sesión) es evidencia empírica directa de por qué la Fase 1 propone esta descomposición — pero migrarlo ahora rompería la única fuente de verdad operativa que todos los agentes de esta sesión están usando activamente; se pospone a un checkpoint dedicado (Checkpoint 7) para no interrumpir trabajo en curso.
- `memories/chatgpt-orchestrator-memories.md`: se descompondría en múltiples `MEMORY` individuales (una por bloque temático: identidad funcional, arquitectura de colaboración, cada bug/hallazgo pendiente) en vez de un único archivo monolítico. Cada entrada resultante necesitaría reconstruir su `sourceSession`/`sourceToolResult` lo mejor posible desde el contexto ya escrito (no siempre será perfecto — ver riesgo en sección 13).

**Ninguna migración se ejecuta sin pérdida de información demostrada primero en un entorno de prueba — principio general, no implementado aún.**

---

## 13. Riesgos

- **Duplicación entre memoria y checklist**: riesgo ya identificado y mitigado parcialmente por la regla existente en `AI-cloud.md` — pero nada impide hoy, mecánicamente, que un agente futuro la viole; sin un validador (Checkpoint 3) la regla depende de disciplina, no de garantía estructural.
- **Estado obsoleto**: una `MEMORY` con `freshness` vieja puede citarse como si fuera actual si un agente no revisa `updatedAt`.
- **Inferencias tratadas como hechos**: mitigado por separar `FACT` de `INFERENCE`/`HYPOTHESIS` (sección 6), pero requiere que quien escribe la memoria elija el tipo correctamente — sin validación automática de "esto realmente tiene la evidencia que un `FACT` exige" en esta fase.
- **Filtración a proveedores**: mitigado por `privacyLevel` + regla de Lyria de no entregar todo a todos — pero el mecanismo de entrega selectiva (Fase 7) no existe todavía; hoy, en la práctica, un handoff textual completo ya se entrega íntegro a cada Navigator sustituto (patrón usado en toda esta sesión), lo cual es la política ACTUAL correcta para handoffs de misión (`AI-cloud.md` lo exige así), pero sería un riesgo real si se aplicara del mismo modo a memorias de nivel `PRIVATE`.
- **IDs inestables**: si `memoryId`/`sessionId`/`evidenceId` no se generan con una convención estable (slug+timestamp o similar) desde el principio, referencias cruzadas (`supersedes`, `sourceSession`) se rompen con el tiempo. No se decide el algoritmo exacto en esta fase.
- **Referencias rotas**: `supersedes`/`sourceSession`/`sourceToolResult` apuntando a un ID que ya no existe — mitigado en diseño por "nunca borrar, solo marcar estado", pero requiere que ningún proceso futuro borre físicamente un archivo de `ai-cloud/`.
- **Crecimiento ilimitado**: mismo síntoma ya observado en `CHECKLIST-ACTIVO.md` (718→1694 líneas en una sesión) — la descomposición en `MISSION`/`SESSION` individuales (sección 3) mitiga esto estructuralmente, pero solo tras la migración (Checkpoint 7, no ejecutada).
- **Evidencia sensible**: riesgo directo si `EVIDENCE`/`SESSION` embeben contenido real en vez de referencias — mitigado por diseño (sección 7) pero depende de que la implementación (Checkpoint 3+) lo respete, igual que se tuvo que endurecer explícitamente en Provider Health Sensor tras un primer diseño que sí embebía texto.
- **Conflictos de edición / múltiples escritores**: si dos agentes escriben la misma `MEMORY`/`MISSION` a la vez sin coordinación, se pierde una escritura — mismo problema que "un solo escritor por estado mutable" ya reconocido en `AI-cloud.md`, sin mecanismo de lease/lock todavía diseñado para archivos de `ai-cloud/` (a diferencia de la coordinación por rama/worktree que sí existe para código).
- **Migraciones incompatibles**: un cambio de `schemaVersion` sin estrategia de lectura retroactiva (sección 4) podría dejar ilegibles documentos antiguos — no se resuelve el mecanismo exacto en esta fase, queda para Checkpoint 2.

---

## 14. Checkpoints futuros (propuesta, no autorización)

1. **Checkpoint 2 — Schemas puros**: traducir los contratos conceptuales de la sección 4 a definiciones de tipos/constantes en código (mismo patrón `types.js` IIFE clásico ya usado y aprobado en Provider Health Sensor), sin validadores todavía.
2. **Checkpoint 3 — Validadores y fixtures**: `validate.js` puro + tests deterministas (mismo patrón ya construido y endurecido para Provider Health Sensor: whitelist estricta, lectura segura de campos/arrays, sin ejecutar código del input).
3. **Checkpoint 4 — Almacenamiento local**: decidir el mecanismo real de persistencia (archivos `.md`+frontmatter vs. tabla de DB del backend existente) para `sessions/`/`evidence/` de alto volumen.
4. **Checkpoint 5 — Índices**: construir los índices derivados de la sección 10 sobre datos reales ya migrados.
5. **Checkpoint 6 — Integración semántica**: exponer acciones a Lyria para buscar/leer/crear/corregir memorias (Fase 7 del checklist canónico), con las reglas de privacidad de la sección 8 aplicadas de verdad.
6. **Checkpoint 7 — Migración de memoria real**: ejecutar, por fin, la migración diseñada en la sección 12 sobre los 3 archivos canónicos actuales, con verificación de cero pérdida de información.

Cada uno requiere autorización explícita separada del Orchestrator, igual que el patrón ya seguido en Provider Health Sensor.

---

## 15. CHECKLIST_DELTA

**Puntos de Fase 1 que pueden marcarse completados solo por este discovery:**
- Inventario de archivos existentes y sus relaciones — completado por lectura directa.
- Decisión de ubicación definitiva (`ai-cloud/` en la raíz del repo) — decidida y justificada.
- Estructura de carpetas propuesta (con `docs/` ya creada, el resto solo documentado, no creado).
- Los 4 contratos conceptuales (`PROMPT`, `MEMORY`, `SESSION`, `EVIDENCE`) diseñados con campos, invariantes, estados, privacidad y ejemplos.
- Metadatos mínimos justificados campo por campo, sin decoración.
- 7 tipos de conocimiento contractualmente separados.
- Modelo de evidencia con las 6 fases de honestidad sobre tools ya heredadas de `AI-cloud.md`.
- 4 niveles de privacidad con reglas de lectura/escritura/exportación/redacción/revocación/expiración/auditoría.
- Modelo de supersesión y contradicciones (sin ciclos, sin borrado, sin presentar lo superado como vigente).
- 8 índices propuestos, todos declarados explícitamente derivados/reconstruibles.
- Política de Git propuesta (sin tocar `.gitignore` todavía).
- Estrategia de migración diseñada para los 3 archivos canónicos (sin ejecutar).
- 11 riesgos identificados.
- Secuencia de 6 checkpoints futuros propuesta.

**Puntos que siguen pendientes (no se resuelven en esta fase):**
- Algoritmo exacto de generación de IDs estables (`memoryId`/`sessionId`/`evidenceId`).
- Mecanismo exacto de migración retroactiva entre `schemaVersion`s.
- Umbral exacto para promover `HYPOTHESIS` → `FACT`.
- Mecanismo de lease/lock para evitar conflictos de edición concurrente sobre archivos de `ai-cloud/` (distinto del aislamiento por rama/worktree ya usado para código).
- Decisión de si `ai-cloud/` alguna vez merece un repositorio Git separado (descartada para esta fase, no cerrada para siempre).

**Decisiones que requieren Navigator (`PENDIENTE_NAVIGATOR`):**
- Validar que los 4 contratos conceptuales no omitan ningún campo/invariante material antes de pasar a Checkpoint 2 (schemas en código).
- Revisar si la clasificación de `sessions/`/`evidence/` como excluidos de Git por defecto es demasiado conservadora o insuficiente frente a la política real de privacidad que Diego espera.
- Confirmar si la decisión de posponer la migración física de `CHECKLIST-ACTIVO.md` (Checkpoint 7, no ahora) es aceptable dado su crecimiento ya observado.

**Siguiente checkpoint propuesto:** Checkpoint 2 — Schemas puros en código (mismo patrón IIFE clásico + namespace protegido ya validado en Provider Health Sensor), sujeto a autorización explícita del Orchestrator y revisión de Navigator sobre este documento primero.

**Explícitamente fuera de alcance de esta fase (recordatorio, no implementado):** runtime, validadores ejecutables, persistencia funcional, UI, integración con Provider Health, compactación de sesiones real, Team Builder, Artifact Foundry, migración física de los 3 archivos canónicos, modificación de `.gitignore`.
