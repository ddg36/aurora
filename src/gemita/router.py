# ══════════════════════════════════════════════════════
#  GEMITA ROUTER — WebSocket /gemita sobre Litestar
#  Una conexión = una sesión = un ShellBash propio.
#  El chat corre como task; confirm/hub_action_result entran
#  por el loop receptor hacia session.inbox (sin robar mensajes).
# ══════════════════════════════════════════════════════

import asyncio
import json
import logging
import uuid

from litestar import websocket
from litestar.connection import WebSocket

from . import bucle, config
from .providers import list_models
from .shell import ShellBash
from .tools import registrar_herramientas_python
from .protocol import get_catalog

log = logging.getLogger("aurora.gemita")

if not get_catalog().list_all():
    registrar_herramientas_python()


class GemitaSession:
    def __init__(self, socket: WebSocket):
        self.socket = socket
        self.shell = ShellBash(timeout=config.TIMEOUT_SHELL)
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.chat_task: asyncio.Task | None = None
        self.session_id = 'gemita-' + uuid.uuid4().hex[:8]

    async def send(self, payload: dict):
        await self.socket.send_text(json.dumps(payload, ensure_ascii=False))

    def cerrar(self):
        if self.chat_task and not self.chat_task.done():
            self.chat_task.cancel()
        self.shell.cerrar()


async def _session_init(session: GemitaSession):
    await session.shell.ejecutar(f'cd {config.PROJECT_ROOT}')
    cwd = await session.shell.cwd()
    await session.send({
        'type': 'session_init',
        'session_id': session.session_id,
        'session_name': session.session_id,
        'session_path': cwd,
        'workspace': cwd,
        'version': config.VERSION,
    })


async def _manejar_models(session: GemitaSession):
    try:
        models = [
            {
                'id': m.id,
                'name': m.name,
                'provider': m.provider_name,
                'provider_id': m.provider_id,
                'capabilities': m.capabilities,
            }
            for m in await list_models()
        ]
    except Exception:
        models = []
    await session.send({'type': 'models', 'models': models})


async def _correr_chat(session: GemitaSession, datos: dict):
    try:
        await bucle.manejar_chat(session, datos)
    except asyncio.CancelledError:
        await session.send({'type': 'done', 'cancelled': True})
    except Exception as exc:
        log.exception("error en chat")
        try:
            await session.send({'type': 'error', 'message': str(exc)})
            await session.send({'type': 'done'})
        except Exception:
            pass


@websocket("/gemita")
async def gemita_ws(socket: WebSocket) -> None:
    await socket.accept()
    session = GemitaSession(socket)

    try:
        await _session_init(session)

        while True:
            try:
                msg = await socket.receive_json()
            except Exception:
                break
            if not isinstance(msg, dict):
                continue

            tipo = msg.get('type')

            if tipo == 'chat':
                if session.chat_task and not session.chat_task.done():
                    await session.send({'type': 'error', 'message': 'Gemita ocupada: ya hay un chat en curso'})
                    continue
                session.chat_task = asyncio.create_task(_correr_chat(session, msg))

            elif tipo in ('confirm', 'hub_action_result'):
                session.inbox.put_nowait(msg)

            elif tipo == 'cancel':
                if session.chat_task and not session.chat_task.done():
                    session.chat_task.cancel()

            elif tipo == 'models':
                await _manejar_models(session)

            elif tipo == 'reset':
                if session.chat_task and not session.chat_task.done():
                    session.chat_task.cancel()
                session.shell.cerrar()
                session.shell = ShellBash(timeout=config.TIMEOUT_SHELL)
                await _session_init(session)

            elif tipo == 'condense':
                summary = await bucle.condensar_memoria(msg)
                await session.send({'type': 'condense_result', 'summary': summary})

            elif tipo == 'status':
                cwd = await session.shell.cwd()
                await session.send({
                    'type': 'status',
                    'session_id': session.session_id,
                    'session_path': cwd,
                    'version': config.VERSION,
                })

            else:
                await session.send({'type': 'error', 'message': f'Tipo de mensaje no soportado: {tipo}'})

    finally:
        session.cerrar()


GEMITA_ROUTES = [gemita_ws]
