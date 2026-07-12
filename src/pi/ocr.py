# ══════════════════════════════════════════════════════
#  OCR vía pi — PROCESO DEDICADO, separado del que usa el chat de Lyra.
#  pi solo mantiene un modelo/sesión activa por proceso, así que un OCR
#  puntual por el mismo proceso de Lyra pisaría lo que el usuario tiene
#  abierto en su chat. Este proceso corre en paralelo, con su propia
#  sesión descartable (new_session por llamada, sin historial).
# ══════════════════════════════════════════════════════

import asyncio
import logging

from . import config
from .proceso import PiProceso

log = logging.getLogger('aurora.pi.ocr')

_PROMPT_OCR = ('Extraé TODO el texto visible en esta imagen. '
               'Devolvé solo el texto, sin comentarios ni descripciones.')

_proceso: PiProceso | None = None
_lock = asyncio.Lock()


class _ColectorTurno:
    def __init__(self):
        self.texto = []
        self.error = None
        self.fin = asyncio.Event()

    async def on_event(self, evt: dict):
        tipo = evt.get('type')
        if tipo == 'message_update':
            delta = evt.get('assistantMessageEvent') or {}
            if delta.get('type') == 'text_delta':
                self.texto.append(delta.get('delta') or '')
        elif tipo == 'message_end':
            msg = evt.get('message') or {}
            if msg.get('stopReason') == 'error' and msg.get('role') == 'assistant':
                self.error = msg.get('errorMessage') or 'Error del proveedor del modelo'
        elif tipo == 'agent_end':
            if evt.get('willRetry'):
                # intento fallido, pi va a reintentar — no es el final real
                # (mismo caso que bridge.py:_on_event con el chat de Lyra).
                self.error = None
                return
            self.fin.set()


def _get_proceso() -> PiProceso:
    global _proceso
    if _proceso is None:
        _proceso = PiProceso(cwd=config.CWD)
    return _proceso


async def _fijar_modelo_vision(proceso: PiProceso) -> str:
    """new_session no garantiza que el modelo previo persista (a diferencia
    de switch_session, que lo reconstruye desde el historial) — se chequea
    en cada llamada; es barato, mismo proceso ya vivo."""
    estado = await proceso.pedir({'type': 'get_state'})
    actual = ((estado.get('data') or {}).get('model') or {}).get('id')
    resp = await proceso.pedir({'type': 'get_available_models'})
    modelos = (resp.get('data') or {}).get('models') or []
    if actual and any(m.get('id') == actual and 'image' in (m.get('input') or []) for m in modelos):
        return actual
    candidato = next((m for m in modelos if 'image' in (m.get('input') or [])), None)
    if not candidato:
        raise RuntimeError('Ningún modelo disponible en pi soporta imágenes')
    resp_set = await proceso.pedir({'type': 'set_model', 'provider': candidato.get('provider'),
                                     'modelId': candidato.get('id')})
    if not resp_set.get('success'):
        raise RuntimeError(f"no se pudo fijar modelo de visión: {resp_set.get('error')}")
    return candidato.get('id')


async def extraer_texto(imagen_b64: str, mime_type: str = 'image/png', timeout_s: float = 60) -> tuple[str, str]:
    """Devuelve (texto, modelo_id). Lanza RuntimeError si falla."""
    async with _lock:
        proceso = _get_proceso()
        await proceso.ensure()
        await proceso.pedir({'type': 'new_session'})
        modelo_id = await _fijar_modelo_vision(proceso)

        colector = _ColectorTurno()
        proceso.on_event = colector.on_event
        try:
            resp = await proceso.pedir({
                'type': 'prompt',
                'message': _PROMPT_OCR,
                'images': [{'type': 'image', 'data': imagen_b64, 'mimeType': mime_type}],
            })
            if not resp.get('success'):
                raise RuntimeError(resp.get('error') or 'pi rechazó el prompt de OCR')
            await asyncio.wait_for(colector.fin.wait(), timeout=timeout_s)
        finally:
            proceso.on_event = None

        if colector.error:
            raise RuntimeError(colector.error)
        return ''.join(colector.texto).strip(), modelo_id
