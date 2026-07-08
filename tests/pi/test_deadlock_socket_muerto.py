"""Regresión: si el WebSocket ya murió (reload de página, tab cerrada, red
cortada) justo cuando llega 'agent_end' de pi, self.fin.set() debe correr
IGUAL — si no, _lock_streaming (GLOBAL, compartido por TODO el server)
puede quedar tomado hasta que alguien cancele esa task a mano, y mientras
tanto NINGÚN chat de NINGÚN usuario puede volver a andar.

Root cause real, encontrado en vivo: pi idle (0% CPU, sin red, sin hijos)
pero _lock_streaming seguía tomado 11+ minutos después.

Correr: .venv-linux/bin/python3 tests/pi/test_deadlock_socket_muerto.py
"""

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src"))

from pi import bridge as B


class SocketMuerto:
    """WebSocket ya cerrado: cualquier send_text falla, como Litestar real."""

    async def send_text(self, texto):
        raise RuntimeError('WebSocket is not connected. Need to call "accept" first.')


async def main():
    br = B.PiBridge(SocketMuerto())

    # 'agent_end' es lo único que setea self.fin — y hoy lo hace DESPUÉS
    # de un send() que puede tirar. Si tira, fin.set() no debería depender
    # de que el send() haya funcionado.
    await br.evento_pi({'type': 'agent_end', 'messages': []})

    assert br.fin.is_set(), (
        "BUG: self.fin nunca se seteó porque self.send('done') tiró excepción "
        "(socket muerto) — manejar_chat quedaría esperando fin.wait() para "
        "siempre, con _lock_streaming (GLOBAL) tomado, rompiendo TODO el server."
    )
    print("OK — self.fin se setea aunque el send() al socket muerto falle")


asyncio.run(main())
