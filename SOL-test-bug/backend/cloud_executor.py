# ══════════════════════════════════════════════════════
#  CLOUD EXECUTOR — segundo proceso pi dedicado a ejecutar las tools que
#  pide el LLM de la NUBE. Aislado del pi del chat de Lyra: su propia sesión
#  y memoria. El "engaño": pi cree que es una tarea normal suya; en realidad
#  la pidió el LLM de la nube (Gemini/ChatGPT en el iframe).
#
#  Corre headless (sin WebSocket): manda un prompt, junta los tool_result y
#  el texto final, y devuelve cuando el turno termina (agent_end).
# ══════════════════════════════════════════════════════

import asyncio
import logging

from .proceso import PiProceso
from .bridge import _texto_resultado

log = logging.getLogger('aurora.pi.cloud')

_ejecutor: 'CloudExecutor | None' = None


class CloudExecutor:
    def __init__(self):
        # Proceso pi propio SIN extensiones: solo los tools core (bash, read,
        # write, edit). aurora-tools interactúa con tabs de Chrome y rompía el
        # iframe de Gemini tras cada ejecución (el askCloud siguiente colgaba).
        # El ejecutor no necesita esas tools — solo las del harness.
        argv = PiProceso._argv_default() + ['--no-extensions']
        self.proc = PiProceso(on_event=self._on_event, argv=argv)
        self._fin = asyncio.Event()
        self._tools: list[dict] = []
        self._texto: list[str] = []
        self._lock = asyncio.Lock()   # un turno a la vez en este ejecutor
        self._sesion_lista = False

    async def _on_event(self, evt: dict):
        tipo = evt.get('type')
        if tipo == 'tool_execution_end':
            self._tools.append({
                'name': evt.get('toolName') or '',
                'output': _texto_resultado(evt.get('result')),
                'is_error': bool(evt.get('isError')),
            })
        elif tipo == 'message_update':
            d = evt.get('assistantMessageEvent') or {}
            if d.get('type') == 'text_delta':
                self._texto.append(d.get('delta') or '')
        elif tipo == 'agent_end':
            self._fin.set()
        elif tipo == 'extension_ui_request':
            # pi pide confirmación (ej: bash/write) o un diálogo. Este ejecutor
            # es HEADLESS — sin nadie que confirme, pi se cuelga y queda
            # "already processing" para siempre. Auto-respondemos: aprobar
            # confirmaciones, cancelar el resto. SOLO acá (nube), el pi de Lyra
            # ni se entera. ponytail: auto-approve de bash desde la nube es un
            # riesgo; gatear por tool si algún día importa.
            metodo = evt.get('method')
            if metodo == 'confirm':
                await self.proc.enviar({'type': 'extension_ui_response', 'id': evt.get('id'), 'confirmed': True})
            elif metodo in ('select', 'input', 'editor'):
                await self.proc.enviar({'type': 'extension_ui_response', 'id': evt.get('id'), 'cancelled': True})

    async def ejecutar(self, instruccion: str, timeout: float = 120) -> dict:
        """Corre `instruccion` en el pi ejecutor y devuelve tools + texto."""
        async with self._lock:
            await self.proc.ensure()
            if not self._sesion_lista:
                # Sesión limpia y dedicada — memoria propia, aparte de Lyra.
                await self.proc.pedir({'type': 'new_session'})
                self._sesion_lista = True
            self._tools = []
            self._texto = []
            self._fin.clear()
            resp = await self.proc.pedir({'type': 'prompt', 'message': instruccion})
            # Recuperación: si un turno anterior quedó colgado, pi rechaza con
            # "already processing". Abortamos y reintentamos una vez.
            if not resp.get('success') and 'already processing' in str(resp.get('error', '')).lower():
                try:
                    await self.proc.pedir({'type': 'abort'}, timeout=10)
                except Exception:
                    pass
                await asyncio.sleep(0.5)
                self._fin.clear()
                resp = await self.proc.pedir({'type': 'prompt', 'message': instruccion})
            if not resp.get('success'):
                return {'ok': False, 'error': resp.get('error') or 'pi rechazó el prompt', 'tools': [], 'texto': ''}
            try:
                await asyncio.wait_for(self._fin.wait(), timeout)
            except asyncio.TimeoutError:
                return {'ok': False, 'error': 'timeout esperando a pi', 'tools': self._tools, 'texto': ''.join(self._texto)}
            return {'ok': True, 'tools': self._tools, 'texto': ''.join(self._texto).strip()}


def get_ejecutor() -> CloudExecutor:
    global _ejecutor
    if _ejecutor is None:
        _ejecutor = CloudExecutor()
    return _ejecutor
