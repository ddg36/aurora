"""Regresión: 3 casos donde bridge.py se quedaba callado sobre el resultado
real de pi, encontrados al revisar /compact a fondo ("puro teatro" — ver
commit f4b6b5f, este archivo cubre lo que vino después):

1. compaction_end sólo reenviaba 'reason' — un auto-compact fallido
   (dispara solo cuando el contexto crece mucho, reason='auto') desaparecía
   en silencio total, mismo bug que /compact pero para el disparo
   automático. Ahora reenvía result/error/aborted completos.
2. message_end no incluía tokens/velocidad — bonus pedido explícitamente
   (no es algo que pi mismo muestre en su UI, footer.js no trackea
   timing; es un agregado propio de Aurora usando lo que pi ya manda).
3. agent_end no disparaba ningún conteo de tokens de sesión — pi real
   tiene esto en su footer (↑input ↓output, costo, %contexto); Aurora
   ahora lo pide vía get_session_stats tras cada turno.

Correr: .venv-linux/bin/python3 tests/pi/test_stats_y_compactacion.py
"""

import asyncio
import json
import pathlib
import sys
import tempfile
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src"))

from pi import bridge as B
from pi.proceso import PiProceso

FAKE = str(pathlib.Path(__file__).parent / "fake_pi.py")


class FakeSocket:
    def __init__(self):
        self.enviados = []

    async def send_text(self, texto):
        self.enviados.append(json.loads(texto))


async def main():
    # ── compaction_end reenvía result/error/aborted completos ──
    sock = FakeSocket()
    br = B.PiBridge(sock)

    await br.evento_pi({
        "type": "compaction_end", "reason": "auto", "aborted": False,
        "result": {"summary": "resumen", "tokensBefore": 9000, "estimatedTokensAfter": 1200},
    })
    evt = sock.enviados[-1]
    assert evt["type"] == "compaction_end" and evt["reason"] == "auto", evt
    assert evt["tokens_before"] == 9000 and evt["tokens_after"] == 1200, evt
    assert evt["summary"] == "resumen" and not evt["aborted"] and evt["error"] is None, evt

    sock.enviados.clear()
    await br.evento_pi({
        "type": "compaction_end", "reason": "auto", "aborted": False,
        "errorMessage": "Compaction failed: 500 del proveedor",
    })
    evt = sock.enviados[-1]
    assert evt["error"] == "Compaction failed: 500 del proveedor", evt
    assert evt["tokens_before"] is None, evt

    # ── message_end incluye usage + tokens_per_sec cuando hay tiempo real ──
    sock2 = FakeSocket()
    br2 = B.PiBridge(sock2)
    await br2.evento_pi({"type": "message_start", "message": {"role": "assistant"}})
    await asyncio.sleep(0.2)
    await br2.evento_pi({
        "type": "message_end",
        "message": {"role": "assistant", "stopReason": "stop",
                     "usage": {"input": 50, "output": 100, "cacheRead": 0, "cacheWrite": 0}},
    })
    evt2 = sock2.enviados[-1]
    assert evt2["type"] == "message_end", evt2
    assert evt2["usage"] == {"input": 50, "output": 100, "cache_read": 0, "cache_write": 0}, evt2
    # ~0.2s medidos, 100 tokens de output -> del orden de 300-700 tok/s (no exacto, es timing real)
    assert 0 < evt2["tokens_per_sec"] < 2000, evt2

    # Sin usage.output (ej. turno sólo con tool calls, sin texto) no debe
    # inventar un tokens_per_sec de la nada.
    sock3 = FakeSocket()
    br3 = B.PiBridge(sock3)
    await br3.evento_pi({"type": "message_start", "message": {"role": "assistant"}})
    await br3.evento_pi({
        "type": "message_end",
        "message": {"role": "assistant", "stopReason": "toolUse",
                     "usage": {"input": 50, "output": 0, "cacheRead": 0, "cacheWrite": 0}},
    })
    evt3 = sock3.enviados[-1]
    assert "tokens_per_sec" not in evt3, evt3

    # ── agent_end dispara get_session_stats real y manda 'session_stats' ──
    B._RUTA_MAPA = pathlib.Path(tempfile.mkdtemp()) / "aurora-map.json"
    proceso = PiProceso(on_event=B._on_event, argv=[sys.executable, FAKE])
    B._proceso = proceso

    sock4 = FakeSocket()
    br4 = B.PiBridge(sock4)
    await br4.manejar_chat({"type": "chat", "message": "hola", "chat_id": None, "system": ""})
    # session_stats corre en su propia task (asyncio.create_task) para no
    # deadlockear el loop lector de stdout consigo mismo (ver comentario en
    # agent_end) — hay que darle una vuelta de loop para que corra.
    for _ in range(20):
        if any(m["type"] == "session_stats" for m in sock4.enviados):
            break
        await asyncio.sleep(0.05)
    stats_evt = [m for m in sock4.enviados if m["type"] == "session_stats"]
    assert stats_evt, sock4.enviados
    assert stats_evt[-1]["stats"]["tokens"]["input"] == 100, stats_evt
    # Regresión: el bridge normaliza contextUsage al shape que el frontend
    # espera (percent + contextWindow), sin importar las claves de pi real.
    ctx = stats_evt[-1]["stats"]["contextUsage"]
    assert ctx and ctx["percent"] == 7.4 and ctx["contextWindow"] == 200000, ctx

    # Caso 2: get_session_stats sin contextUsage (proveedor no lo expone)
    # → el bridge pone contextUsage: None sin crash.
    pedir_original_stats = proceso.pedir
    async def pedir_sin_ctx(cmd, *a, **kw):
        if cmd.get("type") == "get_session_stats":
            r = await pedir_original_stats(cmd, *a, **kw)
            if r.get("success") and isinstance(r.get("data"), dict):
                r = dict(r)
                r["data"] = {k: v for k, v in r["data"].items() if k != "contextUsage"}
            return r
        return await pedir_original_stats(cmd, *a, **kw)
    proceso.pedir = pedir_sin_ctx
    prev_count = len([m for m in sock4.enviados if m["type"] == "session_stats"])
    await br4.manejar_chat({"type": "chat", "message": "otro turno sin ctx", "chat_id": None, "system": ""})
    for _ in range(40):
        nuevo_stats = [m for m in sock4.enviados if m["type"] == "session_stats"]
        if len(nuevo_stats) > prev_count:
            break
        await asyncio.sleep(0.05)
    nuevo_evt = [m for m in sock4.enviados if m["type"] == "session_stats"][-1:]
    assert nuevo_evt, "session_stats nuevo nunca llegó"
    ctx_sin = nuevo_evt[-1]["stats"].get("contextUsage")
    assert ctx_sin is None, ctx_sin
    proceso.pedir = pedir_original_stats

    if B._proceso is not None and B._proceso.vivo:
        await B._proceso.parar()

    print("OK — compaction_end/message_end/session_stats mandan el resultado real, no teatro")


asyncio.run(main())
