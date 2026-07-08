# ══════════════════════════════════════════════════════
#  PI BRIDGE — traducción protocolo WS de la UI ↔ RPC de pi.
#  Un solo proceso pi compartido; un chat streaming a la vez.
#  Sesión pi por chat de Aurora vía mapa chat_id → sessionPath.
# ══════════════════════════════════════════════════════

import asyncio
import json
import logging
import pathlib
import shutil
import subprocess
import time

from . import config
from .proceso import PiProceso

log = logging.getLogger('aurora.pi')

_proceso: PiProceso | None = None
_lock_streaming = asyncio.Lock()
_bridge_activo = None
_sesion_cargada: tuple = (0, None)
_modelo_fijado: str | None = None

_RUTA_MAPA = pathlib.Path(config.SESSION_DIR) / 'aurora-map.json'
_RUTA_SCOPED = pathlib.Path(config.SESSION_DIR) / 'scoped-models.json'
_RUTA_AUTH = pathlib.Path.home() / '.pi' / 'agent' / 'auth.json'

_DIALOGOS = ('select', 'confirm', 'input', 'editor')

# Los 22 comandos reales de pi (docs/usage.md) adaptados a Lyra — evidencia
# en docs/superpowers/specs/2026-07-07-lyra-paridad-pi-design.md.
_BUILTINS = {
    'new':           'Sesión pi nueva para este chat (contexto limpio)',
    'compact':       'Compacta el contexto: resume lo viejo, mantiene lo reciente',
    'model':         'Ver modelos o cambiar: /model [id]',
    'scoped-models': 'Favoritos para ciclar con Alt+M: /scoped-models list|add|remove [id]',
    'settings':      'Thinking level actual, o fijalo: /settings [off|minimal|low|medium|high|xhigh]',
    'resume':        'Retomar una sesión anterior — usá el historial de chats en la barra lateral',
    'name':          'Nombra la sesión pi: /name <nombre>',
    'session':       'Estadísticas de la sesión pi actual',
    'tree':          'Árbol de la sesión actual (ramas por steering/retries/forks)',
    'trust':         'Confirma que el workspace de Aurora es de confianza',
    'fork':          'Ramifica la sesión desde un mensaje anterior: /fork <entryId> (ver /tree)',
    'clone':         'Duplica la rama activa en una sesión nueva',
    'copy':          'Muestra el último mensaje de Lyra para copiarlo',
    'export':        'Exporta la sesión a HTML',
    'import':        'Importa una sesión desde un .jsonl del servidor: /import <ruta>',
    'share':         'Sube la sesión como gist privado de GitHub (requiere `gh` instalado y logueado)',
    'reload':        'Reinicia el motor pi — recarga extensiones, skills y prompt templates',
    'hotkeys':       'Lista los atajos de teclado de Lyra',
    'changelog':     'Historial de versiones de Lyra',
    'login':         'Guarda una API key: /login <provider> <key> (ej: /login nvidia nvapi-...)',
    'logout':        'Borra la API key guardada de un provider: /logout <provider>',
    'quit':          'Detiene el motor pi compartido — pide confirmación (afecta TODOS los chats)',
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


def _cargar_scoped() -> list:
    try:
        return json.loads(_RUTA_SCOPED.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []


def _guardar_scoped(favoritos: list):
    _RUTA_SCOPED.parent.mkdir(parents=True, exist_ok=True)
    _RUTA_SCOPED.write_text(json.dumps(favoritos, ensure_ascii=False, indent=1), encoding='utf-8')


def _cargar_auth() -> dict:
    try:
        return json.loads(_RUTA_AUTH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def _guardar_auth(auth: dict):
    # Nunca loguear ni devolver el contenido de este archivo — tiene API keys/tokens reales.
    _RUTA_AUTH.parent.mkdir(parents=True, exist_ok=True)
    _RUTA_AUTH.write_text(json.dumps(auth, ensure_ascii=False, indent=2), encoding='utf-8')
    _RUTA_AUTH.chmod(0o600)


_ENTRADAS_CONFIG = {'label', 'custom', 'model_change', 'thinking_level_change', 'session_info'}


def _texto_de_contenido(contenido) -> str:
    if isinstance(contenido, str):
        return contenido
    if isinstance(contenido, list):
        return ''.join(c.get('text') or '' for c in contenido if isinstance(c, dict) and c.get('type') == 'text')
    return ''


def _nodo_visible(entry: dict, leaf_id) -> bool:
    """Mismo criterio de default filter de pi (tree-selector.js:
    TreeList.applyFilter) — sin esto el árbol se llena de ruido
    (model_change, thinking_level_change, turnos de assistant que
    fueron solo tool-calls sin texto) que pi jamás muestra por default."""
    tipo = entry.get('type')
    if tipo in _ENTRADAS_CONFIG:
        return False
    if tipo == 'message':
        msg = entry.get('message') or {}
        if msg.get('role') == 'assistant' and entry.get('id') != leaf_id:
            texto = _texto_de_contenido(msg.get('content')).strip()
            stop_reason = msg.get('stopReason')
            error_o_abortado = stop_reason not in (None, 'stop', 'toolUse')
            if not texto and not error_o_abortado:
                return False
    return True


def _etiqueta_nodo(entry: dict) -> tuple[str, str]:
    tipo = entry.get('type')
    if tipo == 'message':
        msg = entry.get('message') or {}
        rol = msg.get('role') or '?'
        if rol in ('user', 'assistant'):
            texto = _texto_de_contenido(msg.get('content')).strip().replace('\n', ' ')
            if not texto and rol == 'assistant':
                if msg.get('stopReason') == 'aborted':
                    texto = '(abortado)'
                elif msg.get('errorMessage'):
                    texto = msg['errorMessage']
                else:
                    texto = '(sin contenido)'
            return rol, texto[:200]
        if rol == 'toolResult':
            return 'tool', '[resultado de tool]'
        return rol, ''
    if tipo == 'compaction':
        return 'compaction', '[compactación]'
    if tipo == 'branch_summary':
        return 'branch', entry.get('summary') or ''
    return tipo or '?', ''


def _arbol_a_nodos(nodos: list, leaf_id) -> list:
    """get_tree de pi, aplanado para el modal — replica el filtro y la
    indentación real de pi (tree-selector.js: flattenTree/applyFilter).
    Clave: la indentación SOLO avanza en un punto de branch real (nodo
    con >1 hijo), nunca en cada mensaje — de lo contrario una charla
    lineal sin ramas se ve como una escalera infinita (bug real visto
    en vivo: cada turno se corría 16px más a la derecha que el anterior)."""
    visibles: list = []

    def caminar(nodo, indent, ya_bifurco):
        entry = nodo.get('entry') or {}
        eid = entry.get('id') or ''
        hijos = nodo.get('children') or []
        if _nodo_visible(entry, leaf_id):
            rol, preview = _etiqueta_nodo(entry)
            visibles.append({
                'id': eid, 'rol': rol, 'preview': preview,
                'profundidad': indent, 'actual': eid == leaf_id,
            })
        multiples = len(hijos) > 1
        if multiples:
            indent_hijos = indent + 1
        elif ya_bifurco and indent > 0:
            indent_hijos = indent + 1
        else:
            indent_hijos = indent
        for hijo in hijos:
            caminar(hijo, indent_hijos, multiples)

    for raiz in nodos:
        caminar(raiz, 0, False)
    return visibles


def _leer_parent_session(ruta: pathlib.Path) -> str | None:
    """Primera línea de un .jsonl de pi es el SessionHeader — si tiene
    parentSession, permite reconstruir el linaje al importar."""
    try:
        with ruta.open('r', encoding='utf-8') as f:
            primera = f.readline()
        header = json.loads(primera)
        return header.get('parentSession')
    except (OSError, ValueError, UnicodeDecodeError):
        return None


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
        self._builtin_confirm: asyncio.Future | None = None
        self._error_pendiente: str | None = None

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
            rol = (evt.get('message') or {}).get('role', 'assistant')
            await self.send({'type': 'message_start', 'role': rol})

        elif tipo == 'message_end':
            msg = evt.get('message') or {}
            stop_reason = msg.get('stopReason')
            # role/stopReason viven en evt['message'], no en evt de primer
            # nivel — leerlos mal significaba que un fallo real del proveedor
            # (ej. nvidia devolviendo 410) nunca llegaba a la UI: mensaje
            # vacío, sin error, silencio total (bug real, encontrado en vivo).
            # No se manda todavía: agent_end (que llega después) tiene
            # willRetry — si va a reintentar, este error es solo de UN
            # intento, no del turno; se decide recién ahí.
            if stop_reason == 'error' and msg.get('role') == 'assistant':
                self._error_pendiente = msg.get('errorMessage') or 'Error del proveedor del modelo'
            await self.send({'type': 'message_end', 'role': msg.get('role', 'assistant'),
                             'stop_reason': stop_reason})

        elif tipo == 'agent_start':
            self.inicio.set()
            await self.send({'type': 'agent_start'})

        elif tipo == 'agent_end':
            if evt.get('willRetry'):
                # Este intento falló pero pi YA sabe que va a reintentar
                # (campo real en agent_end, no documentado en rpc.md pero
                # confirmado en vivo) — NO es el final del turno. Cerrarlo
                # acá sería el bug real encontrado: con llama-server caído,
                # el primer intento fallido ya mandaba 'done' vacío mientras
                # pi seguía reintentando en silencio 2 veces más de fondo.
                self._error_pendiente = None  # este intento no cuenta — viene otro
                return
            if self._error_pendiente:
                await self.send({'type': 'error', 'message': self._error_pendiente})
                self._error_pendiente = None
            # fin.set() SIEMPRE debe correr, pase lo que pase con el socket:
            # si el send() de abajo tira (socket muerto — reload, tab cerrada,
            # red cortada) y esto quedara después, _lock_streaming (GLOBAL,
            # compartido por TODO el server) queda tomado para siempre y
            # ningún chat de ningún usuario vuelve a andar hasta reiniciar.
            self.fin.set()
            try:
                await self.send({'type': 'done'})
            except Exception as exc:
                log.warning('no se pudo mandar done (socket muerto?): %s', exc)

        elif tipo == 'queue_update':
            await self.send({'type': 'queue_update',
                             'steering': evt.get('steering') or [],
                             'follow_up': evt.get('followUp') or []})

        elif tipo == 'session_info_changed':
            await self.send({'type': 'session_info', 'session_id': evt.get('sessionId', ''),
                             'session_name': evt.get('sessionName', '')})

        elif tipo == 'thinking_level_changed':
            await self.send({'type': 'thinking_level', 'level': evt.get('level', '')})

        elif tipo == 'extension_ui_request':
            await self._ui_request(evt)

        elif tipo == 'auto_retry_start':
            # Sin esto, un reintento de pi (error transitorio de red/proveedor)
            # pasaba en total silencio — el frontend ni tiene handler para
            # 'auto_retry_start'. Reusa el canal 'token' (ya funciona, visible
            # en la burbuja en vivo) en vez de inventar un evento nuevo.
            intento, maximo = evt.get('attempt'), evt.get('maxAttempts')
            await self.send({'type': 'token', 'content': f'\n🔄 Reintentando ({intento}/{maximo})…\n'})

        elif tipo in ('compaction_start', 'compaction_end', 'auto_retry_end'):
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
        elif metodo == 'setWidget':
            await self.send({'type': 'widget', 'key': evt.get('widgetKey') or '',
                             'lines': evt.get('widgetLines') or None,
                             'placement': evt.get('widgetPlacement') or 'aboveEditor'})

    async def responder_confirm(self, approved: bool):
        if self._builtin_confirm is not None and not self._builtin_confirm.done():
            self._builtin_confirm.set_result(bool(approved))
            return
        if self._confirm_id is None:
            return
        await get_proceso().enviar({'type': 'extension_ui_response', 'id': self._confirm_id,
                                    'confirmed': bool(approved)})
        self._confirm_id = None

    async def _pedir_confirmacion(self, nombre: str, mensaje: str, riesgo: str = 'medium') -> bool:
        """Confirmación propia de un builtin de Aurora (no un diálogo de pi)."""
        fut = asyncio.get_running_loop().create_future()
        self._builtin_confirm = fut
        await self.send({'type': 'confirm_request', 'name': nombre, 'command': mensaje, 'risk': riesgo})
        try:
            return await asyncio.wait_for(fut, 30)
        except asyncio.TimeoutError:
            return False
        finally:
            self._builtin_confirm = None

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

    async def enviar_steer(self, msg: dict):
        """Enter mid-stream: encola el mensaje, pi lo entrega apenas termine
        el turno de tool-calls actual — no interrumpe, no crea otro turno."""
        texto, imagenes = _extraer_contenido(msg.get('message'))
        cmd = {'type': 'steer', 'message': texto}
        if imagenes:
            cmd['images'] = imagenes
        try:
            resp = await get_proceso().pedir(cmd)
            if not resp.get('success'):
                await self.send({'type': 'error', 'message': resp.get('error') or 'no se pudo encolar el mensaje'})
        except Exception as exc:
            await self.send({'type': 'error', 'message': f'error al encolar: {exc}'})

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
            """Comando estático: texto plano + botón Cerrar en el modal.
            Nunca toca historial/DB/contexto — canal separado de 'token'."""
            await self.send({'type': 'command_result', 'command': nombre,
                             'interactive': False, 'data': {'texto': texto}})

        async def responder(data, interactive=False):
            """Comando con datos estructurados (interactivo o no)."""
            await self.send({'type': 'command_result', 'command': nombre,
                             'interactive': interactive, 'data': data})

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
                await avisar('🗜️ Compactando contexto…')
                await proceso.pedir({'type': 'compact'}, timeout=180)
                await avisar('Listo — lo viejo quedó resumido.')

            elif nombre == 'model':
                resp = await proceso.pedir({'type': 'get_available_models'})
                modelos = (resp.get('data') or {}).get('models') or []
                if arg:
                    m = next((m for m in modelos if m.get('id') == arg or arg in str(m.get('id'))), None)
                    if not m:
                        await avisar(f'No encontré el modelo "{arg}"')
                    else:
                        await proceso.pedir({'type': 'set_model', 'provider': m.get('provider'), 'modelId': m.get('id')})
                        await avisar(f"✔ Modelo: {m.get('provider')}/{m.get('id')}")
                else:
                    estado = await proceso.pedir({'type': 'get_state'})
                    actual = ((estado.get('data') or {}).get('model') or {}).get('id')
                    favoritos = set(_cargar_scoped())
                    await responder({
                        'actual': actual,
                        'modelos': [
                            {'id': m.get('id'), 'provider': m.get('provider'),
                             'favorito': m.get('id') in favoritos}
                            for m in modelos
                        ],
                    }, interactive=True)

            elif nombre == 'settings':
                niveles = ('off', 'minimal', 'low', 'medium', 'high', 'xhigh')
                if arg and arg not in niveles:
                    await avisar(f'Uso: /settings {"|".join(niveles)}')
                elif arg:
                    await proceso.pedir({'type': 'set_thinking_level', 'level': arg})
                    await avisar(f'✔ Thinking: {arg}')
                else:
                    estado = await proceso.pedir({'type': 'get_state'})
                    actual = (estado.get('data') or {}).get('thinkingLevel')
                    await responder({'thinkingActual': actual, 'niveles': list(niveles)}, interactive=True)

            elif nombre == 'name':
                if not arg:
                    await avisar('Uso: /name <nombre>')
                else:
                    await proceso.pedir({'type': 'set_session_name', 'name': arg})
                    await avisar(f'✔ Sesión: "{arg}"')

            elif nombre == 'session':
                resp = await proceso.pedir({'type': 'get_session_stats'})
                data = resp.get('data') or {}
                # get_session_stats trae 'tokens' y 'contextUsage' como dicts
                # anidados (agent-session.js:getSessionStats) — filtrarlos por
                # isinstance(v, dict) los descartaba enteros, perdiendo tokens
                # y costo que el /session real de pi siempre muestra.
                lineas = []
                for k, v in data.items():
                    if isinstance(v, dict):
                        lineas.append(f'{k}: ' + ', '.join(f'{kk}={vv}' for kk, vv in v.items()))
                    elif not isinstance(v, list):
                        lineas.append(f'{k}: {v}')
                await avisar('Sesión pi:\n' + '\n'.join(lineas[:16]))

            elif nombre == 'export':
                resp = await proceso.pedir({'type': 'export_html'}, timeout=60)
                data = resp.get('data') or {}
                ruta = data.get('path') or data.get('file') or json.dumps(data)[:200]
                await avisar(f'📄 Exportado: {ruta}')

            elif nombre == 'scoped-models':
                sub, _, resto = arg.partition(' ')
                favoritos = _cargar_scoped()
                if sub == 'add' and resto.strip():
                    if resto.strip() not in favoritos:
                        favoritos.append(resto.strip())
                        _guardar_scoped(favoritos)
                elif sub == 'remove' and resto.strip():
                    favoritos = [m for m in favoritos if m != resto.strip()]
                    _guardar_scoped(favoritos)
                resp = await proceso.pedir({'type': 'get_available_models'})
                todos = (resp.get('data') or {}).get('models') or []
                await responder({
                    'favoritos': favoritos,
                    'todos': [{'id': m.get('id'), 'provider': m.get('provider')} for m in todos],
                }, interactive=True)

            elif nombre == 'resume':
                await avisar('📂 Abrí el historial de chats en la barra lateral para retomar cualquier sesión anterior.')

            elif nombre == 'tree':
                resp = await proceso.pedir({'type': 'get_tree'})
                data = resp.get('data') or {}
                nodos = _arbol_a_nodos(data.get('tree') or [], data.get('leafId'))
                await responder({'nodos': nodos[:200], 'leafId': data.get('leafId')}, interactive=True)

            elif nombre == 'trust':
                await avisar('✔ El workspace de Aurora es fijo y ya es de confianza — no hace falta nada más.')

            elif nombre == 'fork':
                if not arg:
                    await avisar('Uso: /fork <entryId> — mirá los ids con /tree')
                else:
                    resp = await proceso.pedir({'type': 'fork', 'entryId': arg})
                    data = resp.get('data') or {}
                    if not resp.get('success'):
                        await avisar(f'Error: {resp.get("error") or "no se pudo ramificar"}')
                    else:
                        estado = await proceso.pedir({'type': 'get_state'})
                        ruta = (estado.get('data') or {}).get('sessionFile')
                        await responder({
                            'sessionPath': ruta,
                            'parentChatId': chat_id,
                            'texto': f'🌿 Ramificado desde: "{str(data.get("text") or "")[:80]}"',
                        })

            elif nombre == 'clone':
                resp = await proceso.pedir({'type': 'clone'})
                if not resp.get('success'):
                    await avisar(f'Error: {resp.get("error") or "no se pudo clonar"}')
                else:
                    estado = await proceso.pedir({'type': 'get_state'})
                    ruta = (estado.get('data') or {}).get('sessionFile')
                    await responder({
                        'sessionPath': ruta,
                        'parentChatId': chat_id,
                        'texto': '✔ Rama activa duplicada en una sesión nueva.',
                    })

            elif nombre == 'copy':
                resp = await proceso.pedir({'type': 'get_last_assistant_text'})
                texto_ult = (resp.get('data') or {}).get('text') or ''
                if not texto_ult:
                    await avisar('(sin mensajes de Lyra todavía)')
                else:
                    await avisar(f'📋 Seleccioná para copiar:\n\n{texto_ult}')

            elif nombre == 'import':
                if not arg:
                    await avisar('Uso: /import <ruta .jsonl>')
                else:
                    origen = pathlib.Path(arg).expanduser()
                    if not origen.exists():
                        await avisar(f'No existe: {origen}')
                    else:
                        parent_session = _leer_parent_session(origen)
                        destino = pathlib.Path(config.SESSION_DIR) / f'imported-{int(time.time())}-{origen.name}'
                        shutil.copy(origen, destino)
                        resp = await proceso.pedir({'type': 'switch_session', 'sessionPath': str(destino)})
                        if not resp.get('success'):
                            await avisar(f'Error al cargar: {resp.get("error")}')
                        else:
                            parent_chat_id = None
                            if parent_session:
                                mapa = _cargar_mapa()
                                for cid, ruta in mapa.items():
                                    if ruta == parent_session:
                                        parent_chat_id = int(cid) if cid.lstrip('-').isdigit() else cid
                                        break
                            await responder({
                                'sessionPath': str(destino),
                                'parentChatId': parent_chat_id,
                                'texto': f'✔ Sesión importada y cargada: {origen.name}',
                            })

            elif nombre == 'share':
                if not shutil.which('gh'):
                    await avisar('`gh` no está instalado — instalalo y logueate (`gh auth login`) para usar /share.')
                else:
                    resp = await proceso.pedir({'type': 'export_html'}, timeout=60)
                    ruta = (resp.get('data') or {}).get('path')
                    if not ruta:
                        await avisar('No se pudo exportar la sesión.')
                    else:
                        proc = await asyncio.create_subprocess_exec(
                            'gh', 'gist', 'create', ruta, '--private',
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                        )
                        salida, error = await proc.communicate()
                        if proc.returncode == 0:
                            await avisar(f'🔗 {salida.decode().strip()}')
                        else:
                            await avisar(f'Error de gh: {error.decode().strip()[:300]}')

            elif nombre == 'reload':
                chat_actual = _cargar_mapa().get(str(chat_id)) if chat_id is not None else None
                await proceso.parar()
                await proceso.ensure()
                if chat_actual and pathlib.Path(chat_actual).exists():
                    await proceso.pedir({'type': 'switch_session', 'sessionPath': chat_actual})
                await avisar('Listo — extensiones, skills y prompt templates recargados.')

            elif nombre == 'hotkeys':
                await avisar(
                    'Atajos de Lyra:\n'
                    'Enter — enviar · Shift+Enter — nueva línea\n'
                    '/ — abre comandos (↑↓ navega, Tab/Enter completa, Esc cierra)\n'
                    'botón [ / ] — mismo menú de comandos'
                )

            elif nombre == 'changelog':
                await avisar(
                    'Lyra — historial reciente:\n'
                    '- Motor: pi harness vía RPC (gemita retirado)\n'
                    '- Streaming fiel a pi: sin efecto de tipeo falso\n'
                    '- Tool calls y resultados en orden cronológico real\n'
                    '- Comandos "/" con paridad completa contra pi CLI\n'
                    '- Config/sesión en overlay propio, ya no ensucia el chat'
                )

            elif nombre == 'login':
                provider, _, key = arg.partition(' ')
                if not provider or not key.strip():
                    await avisar('Uso: /login <provider> <key>')
                else:
                    auth = _cargar_auth()
                    auth[provider] = {'type': 'api_key', 'key': key.strip()}
                    _guardar_auth(auth)
                    await avisar(f'✔ API key guardada para {provider}')

            elif nombre == 'logout':
                if not arg:
                    await avisar('Uso: /logout <provider>')
                else:
                    auth = _cargar_auth()
                    if auth.pop(arg, None) is None:
                        await avisar(f'No había credencial guardada para {arg}')
                    else:
                        _guardar_auth(auth)
                        await avisar(f'✔ Credencial de {arg} borrada')

            elif nombre == 'quit':
                ok = await self._pedir_confirmacion(
                    'Detener motor pi',
                    'Esto detiene el motor pi COMPARTIDO — corta todos los chats activos ahora mismo. ¿Confirmás?',
                    riesgo='high',
                )
                if ok:
                    await proceso.parar()
                    await avisar('Motor detenido. El próximo mensaje (de cualquier chat) lo vuelve a levantar.')
                else:
                    await avisar('Cancelado.')

        except Exception as exc:
            await avisar(f'Error en /{nombre}: {exc}')

    async def vincular_sesion_actual(self, chat_id):
        """Después de crear un chat Aurora nuevo (fork/clone/import), lo
        mapea a la sesión pi que quedó activa — sin llamar new_session."""
        global _sesion_cargada
        proceso = get_proceso()
        estado = await proceso.pedir({'type': 'get_state'})
        ruta = (estado.get('data') or {}).get('sessionFile')
        if ruta:
            mapa = _cargar_mapa()
            mapa[str(chat_id)] = ruta
            _guardar_mapa(mapa)
            _sesion_cargada = (proceso.generacion, str(chat_id))

    async def manejar_cycle_model(self):
        """Alt+M: cicla /scoped-models si hay favoritos guardados; si no, cicla
        entre todos los disponibles (cycle_model nativo — pi no expone RPC
        para ciclar un subconjunto, así que el subconjunto lo maneja Aurora)."""
        global _modelo_fijado
        proceso = get_proceso()
        try:
            favoritos = _cargar_scoped()
            if favoritos:
                estado = await proceso.pedir({'type': 'get_state'})
                actual = ((estado.get('data') or {}).get('model') or {}).get('id')
                resp = await proceso.pedir({'type': 'get_available_models'})
                modelos = {m.get('id'): m for m in (resp.get('data') or {}).get('models') or []}
                try:
                    idx = favoritos.index(actual)
                except ValueError:
                    idx = -1
                siguiente_id = favoritos[(idx + 1) % len(favoritos)]
                m = modelos.get(siguiente_id)
                if not m:
                    await self.send({'type': 'cycle_model_error', 'message': f'Favorito "{siguiente_id}" ya no está disponible'})
                    return
                await proceso.pedir({'type': 'set_model', 'provider': m.get('provider'), 'modelId': m.get('id')})
                # _fijar_modelo cachea por chat_id — si no se actualiza acá, el
                # próximo chat con el mismo model_id de antes no lo vuelve a fijar.
                _modelo_fijado = m.get('id')
                await self.send({'type': 'model_cycled', 'model': {'id': m.get('id'), 'provider': m.get('provider')}})
            else:
                resp = await proceso.pedir({'type': 'cycle_model'})
                data = resp.get('data') or {}
                modelo = data.get('model') if isinstance(data, dict) and 'model' in data else data
                if not modelo:
                    await self.send({'type': 'cycle_model_error', 'message': 'Un solo modelo disponible — nada para ciclar'})
                    return
                _modelo_fijado = modelo.get('id')
                await self.send({'type': 'model_cycled', 'model': {'id': modelo.get('id'), 'provider': modelo.get('provider')}})
        except Exception as exc:
            await self.send({'type': 'cycle_model_error', 'message': f'cycle_model: {exc}'})

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
