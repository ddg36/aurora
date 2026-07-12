# Auditoría de rendimiento — Aurora v2

Fecha: 2026-07-11. Alcance: backend (Litestar/SQLite/pi), frontend (Preact+HTM sin
build step), extensión Chrome. Metodología: lectura de código + medición directa
(conteos, tamaños de archivo, grep de patrones conocidos de costo), sin profiler en
vivo (fuera de alcance de esta pasada).

## Veredicto general

**El código va en la dirección correcta.** Las decisiones de arquitectura de fondo
son sanas: SQLite con WAL + conexión única (patrón correcto para este tamaño de
datos, no pooling artificial), migraciones numeradas idempotentes, `executemany`
donde corresponde (mdreader.py), cleanup de `requestAnimationFrame` correcto en los
backgrounds animados, memoización ya aplicada donde alguien *ya se dio cuenta* del
problema (el mensaje en streaming de Lyra). No hay red-flags estructurales — es
código de alguien que sabe lo que hace y prioriza correctamente casi siempre.

El patrón real que se repite en todos los hallazgos de abajo es el mismo: **una
optimización se aplica en el punto donde se detectó el síntoma, pero no se
generaliza al resto de los lugares con el mismo problema.** El comentario de
`BloqueTextoVivo` en `message-list.js` lo dice explícito — se optimizó el mensaje
en vivo porque *alguien lo vio tirar el framerate a 5fps en un celular*, pero el
`.map()` de mensajes históricos, literas líneas más abajo, en el mismo archivo,
tiene el mismo bug sin resolver. Eso es la firma de "se arregla lo que molesta, no
se audita la clase de problema" — exactamente lo que esta auditoría existe para
cerrar.

Sin build step (175 módulos `.js` sueltos, sin bundler) es una decisión consciente
documentada (`aurora-v2.md`) — no es un "error", es un trade-off: cold start más
lento a cambio de cero configuración de build y debug directo en el navegador. Se
señala igual como hallazgo porque el costo es medible y hay mitigaciones baratas
(preload/prefetch) que no rompen esa decisión.

## Tabla de severidad

| # | Severidad | Área | Título |
|---|-----------|------|--------|
| P-1 | 🟠 Alta | Frontend | Historial de mensajes de Lyra re-parsea markdown en CADA render, para CADA mensaje — mismo bug ya resuelto para el mensaje en vivo, no generalizado |
| P-2 | 🟠 Alta | Frontend | Sin virtualización de lista: un chat largo monta/actualiza el DOM de TODO el historial en cada render, no sólo lo visible |
| P-3 | 🟠 Alta | Backend | `/db/wiki/grep` hace I/O de filesystem completo (recorre todos los archivos, lee cada uno entero) en cada tecla, sin debounce — y duplica un FTS que ya existe e indexa lo mismo |
| P-4 | 🟡 Media | Frontend | Cold start: 175 módulos JS sin bundle/minify — sólo 27 imports en cascada para abrir Lyra |
| P-5 | 🟡 Media | Frontend | Memoización rara: sólo 11/175 archivos usan `useMemo`/`useCallback`; 21 usos de `dangerouslySetInnerHTML` con markdown, la mayoría sin memo |
| P-6 | 🟡 Media | Backend | `backup.py` restore: INSERT fila por fila en un loop (`for fila in filas: await db.execute(...)`) en vez de `executemany` |
| P-7 | 🟢 Baja | Backend | `search.py`: aunque el N+1 de contexto ya se corrigió, el resto de rutas con `for ... await db.execute` no se auditó una por una (backup, chats, wiki, prompts, team_roles) |
| P-8 | 🟢 Baja | Frontend | Querystring de cache-busting (`?v=v2-clean-ui-14`) fijo por archivo — ya documentado como bug de caché stale (memoria `feedback-cdp-cache-modulos`), afecta también a usuarios reales, no sólo debugging |
| P-9 | 🟢 Baja | Frontend | Polling de `/health` cada 5s mientras la vista "inicio" está montada — barato pero sin backoff si la pestaña queda en background |

---

## P-1 — Historial de Lyra re-parsea markdown sin memo (🟠 Alta)

**Archivo:** `ui/modules/lyra/view/message-list.js`

El propio código ya documenta el bug de clase (líneas 23-31):

> "sin memoizar, renderizarContenido() (markdown + syntax highlight) se
> re-ejecutaba sobre TODO el texto acumulado en CADA uno de esos renders, aunque
> el contenido no hubiera cambiado desde el render anterior. Costo ~O(n²) con el
> largo de la respuesta — invisible en una PC, tira el framerate a 5fps en un
> celular (bug real reportado en vivo, sólo mientras genera). useMemo sólo
> recalcula si b.contenido cambió de verdad."

Ese análisis es correcto y el fix (`BloqueTextoVivo`, líneas 32-35) es el patrón
correcto — `useMemo(() => renderizarContenido(contenido), [contenido])`. El
problema: **ese componente sólo envuelve el mensaje EN VIVO** (streaming). El
`.map()` de mensajes ya completados, en el mismo archivo, llama
`renderizarContenido(msg.content)` directo en el JSX en 4 lugares (líneas 76, 129,
160, 198) — sin memo.

Consecuencia real: mientras Lyra está generando una respuesta (streaming activo),
el componente padre re-renderiza en cada token. Cada uno de esos renders
**vuelve a parsear markdown + resaltar sintaxis de TODOS los mensajes históricos
del chat**, no sólo el que está en vivo — el mismo O(n²) que se documentó para el
mensaje en vivo, multiplicado por el largo del historial completo. En un chat de
50 mensajes con bloques de código, esto es notable incluso en desktop; en un
celular es el mismo 5fps que ya se reportó, sólo que ahora también durante el
streaming de cualquier respuesta en cualquier chat con historial largo.

**Fix:** extraer un componente `MensajeHistorico` (o extender `BloqueTextoVivo` para
aceptar cualquier mensaje) que memoice por `msg.id` o `msg.content`, y usarlo en los
4 sitios. Una tarde de trabajo, mismo patrón ya escrito y probado en el archivo.

## P-2 — Sin virtualización de lista de mensajes (🟠 Alta)

**Archivo:** `ui/modules/lyra/view/lyra.js:859`, consumido por `message-list.js`

```js
const visibleMessages = historialVal.filter(m => !m._internal);
```

`visibleMessages` es el historial completo del chat (menos mensajes internos), sin
paginación ni ventaneo. Con P-1 resuelto, el costo de *parsear* markdown deja de
repetirse — pero **el costo de mantener esos nodos DOM montados** sigue estando:
Preact reconcilia contra el vdom completo, el navegador mantiene layout/paint de
todos los mensajes (visibles y no), y el scroll container acumula altura sin
límite.

Para chats cortos (la mayoría, probablemente) esto no importa. Se marca como
hallazgo porque **no hay ningún límite ni estrategia** — un chat que crece con
el tiempo (uso diario acumulado) eventualmente entra en una zona donde el chat
completo se vuelve perceptiblemente pesado de scrollear, sin que haya una señal
de alerta antes de llegar ahí.

**Fix, en orden de esfuerzo:**
1. Más simple: cap duro (ej. renderizar sólo los últimos N mensajes + botón
   "cargar más arriba"), ya que Aurora es local y no hay presión de "mostrar todo
   el historial de golpe" como un producto SaaS.
2. Más completo: virtualización real (windowing) — sólo montar los mensajes
   dentro del viewport + un margen, con altura estimada para los de afuera. Más
   trabajo, sin dependencia externa ya que no hay bundler (`react-window`
   requeriría empaquetarlo o portarlo a mano).

## P-3 — `/db/wiki/grep`: grep de filesystem completo por tecla, duplicado del FTS (🟠 Alta)

**Archivos:** `src/db/routes/wiki.py:40-68`, `ui/modules/wiki/view/wiki.js:90-99`

```python
@get("/grep")
async def grep_wiki(self, request: Request, q: str = "", limit: int = 20) -> list:
    ...
    for root, _, files in os.walk(WIKI_DIR):
        for fname in files:
            fpath = os.path.join(root, fname)
            with open(fpath, encoding="utf-8", errors="ignore") as f:
                lineas = f.readlines()
            for i, ln in enumerate(lineas):
                if ql in ln.lower():
                    ...
```

Sin filtro de extensión (`.md`), sin límite de tamaño de archivo, sin cache. Lee
**todos** los archivos del directorio wiki completos a memoria en cada llamada,
línea por línea, con un `.lower()` por línea (alocación nueva cada vez). El
frontend lo llama en `onInput` sin debounce:

```js
onInput=${e => { setQuery(e.target.value); buscar(e.target.value); }}
```

Cada tecla presionada dispara un recorrido completo de filesystem O(archivos ×
líneas). Con una wiki de tamaño moderado (cientos de notas) esto es un grep
sincrónico bloqueando el event loop de Litestar por cada carácter tipeado —
degrada la respuesta de *toda la app* para todos los usuarios mientras corre,
no sólo la búsqueda de wiki (es un solo proceso, un solo loop).

**Lo más señalable de este hallazgo:** ya existe `search_fts` (FTS5, indexado,
con triggers de mantenimiento automático, tipo `'wiki'` incluido) que resuelve
exactamente este caso — indexado, con `bm25` scoring, sin recorrer filesystem.
`/db/search?tipos=wiki` ya hace este trabajo bien. **Hay dos mecanismos de
búsqueda de wiki en paralelo**, uno correcto y uno costoso, y la UI usa el
costoso.

**Fix:** cambiar `wiki.js`'s `buscar()` para llamar `/db/search?tipos=wiki&q=...`
en vez de `/db/wiki/grep`, con debounce (150-200ms, mismo patrón ya usado en el
CommandPalette). El endpoint `/db/wiki/grep` puede quedar como utilidad interna
(ej. para un futuro "buscar y reemplazar" que sí necesite líneas exactas), pero
no debería ser el camino de búsqueda interactiva.

## P-4 — Cold start sin bundle (🟡 Media)

175 archivos `.js` bajo `ui/`, sin bundler ni minificación (decisión consciente,
documentada en `docs/ideas/aurora-v2.md`). Abrir la vista Lyra dispara 27 imports
en cascada (`import` anidados desde `lyra.js`) antes de que el componente esté
listo para renderizar. Cada uno es un round-trip HTTP separado (aunque
HTTP/1.1 keep-alive o HTTP/2 multiplexan sobre la misma conexión a
`localhost:7779`, sigue habiendo overhead de parseo/compilación de motor JS por
archivo, sin tree-shaking de código muerto).

Esto **no es un bug** — es el costo aceptado de la decisión "sin build step,
debug directo en el navegador". Se documenta acá porque tiene mitigaciones
baratas que no comprometen esa decisión:

- **`<link rel="modulepreload">`** para los módulos de la vista por defecto
  (`inicio`) en el HTML raíz, para que el navegador empiece a buscar esos
  archivos antes de que el JS lo pida.
- Nada de bundling real — sería revertir la decisión de arquitectura, fuera de
  alcance de una recomendación de "optimizar sin cambiar de rumbo".

## P-5 — Memoización rara en general (🟡 Media)

Sólo 11 de 175 archivos usan `useMemo`/`useCallback`. 21 usos de
`dangerouslySetInnerHTML` con contenido derivado de markdown/HTML renderizado —
la mayoría fuera de esos 11 archivos memoizados, es decir, recalculando el HTML
renderizado en cada render del componente que los contiene, tengan o no el
mismo contenido de entrada.

No se investigó cada uno de los 21 (fuera de alcance de esta pasada — ver P-1 y
P-2 como los dos casos donde el costo es alto y medible). Se deja como línea de
auditoría futura: cualquier `dangerouslySetInnerHTML` con contenido derivado de
una función de parseo (markdown, syntax highlight, sanitización) debería
memoizar por su input, mismo patrón que `BloqueTextoVivo`.

## P-6 — Restore de backup sin `executemany` (🟡 Media)

**Archivo:** `src/db/routes/backup.py:83-94`

```python
for fila in filas:
    ...
    await db.execute(sql, [fila[k] for k in claves])
```

INSERT fila por fila en un loop, en vez de `executemany` (que `mdreader.py` sí
usa correctamente para su propio caso, líneas 136-168 del mismo módulo — el
patrón correcto YA existe en el codebase, sólo no se aplicó acá). Es una
operación administrativa poco frecuente (restore manual), así que el impacto
real es bajo — pero con un backup grande (miles de filas en `mensajes`, por
ejemplo) la diferencia entre fila-por-fila y `executemany` es de órdenes de
magnitud en tiempo de restore.

**Fix:** agrupar los `INSERT` por tabla y usar `executemany` con la lista de
tuplas de valores, igual que ya hace `mdreader.py`.

## P-7 — Resto de rutas con loop+execute sin auditar individualmente (🟢 Baja)

`grep` encontró loops con `await db.execute`/`await cur.fetchone` dentro en:
`backup.py` (cubierto en P-6), `chats.py`, `creativity_ideas.py`,
`builder_templates.py`, `extensions.py`, `mdreader.py` (ya usa `executemany`,
sin problema), `productividad.py`, `prompts.py`, `team_roles.py`, `wiki.py`
(cubierto en P-3), `usuarios.py`. No se revisó cada uno línea por línea en esta
pasada — la mayoría son loops de post-procesamiento sobre resultados ya
traídos (no N+1 real), pero queda como lista de verificación para una
próxima pasada si alguna de esas rutas empieza a sentirse lenta en uso real.

## P-8 — Cache-busting con querystring fijo (🟢 Baja, ya documentado)

Ya cubierto en memoria de sesiones previas (`feedback-cdp-cache-modulos`): los
imports usan `?v=v2-clean-ui-14` fijo — el navegador cachea agresivamente esa
URL exacta. Documentado ahí como problema de *debugging* (hay que forzar
querystring nuevo para ver cambios en vivo), pero es el mismo mecanismo que
afecta a usuarios reales: **un usuario con la pestaña/sidepanel abierto desde
antes de un deploy no ve el código nuevo** hasta que recargue con cache
invalidada, porque la versión en el querystring no cambió. Si el pipeline de
release no bump-ea esos strings en cada cambio real, esto es software
desactualizado corriendo en producción sin que el usuario lo note.

**Fix:** automatizar el bump del querystring (hash de contenido del archivo, o
timestamp de build) en vez de un string manual por archivo — mismo espíritu
que cache-busting de cualquier asset estático, sin necesidad de bundler.

## P-9 — Polling de `/health` sin backoff (🟢 Baja)

`ui/modules/inicio/view/inicio.js:47`: `setInterval(refrescarHealth, 5000)`
mientras la vista "inicio" está montada. Barato en sí (`/health` es una sola
llamada liviana), y se limpia correctamente al desmontar (`clearInterval` en el
cleanup del efecto) — no es un leak. Se marca como hallazgo menor porque no hay
lógica de "pausar si la pestaña está oculta" (`document.visibilityState`), así
que sigue pooleando cada 5s aunque el usuario esté en otra pestaña del
navegador con Aurora de fondo. Impacto real bajo (una request cada 5s es
insignificante), documentado por completitud.

---

## Lo que YA está bien (para no repetir trabajo)

- **Conexión DB única + WAL + `busy_timeout=5000`**: patrón correcto para
  SQLite, no necesita pool.
- **`executemany` en `mdreader.py`**: usado correctamente donde corresponde.
- **`_fts_backfill` idempotente** (sesión anterior): backfill por tabla-vacía,
  no por existencia — evita el bug de FTS-vacío-para-siempre.
- **`json_loose`**: lectura tolerante de columnas JSON, sin necesidad de
  recrear tablas con `CHECK`.
- **`N+1` de `/db/search`**: ya corregido (sesión anterior) a 3 queries batch
  por tipo en vez de una por resultado.
- **Cleanup de `requestAnimationFrame`** en los 24 backgrounds animados: todos
  correctamente cancelados en `componentWillUnmount`.
- **`BloqueTextoVivo`** en Lyra: el patrón de memoización correcto ya existe
  y está probado — el trabajo de P-1 es *replicarlo*, no inventarlo.
- **VACUUM+ANALYZE a demanda** (sesión anterior): separado del mantenimiento
  de arranque (barato), no corre automáticamente donde sería caro.

## Priorización sugerida

1. **P-1 + P-2** (Lyra): mismo archivo, mismo esfuerzo de una sentada — el
   historial de mensajes es lo que más se usa en la app día a día.
2. **P-3** (wiki grep → FTS): cambio de una línea en el frontend + debounce,
   alto impacto, bajo esfuerzo.
3. **P-6** (backup executemany): bajo esfuerzo, sólo importa si el restore se
   usa con datos grandes.
4. **P-8** (cache-busting automático): esfuerzo medio (tocar el pipeline de
   versión de querystrings), pero previene bugs invisibles de "usuario viendo
   código viejo sin saberlo".
5. Resto: bajo impacto medido, quedan como lista de verificación para cuando
   se sientan en uso real.
