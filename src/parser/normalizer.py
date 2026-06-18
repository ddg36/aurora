from .parsers.br import br_flag_to_action
from .parsers.pg import pg_flag_to_action


def normalize(parsed: dict, context: dict | None) -> dict:
    context = context or {}
    origin = context.get('origin') or 'unknown'
    surface = context.get('surface') or 'tab'
    url = context.get('url') or ''
    def_ws = context.get('defaultWorkspace')
    allowed = context.get('allowedWorkspaces') or ([def_ws] if def_ws else [])

    source = {'origin': origin, 'surface': surface, 'url': url}
    for key in ('conversationId', 'messageIndex', 'turnIndex'):
        if key in context:
            source[key] = context[key]

    app = parsed.get('app')
    raw = parsed.get('raw', '')
    block_id = parsed.get('id', '')

    if app == 'nexus':
        ws = _resolve_workspace(parsed.get('workspace'), def_ws, allowed)
        if not ws['ok']:
            return _error('VALIDATION_ERROR', ws['error'], raw)
        return {
            'ok': True, 'id': block_id, 'schemaVersion': 1, 'source': source,
            'app': 'nexus', 'action': 'run-cli', 'target': 'nexus', 'capability': 'fs',
            'workspace': ws['value'], 'session': None,
            'cmd': parsed.get('cmd') or '', 'body': parsed.get('body') or '',
            'params': {}, 'flags': parsed.get('flags') or {}, 'raw': raw,
        }

    if app in ('nx', 'nxw'):
        ws = _resolve_workspace(parsed.get('workspace'), def_ws, allowed)
        if not ws['ok']:
            return _error('VALIDATION_ERROR', ws['error'], raw)
        return {
            'ok': True, 'id': block_id, 'schemaVersion': 1, 'source': source,
            'app': app, 'action': 'run-shell', 'target': 'nexus', 'capability': 'shell',
            'workspace': ws['value'], 'session': None,
            'cmd': parsed.get('cmd') or '', 'body': parsed.get('body') or '',
            'params': {'shell': 'bash' if app == 'nx' else 'powershell'},
            'flags': parsed.get('flags') or {}, 'raw': raw,
        }

    if app == 'br':
        flags = parsed.get('flags') or {}
        obs_action = _br_observer_action(flags)
        if obs_action:
            return {
                'ok': True, 'id': block_id, 'schemaVersion': 1, 'source': source,
                'app': 'br', 'action': obs_action, 'target': 'local-dom', 'capability': 'dom-observer',
                'workspace': def_ws, 'session': None, 'cmd': '', 'body': '',
                'params': _br_obs_params(flags), 'flags': flags, 'raw': raw,
            }
        action = br_flag_to_action(flags)
        if not action:
            return _error('UNSUPPORTED_ACTION', 'No se pudo determinar la acción del bloque @@br', raw)
        session = flags.get('session') if isinstance(flags.get('session'), str) else None
        session = session or (flags.get('s') if isinstance(flags.get('s'), str) else None)
        return {
            'ok': True, 'id': block_id, 'schemaVersion': 1, 'source': source,
            'app': 'br', 'action': action, 'target': 'browser', 'capability': 'tabs',
            'workspace': def_ws or 'ash', 'session': session, 'cmd': '', 'body': '',
            'params': _br_params(flags, action), 'flags': flags, 'raw': raw,
        }

    if app == 'pg':
        flags = parsed.get('flags') or {}
        action = pg_flag_to_action(flags)
        if not action:
            return _error('UNSUPPORTED_ACTION', 'No se pudo determinar la acción del bloque @@pg', raw)
        return {
            'ok': True, 'id': block_id, 'schemaVersion': 1, 'source': source,
            'app': 'pg', 'action': action, 'target': 'local-dom', 'capability': 'chat-dom',
            'workspace': def_ws, 'session': None, 'cmd': '', 'body': '',
            'params': _pg_params(flags), 'flags': flags, 'raw': raw,
        }

    return _error('UNKNOWN_APP', f'App no soportada: {app}', raw)


def _br_observer_action(flags: dict) -> str | None:
    if 'map' in flags:
        return 'dom/interactive'
    if 'txt' in flags:
        return 'dom/text'
    if 'state' in flags:
        return 'page/info'
    if 'read' in flags:
        return 'chat/last-assistant'
    if 'transcript' in flags:
        return 'chat/last-pre'
    if '_obs' in flags:
        return flags['_obs']
    return None


def _br_obs_params(flags: dict) -> dict:
    p = {}
    if 'limit' in flags:
        p['limit'] = flags['limit']
    if 'sel' in flags:
        p['sel'] = flags['sel']
    if 'selector' in flags:
        p['sel'] = flags['selector']
    return p


def _br_params(flags: dict, action: str) -> dict:
    p = {}
    mapping = {'launch': 'path', 'path': 'path', 'nav': 'url', 'url': 'url', 'el': 'el',
               'text': 'text', 'x': 'x', 'y': 'y', 'dy': 'dy', 'dx': 'dx', 'w': 'w',
               'h': 'h', 'sel': 'sel', 'limit': 'limit', 'id': 'id'}
    for flag, param in mapping.items():
        if flag in flags:
            p[param] = flags[flag]
    if action == 'click':
        p['el'] = flags.get('click')
    if action == 'fill':
        p['el'] = flags.get('type')
    if action == 'scroll':
        p['dy'] = flags.get('scroll')
    return p


def _pg_params(flags: dict) -> dict:
    p = {}
    if 'sel' in flags:
        p['sel'] = flags['sel']
    if 'limit' in flags:
        p['limit'] = flags['limit']
    return p


def _resolve_workspace(explicit, default_ws, allowed) -> dict:
    target = explicit or default_ws
    if not target:
        return {'ok': False, 'error': 'No se pudo resolver workspace — falta defaultWorkspace en context'}
    if allowed and target not in allowed:
        return {'ok': False, 'error': f"Workspace '{target}' no permitido (allowed: {', '.join(allowed)})"}
    return {'ok': True, 'value': target}


def _error(code: str, message: str, raw: str) -> dict:
    return {'ok': False, 'error': {'code': code, 'message': message, 'details': {}}, 'raw': raw or ''}
