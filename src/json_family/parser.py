"""Parser estricto de JSON Family, independiente de proveedores y del DOM."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any


_TOOL_HINT = re.compile(r'["\']?tool["\']?\s*:', re.IGNORECASE)


class StrictJSONError(ValueError):
    pass


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise StrictJSONError(f'Clave JSON duplicada: "{key}"')
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise StrictJSONError(f'Constante JSON no válida: {value}')


def _loads_strict(raw: str) -> Any:
    return json.loads(
        raw,
        object_pairs_hook=_strict_object,
        parse_constant=_invalid_constant,
    )


@dataclass(slots=True)
class ParseResult:
    detected: bool = False
    calls: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    prefix: str = ""
    blocks: list[str] = field(default_factory=list)

    def public(self) -> dict[str, Any]:
        return {
            "detected": self.detected,
            "calls": self.calls,
            "errors": self.errors,
            "prefix": self.prefix,
            "blocks": self.blocks,
        }


def _envelope(value: Any) -> tuple[dict[str, Any] | None, str | None]:
    if not isinstance(value, dict):
        return None, "Cada bloque debe contener un único objeto JSON."
    extra = [key for key in value if key not in {"tool", "args"}]
    if extra:
        return None, f"Claves superiores no permitidas: {', '.join(extra)}."
    tool = value.get("tool")
    args = value.get("args")
    if not isinstance(tool, str) or not tool.strip():
        return None, '"tool" debe ser un string no vacío.'
    if not isinstance(args, dict):
        return None, '"args" debe ser un objeto JSON.'
    return {"tool": tool.strip(), "args": args}, None


def _final_fences(source: str) -> tuple[list[tuple[str, str, int]], str, list[str]]:
    """Extrae solamente el grupo contiguo de fences situado al final."""
    lines = source.splitlines(keepends=True)
    clean = [line.rstrip("\r\n").strip() for line in lines]
    offsets: list[int] = []
    offset = 0
    for line in lines:
        offsets.append(offset)
        offset += len(line)

    index = len(lines) - 1
    while index >= 0 and not clean[index]:
        index -= 1
    if index < 0 or clean[index] != "```":
        return [], source, []

    found: list[tuple[str, str, int]] = []
    while index >= 0 and clean[index] == "```":
        end = index
        start = end - 1
        kind = None
        while start >= 0:
            marker = clean[start].lower()
            # Cualquier apertura ``` (sola, ```json, o con OTRO lenguaje como
            # ```python/```js) cierra la búsqueda del fence. Antes sólo
            # ```json/``` contaban como apertura válida: un bloque de código
            # normal en cualquier otro lenguaje (```python, ```bash, ...) que
            # fuera el ÚLTIMO del mensaje disparaba "Fence final sin apertura
            # correspondiente." — un error falso sobre una respuesta sin
            # ninguna tool, sólo código. Se trata como "plain" salvo que su
            # contenido tenga pinta real de tool (_TOOL_HINT).
            if marker.startswith("```"):
                lang = marker[3:].strip()
                kind = "json" if lang == "json" else "plain"
                break
            start -= 1
        if start < 0 or kind is None:
            return [], source, ["Fence final sin apertura correspondiente."]
        raw = "".join(lines[start + 1:end]).strip()
        if kind == "plain" and not _TOOL_HINT.search(raw):
            # Bloque de código de un lenguaje cualquiera, sin pinta de tool
            # (```tool":... nunca aparecería en Python/JS real): no es una
            # tool rota, es código — ignorar como si no hubiera fence final.
            return [], source, []
        found.insert(0, (kind, raw, offsets[start]))
        index = start - 1
        while index >= 0 and not clean[index]:
            index -= 1
        if index < 0 or clean[index] != "```":
            break

    prefix_at = found[0][2] if found else len(source)
    return found, source[:prefix_at], []


def parse_final(text: str) -> ParseResult:
    source = str(text or "")
    fences, prefix, malformed = _final_fences(source)
    result = ParseResult(prefix=prefix, errors=list(malformed), blocks=[raw for _, raw, _ in fences])
    unrelated = 0

    for kind, raw, _ in fences:
        try:
            value = _loads_strict(raw)
        except (json.JSONDecodeError, StrictJSONError, RecursionError) as exc:
            # Un fence ``` sin json explícito con {"tool":...} roto adentro
            # (comillas faltantes, llave sin cerrar) es un intento de tool
            # mal armado, no código — igual que ```json, debe avisarle al LLM
            # que se equivocó en vez de ignorarlo en silencio. _final_fences
            # ya filtró el caso limpio (código real sin _TOOL_HINT nunca llega
            # con kind="plain" hasta acá salvo que tenga esa pinta).
            if _TOOL_HINT.search(raw):
                detail = exc.msg if isinstance(exc, json.JSONDecodeError) else str(exc)
                result.errors.append(f"JSON de tool inválido: {detail}.")
            elif kind == "json":
                unrelated += 1
            else:
                return ParseResult(prefix=source)
            continue

        looks_like_tool = isinstance(value, dict) and ("tool" in value or "args" in value)
        if kind == "plain" and not looks_like_tool:
            return ParseResult(prefix=source)
        if not looks_like_tool:
            unrelated += 1
            continue
        call, error = _envelope(value)
        if error:
            result.errors.append(error)
        elif call:
            result.calls.append(call)

    if unrelated and (result.calls or result.errors):
        result.errors.append("El grupo final mezcla tools con bloques JSON ajenos.")

    if not fences and not result.errors:
        trimmed = source.strip()
        opening = trimmed.lower().rfind("```json")
        if opening >= 0 and "```" not in trimmed[opening + 7:]:
            if _TOOL_HINT.search(trimmed[opening + 7:]):
                result.errors.append("Bloque JSON de tool incompleto: falta el cierre ```.")
        elif trimmed.startswith(("{", "[")) and _TOOL_HINT.search(trimmed):
            result.errors.append("La tool debe estar dentro de un bloque final ```json.")

    if result.errors and result.calls:
        result.errors.insert(0, "Se rechazó el grupo final completo: contiene una solicitud inválida.")
        result.calls.clear()
    result.detected = bool(result.calls or result.errors)
    return result
