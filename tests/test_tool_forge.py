"""Tool Forge: sandbox, approval, activación, upgrade y rollback.

Correr: .venv-linux/bin/python3 tests/test_tool_forge.py
"""

import asyncio
import os
import pathlib
import shutil
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
FORGE_TMP = pathlib.Path(tempfile.mkdtemp(prefix="aurora-tool-forge-test-"))
os.environ["AURORA_TOOL_FORGE_DIR"] = str(FORGE_TMP)

from tools import forge
from tools.registry import get_tool, run_tool


CODE = """import json, sys
args = json.load(sys.stdin)
prefix = {prefix!r}
print(json.dumps({{"ok": True, "text": prefix + args["text"].upper()}}))
"""


def manifest(version="1.0.0", prefix=""):
    return {
        "name": "forge.test_upper",
        "version": version,
        "description": "Convierte texto a mayúsculas para probar Tool Forge.",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        "permissions": [],
        "tests": [{
            "name": "uppercase",
            "input": {"text": "hola"},
            "expect": {"ok": True, "text": prefix + "HOLA"},
        }],
        "docs": "Recibe text y devuelve text en mayúsculas.",
    }


async def main():
    try:
        # Draft inmutable y no aprobable sin evidencia.
        draft = await forge.create_draft(manifest(), CODE.format(prefix=""))
        assert draft["status"] == "draft"
        try:
            await forge.create_draft(manifest(), CODE.format(prefix=""))
            raise AssertionError("aceptó una versión duplicada")
        except forge.ForgeError as exc:
            assert "inmutables" in str(exc)
        try:
            await forge.approve_package("forge.test_upper", "1.0.0", "forge.test_upper@1.0.0", 1)
            raise AssertionError("aprobó sin tests")
        except forge.ForgeError as exc:
            assert "tests" in str(exc)

        report = await forge.test_package("forge.test_upper", "1.0.0")
        assert report["passed"] and report["total"] == 1, report

        # Los agentes usan `args` en tool calls; Forge lo normaliza a `input`.
        args_manifest = manifest("1.1.0")
        args_manifest["tests"] = [{
            "name": "empty-string-is-present",
            "args": {"text": ""},
            "expect": {"ok": True, "text": ""},
        }]
        args_draft = await forge.create_draft(args_manifest, CODE.format(prefix=""))
        assert args_draft["tests"][0]["input"] == {"text": ""}
        assert "args" not in args_draft["tests"][0]
        assert (await forge.test_package("forge.test_upper", "1.1.0"))["passed"]
        try:
            await forge.approve_package("forge.test_upper", "1.0.0", "sí", 1)
            raise AssertionError("aprobó sin confirmación exacta")
        except forge.ForgeError as exc:
            assert "exactamente" in str(exc)

        approved = await forge.approve_package(
            "forge.test_upper", "1.0.0", "forge.test_upper@1.0.0", 7,
        )
        assert approved["status"] == "approved" and approved["approved_by"] == 7
        active = await forge.activate_package("forge.test_upper", "1.0.0")
        assert active["status"] == "active" and get_tool("forge.test_upper")
        result = await run_tool("forge.test_upper", {"text": "lyra"}, {"kind": "internal"})
        assert result["ok"] and result["text"] == "LYRA", result
        bad_input = await run_tool("forge.test_upper", {}, {"kind": "internal"})
        assert not bad_input["ok"] and "Faltan" in bad_input["error"]

        # Upgrade y rollback explícito a una versión aprobada previa.
        await forge.create_draft(manifest("2.0.0", "v2:"), CODE.format(prefix="v2:"))
        assert (await forge.test_package("forge.test_upper", "2.0.0"))["passed"]
        await forge.approve_package("forge.test_upper", "2.0.0", "forge.test_upper@2.0.0", 7)
        await forge.activate_package("forge.test_upper", "2.0.0")
        result = await run_tool("forge.test_upper", {"text": "ok"}, {"kind": "internal"})
        assert result["text"] == "v2:OK", result
        packages = forge.list_packages()
        v1 = next(p for p in packages if p["version"] == "1.0.0")
        assert v1["status"] == "approved"
        await forge.rollback_package("forge.test_upper", "1.0.0")
        result = await run_tool("forge.test_upper", {"text": "otra"}, {"kind": "internal"})
        assert result["text"] == "OTRA", result

        # Permisos sensibles elevan riesgo y exigen aprobación por ejecución.
        risky = manifest("3.0.0") | {
            "name": "forge.test_network",
            "permissions": ["network"],
        }
        risky["tests"] = [{"input": {"text": "x"}, "expect": {"ok": True, "text": "X"}}]
        created = await forge.create_draft(risky, CODE.format(prefix=""))
        assert created["risk"] == "high" and created["requires_approval"] is True
        assert (await forge.test_package("forge.test_network", "3.0.0"))["passed"]
        await forge.approve_package("forge.test_network", "3.0.0", "forge.test_network@3.0.0", 7)
        await forge.activate_package("forge.test_network", "3.0.0")
        blocked = await run_tool("forge.test_network", {"text": "x"}, {"kind": "internal"})
        assert blocked.get("approval_required"), blocked
        permitted_once = await run_tool(
            "forge.test_network", {"text": "x"}, {"kind": "internal"}, approved=True,
        )
        assert permitted_once["ok"] and permitted_once["text"] == "X", permitted_once

        # El manifest nunca puede desactivar el gate derivado de network.
        cannot_downgrade = manifest("4.0.0") | {
            "name": "forge.test_network_unsafe", "permissions": ["network"],
            "requires_approval": False,
        }
        cannot_downgrade["tests"] = risky["tests"]
        created = await forge.create_draft(cannot_downgrade, CODE.format(prefix=""))
        assert created["requires_approval"] is True

        # Una versión aprobada es evidencia y no se puede borrar.
        try:
            await forge.delete_package("forge.test_upper", "2.0.0")
            raise AssertionError("borró evidencia aprobada")
        except forge.ForgeError as exc:
            assert "evidencia" in str(exc)

        print("OK — Tool Forge: sandbox, tests, approval, activate, upgrade, rollback, risk gate")
    finally:
        shutil.rmtree(FORGE_TMP, ignore_errors=True)


asyncio.run(main())
