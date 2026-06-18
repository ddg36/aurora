import json
import time
import uuid

from litestar import get, post

from .config import STATE_DIR

PENDING: dict[str, dict] = {}


def _pending_path():
    d = STATE_DIR / 'nexus-approvals'
    d.mkdir(parents=True, exist_ok=True)
    return d / 'pending.json'


def _load():
    path = _pending_path()
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(data, dict):
            PENDING.update(data)
    except Exception:
        pass


def _save():
    _pending_path().write_text(json.dumps(PENDING, indent=2, ensure_ascii=False), encoding='utf-8')


def crear_aprobacion(action: str, command: dict, reason: str) -> dict:
    req_id = 'ap_' + uuid.uuid4().hex[:10]
    entry = {
        'id': req_id,
        'status': 'pending',
        'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'action': action,
        'reason': reason,
        'command': command,
    }
    PENDING[req_id] = entry
    _save()
    return {
        'ok': True,
        'approval_required': True,
        'approval_id': req_id,
        'action': action,
        'reason': reason,
        'hint': f'POST /nexus/approve/{req_id} o /nexus/deny/{req_id}',
    }


@get('/nexus/approvals')
async def listar_aprobaciones() -> dict:
    entries = [
        {k: v for k, v in e.items() if k != 'command'}
        for e in PENDING.values()
        if e.get('status') == 'pending'
    ]
    return {'ok': True, 'pending': entries, 'count': len(entries)}


@post('/nexus/approve/{req_id:str}')
async def aprobar(req_id: str) -> dict:
    entry = PENDING.get(req_id)
    if not entry or entry.get('status') != 'pending':
        return {'ok': False, 'error': f'Aprobación no encontrada o ya resuelta: {req_id}'}
    entry['status'] = 'approved'
    _save()
    cmd = entry.get('command') or {}
    if entry.get('action') == 'shell/run':
        from .tasks import create_job
        job = create_job(cmd.get('cmd', ''), cmd.get('cwd', '.'), {'approval_id': req_id})
        r = await job.run()
        result = {
            'ok': r['exit_code'] == 0 if r['exit_code'] is not None else False,
            'code': r['exit_code'],
            'stdout': r['stdout'],
            'stderr': r['stderr'],
            'job_id': r['id'],
            'killed': r['status'] == 'killed',
        }
        entry['result'] = {'ok': result.get('ok'), 'code': result.get('code')}
        _save()
        return {'ok': True, 'approval_id': req_id, 'executed': True, 'result': result}
    return {'ok': True, 'approval_id': req_id, 'executed': False}


@post('/nexus/deny/{req_id:str}')
async def denegar(req_id: str) -> dict:
    entry = PENDING.get(req_id)
    if not entry or entry.get('status') != 'pending':
        return {'ok': False, 'error': f'Aprobación no encontrada o ya resuelta: {req_id}'}
    entry['status'] = 'denied'
    _save()
    return {'ok': True, 'approval_id': req_id, 'status': 'denied'}


_load()

APPROVAL_ROUTES = [listar_aprobaciones, aprobar, denegar]
