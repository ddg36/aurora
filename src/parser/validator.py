REQUIRED = ('id', 'schemaVersion', 'source', 'app', 'action', 'target', 'capability', 'raw')


def validate_normalized(block: dict) -> dict:
    if not block or block.get('ok') is not True:
        return block

    for key in REQUIRED:
        if block.get(key) in (None, ''):
            return {
                'ok': False,
                'error': {'code': 'VALIDATION_ERROR', 'message': f'Campo requerido faltante: {key}', 'details': {'key': key}},
                'raw': block.get('raw', ''),
            }

    if block.get('schemaVersion') != 1:
        return {
            'ok': False,
            'error': {'code': 'VALIDATION_ERROR', 'message': 'schemaVersion no soportado', 'details': {'schemaVersion': block.get('schemaVersion')}},
            'raw': block.get('raw', ''),
        }

    if block.get('target') == 'nexus' and not block.get('workspace'):
        return {
            'ok': False,
            'error': {'code': 'VALIDATION_ERROR', 'message': 'workspace requerido para target=nexus', 'details': {}},
            'raw': block.get('raw', ''),
        }

    return block
