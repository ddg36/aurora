"""Parser estructural de Nexus 2.

Nexus 2 es una serialización textual alternativa de una llamada ``{tool,args}``.
No ejecuta tools, no reproduce schemas de Pi y no toca el parser de JSON Family.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any


HEADER_RE = re.compile(r"^⬡\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\s+(.*?))?\s*⬡$", re.UNICODE)
BLOCK_OPEN_RE = re.compile(r"^(◆{3,})\s+([A-Za-z_][A-Za-z0-9_.\[\]-]*)\s*$", re.UNICODE)
MARKDOWN_FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})", re.UNICODE)
PARTIAL_HEADER_RE = re.compile(r"^\s*⬡", re.UNICODE)
NUMBER_RE = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$")
PATH_TOKEN_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]")

# Límites defensivos del formato textual. Pi sigue siendo la autoridad del
# schema, pero Nexus nunca debe reservar memoria proporcional a un índice
# arbitrario emitido por un modelo.
MAX_ARRAY_INDEX = 1024
MAX_PATH_DEPTH = 32
MAX_PATH_CHARS = 2048
MAX_FRAME_CHARS = 1024 * 1024


class NexusSyntaxError(ValueError):
    pass


@dataclass(slots=True)
class ParseResult:
    detected: bool = False
    calls: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    prefix: str = ""
    blocks: list[dict[str, Any]] = field(default_factory=list)
    canonical_text: str = ""

    def public(self) -> dict[str, Any]:
        return {
            "detected": self.detected,
            "calls": self.calls,
            "errors": self.errors,
            "prefix": self.prefix,
            "blocks": self.blocks,
            "canonicalText": self.canonical_text,
        }


def _tokenize_header(raw: str) -> list[tuple[str, bool]]:
    tokens: list[tuple[str, bool]] = []
    current: list[str] = []
    quote: str | None = None
    token_was_quoted = False
    escaping = False

    def push() -> None:
        nonlocal current, token_was_quoted
        if current or token_was_quoted:
            tokens.append(("".join(current), token_was_quoted))
        current = []
        token_was_quoted = False

    for char in raw:
        if escaping:
            # Sólo quote y backslash son escapes Nexus. Para rutas Windows y
            # regex conservamos la barra de cualquier otra secuencia (\U, \d…).
            if quote is not None and char not in {quote, "\\"}:
                current.append("\\")
            current.append(char)
            escaping = False
            continue
        if quote and char == "\\":
            escaping = True
            continue
        if quote:
            if char == quote:
                quote = None
                token_was_quoted = True
            else:
                current.append(char)
            continue
        if char in {'"', "'"}:
            quote = char
            token_was_quoted = True
            continue
        if char.isspace():
            push()
        else:
            current.append(char)

    if escaping:
        raise NexusSyntaxError("La cabecera termina con un escape incompleto.")
    if quote:
        raise NexusSyntaxError(f"La cabecera contiene una comilla {quote} sin cerrar.")
    push()
    return tokens


def _scalar(value: str, quoted: bool) -> Any:
    if quoted:
        return value
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None
    if NUMBER_RE.fullmatch(value):
        try:
            return int(value) if not any(char in value for char in ".eE") else float(value)
        except ValueError:
            pass
    return value


def _parse_scalar_args(raw: str) -> dict[str, Any]:
    args: dict[str, Any] = {}
    if not raw.strip():
        return args
    for token, token_quoted in _tokenize_header(raw):
        equals = token.find("=")
        if equals <= 0:
            raise NexusSyntaxError(f"Argumento escalar inválido: {token}")
        key = token[:equals]
        value = token[equals + 1:]
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", key):
            raise NexusSyntaxError(f"Nombre de argumento inválido: {key}")
        if key in args:
            raise NexusSyntaxError(f"Argumento escalar duplicado: {key}")
        # El tokenizer conserva si el token contenía comillas. En ``key=\"x\"``
        # esa señal corresponde al valor y evita convertir strings como "true".
        args[key] = _scalar(value, token_quoted)
    return args


def _path_tokens(path: str) -> list[str | int]:
    if len(path) > MAX_PATH_CHARS:
        raise NexusSyntaxError(
            f"Ruta de argumento demasiado larga; máximo {MAX_PATH_CHARS} caracteres."
        )
    tokens: list[str | int] = []
    cursor = 0
    while cursor < len(path):
        match = PATH_TOKEN_RE.match(path, cursor)
        if not match:
            raise NexusSyntaxError(f"Ruta de argumento inválida: {path}")
        token: str | int = match.group(1) if match.group(2) is None else int(match.group(2))
        if isinstance(token, int) and token > MAX_ARRAY_INDEX:
            raise NexusSyntaxError(
                f"Índice de array fuera de límite en {path}; máximo {MAX_ARRAY_INDEX}."
            )
        tokens.append(token)
        if len(tokens) > MAX_PATH_DEPTH:
            raise NexusSyntaxError(
                f"Ruta de argumento demasiado profunda; máximo {MAX_PATH_DEPTH} segmentos."
            )
        cursor = match.end()
        if cursor == len(path):
            break
        if path[cursor] == ".":
            cursor += 1
            if cursor == len(path):
                raise NexusSyntaxError(f"Ruta de argumento inválida: {path}")
            continue
        if path[cursor] == "[":
            continue
        raise NexusSyntaxError(f"Ruta de argumento inválida: {path}")
    if not tokens:
        raise NexusSyntaxError(f"Ruta de argumento inválida: {path}")
    return tokens


def _set_deep(target: dict[str, Any], path: str, value: str) -> None:
    tokens = _path_tokens(path)
    cursor: Any = target

    for index, token in enumerate(tokens):
        last = index == len(tokens) - 1
        next_token = None if last else tokens[index + 1]

        if isinstance(token, int):
            if not isinstance(cursor, list):
                raise NexusSyntaxError(f"Conflicto de estructura en: {path}")
            while len(cursor) <= token:
                cursor.append(None)
            if last:
                if cursor[token] is not None:
                    raise NexusSyntaxError(f"Ruta de argumento duplicada: {path}")
                cursor[token] = value
                return
            expected: Any = [] if isinstance(next_token, int) else {}
            if cursor[token] is None:
                cursor[token] = expected
            elif isinstance(next_token, int) and not isinstance(cursor[token], list):
                raise NexusSyntaxError(f"Conflicto de estructura en: {path}")
            elif not isinstance(next_token, int) and not isinstance(cursor[token], dict):
                raise NexusSyntaxError(f"Conflicto de estructura en: {path}")
            cursor = cursor[token]
            continue

        if not isinstance(cursor, dict):
            raise NexusSyntaxError(f"Conflicto de estructura en: {path}")
        if last:
            if token in cursor:
                raise NexusSyntaxError(f"Ruta de argumento duplicada: {path}")
            cursor[token] = value
            return
        expected = [] if isinstance(next_token, int) else {}
        if token not in cursor:
            cursor[token] = expected
        elif isinstance(next_token, int) and not isinstance(cursor[token], list):
            raise NexusSyntaxError(f"Conflicto de estructura en: {path}")
        elif not isinstance(next_token, int) and not isinstance(cursor[token], dict):
            raise NexusSyntaxError(f"Conflicto de estructura en: {path}")
        cursor = cursor[token]


def _partial_header_candidates(lines: list[str]) -> list[int]:
    candidates: list[int] = []
    markdown_fence: tuple[str, int] | None = None
    for index, line in enumerate(lines):
        match = MARKDOWN_FENCE_RE.match(line)
        if match:
            marker = match.group(1)
            char = marker[0]
            if markdown_fence is None:
                markdown_fence = (char, len(marker))
            elif markdown_fence[0] == char and len(marker) >= markdown_fence[1]:
                markdown_fence = None
            continue
        if markdown_fence is None and PARTIAL_HEADER_RE.match(line):
            candidates.append(index)
    return candidates


def _header_candidates(lines: list[str]) -> list[int]:
    candidates: list[int] = []
    markdown_fence: tuple[str, int] | None = None
    for index, line in enumerate(lines):
        match = MARKDOWN_FENCE_RE.match(line)
        if match:
            marker = match.group(1)
            char = marker[0]
            if markdown_fence is None:
                markdown_fence = (char, len(marker))
            elif markdown_fence[0] == char and len(marker) >= markdown_fence[1]:
                markdown_fence = None
            continue
        if markdown_fence is None and HEADER_RE.fullmatch(line):
            candidates.append(index)
    return candidates


def parse_final(text: str) -> ParseResult:
    source = str(text or "").replace("\r\n", "\n").replace("\r", "\n")

    # Arbitraje unilateral: si el cierre estricto ya pertenece a JSON Family,
    # Nexus no reclama ese turno. El parser/orquestador JSON permanece intacto.
    from json_family.parser import parse_final as parse_json_final
    json_terminal = parse_json_final(source)
    if json_terminal.detected:
        return ParseResult(prefix=source)
    lines = source.split("\n")
    while lines and not lines[-1].strip():
        lines.pop()

    candidates = _header_candidates(lines)
    if not candidates:
        # Una apertura Nexus malformada debe fallar cerrada aunque después tenga
        # bloques ◆. Los ejemplos contenidos en Markdown quedan excluidos.
        partials = _partial_header_candidates(lines)
        if partials:
            return ParseResult(
                detected=True,
                errors=[f"Cabecera Nexus 2 inválida o incompleta en la línea {partials[-1] + 1}."],
                prefix="\n".join(lines[:partials[-1]]),
            )
        return ParseResult(prefix=source)

    header_index = candidates[-1]
    frame_chars = len("\n".join(lines[header_index:]))
    if frame_chars > MAX_FRAME_CHARS:
        return ParseResult(
            detected=True,
            errors=[
                f"Frame Nexus 2 demasiado grande; máximo {MAX_FRAME_CHARS} caracteres."
            ],
            prefix="\n".join(lines[:header_index]),
        )

    # Nexus 2 sólo permite un frame ejecutable terminal. Una apertura Nexus
    # anterior —válida o malformada— no puede esconderse como simple prefijo,
    # porque eso volvería ambiguo cuál llamada pidió realmente el modelo.
    earlier_openings = _partial_header_candidates(lines[:header_index])
    if earlier_openings:
        first = earlier_openings[0]
        return ParseResult(
            detected=True,
            errors=[
                "Nexus 2 requiere un único frame terminal; "
                f"se encontró otra apertura Nexus en la línea {first + 1}."
            ],
            prefix="\n".join(lines[:first]),
        )

    prefix = "\n".join(lines[:header_index])
    match = HEADER_RE.fullmatch(lines[header_index])
    assert match is not None

    result = ParseResult(detected=True, prefix=prefix)
    try:
        tool = match.group(1)
        args = _parse_scalar_args(match.group(2) or "")
        index = header_index + 1
        while index < len(lines) and not lines[index].strip():
            index += 1

        while index < len(lines):
            opening = BLOCK_OPEN_RE.fullmatch(lines[index])
            if not opening:
                raise NexusSyntaxError(f"Contenido inesperado después de Nexus en la línea {index + 1}.")
            fence, argument_path = opening.groups()
            index += 1
            payload: list[str] = []
            closed = False
            while index < len(lines):
                if lines[index] == fence:
                    closed = True
                    index += 1
                    break
                payload.append(lines[index])
                index += 1
            if not closed:
                raise NexusSyntaxError(f"Bloque sin cierre: {argument_path}")
            value = "\n".join(payload)
            _set_deep(args, argument_path, value)
            result.blocks.append({"path": argument_path, "fenceLength": len(fence), "chars": len(value)})
            while index < len(lines) and not lines[index].strip():
                index += 1

        call = {"tool": tool, "args": args}
        raw = json.dumps(call, ensure_ascii=False, separators=(",", ":"))
        # Garantía de reversibilidad antes de entregar el resultado a JSON Family.
        if json.loads(raw) != call:
            raise NexusSyntaxError("La conversión canónica alteró la llamada.")
        result.calls = [call]
        result.canonical_text = f"```json\n{raw}\n```"
    except (NexusSyntaxError, ValueError, TypeError, RecursionError) as exc:
        result.errors.append(str(exc))
        result.calls.clear()
        result.canonical_text = ""

    return result
