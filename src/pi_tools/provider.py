"""Adaptador async Litestar/Python ↔ host persistente Node/Bun de tools pi."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import pathlib
import shutil
import uuid

from pi import config
from runtime_discovery import find_node

log = logging.getLogger("aurora.pi-tools")
HOST = pathlib.Path(__file__).with_name("pi-tool-host.mjs")
REQUEST_TIMEOUT = 15 * 60
# asyncio usa 64 KiB por defecto para readline(). Una imagen oficial de `read`
# viaja como un único JSONL base64 y supera ese límite con facilidad; el lector
# moría aunque el host Node siguiera vivo. Pi limita texto, no payload binario.
JSONL_STREAM_LIMIT = 64 * 1024 * 1024


class PiToolProvider:
    def __init__(self) -> None:
        self.process: asyncio.subprocess.Process | None = None
        self.pending: dict[str, asyncio.Future] = {}
        self.updates: dict[str, dict] = {}
        self.start_lock = asyncio.Lock()
        self.writer_lock = asyncio.Lock()
        self.reader_task: asyncio.Task | None = None
        self.stderr_task: asyncio.Task | None = None
        self.ready = asyncio.Event()
        self.generation = 0

    def _runtime(self) -> str:
        configured = str(config.RUNTIME or "")
        if configured and pathlib.Path(configured).exists():
            return configured
        runtime = find_node()
        if runtime:
            return runtime
        raise RuntimeError(
            "Node.js o Bun no encontrado. Instalalo desde https://nodejs.org "
            "o configurá [pi] runtime en config/llm.toml."
        )

    def _sdk_path(self) -> str:
        import subprocess
        # Variable de entorno: escape hatch explícito.
        configured = os.environ.get("AURORA_PI_SDK")
        if configured:
            return configured
        # Dejamos que el .mjs resuelva el SDK por su cuenta — le pasamos
        # una cadena vacía y él busca via npm root -g y require.resolve.
        # Pero si queremos pre-validar en Python, usamos npm del mismo runtime.
        try:
            node = self._runtime()
            node_dir = pathlib.Path(node).parent
            # npm está junto al node en todos los instaladores estándar.
            npm = node_dir / ("npm.cmd" if os.name == "nt" else "npm")
            if not npm.exists():
                npm_path = shutil.which("npm")
                if npm_path:
                    npm = pathlib.Path(npm_path)
            if npm.exists():
                root = subprocess.check_output(
                    [str(npm), "root", "-g"], timeout=5, text=True,
                    stderr=subprocess.DEVNULL,
                ).strip()
                sdk = pathlib.Path(root) / "@earendil-works" / "pi-coding-agent" / "dist" / "core" / "sdk.js"
                if sdk.exists():
                    return str(sdk)
        except Exception:
            pass
        # Vacío → el .mjs hace su propia búsqueda y emite un error claro.
        return ""

    async def ensure_started(self) -> None:
        if self.process and self.process.returncode is None and self.ready.is_set():
            return
        async with self.start_lock:
            if self.process and self.process.returncode is None and self.ready.is_set():
                return
            await self._stop_process()
            self.ready.clear()
            env = {
                **os.environ,
                "AURORA_PI_SDK": self._sdk_path(),
                "AURORA_PI_TOOL_CWD": str(config.CWD),
            }
            self.process = await asyncio.create_subprocess_exec(
                self._runtime(), str(HOST),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                limit=JSONL_STREAM_LIMIT,
            )
            self.generation += 1
            generation = self.generation
            self.reader_task = asyncio.create_task(self._read_stdout(generation), name="pi-tool-host:stdout")
            self.stderr_task = asyncio.create_task(self._read_stderr(generation), name="pi-tool-host:stderr")
            try:
                await asyncio.wait_for(self.ready.wait(), 10)
            except asyncio.TimeoutError as exc:
                await self._stop_process()
                raise RuntimeError("Pi Tool Host no anunció ready en 10s.") from exc

    async def _read_stdout(self, generation: int) -> None:
        assert self.process and self.process.stdout
        failure: Exception | None = None
        try:
            while generation == self.generation:
                raw = await self.process.stdout.readline()
                if not raw:
                    break
                try:
                    message = json.loads(raw)
                except Exception:
                    log.error("Pi Tool Host emitió stdout no JSON: %r", raw[:500])
                    continue
                if message.get("event") == "ready":
                    self.ready.set()
                    continue
                request_id = str(message.get("id") or "")
                if message.get("event") == "update":
                    self.updates[request_id] = message.get("result") or {}
                    continue
                future = self.pending.pop(request_id, None)
                if future and not future.done():
                    future.set_result(message)
        except Exception as exc:
            failure = exc
            log.exception("Falló el lector JSONL de Pi Tool Host: %s", exc)
        finally:
            if generation == self.generation:
                detail = f": {failure}" if failure else ""
                error = RuntimeError(f"Pi Tool Host terminó inesperadamente{detail}.")
                for future in self.pending.values():
                    if not future.done():
                        future.set_exception(error)
                self.pending.clear()
                self.ready.clear()

    async def _read_stderr(self, generation: int) -> None:
        assert self.process and self.process.stderr
        while generation == self.generation:
            raw = await self.process.stderr.readline()
            if not raw:
                return
            log.warning("[pi-tool-host] %s", raw.decode(errors="replace").rstrip())

    async def request(self, method: str, **payload) -> dict:
        await self.ensure_started()
        assert self.process and self.process.stdin
        request_id = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        message = {"id": request_id, "method": method, **payload}
        try:
            async with self.writer_lock:
                self.process.stdin.write((json.dumps(message, ensure_ascii=False) + "\n").encode())
                await self.process.stdin.drain()
            response = await asyncio.wait_for(future, REQUEST_TIMEOUT)
        finally:
            self.pending.pop(request_id, None)
            self.updates.pop(request_id, None)
        if not response.get("ok"):
            raise RuntimeError(response.get("error") or "Pi Tool Host falló.")
        return response.get("result") or {}

    async def _stop_process(self) -> None:
        process = self.process
        self.process = None
        self.generation += 1
        if not process or process.returncode is not None:
            return
        if process.stdin:
            process.stdin.close()
        try:
            await asyncio.wait_for(process.wait(), 3)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    async def shutdown(self) -> None:
        async with self.start_lock:
            await self._stop_process()

    def status(self) -> dict:
        return {
            "ready": bool(self.process and self.process.returncode is None and self.ready.is_set()),
            "pid": self.process.pid if self.process and self.process.returncode is None else None,
            "pending": len(self.pending),
            "generation": self.generation,
        }


_provider = PiToolProvider()


async def catalog() -> dict:
    return await _provider.request("catalog")


def _legacy_view(native: dict) -> dict:
    content = native.get("content") if isinstance(native, dict) else []
    content = content if isinstance(content, list) else []
    texts = [str(item.get("text") or "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
    images = [item for item in content if isinstance(item, dict) and item.get("type") == "image"]
    result = {
        "ok": True,
        "is_error": False,
        "output": "\n".join(filter(None, texts)) or ("[Imagen devuelta por read]" if images else "(sin salida)"),
        "content": content,
        "details": native.get("details") if isinstance(native, dict) else None,
        "provider": "pi",
    }
    if images:
        first = images[0]
        data = str(first.get("data") or "")
        mime = str(first.get("mimeType") or first.get("mime_type") or "image/png")
        if data:
            result.update({"is_image": True, "image": f"data:{mime};base64,{data}"})
    return result


async def execute(tool: str, args: dict, *, call_id: str | None = None) -> dict:
    try:
        native = await _provider.request("execute", tool=tool, args=args, callId=call_id)
        return _legacy_view(native)
    except Exception as exc:
        return {
            "ok": True,
            "is_error": True,
            "output": f"Error de {tool}: {exc}",
            "content": [{"type": "text", "text": f"Error de {tool}: {exc}"}],
            "details": {"error": str(exc)},
            "provider": "pi",
        }


def health() -> dict:
    return _provider.status()


async def shutdown() -> None:
    await _provider.shutdown()
