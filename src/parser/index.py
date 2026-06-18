from .normalizer import normalize
from .parsers.br import parse_br
from .parsers.nexus import parse_nexus
from .parsers.nx import parse_nx, parse_nxw
from .parsers.pg import parse_pg
from .validator import validate_normalized


def aurora_parse(text: str, context: dict | None = None) -> dict:
    raw = text or ''
    blocks: list[dict] = []
    errors: list[dict] = []

    parsed = [
        *parse_nexus(raw),
        *parse_nx(raw),
        *parse_nxw(raw),
        *parse_br(raw),
        *parse_pg(raw),
    ]

    if not parsed:
        return {'ok': False, 'blocks': [], 'errors': [{'code': 'NO_BLOCK_FOUND', 'message': 'No se encontraron bloques reconocibles'}]}

    for p in parsed:
        normalized = validate_normalized(normalize(p, context))
        if normalized.get('ok'):
            blocks.append(normalized)
        else:
            errors.append(normalized)

    return {'ok': bool(blocks), 'blocks': blocks, 'errors': errors}
