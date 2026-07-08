# ══════════════════════════════════════════════════════
#  PI PROCESO — subproceso `pi --mode rpc` persistente.
#  JSONL por stdin/stdout: comandos con id → future correlado,
#  eventos sin id → callback on_event. Restart lazy en ensure().
# ══════════════════════════════════════════════════════

import asyncio
import itertools
import json
import logging
import pathlib

from . import config

log = logging.getLogger('aurora.pi')


class PiProceso:
    def __init__(self, on_event=None, argv=None, cwd=None):
        self.on_event = on_event
        self.argv = argv or self._argv_default()
        self.cwd = cwd or config.CWD
        self.proc: asyncio.subprocess.Process | None = None
        self.generacion = 0
        self._futuros: dict[str, asyncio.Future] = {}
        self._ids = itertools.count(1)
        self._spawn_lock = asyncio.Lock()
        self._tareas: list[asyncio.Task] = []

    @staticmethod
    def _argv_default() -> list[str]:
        return [
            config.RUNTIME, config.PI_BIN,
            '--mode', 'rpc',
            '--session-dir', config.SESSION_DIR,
            *config.EXTRA_ARGS,
        ]

    @property
    def vivo(self) -> bool:
        return self.proc is not None and self.proc.returncode is None

    async def ensure(self):
        async with self._spawn_lock:
            if self.vivo:
                return
            await self._spawn()

    async def _spawn(self):
        pathlib.Path(config.SESSION_DIR).mkdir(parents=True, exist_ok=True)
        self.proc = await asyncio.create_subprocess_exec(
            *self.argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.cwd,
        )
        self.generacion += 1
        self._tareas = [
            asyncio.create_task(self._leer_stdout(self.proc)),
            asyncio.create_task(self._leer_stderr(self.proc)),
        ]
        log.info('pi rpc arrancado pid=%s gen=%d', self.proc.pid, self.generacion)

    async def _leer_stdout(self, proc):
        while True:
            try:
                # JSONL estricto: solo \n delimita registros (ver docs/rpc.md)
                linea = await proc.stdout.readline()
            except (ValueError, ConnectionResetError) as exc:
                log.warning('pi stdout: %s', exc)
                continue
            if not linea:
                break
            texto = linea.decode('utf-8', 'replace').strip()
            if not texto:
                continue
            try:
                msg = json.loads(texto)
            except ValueError:
                log.warning('pi stdout no-JSON: %.200s', texto)
                continue
            await self._despachar(msg)
        self._marcar_muerto()

    async def _leer_stderr(self, proc):
        while True:
            linea = await proc.stderr.readline()
            if not linea:
                break
            log.warning('pi stderr: %s', linea.decode('utf-8', 'replace').rstrip())

    def _marcar_muerto(self):
        rc = self.proc.returncode if self.proc else None
        log.warning('pi rpc terminó rc=%s', rc)
        for fut in self._futuros.values():
            if not fut.done():
                fut.set_exception(RuntimeError(f'pi terminó (rc={rc})'))
        self._futuros.clear()

    async def _despachar(self, msg: dict):
        if msg.get('type') == 'response' and msg.get('id') in self._futuros:
            fut = self._futuros.pop(msg['id'])
            if not fut.done():
                fut.set_result(msg)
            return
        if self.on_event:
            try:
                await self.on_event(msg)
            except Exception:
                log.exception('error manejando evento pi')

    async def enviar(self, cmd: dict):
        await self.ensure()
        data = json.dumps(cmd, ensure_ascii=False) + '\n'
        self.proc.stdin.write(data.encode('utf-8'))
        await self.proc.stdin.drain()

    async def pedir(self, cmd: dict, timeout: float | None = None) -> dict:
        cmd = dict(cmd)
        cid = f'aurora-{next(self._ids)}'
        cmd['id'] = cid
        fut = asyncio.get_running_loop().create_future()
        self._futuros[cid] = fut
        try:
            await self.enviar(cmd)
            return await asyncio.wait_for(fut, timeout or config.TIMEOUT_CMD)
        finally:
            self._futuros.pop(cid, None)

    async def parar(self):
        for t in self._tareas:
            t.cancel()
        self._tareas = []
        if self.vivo:
            self.proc.terminate()
            try:
                await asyncio.wait_for(self.proc.wait(), 5)
            except asyncio.TimeoutError:
                self.proc.kill()
                await self.proc.wait()
        self.proc = None
