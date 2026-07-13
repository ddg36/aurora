"""Tool Forge: paquetes versionados, probados y aprobados para Lyra.

El código generado nunca se importa en el proceso de Aurora. Cada ejecución
ocurre en un subprocess aislado con Bubblewrap; recibe JSON por stdin y debe
devolver un único objeto JSON por stdout.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import re
import shutil
import tempfile
import time
from copy import deepcopy

from nexus.config import STATE_DIR, WORKSPACE

from .contract import ToolContract
from .registry import register


FORGE_ROOT = pathlib.Path(os.environ.get("AURORA_TOOL_FORGE_DIR", STATE_DIR / "tool-forge"))
NAME_RE = re.compile(r"^forge\.[a-z][a-z0-9_]{2,47}$")
VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$")
ALLOWED_PERMISSIONS = {"workspace:read", "workspace:write", "network"}
MAX_CODE = 120_000
MAX_OUTPUT = 1_000_000
_LOCK = asyncio.Lock()


class ForgeError(ValueError):
    pass


def _package_dir(name: str, version: str) -> pathlib.Path:
    if not NAME_RE.fullmatch(name or "") or not VERSION_RE.fullmatch(version or ""):
        raise ForgeError("Nombre o versión inválidos (use forge.nombre y semver X.Y.Z).")
    return FORGE_ROOT / name / version


def _read_json(path: pathlib.Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return deepcopy(default)


def _write_json(path: pathlib.Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    tmp = pathlib.Path(raw)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def _minimum_risk(permissions: list[str]) -> str:
    if "workspace:write" in permissions or "network" in permissions:
        return "high"
    if "workspace:read" in permissions:
        return "medium"
    return "low"


def validate_manifest(raw: dict) -> dict:
    manifest = deepcopy(raw or {})
    name = str(manifest.get("name") or "")
    version = str(manifest.get("version") or "")
    _package_dir(name, version)
    description = str(manifest.get("description") or "").strip()
    if len(description) < 12:
        raise ForgeError("description debe explicar la capacidad (mínimo 12 caracteres).")
    input_schema = manifest.get("input_schema")
    if not isinstance(input_schema, dict) or input_schema.get("type") != "object" or not isinstance(input_schema.get("properties", {}), dict):
        raise ForgeError("input_schema debe ser un JSON Schema de tipo object.")
    tests = manifest.get("tests")
    if not isinstance(tests, list) or not tests:
        raise ForgeError("Se requiere al menos un caso en tests.")
    normalized_tests = []
    for index, case in enumerate(tests):
        if not isinstance(case, dict):
            raise ForgeError(f"tests[{index}] debe ser un objeto.")
        normalized = deepcopy(case)
        # Las tools de Aurora llaman `args` a su entrada. Aceptarlo evita que
        # un LLM genere un paquete válido en todo salvo por vocabulario; el
        # formato persistido sigue teniendo una sola representación canónica.
        if "input" not in normalized and "args" in normalized:
            normalized["input"] = normalized.pop("args")
        if not isinstance(normalized.get("input", {}), dict):
            raise ForgeError(f"tests[{index}].input debe ser un objeto.")
        normalized_tests.append(normalized)
    permissions = sorted(set(manifest.get("permissions") or []))
    unknown = set(permissions) - ALLOWED_PERMISSIONS
    if unknown:
        raise ForgeError(f"Permisos desconocidos: {', '.join(sorted(unknown))}")
    timeout = max(1, min(int(manifest.get("timeout") or 15), 120))
    declared_risk = str(manifest.get("risk") or "low")
    order = {"low": 0, "medium": 1, "high": 2}
    if declared_risk not in order:
        raise ForgeError("risk debe ser low, medium o high.")
    minimum = _minimum_risk(permissions)
    risk = max((declared_risk, minimum), key=order.get)
    return {
        "name": name,
        "version": version,
        "description": description,
        "input_schema": input_schema,
        "output_schema": manifest.get("output_schema"),
        "permissions": permissions,
        "risk": risk,
        # Un paquete no puede rebajar por manifest la protección derivada de
        # permisos sensibles. Para riesgo alto la aprobación por ejecución es
        # obligatoria, aunque el autor escriba requires_approval: false.
        "requires_approval": risk == "high" or bool(manifest.get("requires_approval", False)),
        "timeout": timeout,
        "tags": sorted(set(["forge", *(manifest.get("tags") or [])])),
        "tests": normalized_tests,
        "docs": str(manifest.get("docs") or "").strip(),
        "entrypoint": "handler.py",
        "protocol": "json-stdin-stdout/v1",
    }


def _state(pkg: pathlib.Path) -> dict:
    return _read_json(pkg / "forge-state.json", {
        "status": "draft", "created_at": int(time.time()), "test_report": None,
        "approved_at": None, "approved_by": None, "activated_at": None,
    })


def _public(pkg: pathlib.Path) -> dict:
    manifest = _read_json(pkg / "manifest.json", {})
    state = _state(pkg)
    return {**manifest, **state, "path": str(pkg)}


def list_packages() -> list[dict]:
    result = []
    if not FORGE_ROOT.exists():
        return result
    for manifest_path in FORGE_ROOT.glob("*/*/manifest.json"):
        try:
            result.append(_public(manifest_path.parent))
        except Exception:
            continue
    return sorted(result, key=lambda x: (x.get("name", ""), x.get("version", "")), reverse=True)


async def create_draft(manifest_raw: dict, code: str) -> dict:
    manifest = validate_manifest(manifest_raw)
    if not isinstance(code, str) or not code.strip() or len(code.encode()) > MAX_CODE:
        raise ForgeError(f"handler.py vacío o mayor a {MAX_CODE} bytes.")
    pkg = _package_dir(manifest["name"], manifest["version"])
    async with _LOCK:
        if pkg.exists():
            raise ForgeError("La versión ya existe; las versiones de Forge son inmutables.")
        pkg.mkdir(parents=True)
        (pkg / "handler.py").write_text(code, encoding="utf-8")
        _write_json(pkg / "manifest.json", manifest)
        _write_json(pkg / "forge-state.json", _state(pkg))
    return _public(pkg)


def _validate_input(schema: dict, arguments: dict) -> None:
    if not isinstance(arguments, dict):
        raise ForgeError("arguments debe ser un objeto JSON.")
    required = schema.get("required") or []
    missing = [key for key in required if key not in arguments]
    if missing:
        raise ForgeError(f"Faltan argumentos: {', '.join(missing)}")
    types = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "object": dict, "array": list}
    for key, value in arguments.items():
        expected = (schema.get("properties") or {}).get(key, {}).get("type")
        pytype = types.get(expected)
        if pytype and (not isinstance(value, pytype) or expected in {"integer", "number"} and isinstance(value, bool)):
            raise ForgeError(f"Argumento {key} debe ser {expected}.")


def _sandbox_command(pkg: pathlib.Path, manifest: dict) -> tuple[list[str], dict]:
    bwrap = shutil.which("bwrap")
    if not bwrap:
        raise ForgeError("Bubblewrap no está disponible; Tool Forge rechaza ejecución sin sandbox.")
    cmd = [bwrap, "--die-with-parent", "--new-session", "--unshare-pid", "--unshare-ipc", "--unshare-uts"]
    if "network" not in manifest["permissions"]:
        cmd.append("--unshare-net")
    for system_dir in ("/usr", "/lib", "/lib64", "/bin"):
        if pathlib.Path(system_dir).exists():
            cmd += ["--ro-bind", system_dir, system_dir]
    cmd += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--ro-bind", str(pkg), "/tool"]
    if "workspace:write" in manifest["permissions"]:
        cmd += ["--bind", str(WORKSPACE), "/workspace"]
    elif "workspace:read" in manifest["permissions"]:
        cmd += ["--ro-bind", str(WORKSPACE), "/workspace"]
    cmd += ["--chdir", "/tool", "/usr/bin/python3", "-I", "/tool/handler.py"]
    env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "AURORA_FORGE": "1"}
    if "workspace:read" in manifest["permissions"] or "workspace:write" in manifest["permissions"]:
        env["AURORA_WORKSPACE"] = "/workspace"
    return cmd, env


async def run_package(pkg: pathlib.Path, arguments: dict) -> dict:
    manifest = _read_json(pkg / "manifest.json", {})
    _validate_input(manifest["input_schema"], arguments)
    cmd, env = _sandbox_command(pkg, manifest)
    started = time.monotonic()
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, env=env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(json.dumps(arguments, ensure_ascii=False).encode()),
            timeout=manifest["timeout"],
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"ok": False, "error": f"Timeout de {manifest['timeout']}s", "reason": "timeout"}
    if len(stdout) > MAX_OUTPUT or len(stderr) > MAX_OUTPUT:
        return {"ok": False, "error": "La salida excedió el límite de 1 MB.", "reason": "output_limit"}
    err = stderr.decode("utf-8", errors="replace").strip()
    raw = stdout.decode("utf-8", errors="replace").strip()
    if proc.returncode != 0:
        return {"ok": False, "error": err or f"handler terminó con exit {proc.returncode}", "exit_code": proc.returncode}
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"Salida no es un único JSON válido: {exc}", "stderr": err[:2000]}
    if not isinstance(result, dict):
        return {"ok": False, "error": "El handler debe devolver un objeto JSON."}
    result.setdefault("ok", True)
    result["forge"] = {"name": manifest["name"], "version": manifest["version"], "duration_ms": round((time.monotonic() - started) * 1000)}
    return result


def _partial_match(actual, expected) -> bool:
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and _partial_match(actual[k], v) for k, v in expected.items())
    if isinstance(expected, list):
        return actual == expected
    return actual == expected


async def test_package(name: str, version: str) -> dict:
    pkg = _package_dir(name, version)
    manifest = _read_json(pkg / "manifest.json")
    if not manifest:
        raise ForgeError("Paquete no encontrado.")
    cases = []
    for index, case in enumerate(manifest["tests"]):
        result = await run_package(pkg, case.get("input", {}))
        expected = case.get("expect", {"ok": True})
        passed = _partial_match(result, expected)
        if case.get("text_contains") is not None:
            passed = passed and str(case["text_contains"]) in str(result.get("text", ""))
        cases.append({"name": case.get("name") or f"case-{index + 1}", "passed": passed, "expected": expected, "result": result})
    report = {"passed": all(c["passed"] for c in cases), "total": len(cases), "cases": cases, "tested_at": int(time.time())}
    async with _LOCK:
        state = _state(pkg)
        state.update({"status": "tested" if report["passed"] else "test_failed", "test_report": report})
        _write_json(pkg / "forge-state.json", state)
    return report


async def approve_package(name: str, version: str, confirmation: str, approved_by) -> dict:
    pkg = _package_dir(name, version)
    async with _LOCK:
        state = _state(pkg)
        if not (state.get("test_report") or {}).get("passed"):
            raise ForgeError("La versión debe superar todos sus tests antes de aprobarse.")
        if confirmation != f"{name}@{version}":
            raise ForgeError(f"Confirmación inválida; escriba exactamente {name}@{version}.")
        state.update({"status": "approved", "approved_at": int(time.time()), "approved_by": approved_by})
        _write_json(pkg / "forge-state.json", state)
    return _public(pkg)


def _make_contract(pkg: pathlib.Path) -> ToolContract:
    manifest = _read_json(pkg / "manifest.json", {})

    async def handler(arguments: dict, caller: dict) -> dict:
        return await run_package(pkg, arguments)

    return ToolContract(
        name=manifest["name"], description=manifest["description"], input_schema=manifest["input_schema"],
        output_schema=manifest.get("output_schema"), handler=handler, risk=manifest["risk"],
        scopes=manifest["permissions"], requires_approval=manifest["requires_approval"],
        tags=manifest["tags"], timeout=manifest["timeout"],
    )


async def activate_package(name: str, version: str) -> dict:
    pkg = _package_dir(name, version)
    async with _LOCK:
        state = _state(pkg)
        if state.get("status") not in {"approved", "active"}:
            raise ForgeError("Sólo una versión aprobada puede activarse.")
        for other in (FORGE_ROOT / name).glob("*/forge-state.json"):
            other_state = _read_json(other, {})
            if other_state.get("status") == "active" and other.parent != pkg:
                other_state["status"] = "approved"
                _write_json(other, other_state)
        state.update({"status": "active", "activated_at": int(time.time())})
        _write_json(pkg / "forge-state.json", state)
        register(_make_contract(pkg))
    return _public(pkg)


async def rollback_package(name: str, version: str) -> dict:
    # Rollback explícito: la versión destino también tuvo tests y aprobación.
    return await activate_package(name, version)


async def delete_package(name: str, version: str) -> dict:
    pkg = _package_dir(name, version)
    async with _LOCK:
        state = _state(pkg)
        if state.get("status") in {"approved", "active"}:
            raise ForgeError("Una versión aprobada/activa es evidencia inmutable y no puede borrarse.")
        if not pkg.exists():
            raise ForgeError("Paquete no encontrado.")
        shutil.rmtree(pkg)
        try:
            pkg.parent.rmdir()
        except OSError:
            pass
    return {"ok": True, "deleted": f"{name}@{version}"}


def load_active_tools() -> None:
    for package in list_packages():
        if package.get("status") == "active":
            try:
                register(_make_contract(_package_dir(package["name"], package["version"])))
            except Exception:
                continue


load_active_tools()
