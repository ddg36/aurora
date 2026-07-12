"""Trazabilidad de nexus: cada operación mutante queda en la tabla eventos
(origen='nexus') — visible en el centro de notificaciones y consultable."""

import json
import logging

from db.connection import get_db

log = logging.getLogger('aurora.nexus.audit')


async def registrar(request, accion: str, detalle: dict) -> None:
    try:
        uid = getattr(request.state, 'usuario_id', None)
        if uid is None:
            return
        db = await get_db()
        await db.execute(
            "INSERT INTO eventos (usuario_id, tipo, mensaje, origen, meta) VALUES (?,?,?,?,?)",
            (uid, 'nexus', accion, 'nexus', json.dumps(detalle, ensure_ascii=False)[:2000]),
        )
        await db.commit()
    except Exception as e:
        log.warning('audit %s no registrado: %s', accion, e)
