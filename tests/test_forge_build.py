"""Ciclo asíncrono Lyra → bus → navegador → Tool Forge."""

import asyncio
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tools import forge_build


async def main():
    emitted = []

    async def fake_emit(uid, event, payload):
        emitted.append((uid, event, payload))

    original_emit = forge_build.emitir
    original_timeout = forge_build.TIMEOUT_S
    forge_build.emitir = fake_emit
    try:
        invalid = await forge_build.forge_build({"objective": "corto"}, {"usuario_id": 7})
        assert not invalid["ok"] and not emitted
        anonymous = await forge_build.forge_build(
            {"objective": "Construir una herramienta verificable"}, {},
        )
        assert not anonymous["ok"] and not emitted

        task = asyncio.create_task(forge_build.forge_build({
            "objective": "Contar palabras y líneas con soporte Unicode",
            "name_hint": "forge.word_count",
            "requirements": ["sin red"],
            "acceptance_tests": ["texto vacío", "acentos"],
        }, {"usuario_id": 7}))
        await asyncio.sleep(0)
        assert len(emitted) == 1
        uid, event, payload = emitted[0]
        assert uid == 7 and event == "forge_build"
        req_id = payload["reqId"]
        assert req_id in forge_build._PENDIENTES
        forge_build._PENDIENTES[req_id].set_result({
            "ok": True, "text": "probada", "package": {"name": "forge.word_count"},
        })
        result = await task
        assert result["ok"] and result["package"]["name"] == "forge.word_count"
        assert req_id not in forge_build._PENDIENTES

        forge_build.TIMEOUT_S = 0.01
        timed = await forge_build.forge_build(
            {"objective": "Esperar una respuesta que nunca llegará"}, {"usuario_id": 7},
        )
        assert not timed["ok"] and timed["reason"] == "timeout"
        assert not forge_build._PENDIENTES
        print("OK — Forge build: validación, relay, respuesta, cleanup y timeout")
    finally:
        forge_build.emitir = original_emit
        forge_build.TIMEOUT_S = original_timeout


asyncio.run(main())
