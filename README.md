# Aurora v3

Aurora es un entorno humano/AI que integra una interfaz web, persistencia en
SQLite, extensiones de Chrome, automatización de navegador, voz y un agente LLM
basado en `pi` ejecutado en modo RPC.

La documentación completa y actualizada se encuentra en
[`docs/README.md`](docs/README.md). Ese documento es la **fuente de verdad** del
proyecto; los archivos de `docs/ideas/` contienen contexto histórico y diseños
de funcionalidades específicas.

## Estado y pendientes (checkpoint 2026-07-22)

Antes de retomar trabajo en este repo, leé
[`memorias-para-continuar.md`](memorias-para-continuar.md) — es el handoff
completo de la última sesión (qué se hizo, qué se rompió y arregló, qué
falta). Resumen rápido de lo pendiente:

- **Qwen**: la pestaña de prueba no tiene sesión real (pide login) — falta
  verificar en vivo `getTurnId`/`getNewUserTurnIds`/`findAssistantAfterUserIds`
  del driver, que hoy son stubs.
- **Kimi/Poe**: relays nuevos completos y verificados en vivo, pero
  `attachFiles` quedó deshabilitado en Kimi (mecanismo probado, no confiable
  tras reintentos) y en Perplexity (posible feature de pago).
- **Loop de tools (JSON Family)**: la captura de bloques ```` ```json ```` está
  probada sólida en los 5 relays nuevos (Claude/Grok/Perplexity/Kimi/Poe), pero
  el loop real end-to-end (primer real de Aurora, no uno sintético) no se
  terminó de verificar — el panel Cloud embebido de Aurora no tiene sesión de
  Claude propia (cookie jar separado del tab suelto, pide login + captcha ahí
  dentro).
- **Ramas**: este checkpoint fusiona todas las ramas/worktrees activos
  (`task/*`, `experiment/command-family`, `ember-thought`) a `master` para
  poder continuar desde otra máquina con un solo `git pull`.

## Arquitectura resumida

- **Backend:** Python 3.12, Litestar y aiosqlite en el puerto `7779`.
- **Motor agéntico:** `pi` (`@earendil-works/pi-coding-agent`) mediante RPC
  JSONL.
- **Frontend:** Preact, HTM, Twind y Signals con módulos ES nativos, sin paso de
  compilación.
- **Persistencia:** SQLite en modo WAL con migraciones versionadas.
- **Integraciones:** extensiones Chrome MV3, proveedores Cloud en iframes,
  Playwright/browser-use, MCP, STT y TTS.

## Componentes principales

- `src/`: servidor, puente de `pi`, base de datos, Nexus, herramientas,
  automatización web, voz, MCP y bus de eventos.
- `ui/`: interfaz web modular y cliente WebSocket de Lyra.
- `extensions/`: extensiones Chrome que funcionan como clientes ligeros.
- `config/`: configuración TOML del servidor y sus subsistemas.
- `databases/`: base de datos SQLite local.
- `tests/`: pruebas Python y JavaScript.
- `docs/`: documentación vigente y contexto de diseño.

## Requisitos

- **Python 3.11+** — único requisito para correr Aurora.
- **Node.js** (opcional) — necesario para las tools de Pi. Instalá cualquier
  versión reciente (`node`, `bun` o `nodejs` en PATH).
- **Pi SDK** (opcional) — para el agente de herramientas:
  ```bash
  npm install -g @earendil-works/pi-coding-agent
  ```
- El frontend (Preact, Twind, HTM, Signals) está bundleado en `ui/vendor/` —
  **no se necesita npm ni paso de compilación**.

## Iniciar Aurora

**Linux / macOS:**
```bash
bash scripts/start_fixed.sh
```

**Windows:**
```bat
scripts\start.bat
```

**Manual:**
```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd src && python -m uvicorn main:app --host 127.0.0.1 --port 7779 --reload
```

Después abre `http://localhost:7779/ui` en el navegador.  
La primera vez se mostrará un overlay de bienvenida con el estado de Node.js
y Pi, y luego un login donde escribís tu nombre para crear tu perfil local.

## Verificación rápida

```bash
curl http://localhost:7779/ping
curl http://localhost:7779/setup/status
```

Para conocer la arquitectura, los endpoints, módulos, herramientas, comandos,
configuración, estado de implementación y roadmap, consulta
[`docs/README.md`](docs/README.md).
