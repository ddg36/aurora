# ASH_PROTOCOLS.md

Mapa de canales textuales de Ash/AIHub.
Fecha: 2026-05-26.

## Objetivo

Definir la gramática común y el registro de canales para el sistema Ash/AIHub, actuales y futuros.

## Gramática común

```
@@<channel>:<id> key=value key2="valor con espacios"
body libre
@@end:<id>
```

Resultado:

```
@@<channel>-result:<id> status=ok|error|blocked [reason=...]
body opcional
@@end-result:<id>
```

## Reglas globales

- El `<id>` en `@@<channel>:` y `@@end:` debe coincidir exactamente.
- Resultados nunca se autoejecutan.
- IDs duplicados se bloquean (`reason=already_executed`).
- Cada bloque debe tener source claro: `auto` / `manual` / `system`.
- Un canal no debe disparar otro canal automáticamente en el mismo ciclo.
- Los resultados `blocked` cierran el protocolo — nunca silencio.

---

## Canales v1 — actuales

### @@nexus

PC local: filesystem, shell, project tools, sandbox.

**Estado:** implementado y probado.
**Riesgo:** alto — puede tocar la PC.
**Policy:** requiere `allowNexusAuto`, `manualOnly`, `maxBlocksPerMessage`.
**Docs:** `NEXUS_CAPABILITIES.md`, `NEXUS_SECURITY_DECISIONS.md`.

### @@message

Mensaje terminal al humano. Sin ejecución.

**Estado:** implementado v1 (2026-05-25). Probado: render visible, `@@message-result` devuelto, anti-cascada confirmado.
**Riesgo:** bajo.

Gramática:

```
@@message:<id> [level=info|success|warning|error] [title="..."]
body libre (tratado como texto literal — nunca ejecuta canales anidados)
@@end:<id>
```

Resultado:

```
@@message-result:<id> status=ok
@@end-result:<id>
```

Reglas:
- Nunca ejecuta comandos.
- Nunca dispara otros canales.
- Contenido `@@nexus`/`@@browser`/`@@llm` dentro del body se trata como texto.
- Se registra en flight recorder.
- Permitido aunque `manualOnly=true` (no es peligroso).

---

## Canales v2/v3 — planeados

### @@browser

Navegador. v1 solo lectura.

**Estado:** implementado v1 (2026-05-26). Acciones validadas: `page/info`, `page/viewport`, `dom/interactive`, `chat/last-user`, `chat/last-assistant`, `chat/last-pre`, `dom/count`, `dom/text`.

Acciones v1 (read-only):
- `page/info` — URL, título, estado
- `page/viewport` — URL, título, viewport, scroll, DPR y elemento enfocado
- `dom/interactive limit=N` — mapa de elementos visibles accionables con `id`, rol, nombre, selector y bbox
- `chat/last-user` — último mensaje del usuario
- `chat/last-assistant` — último mensaje del assistant
- `chat/last-pre` — último bloque `<pre>`
- `dom/text selector="..."` — texto de un selector
- `dom/count selector="..."` — cantidad de elementos

No incluir en v1:
- `click`, `type`, `send`, `upload` — para v3

**Seguridad:** read-only obligatorio en v1. Sin efectos secundarios.
**Cabina:** el sidepanel muestra `Browser Cabin` con el último snapshot interactivo del tab activo.
**Contexto compacto:** para ChatGPT, `dom/interactive` debe priorizar formato corto: `el_N role "name" enabled box=x,y,w,h`; selectores largos solo en debug/cabina.
**Sidepanel:** el navegador operativo es una tab gestionada. El sidepanel muestra un espejo/stream por capturas + contexto compacto. Iframe directo queda pausado/experimental.

Acciones de tab gestionada:
- `browser/navigate url="..."`
- `browser/map` dibuja overlay numerado; elementos normales son azules y zonas `SCROLL` son naranjas con `box`/`scroll`
- `browser/clear-map`
- `browser/click el=N`
- `browser/fill el=N text="..."`
- `browser/scroll dy=N`
- `browser/scroll el=N dy=N` o `browser/scroll selector="..." dy=N`
- `browser/wheel x=N y=N dy=N`
- `browser/click-point x=N y=N`
- `browser/region-text x=N y=N w=N h=N`
- `browser/screenshot`
- `browser/text selector="body"`
- `browser/transcript`

---

### @@llm

Router único de modelos — razona o propone, no ejecuta herramientas.

```
@@llm:id provider=claude|gpt|gemini|grok|local model=... task=...
prompt libre
@@end:id
```

**Estado:** implementado v1 dry-run (2026-05-26). Probado con `provider=debug model=mock`.
**Regla clave:** `@@llm` no ejecuta herramientas directamente. Solo devuelve texto.

Resultado:

```
@@llm-result:id provider=debug model=mock status=ok
[dry-run] ...
@@end-result:id
```

Reglas:
- El body se trata como prompt literal.
- Bloques `@@nexus`, `@@browser`, `@@artifact` o `@@message` dentro del body no se autoejecutan.
- No llama proveedores reales en v1.
- No dispara otros canales.

---

### @@policy

Configura permisos de sesión.

```
@@policy:policy001 action=set manualOnly=true allowNexusAuto=false
@@end:policy001
```

**Estado:** funcionalidad existe en cabina, canal formal pendiente.

---

### @@artifact

Prepara bundles/handoffs dentro de `nexus/state/<ext>/artifacts/`. Sin upload automático.

```
@@artifact:snap001 action=snapshot include=docs,src
@@end:snap001
```

**Estado:** implementado v1 (2026-05-25). Acciones validadas: `artifact/list`, `artifact/snapshot`, `artifact/write`, `artifact/zip`, `artifact/manifest`.
**Regla:** nunca sube a ChatGPT automáticamente en v1. Solo opera en `nexus/state/<ext>/artifacts/`.
**Anti-cascada:** el body de `artifact/write` es contenido literal; canales `@@...` internos no se autoejecutan.

---

### @@event

Telemetría interna. Por ahora eventos JS internos, no necesariamente visibles en chat.

**Estado:** parcialmente implementado (flight recorder). Canal formal pendiente.

---

## Seguridad por canal

| Canal | Riesgo | Restricción |
|---|---|---|
| `@@nexus` | Alto | Requiere policy, confina paths con `_safe()` |
| `@@browser` | Medio | Read-only en v1 |
| `@@llm` | Bajo | Sin ejecución directa de herramientas |
| `@@message` | Bajo | Solo terminal, no ejecutable |
| `@@artifact` | Bajo | Solo `nexus/state/<ext>/artifacts/`, sin upload auto |
| `@@policy` | Bajo | Solo configura sesión |
| `@@event` | Ninguno | Telemetría interna |

---

## Roadmap

| Versión | Entregable |
|---|---|
| v2.1 | Parser común, registry de canales, `@@message` terminal, stub `@@browser` |
| v2.2 | `@@browser` read-only real |
| v2.3 | `@@artifact` snapshot |
| v2.4 | `@@llm` dry-run |
| v2.5 | Parser común endurecido + smokes multicanal repetibles |

---

## No hacer todavía

- No `@@gpt` / `@@claude` como canales separados.
- No `@@browser` con `click`, `type`, `send`.
- No upload automático.
- No providers de LLM reales.
- No subagentes automáticos inter-canal.
