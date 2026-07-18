# SOL debug tools

`sol-debug.py` ofrece acciones semánticas sobre Aurora/Helium CDP `:9222`.
Autodetecta el iframe `http://localhost:7779/ui/` y evita repetir expresiones
JavaScript largas.

Cada flag funciona como una pequeña *skill* de diagnóstico. Los flags de acción
son mutuamente excluyentes; `--pane`, `--timeout`, `--file` y `--image` los
configuran sin tener que editar JavaScript.

La salida es silenciosa durante la ejecución: se imprime solamente el resultado
final. Un watchdog convierte la ausencia de respuesta en `poll_timeout` y código
de salida distinto de cero. Las fases internas siguen guardadas en la traza del
navegador; `--verbose` permite verlas en vivo únicamente al investigar un fallo.

```bash
python3 scripts/SOL-debug-tools/sol-debug.py --targets
python3 scripts/SOL-debug-tools/sol-debug.py --contracts
python3 scripts/SOL-debug-tools/sol-debug.py --relay-doctor
python3 scripts/SOL-debug-tools/sol-debug.py --relay-load 100
python3 scripts/SOL-debug-tools/sol-debug.py --reinject-relays
python3 scripts/SOL-debug-tools/sol-debug.py --json-family-run relay-v1-abc123
python3 scripts/SOL-debug-tools/sol-debug.py --view lyra
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-cloud
python3 scripts/SOL-debug-tools/sol-debug.py --click 'Tool Forge'
python3 scripts/SOL-debug-tools/sol-debug.py --status
python3 scripts/SOL-debug-tools/sol-debug.py --full-reload
python3 scripts/SOL-debug-tools/sol-debug.py --background
python3 scripts/SOL-debug-tools/sol-debug.py --foreground
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-send 'Respondé OK'
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-local-send 'Usa read y responde OK' --timeout 120
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-send 'Leé el archivo' --file /tmp/x.txt
python3 scripts/SOL-debug-tools/sol-debug.py --cloud-ask 'Respondé OK' --pane izq
python3 scripts/SOL-debug-tools/sol-debug.py --new-chat --pane izq
python3 scripts/SOL-debug-tools/sol-debug.py --cloud-ask 'Leé el archivo' --file /tmp/x.txt
python3 scripts/SOL-debug-tools/sol-debug.py --cloud-ask 'Describí la imagen' --image /tmp/x.png
python3 scripts/SOL-debug-tools/sol-debug.py --cloud-stop --pane cloud
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-stop
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-enter 'segundo mensaje durante generación'
python3 scripts/SOL-debug-tools/sol-debug.py --chaos-web crm --timeout 150
python3 scripts/SOL-debug-tools/sol-debug.py --lyra-send 'Genera algo largo' --expect-cancel
python3 scripts/SOL-debug-tools/sol-debug.py --trace 30 --pane cloud
python3 scripts/SOL-debug-tools/sol-debug.py --shot /tmp/aurora.png
python3 scripts/SOL-debug-tools/sol-debug.py --cloud-ask 'Respondé OK' --verbose
```

## Contratos y diagnóstico

- `--contracts`: ejecuta las suites canónicas de JSON Family, Relay Family,
  Endpoint Registry, Relay Reinjector, frontera Cloud, pureza del proveedor y
  visuales de tools. La
  frontera falla si reaparece un dispatcher directo que evite JSON Family. Usa
  siempre `.venv-linux/bin/python`, nunca el Python del sistema, y devuelve un
  resumen único con exit code por suite.
- `--relay-doctor`: inventaría OOPIF Cloud y tabs normales con Relay activo.
  Consulta semánticamente composer, Send, Stop y turnos; además muestra Surface
  Context, `endpointId`, estado durable y el registro central. Comprueba la cadena
  `cloud-relay → relay-core → driver → provider-relay → Endpoint Registry` sin
  codificar selectores del proveedor en la herramienta. Después de recargar la
  extensión, el Registry es autoritativo frente a datasets que pueda dejar un
  mundo isolated invalidado; tabs `frozen/offline` se reportan como diferidas.
- `--relay-load N`: dispara en paralelo un mínimo de diez endpoints simulados
  en estado `generating` (100 por defecto), resuelve todas sus rutas al mismo
  tiempo, fuerza un rebind y los libera concurrentemente. Falla ante IDs/rutas
  cruzadas, selección ambigua o protección anti-discard huérfana.
- `--reinject-relays`: hace ping a cada courier y recupera únicamente las capas
  ausentes. No navega, no recarga y no pulsa Stop; reporta `alive`,
  `reconnected`, `ignored` o `deferred_frozen/discarded` por frame.
- `--lyra-cloud`: abre Lyra y activa su botón interno “Cloud Backend”. Evita la
  ambigüedad con la pestaña global Cloud y espera el placeholder real.
- `--json-family-run REQUEST_ID`: resume estado, timestamps, tools, imagen y
  ACK desde el journal durable, omitiendo `response_json` y base64 grandes.

Estas flags orquestan los tests, pero no los reemplazan: las aserciones viven
en `tests/` para que también puedan ejecutarse en CI.

## Capas de prueba

- `--lyra-send`: prueba de extremo a extremo. Escribe en el textarea real,
  adjunta mediante el selector nativo, pulsa el botón de envío y verifica
  composer, indicador de generación, Stop, historial y respuesta final.
- `--lyra-local-send`: prueba separada del modo local. Abre Lyra, desactiva
  Cloud si estaba persistido, escribe en el mismo chatbox y verifica el ciclo
  `Lyria → WebSocket → Pi RPC`. También exige envelopes `pi_event` v1 y
  correlaciona cada `tool_execution_start/end` por el `toolCallId` oficial,
  sin guardar outputs extensos ni imágenes base64 en la traza.
- `--cloud-ask`: prueba de componente. Entra directamente por `askCloud`; sirve
  para aislar relay e iframes en la vista Cloud (`--pane izq|der|cloud`). No se
  considera una prueba suficiente de la interfaz de Lyra.
- `--new-chat`: abre el control nativo de conversación nueva del proveedor y no
  termina hasta que el relay confirme URL, composer y DOM limpios. Es útil para
  detectar contaminación entre ejecuciones Arena.

## Escenarios web de estrés

`--chaos-web landing|crm|game|kanban|scheduler` encarga a la nube construir un
HTML autocontenido mediante varias tools reales. Además del token final, la CLI
comprueba que el archivo exista, supere 3 KB e incluya marcadores funcionales
propios de cada escenario. Los artefactos se guardan en
`/tmp/aurora-web-chaos/`. Para modelos de razonamiento se recomienda
`--timeout 260`; el relay y el padre conservan un máximo finito de 240 s por
turno Cloud.

## Recarga completa de desarrollo

```bash
python3 scripts/SOL-debug-tools/sol-debug.py --full-reload --timeout 30
```

`--full-reload` recarga Aurora Hub mediante `chrome.runtime.reload()`, abre una
única pestaña nueva de la extensión (cierra shells `newtab.html` anteriores),
espera su iframe específico de Aurora, pulsa su botón nativo
de hard reload y no termina hasta confirmar el remount cache-busted. Esto carga
también la versión actual de los content scripts como `cloud-relay.js`. Antes de
recargar inventaría todos los OOPIF de proveedores Cloud; los hijos de Aurora
son destruidos con su página y cualquier iframe LLM que sobreviva se navega de
nuevo para forzar la reinyección. El resultado informa `allIframesInvalidated`,
`iframesBefore` y cualquier fallo individual.
Si Helium bloquea la apertura CDP directa de `chrome-extension://`, la tool
reutiliza el target creado y lo navega mediante `Page.navigate`; no confunde
`ERR_BLOCKED_BY_CLIENT` con un timeout de Aurora.

Los prompts Cloud se ejecutan como jobs dentro del navegador y se consultan por
ID. Así el WebSocket CDP no necesita permanecer abierto durante toda la
generación.

## Estado de la campaña Cloud

Verificado de extremo a extremo el 2026-07-13:

- Gemini y ChatGPT ejecutan `read`, `bash`, `edit` y `write` desde el chatbox
  nativo de Lyra.
- Un archivo inexistente devuelve error visual y el loop continúa sin congelar
  la interfaz.
- Stop, segundo plano, colas, adjuntos de texto/imagen y respuestas de
  razonamiento largas fueron ejercitados.
- Stop también cancela la fase previa a la respuesta: si el proveedor acepta
  el envío pero nunca crea un contenedor, el relay ya no espera todo el timeout.
- Los escenarios `landing`, `crm`, `game`, `kanban` y `scheduler` crearon HTML
  reales y superaron sus validaciones de contenido.
- Cloud Split mantuvo ambos OOPIF visibles mientras Gemini y ChatGPT se
  comunicaron bidireccionalmente mediante `panel_send`.
- ChatGPT se recuperó de `panel_send` a un destino inválido: Aurora mostró el
  error, aceptó el reintento a Panel 1 y Gemini recibió el handoff correcto.
- Autoenvío y mensaje vacío fueron rechazados sin romper el turno; después del
  feedback, un handoff válido se entregó y Stop canceló al receptor atascado.
- `--new-chat` confirmó aislamiento físico y después ambos relays continuaron
  respondiendo desde conversaciones limpias de Gemini y ChatGPT.
- `write/edit` producen tarjetas de artefacto; HTML abre en preview sandbox y
  Lyra lo carga en Canvas.

Pendiente de automatizar en esta CLI:

- completar la chaos suite de `panel_send` (ping-pong acotado, timeout completo,
  receptor recargado y background);
- matriz de proveedores DeepSeek/GLM/Kimi;
- aserciones visuales de tarjetas y actualización de artefactos después de
  `edit`.

`--cloud-ask` sirve para aislar relay, pero las regresiones de Lyra deben cerrar
siempre con `--lyra-send`: pasar directamente al iframe no prueba el composer ni
el estado de la interfaz de Aurora.

`--click` reconoce botones, chips, enlaces, elementos con `role=button` y
`summary`; sirve para conducir controles Preact semánticos sin escribir un
selector CDP nuevo para cada pantalla.

Para probar el puente AIHub sin saltarse el transporte real, usar `--eval` sólo
como cliente HTTP de la tool (el cambio de vista y la acción vuelven por el bus):

```bash
python3 scripts/SOL-debug-tools/sol-debug.py --eval \
  'import("/ui/components/shared/api.js").then(({postJSON}) => postJSON("/tools/view_invoke/run", {arguments:{view:"aurora",action:"status",args:{}}}))'
```
