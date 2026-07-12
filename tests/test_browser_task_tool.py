"""Test de browser_task en el registry: registro, validación de args,
degradación limpia sin browser-use. No lanza browser real.

Correr: .venv-linux/bin/python3 tests/test_browser_task_tool.py
"""

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

from tools import browser_task as bt
from tools.registry import get_tool, run_tool


async def main():
    tool = get_tool("browser_task")
    assert tool is not None, "browser_task no registrada"
    assert tool.risk == "high"
    assert "objective" in tool.input_schema["required"]

    # sin objetivo → error claro, sin importar browser_use
    r = await run_tool("browser_task", {}, {"kind": "internal", "usuario_id": 1})
    assert r["ok"] is False and "objective" in r["error"]

    # caller externo bloqueado por riesgo (gate del registry)
    r = await run_tool("browser_task", {"objective": "x"}, {"kind": "external"})
    assert r.get("blocked") is True

    # sin browser-use instalado → error instructivo, no excepción
    bt.browser_use_disponible = lambda: False
    r = await run_tool("browser_task", {"objective": "abrir example.com"},
                       {"kind": "internal", "usuario_id": 1})
    assert r["ok"] is False and "browser-use" in r["error"]

    # control human-in-the-loop: sin agente → error; con agente → pause/resume/abort
    class FakeAgent:
        llamadas = []
        def pause(self): self.llamadas.append("pause")
        def resume(self): self.llamadas.append("resume")
        def stop(self): self.llamadas.append("stop")

    assert bt.controlar(1, "pause")["ok"] is False  # nada corriendo
    bt._ACTIVOS[1] = FakeAgent()
    assert bt.controlar(1, "pause")["ok"] is True
    assert bt.controlar(1, "resume")["ok"] is True
    assert bt.controlar(1, "abort")["ok"] is True
    assert bt.controlar(1, "explotar")["ok"] is False
    assert FakeAgent.llamadas == ["pause", "resume", "stop"]
    assert bt.controlar(2, "pause")["ok"] is False  # otro usuario no controla mi agente
    bt._ACTIVOS.clear()

    print("OK — browser_task: registro, validación, gate externo, degradación, control HITL")


asyncio.run(main())
