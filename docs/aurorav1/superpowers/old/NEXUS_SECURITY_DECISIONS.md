# NEXUS_SECURITY_DECISIONS.md

Documento de decisiones de seguridad para Nexus/Ash.
Fecha: 2026-05-25.

## Principios

- Nexus puede tocar la PC, por eso debe ser más estricto que otros canales.
- Autoloop debe ser paranoico.
- Manual Run puede ser más explícito, pero siempre visible en eventos.
- Los resultados `blocked` cierran el protocolo y evitan silencio.
- Los resultados nunca se autoejecutan.

## Workspace y límites

- Bridge: `http://127.0.0.1:7777`
- Workspace: `/media/almacen/deml/Downloads/core_instruction/au-ash`
- Base: `/media/almacen/deml/Downloads/core_instruction`
- `_safe()` confina todos los paths al área permitida — paths absolutos fuera de BASE devuelven error.
- `fs/*` opera únicamente dentro del workspace.
- `shell/run` bloquea comandos destructivos conocidos (`rm`, `dd`, `mkfs`, `shred`, etc.).

## Decisiones sobre fs/delete

- **Estado actual:** disponible vía `@@nexus`.
- Puede borrar archivos y directorios completos (`shutil.rmtree`).
- Está confinado por `_safe()` — no puede operar fuera del workspace.
- **Riesgo:** puede borrar archivos del proyecto au-ash si se usa sin cuidado, no solo sandbox.
- **Decisión actual:** permitido, pero debe mantenerse visible en cabina/flight recorder.
- **Recomendación futura:** implementar `fsDeleteMode` en policy (`sandbox-only` | `confirm` | `workspace`).

## Decisiones sobre fs/move

- **Estado actual:** disponible vía `@@nexus`.
- Mueve o renombra dentro del workspace, confinado por `_safe()`.
- Menos destructivo que delete, pero puede alterar estructura del proyecto.
- **Decisión actual:** permitido en workspace.
- **Recomendación futura:** bloquear sobrescritura de destino salvo `overwrite=true` explícito.

## Decisiones sobre shell/run

- `shell/run` y `shell/exec` funcionan y ejecutan bash.
- Comandos destructivos bloqueados: `rm`, `dd`, `mkfs`, `shred`, `wipefs`, `fdisk`, `rmdir`, `del`.
- Patrones bloqueados: `rm -rf`, `rm -fr`, `chmod -R`, `chown -R`.
- Confirmado: `rm` devuelve `blocked/error`, no ejecuta.
- `shell/run` tiene timeout de 30s y límite de salida (20000 chars por defecto).
- **Decisión actual:** mantener lista de bloqueados dura + clasificación por riesgo (`low`/`high`/`block`).

## Policy y autoloop

| Opción | Efecto confirmado |
|---|---|
| `manualOnly=true` | Bloquea autoejecución, devuelve `blocked reason=policy_manual_only` |
| `allowNexusAuto=false` | Bloquea `@@nexus` automático, devuelve `blocked reason=policy_channel_disabled` |
| `maxBlocksPerMessage=N` | Ejecuta N bloques, bloquea el resto con `reason=max_blocks_exceeded` |
| ID duplicado | Primer bloque ejecuta, segundo devuelve `reason=already_executed` |
| Reload con historial | No revive bloques ya ejecutados — `_executedIds` persiste en `sessionStorage` |
| Watcher realtime | Detecta mensaje nuevo cada ~350ms, ejecuta tras ~1100ms de estabilidad |
| Resultado bloqueado | Devuelve `status=blocked reason=...` — nunca silencio, nunca autoejecución |

## Razones de bloqueo confirmadas

- `policy_manual_only`
- `policy_channel_disabled`
- `max_blocks_exceeded`
- `already_executed`
- Comando peligroso (ej: `rm`) — bloqueado antes de exec

## Reglas para canales futuros

| Canal | Regla v2 |
|---|---|
| `@@browser` | Read-only — sin `click`, `type`, `send` todavía |
| `@@llm` | No autoejecutar herramientas generadas — dry-run o manual |
| `@@message` | Solo terminal — sin retransmisión automática |
| `@@artifact` | Preparar paquetes — sin upload automático |

## Pendientes

- Definir `fsDeleteMode` en config.json (`sandbox-only` por defecto recomendado).
- Agregar `dangerousActionsRequireConfirm=true` para `fs/delete` fuera de sandbox.
- Bloquear sobrescritura en `fs/move` salvo `overwrite=true`.
- Crear `NEXUS_SMOKE_SUITE.md` con suite repetible post-cambio.
- Formalizar policy v2 en `au-ash/config.json`.
