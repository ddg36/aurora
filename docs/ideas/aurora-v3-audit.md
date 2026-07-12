# Aurora v3 — Auditoría y Estado de Arquitectura

> Última actualización: 2026-07-11 — mapeo exacto contra codebase real.
> Reemplaza la sección de arquitectura de `aurora-v2.md` donde diverjan
> (v2 todavía describe gemita; gemita murió, pi es el motor único).

---

## Estado actual

```
┌──────────────────────────────────────────────────┐
│ Chrome ext (thin) │ Browser tabs │ start.sh/.bat  │
└─────────┬────────────────┬───────────────────────┘
          │ iframe/fetch   │ fetch + 2 WebSockets
┌─────────▼────────────────▼───────────────────────┐
│ AURORA SERVER :7779  (Litestar, proceso único)    │
│                                                   │
│  /ui  /db/*  /nexus/*  /voz/*  /mcp  /nav/*       │
│  /lyra      ← WS chat streaming (pi)              │
│  /eventos   ← WS bus Observer (broadcast/usuario) │
│       ▲                                           │
│       │ emitir() post-commit desde routes         │
│  db/connection.py ── SQLite WAL (SSOT)            │
│                                                   │
│  pi/proceso.py ── spawn `pi --mode rpc` (por SO)  │
│  pi/bridge.py  ── RPC JSONL, protocolo Lyra       │
│  browser/      ── browser-use vía /nav/run+stream │
└───────────────────────────────────────────────────┘
```

**El server es el Mediator** (las tabs nunca se hablan entre sí) y el bus
`/eventos` es el **Observer** (las escrituras notifican). No hace falta más
patrón que esos dos.

---

## Correcciones a la auditoría de junio

La auditoría original (pre-v3) tenía dos hallazgos vencidos — quedan
registrados para no re-auditar fantasmas:

1. **"spawn de pi inline en bridge.py:1284"** — falso. Ese subprocess es
   `gh gist create` para `/share`. El spawn de pi vive donde debe:
   `proceso.py::_spawn()` con `_argv_default()` leyendo config. Bridge no
   lanza pi; solo habla RPC con él.
2. **"src/browser es esqueleto Playwright muerto"** — falso. `browser/`
   integra browser-use real: `agent.py` (wrapper con llama-server + CDP
   :9222) y `router.py` (`POST /nav/run`, `GET /nav/stream/:id` SSE),
   consumido por el módulo webnavigator. `/health` reporta
   `webnavigator.disponible`. **No borrar.**

Lo que sí era código muerto — `src/parser/` (endpoint jamás llamado; el
parser real es gem-observer.js en la extensión) — **borrado 2026-07-11**.

---

## Bus de eventos `/eventos` (2026-07)

- **Server** — `src/eventos_ws.py`: registro en memoria
  `dict[usuario_id, set[WebSocket]]`. Proceso único ⇒ sin Redis/pub-sub
  externo. Auth por el guard global existente (`?token=`, igual que /lyra).
  `emitir(usuario_id, tipo, datos)`: broadcast a todas las tabs del usuario,
  poda sockets muertos, jamás propaga error al request que emitió.
  Envelope: `{tipo, datos, ts}`.
- **Cliente** — `ui/components/shared/eventos-ws.js`: singleton, un WS por
  tab, abierto en `boot.js`. Reconexión backoff 1s→30s.
  `onEvento(tipo, cb)` → función de desuscripción; `'*'` recibe todo.
- **Contrato de emisión**: los **routes** llaman `await emitir(...)` tras
  `commit()` — una línea por endpoint que escribe. `connection.py` queda
  limpio a propósito: ve SQL crudo, no sabe usuario ni recurso (stdlib
  sqlite3 no expone update_hook), y mezclar sockets ahí viola 4NF.
  Patrón de referencia: `db/routes/ajustes.py` (PUT y DELETE emiten
  `tipo='ajuste'`, delete con `valor: null`).
- **Regla**: el bus transporta hechos, no resuelve conflictos. Los resuelve
  la DB por orden de llegada (un writer, last-write-wins). Timestamps ya
  viajan en `ts` por si algún día hace falta descartar eventos viejos.

## Persistencia reactiva (2026-07)

`usePersistedState(clave, initial)` (`ui/components/shared/persisted-state.js`):

- Carga inicial de `/db/ajustes/:clave`, escritura vía PUT — como siempre.
- Suscrito a `onEvento('ajuste')`: otra tab escribe la misma clave → esta
  se actualiza en vivo. `valor: null` → vuelve a `initial`.
- **Anti-eco**: ref `raw` con el último valor *serializado* conocido
  (carga, escritura propia o evento). Evento con `valor === raw.current`
  es eco de esta tab → ignorado. Comparación de strings, sin deep-equal,
  sin flag de origen, sin bucles posibles (aplicar un evento nunca hace PUT).

Cadena completa: tab A `PUT /db/ajustes/x` → commit → `emitir()` → WS →
tab B `signal/setState` → re-render. Sin polling, sin reload.

## Pi multiplataforma (2026-07)

El middleware agnóstico al SO **es el server**: las tabs hablan con
`/lyra`, jamás con pi. El único punto SO-dependiente era la config de spawn.

- `pi/config.py`: claves por plataforma en `config/llm.toml` —
  `bin_windows`/`bin_linux`, `runtime_windows`/`runtime_linux`; la clave
  pelada (`bin`, `runtime`) sigue siendo fallback, configs existentes no
  cambian. Defaults: `~/.bun/bin/pi` + `bun` (Linux),
  `~/.bun/bin/pi.cmd` + `bun.exe` (Windows).
- `pi/proceso.py::_argv_default()`: si el bin termina en `.cmd`/`.bat` se
  lanza vía `cmd /c` (CreateProcess no ejecuta shims batch directo) y sin
  runtime aparte — el shim trae el suyo.
- Entry point único: `get_proceso()` + `ensure()` (spawn lazy con lock,
  restart automático si murió). Nadie más lanza pi.

---

## Próximos pasos

```
[ ] browser-use como tool de pi — pi orquesta, /nav ejecuta.
    Camino corto: tool `browser_task(objetivo)` en el registry de tools
    (src/tools/) o expuesta vía MCP, que reutilice browser/agent.py.
    NO desarmar browser-use a tools CDP granulares salvo que el agente
    completo resulte caro/lento.
[ ] Más emisores del bus: chats/mensajes (sidebar de Lyra en vivo),
    md_reader (anotaciones), eventos de pi (estado del motor a todas
    las tabs, no solo a la sesión /lyra activa).
[ ] MD Reader canvas: acción por nodo → evento al bus → Lyra/pi →
    respuesta anclada como anotación. Grafo ya en DB
    (md_reader_files/nodes/edges).
[ ] start.bat + prueba real de spawn pi en Windows.
[ ] Aurora Pro: licencia ed25519 offline + gating de módulos;
    sync nube = export /db/backup cifrado cliente a storage tonto.
[ ] Actualizar aurora-v2.md o marcarlo histórico (describe gemita).
```

## Verificación

- `tests/test_eventos_ws.py` — broadcast, aislamiento por usuario, poda.
- `tests/pi/*` — bridge, retry de proveedor, stats/compactación (pasan
  tras el cambio de `_argv_default`).
- `import main` levanta la app completa con `/eventos` registrado y sin
  `src/parser`.

Correr: `.venv-linux/bin/python3 tests/<archivo>.py` (venv del proyecto,
nunca pip/python global).
