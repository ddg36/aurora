# ══════════════════════════════════════════════════════
#  PI ROUTER — WebSocket /lyra (Lyra = chat local sobre pi).
#  Mismo protocolo WS que usaba gemita: la UI no cambia.
#  El chat corre como task; cancel/confirm entran por el
#  loop receptor mientras pi streamea.
# ══════════════════════════════════════════════════════

import asyncio
import json
import logging

from litestar import get, websocket, post
from litestar.connection import Request, WebSocket

from db.connection import get_db

from .bridge import PiBridge
from pi_tools import catalog as pi_tools_catalog
from pi_tools import health as pi_tools_health

log = logging.getLogger('aurora.pi')

_cloud_turn_lock = asyncio.Lock()
_TERMINAL_TURN_STATES = {'completed', 'cancelled', 'failed'}


def _json_canon(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def _json_dict(value: str | None, fallback=None):
    try:
        parsed = json.loads(value) if value else fallback
        return parsed if isinstance(parsed, dict) else fallback
    except (TypeError, ValueError):
        return fallback


@get('/tools/providers/pi/catalog')
async def cloud_pi_catalog() -> dict:
    """Catálogo vivo de la versión instalada de pi; fuente de verdad de @@."""
    try:
        result = await pi_tools_catalog()
        return {'ok': True, **result, 'health': pi_tools_health()}
    except Exception as exc:
        return {'ok': False, 'provider': 'pi', 'tools': [], 'error': str(exc), 'health': pi_tools_health()}


@post('/cloud-agent/turn/save')
async def cloud_turn_save(data: dict, request: Request) -> dict:
    uid = int(request.state.usuario_id)
    turn_id = str(data.get('turnId') or '').strip()
    if not turn_id:
        return {'ok': False, 'error': 'Falta turnId'}
    status = str(data.get('status') or 'prepared')
    state = data.get('state')
    state_json = _json_canon(state) if isinstance(state, dict) else None

    async with _cloud_turn_lock:
        db = await get_db()
        await db.execute(
            '''INSERT INTO cloud_agent_turns
               (usuario_id, turn_id, conv_id, ai_id, url, pane_id, status, iteration,
                request_id, prompt, next_prompt, state_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(usuario_id, turn_id) DO UPDATE SET
                 conv_id=COALESCE(excluded.conv_id, cloud_agent_turns.conv_id),
                 ai_id=COALESCE(excluded.ai_id, cloud_agent_turns.ai_id),
                 url=COALESCE(excluded.url, cloud_agent_turns.url),
                 pane_id=COALESCE(excluded.pane_id, cloud_agent_turns.pane_id),
                 status=excluded.status,
                 iteration=excluded.iteration,
                 request_id=COALESCE(excluded.request_id, cloud_agent_turns.request_id),
                 prompt=COALESCE(excluded.prompt, cloud_agent_turns.prompt),
                 next_prompt=COALESCE(excluded.next_prompt, cloud_agent_turns.next_prompt),
                 state_json=COALESCE(excluded.state_json, cloud_agent_turns.state_json),
                 updated_at=unixepoch()''',
            (
                uid, turn_id, data.get('convId'), data.get('aiId'), data.get('url'),
                data.get('paneId') or 'cloud', status, data.get('iteration', 0),
                data.get('requestId'), data.get('prompt'), data.get('nextPrompt'), state_json,
            ),
        )
        if status in _TERMINAL_TURN_STATES:
            await db.execute(
                '''UPDATE cloud_agent_turns
                   SET completed_at=COALESCE(completed_at, unixepoch())
                   WHERE usuario_id=? AND turn_id=?''',
                (uid, turn_id),
            )
        else:
            await db.execute(
                'UPDATE cloud_agent_turns SET completed_at=NULL WHERE usuario_id=? AND turn_id=?',
                (uid, turn_id),
            )
        await db.commit()
    return {'ok': True, 'turnId': turn_id, 'status': status}


@post('/cloud-agent/turn/recover')
async def cloud_turn_recover(data: dict, request: Request) -> dict:
    uid = int(request.state.usuario_id)
    turn_id = str(data.get('turnId') or '').strip()
    pane_id = str(data.get('paneId') or 'cloud')
    db = await get_db()
    if turn_id:
        query = 'SELECT * FROM cloud_agent_turns WHERE usuario_id=? AND turn_id=?'
        params = (uid, turn_id)
    else:
        query = (
            "SELECT * FROM cloud_agent_turns WHERE usuario_id=? AND pane_id=? "
            "AND status NOT IN ('completed','cancelled','failed') "
            'ORDER BY updated_at DESC LIMIT 1'
        )
        params = (uid, pane_id)
    async with db.execute(query, params) as cur:
        row = await cur.fetchone()
    if not row:
        return {'ok': True, 'turn': None}

    turn = dict(row)
    turn['state'] = _json_dict(turn.pop('state_json', None), {})
    return {'ok': True, 'turn': turn}


@post('/cloud-agent/turn/complete')
async def cloud_turn_complete(data: dict, request: Request) -> dict:
    uid = int(request.state.usuario_id)
    turn_id = str(data.get('turnId') or '').strip()
    if not turn_id:
        return {'ok': False, 'error': 'Falta turnId'}
    status = str(data.get('status') or 'completed')
    async with _cloud_turn_lock:
        db = await get_db()
        await db.execute(
            '''UPDATE cloud_agent_turns
               SET status=?, updated_at=unixepoch(), completed_at=unixepoch()
               WHERE usuario_id=? AND turn_id=?''',
            (status, uid, turn_id),
        )
        await db.commit()
    return {'ok': True, 'turnId': turn_id, 'status': status}


@websocket('/lyra')
async def pi_ws(socket: WebSocket) -> None:
    await socket.accept()
    bridge = PiBridge(socket)

    try:
        await bridge.enviar_estado('session_init')

        while True:
            try:
                msg = await socket.receive_json()
            except Exception:
                break
            if not isinstance(msg, dict):
                continue

            tipo = msg.get('type')

            if tipo == 'chat':
                if bridge.chat_task and not bridge.chat_task.done():
                    # Ya streameando: Enter mid-stream ES steering, no error —
                    # se entrega apenas termine el turno de tool-calls actual.
                    asyncio.create_task(bridge.enviar_steer(msg))
                    continue
                bridge.chat_task = asyncio.create_task(bridge.manejar_chat(msg))

            elif tipo == 'cancel':
                asyncio.create_task(bridge.cancelar())

            elif tipo == 'confirm':
                await bridge.responder_confirm(bool(msg.get('approved')))

            elif tipo == 'models':
                await bridge.manejar_models()

            elif tipo == 'commands':
                await bridge.manejar_commands()

            elif tipo == 'cycle_model':
                await bridge.manejar_cycle_model()

            elif tipo == 'link_session':
                # Frontend ya creó el chat Aurora (tras fork/clone/import) —
                # lo mapea a la sesión pi que quedó activa, sin new_session.
                cid = msg.get('chat_id')
                if cid is not None:
                    await bridge.vincular_sesion_actual(cid)

            elif tipo == 'reset':
                await bridge.reset(msg)

            elif tipo == 'status':
                await bridge.enviar_estado('status')

            elif tipo == 'hub_action_result':
                log.info('hub_action_result ignorado con engine pi')

            else:
                await bridge.send({'type': 'error', 'message': f'Tipo de mensaje no soportado: {tipo}'})

    finally:
        if bridge.chat_task and not bridge.chat_task.done():
            bridge.chat_task.cancel()


PI_ROUTES = [
    pi_ws, cloud_pi_catalog, cloud_turn_save, cloud_turn_recover, cloud_turn_complete,
]
