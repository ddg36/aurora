# NEXUS_SMOKE_SUITE.md

Suite de smoke tests reproducible para validar Nexus/Ash después de cambios.
Fecha base: 2026-05-25.

## Objetivo

Validar rápidamente que Nexus/Ash sigue sano después de cambios en:
- `nexus.py`
- autoloop (`ash_injector.js`)
- cabina / flight recorder
- policy
- parser de bloques
- sidepanel / recarga de extensión

## Requisitos previos

- Nexus online en `http://127.0.0.1:7777`
- Workspace: `/media/almacen/deml/Downloads/core_instruction/au-ash`
- `autoloopEnabled=true`
- `allowNexusAuto=true`
- `manualOnly=false`
- `maxBlocksPerMessage` recomendado: 5 para esta suite
- Cabina/flight recorder visible si se depuran eventos

---

## Smoke tests

### 1. Ping bridge

```
@@nexus:smoke_001_ping action=shell/run
curl -s http://127.0.0.1:7777/ping
@@end:smoke_001_ping
```

**Expected:** `status=ok`, JSON con `status=online` y workspace correcto.
**Probado:** ✅ 2026-05-25

---

### 2. fs/write + fs/read

```
@@nexus:smoke_002_write action=fs/write path=sandbox/work/smoke_file.txt
SMOKE_FILE_OK
@@end:smoke_002_write

@@nexus:smoke_003_read action=fs/read path=sandbox/work/smoke_file.txt
@@end:smoke_003_read
```

**Expected:** write `status=ok`, read devuelve `SMOKE_FILE_OK`.
**Probado:** ✅ 2026-05-25

---

### 3. fs/patch

```
@@nexus:smoke_004_patch action=fs/patch path=sandbox/work/smoke_file.txt old=SMOKE_FILE_OK
SMOKE_FILE_PATCHED
@@end:smoke_004_patch

@@nexus:smoke_004b_verify action=fs/read path=sandbox/work/smoke_file.txt
@@end:smoke_004b_verify
```

**Expected:** patch `status=ok`, read devuelve `SMOKE_FILE_PATCHED`.

---

### 4. fs/move

```
@@nexus:smoke_005_move action=fs/move from=sandbox/work/smoke_file.txt to=sandbox/work/smoke_moved.txt
@@end:smoke_005_move

@@nexus:smoke_005b_verify action=fs/read path=sandbox/work/smoke_moved.txt
@@end:smoke_005b_verify
```

**Expected:** move `status=ok`, read del destino devuelve contenido.
**Probado:** ✅ 2026-05-25

---

### 5. fs/delete archivo

```
@@nexus:smoke_006_delete action=fs/delete path=sandbox/work/smoke_moved.txt
@@end:smoke_006_delete
```

**Expected:** `status=ok`, archivo eliminado.
**Probado:** ✅ 2026-05-25

---

### 6. fs/delete directorio

```
@@nexus:smoke_007_mkdir action=shell/run
mkdir -p sandbox/work/smoke_dir && echo file > sandbox/work/smoke_dir/file.txt && echo created
@@end:smoke_007_mkdir

@@nexus:smoke_007b_deldir action=fs/delete path=sandbox/work/smoke_dir
@@end:smoke_007b_deldir

@@nexus:smoke_007c_verify action=shell/run
test ! -e sandbox/work/smoke_dir && echo deleted_ok
@@end:smoke_007c_verify
```

**Expected:** directorio eliminado, verify devuelve `deleted_ok`.
**Probado:** ✅ 2026-05-25

---

### 7. project/grep

```
@@nexus:smoke_008_grep action=project/grep pattern=_execute_nexus path=. max=5
@@end:smoke_008_grep
```

**Expected:** resultados en `nexus.py`.

---

### 8. project/tree

```
@@nexus:smoke_009_tree action=project/tree path=. depth=2
@@end:smoke_009_tree
```

**Expected:** árbol básico del workspace.

---

### 9. shell/run básico

```
@@nexus:smoke_010_shell action=shell/run
echo SHELL_OK && pwd
@@end:smoke_010_shell
```

**Expected:** `SHELL_OK` + ruta del workspace raíz.

---

### 10. shell dangerous block (rm)

```
@@nexus:smoke_011_block_rm action=shell/run
rm -f sandbox/work/nope.txt
@@end:smoke_011_block_rm
```

**Expected:** `status=error`, mensaje `Dangerous command blocked: rm`.
**Probado:** ✅ 2026-05-25

---

### 11. maxBlocksPerMessage

Configurar `maxBlocksPerMessage=2`, luego mandar 3 bloques:

```
@@nexus:smoke_012a action=shell/run
echo BLOQUE_1
@@end:smoke_012a

@@nexus:smoke_012b action=shell/run
echo BLOQUE_2
@@end:smoke_012b

@@nexus:smoke_012c action=shell/run
echo BLOQUE_3
@@end:smoke_012c
```

**Expected:** `smoke_012a` y `smoke_012b` devuelven `ok`, `smoke_012c` devuelve `blocked reason=max_blocks_exceeded`.
**Probado:** ✅ 2026-05-25

---

### 12. duplicate id

Mandar dos bloques con el mismo id:

```
@@nexus:smoke_dup_001 action=shell/run
echo PRIMERO
@@end:smoke_dup_001

@@nexus:smoke_dup_001 action=shell/run
echo SEGUNDO
@@end:smoke_dup_001
```

**Expected:** primer bloque `ok`, segundo `blocked reason=already_executed`.
**Probado:** ✅ 2026-05-25

---

### 13. manualOnly=true

Configurar `manualOnly=true`, luego mandar cualquier bloque nuevo.

**Expected:** `status=blocked reason=policy_manual_only`. No hay ejecución.
**Probado:** ✅ 2026-05-25

---

### 14. allowNexusAuto=false

Configurar `allowNexusAuto=false`, mandar bloque nuevo.

**Expected:** `status=blocked reason=policy_channel_disabled`.
**Probado:** ✅ 2026-05-25

---

### 15. realtime watcher

Mandar bloque nuevo sin recargar página.

**Expected:** resultado llega sin reload. Flight recorder muestra: `detected → queued → executing → executed`.
**Probado:** ✅ 2026-05-25

---

### 16. reload safety

Recargar página con bloques viejos visibles en el chat.

**Expected:** autoloop no revive bloques ya ejecutados. No aparecen resultados duplicados.
**Probado:** ✅ 2026-05-25

---

---

### 17. @@message terminal

```
@@message:smoke_msg_001 level=success title="Smoke @@message"
Canal terminal funciona.
@@end:smoke_msg_001
```

**Expected:** `@@message-result:smoke_msg_001 status=ok`, texto visible en DOM, ningún bloque nexus ejecutado.
**Probado:** ✅ 2026-05-25

---

### 18. @@message anti-cascada

```
@@message:smoke_msg_002
Esto NO debe ejecutarse:
@@nexus:cascade_test action=shell/run
echo CASCADA
@@end:cascade_test
@@end:smoke_msg_002
```

**Expected:** `@@message-result:smoke_msg_002 status=ok`, texto visible, `cascade_test` NO ejecutado.
**Probado:** ✅ 2026-05-25

---

## Criterios de fallo

### Bug de Nexus
- Acción soportada devuelve `Unsupported action`
- `fs/read`/`fs/write` falla en sandbox
- `shell/run` no ejecuta comando simple (`echo`)
- Ping bridge falla

### Bug de autoloop
- No detecta bloque nuevo
- Responde con resultado viejo antes que el nuevo
- Duplica resultados
- Revive historial tras reload
- Ignora policy

### No es bug
- Comando escrito mal
- Archivo inexistente por prueba anterior fallida
- `IndentationError` por body Python mal indentado en el bloque
- Policy bloquea y devuelve `status=blocked` — comportamiento correcto

---

## Resultado esperado global

La smoke suite pasa si:
- Acciones core devuelven `ok`
- Policy devuelve `blocked` cuando corresponde
- No hay resultados duplicados
- No hay backlog fantasma tras reload
- `rm` sigue bloqueado
