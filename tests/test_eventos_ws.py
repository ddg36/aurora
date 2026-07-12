"""Test del bus /eventos: registro por usuario, broadcast, poda de sockets muertos.

Correr: .venv-linux/bin/python3 tests/test_eventos_ws.py
"""

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

import eventos_ws
from eventos_ws import emitir


class FakeSocket:
    def __init__(self, roto=False):
        self.roto = roto
        self.recibidos = []

    async def send_json(self, evento):
        if self.roto:
            raise ConnectionError("socket muerto")
        self.recibidos.append(evento)


async def main():
    a, b = FakeSocket(), FakeSocket()
    otro = FakeSocket()
    eventos_ws._sockets = {1: {a, b}, 2: {otro}}

    # broadcast: las dos tabs del usuario 1 reciben, el usuario 2 no
    await emitir(1, "ajuste", {"clave": "theme", "valor": "dark"})
    assert len(a.recibidos) == 1 and len(b.recibidos) == 1
    assert a.recibidos[0]["tipo"] == "ajuste"
    assert a.recibidos[0]["datos"] == {"clave": "theme", "valor": "dark"}
    assert "ts" in a.recibidos[0]
    assert otro.recibidos == []

    # usuario sin tabs: no revienta
    await emitir(99, "ajuste", {"clave": "x"})

    # socket muerto: se poda sin propagar error, el vivo sigue recibiendo
    muerto = FakeSocket(roto=True)
    eventos_ws._sockets = {1: {a, muerto}}
    await emitir(1, "ajuste", None)
    assert muerto not in eventos_ws._sockets[1]
    assert len(a.recibidos) == 2

    # última tab muerta: el usuario desaparece del registro
    eventos_ws._sockets = {1: {FakeSocket(roto=True)}}
    await emitir(1, "ajuste", None)
    assert 1 not in eventos_ws._sockets

    print("OK — bus eventos: broadcast, aislamiento por usuario, poda de muertos")


asyncio.run(main())
