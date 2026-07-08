"""Test del puente pi: PYTHONPATH no hace falta — ajusta sys.path solo.

Correr: .venv-linux/bin/python3 tests/pi/test_bridge.py
"""

import asyncio
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src"))

from pi import bridge as B
from pi.proceso import PiProceso

FAKE = str(pathlib.Path(__file__).parent / "fake_pi.py")


class FakeSocket:
    def __init__(self):
        self.enviados = []

    async def send_text(self, texto):
        self.enviados.append(json.loads(texto))


async def main():
    B._RUTA_MAPA = pathlib.Path(tempfile.mkdtemp()) / "aurora-map.json"
    proceso = PiProceso(on_event=B._on_event, argv=[sys.executable, FAKE])
    B._proceso = proceso

    sock = FakeSocket()
    br = B.PiBridge(sock)

    await br.enviar_estado("session_init")
    tipos = [m["type"] for m in sock.enviados]
    assert "session_init" in tipos, tipos

    await br.manejar_chat({"type": "chat", "message": "hola", "chat_id": 42, "system": "sé breve"})
    tipos = [m["type"] for m in sock.enviados]
    for esperado in ("thinking", "token", "tool_call", "tool_result", "done"):
        assert esperado in tipos, (esperado, tipos)
    tokens = "".join(m["content"] for m in sock.enviados if m["type"] == "token")
    assert tokens == "Hola mundo", tokens

    mapa = B._cargar_mapa()
    assert "42" in mapa, mapa

    sock.enviados.clear()
    await br.manejar_chat({"type": "chat", "message": "seguimos", "chat_id": 42})
    tipos = [m["type"] for m in sock.enviados]
    assert "done" in tipos, tipos

    await br.manejar_models()
    modelos = [m for m in sock.enviados if m["type"] == "models"][-1]["models"]
    assert modelos and modelos[0]["id"] == "llamacpp", modelos

    imagen = "data:image/png;base64,QUJD"
    texto, imagenes = B._extraer_contenido([
        {"type": "text", "text": "mira"},
        {"type": "image_url", "image_url": {"url": imagen}},
    ])
    assert texto == "mira" and imagenes == [{"type": "image", "data": "QUJD", "mimeType": "image/png"}]

    # Regresión: texto real del LLM durante una tool no se pierde ni pisa
    # el resultado real de la tool (bug encontrado en _tool_in_progress buffer).
    sock.enviados.clear()
    await br.manejar_chat({"type": "chat", "message": "TEST_INTERLEAVED", "chat_id": None, "system": ""})
    tipos = [m["type"] for m in sock.enviados]
    assert "done" in tipos, tipos

    tokens = "".join(m["content"] for m in sock.enviados if m["type"] == "token")
    assert tokens == "narración durante la tool después", tokens

    resultados = [m for m in sock.enviados if m["type"] == "tool_result"]
    assert len(resultados) == 1, resultados
    assert resultados[0]["output"] == "RESULTADO_REAL_DE_LA_TOOL", resultados[0]

    # ── Capa 1: comandos reales de pi como builtins ──
    B._RUTA_SCOPED = pathlib.Path(tempfile.mkdtemp()) / "scoped-models.json"
    B._RUTA_AUTH = pathlib.Path(tempfile.mkdtemp()) / "auth.json"  # nunca la real en tests
    B._RUTA_SETTINGS = pathlib.Path(tempfile.mkdtemp()) / "settings.json"  # nunca la real en tests

    async def comando(texto: str, chat_id=None) -> dict:
        """Manda un builtin y devuelve el ÚLTIMO command_result — nunca debe
        haber 'token'/'thinking' (canal separado del chat, regresión directa
        del bug: /session ensuciaba historial/DB/contexto)."""
        sock.enviados.clear()
        await br.manejar_chat({"type": "chat", "message": texto, "chat_id": chat_id, "system": ""})
        assert not any(m["type"] in ("token", "thinking") for m in sock.enviados), sock.enviados
        resultados = [m for m in sock.enviados if m["type"] == "command_result"]
        assert resultados, sock.enviados
        return resultados[-1]

    r = await comando("/settings")
    assert r["interactive"] and r["data"]["thinkingActual"] == "medium", r
    opciones = {op["id"]: op for op in r["data"]["opciones"]}
    assert opciones["autocompact"]["actual"] == "true", opciones
    assert opciones["steering"]["actual"] == "one-at-a-time", opciones
    assert opciones["followup"]["actual"] == "one-at-a-time", opciones
    # Regresión: /settings sólo exponía 3 cosas de sesión — pi tiene mucho
    # más comportamiento real configurable (persistido en settings.json,
    # settings-manager.js) además de lo de sesión vía RPC. Se excluyen sólo
    # los settings puramente de terminal (tema ANSI, padding, cursor).
    assert opciones["hide-thinking"]["actual"] == "false", opciones
    assert opciones["default-thinking"]["actual"] == "medium", opciones
    assert opciones["transport"]["actual"] == "auto", opciones
    assert opciones["http-idle-timeout"]["actual"] == "300000", opciones
    assert opciones["tree-filter"]["actual"] == "default", opciones
    assert opciones["block-images"]["actual"] == "false", opciones
    assert len(opciones) >= 14, opciones  # 3 vía RPC (auto-persistente) + 11 escritos directo

    r = await comando("/settings low")
    assert not r["interactive"] and "✔ Thinking: low" in r["data"]["texto"], r

    # Regresión: setThinkingLevel clampea en silencio si el modelo activo no
    # soporta el nivel pedido (agent-session.js:_clampThinkingLevel) — antes
    # se confirmaba el nivel PEDIDO sin verificar qué quedó realmente
    # aplicado. fake_pi simula un modelo que sólo soporta hasta 'medium'.
    r = await comando("/settings high")
    assert not r["interactive"], r
    assert 'pediste "high"' in r["data"]["texto"] and 'quedó en "medium"' in r["data"]["texto"], r

    # autocompact/steering/followup usan RPC propia — en pi real esa RPC
    # (session.setAutoCompactionEnabled/setSteeringMode/setFollowUpMode) YA
    # persiste sola (agent-session.js:1272-1282,1657 son passthrough directo
    # a settingsManager) — no hay "modo sesión" separado, cualquier cambio
    # afecta también las próximas sesiones.
    r = await comando("/settings autocompact:false")
    assert "Auto-compact: false" in r["data"]["texto"], r
    r = await comando("/settings")
    assert {op["id"]: op["actual"] for op in r["data"]["opciones"]}["autocompact"] == "false"

    r = await comando("/settings steering:all")
    assert "Steering: all" in r["data"]["texto"], r
    r = await comando("/settings followup:all")
    assert "Follow-up: all" in r["data"]["texto"], r
    r = await comando("/settings")
    actuales = {op["id"]: op["actual"] for op in r["data"]["opciones"]}
    assert actuales["steering"] == "all" and actuales["followup"] == "all", actuales

    # Settings PERSISTIDOS (bool y choice) — escriben directo en
    # settings.json (_RUTA_SETTINGS), igual que auth.json/scoped-models.json.
    r = await comando("/settings hide-thinking:true")
    assert "Ocultar thinking: true" in r["data"]["texto"], r
    r = await comando("/settings transport:websocket")
    assert "Transporte: websocket" in r["data"]["texto"], r
    r = await comando("/settings block-images:true")
    assert "Bloquear imágenes a proveedores: true" in r["data"]["texto"], r
    r = await comando("/settings")
    actuales = {op["id"]: op["actual"] for op in r["data"]["opciones"]}
    assert actuales["hide-thinking"] == "true", actuales
    assert actuales["transport"] == "websocket", actuales
    assert actuales["block-images"] == "true", actuales
    # Sobrevive un archivo settings.json ya existente con OTRAS claves
    # reales (packages, defaultProvider, etc.) — no debe pisarlas.
    guardado = json.loads(B._RUTA_SETTINGS.read_text())
    assert guardado["hideThinkingBlock"] is True, guardado
    assert guardado["transport"] == "websocket", guardado
    assert guardado["images"]["blockImages"] is True, guardado

    # Choice inválido: no escribe nada, avisa el uso correcto.
    r = await comando("/settings transport:noexiste")
    assert "Uso: /settings transport:" in r["data"]["texto"], r

    r = await comando("/settings noexiste:x")
    assert "desconocida" in r["data"]["texto"], r

    # Regresión: tree-filter-mode ahora es real — cambiarlo debe cambiar
    # qué nodos devuelve /tree (antes el filtro estaba hardcodeado a
    # 'default' sin importar lo que dijera el setting).
    r = await comando("/settings tree-filter:user-only")
    assert "Filtro default de /tree: user-only" in r["data"]["texto"], r
    r = await comando("/tree")
    assert r["data"]["filtro"] == "user-only", r
    assert all(n["rol"] == "user" for n in r["data"]["nodos"]), r["data"]["nodos"]
    r = await comando("/settings tree-filter:default")
    assert "default" in r["data"]["texto"], r

    r = await comando("/settings noexiste:x")
    assert "desconocida" in r["data"]["texto"], r

    # Regresión: /model con arg debía aplicar SÓLO en match exacto (como pi:
    # findExactModelMatch) — antes aplicaba a ciegas el primer substring,
    # pudiendo fijar "claude-haiku-4-5-20251001" cuando el usuario pidió
    # "claude-haiku-4-5" (substring de ambos).
    r = await comando("/model claude-haiku-4-5")
    assert not r["interactive"] and "claude-haiku-4-5" in r["data"]["texto"], r
    assert "20251001" not in r["data"]["texto"], r

    # Sin match exacto ("claude-haiku" no es el id de ninguno): abre el
    # selector interactivo prefiltrado, nunca aplica a ciegas.
    r = await comando("/model claude-haiku")
    assert r["interactive"], r
    ids = [m["id"] for m in r["data"]["modelos"]]
    assert set(ids) == {"claude-haiku-4-5", "claude-haiku-4-5-20251001"}, ids

    # Regresión (puro teatro): /model con match exacto confirmaba "✔ Modelo"
    # sin mirar si set_model realmente tuvo éxito.
    r = await comando("/model modelo-que-falla")
    assert not r["interactive"], r
    assert "No se pudo fijar" in r["data"]["texto"] and "Model not found" in r["data"]["texto"], r

    # Regresión (puro teatro): /new decía "Sesión nueva" aunque new_session
    # viniera cancelado por un hook — new_session real SIEMPRE success:true,
    # la cancelación va en data.cancelled.
    pedir_original_new = proceso.pedir

    async def pedir_new_cancelado(cmd, *a, **kw):
        if cmd.get("type") == "new_session":
            return {"success": True, "data": {"cancelled": True}}
        return await pedir_original_new(cmd, *a, **kw)

    proceso.pedir = pedir_new_cancelado
    r = await comando("/new")
    proceso.pedir = pedir_original_new
    assert "Cancelado" in r["data"]["texto"], r

    # Regresión: /name sin arg debía mostrar el nombre actual si ya hay uno
    # seteado — antes siempre mostraba el "Usage:" ignorando ese estado.
    r = await comando("/name")
    assert "Uso: /name" in r["data"]["texto"], r
    r = await comando("/name Charla de prueba")
    assert "Charla de prueba" in r["data"]["texto"], r
    r = await comando("/name")
    assert "Charla de prueba" in r["data"]["texto"], r

    r = await comando("/tree")
    assert r["interactive"], r
    nodos = r["data"]["nodos"]
    assert any("hola" in n["preview"] for n in nodos), nodos
    assert any(n["actual"] for n in nodos), nodos
    # Regresión: la indentación sólo debe avanzar en un branch real — esta
    # sesión de prueba es una cadena lineal (user → assistant, sin ramas),
    # así que TODOS los nodos deben quedar en profundidad 0 (antes: cada
    # nivel sumaba +1 aunque no hubiera bifurcación, "escalera infinita").
    assert all(n["profundidad"] == 0 for n in nodos), nodos

    # Regresión: /session perdía 'tokens'/'cost' (dicts anidados de
    # get_session_stats) porque el filtro los descartaba enteros.
    r = await comando("/session")
    assert "tokens" in r["data"]["texto"] and "input=100" in r["data"]["texto"], r
    assert "cost: 0.0123" in r["data"]["texto"], r

    # Regresión: /compact <instrucciones> se tiraba sin usar — pi real las
    # pasa como customInstructions (rpc-mode.js case "compact").
    comandos_vistos = []
    pedir_original = proceso.pedir

    async def pedir_espia(cmd, *a, **kw):
        comandos_vistos.append(cmd)
        return await pedir_original(cmd, *a, **kw)

    proceso.pedir = pedir_espia
    r = await comando("/compact enfocate en el bug de streaming")
    proceso.pedir = pedir_original
    compact_cmds = [c for c in comandos_vistos if c.get("type") == "compact"]
    assert compact_cmds and compact_cmds[-1].get("customInstructions") == "enfocate en el bug de streaming", compact_cmds
    # Regresión CRÍTICA (puro teatro): bridge.py mandaba "Listo — lo viejo
    # quedó resumido" SIN mirar resp.get('success') — confirmado en vivo con
    # una sesión real chica: pi devolvía success:false/"Nothing to compact
    # (session too small)" y Aurora igual decía que había compactado.
    assert "Compactado" in r["data"]["texto"], r
    assert "5000" in r["data"]["texto"] and "800" in r["data"]["texto"], r
    assert "resumen de prueba" in r["data"]["texto"], r

    r = await comando("/compact FALLAR")
    assert "No se compactó" in r["data"]["texto"], r
    assert "Nothing to compact" in r["data"]["texto"], r

    # /copy manda el texto crudo + 'copiar':True — el clipboard real lo hace
    # el frontend (navigator.clipboard), el backend no puede tocarlo.
    r = await comando("/copy")
    assert "ULTIMO_MENSAJE_DE_PRUEBA" in r["data"]["texto"], r
    assert r["data"]["copiar"] is True, r

    r = await comando("/fork e1")
    assert not r["interactive"]
    assert "Ramificado" in r["data"]["texto"] and r["data"]["sessionPath"], r
    assert r["data"]["parentChatId"] is None  # chat_id=None en este test

    r = await comando("/clone")
    assert "duplicada" in r["data"]["texto"] and r["data"]["sessionPath"], r

    r = await comando("/trust")
    assert "confianza" in r["data"]["texto"], r

    r = await comando("/resume")
    assert "historial" in r["data"]["texto"], r

    r = await comando("/hotkeys")
    assert "Enter" in r["data"]["texto"], r

    r = await comando("/changelog")
    assert "Lyra" in r["data"]["texto"], r

    r = await comando("/scoped-models add llamacpp")
    assert r["interactive"] and "llamacpp" in r["data"]["favoritos"], r
    r = await comando("/scoped-models")
    assert "llamacpp" in r["data"]["favoritos"], r
    r = await comando("/scoped-models remove llamacpp")
    assert "llamacpp" not in r["data"]["favoritos"], r

    r = await comando("/login nvidia clave-de-test-123")
    assert "guardada" in r["data"]["texto"], r
    auth = json.loads(B._RUTA_AUTH.read_text())
    assert auth["nvidia"] == {"type": "api_key", "key": "clave-de-test-123"}, auth

    r = await comando("/logout nvidia")
    assert "borrada" in r["data"]["texto"], r
    assert "nvidia" not in json.loads(B._RUTA_AUTH.read_text())

    r = await comando("/import /ruta/que/no/existe.jsonl")
    assert "No existe" in r["data"]["texto"], r

    # /import pide confirmación propia antes de reemplazar la sesión activa
    # (igual que pi real: "Replace current session with X?") — se confirma
    # o cancela en paralelo, mismo patrón que /quit más abajo.
    async def confirmar_pronto():
        for _ in range(50):
            if br._builtin_confirm is not None:
                await br.responder_confirm(True)
                return
            await asyncio.sleep(0.05)

    async def cancelar_pronto():
        for _ in range(50):
            if br._builtin_confirm is not None:
                await br.responder_confirm(False)
                return
            await asyncio.sleep(0.05)

    # Regresión: /import debe leer el SessionHeader (parentSession) y
    # resolverlo contra el mapa chat_id→sessionPath ya existente, para
    # que el chat importado aparezca con linaje sin trabajo manual.
    padre_path = "/media/almacen/deml/Downloads/core_instruction/aurora/databases/pi-sessions/padre-de-prueba.jsonl"
    mapa = B._cargar_mapa()
    mapa["777"] = padre_path
    B._guardar_mapa(mapa)

    jsonl_importado = pathlib.Path(tempfile.mkdtemp()) / "hijo.jsonl"
    jsonl_importado.write_text(
        json.dumps({"type": "session", "version": 3, "id": "x", "timestamp": "now",
                    "cwd": "/tmp", "parentSession": padre_path}) + "\n"
        + json.dumps({"type": "message", "id": "a", "parentId": None, "timestamp": "now",
                       "message": {"role": "user", "content": "hola desde pi cli"}}) + "\n"
    )

    # Cancelar la confirmación no debe importar nada.
    sock.enviados.clear()
    await asyncio.gather(
        br.manejar_chat({"type": "chat", "message": f"/import {jsonl_importado}", "chat_id": None, "system": ""}),
        cancelar_pronto(),
    )
    resultados = [m for m in sock.enviados if m["type"] == "command_result"]
    assert resultados and "cancelada" in resultados[-1]["data"]["texto"], sock.enviados

    # Confirmar sí importa, y respeta comillas en la ruta (pi soporta
    # getPathCommandArgument con comillas — Aurora partía la ruta en el
    # primer espacio y las dejaba pegadas al string).
    sock.enviados.clear()
    await asyncio.gather(
        br.manejar_chat({"type": "chat", "message": f'/import "{jsonl_importado}"', "chat_id": None, "system": ""}),
        confirmar_pronto(),
    )
    resultados = [m for m in sock.enviados if m["type"] == "command_result"]
    r = resultados[-1]
    assert r["data"]["parentChatId"] == 777, r
    assert "importada" in r["data"]["texto"], r

    r = await comando("/share")
    assert "gh" in r["data"]["texto"], r  # gh no instalado en este entorno → mensaje de instalación

    # Regresión: /reload mata y reinicia el motor pi COMPARTIDO (mismo radio
    # de impacto que /quit) pero no pedía confirmación — inconsistente.
    # Cancelar no debe tocar el proceso.
    sock.enviados.clear()
    await asyncio.gather(
        br.manejar_chat({"type": "chat", "message": "/reload", "chat_id": None, "system": ""}),
        cancelar_pronto(),
    )
    resultados = [m for m in sock.enviados if m["type"] == "command_result"]
    assert resultados and resultados[-1]["data"]["texto"] == "Cancelado.", sock.enviados
    assert proceso.vivo

    sock.enviados.clear()
    await asyncio.gather(
        br.manejar_chat({"type": "chat", "message": "/reload", "chat_id": None, "system": ""}),
        confirmar_pronto(),
    )
    resultados = [m for m in sock.enviados if m["type"] == "command_result"]
    assert resultados and "recargad" in resultados[-1]["data"]["texto"], sock.enviados
    assert proceso.vivo  # se reinició, pero sigue vivo (nuevo subproceso)

    # /quit pide confirmación propia (no de pi) — se confirma en paralelo
    # (confirmar_pronto ya definida arriba, para /import)
    sock.enviados.clear()
    await asyncio.gather(
        br.manejar_chat({"type": "chat", "message": "/quit", "chat_id": None, "system": ""}),
        confirmar_pronto(),
    )
    resultados = [m for m in sock.enviados if m["type"] == "command_result"]
    assert resultados and "Motor detenido" in resultados[-1]["data"]["texto"], sock.enviados
    assert not proceso.vivo

    # Regresión: cycle_model debe sincronizar _modelo_fijado — si no, el
    # próximo chat con el mismo model_id de antes no vuelve a fijar el modelo
    # real (bug encontrado al verificar Alt+M contra pi real).
    B._modelo_fijado = 'llamacpp'
    await br.manejar_cycle_model()
    assert B._modelo_fijado == 'otro-modelo', B._modelo_fijado
    cycled = [m for m in sock.enviados if m["type"] == "model_cycled"]
    assert cycled and cycled[-1]["model"]["id"] == "otro-modelo", cycled

    # Regresión: la indentación de /tree sólo debe avanzar en un branch real
    # (nodo con >1 hijo) — replica flattenTree() de tree-selector.js. Árbol:
    # root(user) -> A(assistant, sin rama) -> [B1(user), B2(user)] (branch)
    # -> B1 sigue con C1(assistant) single-chain.
    arbol_con_rama = [{
        "entry": {"id": "root", "type": "message", "message": {"role": "user", "content": "hola"}},
        "children": [{
            "entry": {"id": "A", "type": "message", "message": {"role": "assistant", "content": "hola de vuelta"}},
            "children": [
                {"entry": {"id": "B1", "type": "message", "message": {"role": "user", "content": "rama uno"}},
                 "children": [{
                     "entry": {"id": "C1", "type": "message", "message": {"role": "assistant", "content": "sigo en rama uno"}},
                     "children": [],
                 }]},
                {"entry": {"id": "B2", "type": "message", "message": {"role": "user", "content": "rama dos"}},
                 "children": []},
            ],
        }],
    }]
    nodos_rama = B._arbol_a_nodos(arbol_con_rama, "C1")
    por_id = {n["id"]: n for n in nodos_rama}
    assert por_id["root"]["profundidad"] == 0, por_id
    assert por_id["A"]["profundidad"] == 0, por_id  # single-chain: sin rama, se queda flat
    assert por_id["B1"]["profundidad"] == 1, por_id  # branch real: +1
    assert por_id["B2"]["profundidad"] == 1, por_id
    assert por_id["C1"]["profundidad"] == 2, por_id  # 1ra gen después del branch: +1 extra (como pi)
    assert por_id["C1"]["actual"], por_id

    # /quit reinició el proceso vía get_proceso() con auto-restart — pararlo.
    if B._proceso is not None and B._proceso.vivo:
        await B._proceso.parar()

    print("OK — todos los asserts pasaron")


asyncio.run(main())
