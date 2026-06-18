# Aurora v2 — Footer + Mejoras + 10 Bonus

Fecha: 2026-06-11
Estado: aprobado, listo para plan
Objetivo: cerrar el gap del footer del au-aihub (no migrado) + 4 mejoras pedidas + 10 bonus.

## Contexto

Aurora v2 (Litestar :7779, Preact+HTM+signals, sin build, DB SQLite, sin localStorage salvo token auth) ya replicó las 14 vistas del au-aihub. **Pero perdió el footer del sidepanel** y sus acciones. El au-aihub usaba un footer declarativo por manifest con 3 zonas (`foot.global`, `foot.module`, `foot.view`). Aurora v2 no tiene footer.

Único módulo de vista no portado: `CurrentView` (extensión-only, lee DOM del iframe activo) — fuera de alcance.

## Decisión de diseño (usuario)

- Footer **completo idéntico** al aihub, **adaptado a aurora v2 sin manifest** (acciones en JS plano, no declarativas por string-handler).
- Acciones extensión-only (inject protocolo cross-origin, captura de iframe): funcionales donde se pueda (Clipboard API, postMessage same-origin), aviso Toast "requiere extensión" donde no.
- Todas las 4 mejoras + 10 bonus.

---

## Parte A — Sistema de Footer

### A.1 Componente y registry

- `ui/components/footer/registry.js`
  - signal `footActions = signal({ global: [], module: [], view: [] })`.
  - `setViewActions(arr)` / `clearViewActions()` para que el módulo activo registre/limpie.
  - Las zonas `global` y `module` se definen una vez (estáticas).
- `ui/components/footer/footer.js`
  - `<Footer>` montado en `app.js` debajo de `<main>`.
  - Layout aihub: `<footer class="px-2 py-1.5 border-t ...">`, grupos `[global, module, view]` no vacíos, separador con glow entre grupos, scroll horizontal.
  - Acción `{ id, icon, title, onClick, active?, disabled?, component? }`. Si trae `component`, renderiza ese Preact component (caso Duo modal). Si no, botón con icon/title.
- `ui/components/footer/acciones-modulo.js` — las 4 acciones fijas `foot.module`:
  - `＋` Add LLM → abre modal urls-custom (reutiliza modal de ajustes).
  - `{ }` JSON Detective → lee clipboard (Clipboard API), detecta/extrae/formatea JSON, lo abre en Scratchpad. **Funciona sin extensión.**
  - `⊞` Cargar portapapeles → vuelca clipboard a Scratchpad.
  - `@@` Inject protocolo → postMessage `AURORA_INJECT_PROTOCOL` a iframes cloud; same-origin OK, cross-origin → Toast "requiere extensión".

### A.2 Integración por módulo (foot.view)

Cada `view/*.js` registra sus acciones en `useEffect` (cleanup las quita):

- **LLMCloud**: `📄¹²³` extraer texto / `📸¹²³` captura por panel (extensión-only → Toast), `⇄` swap paneles (funciona), `⇆ Duo` → `component: DuoButton` (abre `DuoConfigModal`).
- **Prompts**: mover el botón ⬇ Plantillas existente a foot.
- **Scratchpad / Wiki / Editor**: guardar / nuevo / export como acciones foot.
- **Local**: opcional promover limpiar/export a foot (la barra superior ya las tiene; no duplicar — solo export PDF y limpiar).

---

## Parte B — 4 mejoras pedidas

### B.1 Login multi-usuario
- Pantalla de arranque si no hay token válido: GET `/db/usuarios` (lista), selector + "crear usuario" (POST `/db/usuarios/init`).
- Token por usuario en DB; boot.js guarda el elegido. Workspace por usuario.
- Sin login forzado para `deml` (auto si hay un solo usuario y ya tiene token).

### B.2 RAG Wiki
- `src/wiki/indexer.py`: embeddings vía llama.cpp `/v1/embeddings` (mismo server :8088), tabla `wiki_indice` ya existe.
- Endpoint `POST /db/wiki/reindex` y `GET /db/wiki/search?q=`.
- Tool `wiki_search` en `src/gemita/tools.py` para que Gemita consulte la wiki.

### B.3 Duo nativo server-side
- 2 conexiones WS `/gemita` independientes (cada una = GemitaSession). Orquestador en cliente: salida de A → entrada de B, N rondas, delay configurable.
- `DuoConfigModal` (modos libre/debate/colaboración/interrogatorio, rondas, delay, panel inicial) — ya portable del aihub foot-component.js.
- Sin iframe, sin extensión. Vista nueva o panel en LLMCloud.

### B.4 Persistencia sesión UI + telemetría
- Ajuste DB `ui_session` (tab activo, modelo elegido, panel abierto, scroll opcional). Restaura al cargar.
- Telemetría: tabla `eventos` + `sesiones` (ya existen). Registrar arranque, tab switches, uso de tools.

---

## Parte C — 10 Bonus

1. **Command palette (Ctrl+K)** — búsqueda global sobre chats / prompts / wiki / notas; navegación rápida.
2. **Atajos de teclado** — Ctrl+1..9 tabs, Ctrl+Enter enviar, Ctrl+N nuevo chat, Esc cerrar modal.
3. **Cloud history UI** — tablas `cloud_conversaciones/mensajes` ya existen, sin UI. Listar/ver/buscar conversaciones cloud capturadas.
4. **Backup total** — export/import de toda la DB del usuario a un JSON (ajustes + chats + prompts + notas + wiki).
5. **Tema por hora** — auto claro/oscuro según hora local, sobre el sistema de themes existente.
6. **Centro de notificaciones** — avisos in-app desde tabla `eventos` (toolcalls de riesgo, reindex listo, errores).
7. **Drag-drop archivos** — soltar imagen/archivo en Local (visión) o Scratchpad.
8. **Markdown preview en composer Local** — toggle render del mensaje antes de enviar.
9. **Pin de mensajes** — fijar un mensaje del chat y guardarlo a wiki/notas con un click.
10. **Health dashboard en Inicio** — ping en vivo de llama.cpp :8088, nexus, voz (whisper/edge-tts); semáforos de estado.

---

## Orden de implementación (para /loop)

1. **Footer core** (A.1) — registry + componente + 4 acciones module. Smoke headless.
2. **Footer por vista** (A.2) — LLMCloud (sin Duo), Prompts, Scratchpad, Wiki, Editor.
3. **Duo nativo** (B.3) — orquestador + DuoConfigModal + DuoButton en LLMCloud foot.
4. **Health dashboard** (C.10) + **atajos** (C.2) + **command palette** (C.1).
5. **Persistencia sesión UI** (B.4).
6. **Login multi-usuario** (B.1).
7. **Cloud history UI** (C.3) + **backup total** (C.4) + **centro notificaciones** (C.6).
8. **RAG Wiki** (B.2) — backend embeddings + tool + UI search.
9. **Bonus UI restantes** (C.5 tema-hora, C.7 drag-drop, C.8 md-preview, C.9 pin).
10. Verificación final: smoke headless de todo, grep localStorage, actualizar `docs/aurora-v2.md`.

## Criterios de éxito

- Footer visible y funcional en las 14 vistas, con las 3 zonas.
- Acciones portables funcionan; las extensión-only avisan claro (sin botones muertos silenciosos).
- Cada feature DB-backed (cero localStorage nuevo salvo auth).
- Smoke headless 14/14 tabs sin errores tras cada bloque.
- `docs/aurora-v2.md` refleja el estado final.

## Fuera de alcance

- `CurrentView` (extensión-only).
- Captura real de iframe cross-origin y inject protocolo cross-origin (requieren extensión Chrome).
- Sync entre dispositivos (FASE 5).
