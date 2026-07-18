# CDP Testing — Chrome DevTools Protocol

> Cómo probar la extensión Aurora via Brave/Chrome remoto sin interacción manual.

---

## Requisitos

1. **Brave/Chrome** con remote debugging habilitado
2. **Aurora server** corriendo en `:7779`
3. **Extensión Aurora Hub** cargada en el navegador

---

## 1. Lanzar Brave con debug port

```powershell
Start-Process -FilePath "C:\Users\Administrator\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe" -ArgumentList "--remote-debugging-port=9222","--user-data-dir=$env:TEMP\brave-aurora-debug"
```

Verificar que el debug port está activo:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" | ConvertTo-Json
```

---

## 2. Listar pestañas y targets

```powershell
(Invoke-RestMethod -Uri "http://127.0.0.1:9222/json") | ForEach-Object { "$($_.type): $($_.title) [$($_.id)]" }
```

Retorna:
- `page: Google Gemini [TARGET_ID]` — pestañas de navegador
- `service_worker: Service Worker chrome-extension://.../background.js [SW_ID]` — service worker de la extensión

---

## 3. Abrir nueva pestaña via CDP

```powershell
$browserWs = "ws://127.0.0.1:9222/devtools/browser/BROWSER_ID"
$nav = @{ id = 1; method = "Target.createTarget"; params = @{ url = "https://gemini.google.com/app" } } | ConvertTo-Json -Depth 3
$wsClient = New-Object System.Net.WebSockets.ClientWebSocket
$cts = New-Object System.Threading.CancellationTokenSource
$wsClient.ConnectAsync([System.Uri]$browserWs, $cts.Token).Wait()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($nav)
$wsClient.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
$buffer = New-Object byte[] 4096
$result = $wsClient.ReceiveAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)), $cts.Token).Result
[System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
```

El `targetId` en la respuesta se usa para ejecutar JavaScript en esa pestaña.

---

## 4. Ejecutar JavaScript en una pestaña

```powershell
$pageWs = "ws://127.0.0.1:9222/devtools/page/TARGET_ID"
$eval = @{ id = 1; method = "Runtime.evaluate"; params = @{ expression = "document.title" } } | ConvertTo-Json -Depth 5
$wsClient = New-Object System.Net.WebSockets.ClientWebSocket
$cts = New-Object System.Threading.CancellationTokenSource
$wsClient.ConnectAsync([System.Uri]$pageWs, $cts.Token).Wait()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($eval)
$wsClient.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
$buffer = New-Object byte[] 8192
$result = $wsClient.ReceiveAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)), $cts.Token).Result
[System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
```

---

## 5. Flujo de prueba completo (Gemini)

### 5.1 Verificar que el observer está inyectado

```powershell
# expression: "document.documentElement.dataset.gemObserver || 'NOT'"
# Resultado esperado: "1"
```

### 5.2 Escribir mensaje en el input

```powershell
$eval = @{
    id = 1
    method = "Runtime.evaluate"
    params = @{
        expression = @"
(function() {
    var el = document.querySelector('div[contenteditable]');
    if (!el) return 'NO_INPUT';
    el.focus();
    el.textContent = 'Escribe esto exactamente, sin nada mas:\n\n✦✦✦\necho test\n✦✦✦';
    el.dispatchEvent(new Event('input', {bubbles: true}));
    return 'typed';
})()
"@
    }
} | ConvertTo-Json -Depth 10
```

### 5.3 Click en enviar

```powershell
# Buscar botón con aria-label "Send message"
$eval = @{
    id = 1
    method = "Runtime.evaluate"
    params = @{
        expression = @"
(function() {
    var btns = document.querySelectorAll('button');
    for (var b of btns) {
        var a = b.getAttribute('aria-label') || '';
        if (a.includes('Send') || a.includes('send')) { b.click(); return a; }
    }
    return 'none';
})()
"@
    }
} | ConvertTo-Json -Depth 10
```

### 5.4 Esperar y verificar resultado

```powershell
Start-Sleep -Seconds 20
# Verificar si "aurora terminal" aparece en el DOM
$eval = @{
    id = 1
    method = "Runtime.evaluate"
    params = @{
        expression = @"
(function() {
    var text = document.body.innerText;
    var lines = text.split('\n').filter(function(l) { return l.indexOf('aurora') >= 0; });
    return lines.join(' | ');
})()
"@
    }
} | ConvertTo-Json -Depth 10
```

Resultado esperado:
```
⚙️ echo test | aurora terminal : ⏳ working... | ✨ echo test | aurora terminal : ✨
```

---

## 6. Selectores clave para diferentes LLMs

| LLM | Input selector | Send button | Response container |
|-----|---------------|-------------|-------------------|
| Gemini | `div[contenteditable]` | `button[aria-label="Send message"]` | `model-response` |
| ChatGPT | `#prompt-textarea` | `button[data-testid="send-button"]` | `[data-message-author-role="assistant"]` |
| Claude | `div[contenteditable]` | `button[aria-label="Send Message"]` | `.font-claude-message` |

---

## 7. Service Worker (background.js)

El service worker de la extensión MV3 se terminate cuando idle. Para mantenerlo vivo:

- **Port connections** (`chrome.runtime.connect()`) mantienen el worker vivo mientras hay comunicación activa
- **`chrome.storage.local`** se usa como fallback para persistir resultados si el worker muere

El flujo de comunicación:
```
Content Script → port.postMessage({type:'PROXY_FETCH'})
    → background.js: fetch(:7779/nexus/shell/run)
    → background.js: chrome.storage.local.set({key: result})
    → background.js: port.postMessage(result)  [puede fallar si SW muere]
Content Script ← port.onMessage (si el SW sigue vivo)
Content Script ← chrome.storage.local.get(key) [polling como fallback]
```

---

## 8. Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `gemObserver` es `NOT` | Content script no inyectado | Verificar manifest.json matches, recargar pestaña |
| `aurora terminal : ⏳ working...` sin cambiar | Service worker muerto o key mismatch | Verificar SW activo en `/json`, verificar `chrome.storage.local` tiene el resultado |
| `NO_SEND_BTN` | Página no cargó完全 | `Start-Sleep -Seconds 5` antes de buscar botón |
| `Failed to fetch` desde página | CORS/Private Network Access | Usar background.js proxy (nunca fetch directo desde página) |
| Service worker no aparece en `/json` | Chrome lo terminate | Abrir nueva pestaña del mismo dominio para re-activarlo |
| Resultado nunca llega al DOM | Key mismatch entre content script y background.js | Verificar que `gem-observer.js` envía `key` en el mensaje y `background.js` lo usa |
| Extensión no recarga cambios | Chrome cachea archivos de la extensión | Cerrar Brave, usar `--load-extension=path` al reiniciar |

### 8.1 Bug Fix: Key Mismatch (2026-06-16)

**Problema**: `background.js` creaba su propia `key` para `chrome.storage.local`, pero `gem-observer.js` creaba otra diferente. El resultado se guardaba con una key que el content script nunca consultaba.

**Solución**:
- `gem-observer.js`: enviar `key` en el mensaje `PROXY_FETCH`
- `background.js`: usar `msg.key` en vez de crear una nueva

```javascript
// gem-observer.js — ahora envía la key
port.postMessage({ type: 'PROXY_FETCH', path, body, method: 'POST', key })

// background.js — ahora usa la key del mensaje
const key = msg.key || ('pf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))
```

### 8.3 Falso positivo: `'format '` vs `-Format`

**Problema**: `BLOCK_PATTERNS` incluía `'format '` que matcheaba `-Format` en comandos PowerShell (ej: `Get-Date -Format "yyyy-MM-dd HH:mm"`).

**Solución**: Cambiar `'format '` por `'format c:'` y `'format d:'` (más específico para formateo de disco).

### 8.4 Loop infinito de Gemini

**Problema**: Cuando el usuario envía `✦✦₃ comando ✦✦₃`, Gemini repite el bloque en su respuesta. El observer lo detecta como nuevo comando y lo ejecuta, creando un loop.

**Solución**: Agregar `_processedCmds` Set que almacena comandos ya ejecutados. Si un comando ya fue procesado, se salta.

```javascript
let _processedCmds = new Set()
// En _processText, antes de ejecutar:
blocks = blocks.filter(b => {
  const key = (b.cmd || b.body || '').trim()
  if (!key || _processedCmds.has(key)) return false
  _processedCmds.add(key)
  return true
})
```

### 8.5 Output CRLF de PowerShell

**Problema**: PowerShell en Windows devuelve `\r\n` como line endings. Esto causa problemas al inyectar el resultado en el DOM.

**Solución**: Limpiar `\r` antes de usar el output:
```javascript
let out = (data.stdout || '').replace(/\r/g, '')
let err = (data.stderr || '').replace(/\r/g, '')
```

### 8.6 Recarga de Extensión

Chrome cachea los archivos de la extensión. Para aplicar cambios:

1. Cerrar Brave completamente
2. Reabrir con `--load-extension=path`:
```powershell
Get-Process brave -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath "brave.exe" -ArgumentList "--remote-debugging-port=9222","--user-data-dir=$env:TEMP\brave-aurora-debug","--load-extension=D:\path\to\extensions\aihub"
```

3. Verificar que el service worker aparece en `/json`

---

## 9. Comandos útiles

```powershell
# Verificar server
Invoke-RestMethod -Uri "http://127.0.0.1:7779/ping" -Method GET

# Verificar tareas ejecutadas
Invoke-RestMethod -Uri "http://127.0.0.1:7779/nexus/tasks" -Method GET

# Verificar extensión
Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" | ConvertTo-Json -Depth 3

# Test directo del shell endpoint
$body = '{"cmd":"echo test","cwd":"."}'
$headers = @{"Content-Type" = "application/json"}
Invoke-RestMethod -Uri "http://127.0.0.1:7779/nexus/shell/run" -Method POST -Body $body -Headers $headers
```
