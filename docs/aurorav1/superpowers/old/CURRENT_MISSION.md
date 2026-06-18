# CURRENT_MISSION.md

Handoff compacto — estado al 2026-05-26. Leer esto antes de explorar el repo.

## Estado

Checkpoint v3: cinco canales operativos (@@nexus, @@message, @@browser, @@artifact, @@llm). Smoke multicanal 006 pasó 5/5 desde ChatGPT web.

## Proyecto

| | |
|---|---|
| Workspace | `/media/almacen/deml/Downloads/core_instruction/au-ash` |
| Bridge | `/media/almacen/deml/Downloads/core_instruction/nexus.py` |
| URL | `http://127.0.0.1:7777` |
| Logs | `/tmp/nexus-7777.log` |
| Arranque | `nohup .venv/bin/python3 nexus.py --workspace /media/almacen/deml/Downloads/core_instruction/au-ash > /tmp/nexus-7777.log 2>&1 &` |

## Qué funciona (probado)

- `@@nexus` autoloop — watcher cada 350ms, ejecución tras 1100ms de estabilidad
- `@@message` terminal — render visible, `@@message-result` devuelto, anti-cascada confirmado
- `@@browser` read-only — page/info, page/viewport, dom/interactive, chat/last-user/assistant/pre, dom/count/text; dedupe y anti-loop confirmados
- `@@artifact` — list, snapshot (6 docs=28KB), write, zip, manifest; `nexus/state/<ext>/artifacts/` confirmado
- `@@llm` dry-run — provider debug/model mock, devuelve `@@llm-result` sin llamar providers reales
- Anti-cascada terminal — bloques internos dentro de `@@message`, `@@llm`, `@@browser` y `@@artifact` se tratan como texto literal
- Entrega multicanal — resultados agrupados por batching para evitar pisar el composer de ChatGPT
- Browser Cabin — sidepanel con snapshot del tab activo: viewport, foco y elementos interactivos mapeados
- Browser Cabin tab gestionada — iframe directo pausado; sidepanel actúa como espejo/stream de una tab normal controlada
- `shell/run`, `shell/exec`
- `fs/list`, `fs/read`, `fs/write`, `fs/head`, `fs/tail`, `fs/read-range`, `fs/summarize`, `fs/patch`, `fs/move`, `fs/delete`
- `project/tree`, `project/grep`, `project/search`
- `sandbox/write`, `sandbox/read`, `sandbox/list`, `sandbox/run`
- Cabina / flight recorder
- Policy: `manualOnly`, `allowNexusAuto`, `maxBlocksPerMessage`
- Duplicate ID blocking
- Realtime watcher
- Reload sin revivir historial viejo

## Docs existentes

| Doc | Contenido |
|---|---|
| `docs/NEXUS_CAPABILITIES.md` | Acciones disponibles, protocolo, ejemplos |
| `docs/NEXUS_SECURITY_DECISIONS.md` | Decisiones de seguridad, policy, pendientes |
| `docs/NEXUS_SMOKE_SUITE.md` | 16 smoke tests repetibles post-cambio |
| `docs/ASH_PROTOCOLS.md` | Gramática de canales, roadmap v2/v3 |

## Decisiones importantes

- Resultados `blocked` cierran el protocolo — nunca silencio.
- Policy debe setearse desde sidepanel/`ash-policy` en isolated world. No sirve `sessionStorage` desde main world vía CDP.
- `@@browser` será read-only en v1 — sin click/type/send.
- `@@llm` será router único que razona, no ejecuta herramientas.
- `@@artifact` en backlog — bundles/handoff, sin upload automático.
- No crear `@@gpt`/`@@claude`/`@@gemini` como prefijos separados.

## Última validación — smoke multicanal 006 (2026-05-26)

✅ `@@nexus` · `@@message` · `@@browser` · `@@artifact` · `@@llm`

IDs validados:

- `multi_smoke_nexus_006` — `status=ok`, stdout `MULTI_SMOKE_NEXUS_006_OK`
- `multi_smoke_msg_006` — `status=ok`
- `multi_smoke_browser_006` — `status=ok`, `page/info`
- `multi_smoke_artifact_006` — `status=ok`, `artifact/list`
- `multi_smoke_llm_006` — `status=ok`, `provider=debug model=mock`

Sin resultados anidados inesperados. Sin duplicados visibles. La cola multicanal funcionó correctamente.

## Última validación incremental — artifact/write cascade 012 (2026-05-26)

✅ `@@artifact:artifact_cascade_012 action=artifact/write file="cascade_artifact_012.txt"` devolvió `status=ok`.

Validado:

- `artifact/write` usa `body` recibido por JSON y no variable local inexistente.
- Bloques anidados `@@nexus`, `@@browser`, `@@message` y `@@llm` dentro del body no se ejecutaron.
- Resultado visible único: `@@artifact-result:artifact_cascade_012`.

## Validación browser eyes 014 (2026-05-26)

✅ `@@browser:browser_eyes_014_viewport action=page/viewport` devolvió viewport, scroll, DPR y foco.
✅ `@@browser:browser_eyes_014_interactive action=dom/interactive limit=20` devolvió mapa de elementos visibles.

Validado adicional:

- `Browser Cabin` en sidepanel puede pedir `getBrowserSnapshot`.
- Solo el frame principal de la página responde mensajes ASH; iframes como `sentinel/frame.html` no contaminan el snapshot.

## Validación browser mirror Amazon (2026-05-26)

✅ Amazon observado sin crear pestaña nueva: se reutilizó una pestaña web existente.
✅ `Mirror iframe` renderiza dentro del sidepanel con screenshot + overlay de elementos.
✅ Contexto compacto validado con `ash-browser-text 12`.

Resultado compacto esperado:

```
page "Amazon.com. Spend less. Smile more." "https://www.amazon.com/"
viewport ... scroll=0,0
elements total=48 shown=12 truncated=true
el_2 searchbox "Search Amazon" enabled box=...
el_3 button "Go" enabled box=...
```

Limitación confirmada:

- Amazon no es confiable como iframe directo por políticas anti-frame.
- `chatgpt-send-image` adjunta imágenes correctamente, pero ChatGPT web devolvió assistant vacío en las pruebas con imagen; usar fallback textual compacto.

## Cambio Browser Cabin — tab gestionada (2026-05-26)

Decisión: no usar iframe directo como modo principal. YouTube mostró publicidad/estado contaminado dentro del iframe.

Estado:

- `BrowserCabin` muestra captura de la tab gestionada como espejo.
- Botón `▶` activa stream por refresco periódico.
- `browser/text` lee desde la tab gestionada.
- `browser/transcript` existe y prioriza líneas con timestamps cuando la transcripción está abierta.
- `dom/text` se enruta a `browser/text` para evitar leer el DOM de ChatGPT.
- Fix tabs: Browser Cabin crea/reusa tabs solo en ventanas Chrome `normal`; nunca en `popup`/subventanas.

## Validación base — smoke r2 (2026-05-25)

✅ ping · fs/write · fs/read · fs/read-range · shell/run · fs/patch · fs/move · fs/delete · project/grep · project/tree · duplicate ID · rm bloqueado · manualOnly · allowNexusAuto · maxBlocksPerMessage

## Próximos pasos

1. ~~`ASH_CABIN.md`~~ ✅ documentado
2. ~~`@@message` terminal~~ ✅ implementado
3. ~~`@@browser` read-only~~ ✅ implementado (page/info, chat/last-*, dom/count, dom/text)
4. ~~`@@artifact` snapshot~~ ✅ implementado (list, snapshot, write, zip, manifest)
5. ~~`@@llm` dry-run~~ ✅ implementado (provider=debug, model=mock, sin providers reales)
6. Siguiente fase: endurecer parser común y seguir smokes incrementales con ChatGPT web

## Reglas para agentes nuevos

- No usar subagentes sin permiso explícito.
- No reescribir `nexus.py` ni el autoloop sin necesidad.
- Leer estos docs antes de explorar el repo.
- Usar `project/grep` y `fs/read-range` — no abrir archivos completos.
- `aurora/`, `cloud/`, `generated/`, `registry.js` en `au-{id}/` nunca se editan directamente.
