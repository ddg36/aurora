# Immersive Reader — VS Code Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensión de VS Code que abre un lector inmersivo con visual Aurora para archivos `.md` y `.txt`, activado con un botón en la Activity Bar.

**Architecture:** La extensión registra un `WebviewPanel` que convierte el archivo activo a HTML usando `marked.js` (bundleado), aplica CSS con tokens Aurora y un canvas animado Starfield vanilla portado de `au-aihub/ui/themes/backgrounds/Starfield.js`. El botón vive en la Activity Bar como un `WebviewViewProvider`.

**Tech Stack:** VS Code Extension API, HTML/CSS/JS vanilla, marked.js (CDN via allowedScripts)

---

## Estructura de archivos

```
~/Downloads/vscode_extension/
  package.json          — manifest de la extensión VS Code
  extension.js          — entry point, registra comando + Activity Bar provider
  src/
    reader.js           — WebviewPanel: convierte MD/TXT a HTML y lo muestra
    starfield.js        — canvas animado Starfield (portado de Aurora, vanilla)
  media/
    immersive.css       — tokens Aurora + estilos de markdown
    marked.min.js       — parser de markdown (descargado en Task 1)
```

---

## Task 1: Scaffold del proyecto

**Files:**
- Create: `~/Downloads/vscode_extension/package.json`
- Create: `~/Downloads/vscode_extension/extension.js`

- [ ] **Step 1: Crear la carpeta**

```bash
mkdir -p ~/Downloads/vscode_extension/src
mkdir -p ~/Downloads/vscode_extension/media
```

- [ ] **Step 2: Descargar marked.min.js**

```bash
curl -L https://cdn.jsdelivr.net/npm/marked/marked.min.js -o ~/Downloads/vscode_extension/media/marked.min.js
```

Verificar: `wc -c ~/Downloads/vscode_extension/media/marked.min.js` debe mostrar > 50000 bytes.

- [ ] **Step 3: Crear package.json**

```json
{
  "name": "immersive-reader",
  "displayName": "Immersive Reader",
  "description": "Lector inmersivo con visual Aurora para MD y TXT",
  "version": "0.1.0",
  "engines": { "vscode": "^1.80.0" },
  "categories": ["Other"],
  "activationEvents": ["onCommand:immersive-reader.open"],
  "main": "./extension.js",
  "contributes": {
    "commands": [
      {
        "command": "immersive-reader.open",
        "title": "Abrir Immersive Reader",
        "icon": "$(eye)"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "immersive-reader.open",
          "when": "resourceExtname == .md || resourceExtname == .txt",
          "group": "navigation"
        }
      ]
    }
  }
}
```

- [ ] **Step 4: Crear extension.js (entry point mínimo)**

```js
const vscode = require('vscode');
const { openImmersiveReader } = require('./src/reader');

function activate(context) {
  const cmd = vscode.commands.registerCommand('immersive-reader.open', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    openImmersiveReader(context, editor.document);
  });
  context.subscriptions.push(cmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
```

- [ ] **Step 5: Verificar sintaxis**

```bash
node --check ~/Downloads/vscode_extension/extension.js
```

Expected: sin output (sin errores).

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/vscode_extension
git init
git add .
git commit -m "feat: scaffold extensión Immersive Reader"
```

---

## Task 2: CSS Aurora para Markdown

**Files:**
- Create: `~/Downloads/vscode_extension/media/immersive.css`

- [ ] **Step 1: Crear immersive.css con tokens Aurora y estilos de markdown**

```css
/* ── Tokens Aurora ── */
:root {
  --aurora-bg:         #0a0a12;
  --aurora-text:       #e8e8e8;
  --aurora-text-muted: #9a99a8;
  --aurora-success:    #4ade80;
  --aurora-warning:    #fbbf24;
  --aurora-accent:     #67e8f9;
  --aurora-error:      #fb923c;
  --aurora-link:       #a78bfa;
  --aurora-surface:    rgba(255,255,255,0.04);
  --aurora-border:     rgba(255,255,255,0.08);
  --aurora-font-sans:  'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --aurora-font-mono:  'Consolas', 'Fira Mono', monospace;
}

/* ── Reset y base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%; height: 100%;
  background: transparent;
  color: var(--aurora-text);
  font-family: var(--aurora-font-sans);
  font-size: 16px;
  line-height: 1.8;
  overflow-x: hidden;
}

/* ── Canvas de fondo ── */
#bg-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* ── Contenedor del contenido ── */
#content {
  position: relative;
  z-index: 1;
  max-width: 72ch;
  margin: 0 auto;
  padding: 3rem 2rem 6rem;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(2px);
  min-height: 100vh;
}

/* ── Tipografía Markdown ── */
h1, h2, h3, h4, h5, h6 {
  color: var(--aurora-accent);
  font-weight: 700;
  margin: 2rem 0 0.75rem;
  line-height: 1.3;
}
h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }
h4, h5, h6 { font-size: 1rem; }

strong, b {
  color: var(--aurora-success);
  font-weight: 700;
}

em, i {
  color: var(--aurora-warning);
  font-style: italic;
}

a {
  color: var(--aurora-link);
  text-decoration: underline;
  text-underline-offset: 3px;
}
a:hover { opacity: 0.8; }

p { margin: 0.75rem 0; }

code {
  font-family: var(--aurora-font-mono);
  color: var(--aurora-error);
  background: var(--aurora-surface);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}

pre {
  background: var(--aurora-surface);
  border: 1px solid var(--aurora-border);
  border-radius: 8px;
  padding: 1.25rem;
  overflow-x: auto;
  margin: 1.25rem 0;
}
pre code {
  background: none;
  padding: 0;
  color: var(--aurora-text);
  font-size: 0.875rem;
}

blockquote {
  border-left: 3px solid var(--aurora-accent);
  margin: 1rem 0;
  padding: 0.5rem 0 0.5rem 1.25rem;
  color: var(--aurora-text-muted);
}

ul, ol { padding-left: 1.5rem; margin: 0.75rem 0; }
li { margin: 0.3rem 0; }

hr {
  border: none;
  border-top: 1px solid var(--aurora-border);
  margin: 2rem 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25rem 0;
  font-size: 0.9rem;
}
th {
  color: var(--aurora-accent);
  border-bottom: 2px solid var(--aurora-border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}
td {
  border-bottom: 1px solid var(--aurora-border);
  padding: 0.5rem 0.75rem;
}
tr:hover td { background: var(--aurora-surface); }

img { max-width: 100%; border-radius: 8px; margin: 1rem 0; }
```

- [ ] **Step 2: Commit**

```bash
cd ~/Downloads/vscode_extension
git add media/immersive.css
git commit -m "feat: CSS Aurora para markdown inmersivo"
```

---

## Task 3: Canvas Starfield (vanilla)

**Files:**
- Create: `~/Downloads/vscode_extension/src/starfield.js`

Este archivo es una versión vanilla del Starfield de Aurora — sin Preact, sin imports, solo funciones puras.

- [ ] **Step 1: Crear starfield.js**

```js
function initStarfield(canvas) {
  const ctx = canvas.getContext('2d');
  let W, H, stars, bursts, animId;
  let accentRgb = [103, 232, 249]; // celeste Aurora por defecto

  const rand = (a, b) => a + Math.random() * (b - a);

  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };

  const makeStar = () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: rand(0.4, 1.6),
    speed: rand(0.03, 0.18),
    opacity: rand(0.2, 0.9),
    drift: rand(-0.04, 0.04),
    twinkleSpeed: rand(0.005, 0.02),
    twinklePhase: Math.random() * Math.PI * 2,
  });

  const makeBurst = (x, y) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(0.3, 1.8);
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: rand(0.5, 2.0),
      life: 1.0,
      decay: rand(0.004, 0.012),
    };
  };

  const spawnBurst = () => {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const count = Math.floor(rand(6, 18));
    for (let i = 0; i < count; i++) bursts.push(makeBurst(x, y));
  };

  const draw = () => {
    const [ar, ag, ab] = accentRgb;
    ctx.fillStyle = `rgb(${Math.max(1, Math.round(ar * 0.01))},${Math.max(0, Math.round(ag * 0.005))},${Math.max(2, Math.round(ab * 0.015))})`;
    ctx.fillRect(0, 0, W, H);

    const t = performance.now() * 0.001;

    for (const s of stars) {
      s.twinklePhase += s.twinkleSpeed;
      const tw = 0.5 + 0.5 * Math.sin(s.twinklePhase);
      const op = s.opacity * (0.4 + 0.6 * tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${op})`;
      ctx.fill();
      s.y -= s.speed;
      s.x += s.drift;
      if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
      if (s.x < -2) s.x = W + 2;
      if (s.x > W + 2) s.x = -2;
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.x += b.vx; b.y += b.vy;
      b.life -= b.decay;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ar},${ag},${ab},${b.life * 0.8})`;
      ctx.fill();
    }

    animId = requestAnimationFrame(draw);
  };

  const init = () => {
    resize();
    stars = Array.from({ length: 180 }, makeStar);
    bursts = [];
    spawnBurst();
    setInterval(spawnBurst, 2500);
    draw();
  };

  window.addEventListener('resize', resize);
  init();

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', resize);
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Downloads/vscode_extension
git add src/starfield.js
git commit -m "feat: canvas Starfield vanilla portado de Aurora"
```

---

## Task 4: WebviewPanel — reader.js

**Files:**
- Create: `~/Downloads/vscode_extension/src/reader.js`

- [ ] **Step 1: Crear reader.js**

```js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function openImmersiveReader(context, document) {
  const panel = vscode.window.createWebviewPanel(
    'immersiveReader',
    '👁 ' + path.basename(document.fileName),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'media')),
        vscode.Uri.file(path.join(context.extensionPath, 'src')),
      ],
    }
  );

  const cssUri     = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'immersive.css')));
  const markedUri  = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'marked.min.js')));
  const sfUri      = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'starfield.js')));

  const raw = document.getText();
  const isMarkdown = document.fileName.endsWith('.md');

  panel.webview.html = buildHtml(cssUri, markedUri, sfUri, raw, isMarkdown);
}

function buildHtml(cssUri, markedUri, sfUri, raw, isMarkdown) {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cssUri}; script-src 'unsafe-inline' ${markedUri} ${sfUri}; img-src data: https:;">
  <link rel="stylesheet" href="${cssUri}">
  <title>Immersive Reader</title>
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div id="content"></div>
  <script src="${markedUri}"></script>
  <script src="${sfUri}"></script>
  <script>
    const raw = "${escaped.replace(/\n/g, '\\n').replace(/'/g, "\\'")}";
    const isMarkdown = ${isMarkdown};
    const content = document.getElementById('content');
    if (isMarkdown) {
      content.innerHTML = marked.parse(raw);
    } else {
      content.innerHTML = '<pre>' + raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') + '</pre>';
    }
    const canvas = document.getElementById('bg-canvas');
    initStarfield(canvas);
  </script>
</body>
</html>`;
}

module.exports = { openImmersiveReader };
```

- [ ] **Step 2: Verificar sintaxis**

```bash
node --check ~/Downloads/vscode_extension/src/reader.js
```

Expected: sin output.

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/vscode_extension
git add src/reader.js
git commit -m "feat: WebviewPanel reader con Starfield y markdown"
```

---

## Task 5: Instalar y probar en VS Code

**Files:** ninguno nuevo — solo prueba

- [ ] **Step 1: Abrir la extensión en VS Code con F5**

```bash
code ~/Downloads/vscode_extension
```

Dentro de VS Code: presionar `F5` para abrir la ventana de desarrollo de extensión (Extension Development Host).

- [ ] **Step 2: Abrir un archivo .md en la ventana de desarrollo**

Abrir cualquier archivo `.md` del proyecto, por ejemplo:
```
/media/almacen/deml/Downloads/core_instruction/README.md
```

- [ ] **Step 3: Verificar que aparece el botón 👁 en la barra de título del editor**

El ícono `$(eye)` debe aparecer en los botones superiores del editor (junto a los de split, etc.) cuando el archivo activo es `.md` o `.txt`.

- [ ] **Step 4: Clickear el botón y verificar el panel**

El panel debe abrirse al lado con:
- Fondo oscuro con estrellas animadas
- Títulos en celeste
- Negritas en verde
- Cursivas en amarillo
- Código en naranja

- [ ] **Step 5: Si algo falla, revisar la consola de desarrollo**

En la ventana Extension Development Host: `Help > Toggle Developer Tools > Console`.

- [ ] **Step 6: Commit final**

```bash
cd ~/Downloads/vscode_extension
git add .
git commit -m "feat: Immersive Reader v0.1 funcional"
```

---

## Self-Review

**Spec coverage:**
- ✅ Botón en barra superior del editor (editor/title menu)
- ✅ Soporte `.md` y `.txt`
- ✅ Panel al lado (ViewColumn.Beside)
- ✅ Starfield animado
- ✅ Tokens Aurora: celeste títulos, verde negritas, amarillo cursivas, naranja código, violeta links
- ✅ Tipografía Inter, line-height generoso, max-width 72ch

**Placeholders:** ninguno.

**Type consistency:** `openImmersiveReader`, `initStarfield`, `buildHtml` — consistentes en todos los archivos.
