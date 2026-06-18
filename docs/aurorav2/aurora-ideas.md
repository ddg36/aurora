# Aurora Ideas — Extensiones de Productividad

Ideas de extensiones MV3 thin clients para Aurora v2. Todas siguen la arquitectura actual:

- UI principal en `http://localhost:7779/ui`.
- Extensiones con `manifest.json`, `background.js`, `content.js` e `index.html` con iframe.
- Datos persistentes en SQLite vía `/db/*`.
- Automatización avanzada vía `/browser/*`, `/nexus/*` y CDP/Playwright.
- LLM local vía WebSocket `/gemita`.

---

## 1. Aurora Capture

Extensión base para capturar contexto web.

**Captura:**

- URL actual.
- Título.
- Favicon.
- Texto seleccionado.
- HTML limpio del `<article>`, `<main>` o selección.
- Metadatos OpenGraph.
- Screenshot parcial opcional.
- Fecha y usuario.

**Uso en Aurora:**

- Guardar recortes en DB.
- Enviar contexto a Local/Gemita.
- Convertir captura en nota, tarea, prompt o entrada de Wiki.

**Tablas/endpoints posibles:**

- `GET/POST /db/web/capturas`
- `GET /db/web/capturas/:id`
- `DELETE /db/web/capturas/:id`

---

## 2. Aurora Researcher

Sidepanel de investigación sobre la página activa.

**Funciones:**

- Resumir página.
- Extraer puntos clave.
- Detectar entidades: personas, empresas, productos, fechas, precios.
- Extraer argumentos a favor/en contra.
- Generar preguntas de seguimiento.
- Crear fuentes para Wiki.

**Captura web:**

- DOM limpio.
- Enlaces externos.
- Citas textuales.
- Encabezados.
- Tablas.

**Salida:**

- Resumen corto.
- Resumen largo.
- Lista de decisiones.
- Lista de fuentes.
- Prompt reutilizable.

---

## 3. Aurora Tasks From Web

Convierte cualquier página en tareas accionables.

**Ejemplos:**

- “Comprar este producto cuando baje de precio.”
- “Responder este correo.”
- “Investigar esta herramienta.”
- “Guardar esta documentación.”
- “Crear ticket con este bug.”

**Captura:**

- URL.
- Texto relevante.
- Selector del elemento.
- Screenshot opcional.
- Contexto visual.

**Integración:**

- Crear tareas en DB.
- Relacionar tarea con página original.
- Enviar a Local/Gemita para plan de acción.
- Usar `/browser/*` para revisar la página después.

---

## 4. Aurora Clipboard Memory

Memoria automática basada en copiar/pegar.

**Funciona así:**

1. El usuario copia texto en cualquier web.
2. `background.js` detecta `clipboardRead` o evento de copiado.
3. La extensión guarda el texto en Aurora.
4. Aurora infiere tipo, tags y posible destino.

**Tipos detectables:**

- Nota.
- Prompt.
- Código.
- Error.
- Producto.
- Contacto.
- Fuente.
- Tarea.
- Cita.

**Ventaja:**

Convierte el portapapeles en una memoria persistente conectada a Scratchpad, Wiki y Local.

---

## 5. Aurora Form Filler Inteligente

Relleno seguro de formularios con datos persistentes.

**Datos que puede manejar:**

- Nombre.
- Email.
- Empresa.
- Teléfono.
- Dirección.
- Proyecto.
- Cliente.
- Notas internas.
- Respuestas frecuentes.

**Seguridad:**

- Confirmación antes de rellenar.
- Modo manual por campo.
- No exponer datos sensibles en logs.
- Permisos limitados por dominio.
- Opción de borrar dato desde Aurora.

**CDP:**

- Detectar campos visibles.
- Rellenar con `Input.dispatchKeyEvent` o DOM setters.
- Capturar resultado.
- Guardar formulario completado como plantilla.

---

## 6. Aurora Meeting Notes

Extensión para reuniones en web.

**Objetivos:**

- Google Meet.
- Zoom Web.
- Teams Web.
- YouTube Live.
- Streams internos.

**Captura:**

- Participantes visibles.
- Chat.
- Transcripción visible.
- Timestamps.
- Enlaces compartidos.
- Decisiones detectadas.
- Tareas mencionadas.

**Salida:**

- Resumen ejecutivo.
- Decisiones.
- Pendientes.
- Timeline.
- Notas limpias en Markdown.
- Entrada directa en Scratchpad/Wiki.

---

## 7. Aurora Tab Commander

Gestor avanzado de pestañas.

**Captura:**

- Títulos.
- URLs.
- Favicons.
- Estado activo.
- Grupo de pestañas.
- Preview de texto.
- Fecha de apertura.
- Dominio.

**Funciones:**

- Buscar pestañas por texto semántico.
- Agrupar por proyecto.
- Archivar sesión de pestañas.
- Convertir grupo en nota.
- Cerrar duplicados.
- Cerrar tabs de baja prioridad.
- Restaurar sesión desde Aurora.

**CDP:**

- Inspeccionar DOM de tabs activas.
- Extraer contenido sin abrir pestaña.
- Generar mini-resumen por tab.

---

## 8. Aurora Price Watch

Monitor de precios y disponibilidad.

**Captura inicial:**

- Producto.
- Precio.
- Moneda.
- Stock.
- Imágenes.
- URL.
- Tienda.
- Selectores usados.
- Fecha.

**Monitor:**

- Revisión periódica con `/browser/*`.
- Historial de precios.
- Alertas por bajada.
- Alertas por stock.
- Comparación entre URLs.

**Casos:**

- Hardware.
- Componentes.
- Libros.
- Cursos.
- Suscripciones.
- Productos de marketplace.

---

## 9. Aurora Code Context

Extensión para desarrolladores.

**Sitios objetivo:**

- GitHub.
- GitLab.
- StackOverflow.
- MDN.
- React docs.
- Python docs.
- Rust docs.
- Docs internas.

**Captura:**

- Snippets.
- Errores.
- Issues.
- Pull requests.
- Commits.
- Documentación.
- Stack traces.
- Archivos abiertos.

**Acciones:**

- Explicar código.
- Refactorizar.
- Generar tests.
- Buscar en Wiki.
- Crear prompt técnico.
- Guardar patrón reusable.
- Abrir playground/editor desde Aurora.

---

## 10. Aurora Web Automator

Grabador de flujos web.

**Graba:**

- Clicks.
- Inputs.
- Selects.
- Scroll.
- Navegación.
- Esperas.
- Selectores CSS/XPath/testid.
- Screenshots de pasos.

**Ejecuta:**

- Manual desde sidepanel.
- Programado desde Aurora.
- Con confirmaciones por paso riesgoso.
- Con fallback de selectores.

**Backend:**

- `/browser/sessions`
- `/browser/flows`
- `/browser/run`
- `/browser/inspect`
- `/browser/screenshot`

**Uso:**

- Login repetitivo.
- Reportes.
- Extracción de datos.
- QA.
- Migraciones web.
- Monitoreo de estados.

---

## 11. Aurora Docs Bridge

Puente universal para documentos de oficina.

**Objetivo:**

Unificar Markdown, PDF, Word y Excel en un mismo flujo de Aurora.

**Captura:**

- Archivos locales arrastrados al sidepanel.
- Archivos abiertos en Google Docs, Sheets, Office Web o PDF viewers.
- Texto seleccionado.
- Metadatos del documento.
- Estructura: títulos, tablas, listas, referencias.

**Procesamiento:**

- PDF → texto limpio + páginas.
- Word → Markdown.
- Excel → tablas normalizadas.
- Markdown → índice + bloques reutilizables.

**Uso en Aurora:**

- Preguntar sobre un documento.
- Extraer decisiones.
- Convertir Word/PDF a Markdown.
- Convertir Markdown a Word/PDF.
- Guardar versiones en `/nexus/fs`.
- Indexar contenido en Wiki.

---

## 12. Aurora PDF Lens

Lectura inteligente de PDFs.

**Funciones:**

- Extraer texto por página.
- Detectar tablas.
- Detectar figuras y pies de imagen.
- Resaltar secciones.
- Crear resumen por capítulo.
- Generar preguntas/respuestas.
- Exportar citas con página.

**Casos de uso:**

- Papers.
- Contratos.
- Manuales.
- Facturas.
- Reportes.
- Documentos legales.

**Integración:**

- Guardar citas en DB.
- Enviar fragmentos a Local/Gemita.
- Crear notas en Scratchpad.
- Generar bibliografía.

---

## 13. Aurora Sheet Mind

Asistente para hojas de cálculo.

**Objetivo:**

Entender, limpiar y transformar datos desde Excel/Google Sheets.

**Captura:**

- Nombres de hojas.
- Rangos seleccionados.
- Encabezados.
- Tipos de columna.
- Fórmulas visibles.
- Valores calculados.
- Tablas dinámicas detectables.

**Funciones:**

- Explicar columnas.
- Detectar inconsistencias.
- Limpiar datos.
- Sugerir fórmulas.
- Generar scripts Python/pandas.
- Crear resúmenes ejecutivos.
- Convertir tabla a Markdown/JSON/CSV.

**Backend posible:**

- `/db/sheets/imports`
- `/db/sheets/analyses`
- `/nexus/py/run` para pandas.
- `/nexus/fs` para CSV/Markdown exportado.

---

## 14. Aurora Media Notes

Notas inteligentes para videos y audios.

**Objetivo:**

Convertir contenido multimedia en notas accionables.

**Fuentes:**

- YouTube.
- Vimeo.
- Podcasts web.
- Archivos MP3/WAV/WEBM locales.
- Reuniones grabadas.

**Captura:**

- URL.
- Título.
- Autor/canal.
- Duración.
- Transcript visible.
- Timestamps.
- Capturas de pantalla.
- Audio local opcional.

**Procesamiento:**

- Resumen por segmentos.
- Capítulos automáticos.
- Decisiones y tareas.
- Citas con timestamp.
- Transcripción a Markdown.
- Búsqueda dentro del audio/video.

**Salida:**

- Notas con timestamps.
- Resumen ejecutivo.
- Preguntas abiertas.
- Tareas derivadas.
- Entrada en Wiki o Scratchpad.

---

## 15. Aurora Office Copilot

Copilot local para documentos activos.

**Funciona en:**

- Google Docs.
- Google Sheets.
- Office Web.
- PDFs en navegador.
- Notion-like editors.
- Editores Markdown web.

**Acciones:**

- Reescribir selección.
- Resumir selección.
- Corregir estilo.
- Traducir.
- Cambiar tono.
- Generar tabla.
- Crear índice.
- Explicar fórmula.
- Convertir texto a Markdown.
- Convertir Markdown a documento.

**Arquitectura:**

- `content.js` captura selección y contexto.
- `background.js` manda al server.
- `/gemita` procesa la solicitud.
- La respuesta se inserta con confirmación.
- Todo queda registrado en `/db/docs/copilot`.

---

## Prioridad recomendada

Orden práctico de implementación:

1. `Aurora Capture`
2. `Aurora Researcher`
3. `Aurora Tasks From Web`
4. `Aurora Clipboard Memory`
5. `Aurora Tab Commander`
6. `Aurora Code Context`
7. `Aurora Form Filler Inteligente`
8. `Aurora Meeting Notes`
9. `Aurora Price Watch`
10. `Aurora Web Automator`
11. `Aurora Docs Bridge`
12. `Aurora PDF Lens`
13. `Aurora Sheet Mind`
14. `Aurora Media Notes`
15. `Aurora Office Copilot`

La mejor primera extensión es **Aurora Capture**, porque habilita el bloque base para casi todas las demás: capturar contexto web y enviarlo al server. Para oficina, la primera debería ser **Aurora Docs Bridge**, porque normaliza Markdown, PDF, Word y Excel antes de construir asistentes más específicos.
