"""Orquestador Aurora: parsea JSON Family y ejecuta providers reales."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pi_tools import execute as execute_pi
from tools import forge
from tools.registry import run_tool

from .parser import parse_final


JSON_FAMILY_CONTINUATION = (
    "Continuá desde estos resultados reales. Si necesitás otra tool, emití el bloque final "
    "```json como un mensaje normal del chat, visible para el usuario y separado de cualquier thinking, progreso o estado; no lo escribas dentro del razonamiento interno. Recordá esta regla durante toda la conversación. Si terminaste, continuá respondiendo como mensaje normal sin emitir JSON."
)


PI_TOOLS = {"read", "bash", "edit", "write", "grep", "find", "ls"}
PARALLEL_SAFE = {"read", "grep", "find", "ls"}


def _call_id(request_id: str, index: int, call: dict[str, Any]) -> str:
    canonical = json.dumps(call, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(f"{request_id}:{index}:{canonical}".encode()).hexdigest()[:24]
    return f"json-family-{digest}"


async def _execute(call: dict[str, Any], *, request_id: str, index: int, user_id: int) -> dict:
    tool = call["tool"]
    args = call["args"]
    if tool in PI_TOOLS:
        return await execute_pi(tool, args, call_id=_call_id(request_id, index, call))
    if tool == "forge_submit":
        try:
            package = await forge.create_draft(args.get("manifest") or {}, str(args.get("code") or ""))
            return {"ok": True, "is_error": False, "output": "Borrador Forge creado.", "package": package}
        except Exception as exc:
            return {"ok": False, "is_error": True, "output": str(exc), "error": str(exc)}
    result = await run_tool(tool, args, {
        "kind": "internal", "source": "json-family", "usuario_id": user_id,
    })
    if "is_error" not in result:
        result["is_error"] = result.get("ok") is False
    if "output" not in result:
        result["output"] = result.get("error") or json.dumps(result, ensure_ascii=False, default=str)
    return result


def _result_text(result: dict) -> str:
    if result.get("output"):
        return str(result["output"])
    texts = [
        str(item.get("text") or "")
        for item in result.get("content") or []
        if isinstance(item, dict) and item.get("type") == "text"
    ]
    return "\n".join(filter(None, texts)) or str(result.get("error") or "(sin salida)")


def _feedback(entries: list[dict]) -> str:
    parts: list[str] = []
    for entry in entries:
        if entry["kind"] == "parse_error":
            parts.append(f"Tool request error: {entry['error']}")
            continue
        result = entry["result"]
        prefix = "[ERROR] " if result.get("is_error") or result.get("ok") is False else ""
        parts.append(f"Tool {entry['call']['tool']} result:\n{prefix}{_result_text(result)}")
    parts.append(JSON_FAMILY_CONTINUATION)
    return "\n\n".join(parts)


def delivery_for(entries: list[dict], feedback: str) -> dict:
    """Paquete neutral para el relay; no contiene detalles de DOM/provider."""
    images: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        if entry.get("kind") != "tool_result":
            continue
        result = entry.get("result") or {}
        candidates = []
        if result.get("image"):
            candidates.append(str(result["image"]))
        for item in result.get("content") or []:
            if not isinstance(item, dict) or item.get("type") != "image" or not item.get("data"):
                continue
            mime = str(item.get("mimeType") or item.get("mime_type") or "image/png")
            candidates.append(f"data:{mime};base64,{item['data']}")
        for image in candidates:
            if image.startswith("data:image/") and image not in seen:
                seen.add(image)
                images.append(image)
    return {"text": feedback, "images": images, "files": []}


async def process(
    text: str, *, request_id: str, origin: dict, user_id: int,
    client_tools: set[str] | None = None,
) -> dict:
    parsed = parse_final(text)
    base = {"requestId": request_id, "origin": origin, "parsed": parsed.public()}
    if not parsed.detected:
        return {**base, "ok": True, "kind": "not_tool", "entries": []}

    entries = [{"kind": "parse_error", "error": error} for error in parsed.errors]
    calls = parsed.calls
    if len(calls) > 1 and not all(call["tool"] in PARALLEL_SAFE for call in calls):
        entries.append({
            "kind": "parse_error",
            "error": "Las tools con efectos deben ejecutarse una por turno; sólo read/grep/find/ls pueden agruparse.",
        })
        calls = []

    client_tools = client_tools or set()
    for index, call in enumerate(calls):
        if call["tool"] in client_tools:
            entries.append({"kind": "client_call", "call": call})
            continue
        try:
            result = await _execute(call, request_id=request_id, index=index, user_id=user_id)
        except Exception as exc:
            result = {"ok": False, "is_error": True, "output": f"Error interno: {exc}", "error": str(exc)}
        entries.append({"kind": "tool_result", "call": call, "result": result})

    successful = any(
        entry["kind"] == "tool_result"
        and entry["result"].get("ok") is not False
        and not entry["result"].get("is_error")
        for entry in entries
    )
    client_only = bool(entries) and all(entry["kind"] == "client_call" for entry in entries)
    feedback = "" if client_only else _feedback(
        [entry for entry in entries if entry["kind"] != "client_call"]
    )
    response = {
        **base, "ok": True,
        "kind": "client_action" if client_only else "tool_result" if successful else "tool_error",
        "entries": entries,
        "feedback": feedback,
    }
    if not client_only:
        response["delivery"] = delivery_for(entries, feedback)
    return response
