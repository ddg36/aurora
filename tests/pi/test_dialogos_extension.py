"""Regresión: select/input/editor de una extensión se cancelaban solos con
sólo un log.info del lado del servidor — invisible en la UI. Cualquier
skill/extensión que pidiera elegir una opción o tipear algo fallaba en
silencio total, mismo patrón "puro teatro" ya encontrado en otros lados
esta sesión. rpc-types.d.ts: RpcExtensionUIRequest method "select" trae
options:string[], "input" trae placeholder, "editor" trae prefill — los 3
responden con {type:'extension_ui_response', id, value:string} o
{cancelled:true}.

Correr: .venv-linux/bin/python3 tests/pi/test_dialogos_extension.py
"""

import asyncio
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src"))

from pi import bridge as B


class FakeSocket:
    def __init__(self):
        self.enviados = []

    async def send_text(self, texto):
        self.enviados.append(json.loads(texto))


class FakeProcesoEnviados:
    """Espía de get_proceso().enviar() — no hace falta un pi real para esto,
    _ui_request sólo necesita que 'enviar' no explote."""
    def __init__(self):
        self.enviados = []

    async def enviar(self, cmd):
        self.enviados.append(cmd)


async def main():
    fake_proceso = FakeProcesoEnviados()
    B._proceso = fake_proceso

    # ── select: elegir una opción ──
    sock = FakeSocket()
    br = B.PiBridge(sock)
    tarea = asyncio.create_task(br.evento_pi({
        "type": "extension_ui_request", "id": "d1", "method": "select",
        "title": "Elegí un color", "options": ["rojo", "verde", "azul"],
    }))
    await asyncio.sleep(0.05)  # deja que evento_pi mande el dialog_request y quede esperando
    peticion = [m for m in sock.enviados if m["type"] == "dialog_request"][-1]
    assert peticion["method"] == "select" and peticion["options"] == ["rojo", "verde", "azul"], peticion

    await br.responder_dialogo("verde")
    await tarea
    resp = fake_proceso.enviados[-1]
    assert resp == {"type": "extension_ui_response", "id": "d1", "value": "verde"}, resp

    # ── input: cancelado (antes esto YA funcionaba por accidente porque
    # todo se cancelaba — ahora se verifica que cancelar explícito siga
    # dando cancelled:true, no un value vacío) ──
    sock2 = FakeSocket()
    br2 = B.PiBridge(sock2)
    tarea2 = asyncio.create_task(br2.evento_pi({
        "type": "extension_ui_request", "id": "d2", "method": "input",
        "title": "Nombre del branch", "placeholder": "feature/...",
    }))
    await asyncio.sleep(0.05)
    peticion2 = [m for m in sock2.enviados if m["type"] == "dialog_request"][-1]
    assert peticion2["method"] == "input" and peticion2["placeholder"] == "feature/...", peticion2

    await br2.responder_dialogo(None)
    await tarea2
    resp2 = fake_proceso.enviados[-1]
    assert resp2 == {"type": "extension_ui_response", "id": "d2", "cancelled": True}, resp2

    # ── editor: texto libre confirmado ──
    sock3 = FakeSocket()
    br3 = B.PiBridge(sock3)
    tarea3 = asyncio.create_task(br3.evento_pi({
        "type": "extension_ui_request", "id": "d3", "method": "editor",
        "title": "Editar resumen", "prefill": "texto inicial",
    }))
    await asyncio.sleep(0.05)
    peticion3 = [m for m in sock3.enviados if m["type"] == "dialog_request"][-1]
    assert peticion3["prefill"] == "texto inicial", peticion3

    await br3.responder_dialogo("texto editado")
    await tarea3
    resp3 = fake_proceso.enviados[-1]
    assert resp3 == {"type": "extension_ui_response", "id": "d3", "value": "texto editado"}, resp3

    # ── timeout: si nadie responde, cancela sola (no se cuelga para siempre) ──
    sock4 = FakeSocket()
    br4 = B.PiBridge(sock4)
    await br4.evento_pi({
        "type": "extension_ui_request", "id": "d4", "method": "select",
        "title": "¿?", "options": ["a", "b"], "timeout": 0.1,
    })
    resp4 = fake_proceso.enviados[-1]
    assert resp4 == {"type": "extension_ui_response", "id": "d4", "cancelled": True}, resp4

    print("OK — select/input/editor responden de verdad, ya no se cancelan solos en silencio")


asyncio.run(main())
