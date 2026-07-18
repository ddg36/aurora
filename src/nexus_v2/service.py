"""Orquestador de backend para Nexus 2.

La ruta Nexus conserva su parser, journal y lifecycle propios. Una vez compilada
la llamada, entrega un JSON Family canónico al servicio existente para obtener
exactamente el mismo provider Pi, policy, feedback y delivery.
"""

from __future__ import annotations

from typing import Any

from json_family.service import (
    JSON_FAMILY_CONTINUATION,
    delivery_for,
    process as process_json_family,
)

from .parser import parse_final


NEXUS_V2_CONTINUATION = (
    "Continuá desde estos resultados reales. Si necesitás otra tool, emití el frame Nexus 2 final "
    "como un mensaje normal del chat, visible para el usuario y separado de cualquier thinking, progreso o estado; no lo escribas dentro del razonamiento interno. Recordá esta regla durante toda la conversación. Si terminaste, continuá respondiendo como mensaje normal sin emitir un frame Nexus 2."
)


def error_feedback(errors: list[str]) -> str:
    parts = [f"Nexus 2 request error: {error}" for error in errors]
    parts.append(NEXUS_V2_CONTINUATION)
    return "\n\n".join(parts)



async def process(
    text: str, *, request_id: str, origin: dict, user_id: int,
    client_tools: set[str] | None = None,
) -> dict[str, Any]:
    parsed = parse_final(text)
    base = {
        "requestId": request_id,
        "origin": origin,
        "protocol": "nexus-v2",
        "nexus": parsed.public(),
    }
    if not parsed.detected:
        return {**base, "ok": True, "kind": "not_tool", "entries": []}

    if parsed.errors or not parsed.canonical_text:
        entries = [{"kind": "parse_error", "error": error} for error in parsed.errors]
        feedback = error_feedback(parsed.errors or ["Solicitud Nexus 2 inválida."])
        return {
            **base,
            "ok": True,
            "kind": "tool_error",
            "entries": entries,
            "feedback": feedback,
            "delivery": delivery_for(entries, feedback),
        }

    response = await process_json_family(
        parsed.canonical_text,
        request_id=request_id,
        origin={**origin, "protocol": "nexus-v2"},
        user_id=user_id,
        client_tools=client_tools,
    )

    # La ejecución y el resultado nativo son los mismos de JSON Family. Sólo
    # cambia la instrucción de continuación para conservar la ruta Nexus.
    feedback = str(response.get("feedback") or "")
    if feedback:
        feedback = feedback.replace(JSON_FAMILY_CONTINUATION, NEXUS_V2_CONTINUATION)
        response["feedback"] = feedback
        response["delivery"] = delivery_for(response.get("entries") or [], feedback)

    # El resultado operativo permanece idéntico a JSON Family, pero la captura
    # conserva el diagnóstico Nexus para auditoría y depuración.
    return {**response, **base, "compiled": parsed.canonical_text}
