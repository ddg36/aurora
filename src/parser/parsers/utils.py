import re

_FLAG_KEYS = {'rerun', 'workspace', 'session', 'id', 'raw64', 'base64', 'literal', 'allow_multiline'}
_FLAG_RE = re.compile(r'^--([a-zA-Z0-9_-]+)(?:=([^\s"\'][^\s]*|"[^"]*"|\'[^\']*\'))?[^\S\r\n]*(?:\r?\n|\s+)')


def split_leading_control_flags(text: str) -> tuple[dict, str]:
    flags: dict = {}
    rest = re.sub(r'^\r?\n', '', str(text or ''))

    while rest.startswith('--'):
        m = _FLAG_RE.match(rest)
        if not m:
            break
        key = m.group(1)
        value = m.group(2) if m.group(2) is not None else True
        if isinstance(value, str):
            value = value.strip('"\'')
        if key in _FLAG_KEYS:
            flags[key] = value
        else:
            break
        rest = rest[m.end():]

    rest = re.sub(r'\r?\n$', '', rest)
    return flags, rest


def hash_id(text: str) -> str:
    if not text:
        return ''
    lines = [l for l in text.split('\n') if l.strip()]
    line_count = len(lines)
    first_len = len(lines[0]) if lines else 0
    h = 0
    for ch in text:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    return f'orion_{h}_{line_count}_{first_len}'
