import base64
import re

from .utils import hash_id, split_leading_control_flags

RE_NX_MULTI = re.compile(r'^✦✦✦\n([\s\S]*?)\n✦✦✦$', re.MULTILINE)
RE_NXW_MULTI = re.compile(r'@@nxw\s*\n([\s\S]*?)(?:^@@endnxw\s*$|^@@end\s*$)', re.MULTILINE)


def parse_nx(text: str) -> list[dict]:
    return _extract(text, 'nx', 'bash', RE_NX_MULTI)


def parse_nxw(text: str) -> list[dict]:
    return _extract(text, 'nxw', 'powershell', RE_NXW_MULTI)


def _extract(text: str, app: str, shell: str, regex: re.Pattern) -> list[dict]:
    blocks = []
    seen = set()
    for m in regex.finditer(text or ''):
        raw = m.group(0)
        inner = m.group(1)
        flags, rest = split_leading_control_flags(inner)
        cmd = rest
        if flags.get('raw64') or flags.get('base64'):
            try:
                cmd = _decode_b64(rest)
            except Exception as e:
                msg = str(e).replace("'", "'\"'\"'")
                cmd = f"printf '%s\\n' 'NX_RAW64_DECODE_ERROR: {msg}' >&2; exit 2"
        block_id = hash_id(inner)
        if block_id in seen:
            continue
        seen.add(block_id)
        blocks.append({'app': app, 'raw': raw, 'id': block_id, 'cmd': cmd, 'shell': shell, 'flags': flags, 'body': rest})
    return blocks


def _decode_b64(value: str) -> str:
    clean = re.sub(r'\s+', '', str(value or ''))
    if not clean:
        raise ValueError('raw64 vacío')
    return base64.b64decode(clean).decode('utf-8')
