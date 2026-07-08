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

    await proceso.parar()
    print("OK — todos los asserts pasaron")


asyncio.run(main())
