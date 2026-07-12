# ══════════════════════════════════════════════════════
#  EVENTOS WS — bus Observer del server.
#  Un WS /eventos por tab; registro de sockets por usuario
#  en memoria (proceso único, sin pub/sub externo).
#  Los routes que escriben en DB llaman emitir() tras commit
#  y todas las tabs del usuario reciben el evento.
# ══════════════════════════════════════════════════════

import logging
import time

from litestar import websocket
from litestar.connection import WebSocket

log = logging.getLogger("aurora.eventos")

_sockets: dict[int, set[WebSocket]] = {}


@websocket("/eventos")
async def eventos_ws(socket: WebSocket) -> None:
    # El guard global ya validó el token (?token=) y dejó usuario_id en state.
    await socket.accept()
    uid = socket.state.usuario_id
    _sockets.setdefault(uid, set()).add(socket)
    log.debug("eventos: tab conectada (usuario %d, %d tabs)", uid, len(_sockets[uid]))
    try:
        while True:
            # El bus es unidireccional server→cliente; lo recibido se ignora.
            # El await sale con excepción cuando la tab se desconecta.
            await socket.receive_text()
    except Exception:
        pass
    finally:
        conj = _sockets.get(uid)
        if conj:
            conj.discard(socket)
            if not conj:
                _sockets.pop(uid, None)


async def emitir(usuario_id: int, tipo: str, datos: dict | None = None) -> None:
    """Broadcast a todas las tabs del usuario. Nunca propaga errores al
    caller: un socket muerto no puede romper el request HTTP que emitió."""
    conj = _sockets.get(usuario_id)
    if not conj:
        return
    evento = {"tipo": tipo, "datos": datos or {}, "ts": int(time.time())}
    muertos = []
    for s in list(conj):
        try:
            await s.send_json(evento)
        except Exception:
            muertos.append(s)
    for s in muertos:
        conj.discard(s)
    if not conj:
        _sockets.pop(usuario_id, None)


EVENTOS_WS_ROUTES = [eventos_ws]
