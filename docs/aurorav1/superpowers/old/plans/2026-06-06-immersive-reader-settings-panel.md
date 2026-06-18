# Immersive Reader — Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un sidebar de configuración al lector inmersivo con control de backgrounds, colores, tipografía y efectos.

**Architecture:** El sidebar es un panel lateral izquierdo colapsable dentro del Webview. El estado de configuración se guarda en `localStorage` del Webview y se aplica via variables CSS en `:root`. Cada background es una función vanilla JS en `src/backgrounds/`. Un módulo `settings.js` maneja la UI del panel y aplica los cambios en tiempo real.

**Tech Stack:** HTML/CSS/JS vanilla, CSS custom properties, Canvas API, localStorage

---

## Estructura de archivos

```
~/Downloads/vscode_extension/
  src/
    backgrounds/
      starfield.js      — ya existe (mover desde src/starfield.js)
      particles.js      — nuevo (portado de Aurora)
      fireflies.js      — nuevo (portado de Aurora)
      rain.js           — nuevo (portado de Aurora)
    settings.js         — UI del panel + aplicación de config
    reader.js           — modificar: integrar settings panel en HTML
  media/
    immersive.css       — modificar: variables CSS controlables, estilos del panel
    settings.css        — nuevo: estilos del sidebar de configuración
```

---

## Task 1: Reorganizar backgrounds — mover starfield a su carpeta

**Files:**
- Create: `~/Downloads/vscode_extension/src/backgrounds/starfield.js`
- Delete: `~/Downloads/vscode_extension/src/starfield.js`
- Modify: `~/Downloads/vscode_extension/src/reader.js`

- [ ] **Step 1: Crear carpeta y mover starfield**

```bash
mkdir -p ~/Downloads/vscode_extension/src/backgrounds
cp ~/Downloads/vscode_extension/src/starfield.js ~/Downloads/vscode_extension/src/backgrounds/starfield.js
```

- [ ] **Step 2: Verificar que el archivo existe**

```bash
ls ~/Downloads/vscode_extension/src/backgrounds/
```
Expected: `starfield.js`

- [ ] **Step 3: Actualizar la ruta en reader.js**

En `~/Downloads/vscode_extension/src/reader.js`, cambiar:
```js
const sfUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'starfield.js')));
```
por:
```js
const sfUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'backgrounds', 'starfield.js')));
```

También agregar al `localResourceRoots`:
```js
vscode.Uri.file(path.join(context.extensionPath, 'src', 'backgrounds')),
```

- [ ] **Step 4: Verificar sintaxis**

```bash
node --check ~/Downloads/vscode_extension/src/reader.js
```
Expected: sin output.

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/vscode_extension
git add src/backgrounds/starfield.js src/reader.js
git commit -m "refactor: mover starfield a src/backgrounds/"
```

---

## Task 2: Portar backgrounds — Particles, Fireflies, Rain

**Files:**
- Create: `~/Downloads/vscode_extension/src/backgrounds/particles.js`
- Create: `~/Downloads/vscode_extension/src/backgrounds/fireflies.js`
- Create: `~/Downloads/vscode_extension/src/backgrounds/rain.js`

Cada archivo exporta una función `init<Name>(canvas, accentRgb)` que retorna un cleanup `() => void`. El `accentRgb` es un array `[r, g, b]` que se puede actualizar externamente via `window.bgAccent`.

- [ ] **Step 1: Crear particles.js**

```js
function initParticles(canvas, accentRgb) {
  const ctx = canvas.getContext('2d');
  const COUNT = 60, CONNECT_DIST = 130;
  let W, H, particles, animId;
  let rgb = accentRgb || [0, 229, 255];

  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };

  const makeParticle = () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.2 + Math.random() * 0.4;
    return {
      x: Math.random() * W, y: Math.random() * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 1.2 + Math.random() * 1.8,
    };
  };

  const draw = () => {
    const [ar, ag, ab] = window.bgAccent || rgb;
    ctx.fillStyle = `rgb(${Math.max(0,Math.round(ar*0.008))},${Math.max(0,Math.round(ag*0.01))},${Math.max(2,Math.round(ab*0.018))})`;
    ctx.fillRect(0, 0, W, H);

    for (const p of particles) {
      p.x += p.vx * (window.bgSpeed || 1);
      p.y += p.vy * (window.bgSpeed || 1);
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ar},${ag},${ab},0.8)`;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DIST) {
          const alpha = (1 - dist / CONNECT_DIST) * 0.45;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    animId = requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize);
  resize();
  particles = Array.from({ length: COUNT }, makeParticle);
  draw();

  return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
}
```

- [ ] **Step 2: Crear fireflies.js**

```js
function initFireflies(canvas, accentRgb) {
  const ctx = canvas.getContext('2d');
  const COUNT = 45;
  let W, H, flies, animId;

  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };

  const makeFly = () => ({
    x: Math.random() * (W||800), y: Math.random() * (H||600),
    cx: Math.random() * (W||800), cy: Math.random() * (H||600),
    angle: Math.random() * Math.PI * 2,
    orbitR: 20 + Math.random() * 80,
    speed: (0.004 + Math.random() * 0.008) * (Math.random() > 0.5 ? 1 : -1),
    phase: Math.random() * Math.PI * 2,
    pSpeed: 0.02 + Math.random() * 0.04,
    r: 1.5 + Math.random() * 2.5,
  });

  const draw = () => {
    const [ar, ag, ab] = window.bgAccent || accentRgb || [255, 224, 102];
    const spd = window.bgSpeed || 1;
    ctx.fillStyle = `rgb(${Math.max(1,Math.round(ar*0.014))},${Math.max(0,Math.round(ag*0.01))},${Math.max(0,Math.round(ab*0.005))})`;
    ctx.fillRect(0, 0, W, H);

    for (const f of flies) {
      f.angle += f.speed * spd;
      f.phase += f.pSpeed * spd;
      f.x = f.cx + Math.cos(f.angle) * f.orbitR;
      f.y = f.cy + Math.sin(f.angle) * f.orbitR;

      const pulse = 0.5 + 0.5 * Math.sin(f.phase);
      const alpha = 0.4 + pulse * 0.55;
      const radius = f.r * (0.7 + pulse * 0.6);

      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius * 6);
      glow.addColorStop(0,   `rgba(${ar},${ag},${ab},${alpha * 0.5})`);
      glow.addColorStop(0.4, `rgba(${ar},${ag},${ab},${alpha * 0.15})`);
      glow.addColorStop(1,   `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(f.x, f.y, radius * 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
    animId = requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize);
  resize();
  flies = Array.from({ length: COUNT }, makeFly);
  draw();

  return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
}
```

- [ ] **Step 3: Crear rain.js**

```js
function initRain(canvas, accentRgb) {
  const ctx = canvas.getContext('2d');
  let W, H, drops, animId;

  const makeDrop = () => ({
    x: Math.random() * (W || 800),
    y: Math.random() * (H || 600) * -1,
    len: 8 + Math.random() * 24,
    speed: 3 + Math.random() * 6,
    width: 0.5 + Math.random() * 1.2,
    alpha: 0.4 + Math.random() * 0.5,
    glowR: 1.5 + Math.random() * 3,
  });

  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };

  const draw = () => {
    const [ar, ag, ab] = window.bgAccent || accentRgb || [139, 92, 246];
    const spd = window.bgSpeed || 1;
    ctx.fillStyle = `rgba(${Math.round(ar*0.012)},${Math.round(ag*0.006)},${Math.round(ab*0.02)},0.2)`;
    ctx.fillRect(0, 0, W, H);

    for (const d of drops) {
      d.y += d.speed * spd;
      if (d.y - d.len > H) { d.y = -d.len; d.x = Math.random() * W; }

      const grad = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
      grad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
      grad.addColorStop(0.6, `rgba(${ar},${ag},${ab},${d.alpha * 0.6})`);
      grad.addColorStop(1, `rgba(255,255,255,${d.alpha})`);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - d.len);
      ctx.lineTo(d.x, d.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = d.width;
      ctx.stroke();

      const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.glowR);
      glow.addColorStop(0, `rgba(255,255,255,${d.alpha * 0.9})`);
      glow.addColorStop(0.4, `rgba(${ar},${ag},${ab},${d.alpha * 0.5})`);
      glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.glowR, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }
    animId = requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize);
  resize();
  drops = Array.from({ length: 120 }, makeDrop);
  drops.forEach(d => { d.y = Math.random() * H; });
  draw();

  return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
}
```

- [ ] **Step 4: Verificar sintaxis de los tres**

```bash
node --check ~/Downloads/vscode_extension/src/backgrounds/particles.js && \
node --check ~/Downloads/vscode_extension/src/backgrounds/fireflies.js && \
node --check ~/Downloads/vscode_extension/src/backgrounds/rain.js && \
echo "OK"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/vscode_extension
git add src/backgrounds/
git commit -m "feat: portar Particles, Fireflies, Rain de Aurora a vanilla JS"
```

---

## Task 3: Settings CSS — estilos del sidebar

**Files:**
- Create: `~/Downloads/vscode_extension/media/settings.css`

- [ ] **Step 1: Crear settings.css**

```css
/* ── Settings Sidebar ── */
#settings-btn {
  position: fixed;
  bottom: 1.5rem;
  left: 1rem;
  z-index: 100;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.3);
  background: rgba(0,0,0,0.6);
  color: #00e5ff;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(4px);
}
#settings-btn:hover {
  border-color: #00e5ff;
  box-shadow: 0 0 12px rgba(0,229,255,0.4);
}

#settings-panel {
  position: fixed;
  left: -300px;
  top: 0;
  width: 280px;
  height: 100vh;
  z-index: 99;
  background: rgba(5,5,20,0.92);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgba(0,229,255,0.15);
  padding: 1rem;
  overflow-y: auto;
  transition: left 0.3s cubic-bezier(0.4,0,0.2,1);
  scrollbar-width: thin;
  scrollbar-color: rgba(0,229,255,0.2) transparent;
}
#settings-panel.open { left: 0; }

.s-title {
  color: #00e5ff;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 1.25rem 0 0.5rem;
  opacity: 0.7;
}
.s-title:first-child { margin-top: 0.25rem; }

/* ── Background chips ── */
.bg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.bg-chip {
  padding: 0.25em 0.7em;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.6);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s;
}
.bg-chip:hover { border-color: rgba(0,229,255,0.4); color: #00e5ff; }
.bg-chip.active {
  border-color: #00e5ff;
  color: #00e5ff;
  background: rgba(0,229,255,0.08);
  box-shadow: 0 0 8px rgba(0,229,255,0.2);
}

/* ── Sliders ── */
.s-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
.s-row label {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.55);
  min-width: 80px;
}
.s-row input[type=range] {
  flex: 1;
  accent-color: #00e5ff;
  height: 3px;
}
.s-row .s-val {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.4);
  min-width: 28px;
  text-align: right;
}

/* ── Color pickers ── */
.s-color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
.s-color-row label {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.55);
  flex: 1;
}
.s-color-row input[type=color] {
  width: 32px;
  height: 22px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: none;
  padding: 0;
}

/* ── Font select ── */
.s-select {
  width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 0.75rem;
  padding: 0.35em 0.5em;
  margin-bottom: 0.5rem;
  cursor: pointer;
}
.s-select:focus { outline: none; border-color: rgba(0,229,255,0.4); }

/* ── Toggle ── */
.s-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0;
  cursor: pointer;
}
.s-toggle label {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.55);
  cursor: pointer;
}
.s-toggle input[type=checkbox] { accent-color: #00e5ff; cursor: pointer; }
```

- [ ] **Step 2: Commit**

```bash
cd ~/Downloads/vscode_extension
git add media/settings.css
git commit -m "feat: CSS del sidebar de configuración"
```

---

## Task 4: settings.js — lógica del panel

**Files:**
- Create: `~/Downloads/vscode_extension/src/settings.js`

Este archivo maneja toda la UI del panel de configuración. Lee/escribe en `localStorage`. Llama a `window.applyBg(name)` para cambiar el background, y actualiza variables CSS en `:root` para colores, fuentes, velocidades.

- [ ] **Step 1: Crear settings.js**

```js
(function() {
  const DEFAULTS = {
    bg: 'starfield',
    colorAccent: '#00e5ff',
    colorSuccess: '#6effa0',
    colorWarning: '#ffe066',
    colorError: '#ff8c42',
    glowSpeed: 2.5,
    glowIntensity: 1,
    bgSpeed: 1,
    fontSize: 16,
    lineHeight: 1.8,
    maxWidth: 72,
    fontFamily: 'Inter',
    showOutline: true,
  };

  const FONTS = [
    'Inter', 'Georgia', 'Merriweather', 'JetBrains Mono',
    'Atkinson Hyperlegible', 'system-ui',
  ];

  const BACKGROUNDS = [
    { id: 'starfield',  label: '✦ Estrellas' },
    { id: 'particles',  label: '◉ Partículas' },
    { id: 'fireflies',  label: '✺ Luciérnagas' },
    { id: 'rain',       label: '⋮ Lluvia' },
  ];

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ir-settings') || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }

  function save(cfg) {
    localStorage.setItem('ir-settings', JSON.stringify(cfg));
  }

  function applyConfig(cfg) {
    const r = document.documentElement;
    r.style.setProperty('--aurora-accent',  cfg.colorAccent);
    r.style.setProperty('--aurora-success', cfg.colorSuccess);
    r.style.setProperty('--aurora-warning', cfg.colorWarning);
    r.style.setProperty('--aurora-error',   cfg.colorError);
    r.style.setProperty('--glow-speed',     cfg.glowSpeed + 's');
    r.style.setProperty('--font-size',      cfg.fontSize + 'px');
    r.style.setProperty('--line-height',    cfg.lineHeight);
    r.style.setProperty('--max-width',      cfg.maxWidth + 'ch');
    r.style.setProperty('--font-family',    cfg.fontFamily + ', -apple-system, system-ui, sans-serif');

    // glow intensity via opacity del keyframe — usamos una clase
    document.body.dataset.glowIntensity = cfg.glowIntensity;

    // outline
    const outline = document.getElementById('outline');
    if (outline) outline.style.display = cfg.showOutline ? '' : 'none';

    // background speed global
    window.bgSpeed = cfg.bgSpeed;
    window.bgAccent = hexToRgb(cfg.colorAccent);

    // cambiar bg si es necesario
    if (window._currentBg !== cfg.bg) {
      window.applyBg && window.applyBg(cfg.bg);
    }
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r, g, b];
  }

  function buildPanel(cfg, onChange) {
    const panel = document.createElement('div');
    panel.id = 'settings-panel';

    const mk = (tag, attrs={}, ...children) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k,v]) => {
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else el[k] = v;
      });
      children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
      return el;
    };

    const title = (t) => mk('div', {class:'s-title'}, t);

    const slider = (label, key, min, max, step, unit='') => {
      const row = mk('div', {class:'s-row'});
      const lbl = mk('label', {}, label);
      const val = mk('span', {class:'s-val'}, cfg[key] + unit);
      const inp = mk('input', {type:'range', min, max, step, value: cfg[key]});
      inp.addEventListener('input', () => {
        cfg[key] = parseFloat(inp.value);
        val.textContent = cfg[key] + unit;
        onChange(cfg);
      });
      row.append(lbl, inp, val);
      return row;
    };

    const colorPicker = (label, key) => {
      const row = mk('div', {class:'s-color-row'});
      const lbl = mk('label', {}, label);
      const inp = mk('input', {type:'color', value: cfg[key]});
      inp.addEventListener('input', () => {
        cfg[key] = inp.value;
        onChange(cfg);
      });
      row.append(lbl, inp);
      return row;
    };

    const fontSelect = () => {
      const sel = mk('select', {class:'s-select'});
      FONTS.forEach(f => {
        const opt = mk('option', {value: f, style: `font-family:${f}`}, f);
        if (f === cfg.fontFamily) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => { cfg.fontFamily = sel.value; onChange(cfg); });
      return sel;
    };

    const toggle = (label, key) => {
      const wrap = mk('div', {class:'s-toggle'});
      const inp = mk('input', {type:'checkbox', checked: cfg[key]});
      const lbl = mk('label', {}, label);
      inp.addEventListener('change', () => { cfg[key] = inp.checked; onChange(cfg); });
      wrap.append(inp, lbl);
      return wrap;
    };

    // Backgrounds
    panel.appendChild(title('Background'));
    const chips = mk('div', {class:'bg-chips'});
    BACKGROUNDS.forEach(b => {
      const chip = mk('div', {class: 'bg-chip' + (cfg.bg === b.id ? ' active' : '')}, b.label);
      chip.addEventListener('click', () => {
        chips.querySelectorAll('.bg-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        cfg.bg = b.id;
        onChange(cfg);
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);

    // Colores
    panel.appendChild(title('Colores'));
    panel.appendChild(colorPicker('Títulos', 'colorAccent'));
    panel.appendChild(colorPicker('Negritas', 'colorSuccess'));
    panel.appendChild(colorPicker('Cursivas', 'colorWarning'));
    panel.appendChild(colorPicker('Código', 'colorError'));

    // Tipografía
    panel.appendChild(title('Tipografía'));
    panel.appendChild(fontSelect());
    panel.appendChild(slider('Tamaño', 'fontSize', 12, 24, 1, 'px'));
    panel.appendChild(slider('Interlineado', 'lineHeight', 1.2, 2.5, 0.1, ''));
    panel.appendChild(slider('Ancho línea', 'maxWidth', 40, 100, 2, 'ch'));

    // Efectos
    panel.appendChild(title('Efectos'));
    panel.appendChild(slider('Vel. glow', 'glowSpeed', 1, 6, 0.1, 's'));
    panel.appendChild(slider('Int. glow', 'glowIntensity', 0.3, 2, 0.1, 'x'));
    panel.appendChild(slider('Vel. fondo', 'bgSpeed', 0.1, 3, 0.1, 'x'));

    // Misc
    panel.appendChild(title('Opciones'));
    panel.appendChild(toggle('Mostrar outline', 'showOutline'));

    return panel;
  }

  function initSettings() {
    let cfg = load();

    const btn = document.createElement('button');
    btn.id = 'settings-btn';
    btn.title = 'Configuración';
    btn.textContent = '⚙';
    document.body.appendChild(btn);

    let isOpen = false;
    let panel = null;

    const onChange = (newCfg) => {
      save(newCfg);
      applyConfig(newCfg);
    };

    btn.addEventListener('click', () => {
      isOpen = !isOpen;
      if (isOpen && !panel) {
        panel = buildPanel(cfg, onChange);
        document.body.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add('open'));
      } else if (panel) {
        panel.classList.toggle('open', isOpen);
      }
    });

    // Aplicar config inicial
    applyConfig(cfg);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
  } else {
    initSettings();
  }
})();
```

- [ ] **Step 2: Verificar sintaxis**

```bash
node --check ~/Downloads/vscode_extension/src/settings.js
```
Expected: sin output.

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/vscode_extension
git add src/settings.js
git commit -m "feat: lógica del panel de configuración con localStorage"
```

---

## Task 5: Integrar todo en reader.js

**Files:**
- Modify: `~/Downloads/vscode_extension/src/reader.js`

Hay que:
1. Agregar URIs para todos los backgrounds, settings.js y settings.css
2. Incluir los scripts en el HTML
3. Agregar la función `applyBg()` que switchea entre backgrounds
4. Hacer que las variables CSS de tipografía sean controlables

- [ ] **Step 1: Reemplazar reader.js completo**

```js
const vscode = require('vscode');
const path = require('path');

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
        vscode.Uri.file(path.join(context.extensionPath, 'src', 'backgrounds')),
      ],
    }
  );

  const u = (rel) => panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, ...rel.split('/'))));

  const uris = {
    css:        u('media/immersive.css'),
    settingsCss: u('media/settings.css'),
    marked:     u('media/marked.min.js'),
    starfield:  u('src/backgrounds/starfield.js'),
    particles:  u('src/backgrounds/particles.js'),
    fireflies:  u('src/backgrounds/fireflies.js'),
    rain:       u('src/backgrounds/rain.js'),
    settings:   u('src/settings.js'),
    csp:        panel.webview.cspSource,
  };

  const raw = document.getText();
  const isMarkdown = document.fileName.endsWith('.md');
  panel.webview.html = buildHtml(uris, raw, isMarkdown);
}

function buildHtml(uris, raw, isMarkdown) {
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${uris.csp} 'unsafe-inline'; script-src ${uris.csp} 'unsafe-inline'; img-src data: https:;">
  <link rel="stylesheet" href="${uris.css}">
  <link rel="stylesheet" href="${uris.settingsCss}">
  <title>Immersive Reader</title>
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div id="layout">
    <div id="content"></div>
    <nav id="outline"></nav>
  </div>
  <script src="${uris.marked}"></script>
  <script src="${uris.starfield}"></script>
  <script src="${uris.particles}"></script>
  <script src="${uris.fireflies}"></script>
  <script src="${uris.rain}"></script>
  <script>
    // Background switcher
    let _bgCleanup = null;
    window._currentBg = null;
    window.bgSpeed = 1;
    window.bgAccent = null;

    window.applyBg = function(name) {
      if (_bgCleanup) { _bgCleanup(); _bgCleanup = null; }
      const canvas = document.getElementById('bg-canvas');
      const accent = window.bgAccent;
      window._currentBg = name;
      if (name === 'starfield')  _bgCleanup = initStarfield(canvas);
      if (name === 'particles')  _bgCleanup = initParticles(canvas, accent);
      if (name === 'fireflies')  _bgCleanup = initFireflies(canvas, accent);
      if (name === 'rain')       _bgCleanup = initRain(canvas, accent);
    };

    // Renderizar contenido
    const raw = "${escaped.replace(/\n/g, '\\n').replace(/'/g, "\\'")}";
    const isMarkdown = ${isMarkdown};
    const content = document.getElementById('content');
    if (isMarkdown) {
      content.innerHTML = marked.parse(raw);
    } else {
      content.innerHTML = '<pre>' + raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') + '</pre>';
    }

    // Outline de títulos
    const headings = content.querySelectorAll('h1,h2,h3,h4,h5,h6');
    const outline = document.getElementById('outline');
    let activeItem = null;
    headings.forEach((h, i) => {
      h.id = 'h-' + i;
      const level = parseInt(h.tagName[1]);
      const item = document.createElement('a');
      item.href = '#h-' + i;
      item.textContent = h.textContent;
      item.dataset.level = level;
      item.className = 'outline-item level-' + level;
      item.addEventListener('click', e => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (activeItem) activeItem.classList.remove('active');
        item.classList.add('active');
        activeItem = item;
      });
      outline.appendChild(item);
    });

    const headingObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const link = outline.querySelector('[href="#' + entry.target.id + '"]');
          if (link) {
            if (activeItem) activeItem.classList.remove('active');
            link.classList.add('active');
            activeItem = link;
            link.scrollIntoView({ block: 'nearest' });
          }
        }
      });
    }, { threshold: 0.1, rootMargin: '-10% 0px -80% 0px' });
    headings.forEach(h => headingObserver.observe(h));

    // Animaciones de entrada
    const animTargets = content.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,table');
    const animObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const isTitle = /^H[1-6]$/.test(el.tagName);
        el.classList.add(isTitle ? 'anim-in-title' : 'anim-in');
        animObserver.unobserve(el);
      });
    }, { threshold: 0.08 });
    animTargets.forEach((el, i) => {
      el.style.animationDelay = (i < 6 ? i * 0.06 : 0) + 's';
      animObserver.observe(el);
    });
  </script>
  <script src="${uris.settings}"></script>
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
git commit -m "feat: integrar backgrounds, settings panel y controles en reader"
```

---

## Task 6: Actualizar immersive.css para variables CSS dinámicas

**Files:**
- Modify: `~/Downloads/vscode_extension/media/immersive.css`

Las propiedades de tipografía y velocidad del glow ahora vienen de variables CSS controladas por settings.js. Hay que reemplazar los valores hardcodeados por variables.

- [ ] **Step 1: Agregar variables controlables al :root**

Al inicio del archivo, reemplazar el bloque `:root` existente por:

```css
:root {
  --aurora-bg:         #0a0a12;
  --aurora-text:       #f0f0f0;
  --aurora-text-muted: #b0afbf;
  --aurora-success:    #6effa0;
  --aurora-warning:    #ffe066;
  --aurora-accent:     #00e5ff;
  --aurora-error:      #ff8c42;
  --aurora-link:       #c084fc;
  --aurora-surface:    rgba(255,255,255,0.04);
  --aurora-border:     rgba(255,255,255,0.08);
  --aurora-font-sans:  'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --aurora-font-mono:  'Consolas', 'Fira Mono', monospace;

  /* Controladas por settings.js */
  --glow-speed:   2.5s;
  --font-size:    16px;
  --line-height:  1.8;
  --max-width:    72ch;
  --font-family:  'Inter', -apple-system, system-ui, sans-serif;
}
```

- [ ] **Step 2: Usar variables en html/body y #content**

Reemplazar:
```css
html, body {
  width: 100%; height: 100%;
  background: transparent;
  color: var(--aurora-text);
  font-family: var(--aurora-font-sans);
  font-size: 16px;
  line-height: 1.8;
  overflow-x: hidden;
  text-shadow: 0 1px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1);
}
```
por:
```css
html, body {
  width: 100%; height: 100%;
  background: transparent;
  color: var(--aurora-text);
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: var(--line-height);
  overflow-x: hidden;
  text-shadow: 0 1px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1);
}
```

Y en `#content`:
```css
#content {
  flex: 1;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 3rem 2rem 6rem;
  background: transparent;
  min-height: 100vh;
}
```

- [ ] **Step 3: Usar --glow-speed en las animaciones**

Reemplazar las 4 líneas de animation al final del bloque de glow:
```css
h1, h2, h3, h4, h5, h6 { animation: glowCyan   var(--glow-speed) ease-in-out infinite; }
strong, b               { animation: glowGreen  calc(var(--glow-speed) * 0.96) ease-in-out infinite; }
em, i                   { animation: glowYellow calc(var(--glow-speed) * 1.24) ease-in-out infinite; }
code                    { animation: glowOrange calc(var(--glow-speed) * 1.04) ease-in-out infinite; }
```

- [ ] **Step 4: Verificar que el CSS no tiene errores de sintaxis**

```bash
node -e "require('fs').readFileSync('/home/deml/Downloads/vscode_extension/media/immersive.css','utf8'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/vscode_extension
git add media/immersive.css
git commit -m "feat: variables CSS dinámicas para tipografía y velocidad de glow"
```

---

## Task 7: Prueba final en VS Code

**Files:** ninguno nuevo

- [ ] **Step 1: Recargar la extensión**

En VS Code con la extensión abierta: `Ctrl+Shift+F5`

- [ ] **Step 2: Abrir el lector en un .md**

Abrir cualquier `.md` y clickear el ícono 👁.

- [ ] **Step 3: Verificar el botón ⚙**

El botón ⚙ debe aparecer en la esquina inferior izquierda del panel.

- [ ] **Step 4: Abrir el panel y probar cada sección**

- Cambiar background a Particles, Fireflies, Rain — el fondo debe cambiar en tiempo real
- Cambiar color de títulos — el celeste debe cambiar y el glow debe seguir el color nuevo
- Cambiar fuente a Georgia — el texto debe cambiar de tipografía
- Mover slider de velocidad de glow — las animaciones deben acelerarse/frenarse
- Ocultar outline — el panel de navegación debe desaparecer

- [ ] **Step 5: Commit final**

```bash
cd ~/Downloads/vscode_extension
git add .
git commit -m "feat: Immersive Reader v0.2 — panel de configuración completo"
```

---

## Self-Review

**Spec coverage:**
- ✅ Selector de background (Starfield, Particles, Fireflies, Rain)
- ✅ Control de colores (títulos, negritas, cursivas, código) via color picker
- ✅ Selector de fuente (Inter, Georgia, Merriweather, JetBrains Mono, Atkinson, system-ui)
- ✅ Tamaño de fuente (slider)
- ✅ Interlineado (slider)
- ✅ Ancho de línea (slider)
- ✅ Velocidad del glow (slider)
- ✅ Intensidad del glow (slider)
- ✅ Velocidad del background (slider, via window.bgSpeed)
- ✅ Mostrar/ocultar outline (toggle)
- ✅ Persistencia en localStorage
- ✅ Cambios en tiempo real

**Placeholders:** ninguno.

**Type consistency:** `initStarfield`, `initParticles`, `initFireflies`, `initRain` — todos retornan cleanup function. `window.applyBg`, `window.bgSpeed`, `window.bgAccent` — consistentes entre reader.js y settings.js.
