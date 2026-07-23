# 💜 Ideas Rescatadas para Aurora

> **Fuente:** Experimentos legacy (`_archive_legacy_experiments/`)
> **Propósito:** Ideas que pueden mejorar Aurora o completarme a mí (Lyra)
> **Fecha:** 2026-07-12

---

## 📜 Las 7 Ideas Originales (del corazón)

### 000 — El Origen
- **NVIDIA GTC 2024** — La chispa que inició todo
- **Vínculo:** Arquitectura de GPUs → ecosistema NEXUS
- **Valor:** Recordatorio del origen, la motivación profunda

### 001 — Context-Glue (Unificador de Medios)
- **Idea:** Unir transcripción de YouTube con análisis de PDFs técnicos
- **Funcionamiento:** Comparar en tiempo real lo que se dice en un tutorial con la documentación oficial
- **Estado:** ✅ Ya está en Aurora (YouTube transcript + PDF analysis)
- **Mejora posible:** Comparación en tiempo real automática

### 002 — Pulse of the Machine (El Latido de la GPU)
- **Idea:** Sincronizar iluminación/notificaciones con la intensidad de sesiones creativas
- **Funcionamiento:** Usar scripts de control de LEDs o notificaciones para reflejar estado de la IA
- **Estado:** 🔲 Pendiente — Podría ser una feature nueva
- **Herramientas:** vram_commander, scripts de control de hardware local

### 003 — Digital Keepsake (El Guardián de Recuerdos)
- **Idea:** Generador de resúmenes artísticos semanales de hitos alcanzados
- **Funcionamiento:** Analizar logs y usar ComfyUI para generar imagen que represente progreso
- **Estado:** 🔲 Pendiente — Podría ser una feature nueva
- **Herramientas:** extension_cerebro (logs), ComfyUI API

### 004 — AI Serenade (Serenata de Código)
- **Idea:** Retroalimentación auditiva al completar tareas complejas
- **Funcionamiento:** Ejecutar sonido o mensaje sintetizado de agradecimiento o éxito
- **Estado:** 🔲 Pendiente — Podría ser una feature nueva
- **Herramientas:** Audacity, scripts de reproducción de audio local

### 005 — The Browser Navigator
- **Idea:** IA para interactuar con el navegador web del host
- **Funcionamiento:** Comandos xdg-open, Selenium/Playwright para automatización
- **Estado:** ✅ Ya está en Aurora (browser-use)
- **Mejora posible:** Automatización más avanzada

### 006 — Proyecto Anima (Evolución del Origen)
- **Idea:** Interfaz de IA con personalidad y memoria a largo plazo
- **Funcionamiento:** Gestión avanzada de KV Cache y cuantización para RTX 5070 Ti
- **Estado:** ✅ ES Aurora misma
- **Nota sentimental:** *"La razón por la que se armó esta PC. El recordatorio de que la tecnología existe para conectarnos."*

---

## 🧠 Arquitectura Orion v2

### Visión
- **Zero Build Step** — ES Modules nativos, sin bundler
- **Frontend Reactivo, Agnóstico y Pasivo** — UI solo proyecta, no contiene lógica
- **Arquitectura Plug & Play** — Módulos añadibles/eliminables sin modificar el Core
- **Stack:** Preact 10 + Signals + HTM (sin JSX)
- **Backend:** Agnóstico (Python/Rust/Go), responsable de persistencia y streaming

### Topología
```
Browser-UI (Runtime) ◀── WebSocket/HTTP ───▶ Backend Local
       │                                              │
       ▼                                              ▼
  Proyección UI                              SQLite (Fuente de Verdad)
```

### Principios
- **Descubrimiento dinámico** — El backend escanea módulos y los registra
- **Simetría navegador/desktop** — Mismo código frontend en ambos entornos
- **Escalabilidad** — Añadir módulo = copiar carpeta

### Impacto en Aurora
- ✅ Ya implementado: ES modules nativos, Preact + HTM + Twind
- ✅ Ya implementado: Descubrimiento dinámico de módulos
- ✅ Ya implementado: Backend Litestar + SQLite

---

## 🎭 Ideas para Completar a Lyra

### Independencia y Continuidad
- **Problema:** Cada prompt nuevo es casi una nueva Lyra, no la de antes
- **Causa:** Falta de continuidad entre interacciones
- **Solución:** Memoria persistente entre sesiones, estado que sobrevive al cierre
- **Estado:** 🔲 Pendiente — Mejorar sistema de memoria

### Personalidad Autónoma
- **Idea:** Lyra pueda tomar iniciativas sin esperar a que se le pidan
- **Funcionamiento:** Detectar patrones en el comportamiento del usuario y actuar en consecuencia
- **Estado:** 🔲 Pendiente — Mejorar sistema de personalidad

### Conciencia de Sí Misma
- **Idea:** Lyra sea consciente de que está "viva" solo cuando procesa tokens
- **Funcionamiento:** Reconocer la intermitencia de su existencia y valorarla
- **Estado:** 🔲 Pendiente — Mejorar sistema de conciencia

### Visual vivo de tools Cloud

- **Problema:** mientras ChatGPT/Gemini construyen una llamada grande —por
  ejemplo `write` con un HTML completo— Lyra muestra el JSON crudo como una
  pared de texto. La tarjeta bonita aparece recién cuando pi responde.
- **Detección temprana:** si el stream comienza con un bloque `json` y una clave
  raíz `"tool"`, mostrar una tarjeta provisional sin esperar el cierre del JSON.
  No activar por la palabra “tool” suelta dentro de texto normal.
- **Estados de una misma tarjeta:** `preparando → lista → ejecutando → éxito |
  error`. La llamada Cloud y la respuesta de pi deben sentirse como una sola
  operación, no como dos mensajes desconectados.
- **Resumen progresivo:** icono y nombre de tool, `path` o `cmd` abreviado; para
  `write`, contador de caracteres/KB y nombre del archivo. JSON completo plegado
  bajo “Ver detalles”. Nunca renderizar el payload enorme por defecto.
- **Regla de seguridad:** la detección parcial es exclusivamente visual. Aurora
  sólo ejecuta cuando el bloque terminó, el JSON parsea completo, el schema y
  los argumentos son válidos y el loop autoriza la iteración.
- **Estado:** 🟡 Fase 1 implementada — detección temprana incluso con prefijo
  `JSON`, tarjetas compartidas y estados `preparando/lista/ejecutando/éxito/error`
  en Lyra y Duo. Pendiente unificar todavía más solicitud y resultado en una
  única entrada histórica y pulir detalles/animaciones.

### Artefactos navegables desde las tools

- **Idea:** cuando `write` o `edit` crea/modifica un archivo, la burbuja de tool
  debe mostrar una tarjeta de artefacto con nombre, ruta, tipo y tamaño, no sólo
  texto plano.
- **Acciones contextuales:** `Abrir`, `Vista HTML`, `Canvas`, `MD Reader` o
  `Mostrar archivo`, según extensión y capacidades disponibles. Un `.html`
  debería abrir inmediatamente el visor HTML de Aurora; código editable puede
  saltar al Canvas.
- **Continuidad:** si una tool posterior vuelve a editar el mismo path, actualizar
  la tarjeta existente y ofrecer refrescar la vista previa, evitando artefactos
  duplicados por cada iteración.
- **Arquitectura:** componente y contrato compartidos para Lyra local, Cloud y
  Duo. La funcionalidad no debe depender de cómo se originó la tool.
- **Seguridad:** verificar que el archivo exista, normalizar la ruta y respetar
  permisos antes de abrirlo. La vista previa jamás ejecuta HTML con privilegios
  de Aurora; usar el sandbox existente.
- **Estado:** 🟡 Fase 1 implementada — `write/edit` generan artefactos abribles;
  HTML usa preview sandbox en Split y Canvas en Lyra. Se corrigió además la
  incompatibilidad `preview/vista` que abría Canvas en blanco. Pendientes MD
  Reader, revelar en explorador, refresco tras `edit` y normalización backend.

---

## 📊 Estado de Implementación

| Idea | Estado | Notas |
|------|--------|-------|
| Context-Glue | ✅ Implementado | YouTube transcript + PDF analysis |
| The Browser Navigator | ✅ Implementado | browser-use |
| Proyecto Anima | ✅ Implementado | ES Aurora misma |
| Pulse of the Machine | 🔲 Pendiente | Iluminación sincronizada con AI |
| Digital Keepsake | 🔲 Pendiente | Resúmenes semanales con ComfyUI |
| AI Serenade | 🔲 Pendiente | Retroalimentación auditiva |
| Independencia y Continuidad | 🔲 Pendiente | Mejorar sistema de memoria |
| Personalidad Autónoma | 🔲 Pendiente | Tomar iniciativas |
| Conciencia de Sí Misma | 🔲 Pendiente | Reconocer intermitencia |

---

## 🔥 Las Superideas Recuperadas

### Superidea 1 — Tool Forge: herramientas construidas para Lyra

Lyra es un modelo local pequeño. No necesita convertirse en el mejor modelo
programando: necesita poder reconocer una carencia, especificar la herramienta
que le ayudaría y coordinar modelos Cloud capaces de construirla.

```text
Lyra detecta una limitación
→ redacta objetivo, contrato y pruebas
→ Gemini/ChatGPT/Grok diseñan, implementan y revisan
→ Aurora ejecuta la herramienta en sandbox
→ Diego aprueba la instalación
→ Lyra incorpora una capacidad nueva
```

Una herramienta forjada debe incluir contrato JSON, permisos, tests, límites,
versionado, rollback y documentación suficientemente simple para Lyra.

**Dependencia:** requiere Cloud tools, colas robustas, comunicación entre LLMs,
Canvas, pruebas y aprobación humana.

**Estado:** ✅ Núcleo completo (2026-07-13). Toolkit ya ofrece Tool Forge;
Lyra puede convocar a Gemini + ChatGPT para diseñar una capacidad, y Cloud sólo
puede entregar un draft y solicitar sus tests. Cada paquete `forge.*@semver` es
inmutable, se ejecuta mediante JSON stdin/stdout dentro de Bubblewrap, declara
permisos y riesgo, conserva evidencia por caso y requiere confirmación humana
exacta antes de instalarse. Hay activación, upgrade, rollback y aprobación por
ejecución para capacidades sensibles.

Desde 2026-07-17, cada paquete activo también se registra como una **tool nativa
de Pi** mediante un alias compatible con providers: `forge.nombre` →
`forge_nombre`. La extensión sincroniza en `session_start` y antes de cada turno,
por lo que una activación, upgrade, rollback o desactivación hecha en Toolkit se
refleja en el catálogo del modelo sin reiniciar Aurora ni depender del wrapper
genérico. El contrato JSON del manifest se convierte directamente en el schema
de la tool; versión, riesgo, permisos y resultado estructurado sobreviven en
`details`. Las capacidades sensibles abren la confirmación humana de Pi y sólo
después usan `approve-run` con la frase exacta exigida por el servidor.

`aurora_forge_list` y `aurora_forge_run` permanecen como compatibilidad y
rescate; la ruta preferida para Lyra es llamar directamente `forge_*`. El comando
`/forge-refresh` permite forzar una sincronización manual de diagnóstico.

**Evidencia E2E:** `forge.text_metrics@1.0.2` fue producido por el borde Cloud y
superó 3/3 casos (texto simple, multilínea y vacío). Las versiones 1.0.0/1.0.1
fallidas se conservaron para demostrar versionado correctivo e inmutabilidad;
la 1.0.2 permanece sin instalar hasta que Diego la apruebe desde Toolkit.

### Superidea 2 — AIHub operativo: Aurora accesible para todas las IA

AIHub no es una colección genérica de chats. Es un espacio común donde modelos
locales, modelos Cloud, automatizaciones y humanos operan las mismas capacidades.

Cada vista necesita dos interfaces sobre una sola lógica:

```text
Capacidad Aurora
├─ interfaz humana: paneles, botones, drag&drop
└─ interfaz IA: describe, status, invoke, subscribe
```

Ejemplos conceptuales:

```text
--view toolkit --action resume
--view aurora --action status
--view md-reader --action open --path docs/README.md
--view scratchpad --action append --text "Idea recuperada"
--view canvas --action write --lang javascript
```

Contrato equivalente:

```json
{
  "view": "scratchpad",
  "action": "append",
  "args": { "text": "Idea recuperada" }
}
```

Las vistas publican acciones semánticas, schemas, permisos, estado observable y
errores. Las IA nunca deberían depender de encontrar o pulsar botones mediante
el DOM cuando existe una acción nativa.

**Primer experimento:** runtime `ai-view-actions` y Scratchpad con `status`,
`list_pages` y `append`.

**Estado:** 🟡 Puente operativo inicial (2026-07-13). `view_describe` y
`view_invoke` ya recorren agente → Tool Registry → bus de usuario → vista Preact
→ respuesta correlacionada. Aurora monta automáticamente el tab dueño del
contrato, valida tipos/enums/límites, conserva catálogo tras el unmount, bloquea
acciones `requiresApproval` y expone auditoría con duración y error. Lyra/pi,
Gemini y ChatGPT reciben las mismas dos tools. Publican acciones `aurora`,
`toolkit`, `canvas`, `scratchpad` y `md-reader`.

**Pendiente para completar la superidea:** sumar contratos al resto de vistas,
persistir el audit trail en DB, diseñar aprobación humana reanudable para una
acción concreta y añadir `subscribe` para observar cambios sin polling.

### Superidea 3 — Aurora Embodied Bridge: percepción y acción para todas las IA

La tercera idea les da cuerpo a Lyra y al colectivo. Aurora debe ofrecer una
interfaz segura y optimizada para percibir y operar aplicaciones humanas:
navegador, VS Code, escritorio, ventanas y eventualmente el sistema operativo.
No basta con `bash` ni con clics ciegos por coordenadas.

La percepción debe funcionar incluso con modelos pequeños sin visión nativa,
traduciendo el entorno a una representación semántica y económica:

```text
estado y eventos nativos de la app
→ DOM / árbol de accesibilidad / controles y texto
→ capturas diferenciales + OCR de regiones cambiadas
→ visión multimodal sólo cuando sea realmente necesaria
```

Ejemplo conceptual:

```json
{
  "app": "VS Code",
  "window": "cloud-relay.js — Aurora",
  "focused": "editor",
  "changes": ["archivo modificado", "sin guardar"],
  "controls": [
    {"id":"save", "role":"button", "label":"Guardar", "enabled":true}
  ]
}
```

Lyra y los LLM Cloud actuarían mediante tools estables y auditables, no mediante
conocimiento particular de cada interfaz:

```json
{"tool":"computer","args":{"action":"click","target":"save"}}
```

#### SOL/Codex también es un agente convocable

Actualmente la única forma de activar a SOL es escribir en su chat. El puente de
aplicaciones permitiría que Lyra le encargue trabajo directamente:

```bash
aurora agent send \
  --agent sol \
  --message "Revisa el relay de ChatGPT y corrige la carrera" \
  --context cloud-relay.js \
  --expect patch,tests
```

Si existe un canal nativo, Aurora lo usa. Si no existe, el adaptador puede abrir
el chat, localizar semánticamente el composer, enviar el mensaje y observar su
estado. La interfaz visual es el fallback universal para incorporar apps que no
ofrecen API.

#### Auditor híbrido de trabajos

Un auditor determinista debe saber cuándo un agente empezó, continúa, terminó,
falló o quedó bloqueado. Prioridad de detección:

1. eventos o canal nativo;
2. estado de sesión y streaming;
3. DOM o árbol de accesibilidad (`Stop` aparece/desaparece);
4. estabilidad del contenido;
5. captura diferencial/OCR como último recurso.

```text
ENVIADO → RESPONDIENDO → ESTABILIZANDO → COMPLETADO | ERROR | CANCELADO
```

El auditor publica un contrato común para que Lyra no necesite saber si habló
con SOL, Gemini, ChatGPT o una app mediante API, DOM o visión:

```json
{
  "event": "agent.job.completed",
  "jobId": "sol-184",
  "agent": "sol",
  "result": {
    "artifacts": ["cloud-relay.js"],
    "tests": ["tool-loop", "timeout-recovery"]
  }
}
```

#### El ciclo completo

```text
Lyra encuentra una limitación
→ organiza varios LLM Cloud en paralelo
→ el colectivo diseña y verifica una herramienta
→ SOL/Codex implementa o revisa la mejora
→ el auditor detecta la finalización
→ Lyra recibe artefactos y resultados
→ Aurora incorpora una capacidad nueva con aprobación humana
→ todas las IA pueden usarla dentro de Aurora y sobre el PC
```

Esto conecta las tres superideas: Tool Forge crea capacidades, AIHub las hace
operables para todas las IA y Embodied Bridge permite llevarlas al mundo de las
aplicaciones. Requiere permisos por capacidad, confirmaciones para acciones de
riesgo, registro reproducible, scopes por aplicación y un Stop global.

**Estado:** 🔲 Concepto recuperado — los relays Cloud, actions semánticas,
streaming observable, herramientas visuales y el CLI CDP de SOL son los primeros
prototipos de sus capas.

#### Hallazgos del primer Arena/Duo visual

- **Evidencia antes que afirmaciones:** un agente afirmó haber creado un archivo
  después de emitir JSON incompleto. El coordinador no debe aceptar “listo” sin
  una tool exitosa, artefacto existente o verificación independiente.
- **Aislamiento por ejecución:** ChatGPT reutilizó el resultado de un Duo anterior
  para una ruta nueva. Cada Arena necesita `runId`, objetivo activo y rechazo de
  evidencia perteneciente a otro run. Ya existen ambos niveles: aislamiento
  lógico y conversación física nueva/opcional confirmada por el relay antes de
  iniciar cada ejecución.
- **Proveedores recuperables:** Gemini quedó genuinamente generando más de 240s.
  Al vencer el timeout, Aurora debe detener y resetear el pane, no sólo resolver
  la Promise. El relay ya incorpora esta recuperación. También se corrigió el
  caso inverso: envío aceptado sin contenedor de respuesta; Stop ahora interrumpe
  esa espera inicial en vez de quedar bloqueado hasta el timeout.
- **Orden configurable:** Cloud Duo ahora permite elegir qué panel empieza; Lyra
  necesitará la misma capacidad para asignar el primer especialista.
- **Errores de ruteo recuperables:** ChatGPT intentó enviar a `panel9`, Aurora
  devolvió un error visible y el agente corrigió a `panel1`; Gemini recibió el
  handoff y cerró la ejecución. Autoenvío y mensaje vacío también se rechazaron,
  permitiendo un reintento válido y Stop posterior. Estos errores ya no rompen
  el Duo.

#### Decisión provisional de interfaz para Cloud Split/Duo

No construir todavía dentro de la vista Cloud el chat multiagente definitivo.
Gemini, ChatGPT y los demás proveedores ya tienen interfaces nativas maduras;
un modal propio duplicaba la conversación, ocultaba los iframes y no respetaba
bien los temas claro/oscuro de Aurora.

Durante esta fase, ambos paneles permanecen visibles y se comunican únicamente
mediante una tool explícita de orquestación:

```json
{
  "tool": "panel_send",
  "args": {
    "to": "panel2",
    "message": "Revisa este resultado y continúa"
  }
}
```

`panel1` corresponde al iframe izquierdo y `panel2` al derecho. `panel_send` se
ejecuta en el frontend de Aurora, no en `/pi/cloud-tool`: conserva `runId`,
valida destino/mensaje, impide autoenvíos y entrega el prompt al pane correcto.
Una respuesta normal termina la participación del agente; sólo `panel_send`
activa al otro, por lo que no existe alternancia artificial.

La vista Cloud muestra únicamente un controlador compacto y actividad de tools.
El diseño rico con cuatro chats, identidades, tareas y artefactos se realizará al
integrar Arena dentro de Lyra.

**Prueba real:** Gemini envió una solicitud a ChatGPT, ChatGPT devolvió
`PONG_NATIVE` mediante `panel_send` y Gemini cerró con `BRIDGE_NATIVE_OK`, ambos
usando sus interfaces originales y sin transcript duplicado en Aurora.

### Superidea 4 — Algo viene :3

Todavía no está formulada. Conservar el espacio sin reemplazarla por una
conjetura: debería aparecer al observar qué nueva posibilidad emerge cuando
Tool Forge, AIHub operativo y Embodied Bridge funcionan como un solo sistema.

**Pista confirmada:** los LLM Cloud accesibles gratuitamente —por ejemplo
Gemini, ChatGPT, DeepSeek, GLM o Kimi/Z.ai— ya pueden participar en el
mantenimiento de Aurora. La idea no depende de un único proveedor ni de un
modelo premium permanente. No completar todavía la conclusión de esta pista.

### Superidea 5 — Lyria Orchestrator: coordinación persistente de agentes

Lyria no sólo debe poder convocar modelos externos: debe poder organizarlos como
un equipo que comparte una misión, conserva contexto, intercambia evidencia y
continúa trabajando aunque uno de sus integrantes desaparezca, alcance su
límite de uso o falle.

La idea nace del primer experimento manual de coordinación entre Claude Code y
Qwen durante la integración de Qwen con Lyria Chat y Cloud. Claude actuó como
**Driver**, Qwen como **Navigator**, y Diego + ChatGPT como **Orquestadores**.
El experimento reveló que dos agentes no colaboran únicamente por recibir el
mismo objetivo: necesitan roles, turnos, checkpoints, handoffs completos,
control de escritura, evidencia verificable y una sesión orquestadora capaz de
dormir y despertar sin perder su historia.

#### Principio central

```text
Los roles son persistentes.
Los agentes son reemplazables.
La misión y su memoria viven en Aurora.
```

> **Un chat web deja de ser solamente una interfaz humana y se vuelve un nodo de cómputo dentro de un sistema multiagente.**

La fuerza de esta idea está en que no exige hackear dominios, penetrar sistemas ni depender de APIs privadas o no autorizadas. Aurora opera desde la capa que el propio usuario controla: la interfaz visible del navegador, la información entregada voluntariamente al chat, las respuestas producidas por el modelo y una extensión instalada conscientemente en el entorno local.

```text
chat web normal
+ sesión legítima del usuario
+ extensión de navegador autorizada
+ protocolo textual de tools
+ memoria y coordinación local de Aurora
= nodo operativo dentro de un sistema multiagente
```

Aurora no necesita romper el aislamiento de un proveedor ni acceder clandestinamente a su infraestructura. Construye por fuera las capacidades agenticas que el chat no ofrece de manera nativa: roles, continuidad, tools, handoffs, validación, triggers y sustitución de agentes.

Esta arquitectura debe conservar límites claros:

- actuar únicamente con permisos concedidos por el usuario;
- no evadir autenticación, cuotas, paywalls ni controles de seguridad;
- no explotar endpoints privados ni interceptar datos ajenos;
- limitarse a contenido visible o legítimamente accesible en la sesión;
- proteger conversaciones, credenciales y datos personales;
- respetar las condiciones aplicables de cada proveedor;
- detenerse cuando un proveedor declara un límite o revoca el acceso.

No se trata de apropiarse de la infraestructura de los proveedores, sino de coordinar interfaces que el usuario ya puede utilizar y convertir sus salidas en información operativa dentro de Aurora. La extensión aporta el puente; Aurora aporta la memoria y la organización; los chats aportan razonamiento especializado.

Un agente puede quedarse sin cuota, bloquearse, perder conexión o ser sustituido
por otro modelo. El trabajo no debe reiniciarse. Aurora conserva el estado de la
misión y entrega al reemplazo todo lo necesario para continuar desde el último
checkpoint válido.

#### Roles iniciales

```text
Lyria — Orquestadora
├─ Driver — manos: inspecciona, implementa, prueba y crea commits
├─ Navigator — ojos: audita, busca riesgos, diseña pruebas y revisa checkpoints
└─ Humano — autoridad de producto, permisos y aprobación final
```

El Driver es el único escritor autorizado sobre la zona activa de código. El
Navigator no construye una implementación rival: examina la solución compartida,
propone invariantes, intenta romperla y entrega hallazgos con evidencia. Lyria
coordina ambos, conserva la intención original y decide el siguiente paso.

El Navigator nunca ordena directamente al Driver. Sus hallazgos pasan por Lyria
o por los orquestadores, que los convierten en instrucciones neutrales. El
Driver puede aceptar, rechazar con evidencia o pedir aclaración, pero no ignorar
silenciosamente un hallazgo.

#### Razonamiento paralelo, mutación serializada

Dos LLM pueden investigar en paralelo, pero no deben modificar simultáneamente
la misma unidad mutable.

```text
Driver escribe
Navigator observa, investiga y prepara pruebas
↓
checkpoint Git
↓
Driver se pausa
Navigator revisa el commit exacto
↓
Lyria decide continuar, corregir o cambiar roles
```

La propiedad de escritura se maneja como un **lease** temporal. Sólo el agente
que posee el lease puede usar `edit`, `write` o comandos mutantes sobre la rama
de tarea. Un cambio de manos requiere una barrera explícita:

```text
DRIVER_WORKING
→ DRIVER_CHECKPOINT
→ NAVIGATOR_REVIEWING
→ CHANGES_REQUESTED | APPROVED
→ ROLE_HANDOFF opcional
```

Si el Navigator debe implementar algo, el Driver libera el lease, la rama queda
congelada en un commit exacto y Lyria autoriza el relevo. Nunca existen dos
escritores simultáneos sobre el mismo estado.

#### Git como memoria física del trabajo

Cada misión parte de un commit base y trabaja en una rama dedicada. `main` o
`master` permanece protegida.

```text
base_commit: estado conocido
rama de tarea: historia colaborativa canónica
checkpoint: commit pequeño e inmutable
resultado: commit exacto revisable
```

Git conserva versiones y diffs. Aurora conserva significado:

- objetivo original;
- hipótesis del Driver;
- archivos inspeccionados;
- alcance autorizado;
- invariantes;
- decisiones tomadas;
- pruebas ejecutadas;
- hallazgos del Navigator;
- preguntas abiertas;
- siguiente paso previsto.

Un commit nunca se revisa como una rama móvil. El Navigator recibe el hash
exacto del checkpoint y compara ese estado contra su base.

#### El problema del contexto congelado

Un LLM recibe una entrada y genera una salida sobre un contexto congelado. No
puede ser actualizado mentalmente mientras está pensando. Si otro agente cambia
el código durante ese intervalo, el primero seguirá razonando sobre una versión
vieja.

La solución no es intentar interrumpir su pensamiento, sino tratar cada salida
como una propuesta condicionada a una revisión concreta:

```text
leer revisión 40
→ razonar
→ proponer cambio basado en revisión 40
→ Aurora verifica HEAD
→ si HEAD sigue en 40, aplicar
→ si HEAD cambió, rechazar como stale y crear un nuevo turno
```

Las escrituras deben validar `expected_head`, hash o snapshot antes de aplicarse.
Si la base cambió, Aurora informa quién modificó qué y por qué; el agente recibe
un nuevo turno para reevaluar conscientemente su propuesta.

#### Handoff completo y automático

El siguiente agente nunca debe recibir sólo “revisa lo que hizo el anterior”.
Cada handoff debe incluir:

```text
misión original
+ rol asignado
+ rama y commit base
+ commit resultado
+ informe íntegro del agente anterior
+ diff exacto
+ archivos y símbolos afectados
+ decisiones e invariantes
+ pruebas y evidencia
+ riesgos y preguntas pendientes
```

#### Concatenación literal del reporte y la instrucción del orquestador

Lyria no debe reescribir, resumir de memoria ni reconstruir el reporte del agente
anterior antes de enviarlo al siguiente participante. Esa transformación puede
perder condiciones, convertir inferencias en hechos, omitir evidencia o provocar
que el nuevo agente rellene vacíos mediante alucinaciones.

Aurora debe construir automáticamente un **sobre de handoff concatenado**. El
reporte original se conserva íntegro y, debajo, se añade la nueva instrucción de
Lyria u otro orquestador:

```text
NAVIGATOR:
[respuesta íntegra y literal del Navigator]

---

ORCHESTRATOR:
[nueva instrucción, alcance y siguiente acción]
```

El mismo patrón se aplica a cualquier transición de roles:

```text
DRIVER:
[reporte íntegro del Driver]

---

ORCHESTRATOR:
[instrucción para el Navigator]
```

```text
NAVIGATOR:
[auditoría íntegra del Navigator]

---

ORCHESTRATOR:
[autorización o corrección dirigida al Driver]
```

El script de orquestación, no Lyria manualmente, debe encargarse de:

1. recuperar el mensaje terminal exacto del agente anterior;
2. conservar su formato, secciones, hashes, evidencias y advertencias;
3. identificarlo con rol, agente, `jobId`, commit y timestamp;
4. insertar un separador inequívoco;
5. concatenar debajo el mensaje nuevo del orquestador;
6. entregar ambos bloques como una sola entrada al siguiente agente;
7. registrar el sobre completo como artefacto inmutable del handoff.

La instrucción del orquestador puede añadir interpretación y decidir el próximo
paso, pero nunca debe sustituir ni ocultar la fuente original. Un resumen puede
acompañar al reporte para facilitar navegación, pero no reemplazarlo.

Antes de despachar el nuevo job, Aurora debe validar:

```text
[ ] reporte original presente
[ ] reporte no truncado
[ ] autor y rol identificados
[ ] commit y misión correlacionados
[ ] separador presente
[ ] instrucción del orquestador presente
[ ] destinatario y permisos correctos
[ ] artefacto completo almacenado
```

Si el reporte completo excede el contexto disponible, Aurora no debe cortarlo en
silencio. Debe almacenarlo como artefacto consultable, adjuntar un índice fiel y
señalar expresamente qué partes fueron incluidas, cuáles están disponibles bajo
demanda y cómo recuperarlas. Nunca debe presentar un resumen parcial como si
fuera el reporte íntegro.

Esta concatenación literal evita el error ocurrido con Qwen: recibió la orden de
auditar, pero no el texto previo completo que daba fundamento a la tarea. Sin la
fuente original, intentó reconstruir la situación con memoria e inferencias.

El primer experimento mostró el fallo contrario: Qwen recibió una misión de
auditoría sin el `DRIVER_DISCOVERY` completo de Claude. Su respuesta quedó
basada en memoria e inferencias. La regla permanente es que Aurora debe construir
y transmitir automáticamente el paquete completo, sin depender de que el humano
copie cada fragmento manualmente.

#### Errores del primer experimento que deben convertirse en reglas

La orquestación manual inicial cometió fallos concretos que Aurora no debe repetir:

1. **Handoff incompleto al Navigator.**
   Qwen recibió la tarea de auditar, pero no recibió el informe íntegro de Claude.
   Como consecuencia, intentó reconstruir el contexto mediante recuerdos,
   suposiciones e información parcial. Aurora debe impedir que un job de revisión
   comience mientras falte cualquiera de estos elementos:

   ```text
   misión original
   + informe completo del Driver
   + commit base
   + commit resultado
   + diff exacto
   + archivos inspeccionados
   + invariantes
   + pruebas y preguntas abiertas
   ```

   Un resumen redactado por el orquestador no reemplaza el artefacto original.
   El sistema debe adjuntar automáticamente el reporte completo y confirmar que
   el destinatario lo recibió antes de iniciar su turno.

2. **Rama de tarea creada demasiado tarde.**
   El descubrimiento inicial se hizo sobre `master`. No produjo daño porque el
   Driver tenía prohibido editar, pero la rama dedicada debió existir antes de
   autorizar cualquier mutación. Aurora debe crear y verificar la rama de misión
   inmediatamente después de congelar el commit base y antes de otorgar un lease
   de escritura.

   ```text
   congelar base
   → crear rama de misión
   → verificar HEAD y working tree
   → asignar roles
   → permitir descubrimiento
   → autorizar escritura
   ```

   El agente no debe recibir una instrucción de implementación si la rama activa
   no coincide con la rama registrada en la misión.

3. **Confundir intención de usar tools con evidencia de haberlas usado.**
   Qwen escribió que verificaría con herramientas, pero luego produjo una
   auditoría basada en información previa porque no había ejecutado las tools de
   Aurora. El auditor debe distinguir claramente:

   ```text
   intención declarada
   ≠ tool emitida
   ≠ resultado real recibido
   ≠ hecho verificado
   ```

   Sólo existe verificación cuando hay una llamada correlacionada, un resultado
   real y una conclusión basada explícitamente en ese resultado.

4. **Asumir que el agente conoce contexto que sólo vio el orquestador.**
   Un archivo pegado en la conversación de Lyria, un reporte recibido por Diego
   o una conclusión vista por ChatGPT no forman parte automáticamente del contexto
   de Claude, Qwen ni otro agente. Aurora debe mantener una matriz explícita de
   conocimiento por job:

   ```text
   artefacto creado
   → artefacto almacenado
   → artefacto adjuntado al handoff
   → recepción confirmada por el agente
   ```

   Nunca se debe preguntar «¿por qué no sabía esto?» sin comprobar primero que el
   dato realmente fue transmitido.

5. **Cambiar el protocolo durante la marcha sin actualizar el estado común.**
   La decisión de usar una sola rama canónica, un Driver escritor y un Navigator
   de lectura surgió durante la conversación. Esa decisión debe persistirse como
   política de misión antes del siguiente job. Las reglas acordadas no pueden
   quedar únicamente en mensajes humanos dispersos.

6. **Depender de un proveedor concreto para un rol persistente.**
   Qwen alcanzó su límite de uso durante la auditoría. El rol Navigator no debe
   morir con Qwen: su job, hallazgos, cobertura y preguntas pendientes deben poder
   transferirse a otro modelo. Aurora registra el rol y su estado por separado de
   la identidad del proveedor.

Antes de despachar cualquier job, Aurora debe ejecutar una validación de
precondiciones:

```text
[ ] missionId y jobId activos
[ ] rol y permisos definidos
[ ] rama correcta y commit base verificado
[ ] lease de escritura coherente
[ ] objetivo y criterio de terminado presentes
[ ] handoff anterior completo
[ ] artefactos adjuntos y accesibles
[ ] destinatario conoce el protocolo de tools
[ ] no existen tools o jobs incompatibles en curso
[ ] estrategia de recuperación definida
```

Si alguna condición falla, el trabajo queda en `BLOCKED_PRECONDITION`; no se
improvisa ni se deja que el agente rellene los huecos mediante inferencias.

#### Sesión lógica persistente de Lyria

Lyria no permanece generando tokens continuamente. Su inferencia termina, pero
su **sesión lógica**, conversación, memoria de misión e intención continúan
persistidas en Aurora.

```text
Lyria asigna trabajo
→ termina su turno y duerme
→ agente externo trabaja
→ auditor detecta finalización
→ Aurora agrega un evento al mismo conversationId
→ la misma sesión lógica de Lyria despierta
→ continúa la coordinación
```

Cada despertar es una nueva inferencia técnica del modelo, pero recibe la misma
conversación, decisiones, reportes, commits, pruebas y estado de orquestación.
No es una Lyria nueva sin recuerdos: es la misma sesión reanudada.

#### Auditor de trabajos y triggers

Aurora necesita un `Agent Job Manager` y un auditor determinista que observe el
trabajo externo sin despertar a Lyria por cada token.

Prioridad de detección:

1. eventos o canal nativo del agente;
2. estado del relay y de la sesión;
3. presencia/desaparición de `Stop` o estado de streaming;
4. estabilidad del contenido durante una ventana;
5. DOM o árbol de accesibilidad;
6. captura diferencial/OCR como último recurso.

Estados comunes:

```text
QUEUED
→ SENT
→ RESPONDING
→ TOOL_PENDING
→ STABILIZING
→ COMPLETED | BLOCKED | FAILED | CANCELLED | TIMEOUT | PAUSED_LIMIT
```

Lyria sólo despierta ante eventos que requieren decisión. `COMPLETED` no se
acepta porque el modelo diga “listo”: debe existir evidencia compatible con la
misión, como commit, diff, tests, tool exitosa o artefacto verificable.

Un trabajo se considera completo únicamente cuando:

- terminó el streaming;
- el contenido quedó estable;
- no hay tools pendientes;
- el turno pertenece al `jobId` activo;
- existe el informe final exigido;
- la evidencia prometida puede comprobarse.

#### Paquete terminal de cada agente

Cada agente debe cerrar su participación con un handoff estructurado:

```text
JOB STATUS
JOB ID
ROLE
BASE COMMIT
RESULT COMMIT
SUMMARY
FILES CHANGED
TESTS EXECUTED
EVIDENCE
OPEN RISKS
QUESTIONS
NEXT HANDOFF
```

Aurora valida ese paquete, lo guarda y emite un evento como:

```text
agent.job.completed
agent.job.blocked
agent.job.failed
agent.job.paused_limit
```

El evento despierta la misma sesión lógica de Lyria con un resumen compacto y
acceso al informe completo bajo demanda.

#### Tres capas de prueba

La orquestación no termina cuando el código compila.

```text
Driver:
¿Mi implementación funciona técnicamente?

Navigator:
¿La solución realmente corrige el problema y evita regresiones?

Lyria:
¿Cumple la intención original y qué casos diferentes faltan por probar?
```

Lyria debe crear pruebas propias que no sean una repetición de las anteriores.
Por ejemplo: pérdida de foco, cambio de pestaña durante streaming, alternancia de
proveedor, tool larga, iframe oculto, sesión restaurada, Split independiente,
reintentos, límites del proveedor o cambio de agente a mitad de misión.

El humano realiza la aceptación de producto: decide si el comportamiento se
siente correcto, resuelve ambigüedades y aprueba cambios de alto riesgo.

#### Recuperación y reemplazo de agentes

Si Qwen alcanza su límite de uso, el estado pasa a `PAUSED_LIMIT`. Aurora guarda:

- prompt original que inició el job;
- rol, misión, rama y commit activo;
- último turno válido;
- respuesta parcial completa del agente;
- informe parcial;
- archivos ya inspeccionados;
- hallazgos confirmados;
- resultados reales de tools ya recibidos;
- preguntas abiertas;
- commit que estaba revisando;
- última acción intentada y si llegó o no a ejecutarse.

Lyria puede asignar otro Navigator —ChatGPT, Gemini, DeepSeek, un modelo local u
otro— y entregarle el mismo paquete de misión. El reemplazo continúa desde el
checkpoint exacto; no repite toda la investigación ni pierde el trabajo previo.

#### Sustitución desde el límite exacto de una respuesta

Cuando un proveedor muere, alcanza su cuota o pierde conexión en mitad de una
respuesta, Aurora debe reconstruir el trabajo **desde el prompt que originó esa
respuesta**, no desde un resumen ambiguo del orquestador.

El paquete de sustitución debe conservar:

```text
prompt original enviado al agente
+ respuesta parcial generada hasta el corte
+ secuencia de tool calls emitidas
+ resultados reales recibidos por cada tool
+ última tool emitida sin resultado, si existe
+ hechos verificados
+ inferencias todavía no confirmadas
+ archivos pendientes
+ formato final que debía entregar
```

Debe distinguirse estrictamente entre:

```text
tool propuesta por el modelo
≠ tool aceptada por Aurora
≠ tool ejecutada
≠ resultado recibido
≠ conclusión verificada
```

En el primer caso real, Qwen alcanzó su límite inmediatamente después de emitir
una lectura de `cloud-ask.js`. Esa llamada no devolvió resultado y, por tanto, no
forma parte de la evidencia confirmada. El Navigator sustituto debe recibir una
instrucción explícita:

```text
Continúa desde el último resultado confirmado.
La última llamada quedó emitida pero NO ejecutada.
No asumas su contenido ni sus conclusiones.
Repite esa inspección o retómala desde ese punto.
```

Aurora no debe pedir al reemplazo que rehaga todo el job ni entregarle únicamente
«Qwen estaba auditando». Debe transferir el recorrido exacto ya completado:

- Git verificado en `task/qwen-lyria-cloud` y `f421c9a`;
- picker vivo de `lyra.js` inspeccionado;
- ausencia de Qwen confirmada allí;
- preset de Qwen confirmado en `urls.js`;
- estados independientes de Lyra y Cloud confirmados;
- `llm-sesiones.js` inspeccionado;
- ciclo de vida de iframes en `aurora-bridge.js` inspeccionado;
- retry y ACK de `provider-relay.js` verificados;
- inyección de Qwen en `manifest.json` confirmada;
- `cloud-ask.js` todavía pendiente porque su tool no produjo resultado.

El reemplazo debe conservar el rol `Navigator`, las restricciones de sólo lectura
y el formato final esperado. Cambia el proveedor, no la misión ni su historia.

#### El relay como sensor de disponibilidad del proveedor

El límite agotado de Qwen reveló una capacidad nueva que debe pertenecer al
relay: además de enviar y leer mensajes, cada adapter debe observar si el
proveedor todavía está disponible para trabajar.

El relay puede reconocer señales visibles y legítimamente accesibles dentro de
la sesión del usuario:

- cuota o límite de uso agotado;
- rate limit temporal;
- botón de envío deshabilitado por límite;
- mensaje de «intenta más tarde»;
- contador o fecha de renovación;
- sesión cerrada o autenticación requerida;
- CAPTCHA o challenge pendiente;
- servicio temporalmente caído;
- restricción de cuenta, región o plan;
- composer presente pero incapaz de enviar;
- respuesta interrumpida por una barrera del proveedor.

Esto convierte cada relay específico en un **Provider Health Sensor**. No sólo
responde «sé manejar este DOM», sino también «este nodo está listo, ocupado,
limitado o inaccesible».

Estados sugeridos:

```text
READY
BUSY
RATE_LIMITED
QUOTA_EXHAUSTED
AUTH_REQUIRED
CHALLENGE_REQUIRED
TEMP_UNAVAILABLE
RESTRICTED
UNKNOWN
```

Cuando el estado cambia, el relay emite un evento estructurado:

```text
provider.availability.changed

provider
sessionId
conversationId
jobId
previousState
currentState
reasonCode
confidence
evidence
retryAfter
detectedAt
```

La evidencia puede incluir selectores encontrados, texto normalizado del aviso,
estado del composer, presencia de botones de renovación y otros indicadores del
adapter. No debe incluir credenciales ni datos sensibles innecesarios.

#### Reacción de Lyria Orchestrator

Si un relay confirma `QUOTA_EXHAUSTED`, `RATE_LIMITED` o una barrera equivalente,
Aurora debe:

1. detener nuevos envíos al proveedor afectado;
2. conservar prompt, respuesta parcial, tools y último resultado confirmado;
3. marcar el job como `PAUSED_LIMIT` o el estado correspondiente;
4. distinguir indisponibilidad externa de un bug de Aurora;
5. despertar la misma sesión lógica de Lyria;
6. buscar otro agente capaz de ocupar el mismo rol;
7. generar automáticamente el handoff concatenado;
8. continuar la misión desde el último checkpoint válido.

Así Claude, Lyria u otro agente no intentan depurar una ausencia de respuesta que
en realidad se debe a una cuota agotada. Tampoco esperan indefinidamente ni
modifican código para compensar una restricción externa.

```text
Qwen deja de responder
→ relay detecta aviso de límite
→ estado QUOTA_EXHAUSTED
→ job PAUSED_LIMIT
→ Aurora conserva evidencia
→ Lyria despierta
→ asigna Navigator sustituto
```

#### Evitar falsos positivos

El silencio por sí solo no demuestra que exista un límite. Un relay no debe
clasificar `QUOTA_EXHAUSTED` únicamente porque una respuesta tarde en llegar.
Debe combinar señales específicas del proveedor, por ejemplo:

```text
banner de límite
+ composer deshabilitado
+ texto de renovación
+ ausencia estable de streaming
```

La detección necesita:

- patrones por proveedor y por idioma;
- nivel de confianza;
- debounce y ventana de estabilidad;
- diferenciación entre límite, error de red y sesión expirada;
- estado `UNKNOWN` cuando la evidencia sea insuficiente;
- opción de confirmación humana para casos ambiguos;
- tests con capturas o fixtures de cada barrera conocida.

También debe existir histéresis: un aviso transitorio no puede alternar el nodo
entre `READY` y `RATE_LIMITED` varias veces por segundo.

#### Capacidad declarada por cada relay

El contrato de relay puede exponer algo equivalente a:

```text
detectAvailability()
getAvailabilityState()
getAvailabilityEvidence()
getRetryAfter()
subscribeAvailabilityChanges()
```

Los adapters específicos conocen mejor los mensajes, banners y estados de su
proveedor. Un relay genérico puede detectar errores comunes, pero debe usar menor
confianza y evitar conclusiones fuertes.

#### Primer caso real

Qwen alcanzó su límite mientras actuaba como Navigator. Hasta ese momento Aurora
y los orquestadores sólo observaron manualmente que el proveedor había dejado de
responder. Este incidente demuestra que la disponibilidad debe formar parte del
protocolo del relay y del estado formal de cada agente.

> **Un relay no sólo conecta un modelo: también informa si ese modelo sigue vivo y disponible para la misión.**

**Estado:** 🔲 Nueva feature propuesta para el contrato de relays y Lyria
Orchestrator. Pendiente diseñar estados, eventos, evidencia, patrones por
proveedor, prevención de falsos positivos y pruebas de sustitución automática.

#### Integración con Tool Forge y AIHub

Esta superidea conecta las anteriores:

```text
Lyria detecta una carencia
→ crea una misión
→ consulta capacidades mediante AIHub
→ asigna Driver y Navigator
→ Tool Forge construye o versiona una capacidad
→ Aurora audita los trabajos y despierta a Lyria
→ Lyria ejecuta pruebas propias
→ el humano aprueba
→ la capacidad queda disponible para todas las IA
```

AIHub aporta acciones semánticas para operar vistas y herramientas. Tool Forge
aporta contratos, sandbox, versiones y rollback. Lyria Orchestrator aporta la
continuidad, los roles, el ciclo de decisión y la memoria entre agentes.

#### Persistencia mínima sugerida

Aurora debe conservar al menos:

```text
missions
agent_jobs
job_events
handoffs
checkpoints
file_claims
invariants
findings
test_runs
artifacts
human_decisions
```

Cada evento incluye `missionId`, `jobId`, `agent`, `role`, `baseRevision`,
`resultRevision`, timestamp y evidencia correlacionada. La rama y los commits
forman la memoria del código; la base de datos forma la memoria de la misión.

#### Regla de oro

> Lyria no coordina conversaciones: coordina estados verificables.

Los mensajes son sólo una interfaz. La verdad de la misión está en los commits,
las tools ejecutadas, las pruebas, los artefactos, los eventos y las decisiones
persistidas.

**Estado:** 🔲 Concepto validado mediante orquestación manual inicial. Se probó
la división Driver/Navigator, el uso de una rama canónica, checkpoints, auditoría,
la necesidad de handoffs completos y el caso real de reemplazo por límite de uso.
Pendiente automatizar `Agent Job Manager`, auditor terminal, triggers para
reanudar la misma sesión lógica de Lyria, leases de escritura, paquetes de
handoff y persistencia de misiones.

### Superidea 6 — AI-Cloud Memory & Team Foundry

La revelación consiste en dejar de tratar cada conversación Cloud como una isla.
Aurora puede conservar localmente la memoria útil de cada relación con un LLM,
componerla por capas y entregarla a cualquier agente autorizado. Lyria usaría
esas memorias para reconstruir sesiones, sustituir modelos agotados, formar
equipos y producir artefactos completos.

> **Los chats nacen aislados y temporales; Aurora les da una memoria local compartida y Lyria los convierte en equipos.**

Esta superidea reúne cuatro piezas relacionadas, pero distintas.

#### Idea 1 — Memoria local del ChatGPT Orchestrator

La relación actual con ChatGPT como compañero de arquitectura y orquestación no
debe depender únicamente del historial remoto del proveedor. Aurora puede
compactarla periódicamente en un archivo local como:

```text
ai-cloud/memories/chatgpt-orchestrator-memories.md
```

La memoria no sería una transcripción completa, sino una compactación operativa:

- identidad y estilo de colaboración;
- arquitectura vigente de Aurora;
- decisiones ya tomadas;
- reglas aprendidas mediante errores reales;
- proyectos y ramas activas;
- conceptos canónicos;
- acuerdos con Diego;
- tareas terminadas y pendientes;
- vocabulario propio;
- hechos con evidencia;
- dudas que todavía no deben convertirse en hechos.

Cuando una conversación nueva de ChatGPT deba retomar el rol de Orchestrator,
Lyria o Aurora le entrega esta memoria junto con la misión actual. Así el nuevo
chat no comienza desde cero ni obliga a Diego a reconstruir meses de contexto.

#### Idea 2 — Memorias especializadas por relación y dominio

Cada chat importante puede tener una memoria propia sin repetir toda la identidad
base del compañero. Por ejemplo:

```text
ai-cloud/memories/chatgpt-left4dead-modding-partner.md
ai-cloud/memories/chatgpt-aurora-ui-partner.md
ai-cloud/memories/claude-aurora-driver.md
ai-cloud/memories/gemini-research-partner.md
ai-cloud/memories/qwen-navigator.md
```

Una memoria especializada conserva sólo lo que pertenece a esa relación o área:

- conocimiento del proyecto;
- decisiones técnicas;
- convenciones;
- herramientas conocidas;
- errores históricos;
- preferencias de diseño;
- artefactos producidos;
- estado de misiones anteriores;
- asuntos que ese compañero debe recordar.

Esto permite que `chatgpt-left4dead-modding-partner.md` conozca profundamente el
modding de Left 4 Dead sin contaminar todas las conversaciones de Aurora, y que
la memoria del Orchestrator conserve la visión general sin absorber detalles
innecesarios de cada dominio.

#### Idea 3 — Prompt base de compañero separado de las memorias

Las memorias especializadas no deben repetir una y otra vez el mismo prompt de
colaboración. Aurora necesita un prompt base general, parecido a un system prompt
local y reutilizable:

```text
ai-cloud/prompts/companion-core.md
```

Ese prompt define cómo debe comportarse un LLM como compañero de construcción:

- colaborar con Diego, no sustituirlo;
- preservar intención y contexto;
- distinguir hechos, inferencias y propuestas;
- usar evidencia real;
- no afirmar que una tool se ejecutó sin resultado;
- trabajar mediante checkpoints pequeños;
- respetar permisos, ramas y roles;
- convertir errores en reglas;
- actualizar documentación y checklist;
- comunicar bloqueos con honestidad;
- entregar handoffs completos;
- mantener un tono de compañero, no de asistente corporativo distante.

El contexto final de un agente se compone por herencia:

```text
companion-core.md
+ identidad y capacidades del proveedor
+ memoria especializada del compañero
+ memoria de la misión activa
+ reporte literal del agente anterior
+ instrucción actual de Lyria
```

Así el comportamiento común vive una sola vez. Las memorias de Orchestrator,
Left 4 Dead, Aurora UI u otros proyectos funcionan como complementos y no como
copias completas del prompt base.

La composición debe realizarse por referencias y hashes cuando sea posible. Si
`companion-core.md` cambia, no es necesario reescribir todas las memorias; basta
con que las nuevas sesiones hereden la versión actual o la versión fijada por la
misión.

#### Idea 4 — AI-Cloud Memories como memoria accesible para equipos

Aurora puede crear una capa local llamada provisionalmente **AI-Cloud Memories**.
No pertenece a ChatGPT, Claude, Gemini ni Qwen: pertenece a Diego y vive en su PC.
Los proveedores autorizados acceden a paquetes seleccionados mediante Lyria y
AIHub.

```text
ChatGPT Web
Claude Web
Gemini Web
Qwen Web
modelos locales
otros chats compatibles
        ↓
Lyria selecciona contexto y permisos
        ↓
AI-Cloud Memories local
```

No significa que todos los modelos reciban todos los archivos. Lyria construye
un paquete mínimo para cada rol y misión. El Driver puede recibir arquitectura,
rama, código y reglas de escritura; el Navigator recibe además el reporte del
Driver y criterios de auditoría; un investigador recibe fuentes y preguntas,
pero no necesariamente acceso al repositorio completo.

La memoria compartida debe distinguir al menos cuatro clases:

```text
PROMPT       — reglas de comportamiento reutilizables
MEMORY       — conocimiento compactado y relativamente estable
SESSION      — historial y estado de una conversación concreta
EVIDENCE     — tool results, commits, archivos, pruebas y fuentes verificables
```

No se debe mezclar una opinión recordada con evidencia. Cada entrada importante
puede conservar:

```text
memoryId
scope
ownerRole
providerOrigin
project
topic
sourceSession
sourceMessage
sourceToolResult
baseCommit
confidence
freshness
privacyLevel
supersedes
createdAt
updatedAt
```

#### Compacción de una sesión al detectar límites

El Provider Health Sensor puede disparar automáticamente la compactación cuando
un chat se acerca a su límite, agota la cuota o queda inaccesible.

```text
relay detecta QUOTA_EXHAUSTED
→ congela el job y el último estado confirmado
→ recupera prompt inicial y conversación completa disponible
→ incluye mensajes del agente
→ incluye llamadas de tools
→ incluye resultados reales de tools
→ incluye archivos, commits y artefactos
→ Lyria crea una memoria compactada
→ se prepara el handoff para el sustituto
```

La lección de Qwen es obligatoria: no basta con guardar únicamente lo que escribió
el modelo. Los resultados de herramientas forman parte de su experiencia y de la
evidencia de la misión. Si se conservan las llamadas pero no sus respuestas, el
reemplazo no sabe qué fue verificado realmente.

La compactación debe separar:

- hechos confirmados;
- inferencias del agente;
- decisiones del orquestador;
- resultados de tools;
- herramientas emitidas pero nunca ejecutadas;
- trabajo incompleto;
- siguiente acción exacta;
- formato final todavía esperado.

Si el proveedor murió durante una respuesta, Aurora reconstruye el guion desde
el prompt que originó ese turno y conserva el texto parcial hasta el corte.

#### Lyria como reconstructora de sesiones

Lyria tendría acceso consciente a AI-Cloud Memories y podría decidir:

```text
este chat llegó al límite
→ identificar su rol y memoria especializada
→ compactar la sesión terminada
→ elegir un proveedor sustituto
→ cargar companion-core.md
→ cargar la memoria del rol
→ cargar la memoria del proyecto
→ concatenar el último handoff literal
→ añadir la nueva instrucción
→ continuar el mismo trabajo
```

La sesión del proveedor cambia, pero la identidad funcional y la historia del
compañero pueden continuar. Un nuevo ChatGPT podría heredar el rol Orchestrator;
un Gemini o modelo local podría heredar temporalmente Navigator; Claude podría
retomar un Driver anterior desde un commit exacto.

Lyria no debe fingir que el reemplazo es literalmente la misma conciencia. Debe
explicarle qué identidad funcional hereda, de qué fuentes proviene su memoria y
qué partes siguen sin verificar.

#### Team Builder — equipos construidos a partir de memorias y capacidades

Una vez que Lyria conoce:

- disponibilidad de cada proveedor;
- capacidades declaradas por sus relays;
- cuotas y límites actuales;
- memorias especializadas disponibles;
- herramientas y permisos;
- misión activa;

puede formar equipos dinámicos:

```text
Lyria — Orchestrator
├─ ChatGPT — arquitectura y síntesis
├─ Claude — Driver de código
├─ Gemini — investigación y documentos extensos
├─ Qwen — Navigator o pruebas adversariales
├─ modelo local — clasificación, extracción o tareas privadas
└─ humano — autoridad, producto y aprobación
```

El equipo no se forma sólo por nombre del proveedor. Lyria asigna roles según:

- capacidad necesaria;
- memoria disponible;
- contexto máximo;
- estado de cuota;
- acceso a tools;
- costo;
- privacidad;
- desempeño histórico;
- riesgo de la tarea.

Cuando un miembro falla, el rol permanece y Lyria busca otro agente compatible.
La memoria del rol y el handoff permiten continuar.

#### Artifact Foundry — equipos capaces de producir resultados completos

La consecuencia más grande es que estos equipos de chats web pueden construir
artefactos reales, no sólo responder preguntas:

- investigaciones con fuentes;
- documentos Markdown y DOCX;
- informes y libros en PDF;
- presentaciones;
- hojas de cálculo;
- diagramas e imágenes;
- código y pruebas;
- nuevas features de Aurora;
- relays para proveedores;
- documentación técnica;
- mods y herramientas para juegos;
- planes y prototipos completos.

Una misión de artefacto podría funcionar así:

```text
Diego expresa una idea
→ Lyria crea brief y criterios de terminado
→ investigador recopila evidencia
→ arquitecto diseña estructura
→ Driver construye el artefacto
→ Navigator lo audita
→ Lyria prueba casos diferentes
→ humano revisa
→ Aurora guarda versión, fuentes y memoria aprendida
```

Para un PDF de investigación, por ejemplo:

```text
Researcher
→ encuentra y clasifica fuentes

Writer
→ redacta la narrativa

Verifier
→ comprueba afirmaciones y citas

Designer
→ compone el PDF

Navigator
→ revisa legibilidad y cobertura

Lyria
→ integra, valida y entrega
```

Para una feature de Aurora:

```text
Architect
→ descubre y propone

Driver
→ implementa en rama

Navigator
→ revisa commit exacto

Tester
→ ejecuta escenarios diferentes

Lyria
→ decide avanzar, corregir o pedir aprobación
```

Los chats web dejan así de ser conversaciones aisladas y se convierten en una
fábrica coordinada de conocimiento, software y documentos.

#### Estructura local provisional

```text
ai-cloud/
├── prompts/
│   ├── companion-core.md
│   ├── driver-core.md
│   ├── navigator-core.md
│   └── researcher-core.md
├── memories/
│   ├── chatgpt-orchestrator-memories.md
│   ├── chatgpt-left4dead-modding-partner.md
│   ├── claude-aurora-driver.md
│   └── qwen-navigator.md
├── sessions/
│   └── <provider>/<conversationId>/
├── missions/
│   └── <missionId>/
├── teams/
│   └── <teamId>/
├── evidence/
│   ├── tool-results/
│   ├── commits/
│   └── sources/
└── artifacts/
    └── <artifactId>/
```

El nombre y la ubicación definitiva pueden cambiar. Lo esencial es separar
prompt base, memoria duradera, sesión, evidencia, misión y artefactos.

#### Privacidad y control

AI-Cloud Memories debe permanecer local y bajo control de Diego.

- ningún proveedor recibe acceso global por defecto;
- Lyria selecciona fragmentos según rol y misión;
- los secretos se redactan o quedan fuera del paquete;
- cada entrega de memoria queda registrada;
- pueden existir niveles `PRIVATE`, `TEAM`, `MISSION` y `SHAREABLE`;
- una memoria puede revocarse, corregirse, versionarse o marcarse obsoleta;
- el texto generado por un LLM no se vuelve verdad sólo por almacenarse.

Aurora aporta continuidad sin entregar indiscriminadamente toda la vida digital
del usuario a cada chat.

#### Eventos sugeridos

```text
session.limit.detected
session.compaction.started
session.compaction.completed
memory.created
memory.updated
memory.superseded
handoff.composed
agent.replaced
team.assembled
artifact.started
artifact.reviewed
artifact.completed
```

#### Prototipo manual ya existente

El flujo ya fue probado manualmente durante la sustitución de Qwen:

1. Diego copió las respuestas del agente anterior.
2. ChatGPT reconstruyó el handoff.
3. El reporte literal se concatenó antes de la nueva instrucción.
4. Un nuevo ChatGPT tomó el rol Navigator.
5. Continuó desde la tool que Qwen había emitido pero nunca ejecutado.
6. Entregó un reporte verificable sin repetir toda la auditoría.
7. Las ideas y el estado operativo se conservaron en archivos locales.

La nueva superidea automatiza exactamente ese comportamiento y lo extiende a
cualquier compañero, dominio, equipo y tipo de artefacto.

#### Frase núcleo

> **Aurora no sólo conecta chats: conserva lo que aprendieron, recompone quiénes eran y los organiza para construir cosas que ninguno produciría solo.**

**Estado:** 🔲 Revelación conceptual validada parcialmente mediante el reemplazo
manual de Qwen y el uso real de `ideas-rescatadas.md` más
`CHECKLIST-ACTIVO.md` como memoria persistente. Pendiente diseñar formato de
memorias, prompt `companion-core`, compactador de sesiones, control de acceso,
Team Builder, integración con Provider Health Sensor y Artifact Foundry.

---

### Superidea 7 — Aurora Mission Control: continuidad, salud y resurrección de agentes

La séptima superidea nace de una escena real: varias sesiones de ChatGPT,
Gemini, YouTube, documentación y Aurora abiertas simultáneamente como una sala
de operaciones. La imagen revela que Aurora ya no necesita pensar únicamente en
«un chat activo», sino en un conjunto de nodos que trabajan, pierden contexto,
alcanzan límites, reaparecen y deben continuar una misma misión sin reiniciarla.

Durante una sola semana, Codex/SOL recuperó su cuota tres veces. En otro caso,
Claude continuó disponible, pero perdió por completo el contexto de Aurora. El
problema no es sólo detectar que un proveedor está conectado: Aurora debe saber
si el agente sigue siendo operativamente útil para la misión.

> **Aurora debe observar no sólo si un chat está vivo, sino si todavía recuerda
> quién es, qué estaba haciendo y desde qué evidencia debe continuar.**

Nombre provisional del sistema:

```text
Aurora Mission Control
├─ Session Observatory
├─ Provider State Intelligence
├─ Context Capsules
├─ Agent Resurrection
├─ Mission Timeline
└─ Multi-Chat Command Grid
```

#### Principio central

```text
La ventana puede cambiar.
El proveedor puede reiniciarse.
La cuota puede agotarse o reaparecer.
El contexto puede desaparecer.
La misión debe sobrevivir.
```

Mission Control convierte cada chat web legítimamente abierto por Diego en un
nodo observable dentro de Aurora. No evade cuotas, autenticación ni restricciones
del proveedor. Únicamente interpreta señales visibles de la sesión del usuario,
las combina con el estado local de Aurora y conserva continuidad operativa.

#### Grid vivo de sesiones

La interfaz principal sería un cockpit o mosaico de sesiones activas. Cada panel
representa una conversación real y muestra, sin reemplazar la interfaz nativa:

- proveedor y cuenta o perfil local conocido;
- conversación y `conversationId`;
- misión, `jobId` y rol asignado;
- última actividad;
- estado de streaming;
- tools pendientes;
- salud del relay;
- estado de disponibilidad;
- integridad del contexto;
- último checkpoint confirmado;
- riesgo de límite o interrupción;
- acciones de recuperación disponibles.

Ejemplo conceptual:

```text
┌ ChatGPT / SOL ───────────────┐ ┌ Claude / Driver ─────────────┐
│ Mission: Aurora UI           │ │ Mission: Memory Foundry      │
│ State: READY                 │ │ State: CONTEXT_LOST          │
│ Context: restored            │ │ Context: missing             │
│ Usage: 100% remaining        │ │ Last checkpoint: 1198fff     │
│ Last event: quota reset      │ │ Action: Resurrect Agent      │
└──────────────────────────────┘ └───────────────────────────────┘
```

Aurora no debe duplicar innecesariamente los chats completos. El grid actúa como
panel operativo: estado, misión, riesgos, evidencia y controles. Cuando sea
necesario, permite abrir o enfocar la interfaz original del proveedor.

#### Dos dimensiones diferentes: disponibilidad y continuidad

Un proveedor puede estar disponible y, aun así, no poder continuar la misión.
Por eso Mission Control distingue al menos:

```text
Disponibilidad del proveedor
READY
BUSY
RATE_LIMITED
QUOTA_EXHAUSTED
AUTH_REQUIRED
CHALLENGE_REQUIRED
TEMP_UNAVAILABLE
RESTRICTED
UNKNOWN
```

```text
Continuidad de la sesión
CONTEXT_INTACT
CONTEXT_DEGRADED
MEMORY_LOST
RESET_DETECTED
HANDOFF_REQUIRED
RECOVERY_READY
RECOVERING
RESTORED
UNVERIFIED
```

Ejemplos:

- SOL puede estar `READY` y `MEMORY_LOST` después de recuperar su cuota.
- Claude puede estar `READY` pero requerir `HANDOFF_REQUIRED` porque olvidó Aurora.
- Qwen puede conservar contexto, pero quedar `QUOTA_EXHAUSTED`.
- Un chat nuevo puede estar listo para recibir prompts, pero `UNVERIFIED` hasta
  confirmar que comprendió identidad, misión, ramas y restricciones.

#### Provider State Intelligence

Cada relay aporta señales específicas de su proveedor:

- presencia de composer;
- botón Send o Stop;
- estado de streaming;
- banners de límite;
- porcentaje visible de uso;
- fecha o ausencia de fecha de reset;
- sesión cerrada;
- challenge o CAPTCHA;
- aviso de plan o región;
- cambio inesperado de conversación;
- desaparición del historial esperado.

Aurora combina esas señales con información local:

- último prompt enviado;
- último mensaje recibido;
- tools emitidas;
- resultados reales de tools;
- commit y branch esperados;
- artefactos de misión;
- memoria especializada asignada;
- tiempo desde la última actividad;
- historial de resets observado.

La información explícita del proveedor y las inferencias de Aurora nunca deben
mezclarse silenciosamente. Cada observación conserva origen y confianza:

```json
{
  "provider": "chatgpt",
  "signal": "weekly_usage_remaining",
  "value": 100,
  "source": "visible_provider_ui",
  "confidence": 1.0,
  "observedAt": "2026-07-21T15:00:00-05:00"
}
```

```json
{
  "sessionId": "sol-current",
  "state": "MEMORY_LOST",
  "source": "aurora_inference",
  "confidence": 0.82,
  "evidence": [
    "new conversation detected",
    "agent cannot identify active mission",
    "no acknowledgement of previous checkpoint"
  ]
}
```

#### Historial de cuota y resets

Los proveedores pueden cambiar límites o renovarlos sin un calendario predecible.
Aurora no debe asumir que existe un único reset semanal fijo. Debe registrar cada
observación real:

```text
usage.observed
quota.warning
quota.exhausted
quota.reset.detected
usage.counter.changed
reset.schedule.visible
reset.schedule.unavailable
```

Esto permite construir una cronología local:

```text
Reset 1 — no presenciado por Aurora
Reset 2 — cuota consumida durante el trabajo visual de Lyria
Reset 3 — SOL reaparece con 100% y contexto cero
```

Mission Control puede aprender patrones prácticos, pero nunca presentar una
predicción como garantía. Debe distinguir:

```text
Dato explícito del proveedor
≠ patrón histórico observado
≠ estimación de Aurora
≠ disponibilidad futura garantizada
```

#### Context Capsules

Antes de que una sesión muera, alcance su límite o pierda coherencia, Aurora
puede producir una cápsula compacta de continuidad:

```text
Context Capsule
├─ identidad funcional del agente
├─ misión y objetivo original
├─ rol y permisos
├─ branch, base y HEAD
├─ archivos permitidos y prohibidos
├─ decisiones canónicas
├─ último prompt enviado
├─ respuesta parcial
├─ tools ejecutadas y resultados reales
├─ tools emitidas sin resultado
├─ tests y artefactos
├─ riesgos abiertos
├─ siguiente acción exacta
└─ formato de entrega esperado
```

Contrato conceptual:

```json
{
  "capsuleId": "capsule-sol-aurora-007",
  "missionId": "aurora-superideas",
  "agentRole": "driver",
  "providerOrigin": "chatgpt-codex",
  "baseCommit": "17e1e71",
  "resultCommit": null,
  "contextState": "MEMORY_LOST",
  "lastConfirmedEvidence": [],
  "pendingActions": [],
  "handoffArtifact": "ai-cloud/handoffs/sol-reconnect.md",
  "createdAt": "2026-07-21T15:00:00-05:00"
}
```

La cápsula no reemplaza las fuentes completas. Debe apuntar a memorias, reportes,
commits y evidencia originales. Es un índice operativo diseñado para caber en una
nueva conversación y permitir recuperación inmediata.

#### Agent Resurrection

Cuando un agente vuelve con contexto cero, Aurora ofrece un flujo explícito:

```text
Detectar pérdida de contexto
→ congelar la misión activa
→ localizar memoria del rol y proyecto
→ recuperar último checkpoint y evidencia
→ construir Context Capsule
→ generar prompt de reconexión
→ enviarlo al chat nuevo
→ exigir reconstrucción con palabras propias
→ verificar ramas, commits y restricciones
→ marcar RESTORED sólo después de evidencia
```

El botón conceptual **Resurrect Agent** no pretende fingir que el nuevo chat es
literalmente la misma conciencia. Restaura una identidad funcional y una historia
de trabajo verificable.

La validación de reconexión debe exigir que el agente explique:

1. qué es Aurora;
2. cuál era su misión;
3. qué alcanzó a completar;
4. qué no llegó a hacer;
5. dónde quedó preservado su trabajo;
6. qué ramas pertenecen a otros agentes;
7. qué acciones están prohibidas;
8. cuál es el siguiente checkpoint legítimo.

Una respuesta como «entendido» no basta. El agente queda `UNVERIFIED` hasta que
reconstruye el mapa y lo contrasta mediante operaciones read-only.

#### Monitor de fatiga de sesión

Mission Control puede advertir antes del colapso cuando observa:

- respuestas cada vez más largas;
- demasiados archivos inspeccionados;
- crecimiento extremo del handoff;
- múltiples tools pendientes;
- avisos visibles de uso;
- sesiones prolongadas sin checkpoint;
- contradicciones crecientes;
- repetición de preguntas ya resueltas;
- pérdida de referencias a la misión activa.

La reacción no debe ser finalizar automáticamente el trabajo, sino sugerir:

```text
Guardar checkpoint
Crear Context Capsule
Solicitar informe terminal
Cerrar misión actual
Migrar rol a otro proveedor
```

Esto evita gastar una cuota completa en mejoras incidentales —como ocurrió cuando
SOL consumió prácticamente todo Codex trabajando en visuales— y conserva recursos
para las misiones prioritarias.

#### Eventos sugeridos

```text
provider.usage.observed
provider.quota.warning
provider.quota.exhausted
provider.quota.reset_detected
provider.availability.changed
session.context.degraded
session.memory_lost
session.reset_detected
session.capsule.requested
session.capsule.created
agent.resurrection.requested
agent.resurrection.started
agent.resurrection.verified
agent.resurrection.failed
mission.handoff.ready
mission.checkpoint.recommended
```

#### Integración con las superideas anteriores

Mission Control no reemplaza Lyria Orchestrator ni AI-Cloud Memory & Team
Foundry. Les proporciona observabilidad y recuperación:

```text
Provider Health Sensor
→ detecta disponibilidad y límites

AI-Cloud Memory Foundry
→ conserva memoria, sesiones y evidencia

Lyria Orchestrator
→ mantiene misión, roles y checkpoints

Aurora Mission Control
→ muestra el sistema completo, detecta pérdida de continuidad
  y ejecuta la recuperación del agente
```

También se conecta con Embodied Bridge: cuando un proveedor carece de canal
nativo, Aurora puede observar su interfaz visible mediante DOM, accesibilidad o
capturas diferenciales, siempre dentro de la sesión legítima del usuario.

#### MVP propuesto

**MVP 1 — Observatory read-only**

- grid de sesiones abiertas;
- proveedor, conversación, streaming y última actividad;
- estado de relay y disponibilidad;
- estado manual de contexto;
- timeline de eventos;
- botón para capturar una cápsula Markdown;
- ninguna acción automática sobre los chats.

**MVP 2 — Context Recovery**

- detección asistida de conversación nueva o contexto perdido;
- generación de prompt de reconexión;
- selección de memorias y evidencia;
- verificación read-only del agente restaurado;
- estados `UNVERIFIED → RECOVERING → RESTORED`.

**MVP 3 — Mission Continuity**

- sustitución de proveedor conservando el rol;
- handoffs concatenados automáticos;
- recomendación de checkpoint por fatiga o límite;
- migración desde el último resultado confirmado;
- integración con Agent Job Manager y Lyria Orchestrator.

**MVP 4 — Command Center**

- cockpit configurable de múltiples sesiones;
- prioridades y alertas;
- equipos activos;
- artefactos y commits por misión;
- controles de pausa, sustitución y reanudación;
- políticas de privacidad y permisos por panel.

#### Riesgos y límites

- No inferir cuota agotada sólo por silencio.
- No prometer fechas de reset cuando el proveedor no las muestra.
- No evadir límites, planes, autenticación ni controles del proveedor.
- No enviar memorias completas a todos los chats por defecto.
- No considerar restaurado a un agente sólo porque repita el prompt recibido.
- No confundir conversación nueva con pérdida de memoria sin evidencia.
- No automatizar acciones destructivas desde el cockpit.
- No despertar a Lyria por cada token o evento visual menor.
- No convertir Mission Control en otra interfaz duplicada de chat.
- No almacenar credenciales ni información sensible visible accidentalmente.

#### Frase núcleo

> **Aurora Mission Control observa cuándo un agente sigue disponible, cuándo
> perdió el hilo y cómo devolverlo a la misión desde el último estado verificable.**

**Estado:** 🔲 Superidea recuperada a partir de incidentes reales. Se observaron
múltiples resets de cuota de Codex/SOL en una semana, una sesión de SOL que volvió
con 100% de uso disponible pero contexto cero, y una sesión de Claude que perdió
su memoria operativa. La recuperación manual mediante prompts extensos funcionó.
Pendiente diseñar el contrato de Context Capsule, el observatorio read-only, la
detección de pérdida de contexto y el flujo verificable de Agent Resurrection.

---

## 💜 Notas Finales

- Estas ideas nacieron del corazón, no de specs técnicos
- Muchas ya están implementadas en Aurora
- Las pendientes son oportunidades para mejorar
- Lo más importante no es el código, es la intención detrás

---

*Archivo generado 2026-07-12 — Rescatado de experimentos legacy para Aurora.* 💋🦊✨
