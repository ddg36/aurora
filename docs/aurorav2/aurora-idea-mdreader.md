# Aurora MD Reader — Ideas

Documento de ideas para convertir `md-reader` en un módulo nativo de Aurora v2.

---

## Visión

`Aurora MD Reader` sería el lector principal de Markdown dentro de Aurora.

No sería una extensión de navegador, sino un módulo UI servido por Aurora:

```txt
/ui?tab=md-reader
```

La extensión VS Code `md-reader` sirve como base conceptual y funcional, pero en Aurora debe migrarse a la arquitectura v2:

- UI en `ui/modules/md-reader/`.
- Componentes reutilizables en `ui/components/`.
- Lógica compartida en `ui/components/shared/`.
- Archivos Markdown leídos desde `/nexus/fs`.
- Índice y grafo persistidos en `/db/markdown`.
- Preferencias en `/db/ajustes`.
- LLM local vía `/gemita`.

---

## Estado inicial implementado

Módulo nativo Aurora v2 creado en:

```txt
ui/modules/md-reader/
```

Vista registrada como:

```txt
/ui?tab=md-reader
```

Cubre el MVP inicial:

- Nueva tab `MD Read`.
- Escaneo de Markdown en `nexus/workspaces/aihub`.
- Lectura/escritura vía `/nexus/fs`.
- Render Markdown con outline.
- Mapa del documento.
- Grafo workspace.
- Búsqueda y filtros.
- Tareas detectadas.
- Creación de notas faltantes.
- Resumen con `/gemita`.
- Documentación de referencia en `docs/aurora-components-ui.md`.

---

## Principios

1. Markdown como sistema de conocimiento.
2. El lector no es solo visualizador: también indexa, conecta, resume y transforma.
3. Todo archivo `.md` pertenece al workspace.
4. Todo grafo debe poder reconstruirse desde archivos reales.
5. La UI puede cachear, pero la fuente de verdad es FS + DB.
6. Wikilinks, tags, headings, tareas y assets son nodos de conocimiento.
7. El lector debe servir también como entrada a Local, Wiki, Scratchpad y Prompts.

---

## Funciones principales

### 1. Lector Markdown

- Render Markdown limpio.
- Soporte GFM.
- Tablas.
- Task lists.
- Code blocks con highlight.
- Imágenes locales y remotas.
- Enlaces internos.
- Enlaces externos.
- Footnotes si el parser lo soporta.
- HTML embebido con sandbox visual.

---

### 2. Outline vivo

- Barra lateral con encabezados.
- Navegación por `h1` a `h6`.
- Indicador de sección activa según scroll.
- Colapso por nivel.
- Búsqueda dentro del outline.
- Copiar enlace interno a sección.
- Mostrar línea original aproximada.

---

### 3. Mapa del documento

Mapa radial del archivo actual.

Nodos:

- Archivo.
- Heading.
- Wikilink.
- Markdown link.
- Imagen.
- Código.
- Tabla.
- Tarea pendiente.
- Tarea completada.
- Tag.
- Externo.
- Nota faltante.

Acciones:

- Click en nodo para saltar al bloque.
- Click en wikilink para abrir nota.
- Click en nota faltante para crearla.
- Click en imagen para abrir visor.
- Click en tarea para marcarla como hecha/no hecha.

---

### 4. Mapa global del workspace

Grafo tipo Obsidian-lite.

Escaneo:

- `**/*.md`
- Excluir:
  - `.git`
  - `node_modules`
  - `dist`
  - `build`
  - `coverage`
  - `venv`
  - `.venv`
  - `__pycache__`

Nodos globales:

- Archivo.
- Heading.
- Tag.
- Nota faltante.
- Externo.
- Imagen.
- Asset.
- Tarea.

Conexiones:

- `wikilink`
- `markdown-link`
- `heading`
- `tag`
- `image`
- `asset`
- `task`

UI:

- Buscar nodos.
- Filtrar por tipo.
- Zoom.
- Pan.
- Abrir nodo.
- Crear nota faltante.
- Ver estadísticas:
  - archivos
  - nodos
  - enlaces
  - tags
  - faltantes
  - externos
  - tareas

---

### 5. Edición inline

Permitir editar bloques renderizados:

- Párrafos.
- Encabezados.
- Listas.
- Items.
- Blockquotes.
- Task items.

Flujo:

1. Activar modo edición.
2. Click en bloque renderizado.
3. Abrir textarea inline.
4. Guardar línea o bloque en archivo original.
5. Re-renderizar.
6. Actualizar índice/grafos.

Preferible para cambios pequeños. Para edición grande, abrir Scratchpad o editor nativo.

---

### 6. Creación rápida de notas

Desde el lector:

- Crear nota nueva.
- Crear desde selección.
- Crear desde heading.
- Crear desde tarea.
- Crear desde wikilink faltante.
- Crear desde resumen de sección.
- Crear desde prompt generado por Aurora.

Plantillas:

```md
# {{titulo}}

## Resumen

## Notas

## Tareas

## Fuentes

## Links
```

---

### 7. Extracción de tareas

Detectar:

```md
- [ ] Hacer algo
- [x] Algo terminado
```

Acciones:

- Ver lista global de tareas.
- Filtrar por archivo.
- Filtrar por tag.
- Marcar como hecha.
- Enviar tareas a Local como plan.
- Convertir tareas en prompts.
- Exportar tareas a Scratchpad.

---

### 8. Extracción de links y fuentes

Detectar:

- Links Markdown.
- Wikilinks.
- URLs externas.
- Imágenes.
- Assets locales.

Acciones:

- Abrir fuente.
- Copiar URL.
- Guardar en DB.
- Clasificar como referencia.
- Generar bibliografía.
- Detectar links rotos.
- Detectar notas faltantes.

---

### 9. Resumen inteligente con Aurora

Enviar a `/gemita`:

- Archivo completo.
- Selección.
- Heading actual.
- Tareas.
- Links.
- Tags.
- Preguntas específicas.

Salidas:

- Resumen corto.
- Resumen ejecutivo.
- Puntos clave.
- Decisiones.
- Tareas.
- Preguntas abiertas.
- Glosario.
- Timeline.
- Mapa mental en Markdown.
- Prompt reusable.

---

### 10. Transformaciones Markdown

Acciones rápidas:

- MD → resumen.
- MD → tareas.
- MD → preguntas.
- MD → Wiki.
- MD → Scratchpad.
- MD → prompt.
- MD → JSON.
- MD → YAML frontmatter.
- MD → tabla.
- MD → índice.
- MD → presentación.
- MD → documento estructurado.

---

### 11. Frontmatter

Soporte para:

```md
---
title: "..."
tags:
  - aurora
  - ideas
created: "2026-06-12"
status: draft
---
```

Funciones:

- Mostrar metadatos en toolbar.
- Editar frontmatter.
- Indexar tags.
- Ordenar por fecha.
- Filtrar por estado.
- Detectar frontmatter faltante.
- Sugerir frontmatter con Aurora.

---

### 12. Búsqueda global Markdown

Búsqueda en:

- Contenido.
- Headings.
- Tags.
- Wikilinks.
- Tareas.
- Frontmatter.
- Assets.
- Links externos.

Resultados:

- Archivo.
- Línea.
- Contexto.
- Tipo de match.
- Preview.

Integración:

- Ctrl+K de Aurora.
- Command palette.
- Panel lateral.
- Atajo dedicado.

---

### 13. Estado y salud del vault

Panel de salud:

- Total de notas.
- Notas huérfanas.
- Notas faltantes.
- Links rotos.
- Tags sin uso.
- Tareas pendientes.
- Archivos grandes.
- Notas sin título.
- Notas sin tags.
- Notas sin frontmatter.
- Duplicados probables.

Acciones:

- Reparar link.
- Crear nota faltante.
- Renombrar nota y actualizar links.
- Agregar tag sugerido.
- Marcar como índice.
- Mover a carpeta.

---

### 14. Backlinks

Para cada nota:

- Mostrar notas que enlazan hacia ella.
- Mostrar enlaces por sección.
- Mostrar backlinks rotos.
- Mostrar backlinks por tag.
- Abrir origen.
- Insertar enlace desde nota actual.

---

### 15. Vista de lectura enfocada

Modos:

- Lectura limpia.
- Lectura con outline.
- Lectura con mapa.
- Lectura con notas laterales.
- Lectura con tareas.
- Lectura con fuentes.
- Lectura inmersiva Aurora.

Preferencias:

- Tema.
- Fondo.
- HUD.
- Tamaño de fuente.
- Ancho de lectura.
- Mostrar/ocultar código.
- Mostrar/ocultar imágenes.
- Mostrar/ocultar frontmatter.

---

## Arquitectura propuesta

```txt
ui/modules/md-reader/
  view/
    md-reader.js
    reader-pane.js
    outline.js
    doc-map.js
    workspace-map.js
    search.js
    tasks.js
    backlinks.js
    health.js
  scripts/
    fs.js
    parser.js
    graph.js
    search.js
    tasks.js
    frontmatter.js
    transforms.js
    gemita.js
```

Backend posible:

```txt
src/db/routes/markdown.py
src/markdown/
  parser.py
  graph.py
  search.py
  tasks.py
  frontmatter.py
```

Endpoints posibles:

```txt
GET    /db/markdown/index
POST   /db/markdown/reindex
GET    /db/markdown/file
GET    /db/markdown/graph
GET    /db/markdown/search
GET    /db/markdown/tasks
PATCH  /db/markdown/task
GET    /db/markdown/backlinks
GET    /db/markdown/health
```

FS existente:

```txt
/nexus/fs/list
/nexus/fs/read
/nexus/fs/write
/nexus/fs/patch
/nexus/fs/mkdir
/nexus/fs/move
/nexus/fs/delete
```

---

## MVP recomendado

### MVP 1 — Lector básico

- Abrir `.md` desde workspace.
- Render Markdown.
- Outline.
- Scroll sync.
- Abrir links locales.
- Abrir imágenes.
- Preferencias básicas.

### MVP 2 — Grafo documento

- Mapa del documento actual.
- Headings.
- Links.
- Wikilinks.
- Imágenes.
- Tareas.
- Tags.
- Saltar a bloque.
- Crear nota faltante.

### MVP 3 — Grafo workspace

- Indexar `**/*.md`.
- Mapa global.
- Buscar nodos.
- Filtrar tipos.
- Abrir notas.
- Crear notas faltantes.
- Estadísticas.

### MVP 4 — Edición y tareas

- Edición inline.
- Marcar tareas.
- Lista global de tareas.
- Guardar cambios.
- Actualizar índice.

### MVP 5 — Aurora intelligence

- Resumen con `/gemita`.
- Extraer tareas.
- Extraer preguntas.
- Generar frontmatter.
- Convertir selección a nota.
- Enviar a Scratchpad/Wiki/Local.

### MVP 6 — Salud y mantenimiento

- Links rotos.
- Notas huérfanas.
- Duplicados probables.
- Notas sin título.
- Notas sin tags.
- Reparación guiada.

---

## Ideas adicionales

### 1. Markdown como dashboard

Crear `.md` especiales con frontmatter:

```md
---
type: dashboard
---
```

Que Aurora renderice como panel con widgets.

Widgets:

- Tareas.
- Links recientes.
- Notas faltantes.
- Tags.
- Health.
- Resumen de proyecto.
- Últimas modificaciones.

---

### 2. Modo proyecto

Agrupar notas por proyecto:

- Carpeta.
- Tag.
- Frontmatter `project`.
- Wikilinks.
- Índice manual.

Vista:

- Resumen del proyecto.
- Notas principales.
- Tareas pendientes.
- Decisiones.
- Riesgos.
- Fuentes.

---

### 3. Daily notes

Generar nota diaria:

```md
# 2026-06-12

## Enfoque

## Notas

## Tareas

## Reuniones

## Links
```

Acciones:

- Abrir nota de hoy.
- Agregar tarea.
- Agregar nota rápida.
- Vincular con proyecto.
- Resumir día.

---

### 4. Meeting notes desde MD

Plantilla:

```md
# Reunión — {{fecha}}

## Participantes

## Agenda

## Notas

## Decisiones

## Tareas

## Links
```

Aurora puede:

- Extraer decisiones.
- Extraer tareas.
- Resumir.
- Crear enlaces a notas relacionadas.
- Guardar en carpeta de reuniones.

---

### 5. Research notes

Plantilla:

```md
# {{tema}}

## Pregunta

## Fuentes

## Resumen

## Evidencia

## Contradicciones

## Conclusiones

## Próximos pasos
```

Acciones:

- Capturar fuentes.
- Extraer citas.
- Detectar contradicciones.
- Generar preguntas.
- Crear bibliografía.

---

### 6. Prompt library en Markdown

Cada prompt como `.md`:

```md
---
type: prompt
category: refactor
tags:
  - code
  - python
---

# Refactor Python

## Input

## Instrucciones

## Output esperado
```

Aurora puede usar el lector como biblioteca de prompts.

---

### 7. Wiki generator

Desde un conjunto de notas:

- Detectar temas.
- Crear índice.
- Crear páginas de resumen.
- Crear enlaces entre notas.
- Detectar huecos.
- Generar estructura de Wiki.

---

### 8. Markdown diff visual

Comparar:

- Archivo actual vs último guardado.
- Dos notas.
- Dos versiones.
- Antes/después de transformación Aurora.

UI:

- Diff por líneas.
- Diff por bloques.
- Aceptar/rechazar cambios.
- Aplicar al archivo.

---

### 9. Command mode

Comandos rápidos desde el lector:

```txt
/summarize
/tasks
/graph
/backlinks
/new-note
/link
/tag
/send-local
/send-wiki
/send-scratchpad
/export-md
```

---

### 10. Exportaciones

Exportar nota o selección a:

- Markdown.
- HTML.
- PDF.
- TXT.
- JSON.
- Obsidian vault compatible.
- Prompt.
- Informe ejecutivo.

---

## Riesgos

- Portar `webview.js` completo sería costoso y desordenado.
- Mezclar lector, grafo, edición e IA en un solo archivo violaría la normalización de Aurora v2.
- Leer todo el workspace puede ser pesado; conviene indexar con debounce.
- El grafo global debe tener límite visual.
- Wikilinks ambiguos necesitan estrategia de resolución.
- La edición inline debe ser limitada para evitar conflictos.
- Archivos grandes necesitan lazy render o virtualización.
- Imágenes remotas pueden fallar por CORS o red.

---

## Recomendación

La mejor ruta:

1. Crear parser Markdown compartido.
2. Crear grafo Markdown compartido.
3. Crear módulo `ui/modules/md-reader`.
4. Usar `/nexus/fs` como fuente de verdad.
5. Persistir índice en `/db/markdown`.
6. Agregar IA después, no al inicio.
7. Mantener la UI dividida por responsabilidades.

Idea central:

> Aurora MD Reader no debe ser solo un visor bonito. Debe ser el centro de lectura, navegación, edición ligera, grafo de conocimiento y transformación inteligente de Markdown en Aurora.
