# ══════════════════════════════════════════════════════
#  PI BRIDGE — traducción protocolo WS de la UI ↔ RPC de pi.
#  Un solo proceso pi compartido; un chat streaming a la vez.
#  Sesión pi por chat de Aurora vía mapa chat_id → sessionPath.
# ══════════════════════════════════════════════════════

import asyncio
import json
import logging
import pathlib

from . import config
from .proceso import PiProceso

log = logging.getLogger('aurora.pi')

_proceso: PiProceso | None = None
_lock_streaming = asyncio.Lock()
_bridge_activo = None
_sesion_cargada: tuple = (0, None)
_modelo_fijado: str | None = None

_RUTA_MAPA = pathlib.Path(config.SESSION_DIR) / 'aurora-map.json'

_DIALOGOS = ('select', 'confirm', 'input', 'editor')

# Builtins de pi ejecutables vía RPC — expuestos en el menú / de la UI.
# (Los de la TUI pura — /settings, /themes, /scoped-models — no aplican en web.)
_BUILTINS = {
    'new':      'Sesión pi nueva para este chat (contexto limpio)',
    'compact':  'Compacta el contexto: resume lo viejo, mantiene lo reciente',
    'model':    'Ver modelos o cambiar: /model [id]',
    'thinking': 'Nivel de razonamiento: /thinking off|minimal|low|medium|high|xhigh',
    'name':     'Nombra la sesión pi: /name <nombre>',
    'session':  'Estadísticas de la sesión pi actual',
    'export':   'Exporta la sesión a HTML',
}


def get_proceso() -> PiProceso:
    global _proceso
    if _proceso is None:
        _proceso = PiProceso(on_event=_on_event)
    return _proceso


async def _on_event(evt: dict):
    bridge = _bridge_activo
    if bridge is not None:
        await bridge.evento_pi(evt)
    elif evt.get('type') == 'extension_ui_request' and evt.get('method') in _DIALOGOS:
        # sin UI escuchando: cancelar el diálogo para no colgar a pi
        await get_proceso().enviar({'type': 'extension_ui_response', 'id': evt.get('id'), 'cancelled': True})


def _cargar_mapa() -> dict:
    try:
        return json.loads(_RUTA_MAPA.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def _guardar_mapa(mapa: dict):
    _RUTA_MAPA.parent.mkdir(parents=True, exist_ok=True)
    _RUTA_MAPA.write_text(json.dumps(mapa, ensure_ascii=False, indent=1), encoding='utf-8')


def _extraer_contenido(message) -> tuple[str, list]:
    if isinstance(message, str):
        return message, []
    texto, imagenes = '', []
    for parte in message or []:
        if parte.get('type') == 'text':
            texto += parte.get('text') or ''
        elif parte.get('type') == 'image_url':
            url = (parte.get('image_url') or {}).get('url') or ''
            if url.startswith('data:') and ';base64,' in url:
                cabecera, data = url.split(';base64,', 1)
                imagenes.append({'type': 'image', 'data': data, 'mimeType': cabecera[5:] or 'image/png'})
    return texto, imagenes


def _texto_resultado(result) -> str:
    partes = [c.get('text') or '' for c in (result or {}).get('content') or [] if c.get('type') == 'text']
    if partes:
        return '\n'.join(partes)
    return json.dumps(result or {}, ensure_ascii=False)[:2000]


async def _asegurar_sesion(proceso: PiProceso, chat_id) -> bool:
    """Carga/crea la sesión pi del chat. Devuelve True si la sesión es nueva."""
    global _sesion_cargada
    clave = (proceso.generacion, str(chat_id))
    if chat_id is not None and _sesion_cargada == clave:
        return False

    if chat_id is None:
        # one-shot (toolkit/chain): sesión efímera, siempre limpia
        await proceso.pedir({'type': 'new_session'})
        _sesion_cargada = (proceso.generacion, object())
        return True

    mapa = _cargar_mapa()
    ruta = mapa.get(str(chat_id))
    if ruta and pathlib.Path(ruta).exists():
        resp = await proceso.pedir({'type': 'switch_session', 'sessionPath': ruta})
        if resp.get('success') and not (resp.get('data') or {}).get('cancelled'):
            _sesion_cargada = clave
            return False

    await proceso.pedir({'type': 'new_session'})
    estado = await proceso.pedir({'type': 'get_state'})
    ruta = (estado.get('data') or {}).get('sessionFile')
    if ruta:
        mapa[str(chat_id)] = ruta
        _guardar_mapa(mapa)
    _sesion_cargada = clave
    return True


class PiBridge:
    def __init__(self, socket):
        self.socket = socket
        self.fin = asyncio.Event()
        self.inicio = asyncio.Event()
        self.chat_task: asyncio.Task | None = None
        self._confirm_id: str | None = None

    async def send(self, payload: dict):
        await self.socket.send_text(json.dumps(payload, ensure_ascii=False))

    # ── eventos pi → UI ───────────────────────────────

    async def evento_pi(self, evt: dict):
        tipo = evt.get('type')

        if tipo == 'message_update':
            delta = evt.get('assistantMessageEvent') or {}
            dt = delta.get('type')
            if dt == 'text_delta':
                await self.send({'type': 'token', 'content': delta.get('delta') or ''})
            elif dt == 'thinking_delta':
                await self.send({'type': 'thinking', 'content': delta.get('delta') or ''})
            elif dt == 'error' and delta.get('reason') != 'aborted':
                await self.send({'type': 'error', 'message': str(delta.get('reason') or 'error de pi')})

        elif tipo == 'tool_execution_start':
            await self.send({'type': 'tool_call', 'name': evt.get('toolName') or '',
                             'args': evt.get('args') or {}, 'risk': None})

        elif tipo == 'tool_execution_update':
            partial = evt.get('partialResult') or {}
            partes = [c.get('text') or '' for c in (partial.get('content') or []) if c.get('type') == 'text']
            await self.send({'type': 'tool_progress', 'name': evt.get('toolName') or '',
                             'partial': '\n'.join(partes)})

        elif tipo == 'tool_execution_end':
            await self.send({'type': 'tool_result', 'name': evt.get('toolName') or '',
                             'output': _texto_resultado(evt.get('result')),
                             'is_error': bool(evt.get('isError'))})

        elif tipo == 'message_start':
            await self.send({'type': 'message_start', 'role': evt.get('role', 'assistant')})

        elif tipo == 'message_end':
            await self.send({'type': 'message_end', 'role': evt.get('role', 'assistant'),
                             'stop_reason': evt.get('stopReason')})

        elif tipo == 'agent_start':
            self.inicio.set()
            await self.send({'type': 'agent_start'})

        elif tipo == 'agent_end':
            await self.send({'type': 'done'})
            self.fin.set()

        elif tipo == 'queue_update':
            await self.send({'type': 'queue_update', 'queue': evt.get('queue', [])})

        elif tipo == 'session_info_changed':
            await self.send({'type': 'session_info', 'session_id': evt.get('sessionId', ''),
                             'session_name': evt.get('sessionName', '')})

        elif tipo == 'thinking_level_changed':
            await self.send({'type': 'thinking_level', 'level': evt.get('level', '')})

        elif tipo == 'extension_ui_request':
            await self._ui_request(evt)

        elif tipo in ('compaction_start', 'compaction_end', 'auto_retry_start', 'auto_retry_end'):
            await self.send({'type': tipo, 'reason': evt.get('reason', '')})

        elif tipo == 'extension_error':
            log.warning('pi extension_error: %s', evt.get('error'))
            await self.send({'type': 'error', 'message': str(evt.get('error') or 'error de pi')})

    async def _ui_request(self, evt: dict):
        metodo = evt.get('method')
        if metodo == 'confirm':
            self._confirm_id = evt.get('id')
            await self.send({'type': 'confirm_request', 'name': evt.get('title') or 'pi',
                             'command': evt.get('message') or '', 'risk': 'medium'})
        elif metodo in _DIALOGOS:
            log.info('pi diálogo %s no soportado en UI — cancelado', metodo)
            await get_proceso().enviar({'type': 'extension_ui_response', 'id': evt.get('id'), 'cancelled': True})
        elif metodo == 'notify':
            aviso = ' '.join(p for p in (evt.get('title'), evt.get('message')) if p)
            log.info('pi notify: %s', aviso)
            await self.send({'type': 'token', 'content': f'🔔 {aviso}\n'})

    async def responder_confirm(self, approved: bool):
        if self._confirm_id is None:
            return
        await get_proceso().enviar({'type': 'extension_ui_response', 'id': self._confirm_id,
                                    'confirmed': bool(approved)})
        self._confirm_id = None

    # ── mensajes UI → pi ──────────────────────────────

    async def manejar_chat(self, msg: dict):
        global _bridge_activo
        if _lock_streaming.locked():
            await self.send({'type': 'error', 'message': 'pi ocupado: ya hay un chat en curso'})
            return
        proceso = get_proceso()
        async with _lock_streaming:
            _bridge_activo = self
            try:
                await proceso.ensure()
                await self._fijar_modelo(proceso, msg.get('model'))
                nueva = await _asegurar_sesion(proceso, msg.get('chat_id'))

                texto, imagenes = _extraer_contenido(msg.get('message'))
                system = (msg.get('system') or '').strip()
                es_comando = texto.lstrip().startswith('/')
                if system and not es_comando and (msg.get('pure_system') or nueva):
                    texto = f'[Instrucciones del sistema]\n{system}\n\n{texto}'

                if es_comando:
                    nombre, _, arg = texto.lstrip()[1:].partition(' ')
                    if nombre in _BUILTINS:
                        await self._builtin(proceso, nombre, arg.strip(), msg.get('chat_id'))
                        await self.send({'type': 'done'})
                        return

                cmd = {'type': 'prompt', 'message': texto}
                if imagenes:
                    cmd['images'] = imagenes

                self.fin.clear()
                self.inicio.clear()
                resp = await proceso.pedir(cmd)
                if not resp.get('success'):
                    await self.send({'type': 'error', 'message': resp.get('error') or 'pi rechazó el prompt'})
                    await self.send({'type': 'done'})
                    return
                if es_comando:
                    # comandos de extensión pueden ejecutar sin turno LLM: sin
                    # agent_start no habrá agent_end — cerrar en vez de colgar
                    try:
                        await asyncio.wait_for(self.inicio.wait(), 3)
                    except asyncio.TimeoutError:
                        await self.send({'type': 'done'})
                        return
                await self.fin.wait()
            except asyncio.CancelledError:
                try:
                    await asyncio.wait_for(proceso.enviar({'type': 'abort'}), 5)
                except Exception:
                    pass
                raise
            except Exception as exc:
                log.exception('error en chat pi')
                await self.send({'type': 'error', 'message': str(exc)})
                await self.send({'type': 'done'})
            finally:
                _bridge_activo = None

    async def cancelar(self):
        try:
            await get_proceso().pedir({'type': 'abort'}, timeout=10)
        except Exception as exc:
            log.warning('abort pi: %s', exc)
        await asyncio.sleep(2)
        if not self.fin.is_set():
            await self.send({'type': 'done', 'cancelled': True})
            self.fin.set()

    async def _fijar_modelo(self, proceso: PiProceso, model_id):
        global _modelo_fijado
        if not model_id or model_id == _modelo_fijado:
            return
        try:
            estado = await proceso.pedir({'type': 'get_state'})
            actual = ((estado.get('data') or {}).get('model') or {}).get('id')
            if actual == model_id:
                # ya es el modelo activo — set_model redundante resetea thinking
                _modelo_fijado = model_id
                return
            resp = await proceso.pedir({'type': 'get_available_models'})
            for m in (resp.get('data') or {}).get('models') or []:
                if m.get('id') == model_id:
                    await proceso.pedir({'type': 'set_model', 'provider': m.get('provider'),
                                         'modelId': m.get('id')})
                    _modelo_fijado = model_id
                    return
        except Exception as exc:
            log.warning('set_model %s: %s', model_id, exc)

    async def manejar_models(self):
        try:
            resp = await get_proceso().pedir({'type': 'get_available_models'})
            models = [
                {'id': m.get('id'), 'name': m.get('name') or m.get('id'),
                 'provider': m.get('provider'), 'provider_id': m.get('provider'),
                 'capabilities': m.get('capabilities') or {}}
                for m in (resp.get('data') or {}).get('models') or []
            ]
        except Exception as exc:
            log.warning('get_available_models: %s', exc)
            models = []
        await self.send({'type': 'models', 'models': models})

    async def _builtin(self, proceso: PiProceso, nombre: str, arg: str, chat_id):
        global _sesion_cargada

        async def avisar(texto):
            await self.send({'type': 'token', 'content': texto})

        try:
            if nombre == 'new':
                await proceso.pedir({'type': 'new_session'})
                estado = await proceso.pedir({'type': 'get_state'})
                ruta = (estado.get('data') or {}).get('sessionFile')
                if chat_id is not None and ruta:
                    mapa = _cargar_mapa()
                    mapa[str(chat_id)] = ruta
                    _guardar_mapa(mapa)
                    _sesion_cargada = (proceso.generacion, str(chat_id))
                await avisar('🌱 Sesión nueva — contexto limpio')

            elif nombre == 'compact':
                await avisar('🗜️ Compactando contexto…\n')
                await proceso.pedir({'type': 'compact'}, timeout=180)
                await avisar('Listo — lo viejo quedó resumido.')

            elif nombre == 'model':
                resp = await proceso.pedir({'type': 'get_available_models'})
                modelos = (resp.get('data') or {}).get('models') or []
                if not arg:
                    estado = await proceso.pedir({'type': 'get_state'})
                    actual = ((estado.get('data') or {}).get('model') or {}).get('id')
                    por_prov: dict = {}
                    for m in modelos:
                        por_prov.setdefault(m.get('provider'), []).append(m.get('id'))
                    lineas = [f'Actual: {actual}']
                    for prov, ids in sorted(por_prov.items()):
                        if len(ids) <= 6:
                            lineas += [f"{'→' if i == actual else ' '} {prov}/{i}" for i in ids]
                        else:
                            lineas.append(f'  {prov}: {len(ids)} modelos (usá /model <id>)')
                    await avisar('\n'.join(lineas))
                else:
                    m = next((m for m in modelos if m.get('id') == arg or arg in str(m.get('id'))), None)
                    if not m:
                        await avisar(f'No encontré el modelo "{arg}"')
                    else:
                        await proceso.pedir({'type': 'set_model', 'provider': m.get('provider'), 'modelId': m.get('id')})
                        await avisar(f"✔ Modelo: {m.get('provider')}/{m.get('id')}")

            elif nombre == 'thinking':
                niveles = ('off', 'minimal', 'low', 'medium', 'high', 'xhigh')
                if arg not in niveles:
                    await avisar(f'Uso: /thinking {"|".join(niveles)}')
                else:
                    await proceso.pedir({'type': 'set_thinking_level', 'level': arg})
                    await avisar(f'✔ Thinking: {arg}')

            elif nombre == 'name':
                if not arg:
                    await avisar('Uso: /name <nombre>')
                else:
                    await proceso.pedir({'type': 'set_session_name', 'name': arg})
                    await avisar(f'✔ Sesión: "{arg}"')

            elif nombre == 'session':
                resp = await proceso.pedir({'type': 'get_session_stats'})
                data = resp.get('data') or {}
                lineas = [f'{k}: {v}' for k, v in data.items() if not isinstance(v, (dict, list))]
                await avisar('Sesión pi:\n' + '\n'.join(lineas[:12]))

            elif nombre == 'export':
                resp = await proceso.pedir({'type': 'export_html'}, timeout=60)
                data = resp.get('data') or {}
                ruta = data.get('path') or data.get('file') or json.dumps(data)[:200]
                await avisar(f'📄 Exportado: {ruta}')

        except Exception as exc:
            await avisar(f'Error en /{nombre}: {exc}')

    async def manejar_commands(self):
        comandos = [{'name': n, 'description': d, 'source': 'builtin'} for n, d in _BUILTINS.items()]
        try:
            resp = await get_proceso().pedir({'type': 'get_commands'})
            comandos += [
                {'name': c.get('name'), 'description': c.get('description') or '',
                 'source': c.get('source') or ''}
                for c in (resp.get('data') or {}).get('commands') or []
            ]
        except Exception as exc:
            log.warning('get_commands: %s', exc)
        await self.send({'type': 'commands', 'commands': comandos})

    async def reset(self, msg: dict):
        global _sesion_cargada
        proceso = get_proceso()
        await proceso.pedir({'type': 'new_session'})
        _sesion_cargada = (proceso.generacion, object())
        chat_id = msg.get('chat_id')
        if chat_id is not None:
            mapa = _cargar_mapa()
            estado = await proceso.pedir({'type': 'get_state'})
            ruta = (estado.get('data') or {}).get('sessionFile')
            if ruta:
                mapa[str(chat_id)] = ruta
                _guardar_mapa(mapa)
            _sesion_cargada = (proceso.generacion, str(chat_id))
        await self.enviar_estado('session_init')

    async def enviar_estado(self, tipo: str):
        try:
            proceso = get_proceso()
            await proceso.ensure()
            resp = await proceso.pedir({'type': 'get_state'})
            data = resp.get('data') or {}
        except Exception as exc:
            log.warning('pi get_state: %s', exc)
            await self.send({'type': 'error', 'message': f'pi no disponible: {exc}'})
            return
        payload = {
            'type': tipo,
            'session_id': data.get('sessionId') or '',
            'session_path': data.get('sessionFile') or '',
            'version': config.VERSION,
        }
        if tipo == 'session_init':
            payload['session_name'] = data.get('sessionName') or 'pi'
            payload['workspace'] = config.CWD
        await self.send(payload)
