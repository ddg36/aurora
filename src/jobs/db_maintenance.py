"""Mantenimiento de DB en arranque: checkpoint WAL + PRAGMA optimize.

El WAL crece sin límite si nadie lo trunca (la DB llegó a 16 MB con pocos
datos). Ambas operaciones son baratas — corren en cada startup, sin estado.
"""

import logging

from db.connection import DB_PATH, get_db

log = logging.getLogger("aurora.jobs.db")


async def run_mantenimiento() -> dict:
    db = await get_db()
    antes = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    await db.execute("PRAGMA optimize")
    await db.commit()
    despues = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    log.info("mantenimiento DB: %d → %d bytes", antes, despues)
    return {"antes": antes, "despues": despues}


async def run_mantenimiento_profundo() -> dict:
    """VACUUM + ANALYZE: reescribe la DB compactando páginas libres y actualiza
    las estadísticas del planificador de queries. Más caro que el de arranque
    (bloquea la DB, reescribe el archivo) — no va en cada startup, se dispara a
    mano (endpoint /db/jobs/db-vacuum) o en un job periódico."""
    db = await get_db()
    antes = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    # VACUUM no puede correr dentro de una transacción; el commit previo la cierra.
    await db.commit()
    await db.execute("VACUUM")
    await db.execute("ANALYZE")
    await db.commit()
    despues = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    log.info("mantenimiento profundo (VACUUM+ANALYZE): %d → %d bytes", antes, despues)
    return {"antes": antes, "despues": despues, "recuperado": antes - despues}
