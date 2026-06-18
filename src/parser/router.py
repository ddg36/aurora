from litestar import post

from .index import aurora_parse


@post('/parser/parse')
async def parser_parse(data: dict) -> dict:
    return aurora_parse(str(data.get('text') or ''), data.get('context') or {})


PARSER_ROUTES = [parser_parse]
