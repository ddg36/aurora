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

    async def texto_comando(comando: str, chat_id=None) -> str:
        sock.enviados.clear()
        await br.manejar_chat({"type": "chat", "message": comando, "chat_id": chat_id, "system": ""})
        return "".join(m["content"] for m in sock.enviados if m["type"] == "token")

    r = await texto_comando("/settings")
    assert "medium" in r, r

    r = await texto_comando("/settings high")
    assert "Thinking: high" in r, r

    r = await texto_comando("/tree")
    assert "hola" in r and "●" in r, r

    r = await texto_comando("/copy")
    assert "ULTIMO_MENSAJE_DE_PRUEBA" in r, r

    r = await texto_comando("/fork e1")
    assert "Ramificado" in r, r

    r = await texto_comando("/clone")
    assert "duplicada" in r, r

    r = await texto_comando("/trust")
    assert "confianza" in r, r

    r = await texto_comando("/resume")
    assert "historial" in r, r

    r = await texto_comando("/hotkeys")
    assert "Enter" in r, r

    r = await texto_comando("/changelog")
    assert "Lyra" in r, r

    r = await texto_comando("/scoped-models add llamacpp")
    assert "Agregado" in r, r
    r = await texto_comando("/scoped-models")
    assert "llamacpp" in r, r
    r = await texto_comando("/scoped-models remove llamacpp")
    assert "Sacado" in r, r

    r = await texto_comando("/login nvidia clave-de-test-123")
    assert "guardada" in r, r
    auth = json.loads(B._RUTA_AUTH.read_text())
    assert auth["nvidia"] == {"type": "api_key", "key": "clave-de-test-123"}, auth

    r = await texto_comando("/logout nvidia")
    assert "borrada" in r, r
    assert "nvidia" not in json.loads(B._RUTA_AUTH.read_text())

    r = await texto_comando("/import /ruta/que/no/existe.jsonl")
    assert "No existe" in r, r

    r = await texto_comando("/share")
    assert "gh" in r, r  # gh no instalado en este entorno de test → mensaje de instalación

    # /quit pide confirmación propia (no de pi) — se confirma en paralelo
    async def confirmar_pronto():
        for _ in range(50):
            if br._builtin_confirm is not None:
                await br.responder_confirm(True)
                return
            await asyncio.sleep(0.05)
    sock.enviados.clear()
    await asyncio.gather(
        br.manejar_chat({"type": "chat", "message": "/quit", "chat_id": None, "system": ""}),
        confirmar_pronto(),
    )
    r = "".join(m["content"] for m in sock.enviados if m["type"] == "token")
    assert "Motor detenido" in r, r
    assert not proceso.vivo

    # Regresión: cycle_model debe sincronizar _modelo_fijado — si no, el
    # próximo chat con el mismo model_id de antes no vuelve a fijar el modelo
    # real (bug encontrado al verificar Alt+M contra pi real).
    B._modelo_fijado = 'llamacpp'
    await br.manejar_cycle_model()
    assert B._modelo_fijado == 'otro-modelo', B._modelo_fijado
    cycled = [m for m in sock.enviados if m["type"] == "model_cycled"]
    assert cycled and cycled[-1]["model"]["id"] == "otro-modelo", cycled

    # /quit reinició el proceso vía get_proceso() con auto-restart — pararlo.
    if B._proceso is not None and B._proceso.vivo:
        await B._proceso.parar()

    print("OK — todos los asserts pasaron")


asyncio.run(main())
