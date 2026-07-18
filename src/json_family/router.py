"""Endpoints HTTP de JSON Family. El relay sólo transporta texto y resultado."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json

from litestar import post
from litestar.connection import Request

from db.connection import get_db

from .parser import parse_final
from .service import delivery_for, process


SETTING = "json_family_enabled_v1"
_lock = asyncio.Lock()
_tasks: dict[tuple[int, str], asyncio.Task] = {}


def _compact_response(response: dict) -> dict:
    """No guardar la misma imagen tres veces en SQLite."""
    stored = copy.deepcopy(response)
    stored.pop("delivery", None)
    for entry in stored.get("entries") or []:
        result = entry.get("result") if isinstance(entry, dict) else None
        if isinstance(result, dict) and result.get("is_image"):
            result.pop("image", None)  # se reconstruye desde content[]
    return stored


def _restore_response(response: dict) -> dict:
    restored = copy.deepcopy(response)
    for entry in restored.get("entries") or []:
        result = entry.get("result") if isinstance(entry, dict) else None
        if not isinstance(result, dict) or result.get("image"):
            continue
        for item in result.get("content") or []:
            if isinstance(item, dict) and item.get("type") == "image" and item.get("data"):
                mime = str(item.get("mimeType") or item.get("mime_type") or "image/png")
                result["is_image"] = True
                result["image"] = f"data:{mime};base64,{item['data']}"
                break
    if restored.get("feedback"):
        restored["delivery"] = delivery_for(restored.get("entries") or [], restored["feedback"])
    return restored


async def _enabled(user_id: int) -> bool:
    db = await get_db()
    async with db.execute(
        "SELECT valor FROM ajustes WHERE usuario_id=? AND clave=?", (user_id, SETTING),
    ) as cursor:
        row = await cursor.fetchone()
    return bool(row and str(row["valor"]).lower() == "true")


@post("/json-family/process")
async def json_family_process(data: dict, request: Request) -> dict:
    user_id = int(request.state.usuario_id)
    request_id = str(data.get("requestId") or "").strip()
    if not request_id:
        return {"ok": False, "kind": "invalid_request", "error": "requestId requerido"}
    if not await _enabled(user_id):
        return {"ok": True, "kind": "disabled", "requestId": request_id, "entries": []}
    origin = data.get("origin") if isinstance(data.get("origin"), dict) else {}
    # panel_send necesita el estado efímero de los dos iframes de Duo. JSON
    # Family lo valida/captura, pero lo devuelve a ese cliente para el handoff.
    requested_client_tools = data.get("clientTools") if isinstance(data.get("clientTools"), list) else []
    client_tools = {name for name in requested_client_tools if name == "panel_send"}
    text = str(data.get("text") or "")
    preliminary = parse_final(text)
    if not preliminary.detected:
        # El relay remite cada respuesta estable. Las conversaciones normales
        # no necesitan idempotencia y no deben hacer crecer el journal.
        return {
            "ok": True, "kind": "not_tool", "requestId": request_id,
            "origin": origin, "parsed": preliminary.public(), "entries": [],
        }
    canonical = json.dumps(
        {"text": text, "origin": origin, "clientTools": sorted(client_tools)},
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    )
    input_hash = hashlib.sha256(canonical.encode()).hexdigest()
    key = (user_id, request_id)

    async with _lock:
        db = await get_db()
        async with db.execute(
            "SELECT input_hash, status, response_json, delivered_at FROM json_family_runs WHERE usuario_id=? AND request_id=?",
            key,
        ) as cursor:
            row = await cursor.fetchone()
        if row:
            if row["input_hash"] != input_hash:
                return {"ok": False, "kind": "conflict", "error": "requestId reutilizado con otra captura."}
            if row["status"] == "completed" and row["response_json"]:
                response = _restore_response(json.loads(row["response_json"]))
                return {**response, "replayed": True, "deliveryAcknowledged": bool(row["delivered_at"])}
            if row["status"] == "failed" and row["response_json"]:
                response = _restore_response(json.loads(row["response_json"]))
                return {**response, "replayed": True, "deliveryAcknowledged": bool(row["delivered_at"])}
            if row["status"] == "unknown":
                message = (
                    "Estado incierto: Aurora se reinició durante esta solicitud y no repetirá la tool "
                    "automáticamente para evitar duplicar efectos. Verificá el estado real."
                )
                return {
                    "ok": True, "kind": "tool_error", "requestId": request_id,
                    "origin": origin, "entries": [{"kind": "parse_error", "error": message}],
                    "feedback": f"Tool request error: {message}", "replayed": True,
                }
            task = _tasks.get(key)
        else:
            await db.execute(
                "INSERT INTO json_family_runs(usuario_id, request_id, input_hash, status) VALUES (?,?,?,'running')",
                (user_id, request_id, input_hash),
            )
            await db.commit()
            task = asyncio.create_task(
                _run_and_store(user_id, request_id, text, origin, client_tools),
                name=f"json-family:{request_id}",
            )
            _tasks[key] = task

    if task is None:
        return {"ok": False, "kind": "unknown", "error": "Solicitud activa sin Task asociada."}
    return await asyncio.shield(task)


async def _run_and_store(
    user_id: int, request_id: str, text: str, origin: dict, client_tools: set[str],
) -> dict:
    key = (user_id, request_id)
    try:
        response = await process(
            text, request_id=request_id, origin=origin,
            user_id=user_id, client_tools=client_tools,
        )
        db = await get_db()
        async with _lock:
            await db.execute(
                """UPDATE json_family_runs SET status='completed', response_json=?,
                   updated_at=unixepoch(), completed_at=unixepoch()
                   WHERE usuario_id=? AND request_id=?""",
                (json.dumps(_compact_response(response), ensure_ascii=False), user_id, request_id),
            )
            await db.commit()
        return response
    except Exception as exc:
        response = {"ok": False, "kind": "internal_error", "requestId": request_id, "error": str(exc)}
        db = await get_db()
        async with _lock:
            await db.execute(
                """UPDATE json_family_runs SET status='failed', response_json=?,
                   updated_at=unixepoch(), completed_at=unixepoch()
                   WHERE usuario_id=? AND request_id=?""",
                (json.dumps(response, ensure_ascii=False), user_id, request_id),
            )
            await db.commit()
        return response
    finally:
        async with _lock:
            _tasks.pop(key, None)


@post("/json-family/delivered")
async def json_family_delivered(data: dict, request: Request) -> dict:
    user_id = int(request.state.usuario_id)
    request_id = str(data.get("requestId") or "").strip()
    if not request_id:
        return {"ok": False, "error": "requestId requerido"}
    db = await get_db()
    async with _lock:
        cursor = await db.execute(
            """UPDATE json_family_runs SET delivered_at=COALESCE(delivered_at, unixepoch()),
               updated_at=unixepoch() WHERE usuario_id=? AND request_id=? AND status='completed'""",
            (user_id, request_id),
        )
        await db.commit()
    return {"ok": cursor.rowcount == 1, "requestId": request_id, "acknowledged": cursor.rowcount == 1}


JSON_FAMILY_ROUTES = [json_family_process, json_family_delivered]
