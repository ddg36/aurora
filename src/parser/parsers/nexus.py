import re

from .utils import hash_id, split_leading_control_flags

RE_NEXUS_MULTI = re.compile(r'^✧✧✧\n([\s\S]*?)\n✧✧✧$', re.MULTILINE)


def parse_nexus(text: str) -> list[dict]:
    blocks = []
    seen = set()
    for m in RE_NEXUS_MULTI.finditer(text or ''):
        raw = m.group(0)
        inner = m.group(1)
        flags, rest = split_leading_control_flags(inner)
        block_id = hash_id(inner)
        if block_id in seen:
            continue
        seen.add(block_id)
        blocks.append({
            'app': 'nexus',
            'raw': raw,
            'id': block_id,
            'cmd': rest,
            'flags': flags,
            'workspace': flags.get('workspace'),
            'body': rest,
        })
    return blocks
