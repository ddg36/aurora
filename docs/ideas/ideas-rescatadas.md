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
ejecución para capacidades sensibles. Las tools activas aparecen dinámicamente
en Lyra y en el registry sin reiniciar el servidor.

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

---

## 💜 Notas Finales

- Estas ideas nacieron del corazón, no de specs técnicos
- Muchas ya están implementadas en Aurora
- Las pendientes son oportunidades para mejorar
- Lo más importante no es el código, es la intención detrás

---

*Archivo generado 2026-07-12 — Rescatado de experimentos legacy para Aurora.* 💋🦊✨
