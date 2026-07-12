from litestar import Controller, get
from litestar.connection import Request

from ..connection import get_db, _tiene_tabla
from ..auth import auth_guard

TIPOS_VALIDOS = {"mensaje", "prompt", "wiki"}


def _query_fts(q: str) -> str:
    """Convierte texto libre en query FTS5 segura: cada término entre comillas
    (sin sintaxis inyectable), el último con * para búsqueda as-you-type."""
    terminos = [t.replace('"', '""') for t in q.split() if t]
    if not terminos:
        return ""
    partes = [f'"{t}"' for t in terminos[:-1]] + [f'"{terminos[-1]}"*']
    return " ".join(partes)


class SearchController(Controller):
    path = "/db/search"
    guards = [auth_guard]

    @get("")
    async def buscar(self, request: Request, q: str = "", tipos: str = "", limit: int = 30) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        if not await _tiene_tabla(db, "search_fts"):
            return {"ok": False, "error": "Búsqueda no disponible (FTS5 sin inicializar)"}

        fts_q = _query_fts(q)
        if not fts_q:
            return {"ok": True, "q": q, "resultados": []}

        filtro_tipos = [t for t in tipos.split(",") if t in TIPOS_VALIDOS]
        sql = """
            SELECT tipo, ref_id,
                   snippet(search_fts, 0, '<mark>', '</mark>', '…', 16) AS fragmento,
                   bm25(search_fts) AS score
            FROM search_fts
            WHERE search_fts MATCH ? AND usuario_id = ?
        """
        params: list = [fts_q, uid]
        if filtro_tipos:
            sql += f" AND tipo IN ({','.join('?' * len(filtro_tipos))})"
            params += filtro_tipos
        sql += " ORDER BY score LIMIT ?"
        params.append(max(1, min(int(limit), 100)))

        try:
            async with db.execute(sql, params) as cur:
                filas = [dict(r) for r in await cur.fetchall()]
        except Exception as e:
            return {"ok": False, "error": f"query inválida: {e}"}

        # Contexto extra por tipo para que la UI pueda navegar al resultado.
        # Se resuelve en 3 queries (una por tipo) en vez de N+1 (una por fila):
        # se juntan los ref_id de cada tipo y se traen todos de una.
        por_tipo: dict[str, list[int]] = {}
        for f in filas:
            por_tipo.setdefault(f["tipo"], []).append(f["ref_id"])

        async def _mapa(sql_tmpl: str, ids: list[int]) -> dict[int, dict]:
            if not ids:
                return {}
            marcadores = ",".join("?" * len(ids))
            async with db.execute(sql_tmpl.format(marcadores=marcadores), ids) as cur:
                return {r["id"]: dict(r) for r in await cur.fetchall()}

        msgs = await _mapa(
            "SELECT m.id, m.chat_id, c.nombre FROM mensajes m JOIN chats c ON c.id=m.chat_id WHERE m.id IN ({marcadores})",
            por_tipo.get("mensaje", []),
        )
        prompts = await _mapa("SELECT id, nombre FROM prompts WHERE id IN ({marcadores})", por_tipo.get("prompt", []))
        wikis = await _mapa("SELECT id, path, titulo FROM wiki_indice WHERE id IN ({marcadores})", por_tipo.get("wiki", []))

        for f in filas:
            if f["tipo"] == "mensaje" and (row := msgs.get(f["ref_id"])):
                f["chat_id"], f["titulo"] = row["chat_id"], row["nombre"]
            elif f["tipo"] == "prompt" and (row := prompts.get(f["ref_id"])):
                f["titulo"] = row["nombre"]
            elif f["tipo"] == "wiki" and (row := wikis.get(f["ref_id"])):
                f["path"], f["titulo"] = row["path"], row["titulo"]

        return {"ok": True, "q": q, "resultados": filas}
