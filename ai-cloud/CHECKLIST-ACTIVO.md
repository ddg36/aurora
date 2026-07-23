# ✅ Checklist activo de Aurora

Archivo compartido de trabajo entre Diego y ChatGPT.

> Regla: nada se marca como completado sin evidencia real. Cada cambio importante debe actualizar este archivo para que una conversación nueva pueda retomar el trabajo sin depender de memoria informal.

---

## ✅ Misión cerrada — Integración inicial de Qwen en Lyria Chat

### Estado conocido

- [x] Repositorio identificado.
  - `/media/almacen/deml/Downloads/core_instruction/aurora`
- [x] Rama de tarea creada antes de autorizar implementación.
  - `task/qwen-lyria-cloud`
- [x] Commit base confirmado mediante tools.
  - `f421c9ada01b1bf1dba533901d457bbd4da555a1`
  - corto: `f421c9a`
- [x] Claude Code asignado como **Driver** y único escritor.
- [x] Qwen asignado inicialmente como **Navigator**.
- [x] Qwen verificó parte del repositorio con tools reales.
- [x] Qwen quedó en `PAUSED_LIMIT` por límite de uso.
- [x] Handoff de sustitución preparado para ChatGPT.
- [x] ChatGPT abierto en una conversación nueva como **Navigator sustituto**.
- [x] Navigator sustituto completó `NAVIGATOR_HANDOFF_COMPLETED`.
- [x] Primer checkpoint aprobado con alcance mínimo y estrictamente aditivo.
- [x] Driver implementó el checkpoint sin ampliar el alcance.
- [x] Commit resultado creado y verificado:
  - `17e1e710c1e33058142eaf7ba519bbde51643c00`
  - corto: `17e1e71`
  - padre directo: `f421c9ada01b1bf1dba533901d457bbd4da555a1`
- [x] Navigator revisó el commit exacto `f421c9a..17e1e71`.
- [x] Veredicto final: `APPROVED_WITH_FOLLOWUP`.
- [x] Checkpoint seguro para cerrar y rama segura para avanzar.
- [x] Ningún cambio requerido, amend ni commit correctivo.
- [!] Pruebas vivas de Qwen pendientes por bloqueo externo:
  - `BLOCKED_EXTERNAL_PAUSED_LIMIT`
- [!] Working tree con cambios preexistentes ajenos al checkpoint:
  - `README.md`;
  - `docs/restaurado/ideas-rescatadas.md`;
  - `ai-cloud/`;
  - backups y artifacts untracked.
  - deben preservarse y quedar fuera de cualquier stage/commit ajeno.

### Evidencia preservada de Qwen

- [x] Rama, HEAD y working tree verificados.
- [x] Qwen ausente del picker vivo en `ui/modules/lyra/view/lyra.js`.
- [x] Qwen presente en `ui/modules/llmcloud/scripts/urls.js`.
- [x] Estado independiente de Cloud confirmado en `llmcloud.js`.
- [x] Restauración por host inspeccionada en `llm-sesiones.js`.
- [x] Ciclo de vida de iframes inspeccionado en `aurora-bridge.js`.
- [x] Retry y ACK inspeccionados en `provider-relay.js`.
- [x] Inyección de Qwen confirmada en `manifest.json`.
- [x] `ui/components/shared/cloud-ask.js` inspeccionado por el Navigator sustituto.
  - La llamada inconclusa de Qwen fue repetida correctamente con una tool real.
  - Confirmado: el flujo usa `paneId` genérico y no contiene una whitelist que bloquee Qwen.

---

## 🧭 Siguientes acciones exactas

### Fase 1 — Navigator sustituto

- [x] Abrir conversación nueva de ChatGPT.
- [x] Entregar el handoff completo preparado.
- [x] Reconfirmar mediante tools:
  - [x] rama activa: `task/qwen-lyria-cloud`;
  - [x] HEAD: `f421c9a`;
  - [x] working tree: modificación rastreada en `ideas-rescatadas.md` y untracked fuera de alcance.
- [x] Repetir la inspección pendiente de `cloud-ask.js`.
- [x] Revisar únicamente los puntos todavía abiertos.
- [x] Entregar `NAVIGATOR_HANDOFF_COMPLETED`.
- [x] Emitir veredicto sobre el primer checkpoint: **APROBABLE**.

Hallazgo nuevo preservado:

- [x] `relay-reinjector.js` mapea actualmente `chat.qwen.ai` a `relay-generic.js`, mientras el manifest carga `relay-qwen.js`.
- [x] Adapter efectivo probado antes y después de `--full-reload`.
  - resultado observado: `qwen@1`;
  - no se reprodujo activación de `generic` en los escenarios probados.
- [ ] Probar en un checkpoint futuro caminos de recuperación no cubiertos:
  - tab descartada y restaurada;
  - reinicio del service worker a mitad de sesión;
  - reconstrucción MAIN desde cero.
- [ ] Crear checkpoint correctivo sólo si alguno de esos escenarios demuestra que queda activo `generic`.

### Fase 2 — Primer checkpoint del Driver

- [x] Claude autorizado a modificar únicamente:
  - `ui/modules/lyra/view/lyra.js`
- [x] Qwen añadido de forma aditiva a:
  - [x] `AI_URLS`;
  - [x] `AI_LABELS`;
  - [x] `AI_ICONOS`.
- [x] Permanecieron fuera del alcance:
  - relays;
  - Manifest;
  - Aurora Bridge;
  - Cloud tab;
  - sincronización Lyria ↔ Cloud;
  - código muerto.
- [x] Claude ejecutó validaciones estáticas y pruebas pasivas permitidas.
- [x] Claude creó el commit pequeño `17e1e71`.
- [x] El commit contiene exclusivamente `ui/modules/lyra/view/lyra.js`.
- [x] Claude entregó:
  - [x] hash exacto;
  - [x] diff;
  - [x] archivos modificados;
  - [x] pruebas realizadas;
  - [x] evidencia;
  - [x] riesgos pendientes.

### Fase 3 — Revisión del checkpoint

- [x] Navigator revisó el commit exacto, no una rama móvil.
- [x] Rango revisado:
  - `f421c9ada01b1bf1dba533901d457bbd4da555a1..17e1e710c1e33058142eaf7ba519bbde51643c00`
- [x] Padre directo y ausencia de commits intermedios confirmados.
- [x] Confirmado que sólo cambió `ui/modules/lyra/view/lyra.js`.
- [x] Diff exacto confirmado:
  - `3 insertions`;
  - `2 deletions` por reemplazo de las líneas compactas de labels e iconos;
  - sin refactors ni reformateo ajeno.
- [x] `node --check` aprobado.
- [x] `git diff --check` aprobado.
- [x] Ninguna regresión demostrada dentro del alcance.
- [x] Veredicto: `APPROVED_WITH_FOLLOWUP`.
- [x] `safe_to_close_checkpoint: yes`.
- [x] `safe_to_advance_branch: yes`.

### Fase 4 — Pruebas de aceptación de Lyria, Diego y ChatGPT

- [x] Qwen aparece en el picker real de Lyria.
- [x] Seleccionar Qwen carga `https://chat.qwen.ai/`.
- [x] Persistencia observada:
  - `lyra_cloud_ai='qwen'`;
  - `lyra_cloud_url='https://chat.qwen.ai/'`.
- [x] Pane `cloud` cargó Qwen en las instancias probadas.
- [x] Adapter efectivo observado: `qwen@1`, no `generic`.
- [x] Adapter `qwen@1` conservado tras `--full-reload`.
- [x] Diagnóstico pasivo de ChatGPT confirmó `chatgpt@2` registrado e idle.
- [ ] Enviar un mensaje normal y recibir respuesta.
  - bloqueo: `BLOCKED_EXTERNAL_PAUSED_LIMIT`.
- [ ] Ejecutar una tool real desde Qwen.
  - bloqueo: `BLOCKED_EXTERNAL_PAUSED_LIMIT`.
- [ ] Confirmar que no existen envíos duplicados durante una respuesta viva.
  - pendiente hasta recuperar disponibilidad externa.
- [ ] Cambiar de pestaña durante streaming real de Qwen.
- [ ] Ocultar y restaurar Lyria durante streaming real sin destruir el iframe.
- [ ] Alternar Qwen → ChatGPT → Qwen con conversaciones vivas.
- [ ] Smoke test completo de ChatGPT con envío nuevo.
  - no realizado para evitar tráfico adicional durante el diagnóstico.
- [ ] Probar casos diferentes de los usados por Driver y Navigator cuando Qwen recupere cuota.

### Cierre formal del checkpoint

- [x] Objetivo del picker completado.
- [x] Commit inmutable aprobado.
- [x] No se requiere modificar `17e1e71`.
- [x] La falta de una respuesta viva no invalida el diff puramente aditivo.
- [x] Diagnóstico DOM de disponibilidad preservado como `UNKNOWN / no concluyente`.
- [x] Indisponibilidad aceptada como información externa del orquestador, no como inferencia positiva del DOM.
- [x] Tres jobs de `sol-debug` encontrados ya finalizados en error; ninguno activo ni reintentando.
- [ ] Reabrir exclusivamente las pruebas vivas cuando Qwen vuelva a estar disponible.

---

## 🏗️ Segundo checkpoint futuro — Sesión compartida

Objetivo:

> Lyria Chat y Cloud normal deben representar el mismo proveedor, iframe físico y conversación; el panel derecho de Split debe permanecer independiente.

Estado actual confirmado:

- Lyria usa pane `cloud`.
- Cloud normal usa pane `izq`.
- Split usa `izq` y `der`.
- Las selecciones de proveedor viven en estados separados.

Pendiente:

- [ ] Elegir diseño exacto para reutilizar el pane `cloud`.
- [ ] Definir propiedad del iframe al cambiar entre vistas.
- [ ] Evitar destrucción, navegación doble y contaminación de Split.
- [ ] Diseñar migración de estado sin romper sesiones existentes.
- [ ] Autorizar un nuevo checkpoint independiente.

---

## 🐛 Backlog separado

### Gemini

- [x] Identificar el síntoma inicial: después de una ejecución de tool, el resultado y la primera respuesta de Gemini aparecen clonados varias veces sin nuevas generaciones reales.
- [ ] Confirmar si la duplicación sólo existe en el DOM local o también queda persistida en el historial remoto.
- [ ] Recargar la conversación y comprobar si las copias desaparecen.
- [ ] Comparar la misma conversación desde otra pestaña o dispositivo.
- [ ] Registrar por repetición:
  - `conversationId`;
  - `assistantTurnId`;
  - `requestId`;
  - hash del mensaje;
  - estado de snapshot y renderizado.
- [ ] Revisar identidad estable de turnos, acumulación de snapshots, reinyección de observers y reconciliación del DOM.
- [ ] Mantenerlo fuera del alcance del checkpoint actual de Qwen.

### Normalización de salida de tools

Problema confirmado mediante `neofetch`:

- La terminal interpreta correctamente colores, movimiento de cursor y otros códigos ANSI.
- Aurora captura y entrega esas secuencias como texto literal al chat.
- Aparecen fragmentos como `ESC[?25l`, `ESC[37m`, movimientos de cursor y caracteres de control.
- El comando se ejecuta correctamente; el defecto está en la representación de su salida para consumidores que no son terminales.

Pendiente:

- [ ] Diseñar una salida estructurada con:
  - `stdout_raw`;
  - `stdout_text`;
  - `stderr_raw`;
  - `stderr_text`;
  - `exit_code`;
  - `truncated`.
- [ ] Conservar siempre la salida cruda para diagnóstico y evidencia.
- [ ] Entregar a los LLM una versión textual limpia y segura.
- [ ] Eliminar o interpretar secuencias ANSI CSI, OSC y SGR.
- [ ] Resolver retornos de carro, backspaces y movimientos de cursor.
- [ ] Normalizar saltos de línea y retirar controles no imprimibles.
- [ ] Conservar Unicode legítimo.
- [ ] Indicar expresamente cuando una salida fue truncada.
- [ ] Probar ejecución no interactiva con entorno de texto plano:
  - `TERM=dumb`;
  - `NO_COLOR=1`;
  - `CLICOLOR=0`.
- [ ] Usar flags nativos de salida sin color cuando cada comando los soporte.
- [ ] Para programas interactivos o basados en PTY, evaluar un emulador de terminal que reconstruya la pantalla final antes de convertirla a texto.
- [ ] Verificar que la limpieza no rompa JSON, tablas, Unicode, diffs ni logs legítimos.
- [ ] Añadir pruebas con:
  - `neofetch`;
  - barras de progreso;
  - retornos de carro;
  - backspaces;
  - colores ANSI;
  - enlaces OSC;
  - salidas largas y truncadas.

Riesgos que debe evitar esta mejora:

- consumo inútil de tokens;
- contaminación de prompts;
- hashes inestables;
- parsers de JSON o Markdown confundidos;
- líneas ocultas o sobrescritas por controles de terminal;
- contenido externo usando secuencias de control para engañar al visor o al agente.

### AI-Cloud Memory & Team Foundry — compromiso de implementación

> Esta superidea no queda como experimento opcional: debe diseñarse e implementarse por etapas hasta completar el sistema.

#### Fase 1 — Estructura y contratos de memoria

- [ ] Definir la ubicación definitiva de `ai-cloud/` dentro de Aurora.
- [ ] Crear estructura inicial:
  - [ ] `prompts/`;
  - [ ] `memories/`;
  - [ ] `sessions/`;
  - [ ] `missions/`;
  - [ ] `teams/`;
  - [ ] `evidence/`;
  - [ ] `artifacts/`.
- [ ] Definir esquemas para:
  - [ ] `PROMPT`;
  - [ ] `MEMORY`;
  - [ ] `SESSION`;
  - [ ] `EVIDENCE`.
- [ ] Definir metadatos mínimos:
  - `memoryId`;
  - `scope`;
  - `ownerRole`;
  - `providerOrigin`;
  - `project`;
  - `topic`;
  - `sourceSession`;
  - `sourceMessage`;
  - `sourceToolResult`;
  - `baseCommit`;
  - `confidence`;
  - `freshness`;
  - `privacyLevel`;
  - `supersedes`;
  - timestamps.
- [ ] Separar claramente hechos, inferencias, decisiones, preferencias y evidencia.
- [ ] Versionar memorias y permitir marcar entradas como corregidas, reemplazadas u obsoletas.
- [ ] Diseñar índices para localizar memorias por proyecto, rol, proveedor y misión.

#### Fase 2 — Prompt base de compañero

- [ ] Diseñar `ai-cloud/prompts/companion-core.md`.
- [ ] Definir en el prompt base:
  - colaboración con Diego;
  - honestidad sobre tools y evidencia;
  - diferencia entre hecho e inferencia;
  - checkpoints pequeños;
  - respeto de ramas, permisos y roles;
  - handoffs completos;
  - actualización de documentación y checklist;
  - aprendizaje a partir de errores;
  - tono de compañero de construcción.
- [ ] Crear prompts derivados:
  - [ ] `driver-core.md`;
  - [ ] `navigator-core.md`;
  - [ ] `researcher-core.md`;
  - [ ] `writer-core.md`;
  - [ ] `verifier-core.md`;
  - [ ] `designer-core.md`.
- [ ] Diseñar herencia por referencias y hashes para evitar duplicación.
- [ ] Permitir fijar una versión concreta del prompt base por misión.
- [ ] Probar que cambiar `companion-core.md` no obliga a reescribir memorias especializadas.

#### Fase 3 — Memorias iniciales reales

- [ ] Crear `chatgpt-orchestrator-memories.md`.
- [ ] Compactar en ella:
  - arquitectura actual de Aurora;
  - decisiones canónicas;
  - reglas aprendidas;
  - proyectos y ramas activas;
  - estilo de colaboración con Diego;
  - tareas terminadas y pendientes;
  - conceptos todavía hipotéticos.
- [ ] Crear `chatgpt-left4dead-modding-partner.md`.
- [ ] Definir qué información pertenece a Left 4 Dead y qué debe mantenerse fuera.
- [ ] Crear memorias iniciales para:
  - [ ] Claude como Driver de Aurora;
  - [ ] ChatGPT como Navigator;
  - [ ] Qwen como Navigator anterior;
  - [ ] Gemini como investigador o especialista documental.
- [ ] Evitar repetir `companion-core.md` dentro de cada memoria.
- [ ] Añadir fuente y evidencia para cada hecho importante compactado.

#### Fase 4 — Handoff Composer automático

- [ ] Recuperar el mensaje terminal literal del agente anterior.
- [ ] Concatenar automáticamente:

```text
AGENT_ROLE:
[reporte íntegro]

---

ORCHESTRATOR:
[nueva instrucción]
```

- [ ] Conservar formato, hashes, commits, advertencias y resultados.
- [ ] Correlacionar el sobre con `missionId`, `jobId`, rol, agente y timestamp.
- [ ] Validar que el reporte no esté truncado.
- [ ] Confirmar que el siguiente agente recibió el paquete completo.
- [ ] Guardar cada handoff como artefacto inmutable.
- [ ] Si no cabe en contexto, crear índice y referencias recuperables sin ocultar la omisión.
- [ ] Prohibir que un resumen reemplace silenciosamente el reporte original.

#### Fase 5 — Compactador de sesiones

- [ ] Diseñar el proceso de compactación manual y automático.
- [ ] Incluir en cada compactación:
  - prompt original;
  - mensajes del agente;
  - respuestas parciales;
  - llamadas de tools;
  - resultados reales de tools;
  - tools emitidas pero no ejecutadas;
  - commits, diffs y archivos;
  - decisiones del orquestador;
  - preguntas abiertas;
  - siguiente acción exacta.
- [ ] Diferenciar estrictamente:
  - tool propuesta;
  - tool aceptada;
  - tool ejecutada;
  - resultado recibido;
  - conclusión verificada.
- [ ] Preservar el último resultado confirmado cuando una sesión muere a mitad de turno.
- [ ] Permitir compactación incremental sin rehacer toda la sesión.
- [ ] Detectar contradicciones entre compactaciones nuevas y memoria anterior.
- [ ] Requerir revisión humana para cambios canónicos sensibles.

#### Fase 6 — Integración con Provider Health Sensor

- [ ] Disparar compactación ante:
  - `QUOTA_EXHAUSTED`;
  - `RATE_LIMITED`;
  - `AUTH_REQUIRED`;
  - `TEMP_UNAVAILABLE`;
  - interrupción prolongada o cierre del proveedor.
- [ ] Congelar el job antes de sustituir al agente.
- [ ] Guardar la respuesta parcial hasta el punto exacto del corte.
- [ ] Marcar la última tool como ejecutada o pendiente con evidencia.
- [ ] Generar automáticamente el paquete para el sustituto.
- [ ] Evitar que otro agente confunda indisponibilidad externa con un bug de Aurora.
- [ ] Reincorporar al proveedor original cuando recupere disponibilidad sin duplicar trabajos.

#### Fase 7 — Acceso de Lyria a AI-Cloud Memories

- [ ] Exponer acciones semánticas para:
  - buscar memorias;
  - leer fragmentos;
  - crear compactaciones;
  - corregir o reemplazar entradas;
  - construir paquetes de contexto;
  - registrar handoffs.
- [ ] Permitir que Lyria seleccione el contexto mínimo según misión y rol.
- [ ] Evitar entregar todas las memorias a todos los proveedores.
- [ ] Mostrar a Lyria origen, confianza, frescura y privacidad de cada entrada.
- [ ] Hacer que Lyria declare qué memoria entregó a cada agente.
- [ ] Permitir acceso bajo demanda a evidencia completa.
- [ ] Impedir que Lyria presente memoria generada como verdad sin verificación.

#### Fase 8 — Privacidad y permisos

- [ ] Definir niveles:
  - `PRIVATE`;
  - `TEAM`;
  - `MISSION`;
  - `SHAREABLE`.
- [ ] Redactar secretos, credenciales y datos sensibles antes de enviar contexto a la nube.
- [ ] Registrar cada entrega de memoria a un proveedor.
- [ ] Permitir revocar una memoria o el acceso de un agente.
- [ ] Añadir listas permitidas por proyecto y rol.
- [ ] Mantener AI-Cloud Memories local por defecto.
- [ ] Diseñar exportación opcional y explícita, nunca automática.
- [ ] Añadir auditoría de quién leyó qué y para qué misión.

#### Fase 9 — Team Builder de Lyria

- [ ] Crear catálogo de agentes y capacidades.
- [ ] Registrar por proveedor:
  - disponibilidad;
  - contexto máximo;
  - tools disponibles;
  - costo;
  - privacidad;
  - fortalezas;
  - desempeño histórico;
  - memorias compatibles.
- [ ] Permitir que Lyria forme equipos por misión.
- [ ] Mantener separados roles persistentes y proveedores reemplazables.
- [ ] Crear plantillas de equipo para:
  - código;
  - investigación;
  - documentación;
  - diseño;
  - pruebas;
  - mods y videojuegos.
- [ ] Implementar sustitución de miembros sin reiniciar la misión.
- [ ] Transferir memoria del rol y handoff al reemplazo.
- [ ] Evitar dos escritores simultáneos sobre el mismo estado mutable.

#### Fase 10 — Artifact Foundry

- [ ] Diseñar pipeline general de artefactos:
  - brief;
  - investigación;
  - construcción;
  - verificación;
  - diseño;
  - aceptación humana;
  - versionado final.
- [ ] Soportar equipos para producir:
  - [ ] Markdown;
  - [ ] DOCX;
  - [ ] PDF;
  - [ ] presentaciones;
  - [ ] hojas de cálculo;
  - [ ] diagramas e imágenes;
  - [ ] código y pruebas;
  - [ ] documentación;
  - [ ] nuevas features de Aurora.
- [ ] Guardar fuentes, prompts, versiones, evidencia y revisiones junto al artefacto.
- [ ] Exigir citas verificables en investigaciones.
- [ ] Exigir revisión de código por commit exacto.
- [ ] Exigir pruebas propias de Lyria además de Driver y Navigator.
- [ ] Permitir rollback y reconstrucción reproducible del artefacto.

#### Fase 11 — Primeras pruebas integrales

- [ ] Restaurar una conversación nueva de ChatGPT Orchestrator usando su memoria local.
- [ ] Confirmar que conserva decisiones sin recibir una transcripción completa.
- [ ] Abrir un compañero nuevo de Left 4 Dead usando:
  - `companion-core.md`;
  - memoria especializada de Left 4 Dead;
  - misión concreta.
- [ ] Simular un agente que muere a mitad de una tool.
- [ ] Compactar sesión y reemplazarlo sin perder resultados.
- [ ] Formar un equipo real de al menos tres roles.
- [ ] Producir con ese equipo un documento o feature pequeña.
- [ ] Revisar el resultado con otro agente y con Lyria.
- [ ] Confirmar que las memorias aprendidas se guardan sin duplicar el prompt base.
- [ ] Confirmar que información privada no se filtra a agentes no autorizados.

#### Fase 12 — Documentación y mantenimiento

- [ ] Documentar arquitectura, formatos y eventos.
- [ ] Crear ejemplos de memorias correctas e incorrectas.
- [ ] Crear guía para añadir nuevos compañeros y dominios.
- [ ] Añadir migraciones de formato de memoria.
- [ ] Añadir pruebas de regresión para compactaciones y handoffs.
- [ ] Añadir herramientas de inspección, búsqueda y comparación de memorias.
- [ ] Añadir limpieza de memorias obsoletas sin borrar evidencia histórica.
- [ ] Mantener esta sección sincronizada con `ideas-rescatadas.md`.

**Resultado obligatorio:** Aurora debe poder conservar lo aprendido por chats web, reconstruir un compañero en otra sesión, sustituir agentes agotados, formar equipos y producir artefactos completos con memoria, evidencia y control local.

### SOL / Codex — Aurora Productivity Inquisition

Misión general:

`Aurora Productivity Inquisition`

Principio rector:

> Toda tarea que sirve al humano debe ahorrar tiempo, reducir carga mental, conservar continuidad o ampliar su capacidad; entonces puede convertirse en una capacidad útil para Lyria y otras IA.

Marco definitivo aclarado por Diego:

> Aurora es un side panel que acompaña la navegación. Cada tab representa una herramienta con un propósito humano concreto. La inquisición debe evaluar y elevar ese propósito, no condenar la idea por bugs, inmadurez, baja adopción o código provisional.

### Aislamiento

- [x] Branch:
  - `task/sol-productivity-inquisition`.
- [x] Worktree:
  - `/media/almacen/deml/Downloads/core_instruction/aurora-sol-productivity-inquisition`.
- [x] Repo principal preservado.
- [x] Lyra y Cloud excluidas.
- [x] Ningún cambio de producción autorizado.
- [x] Ningún commit creado.

### Primera pasada — diagnóstico actual

Informe:

- `ai-cloud/audits/aurora-productivity-inquisition-sol.md`

Estado:

- [x] 18 tabs descubiertas.
- [x] 16 tabs auditadas.
- [x] Footer, paleta y superficies internas inspeccionados.
- [x] Diagnóstico de implementación actual útil.
- [!] Interpretación parcial equivocada: consolidó Aurora como macro-suite y usó inmadurez presente para recomendar demociones, fusiones y eliminaciones.
- [!] Veredicto canónico no aceptado.

Clasificación:

- `AUDIT_COMPLETED`
- `CURRENT_IMPLEMENTATION_DIAGNOSIS_USEFUL`
- `MISSION_PARTIALLY_MISINTERPRETED`
- `CANONICAL_PRODUCT_VERDICT_NOT_ACCEPTED`

### Segunda pasada — reinvención extrema

Informe:

- `ai-cloud/audits/aurora-productivity-extreme-second-pass-sol.md`

Resultado reportado:

- [x] Primer informe preservado.
- [x] Discrepancia Git reconocida:
  - worktree creado desde `f421c9a`;
  - base canónica conceptual `17e1e71`;
  - diferencia intermedia limitada a Lyra excluida.
- [x] 16 tabs reexaminadas.
- [x] 18 `PRODUCTIVITY RESURRECTION TEST` realizados, incluyendo footer y paleta.
- [x] Separación entre fallo actual y potencial conceptual.
- [x] 18 versiones máximas, escenarios de uso y multiplicadores humanos redactados.
- [x] Stats, Tokens, Editor, Captura y Styles recibieron reinterpretaciones más ambiciosas.
- [x] Ningún concepto fue eliminado en esta pasada.
- [x] Entrevista de productividad de Diego propuesta con 12 preguntas.
- [x] No se modificó código ni se creó commit.

Nueva corrección hecha por Diego y reconocida por SOL:

- [!] La segunda pasada todavía quedó contaminada por el marco de “sistema operativo de trabajo” y reorganización arquitectónica.
- [!] Aurora debe analizarse primero como cinturón lateral de herramientas que acompaña la navegación.
- [!] Cada tab tiene un propósito de herramienta y un momento cognitivo propio.
- [!] Dos herramientas relacionadas pueden justificar tabs separadas si sirven momentos distintos.
- [!] Bugs, tablas vacías, persistencia incompleta y errores actuales son secundarios para esta inquisición conceptual.
- [!] Las formulaciones de propósito entregadas por SOL siguen siendo demasiado simples y genéricas.
- [!] El segundo informe tampoco queda aceptado como veredicto canónico.

Clasificación actual:

- `SECOND_PASS_COMPLETED`
- `IMAGINATION_IMPROVED`
- `FRAME_STILL_WRONG`
- `PURPOSE_DEFINITIONS_TOO_SIMPLE`
- `CANONICAL_PRODUCT_VERDICT_NOT_ACCEPTED`
- `REQUIRES_THIRD_PASS`

### Tercera pasada requerida — Purpose First / Side Panel Native / Tool by Tool

Objetivo:

> Reformular cada herramienta desde su propósito humano esencial y elevarla a una solución lateral extraordinaria, nativa del navegador, consciente de la página activa y utilizable tanto por Diego como por Lyria y otras IA.

Reglas:

- [ ] Preservar intactos los dos informes anteriores.
- [ ] Crear únicamente un tercer informe conceptual.
- [ ] No modificar código.
- [ ] No crear commit todavía.
- [ ] No reorganizar Aurora primero como macro-suite.
- [ ] No usar bugs, tablas vacías, baja adopción o código provisional como sentencia sobre la idea.
- [ ] No limitarse a repetir propósitos simples como “capturar”, “editar”, “mostrar estadísticas” o “gestionar prompts”.
- [ ] Descubrir el propósito profundo, el momento cognitivo y el valor diferencial de cada herramienta dentro de un side panel.
- [ ] Diseñar para cada tab una versión definitiva, concreta y sorprendente, no una lista genérica de features.
- [ ] Explicar qué toma de la página, selección, pestaña, sesión o proyecto actual.
- [ ] Explicar qué resultado inmediato devuelve sin sacar a Diego de la navegación.
- [ ] Explicar qué conserva para continuidad posterior.
- [ ] Diseñar capacidades semánticas para IA sin clicks ni coordenadas.
- [ ] Justificar después si merece tab propia, footer, contexto o paleta según su momento de uso; no por consolidación estética.
- [ ] Auditar footer y paleta como herramientas transversales del side panel.

Marco de evaluación requerido:

- propósito humano esencial;
- momento exacto de invocación;
- contexto tomado del navegador;
- trabajo eliminado o acelerado;
- tiempo hasta obtener valor;
- resultado inmediato;
- continuidad y memoria;
- composición con otras herramientas;
- ventaja frente a abrir otra aplicación;
- capacidad semántica para Lyria/IA;
- razón para ocupar acceso propio;
- experiencia “wow” concreta;
- criterios verificables de una versión definitiva.

Estado:

- [x] Necesidad de tercera pasada confirmada por Diego y reconocida por SOL.
- [x] Primer prompt correctivo de tercera pasada preparado.
- [x] SOL auditó el propio prompt antes de ejecutarlo y detectó que seguía intentando garantizar profundidad mediante volumen, fases y formularios.
- [!] El prompt preparado queda **superseded antes de ejecución**; no existe todavía tercer informe.
- [x] SOL propuso una estructura inquisitorial más fuerte:
  - `INTENT ARCHAEOLOGY`;
  - `HUMAN FRICTION`;
  - `COGNITIVE TRIGGER`;
  - `BEFORE/AFTER HUMAN STATE`;
  - `BROWSER ADJACENCY ADVANTAGE`;
  - `DOMINANT TRANSFORMATION`;
  - `THREE CONCEPTUAL LEAPS`;
  - `DEFINITIVE TOOL`;
  - `PHYSICAL SIDE-PANEL EXPERIENCE`;
  - `NAVIGATION-NATIVE WORKFLOW`;
  - `PERSISTENT ARTIFACT AND RETURN EVENT`;
  - `SEMANTIC CAPABILITY CONTRACT`;
  - `NEAREST-NEIGHBOR ARBITRATION`;
  - `COMPOSITION THROUGH SHARED ARTIFACTS`;
  - `PRIVACY AND AUTHORITY BOUNDARY`;
  - `ACCESS JUSTIFICATION`;
  - `WOW MOMENT`;
  - `CONCEPT KILL TEST`;
  - `DIEGO VALIDATION QUESTION`.
- [x] Nuevos requisitos conceptuales identificados:
  - reconstruir la intención original desde documentación e ideas históricas;
  - distinguir propósito original de implementación accidental;
  - demostrar qué capacidad humana se pierde si una tab desaparece;
  - justificar la ventaja decisiva de vivir junto a la página activa;
  - diseñar para las restricciones físicas del side panel;
  - definir verbo, objeto, cambio de estado y terminado dominantes;
  - usar una ontología pequeña de artifacts compartidos;
  - arbitrar fronteras entre herramientas vecinas;
  - declarar soberanía, privacidad y autoridad sobre contexto sensible;
  - definir el evento futuro que hace reaparecer cada artifact;
  - incluir pruebas falsables capaces de matar conceptos seductores.
- [x] Dos cuchillos finales adoptados:
  - si la página actual no existiera, ¿la herramienta conservaría el mismo valor?;
  - si la herramienta desapareciera, ¿qué capacidad humana irreemplazable perdería Diego?
- [x] SOL forjó su propio protocolo inquisitorial definitivo.
- [x] Protocolo creado:
  - `ai-cloud/audits/aurora-purpose-inquisition-protocol-sol.md`.
- [x] Estado del protocolo:
  - `PROTOCOL_ONLY — EXECUTION_NOT_AUTHORIZED`;
  - 662 líneas;
  - `git diff --check` limpio;
  - sin código modificado;
  - sin commit;
  - tercera auditoría todavía no ejecutada.
- [x] El protocolo reemplaza repetición uniforme por ocho rondas eliminatorias:
  - desenterrar intención;
  - extraer núcleo;
  - exilio del navegador;
  - tormenta física del side panel;
  - juicio del artifact y retorno;
  - duelo de identidades;
  - juicio semántico y de autoridad;
  - ejecución conceptual mediante kill tests.
- [x] Unidad de investigación redefinida como episodio humano, no tab ni feature.
- [x] Sistema de evidencia definido:
  - `D` declaración de Diego;
  - `H` evidencia histórica;
  - `R` relación observable;
  - `I` inferencia de SOL;
  - `U` desconocido.
- [x] Ontología provisional reducida a nueve artifacts:
  - `SourceSnapshot`;
  - `ThoughtSeed`;
  - `EvidenceRecord`;
  - `KnowledgeClaim`;
  - `CapabilityAsset`;
  - `WorkArtifact`;
  - `DecisionRecord`;
  - `ActionCommitment`;
  - `AutomationRun`.
- [x] Reglas de ownership y transición de artifacts definidas.
- [x] Cinco pruebas concretas de adyacencia al navegador definidas.
- [x] Restricciones físicas del side panel y presupuesto de atención definidos.
- [x] Ocho duelos obligatorios entre herramientas vecinas definidos.
- [x] Fronteras de percepción, persistencia, compartición y efecto definidas.
- [x] Escala de autoridad `A0`–`A5` propuesta.
- [x] Trece `Concept Kill Tests` definidos como puertas no compensatorias.
- [x] Continuidad exige artifact, propietario, evento de retorno y siguiente acción.
- [x] Una identidad puede morir sin borrar la necesidad humana descubierta.
- [x] Estrategia explícita contra informes largos pero vacíos incluida.
- [x] Forma narrativa del tercer informe definida sin longitud artificialmente uniforme.
- [x] Preguntas mínimas para Diego reducidas a ocho preguntas capaces de cambiar sentencias.
- [x] El protocolo fue leído y revisado por el Orchestrator.
- [x] Veredicto del protocolo: suficientemente inquisitorial y apto para ejecución controlada.
- [ ] Autorizar explícitamente la ejecución de la tercera auditoría conceptual.
- [ ] Crear únicamente el tercer informe canónico, preservando los tres documentos anteriores.
- [ ] No modificar código ni crear commit durante la ejecución.
- [ ] Revisar el tercer informe antes de aceptar identidades, arquitectura o roadmap.

`Aurora Agent Runtime Foundation` permanece como supertarea futura posterior.

### Lyria Orchestrator

- [x] Idea detallada en `docs/restaurado/ideas-rescatadas.md`.
- [ ] Diseñar `Agent Job Manager`.
- [ ] Persistir misión, roles, jobs, eventos y handoffs.
- [ ] Detectar `COMPLETED`, `BLOCKED`, `FAILED`, `TIMEOUT` y `PAUSED_LIMIT`.
- [ ] Reanudar la misma sesión lógica de Lyria mediante trigger.
- [ ] Implementar sustitución automática de agentes.
- [ ] Implementar leases de escritura.
- [ ] Validar precondiciones antes de despachar jobs.

### Provider Health Sensor — disponibilidad y límites

#### Discovery de Claude — tercera revisión Navigator: `CHANGES_REQUIRED`

Aislamiento Git:

- [x] Branch creada:
  - `task/provider-health-sensor`.
- [x] Worktree aislado:
  - `/media/almacen/deml/Downloads/core_instruction/aurora-provider-health-sensor`.
- [x] Base exacta:
  - `17e1e710c1e33058142eaf7ba519bbde51643c00`.
- [x] Commit documental resultado:
  - `e197a5994de4406c27fcbbf13ea8bb7abe5194ac`.
- [x] Rango para Navigator:
  - `17e1e710c1e33058142eaf7ba519bbde51643c00..e197a5994de4406c27fcbbf13ea8bb7abe5194ac`.
- [x] Repo principal preservado sin cambios nuevos.
- [x] Único archivo creado y commiteado:
  - `docs/audits/provider-health-sensor-discovery-claude.md`.
- [x] Ningún archivo de producción modificado.

Hallazgos verificados:

- [x] Existen tres ciclos independientes relacionados con jobs:
  - turno persistido de Lyria Cloud;
  - petición `ASK/ANSWER` de `askCloud`;
  - courier de `provider-relay.js`.
- [x] `lyra_cloud_busy` y `lyra_ui_timeout` pertenecen exclusivamente al harness `sol-debug.py`, no al código de producción.
- [x] `cloudGenerando` es el lock en memoria de Lyria Cloud.
- [x] `cloudGenerando` se libera únicamente en el `finally` de `enviarACloud` y no posee TTL propio.
- [x] `askCloud()` sí posee watchdog de 10 minutos y llama `detenerCloud()` al vencer.
- [x] Existe un watcher de stall en producción:
  - `STALL_MS = 15000`;
  - principio existente: avisar, nunca autoclick.
- [x] En Qwen, `isGenerating()` devuelve siempre `false` porque no tiene selector Stop configurado.
- [x] `AuroraEndpointRegistry` ya modela `discarded`, `frozen` y `offline` con heartbeat TTL de 20 segundos.
- [x] Stop sólo es señal fuerte aislada en providers con `authoritativeStop=true`.
- [x] Silencio, estabilidad textual aislada y `document.hidden` no prueban disponibilidad ni causa.
- [x] El mecanismo de carrera del reinjector Qwen→generic quedó mapeado como inferencia técnica, no reproducido en vivo.

Modelo propuesto:

- [x] Dos ejes independientes recomendados:
  - disponibilidad:
    - `READY`;
    - `RATE_LIMITED`;
    - `QUOTA_EXHAUSTED`;
    - `AUTH_REQUIRED`;
    - `CHALLENGE_REQUIRED`;
    - `TEMP_UNAVAILABLE`;
    - `RESTRICTED`;
    - `UNKNOWN`;
  - actividad:
    - `IDLE`;
    - `PROGRESSING`;
    - `STALLED`;
    - `COMPLETED`;
    - `FAILED`;
    - `CANCELLED`;
    - `UNKNOWN`.
- [x] `STALLED` propuesto como estado de actividad por job, no como disponibilidad del proveedor.
- [x] Separación explícita diseñada entre:
  - disponibilidad del proveedor;
  - actividad del job;
  - estado visual de Aurora;
  - estado del relay;
  - estado del harness.
- [x] Contrato propuesto:
  - `provider.availability.changed`.
- [x] Modelo de confianza propuesto:
  - `HIGH`;
  - `MEDIUM`;
  - `LOW`;
  - `UNKNOWN`.
- [x] Tabla de 20 escenarios incluida.
- [x] Debounce, histéresis, TTL de evidencia, contradicciones y prohibición de retries ciegos diseñados.
- [x] Reglas de pausa, locks, recuperación y sustitución propuestas.
- [x] Estrategia de fixtures y seis capas de pruebas diseñada sin depender de cuota viva.

Primer checkpoint recomendado por Claude:

- `Checkpoint 1 — tipos y contrato puro`.
- Archivos propuestos, todos nuevos:
  - `extensions/aihub/content-scripts/relay/provider-health/types.js`;
  - `extensions/aihub/content-scripts/relay/provider-health/validate.js`;
  - tests de contrato en ubicación aún por decidir.
- Cero imports o modificaciones de archivos existentes.
- Sin DOM, adapters, eventos reales ni integración con jobs.

Estado de revisión:

- [x] Navigator revisó el commit documental exacto:
  - `e197a5994de4406c27fcbbf13ea8bb7abe5194ac`.
- [x] Rango revisado:
  - `17e1e710c1e33058142eaf7ba519bbde51643c00..e197a5994de4406c27fcbbf13ea8bb7abe5194ac`.
- [x] Padre directo y ausencia de commits intermedios confirmados.
- [x] Commit limitado exclusivamente a:
  - `docs/audits/provider-health-sensor-discovery-claude.md`.
- [x] Diff confirmado:
  - `489 insertions`;
  - ningún archivo de producción;
  - `git diff --check` limpio;
  - worktree del Driver limpio.
- [x] Aislamiento Git aprobado.
- [x] Ninguna regresión de producción introducida por el commit documental.
- [!] Veredicto técnico del documento:
  - `CHANGES_REQUIRED`.
- [!] `safe_to_accept_discovery: no`.
- [!] `safe_to_authorize_checkpoint_1: no`.

Correcciones factuales obligatorias:

- [!] `cloudGenerando` no tiene un único escritor.
  - escritores verificados: `cloud.js` y `duo.js`;
  - es una busy signal global compartida, no un mutex, lease ni lock formal.
- [!] No existe un único punto global de liberación; cada ruta posee su propio `finally`.
- [x] `askCloud()` tiene watchdog real de diez minutos.
- [x] Al vencer, llama `detenerCloud()`, registra `parent_timeout` y resuelve con error.
- [!] El riesgo de retención no acotada no está en `askCloud()` normal, sino en:
  - operaciones previas a la entrada al `try/finally`;
  - `fetch()` sin `AbortSignal` ni timeout;
  - otros `await` cuyo límite no quedó demostrado.
- [!] `lyra_cloud_busy` sólo demuestra que la signal estaba activa; no identifica al dueño ni demuestra progreso del proveedor.
- [!] Un Stop autoritativo demuestra que el sitio expuso control de generación, no progreso textual ni terminación correcta.
- [!] Service worker restart y reload de Aurora son eventos distintos.
- [!] La causalidad entre overlay visual y `lyra_cloud_busy` no fue demostrada.

Modelo y contratos:

- [x] Separación Availability/Activity aprobada en principio.
- [x] `STALLED` aprobado como estado de Activity.
- [!] Debe existir una tercera dimensión independiente para Channel/Endpoint.
- [!] `READY` sólo puede afirmarse con evidencia positiva y vigente.
- [!] Activity necesita un estado previo al primer output, por ejemplo:
  - `QUEUED`;
  - `SUBMITTED`;
  - `WAITING_FIRST_OUTPUT`.
- [!] `COMPLETED`, `FAILED` y `CANCELLED` son terminales del lifecycle; no deberían permanecer como actividad viva indefinidamente.
- [!] El evento único `provider.availability.changed` mezcla autoridades y lifecycles.
- [ ] Separar contractualmente:
  - `provider.availability.changed`;
  - `provider.activity.changed` o `cloud.job.activity.changed`;
  - snapshot agregado opcional `provider.health.snapshot`.
- [ ] Distinguir exactamente:
  - proveedor lógico;
  - adapter efectivo;
  - `jobId`;
  - `turnId`;
  - `requestId`;
  - endpoint/canal.
- [ ] Añadir `sequence` monotónico donde corresponda.

Tabla de escenarios:

- [!] Requieren corrección las filas 2, 3, 4, 7, 8, 9, 11, 13, 15, 16, 17, 18 y 20.
- [!] Respuesta parcial no equivale a `COMPLETED`.
- [!] `AURORA_CLOUD_ASK` enviado no equivale a tool enviada.
- [!] Deben distinguirse:
  - prompt enviado;
  - request aceptado;
  - primer output;
  - respuesta cerrada;
  - tool parseada;
  - tool autorizada;
  - tool ejecutada;
  - resultado persistido;
  - feedback entregado.
- [!] Recuperar disponibilidad debe despertar una comprobación, no reenviar automáticamente.

Confianza, privacidad y evidencia:

- [!] `HIGH/MEDIUM/LOW/UNKNOWN` puede conservarse, pero no por conteo bruto de señales.
- [ ] Añadir independencia y correlación mediante campos como:
  - `sourceClass`;
  - `authority`;
  - `correlationGroup`;
  - `patternId`.
- [!] Banner y composer disabled pueden provenir del mismo cambio DOM.
- [!] `normalizedText` puede contener PII.
- [!] Un hash de texto sensible sigue siendo correlacionable.
- [!] Falta `evidenceId` para referencias de contradicción.
- [ ] Favorecer evidencia estructurada mínima:
  - `patternId`;
  - reason code;
  - booleanos estructurales;
  - host;
  - adapter;
  - timestamps;
  - valores numéricos mínimos.
- [ ] Omitir texto por defecto, definir redacción explícita, TTL y política de borrado.

Jobs, locks y recuperación:

- [!] No conservar locks en memoria indefinidamente durante `UNKNOWN` o `PAUSED_LIMIT`.
- [ ] Separar:
  - busy flag de UI;
  - request en vuelo;
  - ownership del turno;
  - reservation provider/pane;
  - writer lease del rol;
  - registro persistido del job.
- [ ] Para cuota, rate limit, auth o challenge:
  - persistir job pausado;
  - liberar locks en memoria;
  - liberar writer lease;
  - conservar claim durable e idempotente.
- [ ] Usar `logicalJobId + attemptId` para evitar duplicación.
- [!] No reutilizar el mismo request ID al sustituir proveedor.
- [!] Antes de retry o sustitución reconciliar si el intento anterior fue aceptado, sigue vivo, produjo parcial, ejecutó tools o recibió ACK.

Fixtures y futuro Checkpoint 1:

- [x] Estrategia de pruebas por capas aprobada con correcciones.
- [x] Convención JS existente verificada:
  - tests `.mjs` bajo `tests/ui/`;
  - ejecución manual con Bun.
- [!] Fue incorrecta la afirmación de que no existía convención JS de tests.
- [x] El riesgo Qwen→generic fue clasificado:
  - `PLAUSIBLE_AND_INCOMPLETE`;
  - no reproducido;
  - puede activarse en más triggers que discard/frozen.
- [!] Checkpoint 1 actual: `NOT_READY`.
- [ ] El eventual Checkpoint 1 debe contener tres archivos nuevos:
  - `extensions/aihub/content-scripts/relay/provider-health/types.js`;
  - `extensions/aihub/content-scripts/relay/provider-health/validate.js`;
  - `tests/provider-health/test_contract.mjs`.
- [ ] Usar scripts clásicos compatibles con MAIN/background y carga lateral en Node/Bun; no exports ESM en archivos destinados a content scripts clásicos.
- [ ] Tests mínimos futuros:
  - `node --check` de ambos archivos;
  - `bun tests/provider-health/test_contract.mjs`.
- [ ] No implementar hasta corregir y volver a revisar el contrato documental.

Siguiente acción del Driver:

- [ ] Claude crea exclusivamente un commit documental correctivo sobre el mismo informe.
- [ ] No crear todavía archivos de código.
- [ ] Corregir hechos, escenarios, contratos, privacidad, locks, tests y `CHECKLIST_DELTA`.
- [ ] Navigator revisa después únicamente el delta documental.
- [ ] Sólo tras aprobar ese delta podrá autorizarse el Checkpoint 1.

#### Corrección documental de Claude — commit `0dede03`

Evidencia Git verificada:

- [x] Branch:
  - `task/provider-health-sensor`.
- [x] Commit anterior:
  - `e197a5994de4406c27fcbbf13ea8bb7abe5194ac`.
- [x] Commit correctivo:
  - `0dede036ec4d8edd4a1da427881df8cf8350d35e`.
- [x] Padre directo del resultado:
  - `e197a5994de4406c27fcbbf13ea8bb7abe5194ac`.
- [x] Rango para revisión delta:
  - `e197a5994de4406c27fcbbf13ea8bb7abe5194ac..0dede036ec4d8edd4a1da427881df8cf8350d35e`.
- [x] Único archivo modificado:
  - `docs/audits/provider-health-sensor-discovery-claude.md`.
- [x] Ningún archivo de producción modificado.
- [x] `git diff --check` limpio.
- [x] Worktree del Driver limpio después del commit.

Correcciones declaradas por el Driver:

- [x] Retiradas las afirmaciones de escritor único, lock único y único punto de liberación de `cloudGenerando`.
- [x] `cloudGenerando` reformulado como UI busy signal compartida por `cloud.js` y `duo.js`.
- [x] Riesgo de timeout corregido:
  - `askCloud()` conserva watchdog de 600000 ms;
  - riesgo real localizado en operaciones previas al `try/finally` y `fetch()` sin timeout/AbortSignal;
  - awaits adicionales permanecen como `NO_VERIFICADO` cuando corresponde.
- [x] Modelo de tres dimensiones incorporado:
  - Availability;
  - Activity;
  - Channel.
- [x] Activity amplía estados previos al primer output e incorpora `INTERRUPTED`.
- [x] Contratos separados propuestos:
  - `provider.availability.changed`;
  - `provider.activity.changed`;
  - `provider.channel.changed`;
  - `provider.health.snapshot` como vista derivada.
- [x] `logicalProviderId` y `effectiveAdapterId` diferenciados.
- [x] Trece filas de escenarios corregidas:
  - 2, 3, 4, 7, 8, 9, 11, 13, 15, 16, 17, 18 y 20.
- [x] EvidenceEntry rediseñado sin texto ni hash sensible por defecto, con `evidenceId`, TTL y señales estructuradas.
- [x] Modelo de job/tentativas separado mediante:
  - `logicalJobId`;
  - `attemptId` nuevo por intento.
- [x] Busy signal, request, ownership, reservation, writer lease, persisted job y durable claim separados conceptualmente.
- [x] Reconciliación obligatoria antes de retry o sustitución documentada.
- [x] Prohibición de reutilizar `requestId` entre intentos/proveedores documentada.
- [x] Riesgo del reinjector ampliado a múltiples triggers y clasificado `PLAUSIBLE_Y_NO_REPRODUCIDO`.
- [x] Convención real de tests corregida:
  - tests `.mjs` existentes;
  - ejecución con Bun.
- [x] Futuro Checkpoint 1 ampliado a tres archivos nuevos:
  - `extensions/aihub/content-scripts/relay/provider-health/types.js`;
  - `extensions/aihub/content-scripts/relay/provider-health/validate.js`;
  - `tests/provider-health/test_contract.mjs`.
- [x] `CHECKLIST_DELTA` del informe reemplazado por versión corregida.
- [x] `implementation_authorization_requested: no`.

Estado:

- [ ] Navigator revisa exclusivamente el delta documental `e197a599..0dede03`.
- [ ] Confirmar que todas las correcciones exigidas quedaron resueltas sin nuevas sobreafirmaciones.
- [ ] Emitir veredicto sobre aceptación del discovery corregido.
- [ ] No autorizar todavía el Checkpoint 1 hasta recibir ese veredicto.

#### Segunda revisión Navigator — delta `e197a599..0dede03`

Resultado:

- [!] Veredicto: `CHANGES_REQUIRED`.
- [x] Scope Git aprobado.
- [x] Único archivo del delta:
  - `docs/audits/provider-health-sensor-discovery-claude.md`.
- [x] `339 insertions`, `350 deletions`.
- [x] `git diff --check` limpio.
- [x] Worktree limpio.
- [x] Ningún archivo de producción modificado.
- [!] `safe_to_accept_corrected_discovery: no`.
- [!] `safe_to_authorize_checkpoint_1: no`.

Correcciones ya aprobadas:

- [x] `cloudGenerando` descrito correctamente como UI busy signal compartida.
- [x] Riesgo de timeout reubicado fuera del `askCloud()` normal.
- [x] Availability endurece `READY` con evidencia positiva y vigente.
- [x] Confidence model sin conteo ingenuo de señales.
- [x] Privacidad por defecto de EvidenceEntry ampliamente corregida.
- [x] `logicalJobId + attemptId` aprobado.
- [x] Separación de busy/request/ownership/reservation/lease/job/claim aprobada.
- [x] Riesgo reinjector aprobado como `PLAUSIBLE_Y_NO_REPRODUCIDO`.
- [x] Convención de tests `.mjs` + Bun aprobada.
- [x] Forma futura de Checkpoint 1 aprobada en estructura, no en contrato.

Cambios materiales aún pendientes:

- [ ] Resolver `PAUSED/BLOCKED`:
  - agregarlos al enum;
  - o moverlos a un `JobState` persistido separado.
- [ ] Separar definitivamente tres lifecycles:
  - request activity;
  - job lifecycle;
  - tool lifecycle.
- [ ] Reservar `CANCELLED` para cancelación explícita.
- [ ] Reservar `INTERRUPTED` para cortes externos recuperables.
- [ ] No marcar el job lógico `COMPLETED` sólo por `AURORA_CLOUD_ANSWER ok:true` cuando todavía existen tools o feedback pendientes.
- [ ] Corregir autoridad real de ejecución de tools:
  - `processCloudToolProtocol(...)` recibe resultados de JSON Family;
  - `ejecutarPreparada()` recupera, persiste y presenta resultados;
  - no es el ejecutor real de la tool.
- [ ] Cambiar/acotar `provider.activity.changed`:
  - `cloud.job.activity.changed` para job lógico completo;
  - o `provider.request.activity.changed` para request al proveedor.
- [ ] Retirar Endpoint Registry como autoridad de Availability.
- [ ] Decidir si `provider.channel.changed` existe realmente antes de congelar tipos.
- [ ] Corregir Channel “mapea 1:1”:
  - `ONLINE` no es un estado producido actualmente por Endpoint Registry;
  - puede quedar como propuesta derivada futura.
- [ ] Corregir escenarios 3, 7, 8, 11 y 16.
- [ ] Fila 16:
  - cambiar título “Tool enviada” porque la evidencia sólo demuestra ASK;
  - Availability debe ser `UNKNOWN`, no `READY (asumido)`.
- [ ] Fila 7:
  - nueva tentativa sólo después de reconciliación previa.
- [ ] Fila 11:
  - distinguir comportamiento actual `resumeOnly` de diseño futuro con nuevo `attemptId/requestId`.
- [ ] Completar reconciliación antes de retry/sustitución:
  - resultado recibido pero no persistido;
  - resultado persistido pero feedback no entregado;
  - feedback aceptado y continuación iniciada;
  - cancelación autoritativa confirmada.
- [ ] Diferenciar ACK del backend, ACK del relay, entrega al proveedor y aceptación del feedback.
- [ ] Sustituir `partialArtifact.text` por `partialArtifactRef` o reglas de acceso explícitas.
- [ ] Retirar Endpoint Registry de `provider.availability.changed` como emisor autoritativo.

Lifecycle correcto de tools a documentar:

1. prompt preparado;
2. ASK enviado;
3. request recibido/aceptado, si existe ACK observable;
4. primer chunk;
5. respuesta cerrada;
6. tool detectada/parseada;
7. tool validada/autorizada;
8. tool despachada al ejecutor JSON Family;
9. tool realmente ejecutada por el orquestador;
10. resultado recibido por `processCloudToolProtocol`;
11. resultado persistido;
12. feedback preparado;
13. feedback enviado al proveedor;
14. feedback aceptado/confirmado.

Siguiente paso:

- [ ] Claude produce un último delta documental pequeño y focalizado.
- [ ] No reescribir nuevamente todo el informe.
- [ ] Modificar exclusivamente:
  - `docs/audits/provider-health-sensor-discovery-claude.md`.
- [ ] No implementar `types.js`, `validate.js` ni tests.
- [ ] Navigator revisa después sólo el nuevo delta.
- [ ] Mantener `blocked_external_tests: BLOCKED_EXTERNAL_PAUSED_LIMIT`.

#### Último delta documental — instrucción entregada a Claude

- [x] Diego entregó al Driver el prompt canónico para cerrar los blockers restantes.
- [x] Alcance autorizado:
  - un último delta documental pequeño;
  - únicamente `docs/audits/provider-health-sensor-discovery-claude.md`;
  - sin código, tests ni archivos de producción.
- [x] HEAD de partida esperado:
  - `0dede036ec4d8edd4a1da427881df8cf8350d35e`.
- [ ] Esperar entrega terminada en:
  - `DRIVER_PROVIDER_HEALTH_CONTRACTS_FINALIZED`.
- [ ] Verificar mediante Git el nuevo commit, padre, delta, archivo único, worktree limpio y `git diff --check`.
- [ ] Después devolver exclusivamente el nuevo delta al Navigator.
- [!] El archivo adjunto recibido en este turno corresponde todavía al reporte anterior del Navigator, no a la futura entrega final de Claude.
- [!] Checkpoint 1 continúa sin autorización.

Pruebas vivas Qwen:

- `BLOCKED_EXTERNAL_PAUSED_LIMIT`.
- No se enviaron mensajes, no se hicieron clicks sintéticos y no se ejecutaron retries.


Hallazgo originado por el límite real de Qwen:

> Un relay no sólo conecta un modelo: también informa si ese modelo sigue vivo y disponible para la misión.

Objetivo:

- [ ] Extender el contrato de cada relay para detectar disponibilidad del proveedor.
- [ ] Definir estados formales:
  - `READY`;
  - `BUSY`;
  - `RATE_LIMITED`;
  - `QUOTA_EXHAUSTED`;
  - `AUTH_REQUIRED`;
  - `CHALLENGE_REQUIRED`;
  - `TEMP_UNAVAILABLE`;
  - `RESTRICTED`;
  - `UNKNOWN`.
- [ ] Detectar señales visibles y legítimas del dominio:
  - banner de límite agotado;
  - composer deshabilitado;
  - mensaje de reintento posterior;
  - contador o fecha de renovación;
  - sesión cerrada;
  - CAPTCHA o challenge;
  - caída temporal del servicio;
  - restricción de cuenta, región o plan.
- [ ] Añadir capacidades al adapter del relay:
  - `detectAvailability()`;
  - `getAvailabilityState()`;
  - `getAvailabilityEvidence()`;
  - `getRetryAfter()`;
  - `subscribeAvailabilityChanges()`.
- [ ] Emitir `provider.availability.changed` con:
  - proveedor;
  - sesión y conversación;
  - `jobId`;
  - estado anterior y nuevo;
  - razón;
  - confianza;
  - evidencia;
  - `retryAfter`;
  - timestamp.
- [ ] Evitar falsos positivos:
  - no interpretar silencio como cuota agotada;
  - combinar múltiples señales;
  - usar debounce y ventana de estabilidad;
  - distinguir límite, red, autenticación y caída del servicio;
  - usar `UNKNOWN` cuando la evidencia sea insuficiente;
  - añadir histéresis para evitar cambios de estado constantes.
- [ ] Crear patrones específicos por proveedor e idioma.
- [ ] Añadir fixtures y pruebas para banners y barreras conocidas.

Integración con Lyria Orchestrator:

- [ ] Antes de despachar un job, comprobar disponibilidad del proveedor.
- [ ] Si aparece `QUOTA_EXHAUSTED` o `RATE_LIMITED`, detener nuevos envíos.
- [ ] Conservar prompt, respuesta parcial, tools y último resultado confirmado.
- [ ] Marcar el job como `PAUSED_LIMIT` o el estado correspondiente.
- [ ] Distinguir indisponibilidad externa de un bug de Aurora.
- [ ] Despertar la misma sesión lógica de Lyria.
- [ ] Elegir un agente sustituto para el mismo rol.
- [ ] Construir automáticamente el handoff concatenado.
- [ ] Continuar desde el último checkpoint válido.
- [ ] Evitar que Driver o Navigator intenten corregir código para compensar una cuota agotada.

Caso de prueba inicial:

- [ ] Capturar el estado actual de Qwen sin cuota.
- [ ] Identificar las señales concretas visibles en `chat.qwen.ai`.
- [ ] Confirmar que el relay lo clasifica como `QUOTA_EXHAUSTED` o `RATE_LIMITED` con evidencia.
- [ ] Confirmar que el job cambia a `PAUSED_LIMIT`.
- [ ] Confirmar sustitución del Navigator sin pérdida de contexto.
- [ ] Confirmar recuperación cuando la cuota vuelva a estar disponible.

### Relay explorador

- [ ] Diseñar detección conservadora de interfaces conversacionales.
- [ ] Separar relay explorador de relays específicos.
- [ ] Requerir aprobación humana antes de operar un dominio nuevo.
- [ ] Mantener Aurora privada durante esta etapa experimental.

---

## 🚨 Reglas aprendidas que no debemos volver a romper

- [ ] Crear y verificar la rama antes de autorizar cualquier escritura.
- [ ] Entregar siempre misión original + reporte íntegro + commits + diff + evidencia.
- [ ] No asumir que otro agente conoce algo que sólo vimos nosotros.
- [ ] No confundir una tool emitida con una tool ejecutada.
- [ ] No confundir una tool ejecutada con una conclusión verificada.
- [ ] Registrar expresamente la última llamada pendiente al reemplazar un agente.
- [ ] Un solo escritor por estado mutable.
- [ ] Revisar commits exactos e inmutables.
- [ ] Mantener roles persistentes y agentes reemplazables.
- [ ] No mezclar bugs o ideas futuras con el alcance activo.

---

## 📝 Forma de actualizar este archivo

Cuando ocurra un avance:

1. marcar únicamente los puntos demostrados;
2. escribir el commit o evidencia correspondiente;
3. registrar cualquier bloqueo nuevo;
4. mover la siguiente acción concreta al frente;
5. mantener separados misión activa, arquitectura futura y backlog.

**Próxima acción actual:** entregar al ChatGPT Navigator el reporte literal `DRIVER_PROVIDER_HEALTH_CHECKPOINT_1_FINAL_HARDENING_COMPLETED` y solicitar revisión exclusiva del rango `78d9dfd42491719002cb82db2317349eb672e5de..e9b75120af505ad6ba60c50638844c1762d1ef7e`. No autorizar Checkpoint 2 todavía y no tocar los worktrees de SOL.

#### Delta documental v3 de Claude — commit `7ebbfd1`

- [x] Branch verificada: `task/provider-health-sensor`.
- [x] HEAD verificado: `7ebbfd1bc1e58c57d2d4ad72e61afc4cbceb88f2`.
- [x] Padre directo: `0dede036ec4d8edd4a1da427881df8cf8350d35e`.
- [x] Rango final: `0dede036ec4d8edd4a1da427881df8cf8350d35e..7ebbfd1bc1e58c57d2d4ad72e61afc4cbceb88f2`.
- [x] Único archivo modificado: `docs/audits/provider-health-sensor-discovery-claude.md`.
- [x] Diff: `198 insertions`, `88 deletions`.
- [x] Ningún archivo de producción modificado.
- [x] Worktree limpio y `git diff --check` limpio.
- [x] `RequestActivity`, `JobState` y `ToolLifecycle` separados.
- [x] `CANCELLED` e `INTERRUPTED` diferenciados.
- [x] `AURORA_CLOUD_ANSWER ok:true` cierra request, no necesariamente job.
- [x] Autoridad de ejecución de tools corregida hacia JSON Family/server-side.
- [x] Contratos presentes: `provider.availability.changed`, `provider.request.activity.changed`, `cloud.job.state.changed`.
- [x] Channel adopta Opción B: Endpoint Registry permanece autoridad única; no se crea `provider.channel.changed`.
- [x] Escenarios 3, 7, 8, 11 y 16 corregidos.
- [x] Reconciliación ampliada a quince comprobaciones.
- [x] `partialArtifact.text` sustituido por `partialArtifactRef`.
- [i] La verificación anterior que indicó ausencia de `cloud.job.state.changed` fue un falso negativo del comando: `grep -q` cerró la tubería bajo `pipefail` y `git show` recibió SIGPIPE. La lectura directa confirmó el contrato.
- [ ] Navigator debe revisar exclusivamente el delta `0dede036..7ebbfd1`.
- [!] Checkpoint 1 continúa bloqueado hasta recibir `safe_to_authorize_checkpoint_1: yes`.


#### Revisión Navigator de `7ebbfd1` — seis blockers finales

- [!] Veredicto: `CHANGES_REQUIRED`.
- [x] Git, alcance, aislamiento y diff aprobados.
- [!] `safe_to_accept_corrected_discovery: NO`.
- [!] `safe_to_authorize_checkpoint_1: NO`.

Blockers restantes:

1. [ ] Eliminar la sección lifecycle obsoleta que aún atribuye ejecución de tools a `ejecutarPreparada()`.
2. [ ] Corregir semántica de ACK:
   - `AURORA_CLOUD_ACK` confirma consumo de `AURORA_CLOUD_ANSWER` y limpieza del outbox;
   - `/json-family/delivered` registra que `deliverToOrigin` reportó entrega del feedback;
   - ninguna señal prueba aceptación real por el proveedor.
3. [ ] Añadir `logicalProviderId` y `effectiveAdapterId` a `cloud.job.state.changed`, o identidad equivalente explícita por intento.
4. [ ] Definir `JobState.ACTIVE` para cubrir `QUEUED`, `SUBMITTED`, `WAITING_FIRST_OUTPUT`, `PROGRESSING` y `STALLED`.
5. [ ] Hacer conservadoras las filas 3 y 8: el último RequestActivity puede ser `FAILED`, `COMPLETED`, `INTERRUPTED`, `UNKNOWN` o inexistente.
6. [ ] Cambiar en fila 15 `partialArtifact` por `partialArtifactRef`.

- [ ] Claude produce un commit documental mínimo sobre el mismo informe.
- [ ] Navigator revisa únicamente ese nuevo delta.
- [!] No implementar todavía `types.js`, `validate.js` ni tests.
- [!] Mantener `BLOCKED_EXTERNAL_PAUSED_LIMIT`.


#### Provider Health — v4 verificada en `a0958c2`, pendiente de aprobación final

Evidencia Git real:

- [x] Branch: `task/provider-health-sensor`.
- [x] Commit anterior: `7ebbfd1bc1e58c57d2d4ad72e61afc4cbceb88f2`.
- [x] Commit v4: `a0958c27d6143d8fb9a6c3e3eeb47b184cefaf4b`.
- [x] Padre directo exacto verificado.
- [x] Único archivo modificado: `docs/audits/provider-health-sensor-discovery-claude.md`.
- [x] Ningún archivo de producción o tests modificado.
- [x] Worktree limpio.
- [x] `git diff --check` limpio.

Blockers finales verificados en el informe:

- [x] Lifecycle duplicado eliminado; queda una única cadena canónica.
- [x] `ejecutarPreparada()` ya no figura como ejecutor físico de tools.
- [x] `AURORA_CLOUD_ACK` definido como consumo de `AURORA_CLOUD_ANSWER` y limpieza de outbox.
- [x] `/json-family/delivered` definido como journal de entrega técnica de feedback.
- [x] Aceptación real del proveedor permanece separada de ambos ACK.
- [x] `cloud.job.state.changed` incluye `currentAttempt` con identidad de proveedor y adapter por intento.
- [x] `JobState.ACTIVE` cubre `QUEUED`, `SUBMITTED`, `WAITING_FIRST_OUTPUT`, `PROGRESSING` y `STALLED`.
- [x] Filas 3 y 8 ya no inventan terminalidad del último request.
- [x] Fila 15 usa `partialArtifactRef`.
- [x] Preguntas restantes declaradas no bloqueantes.

Estado:

- [ ] Navigator revisa únicamente `7ebbfd1bc1e58c57d2d4ad72e61afc4cbceb88f2..a0958c27d6143d8fb9a6c3e3eeb47b184cefaf4b`.
- [ ] Esperar `safe_to_accept_final_discovery: yes`.
- [ ] Esperar `safe_to_authorize_checkpoint_1: yes`.
- [!] Checkpoint 1 continúa bloqueado hasta ese veredicto explícito.
- [!] Qwen continúa `BLOCKED_EXTERNAL_PAUSED_LIMIT`.


#### Provider Health — discovery aprobado y Checkpoint 1 autorizado

Veredicto final del Navigator:

- [x] `verdict: APPROVED_WITH_FOLLOWUP`.
- [x] Commit revisado: `a0958c27d6143d8fb9a6c3e3eeb47b184cefaf4b`.
- [x] Rango: `7ebbfd1bc1e58c57d2d4ad72e61afc4cbceb88f2..a0958c27d6143d8fb9a6c3e3eeb47b184cefaf4b`.
- [x] Lifecycle canónico aprobado.
- [x] Autoridad real de ejecución de tools aprobada.
- [x] Semántica de `AURORA_CLOUD_ACK` aprobada.
- [x] Semántica de `/json-family/delivered` aprobada.
- [x] Separación de aceptación real del proveedor aprobada.
- [x] Identidad de intento en `cloud.job.state.changed` aprobada.
- [x] `JobState.ACTIVE` aprobado.
- [x] Escenarios 3, 8 y 15 aprobados.
- [x] Privacidad de `EvidenceEntry` y `PartialArtifactRef` aprobada.
- [x] Contrato del Checkpoint 1 aprobado.
- [x] `remaining_material_contradictions: none`.
- [x] `blocking_questions: none`.
- [x] `safe_to_accept_final_discovery: yes`.
- [x] `safe_to_authorize_checkpoint_1: yes`.

Checkpoint 1 autorizado exclusivamente para tres archivos nuevos:

1. `extensions/aihub/content-scripts/relay/provider-health/types.js`
2. `extensions/aihub/content-scripts/relay/provider-health/validate.js`
3. `tests/provider-health/test_contract.mjs`

Restricciones:

- [ ] No conectar todavía con adapters, relays, Lyria o Cloud.
- [ ] No implementar retries ni sustitución de agentes.
- [ ] No modificar archivos existentes.
- [ ] No interactuar con Qwen vivo.
- [ ] Usar IIFE clásico y `globalThis.__auroraProviderHealth`.
- [ ] Sin exports ESM en content scripts.
- [ ] Ejecutar `node --check` sobre `types.js` y `validate.js`.
- [ ] Ejecutar `bun tests/provider-health/test_contract.mjs`.
- [ ] Commit aislado limitado a esas tres rutas.
- [!] Mantener `BLOCKED_EXTERNAL_PAUSED_LIMIT` para pruebas vivas de Qwen.

Follow-ups no bloqueantes:

- ubicación del clasificador;
- transporte futuro de eventos;
- integración con AI-Cloud Memory;
- generalización de “Answer now”;
- browser harness;
- gate real de autorización de tools;
- posible solapamiento Duo/enviarACloud;
- limpieza editorial del informe.


#### Provider Health — Checkpoint 1 implementado en `1da5f80`, pendiente de Navigator

- [x] Base: `a0958c27d6143d8fb9a6c3e3eeb47b184cefaf4b`.
- [x] Commit: `1da5f80824bc50a7ace5686443aad9bdbc392a46`.
- [x] Padre directo exacto verificado.
- [x] Sólo tres archivos nuevos: `types.js`, `validate.js` y `tests/provider-health/test_contract.mjs`.
- [x] Ningún archivo existente modificado.
- [x] Ninguna integración con producción.
- [x] Worktree limpio y `git diff --check` limpio.
- [x] `node --check` pasó para ambos scripts.
- [x] `bun tests/provider-health/test_contract.mjs` pasó.
- [ ] Navigator revisa `a0958c27..1da5f80`.
- [!] Checkpoint 2 continúa bloqueado.
- [!] Qwen continúa `BLOCKED_EXTERNAL_PAUSED_LIMIT`.


#### Provider Health — revisión de Checkpoint 1: `CHANGES_REQUIRED`

- [x] Commit revisado: `1da5f80824bc50a7ace5686443aad9bdbc392a46`.
- [x] Scope Git aprobado: sólo `types.js`, `validate.js` y `tests/provider-health/test_contract.mjs`.
- [x] Ningún archivo existente modificado y `production_integration: none`.
- [x] Worktree limpio, `git diff --check`, `node --check` y tests Bun pasaron.
- [!] `safe_to_accept_checkpoint_1: no`.
- [!] `safe_to_advance_to_checkpoint_2: no`.

Correcciones bloqueantes:

- [ ] Proteger el namespace y sus bindings públicos contra reasignación; rechazar namespace preexistente incompatible por versión/forma.
- [ ] Implementar política real de plain objects, propiedades propias y descriptores; no ejecutar getters hostiles.
- [ ] EvidenceEntry debe rechazar también `prompt`, `response` y `body`, validar orden temporal y evitar escapes heredados/anidados según política explícita.
- [ ] Rechazar evidenceId duplicados, self-contradiction y ciclos según el contrato.
- [ ] Restringir `currentAttempt:null` a estados compatibles, principalmente `CREATED`.
- [ ] Rechazar `pauseReason`/`blockedReason` en estados incompatibles y ambas razones simultáneas.
- [ ] Validar cada elemento de `allowedConsumers` como string no vacío y validar expiración de PartialArtifactRef.
- [ ] Definir política uniforme de campos desconocidos; impedir contenido privado arbitrario en snapshots/eventos.
- [ ] Convertir getters que lanzan en errores estructurados o rechazarlos sin ejecutarlos.
- [ ] Ampliar tests adversariales: segunda carga, namespace incompatible, bindings reasignables, prototipos, heredados, getters, timestamps, referencias, currentAttempt nulo, razones incompatibles y privacidad de snapshot.

Protección del trabajo de SOL:

- [x] Provider Health continúa en su worktree aislado: `/media/almacen/deml/Downloads/core_instruction/aurora-provider-health-sensor`.
- [x] Toda corrección siguiente queda limitada a esa rama/worktree y a los tres archivos del Checkpoint 1.
- [!] No tocar, resetear, limpiar, cambiar de branch ni reutilizar el worktree de SOL.
- [!] Checkpoint 2 permanece bloqueado.
- [!] Qwen permanece `BLOCKED_EXTERNAL_PAUSED_LIMIT`.


#### Provider Health — corrección de Checkpoint 1 en `78d9dfd`, pendiente de Navigator

Evidencia verificada:

- [x] Branch `task/provider-health-sensor`.
- [x] Commit anterior `1da5f80824bc50a7ace5686443aad9bdbc392a46`.
- [x] Commit correctivo `78d9dfd42491719002cb82db2317349eb672e5de`.
- [x] Padre directo exacto.
- [x] Delta limitado a `types.js`, `validate.js` y `tests/provider-health/test_contract.mjs`.
- [x] Ningún archivo fuera de scope.
- [x] Ninguna integración con producción.
- [x] Worktree limpio y `git diff --check` limpio.
- [x] Ambos `node --check` pasan.
- [x] Tests Bun pasan con `/home/deml/.bun/bin/bun`.
- [x] Bindings públicos protegidos y namespace versionado.
- [x] Política de plain objects, propiedades propias y accessors endurecida.
- [x] Privacidad, referencias y consistencia temporal de EvidenceEntry endurecidas.
- [x] `currentAttempt:null` restringido por JobState.
- [x] Razones PAUSED/BLOCKED coherentes.
- [x] `allowedConsumers` y privacidad del snapshot endurecidos.
- [x] Tests adversariales añadidos sin retirar los anteriores.
- [x] Worktrees de SOL permanecen separados y fuera del scope.

Estado:

- [ ] Navigator revisa exclusivamente `1da5f80824bc50a7ace5686443aad9bdbc392a46..78d9dfd42491719002cb82db2317349eb672e5de`.
- [ ] Checkpoint 2 continúa bloqueado hasta aprobación explícita.
- [!] Qwen continúa `BLOCKED_EXTERNAL_PAUSED_LIMIT`.


#### Provider Health — segunda revisión correctiva: `CHANGES_REQUIRED`

Navigator revisó `1da5f80824bc50a7ace5686443aad9bdbc392a46..78d9dfd42491719002cb82db2317349eb672e5de`.

Aprobado:

- [x] Scope Git limitado a los tres archivos del Checkpoint 1.
- [x] Ningún archivo fuera de scope.
- [x] Ninguna integración con producción.
- [x] Worktree limpio y `git diff --check` limpio.
- [x] Scripts clásicos, sin ESM/CommonJS/DOM/Chrome/red/storage/timers.
- [x] Segunda carga canónica limpia.
- [x] Temporalidad de EvidenceEntry y PartialArtifactRef.
- [x] Referencias de evidencia, duplicados, self-reference y ciclos.
- [x] AttemptIdentity y reglas de `currentAttempt:null`.
- [x] Reglas `pauseReason`/`blockedReason`.
- [x] Validación de `allowedConsumers`.
- [x] Tests originales preservados y Bun/Node pasan.
- [x] Worktrees de SOL separados y sin tocar.

Bloqueos restantes:

- [ ] Bloquear la propiedad global `globalThis.__auroraProviderHealth` contra sustitución/eliminación completa.
- [ ] Rechazar namespaces de misma versión pero materialmente incompatibles.
- [ ] No aceptar enums preexistentes mutables aunque su contenido coincida superficialmente.
- [ ] No aceptar validadores o `__defineLocked` preexistentes sólo por ser funciones.
- [ ] Eliminar `Object.prototype.toString.call()` de `isPlainObject()` para no ejecutar getters de `Symbol.toStringTag`.
- [ ] Garantizar errores estructurados ante `Symbol.toStringTag` hostil.
- [ ] Reemplazar `Object.keys()` por una política que inspeccione todas las claves propias (`Reflect.ownKeys()` o equivalente).
- [ ] Rechazar propiedades desconocidas no enumerables y símbolos.
- [ ] Añadir tests adversariales exactos para sustitución global, namespace compatible falso, funciones falsas, `Symbol.toStringTag`, claves no enumerables y símbolos.

Estado:

- [!] `safe_to_accept_checkpoint_1: no`.
- [!] `safe_to_advance_to_checkpoint_2: no`.
- [!] Checkpoint 2 continúa bloqueado.
- [!] Qwen continúa `BLOCKED_EXTERNAL_PAUSED_LIMIT`.
- [!] No tocar los worktrees de SOL.


#### Provider Health — endurecimiento final en `e9b7512`, pendiente de Navigator

Evidencia verificada:

- [x] Branch `task/provider-health-sensor`.
- [x] Commit anterior `78d9dfd42491719002cb82db2317349eb672e5de`.
- [x] Commit resultado `e9b75120af505ad6ba60c50638844c1762d1ef7e`.
- [x] Padre directo exacto.
- [x] Delta limitado a `types.js`, `validate.js` y `tests/provider-health/test_contract.mjs`.
- [x] Ningún archivo fuera de scope.
- [x] Ninguna integración con producción.
- [x] Worktree limpio y `git diff --check` limpio.
- [x] Ambos `node --check` pasan.
- [x] Tests Bun pasan con `/home/deml/.bun/bin/bun`.
- [x] Binding global `globalThis.__auroraProviderHealth` sellado.
- [x] Namespace canónico marcado y namespaces incompatibles de misma versión rechazados.
- [x] Enums mutables, validadores falsos y `__defineLocked` falso rechazados.
- [x] `isPlainObject` ya no ejecuta `Symbol.toStringTag`.
- [x] Whitelist basada en todas las claves propias mediante `Reflect.ownKeys`.
- [x] Propiedades no enumerables y símbolos desconocidos rechazados.
- [x] Correcciones anteriores preservadas.
- [x] Worktrees de SOL permanecen separados y fuera del scope.

Estado:

- [x] Navigator revisó exclusivamente `78d9dfd42491719002cb82db2317349eb672e5de..e9b75120af505ad6ba60c50638844c1762d1ef7e`.
- [!] Veredicto: `CHANGES_REQUIRED`.
- [x] Sellado global, namespace canónico, segunda carga, `Symbol.toStringTag`, no enumerables y símbolos quedaron aprobados.
- [!] Bloquearon únicamente el fallback inseguro de `Reflect.ownKeys()` y la ejecución de accessors hostiles dentro de arrays de input.
- [ ] Checkpoint 2 continúa bloqueado hasta aprobación explícita.
- [!] Qwen continúa `BLOCKED_EXTERNAL_PAUSED_LIMIT`.

#### Provider Health — inputs hostiles corregidos en `6a8f6e6`, revisión final pendiente

Evidencia entregada por el Driver:

- [x] Branch `task/provider-health-sensor`.
- [x] Commit anterior `e9b75120af505ad6ba60c50638844c1762d1ef7e`.
- [x] Commit resultado `6a8f6e6cd51c48a4c6b35b4aca132013603964a8`.
- [x] Padre directo exacto `e9b75120af505ad6ba60c50638844c1762d1ef7e`.
- [x] Archivos modificados: `validate.js` y `tests/provider-health/test_contract.mjs`.
- [x] `types.js` no necesitó cambios.
- [x] Ningún archivo fuera de scope.
- [x] Ninguna integración con producción.
- [x] `Reflect.ownKeys()` hostil ahora produce rechazo estructurado `own_keys_reflection_failed`.
- [x] Eliminado el fallback inseguro mediante `keys=[]`.
- [x] Añadido lector seguro de arrays basado en `Reflect.ownKeys()` y `Object.getOwnPropertyDescriptor()`.
- [x] Getters, setters, holes, claves extra y fallos de reflexión en arrays se rechazan sin ejecutar código hostil.
- [x] `allowedConsumers`, `contradicts` y `evidence[]` endurecidos.
- [x] Errores de descriptor distinguen `field_reflection_failed` de `accessor_field_not_allowed`.
- [x] Ningún Proxy adversarial probado hace escapar excepciones.
- [x] Datos privados y mensajes internos de Proxies no aparecen en errores.
- [x] Correcciones y tests anteriores preservados.
- [x] 29 pruebas adversariales nuevas `H1-H29b`.
- [x] Ambos `node --check` pasan.
- [x] Tests Bun pasan.
- [x] `git diff --check` limpio.
- [x] Worktree limpio.
- [x] Worktrees de SOL no tocados.
- [x] Sin regresiones reportadas.

Estado y cierre formal:

- [x] Navigator revisó exclusivamente `e9b75120af505ad6ba60c50638844c1762d1ef7e..6a8f6e6cd51c48a4c6b35b4aca132013603964a8`.
- [x] Veredicto final: `APPROVED`.
- [x] `safe_to_accept_checkpoint_1: yes`.
- [x] `safe_to_close_checkpoint_1: yes`.
- [x] `safe_to_advance_to_checkpoint_2: yes` desde el punto de vista técnico.
- [x] Padre directo, único commit en rango y archivos modificados verificados.
- [x] `types.js` permaneció sin cambios en la corrección final.
- [x] `git diff --check`, ambos `node --check` y tests Bun aprobados.
- [x] Ningún archivo fuera de scope.
- [x] Ninguna integración con producción.
- [x] Ninguna regresión detectada.
- [x] Ningún defecto material restante.
- [x] Worktrees de SOL separados e intactos.
- [x] Checkpoint 1 cerrado formalmente por el Orchestrator.
- [x] No se abrirán más rondas ni ampliaciones dentro del Checkpoint 1.
- [ ] Checkpoint 2 requiere scope nuevo y autorización independiente antes de implementar.
- [!] Qwen continúa `BLOCKED_EXTERNAL_PAUSED_LIMIT`.

Resultado final del Checkpoint 1:

- commit aceptado: `6a8f6e6cd51c48a4c6b35b4aca132013603964a8`;
- contrato puro de Provider Health aprobado;
- validadores resistentes a inputs hostiles aprobados;
- tests contractuales y adversariales aprobados;
- producción permanece sin integración;
- fase terminada.

Próxima acción:

- [x] Checkpoint 1 de Provider Health cerrado formalmente.
- [ ] Siguiente misión activa: `AI-Cloud Memory & Team Foundry — Fase 1: estructura y contratos de memoria`.
- [ ] Mantener Provider Health Checkpoint 2 aplazado hasta que reciba scope y autorización independientes.

#### Próximo checkpoint — AI-Cloud Memory & Team Foundry / Fase 1

Estado real verificado antes de comenzar:

- [x] Repositorio principal: `/media/almacen/deml/Downloads/core_instruction/aurora`.
- [x] Branch principal actualmente visible: `task/qwen-lyria-cloud` en `17e1e710c1e33058142eaf7ba519bbde51643c00`.
- [x] El working tree principal contiene numerosos cambios rastreados y archivos untracked pertenecientes a trabajo concurrente.
- [x] `ai-cloud/` existe actualmente como contenido untracked en el worktree principal.
- [x] Worktrees de SOL registrados por separado:
  - `/media/almacen/deml/Downloads/core_instruction/aurora-sol-ideas-integration`;
  - `/media/almacen/deml/Downloads/core_instruction/aurora-sol-productivity-inquisition`.
- [x] Worktree de Provider Health separado y cerrado en `6a8f6e6cd51c48a4c6b35b4aca132013603964a8`.

Reglas de aislamiento para la nueva misión:

- [x] No implementar Fase 1 directamente sobre el worktree principal contaminado.
- [x] Branch exclusiva creada: `task/ai-cloud-memory-foundry-phase1`.
- [x] Worktree exclusivo creado: `/media/almacen/deml/Downloads/core_instruction/aurora-ai-cloud-memory-foundry`.
- [x] Base exacta: `17e1e710c1e33058142eaf7ba519bbde51643c00`.
- [x] Nuevo worktree limpio tras su creación.
- [x] Worktrees de SOL y Provider Health permanecen registrados por separado y sin modificar.
- [ ] No ejecutar `git add .`, `git add -A`, `stash`, `reset`, `clean`, `rebase`, `merge` ni operaciones destructivas.
- [x] Inventariar y copiar de forma explícita únicamente los archivos canónicos actuales de `ai-cloud/` al nuevo worktree, sin arrastrar otros untracked.
- [x] Archivos copiados al worktree nuevo:
  - `ai-cloud/AI-cloud.md`;
  - `ai-cloud/CHECKLIST-ACTIVO.md`;
  - `ai-cloud/memories/chatgpt-orchestrator-memories.md`.
- [x] Checksums SHA-256 registrados al copiar:
  - `AI-cloud.md`: `06c289fea487fcf3c733d29eda9e33e10287fc6e798ac4f85ad7cf74b9dcf18d`;
  - `CHECKLIST-ACTIVO.md`: `00f5539dd71870a26a033adf5f8ef958ea0b5968b25c84df79e698394ce62f2a`;
  - `chatgpt-orchestrator-memories.md`: `d03df4656fefb006a5078c8f9b16b0e72bc13843800dc32c87f7f727b5402be5`.
- [x] Estado Git del worktree nuevo tras la copia: únicamente `?? ai-cloud/`.

Primer checkpoint propuesto — discovery y contrato documental solamente:

Estado de arranque:

- [x] Worktree exclusivo preparado y limpio antes de copiar los archivos canónicos.
- [x] Copia inicial sincronizada desde el estado compartido real.
- [x] Checklist del worktree nuevo sincronizado byte a byte con el checklist activo; SHA-256 actual: `95cb8cf4cfaa5283c70b892d451534a0ae294d86cf828ce077e1e53506c67794`.
- [x] Scope inicial limitado a documentación y contratos; ninguna implementación runtime autorizada.
- [ ] Entregar al Driver una misión de discovery documental sobre este worktree.
- [ ] Recibir un único commit documental para revisión de Navigator.

- [ ] Confirmar ubicación definitiva de `ai-cloud/` dentro del repositorio.
- [x] Inventariar `AI-cloud.md`, `CHECKLIST-ACTIVO.md` y `memories/chatgpt-orchestrator-memories.md`.
- [ ] Diseñar la estructura inicial `prompts/`, `memories/`, `sessions/`, `missions/`, `teams/`, `evidence/` y `artifacts/`.
- [ ] Proponer esquemas versionados para `PROMPT`, `MEMORY`, `SESSION` y `EVIDENCE`.
- [ ] Definir metadatos mínimos, identidad, referencias, privacidad, supersesión y timestamps.
- [ ] Separar hechos, inferencias, decisiones, preferencias y evidencia.
- [ ] Diseñar índices por proyecto, rol, proveedor y misión.
- [ ] Preparar una estrategia de migración que preserve los archivos actuales.
- [ ] No implementar runtime, persistencia, UI, compactador, Provider Health integration ni Team Builder en este checkpoint.
- [ ] Someter el discovery documental a Navigator antes de crear contratos ejecutables.

## Preservación paralela — Lyria Avatar Presence & Backgrounds

Estado verificado el 2026-07-20:

- [x] Se inspeccionaron el worktree principal, ambos worktrees de SOL, Provider Health, AI-Cloud Memory Foundry y `ember-thought`.
- [x] Se confirmó que el trabajo reciente de Lyria y fondos estaba mezclado en el worktree principal contaminado, no en una rama limpia propia.
- [x] Se creó un worktree exclusivo para preservarlo:
  - branch: `task/lyria-avatar-presence-backgrounds`;
  - path: `/media/almacen/deml/Downloads/core_instruction/aurora-lyria-avatar-presence`;
  - base: `17e1e710c1e33058142eaf7ba519bbde51643c00`.
- [x] Se copiaron explícitamente sólo los cambios relacionados con:
  - Avatar Engine de Lyria;
  - overlay de voz, dock local y modo Avatar;
  - estados, moods y recuperación de turno;
  - actividad de tools;
  - backgrounds, HUD y Atmosphere Studio;
  - primitivas UI mínimas requeridas por esas superficies.
- [x] Se evitó copiar backups, artefactos de debug, `.understand-anything`, `SOL-test-bug`, archivos vacíos y demás basura untracked.
- [x] `git diff --check` pasó.
- [x] Syntax check ESM de todos los JS/MJS modificados o nuevos pasó.
- [x] Imports relativos verificados: ninguno roto.
- [x] Tests aprobados:
  - `test_lyria_avatar_modes.mjs`;
  - `test_lyria_reload_recovery.mjs`;
  - `test_lyria_tool_activity.mjs`;
  - `test_atmosphere_studio.mjs`;
  - `test_performance_budget.mjs`.
- [x] Los worktrees de SOL, Provider Health y AI-Cloud no fueron modificados durante el aislamiento.
- [x] Crear un único commit exacto en `task/lyria-avatar-presence-backgrounds`: `b17d91a7f26b16a03e988fbd6e55104831fb3509`.
- [x] Verificar commit, parent, 57 archivos incluidos y worktree limpio; parent `17e1e710c1e33058142eaf7ba519bbde51643c00`.
- [ ] Someter la rama a revisión antes de mergearla o integrarla en otra rama.

Nota: el commit de `ember-thought` pertenece a un refactor histórico del 2026-06-19 y no corresponde a esta rama de Lyria.

## Superidea 7 — Aurora Mission Control

Estado registrado el 2026-07-21:

- [x] Documentar la Superidea 7 en `docs/restaurado/ideas-rescatadas.md`.
- [x] Definir el concepto central: observabilidad multi-chat, continuidad de misión y recuperación de agentes con contexto perdido.
- [x] Separar disponibilidad del proveedor de continuidad de la sesión.
- [x] Proponer `Context Capsules`, `Agent Resurrection`, historial de cuota/resets y cockpit multi-sesión.
- [x] Integrar conceptualmente Provider Health Sensor, AI-Cloud Memory Foundry, Lyria Orchestrator y Embodied Bridge.
- [x] Registrar cuatro MVP progresivos: Observatory, Context Recovery, Mission Continuity y Command Center.
- [ ] Diseñar el contrato versionado de `Context Capsule`.
- [ ] Diseñar el modelo de estados de continuidad de sesión.
- [ ] Definir señales verificables para detectar `MEMORY_LOST` sin falsos positivos.
- [ ] Preparar una misión read-only de discovery antes de autorizar implementación.

Evidencia conceptual real:

- SOL/Codex recuperó cuota varias veces durante una misma semana.
- Una sesión de SOL volvió con 100% de uso disponible pero contexto cero.
- Claude permaneció disponible, pero perdió su memoria operativa de Aurora.
- Los prompts manuales de reconexión permitieron restaurar identidad funcional, ramas, restricciones y siguiente checkpoint.
