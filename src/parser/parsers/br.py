import re

from .utils import hash_id, split_leading_control_flags

RE_BR_ONE = re.compile(r'@@br\s+(.*?)\s*(?:@@endbr|@@end\b)')
RE_BR_MULTI = re.compile(r'@@br\s*\n([\s\S]*?)(?:@@endbr|(?:^|\n)@@end\s*(?:\n|$))')
FLAG_RE = re.compile(r'--([A-Za-z0-9_-]+)(?:=([^\s"\'][^\s]*|"[^"]*"|\'[^\']*\'))?')
KV_RE = re.compile(r'([A-Za-z0-9_-]+)=([^\s"\'][^\s]*|"[^"]*"|\'[^\']*\'|\S+)')

FLAG_TO_ACTION = {
    'launch': 'web-launch', 'nav': 'navigate', 'map': 'map', 'shot': 'screenshot',
    'frame': 'frame', 'state': 'state', 'clr': 'clear-map', 'read': 'read-main',
    'txt': 'text', 'transcript': 'transcript', 'region': 'region-text',
    'click': 'click', 'type': 'fill', 'tap': 'click-point', 'scroll': 'scroll', 'wheel': 'wheel',
}

ACTION_TO_FLAG = {
    'navigate': 'nav', 'web/launch': 'launch', 'web-launch': 'launch', 'map': 'map',
    'screenshot': 'shot', 'frame': 'frame', 'state': 'state', 'clear-map': 'clr',
    'read-main': 'read', 'text': 'txt', 'transcript': 'transcript', 'region-text': 'region',
    'click': 'click', 'fill': 'type', 'click-point': 'tap', 'scroll': 'scroll', 'wheel': 'wheel',
    'session-new': 'sess', 'session-use': 'sess', 'session-list': 'sess', 'session-close': 'sess',
}

OBS_ACTIONS = ['page/info', 'page/viewport', 'dom/interactive', 'dom/text', 'dom/count',
               'chat/last-assistant', 'chat/last-user', 'chat/last-pre']


def parse_br(text: str) -> list[dict]:
    blocks: list[dict] = []
    seen: set = set()
    for regex in (RE_BR_MULTI, RE_BR_ONE):
        for m in regex.finditer(text or ''):
            raw = m.group(0)
            flags = _parse_flags((m.group(1) or '').strip())
            block_id = hash_id(raw)
            if block_id in seen:
                continue
            seen.add(block_id)
            blocks.append({'app': 'br', 'raw': raw, 'id': block_id, 'flags': flags})
    return blocks


def br_flag_to_action(flags: dict) -> str | None:
    for flag, action in FLAG_TO_ACTION.items():
        if flag in flags:
            return action
    if 'sess' in flags:
        v = str(flags['sess'])
        return {'list': 'session-list', 'new': 'session-new', 'use': 'session-use', 'close': 'session-close'}.get(v)
    return None


def _unquote(val: str) -> str:
    if val and val[0] in ('"', "'"):
        return val[1:-1]
    return val


def _parse_kv(s: str) -> dict:
    out = {}
    for m in KV_RE.finditer(s):
        out[m.group(1)] = _unquote(m.group(2))
    return out


def _parse_flags(s: str) -> dict:
    s = (s or '').strip()
    ctrl_flags, rest = split_leading_control_flags(s)
    flags: dict = {}
    for m in FLAG_RE.finditer(rest):
        val = m.group(2) if m.group(2) is not None else True
        if isinstance(val, str):
            val = _unquote(val)
        flags[m.group(1)] = val
    merged = {**flags, **ctrl_flags}

    if not merged:
        kv = _parse_kv(rest)
        if kv.get('action'):
            flag = ACTION_TO_FLAG.get(kv['action'])
            if flag:
                result = {flag: kv.get('path') or kv.get('url') or kv.get('sel') or kv.get('cmd') or kv.get('value') or True}
                for k in ('path', 'url', 'sel'):
                    if kv.get(k):
                        result[k] = kv[k]
                for k in ('x', 'y', 'dy', 'limit'):
                    if kv.get(k):
                        result[k] = float(kv[k]) if '.' in kv[k] else int(kv[k])
                if kv.get('session'):
                    result['sess'] = kv['session']
                return result
            if kv['action'] in OBS_ACTIONS:
                obs = {'_obs': kv['action']}
                if kv.get('sel'):
                    obs['sel'] = kv['sel']
                if kv.get('limit'):
                    obs['limit'] = int(kv['limit'])
                return obs

    if merged:
        return merged

    parts = rest.strip().split()
    kw = parts[0].lower() if parts else ''
    tail = ' '.join(parts[1:])
    if kw in OBS_ACTIONS:
        obs = {'_obs': kw}
        if kw == 'dom/interactive' and len(parts) > 1:
            obs['limit'] = int(parts[1])
        if kw in ('dom/text', 'dom/count') and tail:
            obs['sel'] = tail.strip('"\'')
        return obs
    if kw == 'map':
        return {'_obs': 'dom/interactive', **({'limit': int(parts[1])} if len(parts) > 1 else {})}
    if kw == 'viewport':
        return {'_obs': 'page/viewport'}
    if kw == 'info':
        return {'_obs': 'page/info'}
    if kw in ('text', 'txt'):
        return {'_obs': 'dom/text', 'sel': tail or 'body'}
    if kw == 'count':
        return {'_obs': 'dom/count', 'sel': (tail or 'body').strip('"\'')}
    if kw == 'read':
        return {'_obs': 'chat/last-assistant'}
    if kw == 'user':
        return {'_obs': 'chat/last-user'}
    if kw == 'pre':
        return {'_obs': 'chat/last-pre'}
    if kw in ('launch', 'open'):
        return {'launch': parts[1] if len(parts) > 1 else ''}
    if kw == 'nav':
        return {'nav': parts[1] if len(parts) > 1 else ''}
    if kw == 'scroll':
        return {'scroll': int(parts[1]) if len(parts) > 1 else 600}
    if kw == 'click':
        return {'click': int(parts[1])} if len(parts) > 1 else {'click': True}
    keyword_map = {'shot': {'shot': True}, 'state': {'state': True}, 'transcript': {'transcript': True}, 'clr': {'clr': True}}
    if kw in keyword_map:
        return keyword_map[kw]
    return merged
