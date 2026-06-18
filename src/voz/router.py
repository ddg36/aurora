# ══════════════════════════════════════════════════════
#  VOZ ROUTER — STT y TTS server-side
#  STT: faster-whisper (CPU). El browser manda webm/ogg del
#  MediaRecorder; ffmpeg lo convierte a wav 16k mono.
#  TTS: edge-tts → mp3.
# ══════════════════════════════════════════════════════

import asyncio
import logging
import os
import tempfile

from litestar import post, get
from litestar.enums import RequestEncodingType
from litestar.params import Body
from litestar.datastructures import UploadFile
from litestar.response import Response
from litestar.exceptions import HTTPException

log = logging.getLogger("aurora.voz")

WHISPER_MODEL = os.environ.get("AURORA_WHISPER_MODEL", "small")
VOZ_DEFAULT = "es-MX-DaliaNeural"

VOCES = [
    {"id": "es-MX-DaliaNeural", "nombre": "Dalia (es-MX)"},
    {"id": "es-MX-JorgeNeural", "nombre": "Jorge (es-MX)"},
    {"id": "es-ES-ElviraNeural", "nombre": "Elvira (es-ES)"},
    {"id": "es-AR-ElenaNeural", "nombre": "Elena (es-AR)"},
    {"id": "en-US-AriaNeural", "nombre": "Aria (en-US)"},
]

_modelo = None
_modelo_lock = asyncio.Lock()


async def _get_modelo():
    global _modelo
    if _modelo is not None:
        return _modelo
    async with _modelo_lock:
        if _modelo is None:
            from faster_whisper import WhisperModel
            log.info("cargando faster-whisper '%s' (cpu)…", WHISPER_MODEL)
            loop = asyncio.get_event_loop()
            _modelo = await loop.run_in_executor(
                None,
                lambda: WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8"),
            )
            log.info("faster-whisper listo")
    return _modelo


async def _a_wav16k(data: bytes) -> str:
    src = tempfile.NamedTemporaryFile(suffix=".audio", delete=False)
    src.write(data)
    src.close()
    dst = src.name + ".wav"
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", src.name, "-ar", "16000", "-ac", "1", dst,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    os.unlink(src.name)
    if proc.returncode != 0 or not os.path.exists(dst):
        raise HTTPException(status_code=422, detail="ffmpeg no pudo convertir el audio")
    return dst


@post("/voz/stt")
async def stt(
    data: UploadFile = Body(media_type=RequestEncodingType.MULTI_PART),
) -> dict:
    raw = await data.read()
    if not raw:
        raise HTTPException(status_code=400, detail="audio vacío")

    wav = await _a_wav16k(raw)
    try:
        modelo = await _get_modelo()
        loop = asyncio.get_event_loop()

        def _transcribir():
            segments, info = modelo.transcribe(wav, vad_filter=True)
            texto = " ".join(s.text.strip() for s in segments).strip()
            return texto, info.language

        texto, idioma = await loop.run_in_executor(None, _transcribir)
    finally:
        os.unlink(wav)

    return {"text": texto, "language": idioma}


@post("/voz/tts")
async def tts(data: dict) -> Response:
    texto = (data.get("text") or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="text vacío")
    voz = data.get("voice") or VOZ_DEFAULT

    import edge_tts
    out = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    out.close()
    try:
        await edge_tts.Communicate(texto, voz).save(out.name)
        audio = open(out.name, "rb").read()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edge-tts falló: {exc}")
    finally:
        if os.path.exists(out.name):
            os.unlink(out.name)

    return Response(content=audio, media_type="audio/mpeg")


@get("/voz/voces")
async def voces() -> dict:
    return {"voces": VOCES, "default": VOZ_DEFAULT, "whisper_model": WHISPER_MODEL}


VOZ_ROUTES = [stt, tts, voces]
