"""
Job de limpieza de ext_capturas.

Defaults hardcoded; override por usuario via ajustes clave "cleanup_capturas_config" (JSON).

Lógica (en orden):
  1. Borrar capturas con edad > max_dias
  2. Si quedan > max_capturas por usuario, borrar más viejas hasta bajar al límite
  3. Borrar capturas con chars > max_chars_old y edad > dias_para_purge_grande
"""

import asyncio
import json
import logging
import time

log = logging.getLogger("aurora.jobs.cleanup_capturas")

DEFAULTS = {
    "max_dias":               30,
    "max_capturas":           500,
    "max_chars_old":          100_000,
    "dias_para_purge_grande": 7,
}


async def _config_usuario(db, usuario_id: int) -> dict:
    async with db.execute(
        "SELECT valor FROM ajustes WHERE usuario_id=? AND clave='cleanup_capturas_config'",
        (usuario_id,),
    ) as cur:
        row = await cur.fetchone()
    if not row or not row["valor"]:
        return DEFAULTS
    try:
        override = json.loads(row["valor"])
        return {**DEFAULTS, **override}
    except Exception:
        return DEFAULTS


async def _usuarios_con_capturas(db) -> list[int]:
    async with db.execute(
        "SELECT DISTINCT usuario_id FROM ext_capturas"
    ) as cur:
        rows = await cur.fetchall()
    return [r["usuario_id"] for r in rows]


async def cleanup_usuario(db, usuario_id: int) -> dict:
    cfg = await _config_usuario(db, usuario_id)
    ahora = int(time.time())
    stats = {"usuario_id": usuario_id, "paso1": 0, "paso2": 0, "paso3": 0}

    # Paso 1: antigüedad
    limite_dias = ahora - cfg["max_dias"] * 86400
    cur = await db.execute(
        "DELETE FROM ext_capturas WHERE usuario_id=? AND capturado_en < ?",
        (usuario_id, limite_dias),
    )
    stats["paso1"] = cur.rowcount

    # Paso 2: volumen — mantener solo las N más recientes
    async with db.execute(
        "SELECT COUNT(*) as n FROM ext_capturas WHERE usuario_id=?", (usuario_id,)
    ) as cur:
        total = (await cur.fetchone())["n"]

    if total > cfg["max_capturas"]:
        exceso = total - cfg["max_capturas"]
        cur = await db.execute(
            """DELETE FROM ext_capturas WHERE id IN (
               SELECT id FROM ext_capturas WHERE usuario_id=?
               ORDER BY capturado_en ASC LIMIT ?
            )""",
            (usuario_id, exceso),
        )
        stats["paso2"] = cur.rowcount

    # Paso 3: capturas grandes y relativamente viejas
    limite_grande = ahora - cfg["dias_para_purge_grande"] * 86400
    cur = await db.execute(
        """DELETE FROM ext_capturas
           WHERE usuario_id=? AND chars > ? AND capturado_en < ?""",
        (usuario_id, cfg["max_chars_old"], limite_grande),
    )
    stats["paso3"] = cur.rowcount

    await db.commit()
    total_borradas = stats["paso1"] + stats["paso2"] + stats["paso3"]
    log.info(
        "cleanup uid=%d borradas=%d (dias=%d vol=%d grandes=%d)",
        usuario_id, total_borradas, stats["paso1"], stats["paso2"], stats["paso3"],
    )
    return stats


async def run_cleanup(db=None) -> list[dict]:
    if db is None:
        from db.connection import get_db
        db = await get_db()

    usuarios = await _usuarios_con_capturas(db)
    resultados = []
    for uid in usuarios:
        try:
            s = await cleanup_usuario(db, uid)
            resultados.append(s)
        except Exception as e:
            log.error("cleanup error uid=%d: %s", uid, e)
    return resultados
