# Captura v2 — Smart Capture Panel

**Fecha:** 2026-06-11  
**Estado:** Aprobado

---

## Objetivo

Rediseñar la vista Captura de Aurora v2 para que sea visualmente limpia, reactiva al tipo de página (YouTube-video / YouTube-home / web), y agregar dos accesos rápidos en el footer global con iconos SVG minimalistas.

---

## Arquitectura

Sin nuevos archivos de lógica — solo UI. Los cambios tocan:

- `aurora/ui/modules/captura/view/captura.js` — rediseño completo de la vista
- `aurora/ui/modules/captura/captura.css` — estilos nuevos / reemplazo
- `aurora/ui/components/footer/acciones-modulo.js` — 2 nuevas acciones con SVG
- `aurora/ui/components/footer/registry.js` — agregar acciones de captura a global

---

## Sección 1 — Vista Captura

### Layout (3 zonas fijas)

```
┌─────────────────────────────────────┐
│ CHIPS: [tipo] [dominio] [título]    │  reactivo via SSE
├─────────────────────────────────────┤
│ ZONA ACCIÓN (cambia por tipo tab)   │
├─────────────────────────────────────┤
│ RESULTADO (fade-in cuando hay algo) │
│   Texto: card mono + botones        │
│   Screenshot: img preview + botones │
├─────────────────────────────────────┤
│ HISTORIAL colapsable (top 5)        │
└─────────────────────────────────────┘
```

### Zona Acción — 3 estados

| Tipo de tab | UI |
|-------------|-----|
| `youtube-video` | Botón grande "🎬 Extraer transcripción ▾" + dropdown de tipos |
| `web` | Botón grande "📄 Capturar página" + botón secundario pequeño screenshot |
| `youtube` (home/canal) | Solo botón screenshot + aviso suave "Abrí un video para extraer transcripción" |

El botón screenshot siempre es secundario (más pequeño) excepto en youtube-home donde es el único disponible.

### Zona Resultado

- Aparece con `opacity 0 → 1` + `translateY(8px → 0)` en 180ms
- **Texto capturado:** card con `font-mono text-xs`, scroll interno máx 200px, contador de chars abajo derecha, botones `[📋 Copiar]` `[✎ Notas]`
- **Screenshot:** `<img>` con `width:100% border-radius:8px`, botones `[📋 Copiar imagen]` `[🔗 Abrir en tab]`
- Solo uno visible a la vez; nuevo resultado reemplaza al anterior

### Historial

- Colapsado por defecto, botón "🕘 Historial (N)" lo expande
- Muestra últimas 5 entradas
- Cada entrada: chip de tipo + título truncado + botón copiar

---

## Sección 2 — Footer Quick-Access

### Dos nuevos botones en `ACCIONES_GLOBAL`

Posición: entre `🔔` y el separador de módulo.

| id | SVG | Título | Acción |
|----|-----|--------|--------|
| `quick-screenshot` | cámara SVG 14px | "Screenshot rápido" | `capturarScreenshot()` → Toast + clipboard |
| `quick-capture` | documento SVG 14px | "Capturar página" | `capturarTexto()` → Toast + clipboard |

Ambas usan `globalThis.__aurora_bgRequest` directamente — sin navegar a la vista Captura.  
Si extensión no disponible (`!globalThis.__aurora_enExtension?.value`): Toast warning "Requiere extensión".

### Iconos SVG inline (14×14px, stroke currentColor)

**Cámara (screenshot):**
```svg
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 4.5C1 3.67 1.67 3 2.5 3h1.17L4.5 1.5h5l.83 1.5H11.5C12.33 3 13 3.67 13 4.5v6c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-6z"/>
  <circle cx="7" cy="7.5" r="2"/>
</svg>
```

**Documento/página (capture):**
```svg
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2.5" y="1" width="9" height="12" rx="1.5"/>
  <line x1="5" y1="5" x2="9" y2="5"/>
  <line x1="5" y1="7.5" x2="9" y2="7.5"/>
  <line x1="5" y1="10" x2="7.5" y2="10"/>
</svg>
```

SVG como string literal en JS, asignado a `icon` de la acción — el footer ya renderiza `innerHTML` equivalente via `${a.icon}` en HTM.

---

## Estilos clave (captura.css)

- Eliminar `.captura-tab-info` y `.captura-tab-title` (reemplazados por chips)
- `.captura-action-zone` — flex col, gap 8px, padding 12px 0
- `.captura-btn--primary` — fondo accent 15%, borde accent 40%, font-weight 700, height 40px
- `.captura-btn--ghost` — borde solo, sin fondo, más pequeño (height 32px)
- `.captura-result` — fade-in animation, border, border-radius 10px, overflow hidden
- `.captura-result-toolbar` — flex, justify-between, padding 6px 10px, border-bottom
- `.captura-result-body` — padding 10px, font-mono, font-size 11px, max-height 200px, overflow-y auto
- `.captura-result-meta` — font-size 9px, text-align right, padding 4px 10px, color text-dim

---

## Restricciones

- No agregar dependencias nuevas
- SVG como string en JS, no como archivo separado
- Footer no importa nada de módulo captura — usa `globalThis.__aurora_bgRequest` directo
- Clipboard es el único destino por ahora; la arquitectura de destinos (chat, notas) se agrega en una iteración futura
