import re

from .utils import hash_id, split_leading_control_flags

RE_PG_ONE = re.compile(r'@@pg\s+(.*?)\s*@@endpg')
RE_PG_MULTI = re.compile(r'@@pg\s*\n([\s\S]*?)@@endpg')
PG_FLAG_RE = re.compile(r'--([A-Za-z0-9_-]+)(?:=([^\s"\'][^\s]*|"[^"]*"|\'[^\']*\'))?')


def parse_pg(text: str) -> list[dict]:
    blocks: list[dict] = []
    seen: set = set()
    for regex in (RE_PG_MULTI, RE_PG_ONE):
        for m in regex.finditer(text or ''):
            _push(blocks, seen, m.group(0), (m.group(1) or '').strip())
    return blocks


def pg_flag_to_action(flags: dict) -> str | None:
    mapping = {'la': 'last-assistant', 'lu': 'last-user', 'lp': 'last-pre', 'info': 'info',
               'vp': 'viewport', 'inter': 'interactive', 'txt': 'text', 'cnt': 'count'}
    for flag, action in mapping.items():
        if flag in flags:
            return action
    return None


def _push(blocks: list, seen: set, raw: str, body: str) -> None:
    ctrl_flags, rest = split_leading_control_flags(body)
    flags = {**_parse_pg_flags(rest), **ctrl_flags}
    block_id = hash_id(raw)
    if block_id in seen:
        return
    seen.add(block_id)
    blocks.append({'app': 'pg', 'raw': raw, 'id': block_id, 'flags': flags})


def _parse_pg_flags(s: str) -> dict:
    flags = {}
    for m in PG_FLAG_RE.finditer(s):
        val = m.group(2) if m.group(2) is not None else True
        if isinstance(val, str) and val and val[0] in ('"', "'"):
            val = val[1:-1]
        flags[m.group(1)] = val
    return flags
