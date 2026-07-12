# ══════════════════════════════════════════════════════
#  PI ROUTER — WebSocket /lyra (Lyra = chat local sobre pi).
#  Mismo protocolo WS que usaba gemita: la UI no cambia.
#  El chat corre como task; cancel/confirm entran por el
#  loop receptor mientras pi streamea.
# ══════════════════════════════════════════════════════

import asyncio
import logging

from litestar import websocket, post
from litestar.connection import WebSocket

from .bridge import PiBridge
from .cloud_tools import ejecutar_tool

log = logging.getLogger('aurora.pi')


@post('/pi/cloud-tool')
async def cloud_tool(data: dict) -> dict:
    """El LLM de la nube pidió una tool básica (read/bash/edit/write). Se ejecuta
    DIRECTO (sin LLM intermediario): instantáneo y fiable. Devuelve
    {ok, output, is_error} para inyectar de vuelta al iframe."""
    tool = str(data.get('tool') or '').strip()
    if not tool:
        return {'ok': False, 'error': "Falta 'tool'", 'is_error': True, 'output': ''}
    return await ejecutar_tool(tool, data.get('args') or {})


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


PI_ROUTES = [pi_ws, cloud_tool]
