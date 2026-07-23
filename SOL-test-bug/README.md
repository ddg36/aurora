# SOL-test-bug — Flujo Lyra Chat / Cloud Tools

## 📁 Estructura

```
SOL-test-bug/
├── README.md              ← Este archivo
├── ui/                    ← Frontend (JavaScript)
│   ├── cloud.js           ← Loop agéntico: parsea tools, ejecuta, reenvía
│   ├── cloud-ask.js       ← Puente parent-side: Lyra ↔ iframe LLM cloud
│   ├── cloud-tool-visual.js ← Visual de tools en UI
│   ├── cloud-bridge-listener.js ← Listener del bridge cloud
│   ├── mensajes.js        ← Gestión de mensajes del chat
│   ├── duo.js             ← Duo Lyra ↔ Nube
│   ├── historial.js       ← Historial de mensajes
│   ├── renderizar.js      ← Renderizado de mensajes
│   ├── api.js             ← Funciones fetch con headers
│   ├── lyra-ws.js         ← WebSocket /lyra
│   └── eventos-ws.js      ← WebSocket /eventos
├── backend/               ← Servidor Python (Litestar)
│   ├── cloud_tools.py     ← Ejecución de tools (read/bash/edit/write)
│   ├── cloud_executor.py  ← Executor de cloud tools
│   ├── proceso.py         ← Proceso de pi agent
│   ├── bridge.py          ← Bridge de pi agent
│   ├── router.py          ← Rutas /pi/*
│   ├── config.py          ← Configuración
│   └── auth.py            ← Autenticación (token validation)
├── extensions/            ← Extensión Chrome AI Hub
│   ├── manifest.json      ← Manifest de la extensión
│   ├── background.js      ← Service worker (bridge ext ↔ server)
│   └── aurora-bridge.js   ← Bridge entre extensión y iframe Aurora
└── content-scripts/       ← Content scripts inyectados en iframes
    ├── cloud-relay.js     ← Relay Lyra ↔ LLM cloud (detecta respuestas)
    ├── ai-bridge.js       ← Bridge AI
    ├── aurora-visibility-shim.js ← Visibility shim
    ├── gem-observer.js    ← Observer de Gemini
    └── session-sniffer.js ← Session sniffer
```

## 🔄 Flujo de Cloud Tools

```
1. Usuario envía mensaje → UI (cloud.js)
2. UI llama askCloud() → iframe ChatGPT (cloud-ask.js)
3. ChatGPT genera respuesta + JSON de tool
4. cloud-relay.js detecta respuesta en DOM del iframe
5. cloud-relay.js envía AURORA_CLOUD_ANSWER al parent
6. cloud.js parsea tool con parsearToolCalls()
7. cloud.js llama postJSON('/pi/cloud-tool', {tool, args})
8. Server ejecuta tool (cloud_tools.py)
9. Server devuelve {ok, output, is_error}
10. cloud.js muestra resultado en el chat
```

## 🐛 Bug Reportado

**Síntoma:** Se congela al enviar mensaje con tool.
**Ubicación:** Probablemente en el paso 4-5 (relay no detecta respuesta).
**Hipótesis:** cloud-relay.js no tiene acceso al DOM del iframe.

## 🔍 Archivos Clave para Debug

1. `cloud-relay.js` — Content script que se inyecta en el iframe
2. `cloud-ask.js` — Puente parent-side que envía/recibe mensajes
3. `cloud.js` — Loop agéntico que parsea y ejecuta tools
4. `manifest.json` — Permisos y configuración de content scripts
5. `auth.py` — Validación de token (si hay problemas de auth)

## 📝 Notas

- El flujo usa `world: "MAIN"` en el manifest para que cloud-relay.js tenga acceso al DOM
- Las tools se ejecutan en el server via POST /pi/cloud-tool
- El resultado se muestra en el mismo chat de Lyra
- MAX_ITER = 999 (loop máximo de iteraciones)
