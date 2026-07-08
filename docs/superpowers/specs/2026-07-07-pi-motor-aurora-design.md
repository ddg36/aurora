# Aurora sobre base pi — Diseño

> Fecha: 2026-07-07 · Estado: aprobado en conversación

## Visión

Aurora deja de ser agente y pasa a ser entorno (harness humano/AI): UI web, DB, puente
Chrome, voz. El cerebro agéntico es pi (`@earendil-works/pi-coding-agent`) corriendo
headless en modo RPC — mismo motor que pi CLI, sin TUI. Un solo agente, dos caras:
terminal (pi CLI) y web (UI Aurora).

Reemplaza a `src/gemita/bucle.py` (loop agéntico propio, inmaduro) como motor del chat
del módulo `local/`. gemita queda como fallback tras flag de config.

## Arquitectura

```
UI web (intacta) ── ws /gemita (protocolo actual) ── Aurora :7779
                                                        src/pi/bridge
                                                        │ stdin/stdout JSONL
                                                     pi --mode rpc (proceso único, vivo)
                                                        │ openai-completions
                                                     llama-server :8080
```

## Componentes

- `src/pi/proceso.py` — spawn de `pi --mode rpc` vía bun (node sistema = v18, incompatible),
  lectura/escritura JSONL (split solo por `\n`), correlación id request/response, restart
  ante crash, shutdown limpio.
- `src/pi/bridge.py` — traducción de eventos:
  - `message_update` (texto) → `token` · (thinking) → `thinking`
  - `tool_execution_start` → `tool_call` · `tool_execution_end` → `tool_result`
  - `agent_end` → `done` · errores → `error`
  - UI `cancel` → `abort` · UI `reset` → `new_session`
  - confirm de pi (Extension UI Protocol) → `confirm_request` de la UI
- `src/pi/router.py` — handler WebSocket `/gemita` cuando `engine = "pi"`. Mismo endpoint,
  UI no cambia.

## Sesiones

Un chat Aurora (`/db/chats`) ↔ una sesión pi (session-id derivado del chat id, vía
`--session-id` / `switch_session`). Contexto vive en el proceso pi + JSONL persistido;
compaction automática la maneja pi. La DB Aurora sigue guardando mensajes para
UI/historial/stats como hoy (lo hace el frontend).

## Tools

Fase 1: tools nativas pi (read/bash/edit/write), cwd = workspace Aurora. Las 13 tools de
gemita no se portan. Fase 2 (spec aparte): extensión `aurora-tools.ts` con
`aurora_yt_transcript` y `aurora_page_capture` vía `POST /ext/cmd` → extensión Chrome
aihub → DOM; misma extensión sirve a pi CLI (flags estilo `--aurora-yt-transcript`) y a
pi bajo Aurora.

## Config

`config/llm.toml`: `engine = "pi" | "gemita"` (default `pi`), path binario pi, runtime
(bun), session-dir, provider/model (default: los de `~/.pi/agent/settings.json`).

## Errores

- pi crashea → `error` a UI + restart automático con backoff.
- llama-server caído → pi reporta error de provider → `error` a UI.
- prompt durante streaming → `streamingBehavior: "steer"`.

## Testing

Stub pi falso (script que habla JSONL por stdin/stdout) para tests del bridge sin LLM.
E2E manual con llama-server + pi real.

## Estado de implementación (2026-07-07)

- Fase 1 (puente) y Fase 2 (tools) implementadas y verificadas e2e el mismo día.
- gemita eliminado (`src/gemita/` borrado; `providers.py` sobrevive movido a `src/llm/`
  porque /health y /tools dependen de él). Sin flag engine: pi es el único motor.
- Extensión pi: `extensions/pi/aurora-tools.ts`, symlinkeada a `~/.pi/agent/extensions/`
  → carga en pi CLI y en pi bajo Aurora. Tools: aurora_yt_transcript, aurora_page_capture,
  aurora_tabs, aurora_screenshot. Flags: `--aurora-yt-transcript`, `--aurora-page`.
  Comandos: `/aurora-yt`, `/aurora-page`.
- background.js de aihub: nuevo cmd `capture_youtube` en el switch de `/ext/cmd`
  (proxy a yt-captures.js con inyección-retry). Requiere recargar la extensión en Chrome.
- Verificado: LLM local llamó aurora_page_capture solo, desde pi CLI y desde el chat web.
