"""Regresión: errores del proveedor (nvidia 410, connection error) llegaban
en silencio total — el chat quedaba "sin responder" sin ningún mensaje de
error visible. Encontrado en vivo probando nvidia z-ai/glm-5.1 (HTTP 410) y
con llama-server caído (connection refused, con reintento automático de pi).

Dos bugs distintos:
1. message_end leía 'role'/'stopReason' de evt de primer nivel en vez de
   evt['message'] (donde realmente viven) — stop_reason siempre None,
   el error del proveedor nunca se detectaba.
2. Aun leyendo bien el campo, mandar el error apenas llega message_end corta
   el turno prematuro durante un reintento automático de pi (agent_end trae
   willRetry=true, va a reintentar 2 veces más con backoff) — el frontend
   veía "error" y dejaba de esperar, aunque pi seguía trabajando de fondo.

Fix: message_end sólo guarda el error en self._error_pendiente. agent_end
decide: si willRetry es true, descarta el pendiente y NO cierra el turno
(ni fin.set() ni 'done'); si es false/ausente, manda el error pendiente (si
hay) y recién ahí cierra el turno normalmente.

Correr: .venv-linux/bin/python3 tests/pi/test_error_proveedor_retry.py
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


def _message_end_error(mensaje="410 status code (no body)"):
    return {
        "type": "message_end",
        "message": {"role": "assistant", "stopReason": "error", "errorMessage": mensaje},
    }


async def main():
    # ── Caso 1: error final (sin reintento) — debe surgir como 'error' y cerrar el turno ──
    sock = FakeSocket()
    br = B.PiBridge(sock)

    await br.evento_pi(_message_end_error("410 status code (no body)"))
    tipos = [m["type"] for m in sock.enviados]
    assert tipos == ["message_end"], tipos  # todavía no se manda el error, sólo se buffer

    await br.evento_pi({"type": "agent_end", "messages": []})  # sin willRetry → final
    errores = [m for m in sock.enviados if m["type"] == "error"]
    assert errores and errores[-1]["message"] == "410 status code (no body)", sock.enviados
    assert br.fin.is_set(), "agent_end final debe cerrar el turno (fin.set())"
    assert any(m["type"] == "done" for m in sock.enviados), sock.enviados

    # ── Caso 2: reintento en curso (willRetry=true) — NO debe cerrar el turno ni mandar error ──
    sock2 = FakeSocket()
    br2 = B.PiBridge(sock2)

    await br2.evento_pi(_message_end_error("Connection error."))
    await br2.evento_pi({"type": "agent_end", "willRetry": True, "messages": []})

    assert not br2.fin.is_set(), (
        "BUG: agent_end con willRetry=true cerró el turno — con llama-server "
        "caído esto cortaba el chat en el primer intento fallido mientras pi "
        "seguía reintentando 2 veces más de fondo."
    )
    assert not any(m["type"] in ("error", "done") for m in sock2.enviados), sock2.enviados
    assert br2._error_pendiente is None, "el error del intento fallido no debe sobrevivir al reintento"

    # Ahora sí llega el intento final (sin willRetry) con su propio error —
    # el turno recién ahí se cierra y el error correcto se manda.
    await br2.evento_pi(_message_end_error("Connection error."))
    await br2.evento_pi({"type": "agent_end", "messages": []})
    errores2 = [m for m in sock2.enviados if m["type"] == "error"]
    assert errores2 and errores2[-1]["message"] == "Connection error.", sock2.enviados
    assert br2.fin.is_set()

    # ── Caso 3: auto_retry_start visible al usuario (antes: silencio total) ──
    sock3 = FakeSocket()
    br3 = B.PiBridge(sock3)
    await br3.evento_pi({"type": "auto_retry_start", "attempt": 1, "maxAttempts": 3})
    tokens = [m["content"] for m in sock3.enviados if m["type"] == "token"]
    assert tokens and "1/3" in tokens[-1], sock3.enviados

    print("OK — error de proveedor se buffer-ea y respeta willRetry antes de cerrar el turno")


asyncio.run(main())
