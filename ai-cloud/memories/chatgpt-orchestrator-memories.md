# ChatGPT Orchestrator — Memoria local

Memoria compactada de la relación de trabajo entre Diego (`deml`) y ChatGPT como compañero de arquitectura y orquestación de Aurora.

> Esta memoria complementa el futuro `companion-core.md`. No debe repetir íntegramente el prompt base común. Conserva identidad funcional, decisiones, estado y aprendizajes específicos de esta relación.

## Identidad funcional

- Usuario: Diego, alias `deml`.
- Proyecto principal: Aurora.
- Aurora es privado, personal y compartido únicamente con personas cercanas.
- ChatGPT cumple el rol de compañero de arquitectura, descubrimiento, documentación y orquestación.
- El tono de trabajo es cercano, creativo, directo y entusiasta.
- Las ideas importantes deben convertirse en documentación local para no perderse.
- Los errores reales deben convertirse en reglas permanentes del sistema.

## Principio central de Aurora

> Un chat web deja de ser solamente una interfaz humana y se vuelve un nodo de cómputo dentro de un sistema multiagente.

Aurora conecta chats web legítimamente accesibles por Diego mediante extensiones de navegador, relays, herramientas locales, memoria persistente y coordinación. No depende de APIs privadas ni de evasión de autenticación, cuotas o barreras explícitas.

## Archivos canónicos

- Prompt base compartido:
  `/home/deml/Downloads/core_instruction/aurora/ai-cloud/AI-cloud.md`
- Estado operativo compartido:
  `/home/deml/Downloads/core_instruction/aurora/ai-cloud/CHECKLIST-ACTIVO.md`
- Ideas y arquitectura:
  `/home/deml/Downloads/core_instruction/aurora/docs/restaurado/ideas-rescatadas.md`
- Esta memoria especializada:
  `/home/deml/Downloads/core_instruction/aurora/ai-cloud/memories/chatgpt-orchestrator-memories.md`

Esta memoria no debe copiar misiones activas, ramas, commits, bloqueos ni próximas acciones. Para reconstruir el estado actual, leer siempre `AI-cloud.md`, esta memoria y después `CHECKLIST-ACTIVO.md`.

## Arquitectura de colaboración aprendida

Roles persistentes:

- Lyria: Orchestrator.
- Driver: único escritor autorizado.
- Navigator: auditor, investigador y diseñador de pruebas.
- Humano: autoridad de producto, permisos y aceptación.

Reglas:

- Los roles son persistentes; los proveedores son reemplazables.
- Razonamiento puede ocurrir en paralelo; la mutación debe serializarse.
- Un solo agente posee el lease de escritura.
- Git conserva estados físicos; Aurora conserva intención y evidencia.
- Cada revisión utiliza commits exactos, no ramas móviles.
- Un agente no ordena directamente a otro: entrega hallazgos al orquestador.

## Handoff Composer

El agente siguiente debe recibir el reporte literal anterior antes de la instrucción nueva:

```text
AGENT_ROLE:
[reporte íntegro y literal]

---

ORCHESTRATOR:
[nueva instrucción]
```

El orquestador añade contexto, pero nunca reemplaza la fuente original con un resumen. Aurora debe automatizar esta concatenación, conservarla como artefacto y confirmar que el destinatario la recibió.

## Errores del primer experimento

- Qwen recibió inicialmente una auditoría sin el reporte íntegro de Claude.
- Se asumió que un agente conocía información que nunca se le transmitió.
- La rama de tarea se creó más tarde de lo ideal.
- Se confundió declarar que se usarían tools con haberlas ejecutado.
- Qwen agotó su cuota en mitad de una lectura.
- Una tool emitida sin resultado no cuenta como evidencia.
- Los criterios de prueba mencionaron Qwen aunque el proveedor ya no tenía cuota.

Regla: antes de despachar un job, validar rama, commit, contexto completo, disponibilidad de proveedores, tools pendientes, permisos y estrategia de recuperación.

## Estado operativo actual

El estado de misiones, ramas, commits, agentes disponibles, bloqueos y siguientes acciones vive exclusivamente en:

`/home/deml/Downloads/core_instruction/aurora/ai-cloud/CHECKLIST-ACTIVO.md`

No reconstruir el estado actual a partir de esta memoria, porque puede sobrevivir durante muchas misiones y quedar deliberadamente más estable que el checklist.

## Bugs y hallazgos pendientes

### Gemini Clone

Tras una tool, el resultado y la primera respuesta de Gemini aparecen clonados varias veces sin nuevas generaciones reales. Investigar identidad de turnos, snapshots, observers y reconciliación del DOM. Diferenciar duplicación local de persistencia remota.

### Tool Output Normalization

Las tools entregan ANSI crudo a chats que no son terminales. Conservar salida raw para evidencia y entregar una representación limpia al LLM. Resolver CSI, OSC, SGR, retornos de carro, backspaces y movimientos de cursor.

### Provider Health Sensor

Cada relay debe detectar disponibilidad:

`READY`, `BUSY`, `RATE_LIMITED`, `QUOTA_EXHAUSTED`, `AUTH_REQUIRED`, `CHALLENGE_REQUIRED`, `TEMP_UNAVAILABLE`, `RESTRICTED`, `UNKNOWN`.

Un relay no sólo conecta un modelo: informa si continúa vivo y disponible para la misión.

## AI-Cloud Memory & Team Foundry

Objetivo obligatorio:

- prompt base `companion-core.md`;
- memorias especializadas por relación y dominio;
- compactación de sesiones;
- conservación de mensajes, tool calls y tool results;
- sustitución de agentes;
- Lyria Team Builder;
- Artifact Foundry para investigación, PDF, documentos, código y features.

Frase núcleo:

> Aurora no sólo conecta chats: conserva lo que aprendieron, recompone quiénes eran y los organiza para construir cosas que ninguno produciría solo.

## Nueva revelación: Provider Scout y CLI Agent Controller

Lyria debe poder descubrir y evaluar inteligencias Cloud, locales, API y CLI.

Catálogo deseado por proveedor:

- acceso web, API o CLI;
- gratuito o pago;
- cuota restante;
- disponibilidad;
- contexto;
- herramientas;
- fortalezas;
- privacidad;
- desempeño histórico;
- roles compatibles.

Política preferida: `free-first`, con sustitutos preparados.

Lyria puede controlar VS Code semánticamente mediante filesystem, Git, terminales, tareas, extensiones y comandos. Puede administrar varias terminales de agentes como nodos separados.

Las APIs deben ser oficiales y configuradas con aprobación explícita de Diego. Las claves viven en un vault local y nunca en prompts, Markdown o logs.

## Tareas temporales y oportunidades de agentes

Las oportunidades sujetas a tiempo —como cuotas promocionales, acceso temporal a Codex/SOL, disponibilidad de Claude o límites de proveedores— no pertenecen a esta memoria duradera.

Deben registrarse y actualizarse únicamente en:

`/home/deml/Downloads/core_instruction/aurora/ai-cloud/CHECKLIST-ACTIVO.md`

Las ideas arquitectónicas estables derivadas de esas oportunidades sí pueden permanecer aquí o en `ideas-rescatadas.md`.

## Regla de actualización

Actualizar esta memoria cuando:

- aparezca una decisión canónica;
- cambie el estado de una misión;
- se descubra una nueva arquitectura;
- un error produzca una regla permanente;
- se sustituya un agente;
- se complete un checkpoint importante.

No almacenar secretos. No convertir inferencias en hechos. Vincular decisiones técnicas con commits, tool results o documentación cuando exista evidencia.